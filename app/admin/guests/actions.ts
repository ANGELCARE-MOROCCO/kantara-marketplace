"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/app/lib/auth";
import prisma from "@/app/lib/db";
import { writeAdminAuditEvent } from "@/app/lib/audit";
import { createDisputeCaseNumber } from "@/app/lib/disputeOperations";
import { VERIFICATION_CATEGORIES } from "@/app/lib/verificationOperations";
import {
  PREMIUM_GUEST_RISK_LEVELS,
  PREMIUM_GUEST_STATUSES,
  calculatePremiumEligibilityScore,
} from "@/app/lib/premiumGuestOperations";

const OPEN_DISPUTE_STATUSES = ["open", "under_review", "awaiting_guest", "awaiting_partner", "awaiting_admin", "reopened"];
const HIGH_DISPUTE_PRIORITIES = ["high", "urgent", "critical"];
const ACTIVE_VERIFICATION_STATUSES = ["pending", "under_review", "needs_information", "verified"];
const CONFIRMED_BOOKING_STATUSES = ["reserved", "confirmed"];
const PAYMENT_FAILED_STATUSES = ["failed"];

function readString(formData: FormData, key: string, maxLength = 2000) {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function readIds(formData: FormData, csvKey: string, fieldKey: string) {
  const csvIds = readString(formData, csvKey, 12000)
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean) ?? [];
  const fieldIds = formData
    .getAll(fieldKey)
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
  return Array.from(new Set([...csvIds, ...fieldIds])).slice(0, 100);
}

function safeGuestsReturnTo(returnTo?: string | null) {
  return returnTo?.startsWith("/admin/guests") ? returnTo : "/admin/guests";
}

function guestsRedirect(params: Record<string, string | null | undefined> = {}, returnTo?: string | null): never {
  const url = new URL(safeGuestsReturnTo(returnTo), "https://kantara.local");
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  });
  redirect(`${url.pathname}${url.search}`);
}

function revalidateGuests() {
  revalidatePath("/admin");
  revalidatePath("/admin/guests");
  revalidatePath("/admin/verifications");
  revalidatePath("/admin/premium-guests");
  revalidatePath("/admin/disputes");
  revalidatePath("/admin/marketplace-operations");
}

function containsSensitiveGuestOpsData(value?: string | null) {
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

function assertSafeGuestOpsText(fields: (string | null | undefined)[], returnTo?: string | null) {
  if (fields.some((field) => containsSensitiveGuestOpsData(field))) {
    guestsRedirect({
      error: "Do not store card data, raw identity document values, PayPal secrets, access codes, or passwords in guest operations records.",
    }, returnTo);
  }
}

async function requireRealGuest(userId: string | null, returnTo?: string | null) {
  if (!userId) guestsRedirect({ error: "Guest user id is required." }, returnTo);
  const guest = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      _count: { select: { Reservation: true, Favorite: true } },
    },
  });
  if (!guest || ["admin", "super_admin"].includes(guest.role)) {
    guestsRedirect({ error: "A real non-admin guest account is required." }, returnTo);
  }
  return guest;
}

function guestName(guest: { firstName?: string | null; lastName?: string | null; email: string }) {
  return `${guest.firstName ?? ""} ${guest.lastName ?? ""}`.trim() || guest.email;
}

