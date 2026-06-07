import "server-only";

import { unstable_noStore as noStore } from "next/cache";
import type { Prisma } from "@prisma/client";
import prisma from "./db";
import { formatCurrencyAmount } from "./marketplaceStatus";
import {
  buildBaseGuestWhere,
  guestFilterHref,
  guestMatchesFilters,
  guestMatchesSegment,
  normalizeGuestFilters,
  type GuestSearchParams,
  type NormalizedGuestFilters,
} from "./guestFilters";
import {
  analyzeGuest,
  disputeReference,
  guestDisplayName,
  guestInitials,
  paymentReference,
  reservationReference,
  type GuestIntelligence,
  type GuestReviewSeverity,
  type GuestReviewTrigger,
} from "./guestIntelligence";

export type GuestOperationsRow = {
  id: string;
  name: string;
  initials: string;
  email: string;
  role: string;
  accountAgeLabel: string;
  reservationCount: number;
  favoriteCount: number;
  upcomingCurrentStay: string;
  paymentHealth: string;
  disputeExposureLabel: string;
  handoverExposureLabel: string;
  verificationState: string;
  premiumState: string;
  preferredLanguage: string | null;
  preferredCurrency: string | null;
  riskLevel: string;
  readinessScore: number | null;
  valueSignal: string;
  valueSignalDetail: string;
  latestActivityIso: string | null;
  latestActivityLabel: string;
  nextActionLabel: string;
  nextActionHref?: string;
  rowHref: string;
  reviewReasons: string[];
  triggerSeverity: GuestReviewSeverity;
  canCreateVerification: boolean;
  createVerificationDisabledReason: string | null;
  canCreatePremiumProfile: boolean;
  createPremiumProfileDisabledReason: string | null;
  hasUpcomingStay: boolean;
  hasCurrentStay: boolean;
  paymentRisk: boolean;
  openDisputeExposure: boolean;
  disputeExposure: boolean;
  repeatedDisputeExposure: boolean;
  handoverIssueExposure: boolean;
  unresolvedHandoverIssue: boolean;
  verificationPending: boolean;
  verificationMissing: boolean;
  verificationRejected: boolean;
  premiumCandidate: boolean;
  premiumReady: boolean;
  premiumProfileExists: boolean;
  requiresOperatorReview: boolean;
  newGuest: boolean;
  activeGuest: boolean;
};

export type GuestPortfolioHealthItem = {
  id: string;
  label: string;
  score: number | null;
  status: string;
  detail: string;
};

export type GuestQueueItem = {
  id: string;
  guestId: string;
  guestName: string;
  guestEmail: string;
  triggerReason: string;
  severity: GuestReviewSeverity;
  sourceType: string;
  sourceId?: string | null;
  sourceHref?: string | null;
  recommendedAction: string;
  rowHref: string;
};

export type GuestTimelineItem = {
  id: string;
  sourceModule: string;
  type: string;
  summary: string;
  createdAt: Date;
  actor?: string | null;
  href?: string;
  linkedRecord?: string | null;
};

type LoadedGuest = Awaited<ReturnType<typeof loadGuests>>[number];
type LoadedReservation = Awaited<ReturnType<typeof loadReservations>>[number];
type LoadedPayment = Awaited<ReturnType<typeof loadPayments>>[number];
type LoadedDispute = Awaited<ReturnType<typeof loadDisputes>>[number];
type LoadedHandover = Awaited<ReturnType<typeof loadHandovers>>[number];
type LoadedVerification = Awaited<ReturnType<typeof loadVerifications>>[number];
type LoadedPremiumProfile = Awaited<ReturnType<typeof loadPremiumProfiles>>[number];
type LoadedFavorite = Awaited<ReturnType<typeof loadFavorites>>[number];
type LoadedAuditEvent = Awaited<ReturnType<typeof loadSelectedAuditEvents>>[number];

export type GuestOperationsDetail = {
  guest: LoadedGuest;
  intelligence: GuestIntelligence;
  reservations: LoadedReservation[];
  payments: LoadedPayment[];
  disputes: LoadedDispute[];
  handovers: LoadedHandover[];
  verifications: LoadedVerification[];
  premiumProfile: LoadedPremiumProfile | null;
  favorites: LoadedFavorite[];
  auditEvents: LoadedAuditEvent[];
  timeline: GuestTimelineItem[];
};

function unique(values: (string | null | undefined)[]) {
  return Array.from(new Set(values.filter(Boolean) as string[]));
}

function iso(value?: Date | null) {
  return value ? value.toISOString() : null;
}

function severityRank(severity: GuestReviewSeverity) {
  if (severity === "critical") return 5;
  if (severity === "high") return 4;
  if (severity === "medium") return 3;
  if (severity === "low") return 2;
  return 1;
}

