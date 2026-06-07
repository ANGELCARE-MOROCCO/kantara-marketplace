"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/app/lib/auth";
import prisma from "@/app/lib/db";
import { writeAdminAuditEvent } from "@/app/lib/audit";
import {
  HANDOVER_PRIORITIES,
  HANDOVER_STATUSES,
  HANDOVER_TYPES,
  createHandoverTaskNumber,
} from "@/app/lib/handoverOperations";
import {
  getDefaultHandoverChecklist,
  getHandoverStatusTransitionDisabledReason,
  normalizeHandoverChecklist,
} from "@/app/lib/handoverIntelligence";
import { createDisputeCaseNumber } from "@/app/lib/disputeOperations";

const PAYMENT_SETTLED_STATUSES = ["captured", "authorized"];

function readString(formData: FormData, key: string, maxLength = 2000) {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function readHandoverIds(formData: FormData) {
  const fromCsv = readString(formData, "handoverIds", 12000)
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean) ?? [];
  const fromFields = formData
    .getAll("handoverId")
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
  return Array.from(new Set([...fromCsv, ...fromFields])).slice(0, 250);
}

function handoverRedirect(params: Record<string, string | null | undefined> = {}, returnTo?: string | null): never {
  const fallback = "/admin/handover";
  const safeReturnTo = returnTo?.startsWith("/admin/handover") ? returnTo : fallback;
  const url = new URL(safeReturnTo, "https://kantara.local");
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  });
  redirect(`${url.pathname}${url.search}`);
}

function revalidateHandover() {
  revalidatePath("/admin");
  revalidatePath("/admin/handover");
  revalidatePath("/admin/bookings");
  revalidatePath("/admin/disputes");
  revalidatePath("/admin/marketplace-operations");
}

