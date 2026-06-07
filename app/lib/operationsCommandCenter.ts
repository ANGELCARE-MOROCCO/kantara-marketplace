import "server-only";

import { unstable_noStore as noStore } from "next/cache";
import prisma from "./db";
import { ADMIN_MODULES } from "./adminNavigation";
import { getPayPalProviderReadiness } from "./paypal";
import {
  APPROVED_LISTING_TRANSLATION_LANGUAGES,
  getApprovedListingTranslationSummary,
  isListingPubliclyVisible,
} from "./listingContent";
import {
  formatAge,
  scoreFromSignals,
  sortCommandQueue,
  type CommandQueueItem,
  type HealthMatrixArea,
  type ModuleCommandSummary,
} from "./operationsBlockers";
import { queueToBlockers } from "./operationsIntelligence";
import { getUnifiedOperationsTimeline } from "./operationsTimeline";

const ACTIVE_RESERVATION_STATUSES = ["requested", "reserved", "confirmed", "under_review"];
const ACTIVE_DISPUTE_STATUSES = ["open", "under_review", "awaiting_guest", "awaiting_partner", "awaiting_admin", "reopened"];
const ACTIVE_HANDOVER_STATUSES = ["not_scheduled", "pending_preparation", "ready", "in_progress", "issue_reported"];
const ACTIVE_VERIFICATION_STATUSES = ["pending", "under_review", "needs_information"];

