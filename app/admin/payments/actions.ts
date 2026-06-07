"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { requireAdmin } from "@/app/lib/auth";
import prisma from "@/app/lib/db";
import { writeAdminAuditEvent } from "@/app/lib/audit";
import {
  getReservationPaymentSnapshot,
  isPaymentMethod,
  parsePaymentAmount,
} from "@/app/lib/paymentOperations";
import {
  authorizePayPalOrder,
  capturePayPalOrder,
  createPayPalOrder,
  extractPayPalApprovalUrl,
  extractPayPalAuthorizationId,
  extractPayPalCaptureId,
  getPayPalOrder,
  getPayPalProviderReadiness,
  normalizePayPalError,
  type PayPalOrderIntent,
} from "@/app/lib/paypal";
import { isCurrencyCode, normalizeCurrency } from "@/app/lib/globalization";
import { createDisputeCaseNumber } from "@/app/lib/disputeOperations";

function readString(formData: FormData, key: string, maxLength = 2000) {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function readReturnTo(formData: FormData) {
  const returnTo = readString(formData, "returnTo", 1000);
  return returnTo?.startsWith("/admin/payments") ? returnTo : null;
}

function paymentRedirect(params: Record<string, string | null | undefined> = {}): never {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  redirect(`/admin/payments${search.toString() ? `?${search.toString()}` : ""}`);
}

function paymentReturnRedirect(formData: FormData, params: Record<string, string | null | undefined> = {}): never {
  const returnTo = readReturnTo(formData);
  if (!returnTo) paymentRedirect(params);

  const url = new URL(returnTo, "http://localhost");
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  });
  redirect(`${url.pathname}${url.search}`);
}

function revalidatePayments() {
  revalidatePath("/admin");
  revalidatePath("/admin/marketplace-operations");
  revalidatePath("/admin/payments");
  revalidatePath("/admin/bookings");
  revalidatePath("/admin/settings");
  revalidatePath("/reservations");
}

function safeError(error: unknown) {
  return normalizePayPalError(error).message || "Payment operation failed.";
}

function isCancelledReservation(status?: string | null, cancelledAt?: Date | string | null) {
  return Boolean(cancelledAt) || ["cancelled", "canceled"].includes((status ?? "").toLowerCase());
}

function offlineSettlementMethod(formData: FormData) {
  const methodRaw = readString(formData, "method", 40);
  return isPaymentMethod(methodRaw) && !methodRaw.startsWith("paypal")
    ? methodRaw
    : "manual";
}

function readUpperCurrency(formData: FormData, fallback?: string | null) {
  return (readString(formData, "currency", 8) ?? fallback ?? "").toUpperCase();
}

async function assertNoCapturedReservationPayment(reservationId: string) {
  return prisma.paymentRecord.findFirst({
    where: { reservationId, status: "captured" },
    select: { id: true },
  });
}