function parseDateTime(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function containsSensitiveAccessData(value?: string | null) {
  if (!value) return false;
  return [
    /(door|gate|garage|alarm|lockbox|keypad|entry|access)\s*(code|pin|password)/i,
    /(code|pin|password)\s*[:#-]?\s*\d{3,}/i,
    /private\s+access\s+instructions?/i,
    /alarm\s+code/i,
    /password/i,
  ].some((pattern) => pattern.test(value));
}

function assertSafeOperationalText(fields: (string | null | undefined)[], returnTo?: string | null): void {
  if (fields.some((field) => containsSensitiveAccessData(field))) {
    handoverRedirect({
      error: "Do not store door codes, lockbox codes, alarm codes, passwords, or private access instructions in handover records.",
    }, returnTo);
  }
}

function parseChecklist(value: string | null | undefined, type: string) {
  assertSafeOperationalText([value]);
  const customItems = (value ?? "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 24)
    .map((label) => ({ label, done: false }));
  return customItems.length ? customItems : getDefaultHandoverChecklist(type);
}

async function loadReservationForTask(reservationId: string | null) {
  return reservationId
    ? prisma.reservation.findUnique({
        where: { id: reservationId },
        select: {
          id: true,
          startDate: true,
          endDate: true,
          bookingStatus: true,
          userId: true,
          homeId: true,
          listingTitleSnapshot: true,
          Home: { select: { userId: true, approvedTitle: true, title: true, city: true } },
        },
      })
    : null;
}

export async function createHandoverTaskAction(formData: FormData) {
  const admin = await requireAdmin();
  const returnTo = readString(formData, "returnTo", 2000);
  const type = readString(formData, "type", 40);
  const priority = readString(formData, "priority", 20) ?? "medium";
  const title = readString(formData, "title", 180);
  const summary = readString(formData, "summary", 2000);
  const scheduledFor = parseDateTime(readString(formData, "scheduledFor", 80));

  if (!HANDOVER_TYPES.includes(type as any)) handoverRedirect({ error: "Valid handover type is required." }, returnTo);
  if (!HANDOVER_PRIORITIES.includes(priority as any)) handoverRedirect({ error: "Valid priority is required." }, returnTo);
  if (!title) handoverRedirect({ error: "Task title is required." }, returnTo);
  assertSafeOperationalText([title, summary, readString(formData, "checklist", 4000)], returnTo);

  const reservationId = readString(formData, "reservationId", 80);
  const reservation = await loadReservationForTask(reservationId);
  if (reservationId && !reservation) handoverRedirect({ error: "Linked reservation was not found." }, returnTo);

  const task = await prisma.$transaction(async (tx) => {
    const created = await tx.handoverTask.create({
      data: {
        taskNumber: createHandoverTaskNumber(),
        reservationId,
        propertyId: readString(formData, "propertyId", 80) ?? reservation?.homeId ?? null,
        guestId: readString(formData, "guestId", 80) ?? reservation?.userId ?? null,
        partnerId: readString(formData, "partnerId", 80) ?? reservation?.Home?.userId ?? null,
        type: type as string,
        status: scheduledFor ? "pending_preparation" : "not_scheduled",
        priority: priority as string,
        scheduledFor,
        title,
        summary,
        checklist: parseChecklist(readString(formData, "checklist", 4000), type as string),
        assignedToId: readString(formData, "assignedToId", 80),
        createdById: admin.id,
        updatedById: admin.id,
      },
    });
    await tx.handoverEvent.create({
      data: {
        handoverTaskId: created.id,
        type: "task_created",
        message: "Handover task created. Access coordination is handled outside this record.",
        payload: { reservationId, type, priority },
        createdById: admin.id,
      },
    });
    await writeAdminAuditEvent({
      tx,
      actorId: admin.id,
      module: "handover",
      action: "create_task",
      targetType: "HandoverTask",
      targetId: created.id,
      summary: `Handover task ${created.taskNumber} created.`,
      metadata: { reservationId, type, priority },
    });
    return created;
  });

  revalidateHandover();
  handoverRedirect({ notice: `Handover task ${task.taskNumber} created.`, handoverId: task.id }, returnTo);
}

export async function scheduleHandoverTaskAction(formData: FormData) {
  const admin = await requireAdmin();
  const returnTo = readString(formData, "returnTo", 2000);
  const taskId = readString(formData, "handoverId", 80);
  const scheduledFor = parseDateTime(readString(formData, "scheduledFor", 80));
  if (!taskId) handoverRedirect({ error: "Task id is required." }, returnTo);
  if (!scheduledFor) handoverRedirect({ error: "Valid scheduled date and time are required.", handoverId: taskId }, returnTo);

  const task = await prisma.handoverTask.findUnique({ where: { id: taskId } });
  if (!task) handoverRedirect({ error: "Handover task not found." }, returnTo);
  if (task.status === "cancelled") handoverRedirect({ error: "Cancelled tasks cannot be scheduled.", handoverId: task.id }, returnTo);

  await prisma.$transaction(async (tx) => {
    await tx.handoverTask.update({
      where: { id: task.id },
      data: {
        scheduledFor,
        status: task.status === "not_scheduled" ? "pending_preparation" : task.status,
        updatedById: admin.id,
      },
    });
    await tx.handoverEvent.create({
      data: {
        handoverTaskId: task.id,
        type: "task_scheduled",
        message: "Handover task scheduled.",
        payload: { previousScheduledFor: task.scheduledFor, scheduledFor },
        createdById: admin.id,
      },
    });
    await writeAdminAuditEvent({
      tx,
      actorId: admin.id,
      module: "handover",
      action: "schedule_task",
      targetType: "HandoverTask",
      targetId: task.id,
      summary: `Handover task ${task.taskNumber} scheduled.`,
      metadata: { previousScheduledFor: task.scheduledFor, scheduledFor },
    });
  });

  revalidateHandover();
  handoverRedirect({ notice: "Handover task scheduled.", handoverId: task.id }, returnTo);
}

export async function updateHandoverStatusAction(formData: FormData) {
  const admin = await requireAdmin();
  const returnTo = readString(formData, "returnTo", 2000);
  const taskId = readString(formData, "handoverId", 80) ?? readString(formData, "taskId", 80);
  const status = readString(formData, "status", 40);
  const message = readString(formData, "message", 2000) ?? "Handover status updated.";
  if (!taskId) handoverRedirect({ error: "Task id is required." }, returnTo);
  if (!HANDOVER_STATUSES.includes(status as any)) handoverRedirect({ error: "Unsupported handover status.", handoverId: taskId }, returnTo);
  assertSafeOperationalText([message], returnTo);

  const task = await prisma.handoverTask.findUnique({ where: { id: taskId } });
  if (!task) handoverRedirect({ error: "Handover task not found." }, returnTo);
  const disabledReason = getHandoverStatusTransitionDisabledReason(task.status, status as string);
  if (disabledReason) handoverRedirect({ error: disabledReason, handoverId: task.id }, returnTo);

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
        type: `status_${status}`,
        message,
        payload: { previousStatus: task.status, nextStatus: status },
        createdById: admin.id,
      },
    });
    await writeAdminAuditEvent({
      tx,
      actorId: admin.id,
      module: "handover",
      action: "update_status",
      targetType: "HandoverTask",
      targetId: task.id,
      summary: `Handover task ${task.taskNumber} moved to ${status}.`,
      metadata: { previousStatus: task.status, nextStatus: status },
    });
  });

  revalidateHandover();
  handoverRedirect({ notice: "Handover status updated.", handoverId: task.id }, returnTo);
}

