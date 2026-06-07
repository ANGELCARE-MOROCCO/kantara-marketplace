import "server-only";

import { unstable_noStore as noStore } from "next/cache";
import type { Prisma } from "@prisma/client";
import prisma from "./db";
import {
  DISPUTE_AGE_BUCKETS,
  DISPUTE_PRIORITIES,
  DISPUTE_SOURCE_TYPES,
  DISPUTE_STATUSES,
  DISPUTE_TYPES,
  baseDisputeWhereFromFilters,
  normalizeDisputeFilters,
  type DisputeSearchParams,
  type DisputeSourceType,
  type NormalizedDisputeFilters,
} from "./disputeFilters";
import {
  DISPUTE_OUTCOMES,
  EVIDENCE_QUALITY_LEVELS,
  analyzeDisputeCase,
  disputeStatusLabel,
  disputeTypeLabel,
  normalizeEvidenceQuality,
  normalizeDisputeOutcome,
  type DisputeAttentionLevel,
  type DisputeEvidenceSummary,
  type DisputeInsight,
  type DisputeLinkedHandover,
  type DisputeLinkedPayment,
  type DisputeLinkedVerification,
  type DisputeResolutionRecord,
} from "./disputeIntelligence";
import { getDisputeCaseTimeline } from "./operationsTimeline";

export {
  DISPUTE_AGE_BUCKETS,
  DISPUTE_OUTCOMES,
  DISPUTE_PRIORITIES,
  DISPUTE_SOURCE_TYPES,
  DISPUTE_STATUSES,
  DISPUTE_TYPES,
  EVIDENCE_QUALITY_LEVELS,
};

const OPEN_DISPUTE_STATUSES = ["open", "under_review", "awaiting_guest", "awaiting_partner", "awaiting_admin", "reopened"];
const PAYMENT_REVIEW_STATUSES = ["failed", "requires_review", "pending_approval"];
const PAYMENT_SETTLED_STATUSES = ["captured", "authorized"];

export type DisputeOperationsRow = {
  id: string;
  caseNumber: string;
  priority: string;
  type: string;
  typeLabel: string;
  status: string;
  statusLabel: string;
  title: string;
  summary: string;
  reservationId: string | null;
  reservationReference: string;
  paymentRecordId: string | null;
  paymentState: string;
  handoverState: string;
  guestId: string | null;
  guestName: string;
  guestEmail: string | null;
  propertyId: string | null;
  propertyTitle: string;
  propertyCity: string | null;
  partnerId: string | null;
  partnerName: string;
  partnerEmail: string | null;
  assignedToId: string | null;
  assignedOwner: string;
  openedAtIso: string;
  ageLabel: string;
  latestEventSummary: string | null;
  latestEventAtIso: string | null;
  linkedSourceLabel: string;
  nextBestAction: string;
  attentionLevel: DisputeAttentionLevel;
  attentionReasons: string[];
  lifecycleStage: string;
  financialExposureLabel: string;
  resolutionReadinessScore: number;
  linkedCounts: DisputeInsight["linkedCounts"];
  triageReasons: string[];
  rowHref: string;
  canMarkUnderReview: boolean;
  markUnderReviewDisabledReason: string | null;
  canRequestAdminFollowup: boolean;
  requestAdminFollowupDisabledReason: string | null;
};

export type DisputeSourceCandidate = {
  id: string;
  type: DisputeSourceType;
  label: string;
  status: string | null;
  meta: string | null;
};

export type DisputeOperationsIndex = Awaited<ReturnType<typeof getDisputeOperationsIndex>>;
export type DisputeOperationsDetail = NonNullable<Awaited<ReturnType<typeof getDisputeOperationsDetail>>>;

type SummaryCase = Awaited<ReturnType<typeof loadSummaryCases>>[number];
type SummaryReservation = Awaited<ReturnType<typeof loadReservationsForCases>>[number];
type SummaryPayment = Awaited<ReturnType<typeof loadPaymentsForContext>>[number];
type SummaryHandover = Awaited<ReturnType<typeof loadHandoversForContext>>[number];
type SummaryVerification = Awaited<ReturnType<typeof loadVerificationsForContext>>[number];
type SummaryUser = Awaited<ReturnType<typeof loadUsersByIds>>[number];
type SummaryProperty = Awaited<ReturnType<typeof loadPropertiesByIds>>[number];

export function createDisputeCaseNumber() {
  return `DSP-${Date.now().toString(36).toUpperCase()}`;
}

export function getDisputeReference(id: string | null | undefined) {
  return id ? `DSP-${id.slice(0, 8).toUpperCase()}` : "Unlinked";
}

export function getReservationReference(id: string | null | undefined) {
  return id ? `RSV-${id.slice(0, 8).toUpperCase()}` : "Unlinked";
}

function unique(values: (string | null | undefined)[]) {
  return Array.from(new Set(values.filter(Boolean) as string[]));
}