function highestSeverity(triggers: GuestReviewTrigger[]): GuestReviewSeverity {
  return triggers.reduce<GuestReviewSeverity>((highest, trigger) => (
    severityRank(trigger.severity) > severityRank(highest) ? trigger.severity : highest
  ), "info");
}

function statusFromSignal(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "foundation";
}

function formatMoney(value?: number | string | { toString(): string } | null, currency = "USD") {
  if (value === null || value === undefined) return "Not set";
  return formatCurrencyAmount(Number(value.toString()), currency);
}

function propertyTitle(property?: { approvedTitle?: string | null; title?: string | null } | null) {
  return property?.approvedTitle ?? property?.title ?? "Property not linked";
}

function buildPagination(filters: NormalizedGuestFilters, totalCount: number, visibleCount: number) {
  const totalPages = Math.max(1, Math.ceil(visibleCount / filters.pageSize));
  const safePage = Math.min(filters.page, totalPages);
  const from = visibleCount ? (safePage - 1) * filters.pageSize + 1 : 0;
  const to = Math.min(visibleCount, safePage * filters.pageSize);

  return {
    page: safePage,
    totalPages,
    totalCount,
    visibleCount,
    from,
    to,
    previousHref: safePage > 1 ? guestFilterHref(filters, { page: safePage - 1, guestId: null }) : null,
    nextHref: safePage < totalPages ? guestFilterHref(filters, { page: safePage + 1, guestId: null }) : null,
  };
}

async function loadGuests(where: Prisma.UserWhereInput) {
  return prisma.user.findMany({
    where,
    orderBy: [{ email: "asc" }],
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      profileImage: true,
      _count: { select: { Reservation: true, Favorite: true, Review: true } },
    },
  });
}

async function loadReservations(guestIds: string[]) {
  if (!guestIds.length) return [];
  return prisma.reservation.findMany({
    where: { userId: { in: guestIds } },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      userId: true,
      homeId: true,
      bookingStatus: true,
      startDate: true,
      endDate: true,
      createdAt: true,
      cancelledAt: true,
      completedAt: true,
      nightlyPriceSnapshot: true,
      cleaningFeeSnapshot: true,
      securityDepositSnapshot: true,
      totalNightsSnapshot: true,
      subtotalSnapshot: true,
      totalSnapshot: true,
      currencySnapshot: true,
      listingTitleSnapshot: true,
      listingCitySnapshot: true,
      listingPropertyTypeSnapshot: true,
      Home: {
        select: {
          id: true,
          title: true,
          approvedTitle: true,
          city: true,
          country: true,
          userId: true,
        },
      },
    },
  });
}

async function loadPayments(guestIds: string[], reservationIds: string[]) {
  if (!guestIds.length && !reservationIds.length) return [];
  return prisma.paymentRecord.findMany({
    where: {
      OR: [
        guestIds.length ? { guestId: { in: guestIds } } : { id: "__no_guest_payment__" },
        reservationIds.length ? { reservationId: { in: reservationIds } } : { id: "__no_reservation_payment__" },
      ],
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      reservationId: true,
      bookingId: true,
      guestId: true,
      propertyId: true,
      partnerId: true,
      amount: true,
      currency: true,
      provider: true,
      providerEnvironment: true,
      providerOrderId: true,
      providerAuthorizationId: true,
      providerCaptureId: true,
      providerStatus: true,
      status: true,
      method: true,
      failureReason: true,
      capturedAt: true,
      authorizedAt: true,
      cancelledAt: true,
      createdAt: true,
      updatedAt: true,
      events: {
        orderBy: { createdAt: "desc" },
        take: 12,
        select: {
          id: true,
          type: true,
          providerEventId: true,
          summary: true,
          createdAt: true,
          createdById: true,
        },
      },
    },
  });
}

async function loadHandovers(guestIds: string[], reservationIds: string[]) {
  if (!guestIds.length && !reservationIds.length) return [];
  return prisma.handoverTask.findMany({
    where: {
      OR: [
        guestIds.length ? { guestId: { in: guestIds } } : { id: "__no_guest_handover__" },
        reservationIds.length ? { reservationId: { in: reservationIds } } : { id: "__no_reservation_handover__" },
      ],
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      taskNumber: true,
      reservationId: true,
      propertyId: true,
      guestId: true,
      partnerId: true,
      type: true,
      status: true,
      priority: true,
      scheduledFor: true,
      completedAt: true,
      title: true,
      summary: true,
      checklist: true,
      createdAt: true,
      updatedAt: true,
      events: {
        orderBy: { createdAt: "desc" },
        take: 12,
        select: {
          id: true,
          type: true,
          message: true,
          createdAt: true,
          createdById: true,
        },
      },
    },
  });
}