export async function bulkUpdateHandoverStatusAction(formData: FormData) {
  const admin = await requireAdmin();
  const returnTo = readString(formData, "returnTo", 2000);
  const ids = readHandoverIds(formData);
  const status = readString(formData, "status", 40);
  const message = readString(formData, "message", 1000) ?? "Bulk handover status update.";
  if (!ids.length) handoverRedirect({ error: "Select at least one handover task." }, returnTo);
  if (!HANDOVER_STATUSES.includes(status as any)) handoverRedirect({ error: "Unsupported handover status." }, returnTo);
  assertSafeOperationalText([message], returnTo);

  const result = await prisma.$transaction(async (tx) => {
    const tasks = await tx.handoverTask.findMany({ where: { id: { in: ids } } });
    let updated = 0;
    let skipped = 0;
    for (const task of tasks) {
      const disabledReason = getHandoverStatusTransitionDisabledReason(task.status, status as string);
      if (disabledReason) {
        skipped += 1;
        continue;
      }
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
          type: `bulk_status_${status}`,
          message,
          payload: { previousStatus: task.status, nextStatus: status },
          createdById: admin.id,
        },
      });
      await writeAdminAuditEvent({
        tx,
        actorId: admin.id,
        module: "handover",
        action: "bulk_update_status",
        targetType: "HandoverTask",
        targetId: task.id,
        summary: `Bulk status update moved ${task.taskNumber} to ${status}.`,
        metadata: { previousStatus: task.status, nextStatus: status },
      });
      updated += 1;
    }
    skipped += Math.max(0, ids.length - tasks.length);
    return { updated, skipped };
  });

  revalidateHandover();
  if (!result.updated) handoverRedirect({ error: `No selected tasks could move to ${status}; ${result.skipped} skipped.` }, returnTo);
  handoverRedirect({
    notice: `${result.updated} task${result.updated === 1 ? "" : "s"} moved to ${status}${result.skipped ? `; ${result.skipped} skipped` : ""}.`,
  }, returnTo);
}