export async function createPayPalOrderAction(formData: FormData) {
  const admin = await requireAdmin();
  const provider = getPayPalProviderReadiness();
  if (!provider.isConfigured) {
    paymentReturnRedirect(formData, { error: "PayPal is not configured" });
  }

  const reservationId = readString(formData, "reservationId", 80);
  if (!reservationId) paymentReturnRedirect(formData, { error: "Select a reservation first" });

  const snapshot = await getReservationPaymentSnapshot(reservationId);
  if (!snapshot) paymentReturnRedirect(formData, { error: "Reservation not found." });
  if (isCancelledReservation(snapshot.reservation.bookingStatus, snapshot.reservation.cancelledAt)) {
    paymentReturnRedirect(formData, { error: "Reservation is cancelled" });
  }
  if (!snapshot.reservation.totalSnapshot || snapshot.reservation.totalSnapshot <= 0) {
    paymentReturnRedirect(formData, { error: "Reservation has no price snapshot" });
  }

  const currency = snapshot.reservation.currencySnapshot?.toUpperCase() ?? "";
  if (!isCurrencyCode(currency)) paymentReturnRedirect(formData, { error: "Currency is unsupported" });

  const capturedPayment = await assertNoCapturedReservationPayment(reservationId);
  if (capturedPayment) paymentReturnRedirect(formData, { error: "Payment already captured", paymentId: capturedPayment.id });

  const rawIntent = readString(formData, "intent", 20);
  const intent: PayPalOrderIntent = rawIntent === "AUTHORIZE" ? "AUTHORIZE" : "CAPTURE";
  const methodRaw = readString(formData, "method", 40);
  const method = isPaymentMethod(methodRaw) ? methodRaw : "paypal_card";
  const amount = snapshot.reservation.totalSnapshot.toFixed(2);

  try {
    const order = await createPayPalOrder({
      amount,
      currency,
      referenceId: reservationId,
      description: `Kantara reservation ${reservationId}`,
      intent,
    });
    const approvalUrl = extractPayPalApprovalUrl(order);

    const record = await prisma.$transaction(async (tx) => {
      const payment = await tx.paymentRecord.create({
        data: {
          reservationId,
          guestId: snapshot.guestId,
          propertyId: snapshot.propertyId,
          partnerId: snapshot.partnerId,
          amount,
          currency,
          provider: "paypal",
          providerEnvironment: provider.environment,
          providerOrderId: order.id ?? null,
          providerStatus: order.status ?? null,
          status: "order_created",
          method,
          snapshotJson: {
            ...(snapshot.snapshotJson as Record<string, unknown>),
            source: "admin_reservation_payment_terminal",
            paypalIntent: intent,
            approvalUrl,
          },
          createdById: admin.id,
          updatedById: admin.id,
        },
      });
      await tx.paymentEvent.create({
        data: {
          paymentRecordId: payment.id,
          type: "paypal_order_created",
          summary: `PayPal ${intent.toLowerCase()} order created.`,
          payload: {
            providerOrderId: order.id,
            providerStatus: order.status,
            approvalUrl,
          },
          createdById: admin.id,
        },
      });
      await writeAdminAuditEvent({
        tx,
        actorId: admin.id,
        module: "payments",
        action: "create_paypal_order",
        targetType: "PaymentRecord",
        targetId: payment.id,
        summary: "Admin created a PayPal order.",
        metadata: { providerOrderId: order.id, intent, reservationId },
      });
      return payment;
    });

    revalidatePayments();
    paymentReturnRedirect(formData, { notice: "PayPal order created. Complete approval in PayPal before capture or authorization.", paymentId: record.id });
  } catch (error) {
    paymentReturnRedirect(formData, { error: safeError(error) });
  }
}

export async function createPayPalOrderForPaymentAction(formData: FormData) {
  const admin = await requireAdmin();
  const provider = getPayPalProviderReadiness();
  if (!provider.isConfigured) {
    paymentReturnRedirect(formData, { error: "PayPal is not configured. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET before creating orders." });
  }

  const paymentId = readString(formData, "paymentId", 80);
  if (!paymentId) paymentReturnRedirect(formData, { error: "Payment record id is required." });
  const payment = await prisma.paymentRecord.findUnique({ where: { id: paymentId } });
  if (!payment) paymentReturnRedirect(formData, { error: "Payment record not found." });
  if (payment.providerOrderId) paymentReturnRedirect(formData, { error: "Payment already has a PayPal order id.", paymentId: payment.id });
  if (!payment.reservationId) paymentReturnRedirect(formData, { error: "A linked reservation snapshot is required before creating a PayPal order.", paymentId: payment.id });

  const snapshot = await getReservationPaymentSnapshot(payment.reservationId);
  if (!snapshot?.amount || snapshot.amount <= 0) {
    paymentReturnRedirect(formData, { error: "Linked reservation does not have a payable locked amount.", paymentId: payment.id });
  }
  const rawIntent = readString(formData, "intent", 20);
  const intent: PayPalOrderIntent = rawIntent === "AUTHORIZE" ? "AUTHORIZE" : "CAPTURE";

  try {
    const order = await createPayPalOrder({
      amount: snapshot.amount.toFixed(2),
      currency: normalizeCurrency(snapshot.currency, "USD"),
      referenceId: snapshot.reservation.id,
      description: `Kantara reservation ${snapshot.reservation.id}`,
      intent,
    });
    const approvalUrl = extractPayPalApprovalUrl(order);

    await prisma.$transaction(async (tx) => {
      await tx.paymentRecord.update({
        where: { id: payment.id },
        data: {
          amount: snapshot.amount!.toFixed(2),
          currency: normalizeCurrency(snapshot.currency, "USD"),
          provider: "paypal",
          providerEnvironment: provider.environment,
          providerOrderId: order.id ?? null,
          providerStatus: order.status ?? null,
          status: "order_created",
          method: payment.method.startsWith("paypal") ? payment.method : "paypal_card",
          snapshotJson: {
            ...(snapshot.snapshotJson as Record<string, unknown>),
            source: "admin_payment_detail",
            paypalIntent: intent,
            approvalUrl,
          },
          updatedById: admin.id,
        },
      });
      await tx.paymentEvent.create({
        data: {
          paymentRecordId: payment.id,
          type: "paypal_order_created",
          summary: `PayPal ${intent.toLowerCase()} order created from payment detail.`,
          payload: { providerOrderId: order.id, providerStatus: order.status, approvalUrl },
          createdById: admin.id,
        },
      });
      await writeAdminAuditEvent({
        tx,
        actorId: admin.id,
        module: "payments",
        action: "create_paypal_order_for_payment",
        targetType: "PaymentRecord",
        targetId: payment.id,
        summary: "Admin created a PayPal order for an existing payment record.",
        metadata: { providerOrderId: order.id, intent, reservationId: payment.reservationId },
      });
    });

    revalidatePayments();
    paymentReturnRedirect(formData, { notice: "PayPal order created for this payment record.", paymentId: payment.id });
  } catch (error) {
    paymentReturnRedirect(formData, { error: safeError(error), paymentId: payment.id });
  }
}

