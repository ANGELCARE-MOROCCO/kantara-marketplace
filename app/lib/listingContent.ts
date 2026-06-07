import "server-only";

import type { Prisma } from "@prisma/client";

import prisma from "./db";
import {
  SUPPORTED_LANGUAGES,
  type LanguageCode,
} from "./globalization";
import {
  ENTITY_TRANSLATION_NAMESPACE,
  HOME_TRANSLATABLE_FIELDS,
  buildEntityTranslationKey,
  createSourceHash,
  getEntityTranslationMap,
} from "./translationMemory";

export { HOME_TRANSLATABLE_FIELDS };

export const LISTING_CONTENT_STATUSES = [
  "draft",
  "submitted",
  "pending_review",
  "under_review",
  "needs_changes",
  "approved",
  "rejected",
  "suspended",
  "archived",
] as const;

export const APPROVED_LISTING_TRANSLATION_LANGUAGES = SUPPORTED_LANGUAGES
  .map((language) => language.code)
  .filter((language) => language !== "en") as Exclude<LanguageCode, "en">[];

export type ApprovedListingField = (typeof HOME_TRANSLATABLE_FIELDS)[number];

export type ApprovedListingContent = {
  approvedTitle: string | null;
  approvedDescription: string | null;
  approvedNeighborhood: string | null;
};

export function approvedListingFieldLabel(fieldName: ApprovedListingField) {
  switch (fieldName) {
    case "approvedTitle":
      return "Title";
    case "approvedDescription":
      return "Description";
    case "approvedNeighborhood":
      return "Neighborhood";
  }
}

export function approvedListingFieldSource(
  listing: ApprovedListingContent,
  fieldName: ApprovedListingField
) {
  return listing[fieldName]?.trim() ?? "";
}

export function approvedListingFieldHash(
  listing: ApprovedListingContent,
  fieldName: ApprovedListingField
) {
  return createSourceHash(approvedListingFieldSource(listing, fieldName));
}

export function buildApprovedListingTranslationKey(
  homeId: string,
  fieldName: ApprovedListingField
) {
  return buildEntityTranslationKey("home", homeId, fieldName);
}

export function approvedListingTranslationTargets(
  homeId: string,
  listing: ApprovedListingContent
) {
  return HOME_TRANSLATABLE_FIELDS.map((fieldName) => ({
    entityType: "home",
    entityId: homeId,
    fieldName,
    sourceHash: approvedListingFieldHash(listing, fieldName),
  }));
}

export async function applyApprovedListingTranslations<
  T extends ApprovedListingContent & { id: string }
>(listings: T[], language: LanguageCode) {
  if (language === "en" || listings.length === 0) return listings;

  const targets = listings.flatMap((listing) =>
    approvedListingTranslationTargets(listing.id, listing)
  );
  const translations = await getEntityTranslationMap(language, targets);

  return listings.map((listing) => ({
    ...listing,
    approvedTitle:
      translations.get(
        buildApprovedListingTranslationKey(listing.id, "approvedTitle")
      ) ?? listing.approvedTitle,
    approvedDescription:
      translations.get(
        buildApprovedListingTranslationKey(listing.id, "approvedDescription")
      ) ?? listing.approvedDescription,
    approvedNeighborhood:
      translations.get(
        buildApprovedListingTranslationKey(listing.id, "approvedNeighborhood")
      ) ?? listing.approvedNeighborhood,
  }));
}

export function getPublicListingTitle(listing: {
  approvedTitle?: string | null;
  title?: string | null;
  city?: string | null;
  propertyTypeLabel?: string | null;
}) {
  return (
    listing.approvedTitle?.trim() ||
    listing.title?.trim() ||
    `${listing.propertyTypeLabel ?? "Property"} in ${listing.city ?? "Morocco"}`
  );
}

export function getPublicListingDescription(listing: {
  approvedDescription?: string | null;
  description?: string | null;
}) {
  return listing.approvedDescription?.trim() || listing.description?.trim() || null;
}

export function getPublicListingNeighborhood(listing: {
  approvedNeighborhood?: string | null;
  neighborhood?: string | null;
}) {
  return listing.approvedNeighborhood?.trim() || listing.neighborhood?.trim() || null;
}

export function isListingPubliclyVisible(listing: {
  listingStatus: string;
  contentReviewStatus?: string | null;
  approvedTitle?: string | null;
  approvedDescription?: string | null;
  title?: string | null;
  description?: string | null;
  archivedAt?: Date | string | null;
  deletedAt?: Date | string | null;
}) {
  if (listing.listingStatus !== "approved") return false;
  if (listing.archivedAt || listing.deletedAt) return false;
  if (["rejected", "suspended", "archived"].includes(listing.contentReviewStatus ?? "")) {
    return false;
  }

  return Boolean(
    listing.approvedTitle?.trim() ||
      listing.approvedDescription?.trim() ||
      listing.title?.trim() ||
      listing.description?.trim() ||
      listing.contentReviewStatus === "approved"
  );
}

