import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";

import prisma from "@/app/lib/db";
import {
  extractPayPalAuthorizationId,
  extractPayPalCaptureId,
  verifyPayPalWebhookSignature,
  type PayPalOrderResponse,
} from "@/app/lib/paypal";

type PayPalWebhookEvent = {
  id?: string;
  event_type?: string;
  resource?: PayPalOrderResponse & {
    id?: string;
    status?: string;
    supplementary_data?: {
      related_ids?: {
        order_id?: string;
      };
    };
  };
};

export async function POST(request: Request) {
  if (!process.env.PAYPAL_WEBHOOK_ID?.trim()) {
    return NextResponse.json({
      ok: true,
      status: "webhook_disabled",
      message: "PAYPAL_WEBHOOK_ID is not configured; no webhook mutation was attempted.",
    });
  }

  const event = (await request.json()) as PayPalWebhookEvent;
  const headers = new Headers(request.headers);
  const verification = await verifyPayPalWebhookSignature({
    transmissionId: headers.get("paypal-transmission-id") ?? "",
    transmissionTime: headers.get("paypal-transmission-time") ?? "",
    transmissionSignature: headers.get("paypal-transmission-sig") ?? "",
    certificateUrl: headers.get("paypal-cert-url") ?? "",
    authAlgorithm: headers.get("paypal-auth-algo") ?? "",
    webhookEvent: event,
  });
  if (!verification.verified) {
    return NextResponse.json({ ok: false, status: verification.status }, { status: 400 });
  }

  const orderId =
    event.resource?.supplementary_data?.related_ids?.order_id ??
    event.resource?.id ??
    null;
  const captureId = event.event_type?.includes("CAPTURE")
    ? event.resource?.id ?? extractPayPalCaptureId(event.resource ?? {})
    : extractPayPalCaptureId(event.resource ?? {});
  const authorizationId = event.event_type?.includes("AUTHORIZATION")
    ? event.resource?.id ?? extractPayPalAuthorizationId(event.resource ?? {})
    : extractPayPalAuthorizationId(event.resource ?? {});

  if (!orderId && !captureId && !authorizationId) {
    return NextResponse.json({ ok: true, status: "unmatched", providerEventId: event.id });
  }

  const payment = await prisma.paymentRecord.findFirst({
    where: {
      OR: [
        ...(orderId ? [{ providerOrderId: orderId }] : []),
        ...(captureId ? [{ providerCaptureId: captureId }] : []),
        ...(authorizationId ? [{ providerAuthorizationId: authorizationId }] : []),
      ],
    },
  });
  if (!payment) {
    return NextResponse.json({ ok: true, status: "unmatched", providerEventId: event.id });
  }

  const nextStatus = captureId
    ? "captured"
    : authorizationId
      ? "authorized"
      : payment.status;

  await prisma.$transaction(async (tx) => {
    await tx.paymentRecord.update({
      where: { id: payment.id },
      data: {
        status: nextStatus,
        providerStatus: event.resource?.status ?? payment.providerStatus,
        providerCaptureId: captureId ?? payment.providerCaptureId,
        providerAuthorizationId: authorizationId ?? payment.providerAuthorizationId,
        capturedAt: captureId ? new Date() : payment.capturedAt,
        authorizedAt: authorizationId ? new Date() : payment.authorizedAt,
      },
    });
    await tx.paymentEvent.create({
      data: {
        paymentRecordId: payment.id,
        type: event.event_type ?? "paypal_webhook",
        providerEventId: event.id ?? null,
        summary: `PayPal webhook ${event.event_type ?? "event"} processed.`,
        payload: event as Prisma.InputJsonValue,
      },
    });
  });

  revalidatePath("/admin/payments");
  revalidatePath("/admin/bookings");
  revalidatePath("/reservations");
  if (payment.reservationId) revalidatePath(`/checkout/${payment.reservationId}`);

  return NextResponse.json({ ok: true, status: "processed", paymentRecordId: payment.id });
}