async function loadDisputes(guestIds: string[], reservationIds: string[], paymentIds: string[]) {
  if (!guestIds.length && !reservationIds.length && !paymentIds.length) return [];
  return prisma.disputeCase.findMany({
    where: {
      OR: [
        guestIds.length ? { guestId: { in: guestIds } } : { id: "__no_guest_dispute__" },
        reservationIds.length ? { reservationId: { in: reservationIds } } : { id: "__no_reservation_dispute__" },
        paymentIds.length ? { paymentRecordId: { in: paymentIds } } : { id: "__no_payment_dispute__" },
      ],
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      caseNumber: true,
      type: true,
      status: true,
      priority: true,
      reservationId: true,
      paymentRecordId: true,
      propertyId: true,
      guestId: true,
      partnerId: true,
      title: true,
      summary: true,
      resolution: true,
      assignedToId: true,
      openedAt: true,
      resolvedAt: true,
      closedAt: true,
      createdAt: true,
      updatedAt: true,
      events: {
        orderBy: { createdAt: "desc" },
        take: 12,
        select: {
          id: true,
          type: true,
          message: true,
          createdAt: true,
          createdById: true,
        },
      },
    },
  });
}

async function loadVerifications(guestIds: string[]) {
  if (!guestIds.length) return [];
  return prisma.verificationRecord.findMany({
    where: { entityType: "guest", entityId: { in: guestIds } },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      entityType: true,
      entityId: true,
      category: true,
      status: true,
      title: true,
      summary: true,
      evidenceSummary: true,
      reviewedAt: true,
      expiresAt: true,
      createdAt: true,
      updatedAt: true,
      events: {
        orderBy: { createdAt: "desc" },
        take: 12,
        select: {
          id: true,
          type: true,
          message: true,
          createdAt: true,
          createdById: true,
        },
      },
    },
  });
}

async function loadPremiumProfiles(guestIds: string[]) {
  if (!guestIds.length) return [];
  return prisma.premiumGuestProfile.findMany({
    where: { userId: { in: guestIds } },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    include: {
      events: {
        orderBy: { createdAt: "desc" },
        take: 12,
      },
    },
  });
}

async function loadFavorites(guestIds: string[]) {
  if (!guestIds.length) return [];
  return prisma.favorite.findMany({
    where: { userId: { in: guestIds } },
    orderBy: { createAt: "desc" },
    select: {
      id: true,
      userId: true,
      homeId: true,
      createAt: true,
      Home: {
        select: {
          id: true,
          title: true,
          approvedTitle: true,
          city: true,
          country: true,
          listingStatus: true,
          contentReviewStatus: true,
        },
      },
    },
  });
}

async function loadSelectedAuditEvents(targetIds: string[]) {
  if (!targetIds.length) return [];
  return prisma.adminAuditEvent.findMany({
    where: { targetId: { in: targetIds } },
    orderBy: { createdAt: "desc" },
    take: 80,
  });
}

function groupByGuestId<T>(items: T[], resolveGuestId: (item: T) => string | null | undefined) {
  return items.reduce<Map<string, T[]>>((acc, item) => {
    const guestId = resolveGuestId(item);
    if (!guestId) return acc;
    const list = acc.get(guestId) ?? [];
    list.push(item);
    acc.set(guestId, list);
    return acc;
  }, new Map<string, T[]>());
}