export async function capturePayPalOrderAction(formData: FormData) {
  const admin = await requireAdmin();
  const paymentId = readString(formData, "paymentId", 80);
  if (!paymentId) paymentRedirect({ error: "Payment record id is required." });

  const payment = await prisma.paymentRecord.findUnique({ where: { id: paymentId } });
  if (!payment) paymentRedirect({ error: "Payment record not found." });
  if (!payment.providerOrderId) paymentRedirect({ error: "Payment record has no PayPal order id." });

  try {
    const order = await capturePayPalOrder(payment.providerOrderId);
    const captureId = extractPayPalCaptureId(order);
    const nextStatus = order.status === "COMPLETED" || captureId ? "captured" : "pending_approval";

    await prisma.$transaction(async (tx) => {
      await tx.paymentRecord.update({
        where: { id: payment.id },
        data: {
          status: nextStatus,
          providerStatus: order.status ?? null,
          providerCaptureId: captureId,
          capturedAt: nextStatus === "captured" ? new Date() : payment.capturedAt,
          updatedById: admin.id,
        },
      });
      await tx.paymentEvent.create({
        data: {
          paymentRecordId: payment.id,
          type: "paypal_order_captured",
          summary: captureId ? "PayPal order captured." : "PayPal capture returned without capture id.",
          payload: { providerOrderId: payment.providerOrderId, providerStatus: order.status, captureId },
          createdById: admin.id,
        },
      });
      await writeAdminAuditEvent({
        tx,
        actorId: admin.id,
        module: "payments",
        action: "capture_paypal_order",
        targetType: "PaymentRecord",
        targetId: payment.id,
        summary: "Admin captured a PayPal order.",
        metadata: { providerOrderId: payment.providerOrderId, captureId },
      });
    });

    revalidatePayments();
    paymentReturnRedirect(formData, { notice: "PayPal capture synced to the payment record.", paymentId: payment.id });
  } catch (error) {
    await prisma.paymentRecord.update({
      where: { id: payment.id },
      data: { status: "requires_review", failureReason: safeError(error), updatedById: admin.id },
    });
    revalidatePayments();
    paymentReturnRedirect(formData, { error: safeError(error), paymentId: payment.id });
  }
}