async function getPremiumSafety(userId: string, now = new Date()) {
  const reservations = await prisma.reservation.findMany({
    where: { userId },
    select: { id: true, bookingStatus: true, startDate: true },
  });
  const reservationIds = reservations.map((reservation) => reservation.id);
  const [existingProfile, disputes, payments, verification] = await Promise.all([
    prisma.premiumGuestProfile.findUnique({ where: { userId } }),
    prisma.disputeCase.findMany({
      where: {
        guestId: userId,
        status: { in: OPEN_DISPUTE_STATUSES },
      },
      select: { id: true, priority: true },
    }),
    prisma.paymentRecord.findMany({
      where: {
        OR: [
          { guestId: userId },
          reservationIds.length ? { reservationId: { in: reservationIds } } : { id: "__no_reservation_payment__" },
        ],
      },
      select: { id: true, status: true, method: true },
    }),
    prisma.verificationRecord.findFirst({
      where: { entityType: "guest", entityId: userId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, status: true },
    }),
  ]);
  const hasReservationHistory = reservations.length > 0;
  const hasUpcomingConfirmedBooking = reservations.some((reservation) => (
    CONFIRMED_BOOKING_STATUSES.includes(reservation.bookingStatus) && reservation.startDate >= now
  ));
  const unresolvedHighDispute = disputes.some((dispute) => HIGH_DISPUTE_PRIORITIES.includes(dispute.priority));
  const failedPaymentExposure = payments.some((payment) => PAYMENT_FAILED_STATUSES.includes(payment.status));
  const verificationRejected = verification?.status === "rejected";
  const eligible = Boolean(
    (hasReservationHistory || hasUpcomingConfirmedBooking) &&
    !unresolvedHighDispute &&
    !failedPaymentExposure &&
    !verificationRejected &&
    !existingProfile
  );

  const disabledReason = eligible
    ? null
    : existingProfile
      ? "A premium guest profile already exists."
      : verificationRejected
        ? "Guest verification is rejected."
        : failedPaymentExposure
          ? "Guest has unresolved failed payment exposure."
          : unresolvedHighDispute
            ? "Guest has an unresolved high or urgent dispute."
            : "Premium candidacy requires reservation history or an upcoming confirmed booking.";

  return {
    eligible,
    disabledReason,
    existingProfile,
    reservations,
    disputes,
    payments,
    verification,
    riskLevel: payments.some((payment) => ["manual", "bank_transfer", "cash_to_host"].includes(payment.method)) ? "medium" : "low",
  };
}

export async function createGuestVerificationAction(formData: FormData) {
  const admin = await requireAdmin();
  const returnTo = readString(formData, "returnTo", 2000);
  const guestId = readString(formData, "guestId", 80);
  const category = readString(formData, "category", 60) ?? "identity";
  const title = readString(formData, "title", 180);
  const summary = readString(formData, "summary", 2000);
  const evidenceSummary = readString(formData, "evidenceSummary", 2000);
  const guest = await requireRealGuest(guestId, returnTo);
  if (!VERIFICATION_CATEGORIES.includes(category as any)) guestsRedirect({ error: "Valid verification category is required.", guestId: guest.id }, returnTo);
  assertSafeGuestOpsText([title, summary, evidenceSummary], returnTo);

  const active = await prisma.verificationRecord.findFirst({
    where: { entityType: "guest", entityId: guest.id, category, status: { in: ACTIVE_VERIFICATION_STATUSES } },
    orderBy: { updatedAt: "desc" },
  });
  if (active) {
    guestsRedirect({
      error: active.status === "verified"
        ? "Guest already has a verified verification record."
        : "Guest already has an active verification record.",
      guestId: guest.id,
    }, returnTo);
  }

  const record = await prisma.$transaction(async (tx) => {
    const created = await tx.verificationRecord.create({
      data: {
        entityType: "guest",
        entityId: guest.id,
        category,
        status: "pending",
        title: title ?? `Guest verification for ${guestName(guest)}`,
        summary,
        evidenceSummary,
        createdById: admin.id,
        updatedById: admin.id,
      },
    });
    await tx.verificationEvent.create({
      data: {
        verificationRecordId: created.id,
        type: "created_from_guests",
        message: "Guest verification created from Guest Intelligence Command. Sensitive identity values were not stored.",
        createdById: admin.id,
      },
    });
    await writeAdminAuditEvent({
      tx,
      actorId: admin.id,
      module: "guests",
      action: "create_guest_verification",
      targetType: "VerificationRecord",
      targetId: created.id,
      summary: `Guest verification created for ${guest.email}.`,
      metadata: { guestId: guest.id, category },
    });
    return created;
  });

  revalidateGuests();
  guestsRedirect({ notice: "Guest verification record created.", guestId: guest.id }, returnTo);
}

