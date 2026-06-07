import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { getCurrentUser, isAdminRole } from "@/app/lib/auth";
import prisma from "@/app/lib/db";
import { writeAdminAuditEvent } from "@/app/lib/audit";
import {
  findReusableCheckoutPayment,
  getReservationPaymentSnapshot,
  isPaymentMethod,
  parsePaymentAmount,
} from "@/app/lib/paymentOperations";
import {
  createPayPalOrder,
  extractPayPalApprovalUrl,
  getPayPalProviderReadiness,
  normalizePayPalError,
  type PayPalOrderIntent,
} from "@/app/lib/paypal";
import { normalizeCurrency } from "@/app/lib/globalization";

function safeJson(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function revalidatePaymentSurfaces(reservationId?: string | null) {
  revalidatePath("/admin/payments");
  revalidatePath("/admin/bookings");
  revalidatePath("/reservations");
  if (reservationId) revalidatePath(`/checkout/${reservationId}`);
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return safeJson(401, { ok: false, error: "Sign in is required before creating a PayPal order." });
  }

  let body: {
    reservationId?: string;
    paymentRecordId?: string;
    amount?: string | number;
    currency?: string;
    method?: string;
    intent?: string;
    source?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return safeJson(400, { ok: false, error: "Invalid payment request payload." });
  }

  const isAdmin = isAdminRole(user.role);
  const readiness = getPayPalProviderReadiness();
  if (!readiness.isConfigured) {
    return safeJson(400, {
      ok: false,
      error: "PayPal is not configured. PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are required.",
      provider: {
        environment: readiness.displayEnvironment,
        clientId: readiness.hasClientId ? "configured" : "missing",
        secret: readiness.hasSecret ? "configured" : "missing",
      },
    });
  }

  const intent: PayPalOrderIntent = body.intent === "AUTHORIZE" ? "AUTHORIZE" : "CAPTURE";
  const method = isPaymentMethod(body.method) ? body.method : "paypal_card";
  const source = body.source === "guest_checkout" ? "guest_checkout" : isAdmin ? "admin_api" : "guest_checkout";

  const existingPayment = body.paymentRecordId
    ? await prisma.paymentRecord.findUnique({ where: { id: body.paymentRecordId } })
    : null;
  const reservationId = body.reservationId ?? existingPayment?.reservationId ?? null;

  if (!reservationId && !isAdmin) {
    return safeJson(403, { ok: false, error: "Guest checkout requires a linked reservation." });
  }

  const snapshot = reservationId ? await getReservationPaymentSnapshot(reservationId) : null;
  if (reservationId && !snapshot) {
    return safeJson(404, { ok: false, error: "Reservation not found." });
  }
  if (snapshot && !isAdmin && snapshot.reservation.userId !== user.id) {
    return safeJson(403, { ok: false, error: "You can only pay for your own reservation." });
  }
  if (snapshot && ["cancelled", "completed"].includes(snapshot.reservation.bookingStatus)) {
    return safeJson(409, { ok: false, error: `Reservation is ${snapshot.reservation.bookingStatus}; checkout is not available.` });
  }

  const capturedPayment = reservationId
    ? await prisma.paymentRecord.findFirst({
        where: { reservationId, status: "captured" },
        orderBy: { updatedAt: "desc" },
      })
    : null;
  if (capturedPayment) {
    return safeJson(409, {
      ok: false,
      error: "Reservation already has a captured payment.",
      paymentRecordId: capturedPayment.id,
      status: capturedPayment.status,
    });
  }

  const reusablePayment = reservationId ? await findReusableCheckoutPayment(reservationId) : existingPayment;
  if (reusablePayment?.providerOrderId && ["draft", "order_created", "pending_approval", "authorized"].includes(reusablePayment.status)) {
    return NextResponse.json({
      ok: true,
      reused: true,
      paymentRecordId: reusablePayment.id,
      providerOrderId: reusablePayment.providerOrderId,
      status: reusablePayment.providerStatus ?? reusablePayment.status,
    });
  }
  if (reusablePayment?.status === "requires_review") {
    return safeJson(409, {
      ok: false,
      error: "This payment requires review before another PayPal order can be created.",
      paymentRecordId: reusablePayment.id,
    });
  }

  const amount = snapshot?.amount?.toFixed(2) ?? parsePaymentAmount(body.amount ?? null);
  const currency = normalizeCurrency(snapshot?.currency ?? body.currency, "USD");
  if (!amount) {
    return safeJson(400, { ok: false, error: "A positive payment amount is required." });
  }

  try {
    const order = await createPayPalOrder({
      amount,
      currency,
      referenceId: reservationId ?? `manual-${Date.now()}`,
      description: reservationId
        ? `Kantara reservation ${reservationId}`
        : "Kantara manual operational payment",
      intent,
    });
    const approvalUrl = extractPayPalApprovalUrl(order);

    const record = await prisma.$transaction(async (tx) => {
      const payment = reusablePayment
        ? await tx.paymentRecord.update({
            where: { id: reusablePayment.id },
            data: {
              amount,
              currency,
              provider: "paypal",
              providerEnvironment: readiness.environment,
              providerOrderId: order.id ?? null,
              providerStatus: order.status ?? null,
              status: "order_created",
              method,
              snapshotJson: {
                ...jsonObject(snapshot?.snapshotJson ?? reusablePayment.snapshotJson),
                source,
                checkoutSource: source,
                paypalIntent: intent,
                approvalUrl,
              } as Prisma.InputJsonValue,
              updatedById: user.id,
            },
          })
        : await tx.paymentRecord.create({
            data: {
              reservationId,
              guestId: snapshot?.guestId ?? (isAdmin ? null : user.id),
              propertyId: snapshot?.propertyId ?? null,
              partnerId: snapshot?.partnerId ?? null,
              amount,
              currency,
              provider: "paypal",
              providerEnvironment: readiness.environment,
              providerOrderId: order.id ?? null,
              providerStatus: order.status ?? null,
              status: "order_created",
              method,
              snapshotJson: {
                ...jsonObject(snapshot?.snapshotJson),
                source,
                checkoutSource: source,
                paypalIntent: intent,
                approvalUrl,
              } as Prisma.InputJsonValue,
              createdById: user.id,
              updatedById: user.id,
            },
          });
      await tx.paymentEvent.create({
        data: {
          paymentRecordId: payment.id,
          type: "paypal_order_created",
          summary: source === "guest_checkout" ? "PayPal order created from guest checkout." : "PayPal order created through API route.",
          payload: { providerOrderId: order.id, approvalUrl, providerStatus: order.status, source },
          createdById: user.id,
        },
      });
      await writeAdminAuditEvent({
        tx,
        actorId: user.id,
        module: "payments",
        action: source === "guest_checkout" ? "guest_checkout_create_paypal_order" : "api_create_paypal_order",
        targetType: "PaymentRecord",
        targetId: payment.id,
        summary: source === "guest_checkout" ? "Guest checkout created a PayPal order." : "API created a PayPal order.",
        metadata: { providerOrderId: order.id, intent, reservationId, source },
      });
      return payment;
    });

    revalidatePaymentSurfaces(reservationId);
    return NextResponse.json({
      ok: true,
      paymentRecordId: record.id,
      providerOrderId: order.id,
      approvalUrl,
      status: order.status,
    });
  } catch (error) {
    const normalized = normalizePayPalError(error);
    return safeJson(502, { ok: false, error: normalized.message });
  }
}