export async function authorizePayPalOrderAction(formData: FormData) {
  const admin = await requireAdmin();
  const paymentId = readString(formData, "paymentId", 80);
  if (!paymentId) paymentRedirect({ error: "Payment record id is required." });

  const payment = await prisma.paymentRecord.findUnique({ where: { id: paymentId } });
  if (!payment) paymentRedirect({ error: "Payment record not found." });
  if (!payment.providerOrderId) paymentRedirect({ error: "Payment record has no PayPal order id." });

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
          updatedById: admin.id,
        },
      });
      await tx.paymentEvent.create({
        data: {
          paymentRecordId: payment.id,
          type: "paypal_order_authorized",
          summary: authorizationId ? "PayPal order authorized." : "PayPal authorize returned without authorization id.",
          payload: { providerOrderId: payment.providerOrderId, providerStatus: order.status, authorizationId },
          createdById: admin.id,
        },
      });
      await writeAdminAuditEvent({
        tx,
        actorId: admin.id,
        module: "payments",
        action: "authorize_paypal_order",
        targetType: "PaymentRecord",
        targetId: payment.id,
        summary: "Admin authorized a PayPal order.",
        metadata: { providerOrderId: payment.providerOrderId, authorizationId },
      });
    });

    revalidatePayments();
    paymentReturnRedirect(formData, { notice: "PayPal authorization synced to the payment record.", paymentId: payment.id });
  } catch (error) {
    paymentReturnRedirect(formData, { error: safeError(error), paymentId: payment.id });
  }
}

export async function resyncPayPalOrderAction(formData: FormData) {
  const admin = await requireAdmin();
  const paymentId = readString(formData, "paymentId", 80);
  if (!paymentId) paymentRedirect({ error: "Payment record id is required." });

  const payment = await prisma.paymentRecord.findUnique({ where: { id: paymentId } });
  if (!payment) paymentRedirect({ error: "Payment record not found." });
  if (!payment.providerOrderId) paymentRedirect({ error: "Payment record has no PayPal order id." });

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
          updatedById: admin.id,
        },
      });
      await tx.paymentEvent.create({
        data: {
          paymentRecordId: payment.id,
          type: "paypal_order_resynced",
          summary: "PayPal order status re-synced.",
          payload: { providerOrderId: payment.providerOrderId, providerStatus: order.status, captureId, authorizationId },
          createdById: admin.id,
        },
      });
      await writeAdminAuditEvent({
        tx,
        actorId: admin.id,
        module: "payments",
        action: "resync_paypal_order",
        targetType: "PaymentRecord",
        targetId: payment.id,
        summary: "Admin re-synced a PayPal order.",
        metadata: { providerOrderId: payment.providerOrderId },
      });
    });

    revalidatePayments();
    paymentReturnRedirect(formData, { notice: "PayPal status refreshed.", paymentId: payment.id });
  } catch (error) {
    paymentReturnRedirect(formData, { error: safeError(error), paymentId: payment.id });
  }
}

export async function markPaymentRequiresReviewAction(formData: FormData) {
  const admin = await requireAdmin();
  const paymentId = readString(formData, "paymentId", 80);
  const reason = readString(formData, "reason", 1000) ?? "Marked for admin review.";
  if (!paymentId) paymentRedirect({ error: "Payment record id is required." });

  const payment = await prisma.paymentRecord.findUnique({ where: { id: paymentId } });
  if (!payment) paymentRedirect({ error: "Payment record not found." });

  await prisma.$transaction(async (tx) => {
    await tx.paymentRecord.update({
      where: { id: payment.id },
      data: { status: "requires_review", failureReason: reason, updatedById: admin.id },
    });
    await tx.paymentEvent.create({
      data: {
        paymentRecordId: payment.id,
        type: "requires_review",
        summary: reason,
        createdById: admin.id,
      },
    });
    await writeAdminAuditEvent({
      tx,
      actorId: admin.id,
      module: "payments",
      action: "mark_requires_review",
      targetType: "PaymentRecord",
      targetId: payment.id,
      summary: "Admin marked payment as requiring review.",
      metadata: { reason },
    });
  });

  revalidatePayments();
  paymentReturnRedirect(formData, { notice: "Payment marked for review.", paymentId: payment.id });
}