export async function requestGuestInformationAction(formData: FormData) {
  const admin = await requireAdmin();
  const returnTo = readString(formData, "returnTo", 2000);
  const guestId = readString(formData, "guestId", 80);
  const message = readString(formData, "message", 1200) ?? "Guest information requested for verification review.";
  const guest = await requireRealGuest(guestId, returnTo);
  assertSafeGuestOpsText([message], returnTo);

  const existing = await prisma.verificationRecord.findFirst({
    where: { entityType: "guest", entityId: guest.id, status: { in: ["pending", "under_review", "needs_information"] } },
    orderBy: { updatedAt: "desc" },
  });

  await prisma.$transaction(async (tx) => {
    const record = existing
      ? await tx.verificationRecord.update({
          where: { id: existing.id },
          data: { status: "needs_information", updatedById: admin.id },
        })
      : await tx.verificationRecord.create({
          data: {
            entityType: "guest",
            entityId: guest.id,
            category: "identity",
            status: "needs_information",
            title: `Guest information request for ${guestName(guest)}`,
            summary: message,
            createdById: admin.id,
            updatedById: admin.id,
          },
        });
    await tx.verificationEvent.create({
      data: {
        verificationRecordId: record.id,
        type: "guest_information_requested",
        message,
        createdById: admin.id,
      },
    });
    await writeAdminAuditEvent({
      tx,
      actorId: admin.id,
      module: "guests",
      action: "request_guest_information",
      targetType: "VerificationRecord",
      targetId: record.id,
      summary: `Guest information requested for ${guest.email}.`,
      metadata: { guestId: guest.id },
    });
  });

  revalidateGuests();
  guestsRedirect({ notice: "Guest information request recorded.", guestId: guest.id }, returnTo);
}

export async function createGuestPremiumProfileAction(formData: FormData) {
  const admin = await requireAdmin();
  const returnTo = readString(formData, "returnTo", 2000);
  const guestId = readString(formData, "guestId", 80) ?? readString(formData, "userId", 80);
  const requestedRiskLevel = readString(formData, "riskLevel", 20);
  const guest = await requireRealGuest(guestId, returnTo);
  const safety = await getPremiumSafety(guest.id);
  if (!safety.eligible) guestsRedirect({ error: safety.disabledReason, guestId: guest.id }, returnTo);
  const riskLevel = requestedRiskLevel && PREMIUM_GUEST_RISK_LEVELS.includes(requestedRiskLevel as any)
    ? requestedRiskLevel
    : safety.riskLevel;
  const disputeCount = await prisma.disputeCase.count({ where: { guestId: guest.id } });
  const eligibilityScore = calculatePremiumEligibilityScore({
    reservationCount: guest._count.Reservation,
    favoriteCount: guest._count.Favorite,
    verificationStatus: safety.verification?.status,
    disputeCount,
    riskLevel,
  });

  const profile = await prisma.$transaction(async (tx) => {
    const created = await tx.premiumGuestProfile.create({
      data: {
        userId: guest.id,
        status: "candidate",
        eligibilityScore,
        riskLevel,
        reviewedById: admin.id,
      },
    });
    await tx.premiumGuestEvent.create({
      data: {
        premiumGuestProfileId: created.id,
        type: "profile_created_from_guests",
        message: "Premium guest profile created from deterministic Guest Intelligence candidate rules.",
        createdById: admin.id,
      },
    });
    await writeAdminAuditEvent({
      tx,
      actorId: admin.id,
      module: "guests",
      action: "create_guest_premium_profile",
      targetType: "PremiumGuestProfile",
      targetId: created.id,
      summary: `Premium guest profile created for ${guest.email}.`,
      metadata: { guestId: guest.id, eligibilityScore, riskLevel },
    });
    return created;
  });

  revalidateGuests();
  guestsRedirect({ notice: "Premium guest profile created.", guestId: guest.id }, returnTo);
}

