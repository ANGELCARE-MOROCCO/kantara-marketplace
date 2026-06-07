"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { requireAdmin } from "@/app/lib/auth";
import prisma from "@/app/lib/db";
import { writeAdminAuditEvent } from "@/app/lib/audit";
import {
  BOOKING_LIFECYCLE_STATUSES,
  getBookingStatusTransitionDisabledReason,
} from "@/app/lib/bookingIntelligence";
import {
  HANDOVER_PRIORITIES,
  HANDOVER_STATUSES,
  HANDOVER_TYPES,
  createHandoverTaskNumber,
} from "@/app/lib/handoverOperations";
import { DISPUTE_PRIORITIES, DISPUTE_TYPES, createDisputeCaseNumber } from "@/app/lib/disputeOperations";
import { VERIFICATION_CATEGORIES, VERIFICATION_ENTITY_TYPES } from "@/app/lib/verificationOperations";
import {
  getReservationPaymentSnapshot,
  isPaymentMethod,
} from "@/app/lib/paymentOperations";
import {
  createPayPalOrder,
  extractPayPalApprovalUrl,
  getPayPalProviderReadiness,
  type PayPalOrderIntent,
} from "@/app/lib/paypal";
import { normalizeCurrency } from "@/app/lib/globalization";

function readString(formData: FormData, key: string, maxLength = 1000) {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function readBookingIds(formData: FormData) {
  const fromCsv = readString(formData, "bookingIds", 5000)
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean) ?? [];
  const fromFields = formData
    .getAll("bookingId")
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
  return Array.from(new Set([...fromCsv, ...fromFields])).slice(0, 250);
}

function bookingsRedirect(params: Record<string, string | null | undefined> = {}, returnTo?: string | null): never {
  const fallback = "/admin/bookings";
  const safeReturnTo = returnTo?.startsWith("/admin/bookings") ? returnTo : fallback;
  const url = new URL(safeReturnTo, "https://kantara.local");
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  });
  redirect(`${url.pathname}${url.search}`);
}

function revalidateBookings(reservationId?: string | null) {
  revalidatePath("/admin");
  revalidatePath("/admin/bookings");
  revalidatePath("/admin/marketplace-operations");
  revalidatePath("/admin/payments");
  revalidatePath("/admin/handover");
  revalidatePath("/admin/disputes");
  revalidatePath("/admin/verifications");
  revalidatePath("/reservations");
  if (reservationId) revalidatePath(`/reservations?reservationId=${reservationId}`);
}

function parseDateTime(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseChecklist(value?: string | null) {
  const items = (value ?? "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20)
    .map((label) => ({ label, done: false }));
  return items.length ? items : undefined;
}

function safePaymentError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 300) : "Payment operation failed.";
}

async function loadBookingForAction(reservationId: string | null, returnTo?: string | null) {
  if (!reservationId) bookingsRedirect({ error: "Reservation id is required." }, returnTo);
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: {
      id: true,
      bookingStatus: true,
      startDate: true,
      endDate: true,
      userId: true,
      homeId: true,
      totalSnapshot: true,
      currencySnapshot: true,
      listingTitleSnapshot: true,
      Home: { select: { userId: true, approvedTitle: true, title: true, city: true } },
      User: { select: { email: true, firstName: true, lastName: true } },
    },
  });
  if (!reservation) bookingsRedirect({ error: "Reservation not found." }, returnTo);
  return reservation;
}