export async function cancelPaymentAction(formData: FormData) {
  const admin = await requireAdmin();
  const paymentId = readString(formData, "paymentId", 80);
  if (!paymentId) paymentRedirect({ error: "Payment record id is required." });

  const payment = await prisma.paymentRecord.findUnique({ where: { id: paymentId } });
  if (!payment) paymentRedirect({ error: "Payment record not found." });
  if (!["draft", "order_created", "pending_approval", "requires_review"].includes(payment.status)) {
    paymentRedirect({ error: "Only draft, pending, or review payments can be cancelled safely.", paymentId: payment.id });
  }

  await prisma.$transaction(async (tx) => {
    await tx.paymentRecord.update({
      where: { id: payment.id },
      data: { status: "cancelled", cancelledAt: new Date(), updatedById: admin.id },
    });
    await tx.paymentEvent.create({
      data: {
        paymentRecordId: payment.id,
        type: "cancelled",
        summary: "Payment record cancelled by admin. No card data or provider secret stored.",
        createdById: admin.id,
      },
    });
    await writeAdminAuditEvent({
      tx,
      actorId: admin.id,
      module: "payments",
      action: "cancel_payment_record",
      targetType: "PaymentRecord",
      targetId: payment.id,
      summary: "Admin cancelled a payment record.",
    });
  });

  revalidatePayments();
  paymentReturnRedirect(formData, { notice: "Payment record cancelled.", paymentId: payment.id });
}

export async function recordManualSettlementAction(formData: FormData) {
  const admin = await requireAdmin();
  const reservationId = readString(formData, "reservationId", 80);
  const method = offlineSettlementMethod(formData);
  const isUnlinkedException = readString(formData, "unlinkedManualSettlement", 10) === "yes";

  if (!reservationId && !isUnlinkedException) {
    paymentReturnRedirect(formData, { error: "Select a reservation first" });
  }

  if (!reservationId) {
    const amount = parsePaymentAmount(formData.get("amount"));
    const currency = readUpperCurrency(formData);
    const payerDescription = readString(formData, "payerDescription", 500);
    const operationalReason = readString(formData, "operationalReason", 1000);
    const adminNote = readString(formData, "adminNote", 1000);

    if (!amount) paymentReturnRedirect(formData, { error: "Amount is required for unlinked exception settlement." });
    if (!isCurrencyCode(currency)) paymentReturnRedirect(formData, { error: "Currency is unsupported" });
    if (!payerDescription) paymentReturnRedirect(formData, { error: "Payer name, email, or description is required." });
    if (!operationalReason) paymentReturnRedirect(formData, { error: "Operational reason is required." });
    if (!adminNote) paymentReturnRedirect(formData, { error: "Admin note is required." });

    const payment = await prisma.$transaction(async (tx) => {
      const record = await tx.paymentRecord.create({
        data: {
          reservationId: null,
          amount,
          currency,
          provider: "manual",
          providerEnvironment: "internal",
          providerStatus: "unlinked_requires_reconciliation",
          status: "requires_review",
          method,
          failureReason: `Payment record missing reservation link: ${operationalReason}`,
          snapshotJson: {
            source: "unlinked_exception_settlement",
            offlineSettlementOnly: true,
            requiresReservationReconciliation: true,
            payerDescription,
            operationalReason,
            adminNote,
          } as Prisma.InputJsonValue,
          createdById: admin.id,
          updatedById: admin.id,
        },
      });
      await tx.paymentEvent.create({
        data: {
          paymentRecordId: record.id,
          type: "unlinked_manual_settlement_requires_review",
          summary: "Unlinked offline settlement recorded and requires reservation reconciliation.",
          payload: {
            method,
            payerDescription,
            operationalReason,
            offlineSettlementOnly: true,
          },
          createdById: admin.id,
        },
      });
      await writeAdminAuditEvent({
        tx,
        actorId: admin.id,
        module: "payments",
        action: "record_unlinked_exception_settlement",
        targetType: "PaymentRecord",
        targetId: record.id,
        summary: "Admin recorded an unlinked offline settlement exception requiring review.",
        metadata: { method, operationalReason },
      });
      return record;
    });

    revalidatePayments();
    paymentReturnRedirect(formData, { notice: "Unlinked exception settlement recorded for review.", paymentId: payment.id });
  }

  const snapshot = await getReservationPaymentSnapshot(reservationId);
  if (!snapshot) paymentReturnRedirect(formData, { error: "Reservation not found." });

  const amount = parsePaymentAmount(formData.get("amount"));
  const currency = readUpperCurrency(formData, snapshot.reservation.currencySnapshot);
  const settlementNote = readString(formData, "settlementNote", 1000) ?? readString(formData, "note", 1000);
  const overrideReason = readString(formData, "overrideReason", 1000);
  const confirmation = readString(formData, "offlineConfirmation", 20);
  const snapshotAmount = snapshot.reservation.totalSnapshot;

  if (!amount) paymentReturnRedirect(formData, { error: "Amount is required." });
  if (!isCurrencyCode(currency)) paymentReturnRedirect(formData, { error: "Currency is unsupported" });
  if (!settlementNote) paymentReturnRedirect(formData, { error: "Settlement note is required." });
  if (confirmation !== "yes") {
    paymentReturnRedirect(formData, { error: "Confirm that this records an offline settlement only and does not mean PayPal captured funds." });
  }
  if (!snapshotAmount || snapshotAmount <= 0) {
    if (!overrideReason) {
      paymentReturnRedirect(formData, { error: "Reservation has no price snapshot" });
    }
  } else if (Math.abs(Number(amount) - snapshotAmount) >= 0.01 && !overrideReason) {
    paymentReturnRedirect(formData, { error: "Amount override requires an operational reason." });
  }

  const payment = await prisma.$transaction(async (tx) => {
    const record = await tx.paymentRecord.create({
      data: {
        reservationId,
        guestId: snapshot.guestId,
        propertyId: snapshot.propertyId,
        partnerId: snapshot.partnerId,
        amount,
        currency,
        provider: "manual",
        providerEnvironment: "internal",
        providerStatus: "offline_settlement_recorded_requires_review",
        status: "requires_review",
        method,
        failureReason: overrideReason
          ? `Offline settlement amount override: ${overrideReason}`
          : "Offline settlement recorded for operations review.",
        snapshotJson: {
          ...(snapshot.snapshotJson as Record<string, unknown>),
          source: "reservation_exception_settlement",
          offlineSettlementOnly: true,
          manualSettlementNote: settlementNote,
          overrideReason,
          snapshotAmount,
        } as Prisma.InputJsonValue,
        createdById: admin.id,
        updatedById: admin.id,
      },
    });
    await tx.paymentEvent.create({
      data: {
        paymentRecordId: record.id,
        type: "manual_settlement_recorded",
        summary: "Offline settlement recorded for linked reservation; this is not a PayPal capture.",
        payload: {
          method,
          reservationId,
          settlementNote,
          overrideReason,
          offlineSettlementOnly: true,
        },
        createdById: admin.id,
      },
    });
    await writeAdminAuditEvent({
      tx,
      actorId: admin.id,
      module: "payments",
      action: "record_exception_settlement",
      targetType: "PaymentRecord",
      targetId: record.id,
      summary: "Admin recorded an offline settlement exception for a linked reservation.",
      metadata: { method, reservationId, overrideReason: overrideReason ?? null },
    });
    return record;
  });

  revalidatePayments();
  paymentReturnRedirect(formData, { notice: "Exception settlement recorded for review.", paymentId: payment.id });
}