function createRow({
  guest,
  intelligence,
  reservations,
  favorites,
  premiumProfile,
  filters,
}: {
  guest: LoadedGuest;
  intelligence: GuestIntelligence;
  reservations: LoadedReservation[];
  favorites: LoadedFavorite[];
  premiumProfile: LoadedPremiumProfile | null;
  filters: NormalizedGuestFilters;
}): GuestOperationsRow {
  const primaryAction = intelligence.nextBestActions[0];
  const verificationState = intelligence.verificationRejected
    ? "rejected"
    : intelligence.verificationPending
      ? "pending"
      : intelligence.verificationVerified
        ? "verified"
        : "missing";
  const premiumState = premiumProfile?.status ?? (intelligence.premiumCandidate ? "candidate" : "none");

  return {
    id: guest.id,
    name: guestDisplayName(guest),
    initials: guestInitials(guest),
    email: guest.email,
    role: guest.role,
    accountAgeLabel: intelligence.accountAgeLabel,
    reservationCount: reservations.length,
    favoriteCount: favorites.length,
    upcomingCurrentStay: intelligence.hasCurrentStay ? intelligence.currentStayLabel : intelligence.upcomingStayLabel,
    paymentHealth: intelligence.paymentReliabilitySignal.label,
    disputeExposureLabel: intelligence.disputeExposureSignal.label,
    handoverExposureLabel: intelligence.stayExecutionSignal.label,
    verificationState,
    premiumState,
    preferredLanguage: premiumProfile?.preferredLanguage ?? null,
    preferredCurrency: premiumProfile?.preferredCurrency ?? null,
    riskLevel: intelligence.guestRiskLevel,
    readinessScore: intelligence.guestReadinessScore,
    valueSignal: intelligence.guestValueSignal.label,
    valueSignalDetail: intelligence.guestValueSignal.detail,
    latestActivityIso: iso(intelligence.latestActivityAt),
    latestActivityLabel: intelligence.latestActivityLabel,
    nextActionLabel: primaryAction?.label ?? "Monitor",
    nextActionHref: primaryAction?.href,
    rowHref: guestFilterHref(filters, { guestId: guest.id }),
    reviewReasons: intelligence.reviewTriggers.map((trigger) => trigger.reason),
    triggerSeverity: highestSeverity(intelligence.reviewTriggers),
    canCreateVerification: intelligence.canCreateVerification,
    createVerificationDisabledReason: intelligence.createVerificationDisabledReason,
    canCreatePremiumProfile: intelligence.canCreatePremiumProfile,
    createPremiumProfileDisabledReason: intelligence.createPremiumProfileDisabledReason,
    hasUpcomingStay: intelligence.hasUpcomingStay,
    hasCurrentStay: intelligence.hasCurrentStay,
    paymentRisk: intelligence.paymentRequiresReview || intelligence.failedPaymentExposure || intelligence.manualSettlementExposure,
    openDisputeExposure: intelligence.openDisputeExposure,
    disputeExposure: intelligence.openDisputeExposure || intelligence.repeatedDisputeExposure || intelligence.disputeExposureSignal.label !== "No dispute exposure",
    repeatedDisputeExposure: intelligence.repeatedDisputeExposure,
    handoverIssueExposure: intelligence.handoverIssueExposure,
    unresolvedHandoverIssue: intelligence.unresolvedHandoverIssue,
    verificationPending: intelligence.verificationPending,
    verificationMissing: intelligence.verificationMissing,
    verificationRejected: intelligence.verificationRejected,
    premiumCandidate: intelligence.premiumCandidate,
    premiumReady: intelligence.premiumReady,
    premiumProfileExists: intelligence.premiumProfileExists,
    requiresOperatorReview: intelligence.requiresOperatorReview,
    newGuest: intelligence.newGuest,
    activeGuest: intelligence.activeGuest,
  };
}