export async function updateGuestPremiumStatusAction(formData: FormData) {
  const admin = await requireAdmin();
  const returnTo = readString(formData, "returnTo", 2000);
  const guestId = readString(formData, "guestId", 80);
  const profileId = readString(formData, "profileId", 80);
  const status = readString(formData, "status", 40);
  const note = readString(formData, "note", 1200) ?? "Premium guest status updated from Guest Intelligence Command.";
  const guest = await requireRealGuest(guestId, returnTo);
  if (!profileId) guestsRedirect({ error: "Premium profile id is required.", guestId: guest.id }, returnTo);
  if (!PREMIUM_GUEST_STATUSES.includes(status as any)) guestsRedirect({ error: "Unsupported premium guest status.", guestId: guest.id }, returnTo);
  assertSafeGuestOpsText([note], returnTo);

  const profile = await prisma.premiumGuestProfile.findUnique({ where: { id: profileId } });
  if (!profile || profile.userId !== guest.id) guestsRedirect({ error: "Premium profile was not found for this guest.", guestId: guest.id }, returnTo);
  const safety = await getPremiumSafety(guest.id);
  if (["verified", "premium_ready"].includes(status as string)) {
    if (safety.verification?.status !== "verified") guestsRedirect({ error: "Verified or premium-ready status requires a verified guest verification record.", guestId: guest.id }, returnTo);
    if (safety.disputes.some((dispute) => HIGH_DISPUTE_PRIORITIES.includes(dispute.priority))) guestsRedirect({ error: "Resolve high or urgent disputes before marking premium ready.", guestId: guest.id }, returnTo);
    if (safety.payments.some((payment) => PAYMENT_FAILED_STATUSES.includes(payment.status))) guestsRedirect({ error: "Resolve failed payment exposure before marking premium ready.", guestId: guest.id }, returnTo);
  }

  await prisma.$transaction(async (tx) => {
    await tx.premiumGuestProfile.update({
      where: { id: profile.id },
      data: {
        status: status as string,
        reviewedById: admin.id,
        reviewedAt: new Date(),
        notes: note,
      },
    });
    await tx.premiumGuestEvent.create({
      data: {
        premiumGuestProfileId: profile.id,
        type: `status_${status}_from_guests`,
        message: note,
        payload: { previousStatus: profile.status, nextStatus: status },
        createdById: admin.id,
      },
    });
    await writeAdminAuditEvent({
      tx,
      actorId: admin.id,
      module: "guests",
      action: "update_guest_premium_status",
      targetType: "PremiumGuestProfile",
      targetId: profile.id,
      summary: `Premium guest profile moved to ${status}.`,
      metadata: { guestId: guest.id, previousStatus: profile.status, nextStatus: status },
    });
  });

  revalidateGuests();
  guestsRedirect({ notice: "Premium guest status updated.", guestId: guest.id }, returnTo);
}

export async function createGuestDisputeAction(formData: FormData) {
  const admin = await requireAdmin();
  const returnTo = readString(formData, "returnTo", 2000);
  const guestId = readString(formData, "guestId", 80);
  const priority = readString(formData, "priority", 20) ?? "medium";
  const title = readString(formData, "title", 180);
  const summary = readString(formData, "summary", 2000);
  const guest = await requireRealGuest(guestId, returnTo);
  if (!["low", "medium", "high", "urgent"].includes(priority)) guestsRedirect({ error: "Valid dispute priority is required.", guestId: guest.id }, returnTo);
  if (!title || !summary) guestsRedirect({ error: "Dispute title and summary are required.", guestId: guest.id }, returnTo);
  assertSafeGuestOpsText([title, summary], returnTo);

  const dispute = await prisma.$transaction(async (tx) => {
    const created = await tx.disputeCase.create({
      data: {
        caseNumber: createDisputeCaseNumber(),
        type: "guest_issue",
        priority,
        status: "open",
        guestId: guest.id,
        title,
        summary,
        createdById: admin.id,
        updatedById: admin.id,
      },
    });
    await tx.disputeEvent.create({
      data: {
        disputeCaseId: created.id,
        type: "case_created_from_guest_command",
        message: `Guest-linked dispute created for ${guest.email}.`,
        payload: { sourceType: "guest", sourceId: guest.id },
        createdById: admin.id,
      },
    });
    await writeAdminAuditEvent({
      tx,
      actorId: admin.id,
      module: "guests",
      action: "create_guest_dispute",
      targetType: "DisputeCase",
      targetId: created.id,
      summary: `Guest-linked dispute ${created.caseNumber} created.`,
      metadata: { guestId: guest.id, priority },
    });
    return created;
  });

  revalidateGuests();
  guestsRedirect({ notice: `Dispute ${dispute.caseNumber} created.`, guestId: guest.id }, returnTo);
}

