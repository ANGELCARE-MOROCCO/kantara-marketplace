"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { requireAdmin } from "@/app/lib/auth";
import prisma from "@/app/lib/db";
import { writeAdminAuditEvent } from "@/app/lib/audit";
import {
  DISPUTE_OUTCOMES,
  DISPUTE_PRIORITIES,
  DISPUTE_SOURCE_TYPES,
  DISPUTE_STATUSES,
  DISPUTE_TYPES,
  EVIDENCE_QUALITY_LEVELS,
  createDisputeCaseNumber,
} from "@/app/lib/disputeOperations";
import {
  isDisputeStatusTransitionAllowed,
  normalizeDisputeOutcome,
  normalizeEvidenceQuality,
} from "@/app/lib/disputeIntelligence";
import { VERIFICATION_CATEGORIES, VERIFICATION_ENTITY_TYPES } from "@/app/lib/verificationOperations";

type LinkedContext = {
  reservationId: string | null;
  paymentRecordId: string | null;
  propertyId: string | null;
  guestId: string | null;
  partnerId: string | null;
  verificationId: string | null;
  handoverId: string | null;
  sourceLabel: string;
};

function readString(formData: FormData, key: string, maxLength = 2000) {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function readDisputeIds(formData: FormData) {
  const fromCsv = readString(formData, "disputeIds", 12000)
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean) ?? [];
  const fromFields = formData
    .getAll("disputeId")
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
  return Array.from(new Set([...fromCsv, ...fromFields])).slice(0, 250);
}

function disputesRedirect(params: Record<string, string | null | undefined> = {}, returnTo?: string | null): never {
  const fallback = "/admin/disputes";
  const safeReturnTo = returnTo?.startsWith("/admin/disputes") ? returnTo : fallback;
  const url = new URL(safeReturnTo, "https://kantara.local");
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  });
  redirect(`${url.pathname}${url.search}`);
}

function revalidateDisputes() {
  revalidatePath("/admin");
  revalidatePath("/admin/disputes");
  revalidatePath("/admin/marketplace-operations");
  revalidatePath("/admin/bookings");
  revalidatePath("/admin/payments");
  revalidatePath("/admin/handover");
  revalidatePath("/admin/verifications");
}

