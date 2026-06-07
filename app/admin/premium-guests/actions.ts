"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/app/lib/auth";
import prisma from "@/app/lib/db";
import { writeAdminAuditEvent } from "@/app/lib/audit";
import {
  PREMIUM_GUEST_RISK_LEVELS,
  PREMIUM_GUEST_STATUSES,
  calculatePremiumEligibilityScore,
} from "@/app/lib/premiumGuestOperations";

function readString(formData: FormData, key: string, maxLength = 2000) {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function premiumRedirect(params: Record<string, string | null | undefined> = {}): never {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  redirect(`/admin/premium-guests${search.toString() ? `?${search.toString()}` : ""}`);
}

function revalidatePremiumGuests() {
  revalidatePath("/admin");
  revalidatePath("/admin/premium-guests");
  revalidatePath("/admin/guests");
  revalidatePath("/admin/marketplace-operations");
}

export async function createPremiumGuestProfileAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = readString(formData, "userId", 80);
  const riskLevel = readString(formData, "riskLevel", 20) ?? "low";
  if (!userId) premiumRedirect({ error: "Guest user id is required." });
  if (!PREMIUM_GUEST_RISK_LEVELS.includes(riskLevel as any)) premiumRedirect({ error: "Valid risk level is required." });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      _count: { select: { Reservation: true, Favorite: true } },
    },
  });
  if (!user || ["admin", "super_admin"].includes(user.role)) {
    premiumRedirect({ error: "A non-admin guest account is required." });
  }

  const existing = await prisma.premiumGuestProfile.findUnique({ where: { userId } });
  if (existing) premiumRedirect({ error: "Premium guest profile already exists.", profileId: existing.id });

  const verification = await prisma.verificationRecord.findFirst({
    where: { entityType: "guest", entityId: userId },
    orderBy: { updatedAt: "desc" },
  });
  const disputeCount = await prisma.disputeCase.count({ where: { guestId: userId } });
  const eligibilityScore = calculatePremiumEligibilityScore({
    reservationCount: user._count.Reservation,
    favoriteCount: user._count.Favorite,
    verificationStatus: verification?.status,
    disputeCount,
    riskLevel,
  });

  const profile = await prisma.$transaction(async (tx) => {
    const created = await tx.premiumGuestProfile.create({
      data: {
        userId,
        status: "candidate",
        riskLevel,
        eligibilityScore,
        reviewedById: admin.id,
      },
    });
    await tx.premiumGuestEvent.create({
      data: {
        premiumGuestProfileId: created.id,
        type: "profile_created",
        message: "Premium guest profile created from real guest account.",
        createdById: admin.id,
      },
    });
    await writeAdminAuditEvent({
      tx,
      actorId: admin.id,
      module: "premium_guests",
      action: "create_profile",
      targetType: "PremiumGuestProfile",
      targetId: created.id,
      summary: "Admin created a premium guest profile.",
      metadata: { userId, eligibilityScore, riskLevel },
    });
    return created;
  });

  revalidatePremiumGuests();
  premiumRedirect({ notice: "Premium guest profile created.", profileId: profile.id });
}

export async function updatePremiumGuestStatusAction(formData: FormData) {
  const admin = await requireAdmin();
  const profileId = readString(formData, "profileId", 80);
  const status = readString(formData, "status", 40);
  const note = readString(formData, "note", 2000) ?? "Premium guest status updated.";
  if (!profileId) premiumRedirect({ error: "Profile id is required." });
  if (!PREMIUM_GUEST_STATUSES.includes(status as any)) premiumRedirect({ error: "Unsupported premium guest status.", profileId });

  const profile = await prisma.premiumGuestProfile.findUnique({ where: { id: profileId } });
  if (!profile) premiumRedirect({ error: "Premium guest profile not found." });

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
        type: `status_${status}`,
        message: note,
        payload: { previousStatus: profile.status, nextStatus: status },
        createdById: admin.id,
      },
    });
    await writeAdminAuditEvent({
      tx,
      actorId: admin.id,
      module: "premium_guests",
      action: "update_status",
      targetType: "PremiumGuestProfile",
      targetId: profile.id,
      summary: `Premium guest profile moved to ${status}.`,
      metadata: { previousStatus: profile.status, nextStatus: status },
    });
  });

  revalidatePremiumGuests();
  premiumRedirect({ notice: "Premium guest status updated.", profileId: profile.id });
}