function personName(user?: { firstName?: string | null; lastName?: string | null; email?: string | null } | null) {
  if (!user) return "Not linked";
  return `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email || "Not linked";
}

function propertyTitle(property?: { approvedTitle?: string | null; title?: string | null } | null) {
  return property?.approvedTitle ?? property?.title ?? "Property not linked";
}

function decimalToNumber(value: number | string | { toString(): string } | null | undefined) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMoney(amount: number | string | { toString(): string } | null | undefined, currency = "USD") {
  const numeric = decimalToNumber(amount);
  if (numeric === null) return "Not computable";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(numeric);
  } catch {
    return `${currency} ${numeric.toFixed(2)}`;
  }
}

function latestDate(values: (Date | null | undefined)[]) {
  const dates = values.filter(Boolean) as Date[];
  if (!dates.length) return null;
  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

function latestEventOf(events: { createdAt: Date; message?: string | null; summary?: string | null }[]) {
  return events.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
}

function noMatchDisputeWhere(): Prisma.DisputeCaseWhereInput {
  return { id: "__no_dispute_match__" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function booleanValue(value: unknown) {
  return value === true || value === "true" || value === "on";
}

function parseEvidenceFromEvents(events: { type: string; payload: Prisma.JsonValue | null }[]): DisputeEvidenceSummary | null {
  const event = events.find((item) => item.type === "evidence_summary_updated");
  if (!event || !isRecord(event.payload)) return null;
  return {
    guestStatementSummary: stringOrNull(event.payload.guestStatementSummary),
    partnerStatementSummary: stringOrNull(event.payload.partnerStatementSummary),
    internalObservation: stringOrNull(event.payload.internalObservation),
    operationalEvidenceSummary: stringOrNull(event.payload.operationalEvidenceSummary),
    supportingReferences: stringOrNull(event.payload.supportingReferences),
    missingEvidence: stringOrNull(event.payload.missingEvidence),
    evidenceQuality: normalizeEvidenceQuality(stringOrNull(event.payload.evidenceQuality)),
  };
}

function parseResolutionFromCase(
  dispute: { resolution?: string | null; resolvedAt?: Date | null },
  events: { type: string; payload: Prisma.JsonValue | null }[]
): DisputeResolutionRecord | null {
  const event = events.find((item) => item.type === "case_resolved_structured");
  if (event && isRecord(event.payload)) {
    return {
      outcome: normalizeDisputeOutcome(stringOrNull(event.payload.outcome)),
      rationale: stringOrNull(event.payload.rationale),
      internalFinalNote: stringOrNull(event.payload.internalFinalNote),
      followUpRequired: booleanValue(event.payload.followUpRequired),
      resolvedAt: dispute.resolvedAt,
    };
  }
  if (!dispute.resolution) return null;
  return {
    outcome: null,
    rationale: dispute.resolution,
    internalFinalNote: null,
    followUpRequired: false,
    resolvedAt: dispute.resolvedAt,
  };
}

async function searchDisputeWhere(query: string | null): Promise<Prisma.DisputeCaseWhereInput> {
  if (!query) return {};
  const q = query.trim();
  if (!q) return {};

  const [users, homes, reservations, payments] = await Promise.all([
    prisma.user.findMany({
      where: {
        OR: [
          { id: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 80,
      select: { id: true },
    }),
    prisma.home.findMany({
      where: {
        OR: [
          { id: { contains: q, mode: "insensitive" } },
          { title: { contains: q, mode: "insensitive" } },
          { approvedTitle: { contains: q, mode: "insensitive" } },
          { city: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 80,
      select: { id: true, userId: true },
    }),
    prisma.reservation.findMany({
      where: {
        OR: [
          { id: { contains: q, mode: "insensitive" } },
          { bookingStatus: { contains: q, mode: "insensitive" } },
          { listingTitleSnapshot: { contains: q, mode: "insensitive" } },
          { listingCitySnapshot: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 80,
      select: { id: true, userId: true, homeId: true, Home: { select: { userId: true } } },
    }),
    prisma.paymentRecord.findMany({
      where: {
        OR: [
          { id: { contains: q, mode: "insensitive" } },
          { providerOrderId: { contains: q, mode: "insensitive" } },
          { providerCaptureId: { contains: q, mode: "insensitive" } },
          { providerAuthorizationId: { contains: q, mode: "insensitive" } },
          { reservationId: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 80,
      select: { id: true, reservationId: true, guestId: true, propertyId: true, partnerId: true },
    }),
  ]);

  const userIds = unique([...users.map((user) => user.id), ...reservations.map((reservation) => reservation.userId), ...payments.map((payment) => payment.guestId)]);
  const propertyIds = unique([...homes.map((home) => home.id), ...reservations.map((reservation) => reservation.homeId), ...payments.map((payment) => payment.propertyId)]);
  const partnerIds = unique([...homes.map((home) => home.userId), ...reservations.map((reservation) => reservation.Home?.userId), ...payments.map((payment) => payment.partnerId)]);
  const reservationIds = unique([...reservations.map((reservation) => reservation.id), ...payments.map((payment) => payment.reservationId)]);
  const paymentIds = unique(payments.map((payment) => payment.id));

  return {
    OR: [
      { id: { contains: q, mode: "insensitive" } },
      { caseNumber: { contains: q, mode: "insensitive" } },
      { title: { contains: q, mode: "insensitive" } },
      { summary: { contains: q, mode: "insensitive" } },
      { resolution: { contains: q, mode: "insensitive" } },
      { reservationId: { contains: q, mode: "insensitive" } },
      { paymentRecordId: { contains: q, mode: "insensitive" } },
      { propertyId: { contains: q, mode: "insensitive" } },
      { guestId: { contains: q, mode: "insensitive" } },
      { partnerId: { contains: q, mode: "insensitive" } },
      ...(reservationIds.length ? [{ reservationId: { in: reservationIds } }] : []),
      ...(paymentIds.length ? [{ paymentRecordId: { in: paymentIds } }] : []),
      ...(propertyIds.length ? [{ propertyId: { in: propertyIds } }] : []),
      ...(userIds.length ? [{ guestId: { in: userIds } }] : []),
      ...(partnerIds.length ? [{ partnerId: { in: partnerIds } }] : []),
    ],
  };
}

async function buildDisputeWhere(filters: NormalizedDisputeFilters, now: Date): Promise<Prisma.DisputeCaseWhereInput> {
  const and: Prisma.DisputeCaseWhereInput[] = [
    baseDisputeWhereFromFilters(filters, now),
    await searchDisputeWhere(filters.search),
  ];
  const clean = and.filter((item) => Object.keys(item).length > 0);
  return clean.length ? { AND: clean } : {};
}

async function loadSummaryCases(where: Prisma.DisputeCaseWhereInput, filters: NormalizedDisputeFilters) {
  return prisma.disputeCase.findMany({
    where,
    orderBy: [{ priority: "desc" }, { openedAt: "asc" }, { updatedAt: "desc" }],
    skip: (filters.page - 1) * filters.pageSize,
    take: filters.pageSize,
    include: { events: { orderBy: { createdAt: "desc" }, take: 12 } },
  });
}

async function loadBoardCases(where: Prisma.DisputeCaseWhereInput) {
  return prisma.disputeCase.findMany({
    where,
    orderBy: [{ status: "asc" }, { priority: "desc" }, { openedAt: "asc" }, { updatedAt: "desc" }],
    take: 220,
    include: { events: { orderBy: { createdAt: "desc" }, take: 12 } },
  });
}

async function loadReservationsForCases(reservationIds: string[]) {
  return reservationIds.length
    ? prisma.reservation.findMany({
        where: { id: { in: reservationIds } },
        select: {
          id: true,
          startDate: true,
          endDate: true,
          createdAt: true,
          bookingStatus: true,
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
          priceLockedAt: true,
          userId: true,
          homeId: true,
          User: { select: { id: true, email: true, firstName: true, lastName: true, role: true, _count: { select: { Reservation: true, Favorite: true } } } },
          Home: {
            select: {
              id: true,
              title: true,
              approvedTitle: true,
              city: true,
              propertyType: true,
              stayType: true,
              price: true,
              listingStatus: true,
              contentReviewStatus: true,
              userId: true,
              _count: { select: { images: true, reviews: true } },
              User: { select: { id: true, email: true, firstName: true, lastName: true, role: true } },
            },
          },
        },
      })
    : [];
}

async function loadUsersByIds(ids: string[]) {
  return ids.length
    ? prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, email: true, firstName: true, lastName: true, role: true, _count: { select: { Reservation: true, Favorite: true, Review: true } } },
      })
    : [];
}

async function loadPropertiesByIds(ids: string[]) {
  return ids.length
    ? prisma.home.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          title: true,
          approvedTitle: true,
          city: true,
          neighborhood: true,
          propertyType: true,
          stayType: true,
          price: true,
          cleaningFee: true,
          securityDeposit: true,
          listingStatus: true,
          contentReviewStatus: true,
          userId: true,
          _count: { select: { images: true, reviews: true, Favorite: true } },
          User: { select: { id: true, email: true, firstName: true, lastName: true, role: true } },
        },
      })
    : [];
}

async function loadPaymentsForContext(context: {
  paymentIds: string[];
  reservationIds: string[];
  guestIds: string[];
  propertyIds: string[];
  partnerIds: string[];
}) {
  const ors: Prisma.PaymentRecordWhereInput[] = [
    ...(context.paymentIds.length ? [{ id: { in: context.paymentIds } }] : []),
    ...(context.reservationIds.length ? [{ reservationId: { in: context.reservationIds } }] : []),
    ...(context.guestIds.length ? [{ guestId: { in: context.guestIds } }] : []),
    ...(context.propertyIds.length ? [{ propertyId: { in: context.propertyIds } }] : []),
    ...(context.partnerIds.length ? [{ partnerId: { in: context.partnerIds } }] : []),
  ];
  return ors.length
    ? prisma.paymentRecord.findMany({
        where: { OR: ors },
        orderBy: { updatedAt: "desc" },
        include: { events: { orderBy: { createdAt: "desc" }, take: 8 } },
      })
    : [];
}

async function loadHandoversForContext(context: {
  reservationIds: string[];
  guestIds: string[];
  propertyIds: string[];
  partnerIds: string[];
}) {
  const ors: Prisma.HandoverTaskWhereInput[] = [
    ...(context.reservationIds.length ? [{ reservationId: { in: context.reservationIds } }] : []),
    ...(context.guestIds.length ? [{ guestId: { in: context.guestIds } }] : []),
    ...(context.propertyIds.length ? [{ propertyId: { in: context.propertyIds } }] : []),
    ...(context.partnerIds.length ? [{ partnerId: { in: context.partnerIds } }] : []),
  ];
  return ors.length
    ? prisma.handoverTask.findMany({
        where: { OR: ors },
        orderBy: { updatedAt: "desc" },
        include: { events: { orderBy: { createdAt: "desc" }, take: 8 } },
      })
    : [];
}

async function loadVerificationsForContext(context: {
  paymentIds: string[];
  guestIds: string[];
  propertyIds: string[];
  partnerIds: string[];
  handoverIds: string[];
}) {
  const ors: Prisma.VerificationRecordWhereInput[] = [
    ...(context.paymentIds.length ? [{ entityType: "payment", entityId: { in: context.paymentIds } }] : []),
    ...(context.guestIds.length ? [{ entityType: "guest", entityId: { in: context.guestIds } }] : []),
    ...(context.propertyIds.length ? [{ entityType: "property", entityId: { in: context.propertyIds } }] : []),
    ...(context.partnerIds.length ? [{ entityType: "partner", entityId: { in: context.partnerIds } }] : []),
    ...(context.handoverIds.length ? [{ entityType: "handover", entityId: { in: context.handoverIds } }] : []),
  ];
  return ors.length
    ? prisma.verificationRecord.findMany({
        where: { OR: ors },
        orderBy: { updatedAt: "desc" },
        include: { events: { orderBy: { createdAt: "desc" }, take: 8 } },
      })
    : [];
}

async function loadLinkedSummary(cases: SummaryCase[]) {
  const reservationIds = unique(cases.map((item) => item.reservationId));
  const directPaymentIds = unique(cases.map((item) => item.paymentRecordId));
  const directGuestIds = unique(cases.map((item) => item.guestId));
  const directPropertyIds = unique(cases.map((item) => item.propertyId));
  const directPartnerIds = unique(cases.map((item) => item.partnerId));
  const ownerIds = unique(cases.map((item) => item.assignedToId));

  const directPayments = directPaymentIds.length
    ? await prisma.paymentRecord.findMany({
        where: { id: { in: directPaymentIds } },
        select: { id: true, reservationId: true, guestId: true, propertyId: true, partnerId: true },
      })
    : [];
  const reservations = await loadReservationsForCases(unique([...reservationIds, ...directPayments.map((payment) => payment.reservationId)]));
  const reservationById = new Map(reservations.map((reservation) => [reservation.id, reservation]));

  const guestIds = unique([
    ...directGuestIds,
    ...reservations.map((reservation) => reservation.userId),
    ...directPayments.map((payment) => payment.guestId),
  ]);
  const propertyIds = unique([
    ...directPropertyIds,
    ...reservations.map((reservation) => reservation.homeId),
    ...directPayments.map((payment) => payment.propertyId),
  ]);
  const partnerIds = unique([
    ...directPartnerIds,
    ...reservations.map((reservation) => reservation.Home?.userId),
    ...directPayments.map((payment) => payment.partnerId),
  ]);

  const [guests, properties, owners] = await Promise.all([
    loadUsersByIds(unique([...guestIds, ...partnerIds])),
    loadPropertiesByIds(propertyIds),
    loadUsersByIds(ownerIds),
  ]);
  const partners = guests.filter((user) => partnerIds.includes(user.id));
  const payments = await loadPaymentsForContext({
    paymentIds: directPaymentIds,
    reservationIds: reservations.map((reservation) => reservation.id),
    guestIds,
    propertyIds,
    partnerIds,
  });
  const paymentIds = payments.map((payment) => payment.id);
  const handovers = await loadHandoversForContext({
    reservationIds: reservations.map((reservation) => reservation.id),
    guestIds,
    propertyIds,
    partnerIds,
  });
  const verifications = await loadVerificationsForContext({
    paymentIds,
    guestIds,
    propertyIds,
    partnerIds,
    handoverIds: handovers.map((task) => task.id),
  });
  const relatedCases = await prisma.disputeCase.findMany({
    where: {
      OR: [
        ...(guestIds.length ? [{ guestId: { in: guestIds } }] : []),
        ...(propertyIds.length ? [{ propertyId: { in: propertyIds } }] : []),
        ...(partnerIds.length ? [{ partnerId: { in: partnerIds } }] : []),
      ],
    },
    select: { id: true, guestId: true, propertyId: true, partnerId: true },
  });

  return {
    reservations,
    reservationById,
    payments,
    handovers,
    verifications,
    guestsById: new Map(guests.map((user) => [user.id, user])),
    partnersById: new Map(partners.map((user) => [user.id, user])),
    propertiesById: new Map(properties.map((home) => [home.id, home])),
    ownersById: new Map(owners.map((user) => [user.id, user])),
    relatedCases,
  };
}

function contextForCase(item: SummaryCase, linked: Awaited<ReturnType<typeof loadLinkedSummary>>) {
  const directPayment = item.paymentRecordId ? linked.payments.find((payment) => payment.id === item.paymentRecordId) ?? null : null;
  const reservationId = item.reservationId ?? directPayment?.reservationId ?? null;
  const reservation = reservationId ? linked.reservationById.get(reservationId) ?? null : null;
  const guestId = item.guestId ?? reservation?.userId ?? directPayment?.guestId ?? null;
  const propertyId = item.propertyId ?? reservation?.homeId ?? directPayment?.propertyId ?? null;
  const partnerId = item.partnerId ?? reservation?.Home?.userId ?? directPayment?.partnerId ?? null;
  const guest = guestId ? linked.guestsById.get(guestId) ?? reservation?.User ?? null : null;
  const property = propertyId ? linked.propertiesById.get(propertyId) ?? reservation?.Home ?? null : null;
  const partner = partnerId ? linked.partnersById.get(partnerId) ?? property?.User ?? reservation?.Home?.User ?? null : null;
  const payments = linked.payments.filter((payment) =>
    (item.paymentRecordId && payment.id === item.paymentRecordId) ||
    (reservationId && payment.reservationId === reservationId) ||
    (guestId && payment.guestId === guestId) ||
    (propertyId && payment.propertyId === propertyId) ||
    (partnerId && payment.partnerId === partnerId)
  );
  const handovers = linked.handovers.filter((task) =>
    (reservationId && task.reservationId === reservationId) ||
    (guestId && task.guestId === guestId) ||
    (propertyId && task.propertyId === propertyId) ||
    (partnerId && task.partnerId === partnerId)
  );
  const paymentIds = payments.map((payment) => payment.id);
  const handoverIds = handovers.map((task) => task.id);
  const verifications = linked.verifications.filter((record) =>
    (record.entityType === "payment" && paymentIds.includes(record.entityId)) ||
    (record.entityType === "handover" && handoverIds.includes(record.entityId)) ||
    (guestId && record.entityType === "guest" && record.entityId === guestId) ||
    (propertyId && record.entityType === "property" && record.entityId === propertyId) ||
    (partnerId && record.entityType === "partner" && record.entityId === partnerId)
  );
  const repeatedCounts = {
    guest: guestId ? linked.relatedCases.filter((caseItem) => caseItem.guestId === guestId && caseItem.id !== item.id).length : 0,
    property: propertyId ? linked.relatedCases.filter((caseItem) => caseItem.propertyId === propertyId && caseItem.id !== item.id).length : 0,
    partner: partnerId ? linked.relatedCases.filter((caseItem) => caseItem.partnerId === partnerId && caseItem.id !== item.id).length : 0,
  };
  return { directPayment, reservationId, reservation, guestId, propertyId, partnerId, guest, property, partner, payments, handovers, verifications, repeatedCounts };
}

function sourceLabel(item: SummaryCase, context: ReturnType<typeof contextForCase>) {
  if (item.paymentRecordId) return `Payment ${item.paymentRecordId.slice(0, 8).toUpperCase()}`;
  if (item.type === "handover_issue" && context.handovers[0]) return `Handover ${context.handovers[0].taskNumber}`;
  if (context.reservationId) return getReservationReference(context.reservationId);
  if (context.guestId) return `Guest ${context.guestId.slice(0, 8).toUpperCase()}`;
  if (context.propertyId) return `Property ${context.propertyId.slice(0, 8).toUpperCase()}`;
  if (context.partnerId) return `Partner ${context.partnerId.slice(0, 8).toUpperCase()}`;
  return "Manual exception";
}

function paymentState(payments: SummaryPayment[]) {
  if (!payments.length) return "none";
  const review = payments.find((payment) => PAYMENT_REVIEW_STATUSES.includes(payment.status));
  if (review) return review.status;
  const settled = payments.find((payment) => PAYMENT_SETTLED_STATUSES.includes(payment.status));
  return settled?.status ?? payments[0]?.status ?? "none";
}

function handoverState(handovers: SummaryHandover[]) {
  if (!handovers.length) return "none";
  const issue = handovers.find((task) => task.status === "issue_reported");
  return issue?.status ?? handovers[0]?.status ?? "none";
}

function triageReasons(insight: DisputeInsight) {
  const reasons: string[] = [];
  if (insight.urgentCase) reasons.push("urgent priority");
  if (insight.overdueCase) reasons.push("SLA overdue");
  if (insight.paymentRequiresReview) reasons.push("payment requires review");
  if (insight.handoverIssueOpen) reasons.push("handover escalation");
  if (insight.awaitingGuestTooLong) reasons.push("guest response stale");
  if (insight.awaitingPartnerTooLong) reasons.push("partner response stale");
  if (insight.reopenedCase) reasons.push("reopened");
  if (insight.missingLinkedSource) reasons.push("missing linked source");
  return reasons;
}

function mapCaseRow(item: SummaryCase, linked: Awaited<ReturnType<typeof loadLinkedSummary>>, now: Date): DisputeOperationsRow {
  const context = contextForCase(item, linked);
  const evidence = parseEvidenceFromEvents(item.events);
  const resolution = parseResolutionFromCase(item, item.events);
  const latestEvent = item.events[0] ?? null;
  const owner = item.assignedToId ? linked.ownersById.get(item.assignedToId) ?? null : null;
  const insight = analyzeDisputeCase({
    ...item,
    reservationId: context.reservationId,
    guestId: context.guestId,
    propertyId: context.propertyId,
    partnerId: context.partnerId,
    reservation: context.reservation,
    payments: context.payments as DisputeLinkedPayment[],
    handovers: context.handovers as DisputeLinkedHandover[],
    verifications: context.verifications as DisputeLinkedVerification[],
    evidence,
    resolution,
    latestEventAt: latestEvent?.createdAt ?? item.updatedAt,
    repeatedCounts: context.repeatedCounts,
    now,
  });
  const reviewReason = item.status === "under_review"
    ? "Case is already under review."
    : item.status === "closed"
      ? "Closed cases must be reopened before review."
      : null;
  const followupReason = item.status === "closed"
    ? "Closed cases must be reopened before requesting follow-up."
    : null;

  return {
    id: item.id,
    caseNumber: item.caseNumber,
    priority: item.priority,
    type: item.type,
    typeLabel: disputeTypeLabel(item.type),
    status: item.status,
    statusLabel: disputeStatusLabel(item.status),
    title: item.title,
    summary: item.summary,
    reservationId: context.reservationId,
    reservationReference: getReservationReference(context.reservationId),
    paymentRecordId: item.paymentRecordId ?? context.payments[0]?.id ?? null,
    paymentState: paymentState(context.payments),
    handoverState: handoverState(context.handovers),
    guestId: context.guestId,
    guestName: personName(context.guest),
    guestEmail: context.guest?.email ?? null,
    propertyId: context.propertyId,
    propertyTitle: propertyTitle(context.property),
    propertyCity: context.reservation?.listingCitySnapshot ?? context.property?.city ?? null,
    partnerId: context.partnerId,
    partnerName: personName(context.partner),
    partnerEmail: context.partner?.email ?? null,
    assignedToId: item.assignedToId,
    assignedOwner: owner ? personName(owner) : "Unassigned",
    openedAtIso: item.openedAt.toISOString(),
    ageLabel: insight.caseAge.label,
    latestEventSummary: latestEvent?.message ?? null,
    latestEventAtIso: latestEvent?.createdAt.toISOString() ?? null,
    linkedSourceLabel: sourceLabel(item, context),
    nextBestAction: insight.nextBestActions[0]?.label ?? "Continue investigation",
    attentionLevel: insight.attentionLevel,
    attentionReasons: insight.attentionReasons,
    lifecycleStage: insight.lifecycleStage,
    financialExposureLabel: insight.financialExposure.label,
    resolutionReadinessScore: insight.resolutionReadinessScore,
    linkedCounts: insight.linkedCounts,
    triageReasons: triageReasons(insight),
    rowHref: `/admin/disputes?disputeId=${item.id}`,
    canMarkUnderReview: !reviewReason,
    markUnderReviewDisabledReason: reviewReason,
    canRequestAdminFollowup: !followupReason,
    requestAdminFollowupDisabledReason: followupReason,
  };
}

async function getAssignableAdmins() {
  return prisma.user.findMany({
    where: { role: { contains: "admin", mode: "insensitive" } },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { email: "asc" }],
    take: 100,
    select: { id: true, email: true, firstName: true, lastName: true, role: true },
  });
}

async function getSourceCandidates(filters: NormalizedDisputeFilters): Promise<Record<DisputeSourceType, DisputeSourceCandidate[]>> {
  const q = filters.sourceSearch?.trim();
  const textFilter = q ? { contains: q, mode: "insensitive" as const } : undefined;
  const [reservations, payments, handovers, guests, properties, partners, verifications] = await Promise.all([
    prisma.reservation.findMany({
      where: q ? { OR: [{ id: textFilter }, { listingTitleSnapshot: textFilter }, { listingCitySnapshot: textFilter }] } : {},
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        bookingStatus: true,
        listingTitleSnapshot: true,
        listingCitySnapshot: true,
        startDate: true,
        User: { select: { email: true, firstName: true, lastName: true } },
        Home: { select: { approvedTitle: true, title: true, city: true } },
      },
    }),
    prisma.paymentRecord.findMany({
      where: q ? { OR: [{ id: textFilter }, { providerOrderId: textFilter }, { reservationId: textFilter }] } : {},
      orderBy: { updatedAt: "desc" },
      take: 30,
      select: { id: true, status: true, amount: true, currency: true, providerOrderId: true, reservationId: true },
    }),
    prisma.handoverTask.findMany({
      where: q ? { OR: [{ id: textFilter }, { taskNumber: textFilter }, { title: textFilter }, { reservationId: textFilter }] } : {},
      orderBy: { updatedAt: "desc" },
      take: 30,
      select: { id: true, taskNumber: true, type: true, status: true, priority: true, title: true },
    }),
    prisma.user.findMany({
      where: q ? { OR: [{ id: textFilter }, { email: textFilter }, { firstName: textFilter }, { lastName: textFilter }] } : {},
      orderBy: { email: "asc" },
      take: 30,
      select: { id: true, email: true, firstName: true, lastName: true, role: true, _count: { select: { Reservation: true } } },
    }),
    prisma.home.findMany({
      where: q ? { OR: [{ id: textFilter }, { title: textFilter }, { approvedTitle: textFilter }, { city: textFilter }] } : {},
      orderBy: { updatedAt: "desc" },
      take: 30,
      select: { id: true, title: true, approvedTitle: true, city: true, listingStatus: true, userId: true },
    }),
    prisma.user.findMany({
      where: {
        ...(q ? { OR: [{ id: textFilter }, { email: textFilter }, { firstName: textFilter }, { lastName: textFilter }] } : {}),
        Home: { some: {} },
      },
      orderBy: { email: "asc" },
      take: 30,
      select: { id: true, email: true, firstName: true, lastName: true, role: true, _count: { select: { Home: true } } },
    }),
    prisma.verificationRecord.findMany({
      where: q ? { OR: [{ id: textFilter }, { title: textFilter }, { entityId: textFilter }] } : {},
      orderBy: { updatedAt: "desc" },
      take: 30,
      select: { id: true, entityType: true, entityId: true, category: true, status: true, title: true },
    }),
  ]);

  return {
    reservation: reservations.map((item) => ({
      id: item.id,
      type: "reservation",
      label: `${getReservationReference(item.id)} - ${item.listingTitleSnapshot ?? item.Home?.approvedTitle ?? item.Home?.title ?? "Reservation"}`,
      status: item.bookingStatus,
      meta: `${personName(item.User)} - ${item.listingCitySnapshot ?? item.Home?.city ?? "City not set"}`,
    })),
    payment: payments.map((item) => ({
      id: item.id,
      type: "payment",
      label: `${formatMoney(item.amount, item.currency)} - ${item.providerOrderId ?? item.id}`,
      status: item.status,
      meta: item.reservationId ? getReservationReference(item.reservationId) : "No reservation",
    })),
    handover: handovers.map((item) => ({
      id: item.id,
      type: "handover",
      label: `${item.taskNumber}: ${item.title}`,
      status: item.status,
      meta: `${item.type.replaceAll("_", " ")} - ${item.priority}`,
    })),
    guest: guests.map((item) => ({
      id: item.id,
      type: "guest",
      label: personName(item),
      status: item.role,
      meta: `${item.email} - ${item._count.Reservation} reservations`,
    })),
    property: properties.map((item) => ({
      id: item.id,
      type: "property",
      label: propertyTitle(item),
      status: item.listingStatus,
      meta: item.city ?? "City not set",
    })),
    partner: partners.map((item) => ({
      id: item.id,
      type: "partner",
      label: personName(item),
      status: item.role,
      meta: `${item.email} - ${item._count.Home} properties`,
    })),
    verification: verifications.map((item) => ({
      id: item.id,
      type: "verification",
      label: `${item.title} - ${item.entityType}`,
      status: item.status,
      meta: `${item.category} - ${item.entityId}`,
    })),
    manual_exception: [],
  };
}

export async function getDisputeOperationsIndex(searchParams?: DisputeSearchParams) {
  noStore();
  const now = new Date();
  const filters = normalizeDisputeFilters(searchParams);
  const where = await buildDisputeWhere(filters, now);
  const boardWhere = await buildDisputeWhere({ ...filters, status: null, page: 1 }, now);

  const [totalCount, cases, boardCases, statusGroups, priorityGroups, admins, sourceCandidates] = await Promise.all([
    prisma.disputeCase.count({ where }),
    loadSummaryCases(where, filters),
    loadBoardCases(boardWhere),
    prisma.disputeCase.groupBy({ by: ["status"], where: boardWhere, _count: { _all: true } }),
    prisma.disputeCase.groupBy({ by: ["priority"], where: boardWhere, _count: { _all: true } }),
    getAssignableAdmins(),
    getSourceCandidates(filters),
  ]);

  const uniqueCases = Array.from(new Map([...cases, ...boardCases].map((item) => [item.id, item])).values());
  const linked = await loadLinkedSummary(uniqueCases);
  const rowById = new Map(uniqueCases.map((item) => [item.id, mapCaseRow(item, linked, now)]));
  const rows = cases.map((item) => rowById.get(item.id)).filter(Boolean) as DisputeOperationsRow[];
  const boardRows = boardCases.map((item) => rowById.get(item.id)).filter(Boolean) as DisputeOperationsRow[];
  const statusCounts = statusGroups.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = item._count._all;
    return acc;
  }, {});
  const priorityCounts = priorityGroups.reduce<Record<string, number>>((acc, item) => {
    acc[item.priority] = item._count._all;
    return acc;
  }, {});
  const unresolvedRows = boardRows.filter((row) => OPEN_DISPUTE_STATUSES.includes(row.status));
  const urgentHighRows = unresolvedRows.filter((row) => ["urgent", "high"].includes(row.priority));
  const awaitingExternalRows = unresolvedRows.filter((row) => ["awaiting_guest", "awaiting_partner"].includes(row.status));
  const oldestOpen = unresolvedRows.slice().sort((a, b) => new Date(a.openedAtIso).getTime() - new Date(b.openedAtIso).getTime())[0] ?? null;
  const averageAgeDays = unresolvedRows.length
    ? Math.round(unresolvedRows.reduce((sum, row) => sum + Math.floor((now.getTime() - new Date(row.openedAtIso).getTime()) / (24 * 60 * 60 * 1000)), 0) / unresolvedRows.length)
    : null;
  const triageRows = boardRows
    .filter((row) => row.triageReasons.length > 0)
    .sort((a, b) => {
      const score = (row: DisputeOperationsRow) =>
        (row.attentionLevel === "critical" ? 5 : row.attentionLevel === "high" ? 4 : row.attentionLevel === "medium" ? 3 : row.attentionLevel === "low" ? 2 : 1) +
        (row.priority === "urgent" ? 2 : row.priority === "high" ? 1 : 0);
      return score(b) - score(a);
    })
    .slice(0, 18);
  const financialExposure = boardRows.reduce((sum, row) => {
    const numeric = Number(row.financialExposureLabel.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(numeric) ? sum + numeric : sum;
  }, 0);

  return {
    filters,
    rows,
    boardRows,
    triageRows,
    statusCounts,
    priorityCounts,
    admins,
    sourceCandidates,
    pagination: {
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / filters.pageSize)),
      page: filters.page,
      pageSize: filters.pageSize,
      from: totalCount ? (filters.page - 1) * filters.pageSize + 1 : 0,
      to: Math.min(totalCount, filters.page * filters.pageSize),
    },
    intelligence: {
      openCases: unresolvedRows.length,
      urgentHighCases: urgentHighRows.length,
      awaitingExternalCount: awaitingExternalRows.length,
      averageAgeDays,
      resolvedCount: statusCounts.resolved ?? 0,
      closedCount: statusCounts.closed ?? 0,
      oldestOpenCase: oldestOpen,
      highestSeverityCases: boardRows.filter((row) => ["critical", "high"].includes(row.attentionLevel)).slice(0, 8),
      financialExposure,
      missingLinkedSourceCases: boardRows.filter((row) => row.linkedSourceLabel === "Manual exception"),
      stalledExternalCases: boardRows.filter((row) => row.triageReasons.some((reason) => reason.includes("stale"))),
      handoverEscalations: boardRows.filter((row) => row.type === "handover_issue" || row.handoverState === "issue_reported"),
      paymentEscalations: boardRows.filter((row) => row.type === "payment_issue" || PAYMENT_REVIEW_STATUSES.includes(row.paymentState)),
      repeatedPatternCases: boardRows.filter((row) => row.attentionReasons.some((reason) => reason.includes("repeated"))),
      averageReadiness: rows.length
        ? Math.round(rows.reduce((sum, row) => sum + row.resolutionReadinessScore, 0) / rows.length)
        : null,
    },
  };
}

export async function getDisputeOperationsData(searchParams?: DisputeSearchParams) {
  return getDisputeOperationsIndex(searchParams);
}

export async function getDisputeOperationsDetail(disputeId: string | null | undefined) {
  noStore();
  if (!disputeId) return null;
  const dispute = await prisma.disputeCase.findUnique({
    where: { id: disputeId },
    include: { events: { orderBy: { createdAt: "desc" }, take: 120 } },
  });
  if (!dispute) return null;

  const linked = await loadLinkedSummary([dispute]);
  const context = contextForCase(dispute, linked);
  const evidence = parseEvidenceFromEvents(dispute.events);
  const resolution = parseResolutionFromCase(dispute, dispute.events);
  const owner = dispute.assignedToId ? linked.ownersById.get(dispute.assignedToId) ?? null : null;
  const paymentIds = context.payments.map((payment) => payment.id);
  const handoverIds = context.handovers.map((task) => task.id);
  const verificationIds = context.verifications.map((record) => record.id);
  const latestEvent = dispute.events[0] ?? null;
  const insight = analyzeDisputeCase({
    ...dispute,
    reservationId: context.reservationId,
    guestId: context.guestId,
    propertyId: context.propertyId,
    partnerId: context.partnerId,
    reservation: context.reservation,
    payments: context.payments as DisputeLinkedPayment[],
    handovers: context.handovers as DisputeLinkedHandover[],
    verifications: context.verifications as DisputeLinkedVerification[],
    evidence,
    resolution,
    latestEventAt: latestEvent?.createdAt ?? dispute.updatedAt,
    repeatedCounts: context.repeatedCounts,
  });
  const timeline = await getDisputeCaseTimeline({
    disputeId: dispute.id,
    reservationId: context.reservationId,
    paymentIds,
    handoverIds,
    verificationIds,
  });
  const premiumProfile = context.guestId
    ? await prisma.premiumGuestProfile.findUnique({
        where: { userId: context.guestId },
        include: { events: { orderBy: { createdAt: "desc" }, take: 8 } },
      })
    : null;
  const relatedCases = await prisma.disputeCase.findMany({
    where: {
      id: { not: dispute.id },
      OR: [
        ...(context.guestId ? [{ guestId: context.guestId }] : []),
        ...(context.propertyId ? [{ propertyId: context.propertyId }] : []),
        ...(context.partnerId ? [{ partnerId: context.partnerId }] : []),
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
    select: {
      id: true,
      caseNumber: true,
      type: true,
      status: true,
      priority: true,
      title: true,
      guestId: true,
      propertyId: true,
      partnerId: true,
      updatedAt: true,
    },
  });
  const admins = await getAssignableAdmins();

  return {
    dispute,
    typeLabel: disputeTypeLabel(dispute.type),
    statusLabel: disputeStatusLabel(dispute.status),
    reservation: context.reservation,
    reservationReference: getReservationReference(context.reservationId),
    payment: context.directPayment ?? context.payments[0] ?? null,
    payments: context.payments,
    handovers: context.handovers,
    verifications: context.verifications,
    guest: context.guest,
    property: context.property,
    partner: context.partner,
    owner,
    admins,
    premiumProfile,
    relatedCases,
    evidence,
    resolution,
    insight,
    timeline,
  };
}