function containsSensitiveDisputeData(value?: string | null) {
  if (!value) return false;
  return [
    /\b(?:\d[ -]*?){13,19}\b/,
    /\bcvv\b|\bcvc\b|\bcard\s*number\b/i,
    /\bpassport\s*(number|no\.?|#)?\b/i,
    /\b(id|identity)\s*(number|no\.?|#)\b/i,
    /\b(raw|full)\s+(document|passport|id)\b/i,
    /(door|gate|garage|alarm|lockbox|keypad|entry|access)\s*(code|pin|password)/i,
    /(code|pin|password)\s*[:#-]?\s*\d{3,}/i,
    /private\s+access\s+instructions?/i,
    /paypal\s+secret/i,
    /\bpassword\b/i,
  ].some((pattern) => pattern.test(value));
}

function assertSafeDisputeText(fields: (string | null | undefined)[], returnTo?: string | null): void {
  if (fields.some((field) => containsSensitiveDisputeData(field))) {
    disputesRedirect({
      error: "Do not store sensitive payment, identity, or access-code data in dispute records.",
    }, returnTo);
  }
}

function isConfirmed(formData: FormData, key = "confirmation") {
  return readString(formData, key, 20) === "on" || readString(formData, key, 20) === "true";
}

function emptyContext(sourceLabel = "Manual exception"): LinkedContext {
  return {
    reservationId: null,
    paymentRecordId: null,
    propertyId: null,
    guestId: null,
    partnerId: null,
    verificationId: null,
    handoverId: null,
    sourceLabel,
  };
}

async function resolveLinkedContext(formData: FormData, returnTo?: string | null): Promise<LinkedContext> {
  const sourceType = readString(formData, "sourceType", 40);
  const sourceId = readString(formData, "sourceId", 120);
  const explicitContext = {
    reservationId: readString(formData, "reservationId", 80),
    paymentRecordId: readString(formData, "paymentRecordId", 80),
    propertyId: readString(formData, "propertyId", 80),
    guestId: readString(formData, "guestId", 80),
    partnerId: readString(formData, "partnerId", 80),
  };

  if (sourceType && !DISPUTE_SOURCE_TYPES.includes(sourceType as any)) {
    disputesRedirect({ error: "Valid linked source type is required." }, returnTo);
  }

  if (sourceType === "reservation") {
    if (!sourceId) disputesRedirect({ error: "Reservation source is required." }, returnTo);
    const reservation = await prisma.reservation.findUnique({
      where: { id: sourceId },
      select: { id: true, userId: true, homeId: true, Home: { select: { userId: true } } },
    });
    if (!reservation) disputesRedirect({ error: "Reservation source was not found." }, returnTo);
    return {
      ...emptyContext(`Reservation ${reservation.id.slice(0, 8).toUpperCase()}`),
      reservationId: reservation.id,
      propertyId: reservation.homeId,
      guestId: reservation.userId,
      partnerId: reservation.Home?.userId ?? null,
    };
  }

  if (sourceType === "payment") {
    if (!sourceId) disputesRedirect({ error: "Payment source is required." }, returnTo);
    const payment = await prisma.paymentRecord.findUnique({
      where: { id: sourceId },
      select: { id: true, reservationId: true, guestId: true, propertyId: true, partnerId: true },
    });
    if (!payment) disputesRedirect({ error: "Payment source was not found." }, returnTo);
    return {
      ...emptyContext(`Payment ${payment.id.slice(0, 8).toUpperCase()}`),
      paymentRecordId: payment.id,
      reservationId: payment.reservationId,
      propertyId: payment.propertyId,
      guestId: payment.guestId,
      partnerId: payment.partnerId,
    };
  }

  if (sourceType === "handover") {
    if (!sourceId) disputesRedirect({ error: "Handover task source is required." }, returnTo);
    const task = await prisma.handoverTask.findUnique({
      where: { id: sourceId },
      select: { id: true, taskNumber: true, reservationId: true, propertyId: true, guestId: true, partnerId: true },
    });
    if (!task) disputesRedirect({ error: "Handover task source was not found." }, returnTo);
    return {
      ...emptyContext(`Handover ${task.taskNumber}`),
      handoverId: task.id,
      reservationId: task.reservationId,
      propertyId: task.propertyId,
      guestId: task.guestId,
      partnerId: task.partnerId,
    };
  }

  if (sourceType === "guest") {
    if (!sourceId) disputesRedirect({ error: "Guest source is required." }, returnTo);
    const guest = await prisma.user.findUnique({ where: { id: sourceId }, select: { id: true, email: true } });
    if (!guest) disputesRedirect({ error: "Guest source was not found." }, returnTo);
    return { ...emptyContext(`Guest ${guest.email}`), guestId: guest.id };
  }

  if (sourceType === "property") {
    if (!sourceId) disputesRedirect({ error: "Property source is required." }, returnTo);
    const property = await prisma.home.findUnique({ where: { id: sourceId }, select: { id: true, userId: true, approvedTitle: true, title: true } });
    if (!property) disputesRedirect({ error: "Property source was not found." }, returnTo);
    return { ...emptyContext(`Property ${property.approvedTitle ?? property.title ?? property.id}`), propertyId: property.id, partnerId: property.userId };
  }

  if (sourceType === "partner") {
    if (!sourceId) disputesRedirect({ error: "Partner source is required." }, returnTo);
    const partner = await prisma.user.findUnique({ where: { id: sourceId }, select: { id: true, email: true } });
    if (!partner) disputesRedirect({ error: "Partner source was not found." }, returnTo);
    return { ...emptyContext(`Partner ${partner.email}`), partnerId: partner.id };
  }

  if (sourceType === "verification") {
    if (!sourceId) disputesRedirect({ error: "Verification source is required." }, returnTo);
    const record = await prisma.verificationRecord.findUnique({
      where: { id: sourceId },
      select: { id: true, entityType: true, entityId: true, title: true },
    });
    if (!record) disputesRedirect({ error: "Verification source was not found." }, returnTo);
    const context = emptyContext(`Verification ${record.id.slice(0, 8).toUpperCase()}`);
    context.verificationId = record.id;
    if (record.entityType === "guest") context.guestId = record.entityId;
    if (record.entityType === "property") context.propertyId = record.entityId;
    if (record.entityType === "partner") context.partnerId = record.entityId;
    if (record.entityType === "payment") context.paymentRecordId = record.entityId;
    if (record.entityType === "handover") {
      context.handoverId = record.entityId;
      const task = await prisma.handoverTask.findUnique({
        where: { id: record.entityId },
        select: { reservationId: true, propertyId: true, guestId: true, partnerId: true },
      });
      if (task) {
        context.reservationId = task.reservationId;
        context.propertyId = task.propertyId;
        context.guestId = task.guestId;
        context.partnerId = task.partnerId;
      }
    }
    return context;
  }

  if (sourceType === "manual_exception") return emptyContext();

  if (explicitContext.paymentRecordId) {
    const payment = await prisma.paymentRecord.findUnique({
      where: { id: explicitContext.paymentRecordId },
      select: { id: true, reservationId: true, guestId: true, propertyId: true, partnerId: true },
    });
    return {
      ...emptyContext(`Payment ${explicitContext.paymentRecordId.slice(0, 8).toUpperCase()}`),
      paymentRecordId: explicitContext.paymentRecordId,
      reservationId: explicitContext.reservationId ?? payment?.reservationId ?? null,
      propertyId: explicitContext.propertyId ?? payment?.propertyId ?? null,
      guestId: explicitContext.guestId ?? payment?.guestId ?? null,
      partnerId: explicitContext.partnerId ?? payment?.partnerId ?? null,
    };
  }

  if (explicitContext.reservationId || explicitContext.propertyId || explicitContext.guestId || explicitContext.partnerId) {
    const reservation = explicitContext.reservationId
      ? await prisma.reservation.findUnique({
          where: { id: explicitContext.reservationId },
          select: { userId: true, homeId: true, Home: { select: { userId: true } } },
        })
      : null;
    return {
      ...emptyContext(explicitContext.reservationId ? `Reservation ${explicitContext.reservationId.slice(0, 8).toUpperCase()}` : "Linked source"),
      reservationId: explicitContext.reservationId,
      propertyId: explicitContext.propertyId ?? reservation?.homeId ?? null,
      guestId: explicitContext.guestId ?? reservation?.userId ?? null,
      partnerId: explicitContext.partnerId ?? reservation?.Home?.userId ?? null,
    };
  }

  return emptyContext();
}

function evidencePayloadFromForm(formData: FormData) {
  const evidenceQuality = normalizeEvidenceQuality(readString(formData, "evidenceQuality", 40));
  return {
    guestStatementSummary: readString(formData, "guestStatementSummary", 1500),
    partnerStatementSummary: readString(formData, "partnerStatementSummary", 1500),
    internalObservation: readString(formData, "internalObservation", 1500),
    operationalEvidenceSummary: readString(formData, "operationalEvidenceSummary", 1500),
    supportingReferences: readString(formData, "supportingReferences", 1500),
    missingEvidence: readString(formData, "missingEvidence", 1500),
    evidenceQuality,
  };
}

async function latestResolutionExists(disputeId: string, resolution: string | null) {
  if (resolution) return true;
  const event = await prisma.disputeEvent.findFirst({
    where: { disputeCaseId: disputeId, type: "case_resolved_structured" },
    select: { id: true },
  });
  return Boolean(event);
}

export async function createDisputeCaseAction(formData: FormData) {
  const admin = await requireAdmin();
  const returnTo = readString(formData, "returnTo", 2000);
  const type = readString(formData, "type", 40);
  const priority = readString(formData, "priority", 20);
  const title = readString(formData, "title", 180);
  const summary = readString(formData, "summary", 2000);
  const manualReason = readString(formData, "manualReason", 1000);
  const requestedStatus = readString(formData, "initialStatus", 40) ?? "open";

  if (!DISPUTE_TYPES.includes(type as any)) disputesRedirect({ error: "Valid dispute type is required." }, returnTo);
  if (!DISPUTE_PRIORITIES.includes(priority as any)) disputesRedirect({ error: "Valid priority is required." }, returnTo);
  if (!title || !summary) disputesRedirect({ error: "Title and summary are required." }, returnTo);
  if (!["open", "under_review"].includes(requestedStatus)) disputesRedirect({ error: "New disputes must start open or under review." }, returnTo);

  const context = await resolveLinkedContext(formData, returnTo);
  const missingLinkedSource = !context.reservationId && !context.paymentRecordId && !context.propertyId && !context.guestId && !context.partnerId;
  if (missingLinkedSource && !manualReason) {
    disputesRedirect({ error: "Manual unlinked incidents require a reason for no linked source." }, returnTo);
  }

  const evidence = evidencePayloadFromForm(formData);
  assertSafeDisputeText([
    title,
    summary,
    manualReason,
    evidence.guestStatementSummary,
    evidence.partnerStatementSummary,
    evidence.internalObservation,
    evidence.operationalEvidenceSummary,
    evidence.supportingReferences,
    evidence.missingEvidence,
  ], returnTo);

  const dispute = await prisma.$transaction(async (tx) => {
    const created = await tx.disputeCase.create({
      data: {
        caseNumber: createDisputeCaseNumber(),
        type: type as string,
        priority: priority as string,
        status: requestedStatus,
        reservationId: context.reservationId,
        paymentRecordId: context.paymentRecordId,
        propertyId: context.propertyId,
        guestId: context.guestId,
        partnerId: context.partnerId,
        title,
        summary,
        assignedToId: readString(formData, "assignedToId", 80),
        createdById: admin.id,
        updatedById: admin.id,
      },
    });
    await tx.disputeEvent.create({
      data: {
        disputeCaseId: created.id,
        type: missingLinkedSource ? "manual_exception_created" : "case_created_from_linked_source",
        message: missingLinkedSource
          ? "Manual exception dispute created with missing linked source."
          : `Dispute case created from ${context.sourceLabel}.`,
        payload: {
          sourceType: readString(formData, "sourceType", 40) ?? "explicit_context",
          sourceId: readString(formData, "sourceId", 120),
          sourceLabel: context.sourceLabel,
          manualReason,
          handoverId: context.handoverId,
          verificationId: context.verificationId,
        },
        createdById: admin.id,
      },
    });
    if (evidence.guestStatementSummary || evidence.partnerStatementSummary || evidence.internalObservation || evidence.operationalEvidenceSummary || evidence.supportingReferences || evidence.missingEvidence) {
      await tx.disputeEvent.create({
        data: {
          disputeCaseId: created.id,
          type: "evidence_summary_updated",
          message: "Safe evidence summary recorded at intake.",
          payload: evidence,
          createdById: admin.id,
        },
      });
    }
    await writeAdminAuditEvent({
      tx,
      actorId: admin.id,
      module: "disputes",
      action: "create_dispute_case",
      targetType: "DisputeCase",
      targetId: created.id,
      summary: `Dispute ${created.caseNumber} created.`,
      metadata: { type, priority, sourceLabel: context.sourceLabel, missingLinkedSource },
    });
    return created;
  });

  revalidateDisputes();
  disputesRedirect({ notice: `Dispute ${dispute.caseNumber} created.`, disputeId: dispute.id }, returnTo);
}

export async function assignDisputeAction(formData: FormData) {
  const admin = await requireAdmin();
  const returnTo = readString(formData, "returnTo", 2000);
  const disputeId = readString(formData, "disputeId", 80);
  const assignedToId = readString(formData, "assignedToId", 80);
  if (!disputeId) disputesRedirect({ error: "Dispute id is required." }, returnTo);

  const [dispute, assignee] = await Promise.all([
    prisma.disputeCase.findUnique({ where: { id: disputeId } }),
    assignedToId
      ? prisma.user.findFirst({ where: { id: assignedToId, role: { contains: "admin", mode: "insensitive" } }, select: { id: true, email: true } })
      : null,
  ]);
  if (!dispute) disputesRedirect({ error: "Dispute not found." }, returnTo);
  if (assignedToId && !assignee) disputesRedirect({ error: "Assignee must be an admin user.", disputeId }, returnTo);

  await prisma.$transaction(async (tx) => {
    await tx.disputeCase.update({
      where: { id: dispute.id },
      data: { assignedToId: assignee?.id ?? null, updatedById: admin.id },
    });
    await tx.disputeEvent.create({
      data: {
        disputeCaseId: dispute.id,
        type: assignee ? "assigned" : "assignment_cleared",
        message: assignee ? `Assigned to ${assignee.email}.` : "Assignment cleared.",
        payload: { previousAssignedToId: dispute.assignedToId, assignedToId: assignee?.id ?? null },
        createdById: admin.id,
      },
    });
    await writeAdminAuditEvent({
      tx,
      actorId: admin.id,
      module: "disputes",
      action: assignee ? "assign_dispute" : "clear_dispute_assignment",
      targetType: "DisputeCase",
      targetId: dispute.id,
      summary: assignee ? `Dispute ${dispute.caseNumber} assigned.` : `Dispute ${dispute.caseNumber} assignment cleared.`,
      metadata: { assignedToId: assignee?.id ?? null },
    });
  });

  revalidateDisputes();
  disputesRedirect({ notice: assignee ? "Dispute assigned." : "Assignment cleared.", disputeId: dispute.id }, returnTo);
}

export async function bulkAssignDisputesAction(formData: FormData) {
  const admin = await requireAdmin();
  const returnTo = readString(formData, "returnTo", 2000);
  const ids = readDisputeIds(formData);
  const assignedToId = readString(formData, "assignedToId", 80);
  if (!ids.length) disputesRedirect({ error: "Select at least one dispute case." }, returnTo);
  const assignee = assignedToId
    ? await prisma.user.findFirst({ where: { id: assignedToId, role: { contains: "admin", mode: "insensitive" } }, select: { id: true, email: true } })
    : null;
  if (assignedToId && !assignee) disputesRedirect({ error: "Assignee must be an admin user." }, returnTo);

  const result = await prisma.$transaction(async (tx) => {
    const cases = await tx.disputeCase.findMany({ where: { id: { in: ids }, status: { not: "closed" } } });
    for (const dispute of cases) {
      await tx.disputeCase.update({
        where: { id: dispute.id },
        data: { assignedToId: assignee?.id ?? null, updatedById: admin.id },
      });
      await tx.disputeEvent.create({
        data: {
          disputeCaseId: dispute.id,
          type: assignee ? "bulk_assigned" : "bulk_assignment_cleared",
          message: assignee ? `Bulk assigned to ${assignee.email}.` : "Bulk assignment cleared.",
          payload: { assignedToId: assignee?.id ?? null },
          createdById: admin.id,
        },
      });
      await writeAdminAuditEvent({
        tx,
        actorId: admin.id,
        module: "disputes",
        action: assignee ? "bulk_assign_dispute" : "bulk_clear_assignment",
        targetType: "DisputeCase",
        targetId: dispute.id,
        summary: `Bulk assignment updated for dispute ${dispute.caseNumber}.`,
        metadata: { assignedToId: assignee?.id ?? null },
      });
    }
    return { updated: cases.length, skipped: Math.max(0, ids.length - cases.length) };
  });

  revalidateDisputes();
  disputesRedirect({
    notice: `${result.updated} dispute${result.updated === 1 ? "" : "s"} assigned${result.skipped ? `; ${result.skipped} skipped` : ""}.`,
  }, returnTo);
}

export async function bulkMarkDisputesUnderReviewAction(formData: FormData) {
  const admin = await requireAdmin();
  const returnTo = readString(formData, "returnTo", 2000);
  const ids = readDisputeIds(formData);
  if (!ids.length) disputesRedirect({ error: "Select at least one dispute case." }, returnTo);

  const result = await prisma.$transaction(async (tx) => {
    const cases = await tx.disputeCase.findMany({ where: { id: { in: ids } } });
    let updated = 0;
    let skipped = 0;
    for (const dispute of cases) {
      const reason = isDisputeStatusTransitionAllowed(dispute.status, "under_review");
      if (reason) {
        skipped += 1;
        continue;
      }
      await tx.disputeCase.update({
        where: { id: dispute.id },
        data: { status: "under_review", updatedById: admin.id },
      });
      await tx.disputeEvent.create({
        data: {
          disputeCaseId: dispute.id,
          type: "bulk_status_under_review",
          message: "Bulk marked under review from dispute command center.",
          payload: { previousStatus: dispute.status, nextStatus: "under_review" },
          createdById: admin.id,
        },
      });
      await writeAdminAuditEvent({
        tx,
        actorId: admin.id,
        module: "disputes",
        action: "bulk_mark_under_review",
        targetType: "DisputeCase",
        targetId: dispute.id,
        summary: `Dispute ${dispute.caseNumber} marked under review.`,
        metadata: { previousStatus: dispute.status },
      });
      updated += 1;
    }
    skipped += Math.max(0, ids.length - cases.length);
    return { updated, skipped };
  });

  revalidateDisputes();
  if (!result.updated) disputesRedirect({ error: `No selected cases could be marked under review; ${result.skipped} skipped.` }, returnTo);
  disputesRedirect({
    notice: `${result.updated} case${result.updated === 1 ? "" : "s"} marked under review${result.skipped ? `; ${result.skipped} skipped` : ""}.`,
  }, returnTo);
}

export async function bulkRequestAdminFollowupAction(formData: FormData) {
  const admin = await requireAdmin();
  const returnTo = readString(formData, "returnTo", 2000);
  const ids = readDisputeIds(formData);
  const message = readString(formData, "message", 1000) ?? "Admin follow-up requested from dispute command center.";
  if (!ids.length) disputesRedirect({ error: "Select at least one dispute case." }, returnTo);
  assertSafeDisputeText([message], returnTo);

  const result = await prisma.$transaction(async (tx) => {
    const cases = await tx.disputeCase.findMany({ where: { id: { in: ids }, status: { not: "closed" } } });
    for (const dispute of cases) {
      await tx.disputeCase.update({
        where: { id: dispute.id },
        data: { status: "awaiting_admin", updatedById: admin.id },
      });
      await tx.disputeEvent.create({
        data: {
          disputeCaseId: dispute.id,
          type: "admin_followup_requested",
          message,
          payload: { previousStatus: dispute.status },
          createdById: admin.id,
        },
      });
      await writeAdminAuditEvent({
        tx,
        actorId: admin.id,
        module: "disputes",
        action: "request_admin_followup",
        targetType: "DisputeCase",
        targetId: dispute.id,
        summary: `Admin follow-up requested for dispute ${dispute.caseNumber}.`,
        metadata: { previousStatus: dispute.status },
      });
    }
    return { updated: cases.length, skipped: Math.max(0, ids.length - cases.length) };
  });

  revalidateDisputes();
  disputesRedirect({
    notice: `${result.updated} case${result.updated === 1 ? "" : "s"} moved to admin follow-up${result.skipped ? `; ${result.skipped} skipped` : ""}.`,
  }, returnTo);
}

export async function updateDisputePriorityAction(formData: FormData) {
  const admin = await requireAdmin();
  const returnTo = readString(formData, "returnTo", 2000);
  const disputeId = readString(formData, "disputeId", 80);
  const priority = readString(formData, "priority", 20);
  const message = readString(formData, "message", 1000) ?? "Dispute priority updated.";
  if (!disputeId) disputesRedirect({ error: "Dispute id is required." }, returnTo);
  if (!DISPUTE_PRIORITIES.includes(priority as any)) disputesRedirect({ error: "Valid priority is required.", disputeId }, returnTo);
  assertSafeDisputeText([message], returnTo);

  const dispute = await prisma.disputeCase.findUnique({ where: { id: disputeId } });
  if (!dispute) disputesRedirect({ error: "Dispute not found." }, returnTo);

  await prisma.$transaction(async (tx) => {
    await tx.disputeCase.update({
      where: { id: dispute.id },
      data: { priority: priority as string, updatedById: admin.id },
    });
    await tx.disputeEvent.create({
      data: {
        disputeCaseId: dispute.id,
        type: "priority_updated",
        message,
        payload: { previousPriority: dispute.priority, priority },
        createdById: admin.id,
      },
    });
    await writeAdminAuditEvent({
      tx,
      actorId: admin.id,
      module: "disputes",
      action: "update_priority",
      targetType: "DisputeCase",
      targetId: dispute.id,
      summary: `Dispute ${dispute.caseNumber} priority updated.`,
      metadata: { previousPriority: dispute.priority, priority },
    });
  });

  revalidateDisputes();
  disputesRedirect({ notice: "Dispute priority updated.", disputeId: dispute.id }, returnTo);
}

export async function requestDisputeInformationAction(formData: FormData) {
  const admin = await requireAdmin();
  const returnTo = readString(formData, "returnTo", 2000);
  const disputeId = readString(formData, "disputeId", 80);
  const party = readString(formData, "party", 40);
  const message = readString(formData, "message", 1500);
  if (!disputeId) disputesRedirect({ error: "Dispute id is required." }, returnTo);
  if (!["guest", "partner", "admin"].includes(party ?? "")) disputesRedirect({ error: "Valid information request party is required.", disputeId }, returnTo);
  if (!message) disputesRedirect({ error: "Information request message is required.", disputeId }, returnTo);
  assertSafeDisputeText([message], returnTo);

  const dispute = await prisma.disputeCase.findUnique({ where: { id: disputeId } });
  if (!dispute) disputesRedirect({ error: "Dispute not found." }, returnTo);
  if (dispute.status === "closed") disputesRedirect({ error: "Closed cases must be reopened before requesting information.", disputeId }, returnTo);

  const nextStatus = party === "guest" ? "awaiting_guest" : party === "partner" ? "awaiting_partner" : "awaiting_admin";
  await prisma.$transaction(async (tx) => {
    await tx.disputeCase.update({
      where: { id: dispute.id },
      data: { status: nextStatus, updatedById: admin.id },
    });
    await tx.disputeEvent.create({
      data: {
        disputeCaseId: dispute.id,
        type: `request_${party}_information`,
        message,
        payload: { previousStatus: dispute.status, nextStatus },
        createdById: admin.id,
      },
    });
    await writeAdminAuditEvent({
      tx,
      actorId: admin.id,
      module: "disputes",
      action: `request_${party}_information`,
      targetType: "DisputeCase",
      targetId: dispute.id,
      summary: `${party} information requested for dispute ${dispute.caseNumber}.`,
      metadata: { previousStatus: dispute.status, nextStatus },
    });
  });

  revalidateDisputes();
  disputesRedirect({ notice: `${party} information requested.`, disputeId: dispute.id }, returnTo);
}

export async function updateDisputeEvidenceAction(formData: FormData) {
  const admin = await requireAdmin();
  const returnTo = readString(formData, "returnTo", 2000);
  const disputeId = readString(formData, "disputeId", 80);
  if (!disputeId) disputesRedirect({ error: "Dispute id is required." }, returnTo);
  const evidence = evidencePayloadFromForm(formData);
  if (!EVIDENCE_QUALITY_LEVELS.includes(evidence.evidenceQuality as any)) {
    disputesRedirect({ error: "Valid evidence quality level is required.", disputeId }, returnTo);
  }
  assertSafeDisputeText([
    evidence.guestStatementSummary,
    evidence.partnerStatementSummary,
    evidence.internalObservation,
    evidence.operationalEvidenceSummary,
    evidence.supportingReferences,
    evidence.missingEvidence,
  ], returnTo);

  const dispute = await prisma.disputeCase.findUnique({ where: { id: disputeId } });
  if (!dispute) disputesRedirect({ error: "Dispute not found." }, returnTo);

  await prisma.$transaction(async (tx) => {
    await tx.disputeCase.update({
      where: { id: dispute.id },
      data: { updatedById: admin.id },
    });
    await tx.disputeEvent.create({
      data: {
        disputeCaseId: dispute.id,
        type: "evidence_summary_updated",
        message: "Safe evidence summary updated.",
        payload: evidence,
        createdById: admin.id,
      },
    });
    await writeAdminAuditEvent({
      tx,
      actorId: admin.id,
      module: "disputes",
      action: "update_evidence_summary",
      targetType: "DisputeCase",
      targetId: dispute.id,
      summary: `Evidence summary updated for dispute ${dispute.caseNumber}.`,
      metadata: { evidenceQuality: evidence.evidenceQuality },
    });
  });

  revalidateDisputes();
  disputesRedirect({ notice: "Evidence summary updated.", disputeId: dispute.id }, returnTo);
}

export async function resolveDisputeCaseAction(formData: FormData) {
  const admin = await requireAdmin();
  const returnTo = readString(formData, "returnTo", 2000);
  const disputeId = readString(formData, "disputeId", 80);
  const outcome = normalizeDisputeOutcome(readString(formData, "outcome", 80));
  const rationale = readString(formData, "rationale", 2500);
  const internalFinalNote = readString(formData, "internalFinalNote", 2000);
  const followUpRequired = isConfirmed(formData, "followUpRequired");
  if (!disputeId) disputesRedirect({ error: "Dispute id is required." }, returnTo);
  if (!outcome || !DISPUTE_OUTCOMES.includes(outcome as any)) disputesRedirect({ error: "Resolution outcome is required.", disputeId }, returnTo);
  if (!rationale) disputesRedirect({ error: "Resolution rationale is required.", disputeId }, returnTo);
  if (!isConfirmed(formData)) disputesRedirect({ error: "Confirm the structured resolution before resolving.", disputeId }, returnTo);
  assertSafeDisputeText([rationale, internalFinalNote], returnTo);

  const dispute = await prisma.disputeCase.findUnique({ where: { id: disputeId } });
  if (!dispute) disputesRedirect({ error: "Dispute not found." }, returnTo);
  if (dispute.status === "closed") disputesRedirect({ error: "Closed cases must be reopened before resolution changes.", disputeId }, returnTo);

  const resolutionSummary = `${outcome.replaceAll("_", " ")}: ${rationale}`;
  await prisma.$transaction(async (tx) => {
    await tx.disputeCase.update({
      where: { id: dispute.id },
      data: {
        status: "resolved",
        resolution: resolutionSummary.slice(0, 2000),
        resolvedAt: new Date(),
        updatedById: admin.id,
      },
    });
    await tx.disputeEvent.create({
      data: {
        disputeCaseId: dispute.id,
        type: "case_resolved_structured",
        message: `Dispute resolved with outcome ${outcome.replaceAll("_", " ")}.`,
        payload: { outcome, rationale, internalFinalNote, followUpRequired, previousStatus: dispute.status },
        createdById: admin.id,
      },
    });
    await writeAdminAuditEvent({
      tx,
      actorId: admin.id,
      module: "disputes",
      action: "resolve_dispute_structured",
      targetType: "DisputeCase",
      targetId: dispute.id,
      summary: `Dispute ${dispute.caseNumber} resolved with structured outcome.`,
      metadata: { outcome, followUpRequired, previousStatus: dispute.status },
    });
  });

  revalidateDisputes();
  disputesRedirect({ notice: "Dispute resolved with structured outcome.", disputeId: dispute.id }, returnTo);
}

export async function closeDisputeCaseAction(formData: FormData) {
  const admin = await requireAdmin();
  const returnTo = readString(formData, "returnTo", 2000);
  const disputeId = readString(formData, "disputeId", 80);
  const closeReason = readString(formData, "closeReason", 1500);
  if (!disputeId) disputesRedirect({ error: "Dispute id is required." }, returnTo);
  if (!isConfirmed(formData)) disputesRedirect({ error: "Confirm closure before closing the case.", disputeId }, returnTo);
  assertSafeDisputeText([closeReason], returnTo);

  const dispute = await prisma.disputeCase.findUnique({ where: { id: disputeId } });
  if (!dispute) disputesRedirect({ error: "Dispute not found." }, returnTo);
  if (dispute.status === "closed") disputesRedirect({ error: "Case is already closed.", disputeId }, returnTo);
  const hasResolution = await latestResolutionExists(dispute.id, dispute.resolution);
  if (!hasResolution && !closeReason) {
    disputesRedirect({ error: "Close requires an existing resolution or a close reason.", disputeId }, returnTo);
  }

  await prisma.$transaction(async (tx) => {
    await tx.disputeCase.update({
      where: { id: dispute.id },
      data: { status: "closed", closedAt: new Date(), updatedById: admin.id },
    });
    await tx.disputeEvent.create({
      data: {
        disputeCaseId: dispute.id,
        type: "case_closed",
        message: closeReason ?? "Dispute case closed after resolution review.",
        payload: { previousStatus: dispute.status, hasResolution },
        createdById: admin.id,
      },
    });
    await writeAdminAuditEvent({
      tx,
      actorId: admin.id,
      module: "disputes",
      action: "close_dispute",
      targetType: "DisputeCase",
      targetId: dispute.id,
      summary: `Dispute ${dispute.caseNumber} closed.`,
      metadata: { previousStatus: dispute.status, hasResolution },
    });
  });

  revalidateDisputes();
  disputesRedirect({ notice: "Dispute closed.", disputeId: dispute.id }, returnTo);
}

export async function reopenDisputeCaseAction(formData: FormData) {
  const admin = await requireAdmin();
  const returnTo = readString(formData, "returnTo", 2000);
  const disputeId = readString(formData, "disputeId", 80);
  const reopenReason = readString(formData, "reopenReason", 1500);
  if (!disputeId) disputesRedirect({ error: "Dispute id is required." }, returnTo);
  if (!reopenReason) disputesRedirect({ error: "Reopen reason is required.", disputeId }, returnTo);
  assertSafeDisputeText([reopenReason], returnTo);

  const dispute = await prisma.disputeCase.findUnique({ where: { id: disputeId } });
  if (!dispute) disputesRedirect({ error: "Dispute not found." }, returnTo);
  if (dispute.status === "reopened") disputesRedirect({ error: "Case is already reopened.", disputeId }, returnTo);

  await prisma.$transaction(async (tx) => {
    await tx.disputeCase.update({
      where: { id: dispute.id },
      data: { status: "reopened", closedAt: null, updatedById: admin.id },
    });
    await tx.disputeEvent.create({
      data: {
        disputeCaseId: dispute.id,
        type: "case_reopened",
        message: reopenReason,
        payload: { previousStatus: dispute.status },
        createdById: admin.id,
      },
    });
    await writeAdminAuditEvent({
      tx,
      actorId: admin.id,
      module: "disputes",
      action: "reopen_dispute",
      targetType: "DisputeCase",
      targetId: dispute.id,
      summary: `Dispute ${dispute.caseNumber} reopened.`,
      metadata: { previousStatus: dispute.status },
    });
  });

  revalidateDisputes();
  disputesRedirect({ notice: "Dispute reopened.", disputeId: dispute.id }, returnTo);
}

export async function updateDisputeStatusAction(formData: FormData) {
  const admin = await requireAdmin();
  const returnTo = readString(formData, "returnTo", 2000);
  const disputeId = readString(formData, "disputeId", 80);
  const status = readString(formData, "status", 40);
  const message = readString(formData, "message", 2000) ?? "Dispute status updated.";
  if (!disputeId) disputesRedirect({ error: "Dispute id is required." }, returnTo);
  if (!status || !DISPUTE_STATUSES.includes(status as any)) disputesRedirect({ error: "Unsupported dispute status.", disputeId }, returnTo);
  const nextStatus = status as (typeof DISPUTE_STATUSES)[number];
  if (nextStatus === "resolved") disputesRedirect({ error: "Use the structured resolution workspace to resolve cases.", disputeId }, returnTo);
  if (nextStatus === "closed") disputesRedirect({ error: "Use the closure action with confirmation to close cases.", disputeId }, returnTo);
  if (nextStatus === "reopened") disputesRedirect({ error: "Use the reopen action with a required reason.", disputeId }, returnTo);
  assertSafeDisputeText([message], returnTo);

  const dispute = await prisma.disputeCase.findUnique({ where: { id: disputeId } });
  if (!dispute) disputesRedirect({ error: "Dispute not found." }, returnTo);
  const disabledReason = isDisputeStatusTransitionAllowed(dispute.status, nextStatus);
  if (disabledReason) disputesRedirect({ error: disabledReason, disputeId }, returnTo);

  await prisma.$transaction(async (tx) => {
    await tx.disputeCase.update({
      where: { id: dispute.id },
      data: { status: nextStatus, updatedById: admin.id },
    });
    await tx.disputeEvent.create({
      data: {
        disputeCaseId: dispute.id,
        type: `status_${nextStatus}`,
        message,
        payload: { previousStatus: dispute.status, nextStatus },
        createdById: admin.id,
      },
    });
    await writeAdminAuditEvent({
      tx,
      actorId: admin.id,
      module: "disputes",
      action: "update_dispute_status",
      targetType: "DisputeCase",
      targetId: dispute.id,
      summary: `Dispute ${dispute.caseNumber} moved to ${nextStatus}.`,
      metadata: { previousStatus: dispute.status, nextStatus },
    });
  });

  revalidateDisputes();
  disputesRedirect({ notice: "Dispute status updated.", disputeId: dispute.id }, returnTo);
}

export async function createDisputeVerificationAction(formData: FormData) {
  const admin = await requireAdmin();
  const returnTo = readString(formData, "returnTo", 2000);
  const disputeId = readString(formData, "disputeId", 80);
  const entityType = readString(formData, "entityType", 40);
  const entityId = readString(formData, "entityId", 100);
  const category = readString(formData, "category", 40) ?? "operational_readiness";
  const title = readString(formData, "title", 180) ?? "Dispute verification review";
  const summary = readString(formData, "summary", 1200);
  if (!disputeId) disputesRedirect({ error: "Dispute id is required." }, returnTo);
  if (!entityType || !VERIFICATION_ENTITY_TYPES.includes(entityType as any) || !entityId) {
    disputesRedirect({ error: "Valid verification entity is required.", disputeId }, returnTo);
  }
  if (!VERIFICATION_CATEGORIES.includes(category as any)) {
    disputesRedirect({ error: "Valid verification category is required.", disputeId }, returnTo);
  }
  const verificationEntityType = entityType as (typeof VERIFICATION_ENTITY_TYPES)[number];
  const verificationEntityId = entityId;
  const verificationCategory = category as (typeof VERIFICATION_CATEGORIES)[number];
  assertSafeDisputeText([title, summary], returnTo);

  const dispute = await prisma.disputeCase.findUnique({ where: { id: disputeId } });
  if (!dispute) disputesRedirect({ error: "Dispute not found." }, returnTo);

  await prisma.$transaction(async (tx) => {
    const created = await tx.verificationRecord.create({
      data: {
        entityType: verificationEntityType,
        entityId: verificationEntityId,
        category: verificationCategory,
        status: "pending",
        title,
        summary,
        createdById: admin.id,
        updatedById: admin.id,
      },
    });
    await tx.verificationEvent.create({
      data: {
        verificationRecordId: created.id,
        type: "created_from_dispute",
        message: `Verification created from dispute ${dispute.caseNumber}.`,
        payload: { disputeId: dispute.id, caseNumber: dispute.caseNumber },
        createdById: admin.id,
      },
    });
    await tx.disputeEvent.create({
      data: {
        disputeCaseId: dispute.id,
        type: "verification_created",
        message: `Verification ${created.id} created from dispute.`,
        payload: { verificationRecordId: created.id, entityType: verificationEntityType, entityId: verificationEntityId, category: verificationCategory },
        createdById: admin.id,
      },
    });
    await writeAdminAuditEvent({
      tx,
      actorId: admin.id,
      module: "disputes",
      action: "create_verification_from_dispute",
      targetType: "VerificationRecord",
      targetId: created.id,
      summary: `Verification created from dispute ${dispute.caseNumber}.`,
      metadata: { disputeId: dispute.id, entityType: verificationEntityType, entityId: verificationEntityId, category: verificationCategory },
    });
  });

  revalidateDisputes();
  disputesRedirect({ notice: "Verification record created.", disputeId: dispute.id }, returnTo);
}
