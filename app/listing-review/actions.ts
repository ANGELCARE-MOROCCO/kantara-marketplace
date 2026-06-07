"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";

import {
  requireAdmin,
  requireUser,
  isAdminRole,
  canManageListings,
} from "@/app/lib/auth";
import prisma from "@/app/lib/db";
import { TRANSLATIONS_CACHE_TAG } from "@/app/lib/i18n";
import {
  APPROVED_LISTING_TRANSLATION_LANGUAGES,
  HOME_TRANSLATABLE_FIELDS,
  approvedListingFieldHash,
  approvedListingFieldSource,
  buildApprovedListingTranslationKey,
  listingApprovalReadiness,
  type ApprovedListingField,
} from "@/app/lib/listingContent";
import {
  ENTITY_TRANSLATION_NAMESPACE,
  markHomeTranslationsStale,
  upsertTranslationEntry,
} from "@/app/lib/translationMemory";
import type { Prisma } from "@prisma/client";

type PrismaExecutor = typeof prisma | Prisma.TransactionClient;

function readString(formData: FormData, key: string, maxLength = 4000) {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function resolveHomeId(input: string | FormData) {
  return typeof input === "string" ? input : readString(input, "homeId", 80);
}

function trustRedirect(homeId?: string | null, params: Record<string, string | null | undefined> = {}): never {
  const search = new URLSearchParams();
  if (homeId) search.set("homeId", homeId);
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  redirect(`/admin/property-trust${search.toString() ? `?${search.toString()}` : ""}`);
}

function revalidateListing(homeId: string) {
  revalidateTag(TRANSLATIONS_CACHE_TAG);
  revalidatePath("/");
  revalidatePath(`/home/${homeId}`);
  revalidatePath("/my-homes");
  revalidatePath("/partner/dashboard");
  revalidatePath("/admin/property-trust");
  revalidatePath("/admin");
}

async function createAuditEvent({
  tx,
  homeId,
  actorId,
  eventType,
  message,
  metadata,
}: {
  tx?: PrismaExecutor;
  homeId: string;
  actorId?: string | null;
  eventType: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  const client = tx ?? prisma;

  await client.listingAuditEvent.create({
    data: {
      homeId,
      actorId: actorId ?? null,
      eventType,
      message,
      metadata: metadata ? JSON.stringify(metadata) : null,
    },
  });
}

async function getListingForActor(homeId: string) {
  const user = await requireUser();
  if (!canManageListings(user.role)) redirect("/");

  const home = await prisma.home.findUnique({
    where: { id: homeId },
    select: {
      id: true,
      userId: true,
      listingStatus: true,
      contentReviewStatus: true,
      approvedTitle: true,
      approvedDescription: true,
      approvedNeighborhood: true,
      partnerSubmittedTitle: true,
      partnerSubmittedDescription: true,
      partnerSubmittedNeighborhood: true,
    },
  });

  if (!home) redirect("/");
  if (home.userId !== user.id && !isAdminRole(user.role)) redirect("/");

  return { user, home };
}

export async function updatePartnerSubmittedContent(input: string | FormData) {
  const homeId = resolveHomeId(input);
  if (!homeId || typeof input === "string") redirect("/");
  const { user, home } = await getListingForActor(homeId);
  const isAdmin = isAdminRole(user.role);
  const canPartnerEdit =
    home.userId === user.id &&
    ["draft", "submitted", "pending_review", "needs_changes", "approved"].includes(
      home.contentReviewStatus
    );

  if (!isAdmin && !canPartnerEdit) redirect("/");

  const partnerSubmittedTitle = readString(input, "partnerSubmittedTitle", 180);
  const partnerSubmittedDescription = readString(
    input,
    "partnerSubmittedDescription",
    4000
  );
  const partnerSubmittedNeighborhood = readString(
    input,
    "partnerSubmittedNeighborhood",
    180
  );
  const nextStatus =
    home.contentReviewStatus === "approved" ? "draft" : home.contentReviewStatus;

  await prisma.$transaction(async (tx) => {
    await tx.home.update({
      where: { id: homeId },
      data: {
        title: partnerSubmittedTitle,
        description: partnerSubmittedDescription,
        neighborhood: partnerSubmittedNeighborhood,
        partnerSubmittedTitle,
        partnerSubmittedDescription,
        partnerSubmittedNeighborhood,
        contentReviewStatus: nextStatus,
        contentNeedsChangesReason: null,
        updatedById: user.id,
      },
    });

    await createAuditEvent({
      tx,
      homeId,
      actorId: user.id,
      eventType: "partner_proposed_changes_saved",
      message: "Partner proposed listing content saved.",
      metadata: {
        previousStatus: home.contentReviewStatus,
        newStatus: nextStatus,
      },
    });
  });

  revalidateListing(homeId);
  redirect(`/create/${homeId}/description?notice=proposal-saved`);
}

export async function submitListingForReview(input: string | FormData) {
  const homeId = resolveHomeId(input);
  if (!homeId) redirect("/");
  const { user, home } = await getListingForActor(homeId);
  const actorIsAdmin = isAdminRole(user.role);
  const isOwner = home.userId === user.id;

  if (!actorIsAdmin && !isOwner) redirect("/");
  if (!actorIsAdmin && user.role !== "host_verified") redirect("/");

  const now = new Date();
  const nextListingStatus = home.approvedTitle ? home.listingStatus : "pending_review";

  await prisma.$transaction(async (tx) => {
    await tx.home.update({
      where: { id: homeId },
      data: {
        contentReviewStatus: "pending_review",
        submittedForReviewAt: now,
        listingStatus: nextListingStatus,
        statusChangedAt: now,
        statusChangedById: user.id,
        updatedById: user.id,
      },
    });

    await createAuditEvent({
      tx,
      homeId,
      actorId: user.id,
      eventType: "listing_submitted_for_review",
      message: "Listing submitted for review.",
      metadata: {
        previousStatus: home.contentReviewStatus,
        newStatus: "pending_review",
        previousListingStatus: home.listingStatus,
        newListingStatus: nextListingStatus,
      },
    });
  });

  revalidateListing(homeId);
  redirect("/my-homes?notice=listing-submitted");
}

export async function markListingUnderReview(input: string | FormData) {
  const admin = await requireAdmin();
  const homeId = resolveHomeId(input);
  if (!homeId) trustRedirect(null, { error: "Missing listing id." });
  const home = await prisma.home.findUnique({
    where: { id: homeId },
    select: { contentReviewStatus: true },
  });
  if (!home) trustRedirect(null, { error: "Listing not found." });

  await prisma.$transaction(async (tx) => {
    await tx.home.update({
      where: { id: homeId },
      data: {
        contentReviewStatus: "under_review",
        contentReviewedById: admin.id,
        contentReviewedAt: new Date(),
      },
    });
    await createAuditEvent({
      tx,
      homeId,
      actorId: admin.id,
      eventType: "listing_under_review",
      message: "Listing marked under review.",
      metadata: { previousStatus: home.contentReviewStatus, newStatus: "under_review" },
    });
  });

  revalidateListing(homeId);
  trustRedirect(homeId, { notice: "Listing marked under review." });
}

export async function requestListingChanges(input: FormData) {
  const admin = await requireAdmin();
  const homeId = readString(input, "homeId", 80);
  const reason = readString(input, "reason", 2000);
  if (!homeId) trustRedirect(null, { error: "Missing listing id." });
  if (!reason) trustRedirect(homeId, { error: "Change request reason is required." });

  const home = await prisma.home.findUnique({
    where: { id: homeId },
    select: { contentReviewStatus: true, listingStatus: true },
  });
  if (!home) trustRedirect(null, { error: "Listing not found." });

  await prisma.$transaction(async (tx) => {
    await tx.home.update({
      where: { id: homeId },
      data: {
        contentReviewStatus: "needs_changes",
        contentNeedsChangesReason: reason,
        contentReviewedById: admin.id,
        contentReviewedAt: new Date(),
      },
    });
    await createAuditEvent({
      tx,
      homeId,
      actorId: admin.id,
      eventType: "listing_changes_requested",
      message: "Listing changes requested.",
      metadata: { previousStatus: home.contentReviewStatus, newStatus: "needs_changes", reason },
    });
  });

  revalidateListing(homeId);
  trustRedirect(homeId, { notice: "Changes requested." });
}

export async function saveApprovedListingContent(input: FormData) {
  const admin = await requireAdmin();
  const homeId = readString(input, "homeId", 80);
  if (!homeId) trustRedirect(null, { error: "Missing listing id." });

  const approvedTitle = readString(input, "approvedTitle", 180);
  const approvedDescription = readString(input, "approvedDescription", 4000);
  const approvedNeighborhood = readString(input, "approvedNeighborhood", 180);
  const contentReviewNotes = readString(input, "contentReviewNotes", 2000);
  const existing = await prisma.home.findUnique({
    where: { id: homeId },
    select: {
      approvedTitle: true,
      approvedDescription: true,
      approvedNeighborhood: true,
      approvedContentVersion: true,
      contentReviewStatus: true,
    },
  });
  if (!existing) trustRedirect(null, { error: "Listing not found." });

  const contentChanged =
    existing.approvedTitle !== approvedTitle ||
    existing.approvedDescription !== approvedDescription ||
    existing.approvedNeighborhood !== approvedNeighborhood;

  await prisma.$transaction(async (tx) => {
    await tx.home.update({
      where: { id: homeId },
      data: {
        approvedTitle,
        approvedDescription,
        approvedNeighborhood,
        contentReviewNotes,
        contentReviewedById: admin.id,
        contentReviewedAt: new Date(),
        ...(contentChanged
          ? {
              approvedContentVersion: { increment: 1 },
              lastApprovedContentChangedAt: new Date(),
            }
          : {}),
      },
    });

    if (contentChanged) {
      await markHomeTranslationsStale({
        homeId,
        values: {
          approvedTitle,
          approvedDescription,
          approvedNeighborhood,
        },
        tx,
      });
    }

    await createAuditEvent({
      tx,
      homeId,
      actorId: admin.id,
      eventType: "listing_approved_content_saved",
      message: "Approved English listing content saved.",
      metadata: {
        contentChanged,
        previousStatus: existing.contentReviewStatus,
      },
    });
  });

  revalidateListing(homeId);
  trustRedirect(homeId, { notice: "Approved English content saved." });
}

export async function saveApprovedListingTranslations(input: FormData) {
  const admin = await requireAdmin();
  const homeId = readString(input, "homeId", 80);
  if (!homeId) trustRedirect(null, { error: "Missing listing id." });

  const listing = await prisma.home.findUnique({
    where: { id: homeId },
    select: {
      approvedTitle: true,
      approvedDescription: true,
      approvedNeighborhood: true,
    },
  });
  if (!listing) trustRedirect(null, { error: "Listing not found." });

  let updated = 0;
  await prisma.$transaction(async (tx) => {
    for (const language of APPROVED_LISTING_TRANSLATION_LANGUAGES) {
      for (const fieldName of HOME_TRANSLATABLE_FIELDS) {
        const translatedText = readString(input, `${language}_${fieldName}`, 6000);
        if (!translatedText) continue;

        const baseText = approvedListingFieldSource(listing, fieldName);
        if (!baseText) continue;

        await upsertTranslationEntry({
          key: buildApprovedListingTranslationKey(homeId, fieldName),
          namespace: ENTITY_TRANSLATION_NAMESPACE,
          entityType: "home",
          entityId: homeId,
          fieldName,
          baseText,
          sourceHash: approvedListingFieldHash(listing, fieldName),
          language,
          translatedText,
          source: "manual_admin",
          status: "human_reviewed",
          lastSyncedAt: new Date(),
          errorMessage: null,
          tx,
        });
        updated += 1;

        await createAuditEvent({
          tx,
          homeId,
          actorId: admin.id,
          eventType: "listing_translation_updated",
          message: "Approved listing translation updated.",
          metadata: { language, field: fieldName },
        });
      }
    }
  });

  revalidateListing(homeId);
  trustRedirect(homeId, {
    notice: updated
      ? `Saved ${updated} approved translations.`
      : "No translation fields were changed.",
  });
}

export async function approveListingForPublic(input: string | FormData) {
  const admin = await requireAdmin();
  const homeId = resolveHomeId(input);
  if (!homeId) trustRedirect(null, { error: "Missing listing id." });

  const listing = await prisma.home.findUnique({
    where: { id: homeId },
    select: {
      id: true,
      approvedTitle: true,
      approvedDescription: true,
      approvedNeighborhood: true,
      city: true,
      price: true,
      propertyType: true,
      archivedAt: true,
      deletedAt: true,
      listingStatus: true,
      contentReviewStatus: true,
      User: { select: { role: true } },
      _count: { select: { images: true, features: true } },
    },
  });
  if (!listing) trustRedirect(null, { error: "Listing not found." });

  const readiness = listingApprovalReadiness(listing);
  if (!readiness.ok) {
    trustRedirect(homeId, { error: readiness.errors.join(" ") });
  }

  await prisma.$transaction(async (tx) => {
    await tx.home.update({
      where: { id: homeId },
      data: {
        contentReviewStatus: "approved",
        listingStatus: "approved",
        approvedAt: new Date(),
        statusChangedAt: new Date(),
        statusChangedById: admin.id,
        contentReviewedById: admin.id,
        contentReviewedAt: new Date(),
      },
    });
    await createAuditEvent({
      tx,
      homeId,
      actorId: admin.id,
      eventType: "listing_approved_public",
      message: "Listing approved for public marketplace.",
      metadata: {
        previousStatus: listing.contentReviewStatus,
        newStatus: "approved",
        previousListingStatus: listing.listingStatus,
        newListingStatus: "approved",
        warnings: readiness.warnings,
      },
    });
  });

  revalidateListing(homeId);
  trustRedirect(homeId, { notice: "Listing approved for public marketplace." });
}

export async function rejectListing(input: FormData) {
  const admin = await requireAdmin();
  const homeId = readString(input, "homeId", 80);
  const reason = readString(input, "reason", 2000);
  if (!homeId) trustRedirect(null, { error: "Missing listing id." });
  if (!reason) trustRedirect(homeId, { error: "Rejection reason is required." });

  const home = await prisma.home.findUnique({
    where: { id: homeId },
    select: { contentReviewStatus: true, listingStatus: true },
  });
  if (!home) trustRedirect(null, { error: "Listing not found." });

  await prisma.$transaction(async (tx) => {
    await tx.home.update({
      where: { id: homeId },
      data: {
        contentReviewStatus: "rejected",
        listingStatus: "rejected",
        rejectedAt: new Date(),
        contentRejectionReason: reason,
        contentReviewedById: admin.id,
        contentReviewedAt: new Date(),
        statusChangedAt: new Date(),
        statusChangedById: admin.id,
      },
    });
    await createAuditEvent({
      tx,
      homeId,
      actorId: admin.id,
      eventType: "listing_rejected",
      message: "Listing rejected.",
      metadata: { previousStatus: home.contentReviewStatus, newStatus: "rejected", reason },
    });
  });

  revalidateListing(homeId);
  trustRedirect(homeId, { notice: "Listing rejected." });
}

export async function suspendListing(input: FormData) {
  const admin = await requireAdmin();
  const homeId = readString(input, "homeId", 80);
  const reason = readString(input, "reason", 2000);
  if (!homeId) trustRedirect(null, { error: "Missing listing id." });
  if (!reason) trustRedirect(homeId, { error: "Suspension reason is required." });

  const home = await prisma.home.findUnique({
    where: { id: homeId },
    select: { contentReviewStatus: true, listingStatus: true },
  });
  if (!home) trustRedirect(null, { error: "Listing not found." });

  await prisma.$transaction(async (tx) => {
    await tx.home.update({
      where: { id: homeId },
      data: {
        contentReviewStatus: "suspended",
        listingStatus: "suspended",
        contentRejectionReason: reason,
        contentReviewedById: admin.id,
        contentReviewedAt: new Date(),
        statusChangedAt: new Date(),
        statusChangedById: admin.id,
      },
    });
    await createAuditEvent({
      tx,
      homeId,
      actorId: admin.id,
      eventType: "listing_suspended",
      message: "Listing suspended.",
      metadata: { previousStatus: home.contentReviewStatus, newStatus: "suspended", reason },
    });
  });

  revalidateListing(homeId);
  trustRedirect(homeId, { notice: "Listing suspended." });
}

export async function restoreListingToReview(input: string | FormData) {
  const admin = await requireAdmin();
  const homeId = resolveHomeId(input);
  if (!homeId) trustRedirect(null, { error: "Missing listing id." });
  const home = await prisma.home.findUnique({
    where: { id: homeId },
    select: { contentReviewStatus: true, listingStatus: true },
  });
  if (!home) trustRedirect(null, { error: "Listing not found." });

  await prisma.$transaction(async (tx) => {
    await tx.home.update({
      where: { id: homeId },
      data: {
        contentReviewStatus: "pending_review",
        listingStatus: home.listingStatus === "suspended" ? "pending_review" : home.listingStatus,
        contentRejectionReason: null,
        contentNeedsChangesReason: null,
        contentReviewedById: admin.id,
        contentReviewedAt: new Date(),
        statusChangedAt: new Date(),
        statusChangedById: admin.id,
      },
    });
    await createAuditEvent({
      tx,
      homeId,
      actorId: admin.id,
      eventType: "listing_restored_to_review",
      message: "Listing restored to review.",
      metadata: { previousStatus: home.contentReviewStatus, newStatus: "pending_review" },
    });
  });

  revalidateListing(homeId);
  trustRedirect(homeId, { notice: "Listing restored to review." });
}