export async function bulkAssignHandoverTasksAction(formData: FormData) {
  const admin = await requireAdmin();
  const returnTo = readString(formData, "returnTo", 2000);
  const ids = readHandoverIds(formData);
  const assignedToId = readString(formData, "assignedToId", 80);
  if (!ids.length) handoverRedirect({ error: "Select at least one handover task." }, returnTo);

  const assignee = assignedToId
    ? await prisma.user.findFirst({ where: { id: assignedToId, role: { contains: "admin", mode: "insensitive" } }, select: { id: true, email: true, firstName: true, lastName: true } })
    : null;
  if (assignedToId && !assignee) handoverRedirect({ error: "Assigned admin was not found." }, returnTo);

  const result = await prisma.$transaction(async (tx) => {
    const tasks = await tx.handoverTask.findMany({ where: { id: { in: ids }, status: { not: "cancelled" } } });
    for (const task of tasks) {
      await tx.handoverTask.update({
        where: { id: task.id },
        data: { assignedToId: assignedToId ?? null, updatedById: admin.id },
      });
      await tx.handoverEvent.create({
        data: {
          handoverTaskId: task.id,
          type: assignedToId ? "task_assigned" : "task_unassigned",
          message: assignedToId ? "Handover task assigned." : "Handover task assignment cleared.",
          payload: { assignedToId },
          createdById: admin.id,
        },
      });
      await writeAdminAuditEvent({
        tx,
        actorId: admin.id,
        module: "handover",
        action: assignedToId ? "assign_task" : "clear_assignment",
        targetType: "HandoverTask",
        targetId: task.id,
        summary: assignedToId ? `Handover task ${task.taskNumber} assigned.` : `Handover task ${task.taskNumber} assignment cleared.`,
        metadata: { assignedToId },
      });
    }
    return { updated: tasks.length, skipped: Math.max(0, ids.length - tasks.length) };
  });

  revalidateHandover();
  handoverRedirect({
    notice: `${result.updated} task${result.updated === 1 ? "" : "s"} ${assignedToId ? "assigned" : "unassigned"}${result.skipped ? `; ${result.skipped} skipped` : ""}.`,
  }, returnTo);
}

export async function updateHandoverChecklistAction(formData: FormData) {
  const admin = await requireAdmin();
  const returnTo = readString(formData, "returnTo", 2000);
  const taskId = readString(formData, "handoverId", 80);
  if (!taskId) handoverRedirect({ error: "Task id is required." }, returnTo);

  const task = await prisma.handoverTask.findUnique({ where: { id: taskId } });
  if (!task) handoverRedirect({ error: "Handover task not found." }, returnTo);
  if (task.status === "cancelled") handoverRedirect({ error: "Cancelled task checklist cannot be edited.", handoverId: task.id }, returnTo);

  const labels = formData
    .getAll("checklistLabel")
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 30);
  const done = new Set(
    formData
      .getAll("checklistDone")
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
  );
  assertSafeOperationalText(labels, returnTo);
  const sourceItems = labels.length
    ? labels.map((label) => ({ label, done: done.has(label) }))
    : normalizeHandoverChecklist(task.checklist, task.type);
  const nextChecklist = sourceItems.map((item) => ({ label: item.label, done: labels.length ? done.has(item.label) : item.done }));

  await prisma.$transaction(async (tx) => {
    await tx.handoverTask.update({
      where: { id: task.id },
      data: { checklist: nextChecklist, updatedById: admin.id },
    });
    await tx.handoverEvent.create({
      data: {
        handoverTaskId: task.id,
        type: "checklist_updated",
        message: "Handover checklist updated.",
        payload: {
          total: nextChecklist.length,
          done: nextChecklist.filter((item) => item.done).length,
        },
        createdById: admin.id,
      },
    });
    await writeAdminAuditEvent({
      tx,
      actorId: admin.id,
      module: "handover",
      action: "update_checklist",
      targetType: "HandoverTask",
      targetId: task.id,
      summary: `Checklist updated for handover task ${task.taskNumber}.`,
      metadata: { total: nextChecklist.length, done: nextChecklist.filter((item) => item.done).length },
    });
  });

  revalidateHandover();
  handoverRedirect({ notice: "Checklist updated.", handoverId: task.id }, returnTo);
}