export async function openDisputeForPaymentAction(formData: FormData) {
  const admin = await requireAdmin();
  const paymentId = readString(formData, "paymentId", 80);
  const title = readString(formData, "title", 180) ?? "Payment review dispute";
  const summary = readString(formData, "summary", 2000) ?? "Payment requires dispute review.";
  if (!paymentId) paymentRedirect({ error: "Payment record id is required." });

  const payment = await prisma.paymentRecord.findUnique({ where: { id: paymentId } });
  if (!payment) paymentRedirect({ error: "Payment record not found." });

  const dispute = await prisma.$transaction(async (tx) => {
    const created = await tx.disputeCase.create({
      data: {
        caseNumber: createDisputeCaseNumber(),
        type: "payment_issue",
        status: "open",
        priority: "high",
        paymentRecordId: payment.id,
        reservationId: payment.reservationId,
        propertyId: payment.propertyId,
        guestId: payment.guestId,
        partnerId: payment.partnerId,
        title,
        summary,
        createdById: admin.id,
        updatedById: admin.id,
      },
    });
    await tx.disputeEvent.create({
      data: {
        disputeCaseId: created.id,
        type: "created_from_payment",
        message: "Dispute opened from payment operations.",
        payload: { paymentRecordId: payment.id },
        createdById: admin.id,
      },
    });
    await writeAdminAuditEvent({
      tx,
      actorId: admin.id,
      module: "payments",
      action: "open_payment_dispute",
      targetType: "DisputeCase",
      targetId: created.id,
      summary: "Admin opened a dispute from a payment record.",
      metadata: { paymentRecordId: payment.id },
    });
    return created;
  });

  revalidatePayments();
  revalidatePath("/admin/disputes");
  paymentReturnRedirect(formData, { notice: `Dispute ${dispute.caseNumber} opened for payment.`, paymentId: payment.id });
}

