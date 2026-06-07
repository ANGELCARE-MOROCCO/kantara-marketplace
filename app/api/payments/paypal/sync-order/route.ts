import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { getCurrentUser, isAdminRole } from "@/app/lib/auth";
import prisma from "@/app/lib/db";
import { writeAdminAuditEvent } from "@/app/lib/audit";
import {
  extractPayPalAuthorizationId,
  extractPayPalCaptureId,
  getPayPalOrder,
  normalizePayPalError,
} from "@/app/lib/paypal";

function revalidatePaymentSurfaces(reservationId?: string | null) {
  revalidatePath("/admin/payments");
  revalidatePath("/admin/bookings");
  revalidatePath("/reservations");
  if (reservationId) revalidatePath(`/checkout/${reservationId}`);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !isAdminRole(user.role)) {
    return NextResponse.json({ ok: false, error: "Admin access required." }, { status: 401 });
  }

  let body: { paymentRecordId?: string; orderId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid sync request payload." }, { status: 400 });
  }

  const payment = body.paymentRecordId
    ? await prisma.paymentRecord.findUnique({ where: { id: body.paymentRecordId } })
    : await prisma.paymentRecord.findFirst({ where: { providerOrderId: body.orderId } });
  if (!payment?.providerOrderId) {
    return NextResponse.json({ ok: false, error: "Payment record with PayPal order id is required." }, { status: 400 });
  }

  try {
    const order = await getPayPalOrder(payment.providerOrderId);
    const captureId = extractPayPalCaptureId(order);
    const authorizationId = extractPayPalAuthorizationId(order);
    const status = captureId ? "captured" : authorizationId ? "authorized" : payment.status;

    await prisma.$transaction(async (tx) => {
      await tx.paymentRecord.update({
        where: { id: payment.id },
        data: {
          status,
          providerStatus: order.status ?? null,
          providerCaptureId: captureId ?? payment.providerCaptureId,
          providerAuthorizationId: authorizationId ?? payment.providerAuthorizationId,
          capturedAt: captureId ? new Date() : payment.capturedAt,
          authorizedAt: authorizationId ? new Date() : payment.authorizedAt,
          updatedById: user.id,
        },
      });
      await tx.paymentEvent.create({
        data: {
          paymentRecordId: payment.id,
          type: "paypal_order_resynced",
          summary: "PayPal order status synced through API route.",
          payload: { providerOrderId: payment.providerOrderId, providerStatus: order.status, captureId, authorizationId },
          createdById: user.id,
        },
      });
      await writeAdminAuditEvent({
        tx,
        actorId: user.id,
        module: "payments",
        action: "api_sync_paypal_order",
        targetType: "PaymentRecord",
        targetId: payment.id,
        summary: "Admin API synced a PayPal order.",
        metadata: { providerOrderId: payment.providerOrderId, captureId, authorizationId },
      });
    });

    revalidatePaymentSurfaces(payment.reservationId);
    return NextResponse.json({ ok: true, paymentRecordId: payment.id, captureId, authorizationId, status: order.status });
  } catch (error) {
    const normalized = normalizePayPalError(error);
    return NextResponse.json({ ok: false, error: normalized.message, paymentRecordId: payment.id }, { status: 502 });
  }
}