export async function updateBookingStatusAction(formData: FormData) {
  const admin = await requireAdmin();
  const returnTo = readString(formData, "returnTo", 2000);
  const reservationId = readString(formData, "reservationId", 80);
  const nextStatus = readString(formData, "status", 40);
  const note = readString(formData, "note", 1000);
  if (!reservationId) bookingsRedirect({ error: "Reservation id is required." }, returnTo);
  if (!BOOKING_LIFECYCLE_STATUSES.includes(nextStatus as any)) {
    bookingsRedirect({ error: "Unsupported booking status.", bookingId: reservationId }, returnTo);
  }

  const reservation = await loadBookingForAction(reservationId, returnTo);
  const disabledReason = getBookingStatusTransitionDisabledReason(reservation.bookingStatus, nextStatus as string);
  if (disabledReason) bookingsRedirect({ error: disabledReason, bookingId: reservation.id }, returnTo);

  await prisma.$transaction(async (tx) => {
    await tx.reservation.update({
      where: { id: reservation.id },
      data: {
        bookingStatus: nextStatus as string,
        cancelledAt: nextStatus === "cancelled" ? new Date() : undefined,
        completedAt: nextStatus === "completed" ? new Date() : undefined,
      },
    });
    await writeAdminAuditEvent({
      tx,
      actorId: admin.id,
      module: "bookings",
      action: "update_booking_status",
      targetType: "Reservation",
      targetId: reservation.id,
      summary: `Booking status changed from ${reservation.bookingStatus} to ${nextStatus}.`,
      metadata: { previousStatus: reservation.bookingStatus, nextStatus, note },
    });
  });

  revalidateBookings(reservation.id);
  bookingsRedirect({ notice: "Booking status updated.", bookingId: reservation.id }, returnTo);
}

export async function bulkMarkBookingsUnderReviewAction(formData: FormData) {
  const admin = await requireAdmin();
  const returnTo = readString(formData, "returnTo", 2000);
  const ids = readBookingIds(formData);
  const note = readString(formData, "note", 1000) ?? "Bulk marked under review from bookings operations.";
  if (!ids.length) bookingsRedirect({ error: "Select at least one booking." }, returnTo);

  const result = await prisma.$transaction(async (tx) => {
    const reservations = await tx.reservation.findMany({
      where: { id: { in: ids } },
      select: { id: true, bookingStatus: true },
    });
    const eligible = reservations.filter(
      (reservation) => !getBookingStatusTransitionDisabledReason(reservation.bookingStatus, "under_review")
    );
    for (const reservation of eligible) {
      await tx.reservation.update({
        where: { id: reservation.id },
        data: { bookingStatus: "under_review" },
      });
      await writeAdminAuditEvent({
        tx,
        actorId: admin.id,
        module: "bookings",
        action: "bulk_mark_under_review",
        targetType: "Reservation",
        targetId: reservation.id,
        summary: "Booking marked under review from bulk operations.",
        metadata: { previousStatus: reservation.bookingStatus, note },
      });
    }
    return { updated: eligible.length, skipped: Math.max(0, ids.length - eligible.length) };
  });

  revalidateBookings();
  if (!result.updated) {
    bookingsRedirect({ error: "No selected bookings could be marked under review." }, returnTo);
  }
  bookingsRedirect({
    notice: `${result.updated} booking${result.updated === 1 ? "" : "s"} marked under review${result.skipped ? `; ${result.skipped} skipped` : ""}.`,
  }, returnTo);
}

