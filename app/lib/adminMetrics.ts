import "server-only";

import { unstable_noStore as noStore } from "next/cache";
import prisma from "./db";
import { ADMIN_MODULES, type AdminModuleId } from "./adminNavigation";
import { getPayPalProviderReadiness } from "./paypal";
import { formatDateTime } from "./marketplaceStatus";
import { isListingPubliclyVisible } from "./listingContent";

export type AdminModuleMetric = {
  id: AdminModuleId;
  title: string;
  description: string;
  href: string;
  icon: string;
  count: number | null;
  countLabel: string;
  status: string;
  statusLabel?: string | null;
  lastUpdated?: string | null;
  readiness?: string | null;
};

function lastDateLabel(date?: Date | null) {
  return date ? formatDateTime(date) : null;
}

export async function getAdminCommandCenterMetrics() {
  noStore();

  const paypal = getPayPalProviderReadiness();
  const [
    homes,
    pendingPartnerApplications,
    partnerApplications,
    reservations,
    guests,
    paymentRecords,
    openDisputes,
    pendingVerifications,
    premiumPipeline,
    handoverTasks,
    homepageSections,
    latestAudit,
    latestListingAudit,
    currencySettings,
    localizationSettings,
  ] = await Promise.all([
    prisma.home.findMany({
      select: {
        id: true,
        listingStatus: true,
        contentReviewStatus: true,
        approvedTitle: true,
        approvedDescription: true,
        title: true,
        description: true,
        archivedAt: true,
        deletedAt: true,
        updatedAt: true,
      },
    }),
    prisma.partnerApplication.count({
      where: { status: { in: ["submitted", "pending_review", "under_review", "needs_information"] } },
    }),
    prisma.partnerApplication.count(),
    prisma.reservation.count(),
    prisma.user.count({ where: { role: { notIn: ["admin", "super_admin"] } } }),
    prisma.paymentRecord.count(),
    prisma.disputeCase.count({
      where: { status: { in: ["open", "under_review", "awaiting_guest", "awaiting_partner", "awaiting_admin", "reopened"] } },
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
    prisma.homepageSection.count(),
    prisma.adminAuditEvent.findFirst({ orderBy: { createdAt: "desc" } }),
    prisma.listingAuditEvent.findFirst({ orderBy: { createdAt: "desc" } }),
    prisma.currencySettings.findFirst({ orderBy: { updatedAt: "desc" } }),
    prisma.localizationSettings.findFirst({ orderBy: { updatedAt: "desc" } }),
  ]);

  const approvedListings = homes.filter(isListingPubliclyVisible).length;
  const pendingListings = homes.filter((home) =>
    ["submitted", "pending_review", "under_review", "needs_changes"].includes(
      home.contentReviewStatus ?? ""
    )
  ).length;
  const latestHome = homes.reduce<Date | null>((latest, home) => {
    if (!latest || home.updatedAt > latest) return home.updatedAt;
    return latest;
  }, null);
  const activityDate = latestAudit?.createdAt ?? latestListingAudit?.createdAt ?? null;

  const counts: Record<AdminModuleId, Pick<AdminModuleMetric, "count" | "countLabel" | "status" | "statusLabel" | "lastUpdated" | "readiness">> = {
    marketplace_operations: {
      count: approvedListings + pendingListings + reservations + openDisputes + pendingVerifications,
      countLabel: "live signals",
      status: openDisputes > 0 || pendingVerifications > 0 ? "requires_review" : "operational",
      lastUpdated: lastDateLabel(activityDate),
      readiness: "Computed from live marketplace records.",
    },
    bookings: {
      count: reservations,
      countLabel: "reservations",
      status: reservations > 0 ? "operational" : "not_configured",
      statusLabel: reservations > 0 ? "Data-backed" : "No reservations yet",
      lastUpdated: lastDateLabel(activityDate),
    },
    guests: {
      count: guests,
      countLabel: "accounts",
      status: guests > 0 ? "operational" : "not_configured",
      statusLabel: guests > 0 ? "Data-backed" : "No guests yet",
    },
    partner_operations: {
      count: pendingPartnerApplications,
      countLabel: "pending review",
      status: pendingPartnerApplications > 0 ? "requires_review" : "operational",
      statusLabel: pendingPartnerApplications > 0 ? "Review needed" : "Current",
    },
    property_trust: {
      count: approvedListings,
      countLabel: "approved listings",
      status: pendingListings > 0 ? "requires_review" : "operational",
      statusLabel: pendingListings > 0 ? `${pendingListings} pending` : "Current",
      lastUpdated: lastDateLabel(latestHome),
    },
    homepage_builder: {
      count: homepageSections,
      countLabel: "sections",
      status: homepageSections > 0 ? "operational" : "not_configured",
      statusLabel: homepageSections > 0 ? "Configured" : "No sections yet",
    },
    globalization: {
      count: localizationSettings?.enabledLanguages.split(",").filter(Boolean).length ?? null,
      countLabel: "languages",
      status:
        currencySettings?.lastSyncStatus === "failed" ||
        localizationSettings?.lastSyncStatus === "failed"
          ? "requires_review"
          : "operational",
      statusLabel: "Currency and language controls",
      lastUpdated: lastDateLabel(currencySettings?.updatedAt ?? localizationSettings?.updatedAt),
    },
    premium_guests: {
      count: premiumPipeline,
      countLabel: "pipeline",
      status: premiumPipeline > 0 ? "requires_review" : "operational",
      statusLabel: premiumPipeline > 0 ? "Pipeline active" : "Prepared foundation",
    },
    handover: {
      count: handoverTasks,
      countLabel: "active tasks",
      status: handoverTasks > 0 ? "requires_review" : "operational",
      statusLabel: handoverTasks > 0 ? "Tasks active" : "No tasks yet",
    },
    payments: {
      count: paymentRecords,
      countLabel: "payment records",
      status: paypal.status,
      statusLabel: paypal.status === "sandbox_ready" ? "Sandbox ready" : paypal.status === "live_ready" ? "Live ready" : undefined,
      readiness: paypal.isConfigured
        ? `PayPal ${paypal.environment} credentials detected.`
        : "PayPal credentials are missing; no checkout calls will be attempted.",
    },
    disputes: {
      count: openDisputes,
      countLabel: "open cases",
      status: openDisputes > 0 ? "requires_review" : "operational",
      statusLabel: openDisputes > 0 ? "Case work active" : "No open cases",
    },
    verifications: {
      count: pendingVerifications,
      countLabel: "pending",
      status: pendingVerifications > 0 ? "requires_review" : "operational",
      statusLabel: pendingVerifications > 0 ? "Queue active" : "Current",
    },
    settings: {
      count: partnerApplications,
      countLabel: "partner records",
      status: paypal.isConfigured ? "operational" : "requires_review",
      statusLabel: paypal.isConfigured ? "System configured" : "Provider config needed",
    },
  };

  return ADMIN_MODULES.map((moduleMeta) => ({
    ...moduleMeta,
    ...counts[moduleMeta.id],
  })) satisfies AdminModuleMetric[];
}
