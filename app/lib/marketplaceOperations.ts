import "server-only";

import { unstable_noStore as noStore } from "next/cache";
import prisma from "./db";
import { getPayPalProviderReadiness } from "./paypal";
import { getRecentAdminAuditEvents } from "./audit";
import {
  APPROVED_LISTING_TRANSLATION_LANGUAGES,
  getApprovedListingTranslationSummary,
  isListingPubliclyVisible,
  listingApprovalReadiness,
} from "./listingContent";

export type MarketplaceBlocker = {
  id: string;
  title: string;
  description: string;
  count: number;
  severity: "warning" | "danger" | "info";
  href: string;
};

export type ReadinessArea = {
  id: string;
  label: string;
  score: number;
  status: string;
  detail: string;
  href: string;
};

function score(ok: boolean, warning: boolean) {
  if (ok && !warning) return 100;
  if (ok && warning) return 70;
  return 35;
}

export async function getMarketplaceOperationsState() {
  noStore();

  const paypal = getPayPalProviderReadiness();
  const [
    homes,
    reservationCount,
    activeReservationCount,
    partnerApplicationCount,
    pendingPartnerApplications,
    guestCount,
    paymentRecordCount,
    openDisputes,
    urgentDisputes,
    pendingVerifications,
    premiumPipeline,
    handoverActiveTasks,
    handoverIssues,
    translationFailures,
    currencySettings,
    localizationSettings,
    recentAudit,
  ] = await Promise.all([
    prisma.home.findMany({
      select: {
        id: true,
        listingStatus: true,
        contentReviewStatus: true,
        approvedTitle: true,
        approvedDescription: true,
        approvedNeighborhood: true,
        title: true,
        description: true,
        city: true,
        propertyType: true,
        price: true,
        archivedAt: true,
        deletedAt: true,
        User: { select: { role: true } },
        _count: { select: { images: true, features: true } },
      },
    }),
    prisma.reservation.count(),
    prisma.reservation.count({
      where: { bookingStatus: { in: ["requested", "reserved", "confirmed", "under_review"] } },
    }),
    prisma.partnerApplication.count(),
    prisma.partnerApplication.count({
      where: { status: { in: ["submitted", "pending_review", "under_review", "needs_information"] } },
    }),
    prisma.user.count({ where: { role: { notIn: ["admin", "super_admin"] } } }),
    prisma.paymentRecord.count(),
    prisma.disputeCase.count({
      where: { status: { in: ["open", "under_review", "awaiting_guest", "awaiting_partner", "awaiting_admin", "reopened"] } },
    }),
    prisma.disputeCase.count({
      where: {
        priority: "urgent",
        status: { in: ["open", "under_review", "awaiting_guest", "awaiting_partner", "awaiting_admin", "reopened"] },
      },
    }),
    prisma.verificationRecord.count({
      where: { status: { in: ["pending", "under_review", "needs_information"] } },
    }),
    prisma.premiumGuestProfile.count({
      where: { status: { in: ["candidate", "under_review", "verified"] } },
    }),
    prisma.handoverTask.count({
      where: { status: { in: ["not_scheduled", "pending_preparation", "ready", "in_progress", "issue_reported"] } },
    }),
    prisma.handoverTask.count({ where: { status: "issue_reported" } }),
    prisma.translationEntry.count({ where: { status: { in: ["failed", "stale"] } } }),
    prisma.currencySettings.findFirst({ orderBy: { updatedAt: "desc" } }),
    prisma.localizationSettings.findFirst({ orderBy: { updatedAt: "desc" } }),
    getRecentAdminAuditEvents(10),
  ]);

  const approvedPublicListings = homes.filter(isListingPubliclyVisible);
  const pendingListings = homes.filter((home) =>
    ["submitted", "pending_review", "under_review", "needs_changes"].includes(
      home.contentReviewStatus ?? ""
    )
  );
  const missingMedia = homes.filter((home) => home._count.images === 0);
  const missingPricing = homes.filter((home) => !home.price || home.price <= 0);
  const listingReadinessIssues = homes.filter((home) => !listingApprovalReadiness(home).ok);
  const approvedTranslationSummary = await getApprovedListingTranslationSummary(
    approvedPublicListings.map((home) => ({
      id: home.id,
      approvedTitle: home.approvedTitle,
      approvedDescription: home.approvedDescription,
      approvedNeighborhood: home.approvedNeighborhood,
    }))
  );
  const missingTranslationListings = approvedPublicListings.filter((home) => {
    const summary = approvedTranslationSummary.get(home.id);
    return (
      (summary?.missingLanguages.length ?? APPROVED_LISTING_TRANSLATION_LANGUAGES.length) > 0 ||
      (summary?.staleLanguages.length ?? 0) > 0
    );
  });

  const blockers: MarketplaceBlocker[] = [
    ...(!paypal.isConfigured
      ? [
          {
            id: "paypal_env",
            title: "PayPal credentials missing",
            description: "PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are required before checkout orders can be created.",
            count: 1,
            severity: "danger" as const,
            href: "/admin/payments",
          },
        ]
      : []),
    ...(urgentDisputes > 0
      ? [
          {
            id: "urgent_disputes",
            title: "Urgent disputes open",
            description: "Urgent cases need operational review before marketplace readiness can be considered clear.",
            count: urgentDisputes,
            severity: "danger" as const,
            href: "/admin/disputes?priority=urgent",
          },
        ]
      : []),
    ...(pendingVerifications > 0
      ? [
          {
            id: "pending_verifications",
            title: "Verification queue active",
            description: "Trust, compliance, property quality, or payment risk checks are awaiting review.",
            count: pendingVerifications,
            severity: "warning" as const,
            href: "/admin/verifications?status=pending",
          },
        ]
      : []),
    ...(handoverIssues > 0
      ? [
          {
            id: "handover_issues",
            title: "Handover issues reported",
            description: "Managed arrival or departure tasks have reported issues.",
            count: handoverIssues,
            severity: "danger" as const,
            href: "/admin/handover?status=issue_reported",
          },
        ]
      : []),
    ...(premiumPipeline > 0
      ? [
          {
            id: "premium_pipeline",
            title: "Premium guest pipeline active",
            description: "Verified traveler candidates are waiting for review or readiness decisions.",
            count: premiumPipeline,
            severity: "info" as const,
            href: "/admin/premium-guests?status=under_review",
          },
        ]
      : []),
    ...(missingPricing.length > 0
      ? [
          {
            id: "missing_pricing",
            title: "Listings missing pricing",
            description: "Listings without nightly pricing cannot create reliable booking/payment operations.",
            count: missingPricing.length,
            severity: "warning" as const,
            href: "/admin/property-trust?issue=missing_price",
          },
        ]
      : []),
    ...(missingMedia.length > 0
      ? [
          {
            id: "missing_media",
            title: "Listings missing media",
            description: "Properties need approved media before public trust and conversion are production-grade.",
            count: missingMedia.length,
            severity: "warning" as const,
            href: "/admin/property-trust?issue=missing_images",
          },
        ]
      : []),
    ...(missingTranslationListings.length > 0 || translationFailures > 0
      ? [
          {
            id: "translation_coverage",
            title: "Translations missing or stale",
            description: "Approved inventory still has missing, stale, or failed translation work.",
            count: missingTranslationListings.length + translationFailures,
            severity: "warning" as const,
            href: "/admin/globalization?tab=inventory",
          },
        ]
      : []),
  ];

  const readinessAreas: ReadinessArea[] = [
    {
      id: "supply",
      label: "Supply readiness",
      score: score(approvedPublicListings.length > 0, missingMedia.length > 0 || listingReadinessIssues.length > 0),
      status: approvedPublicListings.length > 0 ? "operational" : "not_configured",
      detail: `${approvedPublicListings.length} approved public listings; ${pendingListings.length} pending review.`,
      href: "/admin/property-trust",
    },
    {
      id: "demand",
      label: "Demand readiness",
      score: score(guestCount > 0, activeReservationCount === 0),
      status: guestCount > 0 ? "operational" : "not_configured",
      detail: `${guestCount} guest accounts and ${activeReservationCount} active reservations.`,
      href: "/admin/guests",
    },
    {
      id: "localization",
      label: "Localization readiness",
      score: score(Boolean(localizationSettings), missingTranslationListings.length > 0 || translationFailures > 0),
      status: localizationSettings ? "operational" : "not_configured",
      detail: `${localizationSettings?.enabledLanguages.split(",").filter(Boolean).length ?? 0} enabled languages.`,
      href: "/admin/globalization",
    },
    {
      id: "pricing",
      label: "Pricing readiness",
      score: score(missingPricing.length === 0 && homes.length > 0, missingPricing.length > 0),
      status: missingPricing.length > 0 ? "requires_review" : "operational",
      detail: `${missingPricing.length} listings missing pricing.`,
      href: "/admin/property-trust?issue=missing_price",
    },
    {
      id: "payment",
      label: "Payment readiness",
      score: score(paypal.isConfigured, paymentRecordCount === 0),
      status: paypal.status,
      detail: paypal.isConfigured
        ? `PayPal ${paypal.environment} environment is configured.`
        : "PayPal server credentials are missing.",
      href: "/admin/payments",
    },
    {
      id: "trust",
      label: "Trust and safety",
      score: score(openDisputes === 0 && pendingVerifications === 0, openDisputes > 0 || pendingVerifications > 0),
      status: openDisputes > 0 || pendingVerifications > 0 ? "requires_review" : "operational",
      detail: `${openDisputes} open disputes and ${pendingVerifications} pending verifications.`,
      href: "/admin/verifications",
    },
    {
      id: "handover",
      label: "Handover readiness",
      score: score(handoverIssues === 0, handoverActiveTasks > 0),
      status: handoverIssues > 0 ? "requires_review" : "operational",
      detail: `${handoverActiveTasks} active handover tasks; ${handoverIssues} issues reported.`,
      href: "/admin/handover",
    },
  ];

  const overallScore =
    readinessAreas.reduce((total, area) => total + area.score, 0) / readinessAreas.length;

  return {
    kpis: {
      approvedPublicListings: approvedPublicListings.length,
      pendingListings: pendingListings.length,
      partnerApplications: partnerApplicationCount,
      pendingPartnerApplications,
      reservationCount,
      activeReservationCount,
      guestCount,
      paymentRecordCount,
      openDisputes,
      pendingVerifications,
      premiumPipeline,
      handoverActiveTasks,
    },
    provider: paypal,
    currencySettings,
    localizationSettings,
    blockers,
    readinessAreas,
    overallScore,
    recentAudit,
  };
}