export async function bulkCreateHandoverTasksForBookingsAction(formData: FormData) {
  const admin = await requireAdmin();
  const returnTo = readString(formData, "returnTo", 2000);
  const ids = readBookingIds(formData);
  if (!ids.length) bookingsRedirect({ error: "Select at least one booking." }, returnTo);

  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const reservations = await tx.reservation.findMany({
      where: {
        id: { in: ids },
        startDate: { gte: now },
        bookingStatus: { notIn: ["cancelled", "completed"] },
      },
      select: {
        id: true,
        startDate: true,
        userId: true,
        homeId: true,
        listingTitleSnapshot: true,
        Home: { select: { userId: true, approvedTitle: true, title: true } },
      },
    });
    const existing = await tx.handoverTask.findMany({
      where: { reservationId: { in: reservations.map((reservation) => reservation.id) }, status: { not: "cancelled" } },
      select: { reservationId: true },
      distinct: ["reservationId"],
    });
    const existingIds = new Set(existing.map((task) => task.reservationId));
    const eligible = reservations.filter((reservation) => !existingIds.has(reservation.id));
    let createdCount = 0;
    for (let index = 0; index < eligible.length; index += 1) {
      const reservation = eligible[index];
      const task = await tx.handoverTask.create({
        data: {
          taskNumber: `${createHandoverTaskNumber()}-${index + 1}`,
          reservationId: reservation.id,
          propertyId: reservation.homeId,
          guestId: reservation.userId,
          partnerId: reservation.Home?.userId ?? null,
          type: "check_in",
          status: "pending_preparation",
          priority: "medium",
          scheduledFor: reservation.startDate,
          title: `Arrival readiness for ${reservation.listingTitleSnapshot ?? reservation.Home?.approvedTitle ?? reservation.Home?.title ?? reservation.id}`,
          summary: "Bulk-created arrival readiness task. No access codes or private entry instructions stored.",
          checklist: [
            { label: "Confirm arrival window", done: false },
            { label: "Confirm property readiness", done: false },
            { label: "Confirm guest support owner", done: false },
          ],
          createdById: admin.id,
          updatedById: admin.id,
        },
      });
      await tx.handoverEvent.create({
        data: {
          handoverTaskId: task.id,
          type: "bulk_task_created",
          message: "Handover task bulk-created from booking operations.",
          createdById: admin.id,
        },
      });
      await writeAdminAuditEvent({
        tx,
        actorId: admin.id,
        module: "bookings",
        action: "bulk_create_handover_task",
        targetType: "Reservation",
        targetId: reservation.id,
        summary: `Handover task ${task.taskNumber} created from booking bulk operation.`,
        metadata: { handoverTaskId: task.id },
      });
      createdCount += 1;
    }
    return { created: createdCount, skipped: Math.max(0, ids.length - createdCount) };
  });

  revalidateBookings();
  if (!result.created) {
    bookingsRedirect({ error: "No selected bookings were eligible for handover task creation." }, returnTo);
  }
  bookingsRedirect({
    notice: `${result.created} handover task${result.created === 1 ? "" : "s"} created${result.skipped ? `; ${result.skipped} skipped` : ""}.`,
  }, returnTo);
}

export async function createBookingHandoverTaskAction(formData: FormData) {
  const admin = await requireAdmin();
  const returnTo = readString(formData, "returnTo", 2000);
  const reservation = await loadBookingForAction(readString(formData, "reservationId", 80), returnTo);
  const type = readString(formData, "type", 40);
  const priority = readString(formData, "priority", 20) ?? "medium";
  const title = readString(formData, "title", 180);
  const summary = readString(formData, "summary", 2000);
  const scheduledFor = parseDateTime(readString(formData, "scheduledFor", 80));

  if (!HANDOVER_TYPES.includes(type as any)) bookingsRedirect({ error: "Valid handover type is required.", bookingId: reservation.id }, returnTo);
  if (!HANDOVER_PRIORITIES.includes(priority as any)) bookingsRedirect({ error: "Valid priority is required.", bookingId: reservation.id }, returnTo);
  if (!title) bookingsRedirect({ error: "Task title is required.", bookingId: reservation.id }, returnTo);
  if (["cancelled", "completed"].includes(reservation.bookingStatus)) {
    bookingsRedirect({ error: "Closed bookings cannot receive new handover tasks.", bookingId: reservation.id }, returnTo);
  }

  const task = await prisma.$transaction(async (tx) => {
    const created = await tx.handoverTask.create({
      data: {
        taskNumber: createHandoverTaskNumber(),
        reservationId: reservation.id,
        propertyId: reservation.homeId,
        guestId: reservation.userId,
        partnerId: reservation.Home?.userId ?? null,
        type: type as string,
        status: scheduledFor ? "pending_preparation" : "not_scheduled",
        priority: priority as string,
        scheduledFor,
        title,
        summary,
        checklist: parseChecklist(readString(formData, "checklist", 2000)),
        createdById: admin.id,
        updatedById: admin.id,
      },
    });
    await tx.handoverEvent.create({
      data: {
        handoverTaskId: created.id,
        type: "task_created_from_booking",
        message: "Handover task created from booking operations. No access codes were stored.",
        createdById: admin.id,
      },
    });
    await writeAdminAuditEvent({
      tx,
      actorId: admin.id,
      module: "bookings",
      action: "create_handover_task",
      targetType: "Reservation",
      targetId: reservation.id,
      summary: `Handover task ${created.taskNumber} created for reservation.`,
      metadata: { handoverTaskId: created.id, type, priority },
    });
    return created;
  });

  revalidateBookings(reservation.id);
  bookingsRedirect({ notice: `Handover task ${task.taskNumber} created.`, bookingId: reservation.id }, returnTo);
}