function averageScore(rows: GuestOperationsRow[], getter: (row: GuestOperationsRow) => number | null) {
  const scores = rows.map(getter).filter((value): value is number => value !== null);
  if (!scores.length) return null;
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

function percentage(count: number, total: number) {
  if (!total) return null;
  return Math.round((count / total) * 100);
}

function buildPortfolioHealth(rows: GuestOperationsRow[]): GuestPortfolioHealthItem[] {
  const guestsWithReservations = rows.filter((row) => row.reservationCount > 0);
  const guestsWithExecutionHistory = rows.filter((row) => row.reservationCount > 0 || row.handoverIssueExposure);
  const trustScore = percentage(rows.filter((row) => row.verificationState === "verified" || (!row.verificationRejected && !row.openDisputeExposure && !row.paymentRisk)).length, rows.length);
  const paymentScore = guestsWithReservations.length
    ? percentage(guestsWithReservations.filter((row) => !row.paymentRisk).length, guestsWithReservations.length)
    : null;
  const executionScore = guestsWithExecutionHistory.length
    ? percentage(guestsWithExecutionHistory.filter((row) => !row.unresolvedHandoverIssue).length, guestsWithExecutionHistory.length)
    : null;
  const premiumScore = rows.some((row) => row.premiumCandidate || row.premiumProfileExists)
    ? percentage(rows.filter((row) => row.premiumReady || row.premiumCandidate || row.premiumProfileExists).length, rows.length)
    : null;
  const verificationCoverage = guestsWithReservations.length
    ? percentage(guestsWithReservations.filter((row) => !row.verificationMissing).length, guestsWithReservations.length)
    : null;
  const supportScore = guestsWithReservations.length
    ? percentage(guestsWithReservations.filter((row) => !row.openDisputeExposure && !row.repeatedDisputeExposure).length, guestsWithReservations.length)
    : null;

  return [
    {
      id: "trust_health",
      label: "Trust health",
      score: trustScore,
      status: trustScore === null ? "foundation" : trustScore >= 80 ? "strong" : trustScore >= 55 ? "watch" : "risk",
      detail: trustScore === null ? "Foundation state: no guest records loaded." : "Combines verification, dispute, and payment-risk absence.",
    },
    {
      id: "payment_reliability",
      label: "Payment reliability",
      score: paymentScore,
      status: paymentScore === null ? "insufficient history" : paymentScore >= 80 ? "strong" : paymentScore >= 55 ? "watch" : "risk",
      detail: paymentScore === null ? "Insufficient reservation/payment history." : `${guestsWithReservations.filter((row) => row.paymentRisk).length} reservation guests show payment risk.`,
    },
    {
      id: "stay_execution",
      label: "Stay execution quality",
      score: executionScore,
      status: executionScore === null ? "foundation state" : executionScore >= 80 ? "strong" : executionScore >= 55 ? "watch" : "risk",
      detail: executionScore === null ? "Handover quality appears after bookings and HandoverTask records exist." : `${guestsWithExecutionHistory.filter((row) => row.unresolvedHandoverIssue).length} guests have unresolved handover issue exposure.`,
    },
    {
      id: "premium_pipeline",
      label: "Premium pipeline",
      score: premiumScore,
      status: premiumScore === null ? "foundation state" : premiumScore >= 35 ? "active" : "early",
      detail: premiumScore === null ? "No deterministic premium candidates or profiles yet." : `${rows.filter((row) => row.premiumCandidate).length} candidates and ${rows.filter((row) => row.premiumProfileExists).length} profiles.`,
    },
    {
      id: "verification_coverage",
      label: "Verification coverage",
      score: verificationCoverage,
      status: verificationCoverage === null ? "insufficient history" : verificationCoverage >= 80 ? "strong" : verificationCoverage >= 55 ? "watch" : "gap",
      detail: verificationCoverage === null ? "Coverage is measured once guests have reservation history." : `${guestsWithReservations.filter((row) => row.verificationMissing).length} reservation guests have no guest verification record.`,
    },
    {
      id: "support_dispute",
      label: "Support/dispute exposure",
      score: supportScore,
      status: supportScore === null ? "foundation state" : supportScore >= 80 ? "controlled" : supportScore >= 55 ? "watch" : "exposed",
      detail: supportScore === null ? "Dispute exposure requires reservation history or dispute records." : `${guestsWithReservations.filter((row) => row.openDisputeExposure || row.repeatedDisputeExposure).length} reservation guests have dispute exposure.`,
    },
  ];
}

function buildMetrics(rows: GuestOperationsRow[]) {
  return {
    totalGuests: rows.length,
    activeGuests: rows.filter((row) => row.activeGuest).length,
    guestsWithReservations: rows.filter((row) => row.reservationCount > 0).length,
    repeatGuests: rows.filter((row) => row.reservationCount >= 2).length,
    premiumCandidates: rows.filter((row) => row.premiumCandidate).length,
    verificationPending: rows.filter((row) => row.verificationPending).length,
    disputeExposedGuests: rows.filter((row) => row.disputeExposure).length,
    paymentRiskGuests: rows.filter((row) => row.paymentRisk).length,
    handoverIssueExposedGuests: rows.filter((row) => row.handoverIssueExposure).length,
    averageReadiness: averageScore(rows, (row) => row.readinessScore),
  };
}

function buildQueue(rows: GuestOperationsRow[], intelligenceByGuestId: Map<string, GuestIntelligence>) {
  return rows
    .flatMap((row) => {
      const intelligence = intelligenceByGuestId.get(row.id);
      return (intelligence?.reviewTriggers ?? []).map<GuestQueueItem>((trigger) => ({
        id: trigger.id,
        guestId: row.id,
        guestName: row.name,
        guestEmail: row.email,
        triggerReason: trigger.reason,
        severity: trigger.severity,
        sourceType: trigger.sourceType,
        sourceId: trigger.sourceId,
        sourceHref: trigger.sourceHref,
        recommendedAction: trigger.recommendedAction,
        rowHref: row.rowHref,
      }));
    })
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

function buildSegmentCounts(rows: GuestOperationsRow[]) {
  return {
    all: rows.length,
    new: rows.filter((row) => guestMatchesSegment(row, "new")).length,
    active: rows.filter((row) => guestMatchesSegment(row, "active")).length,
    with_reservations: rows.filter((row) => guestMatchesSegment(row, "with_reservations")).length,
    repeat: rows.filter((row) => guestMatchesSegment(row, "repeat")).length,
    upcoming_stays: rows.filter((row) => guestMatchesSegment(row, "upcoming_stays")).length,
    current_stays: rows.filter((row) => guestMatchesSegment(row, "current_stays")).length,
    payment_risk: rows.filter((row) => guestMatchesSegment(row, "payment_risk")).length,
    dispute_exposure: rows.filter((row) => guestMatchesSegment(row, "dispute_exposure")).length,
    handover_issue_exposure: rows.filter((row) => guestMatchesSegment(row, "handover_issue_exposure")).length,
    verification_pending: rows.filter((row) => guestMatchesSegment(row, "verification_pending")).length,
    verification_missing: rows.filter((row) => guestMatchesSegment(row, "verification_missing")).length,
    premium_candidates: rows.filter((row) => guestMatchesSegment(row, "premium_candidates")).length,
    premium_ready: rows.filter((row) => guestMatchesSegment(row, "premium_ready")).length,
    no_reservations: rows.filter((row) => guestMatchesSegment(row, "no_reservations")).length,
    requires_review: rows.filter((row) => guestMatchesSegment(row, "requires_review")).length,
  };
}

function buildTimeline(detail: Omit<GuestOperationsDetail, "timeline">): GuestTimelineItem[] {
  const items: GuestTimelineItem[] = [];

  detail.reservations.forEach((reservation) => {
    items.push({
      id: `reservation-${reservation.id}`,
      sourceModule: "bookings",
      type: "reservation",
      summary: `${reservationReference(reservation.id)} ${reservation.bookingStatus} - ${reservation.listingTitleSnapshot ?? propertyTitle(reservation.Home)}`,
      createdAt: reservation.createdAt,
      href: `/admin/bookings?bookingId=${reservation.id}`,
      linkedRecord: reservation.id,
    });
  });

  detail.payments.forEach((payment) => {
    items.push({
      id: `payment-${payment.id}`,
      sourceModule: "payments",
      type: "payment_record",
      summary: `${paymentReference(payment.id)} ${payment.status} - ${formatMoney(payment.amount, payment.currency)}`,
      createdAt: payment.updatedAt ?? payment.createdAt,
      href: `/admin/payments?paymentId=${payment.id}`,
      linkedRecord: payment.id,
    });
    payment.events.forEach((event) => {
      items.push({
        id: `payment-event-${event.id}`,
        sourceModule: "payments",
        type: event.type,
        summary: event.summary,
        createdAt: event.createdAt,
        actor: event.createdById,
        href: `/admin/payments?paymentId=${payment.id}`,
        linkedRecord: payment.id,
      });
    });
  });

  detail.handovers.forEach((handover) => {
    items.push({
      id: `handover-${handover.id}`,
      sourceModule: "handover",
      type: "handover_task",
      summary: `${handover.taskNumber} ${handover.status} - ${handover.title}`,
      createdAt: handover.updatedAt ?? handover.createdAt,
      href: `/admin/handover?handoverId=${handover.id}`,
      linkedRecord: handover.id,
    });
    handover.events.forEach((event) => {
      items.push({
        id: `handover-event-${event.id}`,
        sourceModule: "handover",
        type: event.type,
        summary: event.message,
        createdAt: event.createdAt,
        actor: event.createdById,
        href: `/admin/handover?handoverId=${handover.id}`,
        linkedRecord: handover.id,
      });
    });
  });

  detail.disputes.forEach((dispute) => {
    items.push({
      id: `dispute-${dispute.id}`,
      sourceModule: "disputes",
      type: "dispute_case",
      summary: `${disputeReference(dispute.caseNumber, dispute.id)} ${dispute.status} - ${dispute.title}`,
      createdAt: dispute.updatedAt ?? dispute.createdAt,
      href: `/admin/disputes?disputeId=${dispute.id}`,
      linkedRecord: dispute.id,
    });
    dispute.events.forEach((event) => {
      items.push({
        id: `dispute-event-${event.id}`,
        sourceModule: "disputes",
        type: event.type,
        summary: event.message,
        createdAt: event.createdAt,
        actor: event.createdById,
        href: `/admin/disputes?disputeId=${dispute.id}`,
        linkedRecord: dispute.id,
      });
    });
  });

  detail.verifications.forEach((verification) => {
    items.push({
      id: `verification-${verification.id}`,
      sourceModule: "verifications",
      type: "verification_record",
      summary: `${verification.title} - ${verification.status}`,
      createdAt: verification.updatedAt ?? verification.createdAt,
      href: `/admin/verifications?verificationId=${verification.id}`,
      linkedRecord: verification.id,
    });
    verification.events.forEach((event) => {
      items.push({
        id: `verification-event-${event.id}`,
        sourceModule: "verifications",
        type: event.type,
        summary: event.message,
        createdAt: event.createdAt,
        actor: event.createdById,
        href: `/admin/verifications?verificationId=${verification.id}`,
        linkedRecord: verification.id,
      });
    });
  });

  if (detail.premiumProfile) {
    items.push({
      id: `premium-${detail.premiumProfile.id}`,
      sourceModule: "premiumGuests",
      type: "premium_profile",
      summary: `Premium profile ${detail.premiumProfile.status} - eligibility ${detail.premiumProfile.eligibilityScore}`,
      createdAt: detail.premiumProfile.updatedAt ?? detail.premiumProfile.createdAt,
      href: `/admin/premium-guests?profileId=${detail.premiumProfile.id}`,
      linkedRecord: detail.premiumProfile.id,
    });
    detail.premiumProfile.events.forEach((event) => {
      items.push({
        id: `premium-event-${event.id}`,
        sourceModule: "premiumGuests",
        type: event.type,
        summary: event.message,
        createdAt: event.createdAt,
        actor: event.createdById,
        href: `/admin/premium-guests?profileId=${detail.premiumProfile?.id}`,
        linkedRecord: detail.premiumProfile?.id,
      });
    });
  }

  detail.auditEvents.forEach((event) => {
    items.push({
      id: `audit-${event.id}`,
      sourceModule: event.module,
      type: event.action,
      summary: event.summary,
      createdAt: event.createdAt,
      actor: event.actorId,
      linkedRecord: event.targetId,
    });
  });

  return items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function getGuestOperationsData(searchParams?: GuestSearchParams) {
  noStore();
  const filters = normalizeGuestFilters(searchParams);
  const now = new Date();
  const where = buildBaseGuestWhere(filters);

  const [guests, roleCounts, totalGuestCount] = await Promise.all([
    loadGuests(where),
    prisma.user.groupBy({
      by: ["role"],
      where: { role: { notIn: ["admin", "super_admin"] } },
      _count: { _all: true },
    }),
    prisma.user.count({ where: { role: { notIn: ["admin", "super_admin"] } } }),
  ]);

  const guestIds = guests.map((guest) => guest.id);
  const [reservations, verifications, premiumProfiles, favorites] = await Promise.all([
    loadReservations(guestIds),
    loadVerifications(guestIds),
    loadPremiumProfiles(guestIds),
    loadFavorites(guestIds),
  ]);
  const reservationIds = reservations.map((reservation) => reservation.id);
  const payments = await loadPayments(guestIds, reservationIds);
  const paymentIds = payments.map((payment) => payment.id);
  const [handovers, disputes] = await Promise.all([
    loadHandovers(guestIds, reservationIds),
    loadDisputes(guestIds, reservationIds, paymentIds),
  ]);

  const reservationGuestById = new Map(reservations.map((reservation) => [reservation.id, reservation.userId]));
  const paymentGuestById = new Map(payments.map((payment) => [
    payment.id,
    payment.guestId ?? (payment.reservationId ? reservationGuestById.get(payment.reservationId) : null) ?? null,
  ]));
  const reservationsByGuestId = groupByGuestId(reservations, (reservation) => reservation.userId);
  const paymentsByGuestId = groupByGuestId(payments, (payment) => payment.guestId ?? (payment.reservationId ? reservationGuestById.get(payment.reservationId) : null));
  const disputesByGuestId = groupByGuestId(disputes, (dispute) => dispute.guestId ?? (dispute.reservationId ? reservationGuestById.get(dispute.reservationId) : null) ?? (dispute.paymentRecordId ? paymentGuestById.get(dispute.paymentRecordId) : null));
  const handoversByGuestId = groupByGuestId(handovers, (handover) => handover.guestId ?? (handover.reservationId ? reservationGuestById.get(handover.reservationId) : null));
  const verificationsByGuestId = groupByGuestId(verifications, (verification) => verification.entityId);
  const premiumByGuestId = new Map(premiumProfiles.map((profile) => [profile.userId, profile]));
  const favoritesByGuestId = groupByGuestId(favorites, (favorite) => favorite.userId);

  const intelligenceByGuestId = new Map<string, GuestIntelligence>();
  const allRows = guests.map((guest) => {
    const guestReservations = reservationsByGuestId.get(guest.id) ?? [];
    const guestPayments = paymentsByGuestId.get(guest.id) ?? [];
    const guestDisputes = disputesByGuestId.get(guest.id) ?? [];
    const guestHandovers = handoversByGuestId.get(guest.id) ?? [];
    const guestVerifications = verificationsByGuestId.get(guest.id) ?? [];
    const guestPremiumProfile = premiumByGuestId.get(guest.id) ?? null;
    const guestFavorites = favoritesByGuestId.get(guest.id) ?? [];
    const intelligence = analyzeGuest({
      guest,
      reservations: guestReservations,
      payments: guestPayments,
      disputes: guestDisputes,
      handovers: guestHandovers,
      verifications: guestVerifications,
      premiumProfile: guestPremiumProfile,
      favorites: guestFavorites,
      now,
    });
    intelligenceByGuestId.set(guest.id, intelligence);
    return createRow({
      guest,
      intelligence,
      reservations: guestReservations,
      favorites: guestFavorites,
      premiumProfile: guestPremiumProfile,
      filters,
    });
  });

  const filteredRows = allRows.filter((row) => guestMatchesFilters(row, filters, now));
  const pagination = buildPagination(filters, totalGuestCount, filteredRows.length);
  const start = (pagination.page - 1) * filters.pageSize;
  const visibleRows = filteredRows.slice(start, start + filters.pageSize);

  const selectedGuest = filters.selectedGuestId
    ? guests.find((guest) => guest.id === filters.selectedGuestId) ?? null
    : null;
  let selectedDetail: GuestOperationsDetail | null = null;
  if (selectedGuest) {
    const selectedReservations = reservationsByGuestId.get(selectedGuest.id) ?? [];
    const selectedPayments = paymentsByGuestId.get(selectedGuest.id) ?? [];
    const selectedDisputes = disputesByGuestId.get(selectedGuest.id) ?? [];
    const selectedHandovers = handoversByGuestId.get(selectedGuest.id) ?? [];
    const selectedVerifications = verificationsByGuestId.get(selectedGuest.id) ?? [];
    const selectedPremiumProfile = premiumByGuestId.get(selectedGuest.id) ?? null;
    const selectedFavorites = favoritesByGuestId.get(selectedGuest.id) ?? [];
    const targetIds = unique([
      selectedGuest.id,
      ...selectedReservations.map((item) => item.id),
      ...selectedPayments.map((item) => item.id),
      ...selectedDisputes.map((item) => item.id),
      ...selectedHandovers.map((item) => item.id),
      ...selectedVerifications.map((item) => item.id),
      selectedPremiumProfile?.id,
    ]);
    const auditEvents = await loadSelectedAuditEvents(targetIds);
    const intelligence = intelligenceByGuestId.get(selectedGuest.id) ?? analyzeGuest({
      guest: selectedGuest,
      reservations: selectedReservations,
      payments: selectedPayments,
      disputes: selectedDisputes,
      handovers: selectedHandovers,
      verifications: selectedVerifications,
      premiumProfile: selectedPremiumProfile,
      favorites: selectedFavorites,
      now,
    });
    const detailBase = {
      guest: selectedGuest,
      intelligence,
      reservations: selectedReservations,
      payments: selectedPayments,
      disputes: selectedDisputes,
      handovers: selectedHandovers,
      verifications: selectedVerifications,
      premiumProfile: selectedPremiumProfile,
      favorites: selectedFavorites,
      auditEvents,
    };
    selectedDetail = {
      ...detailBase,
      timeline: buildTimeline(detailBase),
    };
  }

  const recentActivity = [...allRows]
    .filter((row) => row.latestActivityIso)
    .sort((a, b) => new Date(b.latestActivityIso ?? 0).getTime() - new Date(a.latestActivityIso ?? 0).getTime())
    .slice(0, 8);

  const rightRail = {
    highestRiskGuests: allRows.filter((row) => ["critical", "high"].includes(row.riskLevel)).sort((a, b) => severityRank(b.triggerSeverity) - severityRank(a.triggerSeverity)).slice(0, 6),
    premiumCandidates: allRows.filter((row) => row.premiumCandidate).slice(0, 6),
    repeatGuests: allRows.filter((row) => row.reservationCount >= 2).slice(0, 6),
    paymentIssueGuests: allRows.filter((row) => row.paymentRisk).slice(0, 6),
    disputeExposedGuests: allRows.filter((row) => row.disputeExposure).slice(0, 6),
    verificationBlockers: allRows.filter((row) => row.verificationPending || (row.reservationCount > 0 && row.verificationMissing) || row.verificationRejected).slice(0, 6),
    recentActivity,
    cleanHistoryGuests: allRows.filter((row) => row.riskLevel === "low" && (row.readinessScore ?? 0) >= 80 && !row.requiresOperatorReview).slice(0, 6),
  };

  const filterOptions = {
    roles: roleCounts.map((role) => ({ value: role.role, label: role.role.replaceAll("_", " "), count: role._count._all })),
    languages: unique(allRows.map((row) => row.preferredLanguage)).sort(),
    currencies: unique(allRows.map((row) => row.preferredCurrency)).sort(),
  };

  return {
    filters,
    rows: allRows,
    filteredRows,
    visibleRows,
    selectedDetail,
    metrics: buildMetrics(allRows),
    totalGuestCount,
    portfolioHealth: buildPortfolioHealth(allRows),
    reviewQueue: buildQueue(allRows, intelligenceByGuestId).slice(0, 24),
    segmentCounts: buildSegmentCounts(allRows),
    filterOptions,
    pagination,
    rightRail,
  };
}