export function listingApprovalReadiness(listing: {
  approvedTitle?: string | null;
  approvedDescription?: string | null;
  city?: string | null;
  price?: number | null;
  propertyType?: string | null;
  archivedAt?: Date | null;
  deletedAt?: Date | null;
  listingStatus?: string | null;
  contentReviewStatus?: string | null;
  User?: { role?: string | null } | null;
  user?: { role?: string | null } | null;
  _count?: { images?: number; features?: number } | null;
}) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const partnerRole = listing.User?.role ?? listing.user?.role;

  if (!listing.approvedTitle?.trim()) errors.push("Approved English title is required.");
  if (!listing.approvedDescription?.trim()) {
    errors.push("Approved English description is required.");
  }
  if (!listing.city?.trim()) errors.push("City is required.");
  if (!listing.propertyType?.trim()) errors.push("Property type is required.");
  if (!listing.price || listing.price <= 0) errors.push("Nightly price is required.");
  if (listing.archivedAt || listing.deletedAt) {
    errors.push("Archived or deleted listings cannot be approved.");
  }
  if (listing.contentReviewStatus === "suspended" || listing.listingStatus === "suspended") {
    errors.push("Suspended listings must be restored before approval.");
  }
  if (partnerRole && partnerRole !== "host_verified") {
    errors.push("Partner account must be host_verified.");
  }
  if ((listing._count?.images ?? 0) < 1) warnings.push("No gallery images saved.");
  if ((listing._count?.features ?? 0) < 1) warnings.push("No feature labels selected.");

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

export function translationReadinessLabel({
  missingLanguages,
  staleLanguages,
}: {
  missingLanguages: string[];
  staleLanguages: string[];
}) {
  if (missingLanguages.length === 0 && staleLanguages.length === 0) {
    return "Ready for international guests";
  }
  if (missingLanguages.length === APPROVED_LISTING_TRANSLATION_LANGUAGES.length) {
    return "English approved only";
  }
  if (staleLanguages.length > 0) return "Stale translations";
  return "Partially translated";
}

export async function getApprovedListingTranslationSummary(
  listings: (ApprovedListingContent & { id: string })[]
) {
  const keys = listings.flatMap((listing) =>
    HOME_TRANSLATABLE_FIELDS.map((fieldName) =>
      buildApprovedListingTranslationKey(listing.id, fieldName)
    )
  );
  const rows = keys.length
    ? await prisma.translationEntry.findMany({
        where: {
          namespace: ENTITY_TRANSLATION_NAMESPACE,
          entityType: "home",
          key: { in: keys },
          language: { in: APPROVED_LISTING_TRANSLATION_LANGUAGES },
        },
        select: {
          key: true,
          language: true,
          status: true,
          sourceHash: true,
          translatedText: true,
        },
      })
    : [];
  const sourceByKey = new Map(
    listings.flatMap((listing) =>
      HOME_TRANSLATABLE_FIELDS.map((fieldName) => [
        buildApprovedListingTranslationKey(listing.id, fieldName),
        approvedListingFieldHash(listing, fieldName),
      ] as const)
    )
  );

  return new Map(
    listings.map((listing) => {
      const missingLanguages: string[] = [];
      const staleLanguages: string[] = [];

      for (const language of APPROVED_LISTING_TRANSLATION_LANGUAGES) {
        const languageRows = HOME_TRANSLATABLE_FIELDS.map((fieldName) => {
          const key = buildApprovedListingTranslationKey(listing.id, fieldName);
          return rows.find((row) => row.key === key && row.language === language);
        });
        const requiredFields = HOME_TRANSLATABLE_FIELDS.filter((fieldName) =>
          approvedListingFieldSource(listing, fieldName)
        );

        if (requiredFields.length === 0) continue;

        const complete = requiredFields.every((fieldName) => {
          const key = buildApprovedListingTranslationKey(listing.id, fieldName);
          const row = languageRows.find((item) => item?.key === key);
          return (
            row?.translatedText?.trim() &&
            row.status === "human_reviewed" &&
            row.sourceHash === sourceByKey.get(key)
          );
        });
        const stale = languageRows.some((row) => {
          if (!row?.translatedText?.trim()) return false;
          return row.sourceHash !== sourceByKey.get(row.key) || row.status === "stale";
        });

        if (!complete) missingLanguages.push(language);
        if (stale) staleLanguages.push(language);
      }

      const translatedLanguageCount =
        APPROVED_LISTING_TRANSLATION_LANGUAGES.length - missingLanguages.length;
      const completionPercent = Math.round(
        (translatedLanguageCount / APPROVED_LISTING_TRANSLATION_LANGUAGES.length) * 100
      );

      return [
        listing.id,
        {
          missingLanguages,
          staleLanguages,
          completionPercent,
          label: translationReadinessLabel({ missingLanguages, staleLanguages }),
        },
      ] as const;
    })
  );
}

export type ListingContentWhereInput = Prisma.HomeWhereInput;