export async function bulkCreateGuestVerificationsAction(formData: FormData) {
  const admin = await requireAdmin();
  const returnTo = readString(formData, "returnTo", 2000);
  const guestIds = readIds(formData, "guestIds", "guestId");
  if (!guestIds.length) guestsRedirect({ error: "Select at least one guest first." }, returnTo);

  const guests = await prisma.user.findMany({
    where: { id: { in: guestIds }, role: { notIn: ["admin", "super_admin"] } },
    select: { id: true, email: true, firstName: true, lastName: true },
  });
  const active = await prisma.verificationRecord.findMany({
    where: { entityType: "guest", entityId: { in: guests.map((guest) => guest.id) }, status: { in: ACTIVE_VERIFICATION_STATUSES } },
    select: { entityId: true },
  });
  const blocked = new Set(active.map((record) => record.entityId));

  const result = await prisma.$transaction(async (tx) => {
    let created = 0;
    for (const guest of guests) {
      if (blocked.has(guest.id)) continue;
      const record = await tx.verificationRecord.create({
        data: {
          entityType: "guest",
          entityId: guest.id,
          category: "identity",
          status: "pending",
          title: `Guest verification for ${guestName(guest)}`,
          summary: "Bulk verification record created from Guest Intelligence Command.",
          createdById: admin.id,
          updatedById: admin.id,
        },
      });
      await tx.verificationEvent.create({
        data: {
          verificationRecordId: record.id,
          type: "bulk_created_from_guests",
          message: "Guest verification created from safe bulk operation.",
          createdById: admin.id,
        },
      });
      await writeAdminAuditEvent({
        tx,
        actorId: admin.id,
        module: "guests",
        action: "bulk_create_guest_verification",
        targetType: "VerificationRecord",
        targetId: record.id,
        summary: `Bulk guest verification created for ${guest.email}.`,
        metadata: { guestId: guest.id },
      });
      created += 1;
    }
    return { created, skipped: guestIds.length - created };
  });

  revalidateGuests();
  if (!result.created) guestsRedirect({ error: "No selected guests were eligible for new verification records." }, returnTo);
  guestsRedirect({ notice: `${result.created} guest verification record${result.created === 1 ? "" : "s"} created${result.skipped ? `; ${result.skipped} skipped` : ""}.` }, returnTo);
}

export async function bulkCreatePremiumProfilesAction(formData: FormData) {
  const admin = await requireAdmin();
  const returnTo = readString(formData, "returnTo", 2000);
  const guestIds = readIds(formData, "guestIds", "guestId");
  if (!guestIds.length) guestsRedirect({ error: "Select at least one guest first." }, returnTo);

  const guests = await prisma.user.findMany({
    where: { id: { in: guestIds }, role: { notIn: ["admin", "super_admin"] } },
    select: { id: true, email: true, firstName: true, lastName: true, _count: { select: { Reservation: true, Favorite: true } } },
  });

  const eligibleGuests: {
    guest: (typeof guests)[number];
    safety: Awaited<ReturnType<typeof getPremiumSafety>>;
    eligibilityScore: number;
  }[] = [];
  for (const guest of guests) {
    const safety = await getPremiumSafety(guest.id);
    if (!safety.eligible) continue;
    const disputeCount = await prisma.disputeCase.count({ where: { guestId: guest.id } });
    const eligibilityScore = calculatePremiumEligibilityScore({
      reservationCount: guest._count.Reservation,
      favoriteCount: guest._count.Favorite,
      verificationStatus: safety.verification?.status,
      disputeCount,
      riskLevel: safety.riskLevel,
    });
    eligibleGuests.push({ guest, safety, eligibilityScore });
  }

  const result = await prisma.$transaction(async (tx) => {
    let created = 0;
    for (const { guest, safety, eligibilityScore } of eligibleGuests) {
      const profile = await tx.premiumGuestProfile.create({
        data: {
          userId: guest.id,
          status: "candidate",
          eligibilityScore,
          riskLevel: safety.riskLevel,
          reviewedById: admin.id,
        },
      });
      await tx.premiumGuestEvent.create({
        data: {
          premiumGuestProfileId: profile.id,
          type: "bulk_profile_created_from_guests",
          message: "Premium profile created from deterministic bulk guest candidate rules.",
          createdById: admin.id,
        },
      });
      await writeAdminAuditEvent({
        tx,
        actorId: admin.id,
        module: "guests",
        action: "bulk_create_premium_profile",
        targetType: "PremiumGuestProfile",
        targetId: profile.id,
        summary: `Bulk premium guest profile created for ${guest.email}.`,
        metadata: { guestId: guest.id, eligibilityScore, riskLevel: safety.riskLevel },
      });
      created += 1;
    }
    const skipped = guestIds.length - created;
    return { created, skipped };
  });

  revalidateGuests();
  if (!result.created) guestsRedirect({ error: "No selected guests passed premium candidate safety rules." }, returnTo);
  guestsRedirect({ notice: `${result.created} premium profile${result.created === 1 ? "" : "s"} created${result.skipped ? `; ${result.skipped} skipped` : ""}.` }, returnTo);
}