export async function reportHandoverIssueAction(formData: FormData) {
  const admin = await requireAdmin();
  const returnTo = readString(formData, "returnTo", 2000);
  const taskId = readString(formData, "handoverId", 80);
  const issueSummary = readString(formData, "issueSummary", 2000);
  const priority = readString(formData, "priority", 20) ?? "high";
  const createDispute = readString(formData, "createDispute", 10) === "on";
  if (!taskId) handoverRedirect({ error: "Task id is required." }, returnTo);
  if (!issueSummary) handoverRedirect({ error: "Issue summary is required.", handoverId: taskId }, returnTo);
  if (!HANDOVER_PRIORITIES.includes(priority as any)) handoverRedirect({ error: "Valid issue priority is required.", handoverId: taskId }, returnTo);
  assertSafeOperationalText([issueSummary], returnTo);

  const task = await prisma.handoverTask.findUnique({ where: { id: taskId } });
  if (!task) handoverRedirect({ error: "Handover task not found." }, returnTo);

  const result = await prisma.$transaction(async (tx) => {
    await tx.handoverTask.update({
      where: { id: task.id },
      data: { status: "issue_reported", priority, updatedById: admin.id },
    });
    await tx.handoverEvent.create({
      data: {
        handoverTaskId: task.id,
        type: "issue_reported",
        message: issueSummary,
        payload: { previousStatus: task.status, priority },
        createdById: admin.id,
      },
    });
    await writeAdminAuditEvent({
      tx,
      actorId: admin.id,
      module: "handover",
      action: "report_issue",
      targetType: "HandoverTask",
      targetId: task.id,
      summary: `Issue reported for handover task ${task.taskNumber}.`,
      metadata: { previousStatus: task.status, priority },
    });

    if (!createDispute) return { disputeNumber: null as string | null };

    const dispute = await tx.disputeCase.create({
      data: {
        caseNumber: createDisputeCaseNumber(),
        type: "handover_issue",
        status: "open",
        priority,
        reservationId: task.reservationId,
        propertyId: task.propertyId,
        guestId: task.guestId,
        partnerId: task.partnerId,
        title: `Handover issue - ${task.taskNumber}`,
        summary: issueSummary,
        createdById: admin.id,
        updatedById: admin.id,
      },
    });
    await tx.disputeEvent.create({
      data: {
        disputeCaseId: dispute.id,
        type: "created_from_handover_issue",
        message: `Dispute opened from handover task ${task.taskNumber}.`,
        payload: { handoverTaskId: task.id, taskNumber: task.taskNumber },
        createdById: admin.id,
      },
    });
    await tx.handoverEvent.create({
      data: {
        handoverTaskId: task.id,
        type: "linked_dispute_created",
        message: `Linked dispute ${dispute.caseNumber} created.`,
        payload: { disputeCaseId: dispute.id, caseNumber: dispute.caseNumber },
        createdById: admin.id,
      },
    });
    await writeAdminAuditEvent({
      tx,
      actorId: admin.id,
      module: "handover",
      action: "create_dispute_from_issue",
      targetType: "DisputeCase",
      targetId: dispute.id,
      summary: `Dispute ${dispute.caseNumber} opened from handover task ${task.taskNumber}.`,
      metadata: { handoverTaskId: task.id },
    });
    return { disputeNumber: dispute.caseNumber };
  });

  revalidateHandover();
  handoverRedirect({
    notice: result.disputeNumber
      ? `Issue reported and dispute ${result.disputeNumber} opened.`
      : "Issue reported.",
    handoverId: task.id,
  }, returnTo);
}