export async function updateBookingHandoverStatusAction(formData: FormData) {
  const admin = await requireAdmin();
  const returnTo = readString(formData, "returnTo", 2000);
  const taskId = readString(formData, "taskId", 80);
  const status = readString(formData, "status", 40);
  const message = readString(formData, "message", 2000) ?? "Handover status updated from booking operations.";
  if (!taskId) bookingsRedirect({ error: "Task id is required." }, returnTo);
  if (!HANDOVER_STATUSES.includes(status as any)) bookingsRedirect({ error: "Unsupported handover status." }, returnTo);

  const task = await prisma.handoverTask.findUnique({ where: { id: taskId } });
  if (!task) bookingsRedirect({ error: "Handover task not found." }, returnTo);

  await prisma.$transaction(async (tx) => {
    await tx.handoverTask.update({
      where: { id: task.id },
      data: {
        status: status as string,
        completedAt: status === "completed" ? new Date() : task.completedAt,
        updatedById: admin.id,
      },
    });
    await tx.handoverEvent.create({
      data: {
        handoverTaskId: task.id,
        type: `booking_status_${status}`,
        message,
        payload: { previousStatus: task.status, nextStatus: status },
        createdById: admin.id,
      },
    });
    await writeAdminAuditEvent({
      tx,
      actorId: admin.id,
      module: "bookings",
      action: "update_handover_status",
      targetType: "HandoverTask",
      targetId: task.id,
      summary: `Handover task ${task.taskNumber} moved to ${status} from booking operations.`,
      metadata: { reservationId: task.reservationId, previousStatus: task.status, nextStatus: status },
    });
  });

  revalidateBookings(task.reservationId);
  bookingsRedirect({ notice: "Handover status updated.", bookingId: task.reservationId }, returnTo);
}

export async function createBookingDisputeAction(formData: FormData) {
  const admin = await requireAdmin();
  const returnTo = readString(formData, "returnTo", 2000);
  const reservation = await loadBookingForAction(readString(formData, "reservationId", 80), returnTo);
  const type = readString(formData, "type", 40);
  const priority = readString(formData, "priority", 20);
  const title = readString(formData, "title", 180);
  const summary = readString(formData, "summary", 2000);
  const paymentRecordId = readString(formData, "paymentRecordId", 80);
  if (!DISPUTE_TYPES.includes(type as any)) bookingsRedirect({ error: "Valid dispute type is required.", bookingId: reservation.id }, returnTo);
  if (!DISPUTE_PRIORITIES.includes(priority as any)) bookingsRedirect({ error: "Valid priority is required.", bookingId: reservation.id }, returnTo);
  if (!title || !summary) bookingsRedirect({ error: "Title and summary are required.", bookingId: reservation.id }, returnTo);

  if (paymentRecordId) {
    const payment = await prisma.paymentRecord.findUnique({ where: { id: paymentRecordId }, select: { id: true, reservationId: true } });
    if (!payment || payment.reservationId !== reservation.id) {
      bookingsRedirect({ error: "Payment record does not belong to this reservation.", bookingId: reservation.id }, returnTo);
    }
  }

  const dispute = await prisma.$transaction(async (tx) => {
    const created = await tx.disputeCase.create({
      data: {
        caseNumber: createDisputeCaseNumber(),
        type: type as string,
        priority: priority as string,
        status: "open",
        reservationId: reservation.id,
        paymentRecordId,
        propertyId: reservation.homeId,
        guestId: reservation.userId,
        partnerId: reservation.Home?.userId ?? null,
        title,
        summary,
        createdById: admin.id,
        updatedById: admin.id,
      },
    });
    await tx.disputeEvent.create({
      data: {
        disputeCaseId: created.id,
        type: "case_created_from_booking",
        message: "Dispute case created from booking operations.",
        createdById: admin.id,
      },
    });
    await writeAdminAuditEvent({
      tx,
      actorId: admin.id,
      module: "bookings",
      action: "create_dispute",
      targetType: "Reservation",
      targetId: reservation.id,
      summary: `Dispute ${created.caseNumber} created for reservation.`,
      metadata: { disputeCaseId: created.id, type, priority, paymentRecordId },
    });
    return created;
  });

  revalidateBookings(reservation.id);
  bookingsRedirect({ notice: `Dispute ${dispute.caseNumber} created.`, bookingId: reservation.id }, returnTo);
}

