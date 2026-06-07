import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { getCurrentUser, isAdminRole } from "@/app/lib/auth";
import prisma from "@/app/lib/db";
import { writeAdminAuditEvent } from "@/app/lib/audit";
import {
  capturePayPalOrder,
  extractPayPalCaptureId,
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
    return NextResponse.json({ ok: false, error: "Sign in is required before capturing a PayPal order." }, { status: 401 });
  }

  let body: { paymentRecordId?: string; orderId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid capture request payload." }, { status: 400 });
  }

  const payment = body.paymentRecordId
    ? await prisma.paymentRecord.findUnique({ where: { id: body.paymentRecordId } })
    : await prisma.paymentRecord.findFirst({ where: { providerOrderId: body.orderId } });
  if (!payment?.providerOrderId) {
    return NextResponse.json({ ok: false, error: "Payment record with PayPal order id is required." }, { status: 400 });
  }
  if (!(await canOperatePayment(payment, user))) {
    return NextResponse.json({ ok: false, error: "You cannot capture this payment record." }, { status: 403 });
  }
  if (payment.providerCaptureId || payment.status === "captured") {
    return NextResponse.json({
      ok: true,
      paymentRecordId: payment.id,
      captureId: payment.providerCaptureId,
      status: payment.providerStatus ?? payment.status,
      message: "Payment is already captured.",
    });
  }

  try {
    const order = await capturePayPalOrder(payment.providerOrderId);
    const captureId = extractPayPalCaptureId(order);
    const nextStatus = captureId || order.status === "COMPLETED" ? "captured" : "pending_approval";

    await prisma.$transaction(async (tx) => {
      await tx.paymentRecord.update({
        where: { id: payment.id },
        data: {
          status: nextStatus,
          providerStatus: order.status ?? null,
          providerCaptureId: captureId,
          capturedAt: nextStatus === "captured" ? new Date() : payment.capturedAt,
          updatedById: user.id,
        },
      });
      await tx.paymentEvent.create({
        data: {
          paymentRecordId: payment.id,
          type: "paypal_order_captured",
          summary: captureId ? "PayPal order captured." : "PayPal capture returned without capture id.",
          payload: { providerOrderId: payment.providerOrderId, captureId, providerStatus: order.status },
          createdById: user.id,
        },
      });
      await writeAdminAuditEvent({
        tx,
        actorId: user.id,
        module: "payments",
        action: isAdminRole(user.role) ? "api_capture_paypal_order" : "guest_checkout_capture_paypal_order",
        targetType: "PaymentRecord",
        targetId: payment.id,
        summary: isAdminRole(user.role) ? "Admin/API captured a PayPal order." : "Guest checkout captured a PayPal order.",
        metadata: { providerOrderId: payment.providerOrderId, captureId },
      });
    });

    revalidatePaymentSurfaces(payment.reservationId);
    return NextResponse.json({ ok: true, paymentRecordId: payment.id, captureId, status: order.status });
  } catch (error) {
    const normalized = normalizePayPalError(error);
    await prisma.$transaction(async (tx) => {
      await tx.paymentRecord.update({
        where: { id: payment.id },
        data: { status: "requires_review", failureReason: normalized.message, updatedById: user.id },
      });
      await tx.paymentEvent.create({
        data: {
          paymentRecordId: payment.id,
          type: "paypal_capture_failed",
          summary: "PayPal capture failed; payment requires review.",
          payload: { providerOrderId: payment.providerOrderId, error: normalized.message },
          createdById: user.id,
        },
      });
    });
    revalidatePaymentSurfaces(payment.reservationId);
    return NextResponse.json({ ok: false, error: normalized.message, paymentRecordId: payment.id }, { status: 502 });
  }
}