function readIds(formData: FormData, key: string) {
  return (readString(formData, key, 5000) ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 100);
}

export async function bulkMarkPaymentsRequiresReviewAction(formData: FormData) {
  const admin = await requireAdmin();
  const paymentIds = readIds(formData, "paymentIds");
  const reason = readString(formData, "reason", 1000) ?? "Bulk marked for payment operations review.";
  if (!paymentIds.length) paymentReturnRedirect(formData, { error: "Select at least one payment first." });

  const payments = await prisma.paymentRecord.findMany({ where: { id: { in: paymentIds } } });
  const eligible = payments.filter((payment) => payment.status !== "requires_review");
  if (!eligible.length) paymentReturnRedirect(formData, { error: "Selected payments are already marked requires review." });

  await prisma.$transaction(async (tx) => {
    await tx.paymentRecord.updateMany({
      where: { id: { in: eligible.map((payment) => payment.id) } },
      data: { status: "requires_review", failureReason: reason, updatedById: admin.id },
    });
    for (const payment of eligible) {
      await tx.paymentEvent.create({
        data: {
          paymentRecordId: payment.id,
          type: "requires_review",
          summary: reason,
          createdById: admin.id,
        },
      });
    }
    await writeAdminAuditEvent({
      tx,
      actorId: admin.id,
      module: "payments",
      action: "bulk_mark_requires_review",
      targetType: "PaymentRecord",
      targetId: null,
      summary: `Admin bulk marked ${eligible.length} payments for review.`,
      metadata: { paymentIds: eligible.map((payment) => payment.id), reason },
    });
  });

  revalidatePayments();
  paymentReturnRedirect(formData, { notice: `${eligible.length} payment records marked for review.` });
}

export async function bulkSyncPayPalOrdersAction(formData: FormData) {
  const admin = await requireAdmin();
  const provider = getPayPalProviderReadiness();
  if (!provider.isConfigured) {
    paymentReturnRedirect(formData, { error: "Bulk sync disabled: PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are required." });
  }

  const paymentIds = readIds(formData, "paymentIds");
  if (!paymentIds.length) paymentReturnRedirect(formData, { error: "Select at least one payment first." });
  const payments = await prisma.paymentRecord.findMany({
    where: { id: { in: paymentIds }, provider: "paypal", providerOrderId: { not: null } },
  });
  if (!payments.length) paymentReturnRedirect(formData, { error: "Selected payments have no PayPal order ids to sync." });

  let synced = 0;
  let failed = 0;
  for (const payment of payments) {
    try {
      const order = await getPayPalOrder(payment.providerOrderId!);
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
            updatedById: admin.id,
          },
        });
        await tx.paymentEvent.create({
          data: {
            paymentRecordId: payment.id,
            type: "paypal_order_resynced",
            summary: "PayPal order status bulk re-synced.",
            payload: { providerOrderId: payment.providerOrderId, providerStatus: order.status, captureId, authorizationId },
            createdById: admin.id,
          },
        });
        await writeAdminAuditEvent({
          tx,
          actorId: admin.id,
          module: "payments",
          action: "bulk_resync_paypal_order",
          targetType: "PaymentRecord",
          targetId: payment.id,
          summary: "Admin bulk re-synced a PayPal order.",
          metadata: { providerOrderId: payment.providerOrderId },
        });
      });
      synced += 1;
    } catch {
      failed += 1;
    }
  }

  revalidatePayments();
  paymentReturnRedirect(formData, {
    notice: `Bulk PayPal sync complete: ${synced} synced${failed ? `, ${failed} failed` : ""}.`,
  });
}