export async function createBookingVerificationRecordAction(formData: FormData) {
  const admin = await requireAdmin();
  const returnTo = readString(formData, "returnTo", 2000);
  const reservation = await loadBookingForAction(readString(formData, "reservationId", 80), returnTo);
  const entityType = readString(formData, "entityType", 40);
  const category = readString(formData, "category", 60);
  const title = readString(formData, "title", 180);
  const summary = readString(formData, "summary", 2000);
  const evidenceSummary = readString(formData, "evidenceSummary", 2000);
  const entityId =
    entityType === "guest"
      ? reservation.userId
      : entityType === "property"
        ? reservation.homeId
        : readString(formData, "entityId", 120);

  if (!VERIFICATION_ENTITY_TYPES.includes(entityType as any)) bookingsRedirect({ error: "Valid entity type is required.", bookingId: reservation.id }, returnTo);
  if (!entityId) bookingsRedirect({ error: "Entity id is required.", bookingId: reservation.id }, returnTo);
  if (!VERIFICATION_CATEGORIES.includes(category as any)) bookingsRedirect({ error: "Valid verification category is required.", bookingId: reservation.id }, returnTo);
  if (!title) bookingsRedirect({ error: "Verification title is required.", bookingId: reservation.id }, returnTo);

  const record = await prisma.$transaction(async (tx) => {
    const created = await tx.verificationRecord.create({
      data: {
        entityType: entityType as string,
        entityId,
        category: category as string,
        status: "pending",
        title,
        summary,
        evidenceSummary,
        createdById: admin.id,
        updatedById: admin.id,
      },
    });
    await tx.verificationEvent.create({
      data: {
        verificationRecordId: created.id,
        type: "created_from_booking",
        message: "Verification created from booking operations. Sensitive identity/document values were not stored.",
        createdById: admin.id,
      },
    });
    await writeAdminAuditEvent({
      tx,
      actorId: admin.id,
      module: "bookings",
      action: "create_verification",
      targetType: "Reservation",
      targetId: reservation.id,
      summary: "Verification record created from booking operations.",
      metadata: { verificationRecordId: created.id, entityType, entityId, category },
    });
    return created;
  });

  revalidateBookings(reservation.id);
  bookingsRedirect({ notice: `Verification ${record.id.slice(0, 8)} created.`, bookingId: reservation.id }, returnTo);
}