export async function createDisputeFromHandoverAction(formData: FormData) {
  const admin = await requireAdmin();
  const returnTo = readString(formData, "returnTo", 2000);
  const taskId = readString(formData, "handoverId", 80) ?? readString(formData, "taskId", 80);
  const title = readString(formData, "title", 180);
  const summary = readString(formData, "summary", 2000);
  const priority = readString(formData, "priority", 20) ?? "high";
  if (!taskId) handoverRedirect({ error: "Task id is required." }, returnTo);
  if (!title) handoverRedirect({ error: "Dispute title is required.", handoverId: taskId }, returnTo);
  if (!summary) handoverRedirect({ error: "Dispute summary is required.", handoverId: taskId }, returnTo);
  if (!HANDOVER_PRIORITIES.includes(priority as any)) handoverRedirect({ error: "Valid dispute priority is required.", handoverId: taskId }, returnTo);
  assertSafeOperationalText([title, summary], returnTo);

  const task = await prisma.handoverTask.findUnique({ where: { id: taskId } });
  if (!task) handoverRedirect({ error: "Handover task not found." }, returnTo);

  const dispute = await prisma.$transaction(async (tx) => {
    await tx.handoverTask.update({
      where: { id: task.id },
      data: { status: "issue_reported", priority, updatedById: admin.id },
    });
    await tx.handoverEvent.create({
      data: {
        handoverTaskId: task.id,
        type: "issue_dispute_opened",
        message: "Linked dispute opened from handover task.",
        payload: { previousStatus: task.status, priority },
        createdById: admin.id,
      },
    });
    const created = await tx.disputeCase.create({
      data: {
        caseNumber: createDisputeCaseNumber(),
        type: "handover_issue",
        status: "open",
        priority,
        reservationId: task.reservationId,
        propertyId: task.propertyId,
        guestId: task.guestId,
        partnerId: task.partnerId,
        title,
        summary,
        createdById: admin.id,
        updatedById: admin.id,
      },
    });
    await tx.disputeEvent.create({
      data: {
        disputeCaseId: created.id,
        type: "created_from_handover",
        message: `Dispute opened from handover task ${task.taskNumber}.`,
        payload: { handoverTaskId: task.id, taskNumber: task.taskNumber },
        createdById: admin.id,
      },
    });
    await writeAdminAuditEvent({
      tx,
      actorId: admin.id,
      module: "handover",
      action: "create_dispute_from_task",
      targetType: "DisputeCase",
      targetId: created.id,
      summary: `Dispute ${created.caseNumber} opened from handover task ${task.taskNumber}.`,
      metadata: { handoverTaskId: task.id },
    });
    return created;
  });

  revalidateHandover();
  handoverRedirect({ notice: `Dispute ${dispute.caseNumber} opened from handover task.`, handoverId: task.id }, returnTo);
}

