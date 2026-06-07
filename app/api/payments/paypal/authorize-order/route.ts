import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { getCurrentUser, isAdminRole } from "@/app/lib/auth";
import prisma from "@/app/lib/db";
import { writeAdminAuditEvent } from "@/app/lib/audit";
import {
  authorizePayPalOrder,
  extractPayPalAuthorizationId,
  normalizePayPalError,
} from "@/app/lib/paypal";

function revalidatePaymentSurfaces(reservationId?: string | null) {
  revalidatePath("/admin/payments");
  revalidatePath("/admin/bookings");
  revalidatePath("/reservations");
  if (reservationId) revalidatePath(`/checkout/${reservationId}`);
}

async function canOperatePayment(payment: {
  reservationId: string | null;
  guestId: string | null;
}, user: { id: string; role: string }) {
  if (isAdminRole(user.role)) return true;
  if (payment.guestId === user.id) return true;
  if (!payment.reservationId) return false;
  const reservation = await prisma.reservation.findUnique({
    where: { id: payment.reservationId },
    select: { userId: true },
  });
  return reservation?.userId === user.id;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Sign in is required before authorizing a PayPal order." }, { status: 401 });
  }

  let body: { paymentRecordId?: string; orderId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid authorize request payload." }, { status: 400 });
  }

  const payment = body.paymentRecordId
    ? await prisma.paymentRecord.findUnique({ where: { id: body.paymentRecordId } })
    : await prisma.paymentRecord.findFirst({ where: { providerOrderId: body.orderId } });
  if (!payment?.providerOrderId) {
    return NextResponse.json({ ok: false, error: "Payment record with PayPal order id is required." }, { status: 400 });
  }
  if (!(await canOperatePayment(payment, user))) {
    return NextResponse.json({ ok: false, error: "You cannot authorize this payment record." }, { status: 403 });
  }

  try {
    const order = await authorizePayPalOrder(payment.providerOrderId);
    const authorizationId = extractPayPalAuthorizationId(order);
    await prisma.$transaction(async (tx) => {
      await tx.paymentRecord.update({
        where: { id: payment.id },
        data: {
          status: authorizationId ? "authorized" : "pending_approval",
          providerStatus: order.status ?? null,
          providerAuthorizationId: authorizationId,
          authorizedAt: authorizationId ? new Date() : payment.authorizedAt,
          updatedById: user.id,
        },
      });
      await tx.paymentEvent.create({
        data: {
          paymentRecordId: payment.id,
          type: "paypal_order_authorized",
          summary: authorizationId ? "PayPal order authorized." : "PayPal authorize returned without authorization id.",
          payload: { providerOrderId: payment.providerOrderId, authorizationId, providerStatus: order.status },
          createdById: user.id,
        },
      });
      await writeAdminAuditEvent({
        tx,
        actorId: user.id,
        module: "payments",
        action: isAdminRole(user.role) ? "api_authorize_paypal_order" : "guest_checkout_authorize_paypal_order",
        targetType: "PaymentRecord",
        targetId: payment.id,
        summary: "API authorized a PayPal order.",
        metadata: { providerOrderId: payment.providerOrderId, authorizationId },
      });
    });

    revalidatePaymentSurfaces(payment.reservationId);
    return NextResponse.json({ ok: true, paymentRecordId: payment.id, authorizationId, status: order.status });
  } catch (error) {
    const normalized = normalizePayPalError(error);
    return NextResponse.json({ ok: false, error: normalized.message, paymentRecordId: payment.id }, { status: 502 });
  }
}