export async function getOperationsCommandCenterState() {
  noStore();
  const now = new Date();
  const next14 = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const paypal = getPayPalProviderReadiness();

  const [
    homes,
    reservations,
    partnerApplications,
    users,
    paymentRecords,
    disputes,
    verifications,
    premiumProfiles,
    handoverTasks,
    translationProblems,
    currencySettings,
    localizationSettings,
    homepageSections,
    latestAudit,
    timeline,
  ] = await Promise.all([
    prisma.home.findMany({
      select: {
        id: true,
        title: true,
        approvedTitle: true,
        city: true,
        price: true,
        listingStatus: true,
        contentReviewStatus: true,
        approvedDescription: true,
        approvedNeighborhood: true,
        archivedAt: true,
        deletedAt: true,
        updatedAt: true,
        createdAT: true,
        userId: true,
        _count: { select: { images: true, features: true, Reservation: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
    prisma.reservation.findMany({
      where: {
        OR: [
          { bookingStatus: { in: ACTIVE_RESERVATION_STATUSES } },
          { startDate: { gte: now, lte: next14 } },
        ],
      },
      select: {
        id: true,
        bookingStatus: true,
        startDate: true,
        endDate: true,
        createdAt: true,
        userId: true,
        homeId: true,
        listingTitleSnapshot: true,
        totalSnapshot: true,
        currencySnapshot: true,
        User: { select: { email: true, firstName: true, lastName: true } },
        Home: { select: { userId: true, title: true, approvedTitle: true, city: true } },
      },
      orderBy: { startDate: "asc" },
      take: 200,
    }),
    prisma.partnerApplication.findMany({
      where: { status: { in: ["submitted", "under_review", "needs_information", "approved", "suspended", "rejected"] } },
      select: {
        id: true,
        userId: true,
        status: true,
        displayName: true,
        legalName: true,
        email: true,
        city: true,
        readinessScore: true,
        submittedAt: true,
        updatedAt: true,
        user: { select: { email: true, role: true } },
      },
      orderBy: [{ submittedAt: "asc" }, { updatedAt: "desc" }],
      take: 200,
    }),
    prisma.user.findMany({
      where: { role: { notIn: ["admin", "super_admin"] } },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        _count: { select: { Reservation: true, Favorite: true } },
      },
      take: 300,
    }),
    prisma.paymentRecord.findMany({
      where: { status: { in: ["pending_approval", "authorized", "failed", "requires_review"] } },
      orderBy: { updatedAt: "desc" },
      take: 120,
    }),
    prisma.disputeCase.findMany({
      where: { status: { in: ACTIVE_DISPUTE_STATUSES } },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
      take: 120,
    }),
    prisma.verificationRecord.findMany({
      where: { status: { in: ACTIVE_VERIFICATION_STATUSES } },
      orderBy: { createdAt: "asc" },
      take: 120,
    }),
    prisma.premiumGuestProfile.findMany({
      where: { status: { in: ["candidate", "under_review", "verified"] } },
      orderBy: { updatedAt: "desc" },
      take: 80,
    }),
    prisma.handoverTask.findMany({
      where: { status: { in: ACTIVE_HANDOVER_STATUSES } },
      orderBy: [{ priority: "desc" }, { scheduledFor: "asc" }],
      take: 120,
    }),
    prisma.translationEntry.count({ where: { status: { in: ["stale", "failed"] } } }),
    prisma.currencySettings.findFirst({ orderBy: { updatedAt: "desc" } }),
    prisma.localizationSettings.findFirst({ orderBy: { updatedAt: "desc" } }),
    prisma.homepageSection.count(),
    prisma.adminAuditEvent.findFirst({ orderBy: { createdAt: "desc" } }),
    getUnifiedOperationsTimeline(18),
  ]);

  const approvedListings = homes.filter(isListingPubliclyVisible);
  const listingsMissingPrice = homes.filter((home) => !home.price || home.price <= 0);
  const listingsMissingMedia = homes.filter((home) => home._count.images === 0);
  const pendingListings = homes.filter((home) =>
    ["submitted", "pending_review", "under_review", "needs_changes"].includes(home.contentReviewStatus ?? "")
  );
  const approvedTranslationSummary = await getApprovedListingTranslationSummary(
    approvedListings.map((home) => ({
      id: home.id,
      approvedTitle: home.approvedTitle,
      approvedDescription: home.approvedDescription,
      approvedNeighborhood: home.approvedNeighborhood,
    }))
  );
  const listingsWithTranslationIssues = approvedListings.filter((home) => {
    const summary = approvedTranslationSummary.get(home.id);
    return (
      (summary?.missingLanguages.length ?? APPROVED_LISTING_TRANSLATION_LANGUAGES.length) > 0 ||
      (summary?.staleLanguages.length ?? 0) > 0
    );
  });
  const handoverReservationIds = new Set(
    handoverTasks.map((task) => task.reservationId).filter(Boolean)
  );
  const upcomingWithoutHandover = reservations.filter(
    (reservation) =>
      reservation.startDate >= now &&
      reservation.startDate <= next14 &&
      !handoverReservationIds.has(reservation.id)
  );

  const queue: CommandQueueItem[] = [];

  if (!paypal.isConfigured) {
    queue.push({
      id: "provider:paypal",
      module: "Payments",
      severity: "critical",
      entityType: "provider",
      entityLabel: "PayPal",
      reason: "PayPal credentials missing",
      nextAction: "Open payment setup checklist",
      href: "/admin/payments",
      createdAt: now,
      ageLabel: "configuration",
    });
  }

  for (const payment of paymentRecords) {
    queue.push({
      id: `payment:${payment.id}`,
      module: "Payments",
      severity: payment.status === "failed" || payment.status === "requires_review" ? "high" : "medium",
      entityType: "payment",
      entityId: payment.id,
      entityLabel: payment.providerOrderId ?? payment.id,
      reason: `Payment ${payment.status.replaceAll("_", " ")}`,
      nextAction: payment.providerOrderId ? "Resync, capture, or open dispute" : "Review manual settlement context",
      href: `/admin/payments?paymentId=${payment.id}`,
      createdAt: payment.updatedAt,
      ageLabel: formatAge(payment.updatedAt, now),
    });
  }

  for (const dispute of disputes) {
    queue.push({
      id: `dispute:${dispute.id}`,
      module: "Disputes",
      severity: dispute.priority === "urgent" ? "critical" : dispute.priority === "high" ? "high" : "medium",
      entityType: "dispute",
      entityId: dispute.id,
      entityLabel: dispute.caseNumber,
      reason: `${dispute.priority} dispute ${dispute.status.replaceAll("_", " ")}`,
      nextAction: "Open incident workspace",
      href: `/admin/disputes?disputeId=${dispute.id}`,
      createdAt: dispute.updatedAt,
      ageLabel: formatAge(dispute.updatedAt, now),
    });
  }

  for (const verification of verifications) {
    const ageDays = Math.floor((now.getTime() - verification.createdAt.getTime()) / (24 * 60 * 60 * 1000));
    queue.push({
      id: `verification:${verification.id}`,
      module: "Verifications",
      severity: ageDays >= 7 ? "high" : "medium",
      entityType: "verification",
      entityId: verification.id,
      entityLabel: verification.title,
      reason: `Verification ${verification.status.replaceAll("_", " ")}`,
      nextAction: verification.evidenceSummary ? "Review evidence summary" : "Request or record evidence summary",
      href: `/admin/verifications?verificationId=${verification.id}`,
      createdAt: verification.createdAt,
      ageLabel: formatAge(verification.createdAt, now),
    });
  }

  for (const application of partnerApplications.filter((app) => ["submitted", "under_review", "needs_information"].includes(app.status))) {
    const ageDays = Math.floor((now.getTime() - (application.submittedAt ?? application.updatedAt).getTime()) / (24 * 60 * 60 * 1000));
    queue.push({
      id: `partner:${application.id}`,
      module: "Partner Operations",
      severity: ageDays >= 7 ? "high" : "medium",
      entityType: "partner_application",
      entityId: application.id,
      entityLabel: application.displayName ?? application.legalName ?? application.email ?? application.user.email,
      reason: `Partner ${application.status.replaceAll("_", " ")}`,
      nextAction: "Review application and readiness blockers",
      href: `/admin/partner-operations?applicationId=${application.id}`,
      createdAt: application.submittedAt ?? application.updatedAt,
      ageLabel: formatAge(application.submittedAt ?? application.updatedAt, now),
    });
  }

  for (const reservation of upcomingWithoutHandover) {
    queue.push({
      id: `reservation-handover:${reservation.id}`,
      module: "Handover",
      severity: "high",
      entityType: "reservation",
      entityId: reservation.id,
      entityLabel: reservation.listingTitleSnapshot ?? reservation.Home?.approvedTitle ?? reservation.Home?.title ?? reservation.id,
      reason: "Upcoming booking without handover task",
      nextAction: "Create handover task",
      href: `/admin/bookings?reservationId=${reservation.id}`,
      createdAt: reservation.startDate,
      ageLabel: `arrives ${formatAge(now, reservation.startDate) ?? ""}`,
    });
  }

  for (const task of handoverTasks.filter((task) => task.status === "issue_reported")) {
    queue.push({
      id: `handover:${task.id}`,
      module: "Handover",
      severity: "high",
      entityType: "handover_task",
      entityId: task.id,
      entityLabel: task.taskNumber,
      reason: "Handover issue reported",
      nextAction: "Open issue workspace or create dispute",
      href: `/admin/handover?taskId=${task.id}`,
      createdAt: task.updatedAt,
      ageLabel: formatAge(task.updatedAt, now),
    });
  }

  for (const home of [...listingsMissingPrice.slice(0, 20), ...listingsMissingMedia.slice(0, 20)]) {
    const missingPrice = !home.price || home.price <= 0;
    queue.push({
      id: `listing:${home.id}:${missingPrice ? "price" : "media"}`,
      module: "Property Trust",
      severity: "medium",
      entityType: "listing",
      entityId: home.id,
      entityLabel: home.approvedTitle ?? home.title ?? "Listing",
      reason: missingPrice ? "Listing missing pricing" : "Listing missing media",
      nextAction: "Open property trust readiness",
      href: `/admin/property-trust?homeId=${home.id}`,
      createdAt: home.updatedAt,
      ageLabel: formatAge(home.updatedAt, now),
    });
  }

  if (translationProblems > 0 || listingsWithTranslationIssues.length > 0) {
    queue.push({
      id: "globalization:translations",
      module: "Globalization",
      severity: "medium",
      entityType: "translation_inventory",
      entityLabel: "Translation inventory",
      reason: "Stale or failed translations",
      nextAction: "Open inventory and sync/review language coverage",
      href: "/admin/globalization?tab=inventory",
      createdAt: localizationSettings?.updatedAt ?? now,
      ageLabel: formatAge(localizationSettings?.updatedAt ?? now, now),
    });
  }

  const sortedQueue = sortCommandQueue(queue);
  const blockers = queueToBlockers(sortedQueue);

  const healthMatrix: HealthMatrixArea[] = [
    {
      id: "supply",
      label: "Supply readiness",
      score: scoreFromSignals({
        positive: approvedListings.length,
        warning: pendingListings.length + listingsMissingMedia.length + listingsMissingPrice.length,
        critical: 0,
        foundation: true,
      }),
      status: approvedListings.length ? "operational" : "foundation",
      detail: `${approvedListings.length} public listings, ${pendingListings.length} in review, ${listingsMissingPrice.length} missing pricing.`,
      href: "/admin/property-trust",
      blockers: pendingListings.length + listingsMissingMedia.length + listingsMissingPrice.length,
    },
    {
      id: "demand",
      label: "Demand readiness",
      score: scoreFromSignals({
        positive: reservations.length + users.length,
        warning: users.filter((user) => user._count.Reservation === 0).length,
        critical: 0,
        foundation: true,
      }),
      status: users.length ? "operational" : "foundation",
      detail: `${users.length} non-admin accounts, ${reservations.length} active/upcoming reservations.`,
      href: "/admin/guests",
      blockers: 0,
    },
    {
      id: "payment",
      label: "Payment readiness",
      score: scoreFromSignals({
        positive: paypal.isConfigured ? 1 : 0,
        warning: paymentRecords.filter((payment) => payment.status === "pending_approval" || payment.status === "authorized").length,
        critical: paypal.isConfigured ? paymentRecords.filter((payment) => ["failed", "requires_review"].includes(payment.status)).length : 1,
      }),
      status: paypal.status,
      detail: `${paymentRecords.length} payment records needing attention. PayPal ${paypal.environment}.`,
      href: "/admin/payments",
      blockers: paypal.isConfigured ? paymentRecords.length : paymentRecords.length + 1,
    },
    {
      id: "trust",
      label: "Trust and safety",
      score: scoreFromSignals({
        positive: 1,
        warning: verifications.length,
        critical: disputes.filter((dispute) => dispute.priority === "urgent").length,
      }),
      status: disputes.length || verifications.length ? "requires_review" : "operational",
      detail: `${disputes.length} active disputes, ${verifications.length} pending verifications.`,
      href: "/admin/disputes",
      blockers: disputes.length + verifications.length,
    },
    {
      id: "handover",
      label: "Handover readiness",
      score: scoreFromSignals({
        positive: handoverTasks.length,
        warning: upcomingWithoutHandover.length,
        critical: handoverTasks.filter((task) => task.status === "issue_reported").length,
        foundation: true,
      }),
      status: handoverTasks.length ? "operational" : "foundation",
      detail: `${handoverTasks.length} active tasks, ${upcomingWithoutHandover.length} upcoming stays missing handover.`,
      href: "/admin/handover",
      blockers: upcomingWithoutHandover.length + handoverTasks.filter((task) => task.status === "issue_reported").length,
    },
    {
      id: "localization",
      label: "Localization readiness",
      score: scoreFromSignals({
        positive: localizationSettings ? 1 : 0,
        warning: listingsWithTranslationIssues.length + translationProblems,
        critical: 0,
        foundation: true,
      }),
      status: localizationSettings ? "operational" : "foundation",
      detail: `${localizationSettings?.enabledLanguages.split(",").filter(Boolean).length ?? 0} languages, ${translationProblems} stale/failed entries.`,
      href: "/admin/globalization",
      blockers: listingsWithTranslationIssues.length + translationProblems,
    },
    {
      id: "partner",
      label: "Partner readiness",
      score: scoreFromSignals({
        positive: partnerApplications.filter((app) => app.status === "approved").length,
        warning: partnerApplications.filter((app) => ["submitted", "under_review", "needs_information"].includes(app.status)).length,
        critical: partnerApplications.filter((app) => app.status === "suspended").length,
        foundation: true,
      }),
      status: partnerApplications.length ? "operational" : "foundation",
      detail: `${partnerApplications.length} applications, ${partnerApplications.filter((app) => ["submitted", "under_review", "needs_information"].includes(app.status)).length} need action.`,
      href: "/admin/partner-operations",
      blockers: partnerApplications.filter((app) => ["submitted", "under_review", "needs_information"].includes(app.status)).length,
    },
    {
      id: "guest",
      label: "Guest readiness",
      score: scoreFromSignals({
        positive: users.length,
        warning: premiumProfiles.filter((profile) => ["candidate", "under_review"].includes(profile.status)).length,
        critical: 0,
        foundation: true,
      }),
      status: users.length ? "operational" : "foundation",
      detail: `${users.length} guests/hosts, ${premiumProfiles.length} premium pipeline profiles.`,
      href: "/admin/guests",
      blockers: premiumProfiles.filter((profile) => ["candidate", "under_review"].includes(profile.status)).length,
    },
  ];

  const moduleSummaries: ModuleCommandSummary[] = ADMIN_MODULES.map((moduleMeta) => {
    const moduleQueue = sortedQueue.filter((item) =>
      item.module.toLowerCase().replaceAll(" ", "_").includes(moduleMeta.id.split("_")[0]) ||
      (moduleMeta.id === "property_trust" && item.module === "Property Trust") ||
      (moduleMeta.id === "globalization" && item.module === "Globalization") ||
      (moduleMeta.id === "payments" && item.module === "Payments") ||
      (moduleMeta.id === "disputes" && item.module === "Disputes") ||
      (moduleMeta.id === "verifications" && item.module === "Verifications") ||
      (moduleMeta.id === "handover" && item.module === "Handover") ||
      (moduleMeta.id === "partner_operations" && item.module === "Partner Operations")
    );
    const area = healthMatrix.find((health) => {
      if (moduleMeta.id === "marketplace_operations") return false;
      if (moduleMeta.id === "property_trust") return health.id === "supply";
      if (moduleMeta.id === "globalization") return health.id === "localization";
      if (moduleMeta.id === "partner_operations") return health.id === "partner";
      if (moduleMeta.id === "premium_guests") return health.id === "guest";
      return health.id === moduleMeta.id.replace("_operations", "");
    });

    return {
      id: moduleMeta.id,
      title: moduleMeta.title,
      href: moduleMeta.href,
      count: area?.score ?? null,
      openWork: moduleQueue.length,
      severity: moduleQueue[0]?.severity ?? "info",
      status: area?.status ?? (moduleQueue.length ? "requires_review" : "operational"),
      lastActivity: latestAudit?.createdAt ?? null,
      nextAction: moduleQueue[0]?.nextAction ?? "Open module workspace",
      providerState: moduleMeta.requiresProvider === "paypal" ? paypal.status : null,
    };
  });

  return {
    now,
    paypal,
    currencySettings,
    localizationSettings,
    homepageSections,
    latestAudit,
    counts: {
      approvedListings: approvedListings.length,
      pendingListings: pendingListings.length,
      reservations: reservations.length,
      users: users.length,
      payments: paymentRecords.length,
      disputes: disputes.length,
      verifications: verifications.length,
      premiumProfiles: premiumProfiles.length,
      handoverTasks: handoverTasks.length,
      translationProblems,
      upcomingWithoutHandover: upcomingWithoutHandover.length,
    },
    queue: sortedQueue,
    blockers,
    healthMatrix,
    moduleSummaries,
    timeline,
  };
}