export async function bulkCreateHandoverTasksFromUpcomingReservationsAction(formData: FormData) {
  const admin = await requireAdmin();
  const returnTo = readString(formData, "returnTo", 2000);
  const includeCheckout = readString(formData, "includeCheckout", 10) === "on";
  const now = new Date();
  const until = new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000);

  const result = await prisma.$transaction(async (tx) => {
    const reservations = await tx.reservation.findMany({
      where: { startDate: { gte: now, lte: until } },
      orderBy: { startDate: "asc" },
      take: 300,
      select: {
        id: true,
        startDate: true,
        endDate: true,
        bookingStatus: true,
        userId: true,
        homeId: true,
        listingTitleSnapshot: true,
        Home: { select: { userId: true, approvedTitle: true, title: true, city: true } },
      },
    });
    const reservationIds = reservations.map((reservation) => reservation.id);
    const [settledPayments, existingTasks] = await Promise.all([
      tx.paymentRecord.findMany({
        where: { reservationId: { in: reservationIds }, status: { in: PAYMENT_SETTLED_STATUSES } },
        select: { reservationId: true },
        distinct: ["reservationId"],
      }),
      tx.handoverTask.findMany({
        where: { reservationId: { in: reservationIds }, status: { not: "cancelled" } },
        select: { reservationId: true, type: true },
      }),
    ]);
    const paidReservationIds = new Set(settledPayments.map((payment) => payment.reservationId).filter(Boolean) as string[]);
    const existingByReservationType = new Set(existingTasks.map((task) => `${task.reservationId}:${task.type}`));
    let created = 0;
    let skippedExisting = 0;
    let skippedInvalid = 0;
    const errors: string[] = [];

    for (const reservation of reservations) {
      if (!["confirmed", "reserved"].includes(reservation.bookingStatus) || !paidReservationIds.has(reservation.id)) {
        skippedInvalid += 1;
        continue;
      }

      const taskSpecs = [
        {
          type: "check_in",
          scheduledFor: reservation.startDate,
          title: `Arrival readiness for ${reservation.listingTitleSnapshot ?? reservation.Home?.approvedTitle ?? reservation.Home?.title ?? reservation.id}`,
          summary: "Arrival readiness task created from a real confirmed or reserved paid reservation.",
        },
        ...(includeCheckout
          ? [{
              type: "check_out",
              scheduledFor: reservation.endDate,
              title: `Checkout readiness for ${reservation.listingTitleSnapshot ?? reservation.Home?.approvedTitle ?? reservation.Home?.title ?? reservation.id}`,
              summary: "Checkout readiness task created from a real confirmed or reserved paid reservation.",
            }]
          : []),
      ];

      for (const spec of taskSpecs) {
        if (existingByReservationType.has(`${reservation.id}:${spec.type}`)) {
          skippedExisting += 1;
          continue;
        }
        try {
          const task = await tx.handoverTask.create({
            data: {
              taskNumber: `${createHandoverTaskNumber()}-${created + 1}`,
              reservationId: reservation.id,
              propertyId: reservation.homeId,
              guestId: reservation.userId,
              partnerId: reservation.Home?.userId ?? null,
              type: spec.type,
              status: "pending_preparation",
              priority: "medium",
              scheduledFor: spec.scheduledFor,
              title: spec.title,
              summary: spec.summary,
              checklist: getDefaultHandoverChecklist(spec.type),
              createdById: admin.id,
              updatedById: admin.id,
            },
          });
          await tx.handoverEvent.create({
            data: {
              handoverTaskId: task.id,
              type: "bulk_task_created_from_reservation",
              message: "Handover task created from upcoming paid reservation.",
              payload: { reservationId: reservation.id, type: spec.type },
              createdById: admin.id,
            },
          });
          await writeAdminAuditEvent({
            tx,
            actorId: admin.id,
            module: "handover",
            action: "bulk_create_from_upcoming_reservations",
            targetType: "HandoverTask",
            targetId: task.id,
            summary: `Handover task ${task.taskNumber} created from upcoming reservation.`,
            metadata: { reservationId: reservation.id, type: spec.type },
          });
          existingByReservationType.add(`${reservation.id}:${spec.type}`);
          created += 1;
        } catch (error) {
          errors.push(error instanceof Error ? error.message.slice(0, 120) : "Unknown task creation error.");
        }
      }
    }

    await writeAdminAuditEvent({
      tx,
      actorId: admin.id,
      module: "handover",
      action: "bulk_create_from_upcoming_reservations_report",
      targetType: "HandoverTask",
      targetId: null,
      summary: `Bulk handover creation report: ${created} created, ${skippedExisting} existing, ${skippedInvalid} invalid/cancelled/payment-not-ready, ${errors.length} errors.`,
      metadata: { created, skippedExisting, skippedInvalid, errors },
    });

    return { created, skippedExisting, skippedInvalid, errors };
  });

  revalidateHandover();
  if (!result.created) {
    handoverRedirect({
      error: `No tasks created. ${result.skippedExisting} skipped existing; ${result.skippedInvalid} skipped invalid/cancelled/payment-not-ready; ${result.errors.length} errors.`,
    }, returnTo);
  }
  handoverRedirect({
    notice: `${result.created} task${result.created === 1 ? "" : "s"} created. ${result.skippedExisting} skipped existing; ${result.skippedInvalid} skipped invalid/cancelled/payment-not-ready; ${result.errors.length} errors.`,
  }, returnTo);
}