export async function createBookingPayPalOrderAction(formData: FormData) {
  const admin = await requireAdmin();
  const returnTo = readString(formData, "returnTo", 2000);
  const reservation = await loadBookingForAction(readString(formData, "reservationId", 80), returnTo);
  const provider = getPayPalProviderReadiness();
  if (!provider.isConfigured) {
    bookingsRedirect({
      error: "PayPal is not configured. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET before creating orders.",
      bookingId: reservation.id,
    }, returnTo);
  }

  const snapshot = await getReservationPaymentSnapshot(reservation.id);
  if (!snapshot) bookingsRedirect({ error: "Reservation payment snapshot could not be loaded.", bookingId: reservation.id }, returnTo);
  if (!snapshot.amount || snapshot.amount <= 0) {
    bookingsRedirect({ error: "Reservation does not have a payable locked amount.", bookingId: reservation.id }, returnTo);
  }
  const payableAmount = snapshot.amount;

  const rawIntent = readString(formData, "intent", 20);
  const intent: PayPalOrderIntent = rawIntent === "AUTHORIZE" ? "AUTHORIZE" : "CAPTURE";
  const methodRaw = readString(formData, "method", 40);
  const method = isPaymentMethod(methodRaw) ? methodRaw : "paypal_card";

  try {
    const order = await createPayPalOrder({
      amount: payableAmount.toFixed(2),
      currency: normalizeCurrency(snapshot.currency, "USD"),
      referenceId: reservation.id,
      description: `Kantara reservation ${reservation.id}`,
      intent,
    });
    const approvalUrl = extractPayPalApprovalUrl(order);

    const record = await prisma.$transaction(async (tx) => {
      const payment = await tx.paymentRecord.create({
        data: {
          reservationId: reservation.id,
          guestId: snapshot.guestId,
          propertyId: snapshot.propertyId,
          partnerId: snapshot.partnerId,
          amount: payableAmount.toFixed(2),
          currency: normalizeCurrency(snapshot.currency, "USD"),
          provider: "paypal",
          providerEnvironment: provider.environment,
          providerOrderId: order.id ?? null,
          providerStatus: order.status ?? null,
          status: "pending_approval",
          method,
          snapshotJson: {
            ...(snapshot.snapshotJson as Prisma.InputJsonObject),
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
          type: "paypal_order_created_from_booking",
          summary: `PayPal ${intent.toLowerCase()} order created from booking operations.`,
          payload: { providerOrderId: order.id, providerStatus: order.status, approvalUrl },
          createdById: admin.id,
        },
      });
      await writeAdminAuditEvent({
        tx,
        actorId: admin.id,
        module: "bookings",
        action: "create_paypal_order",
        targetType: "Reservation",
        targetId: reservation.id,
        summary: "PayPal order created from booking operations.",
        metadata: { paymentRecordId: payment.id, providerOrderId: order.id, intent },
      });
      return payment;
    });

    revalidateBookings(reservation.id);
    bookingsRedirect({
      notice: "PayPal order created. Complete buyer approval before capture or authorization.",
      bookingId: reservation.id,
    }, returnTo);
  } catch (error) {
    bookingsRedirect({ error: safePaymentError(error), bookingId: reservation.id }, returnTo);
  }
}

export async function markBookingPaymentRequiresReviewAction(formData: FormData) {
  const admin = await requireAdmin();
  const returnTo = readString(formData, "returnTo", 2000);
  const paymentId = readString(formData, "paymentId", 80);
  const reason = readString(formData, "reason", 1000) ?? "Marked for admin review from booking operations.";
  if (!paymentId) bookingsRedirect({ error: "Payment record id is required." }, returnTo);

  const payment = await prisma.paymentRecord.findUnique({ where: { id: paymentId } });
  if (!payment) bookingsRedirect({ error: "Payment record not found." }, returnTo);

  await prisma.$transaction(async (tx) => {
    await tx.paymentRecord.update({
      where: { id: payment.id },
      data: { status: "requires_review", failureReason: reason, updatedById: admin.id },
    });
    await tx.paymentEvent.create({
      data: {
        paymentRecordId: payment.id,
        type: "requires_review_from_booking",
        summary: reason,
        createdById: admin.id,
      },
    });
    await writeAdminAuditEvent({
      tx,
      actorId: admin.id,
      module: "bookings",
      action: "mark_payment_requires_review",
      targetType: "PaymentRecord",
      targetId: payment.id,
      summary: "Payment marked as requiring review from booking operations.",
      metadata: { reservationId: payment.reservationId, reason },
    });
  });

  revalidateBookings(payment.reservationId);
  bookingsRedirect({ notice: "Payment marked for review.", bookingId: payment.reservationId }, returnTo);
}
