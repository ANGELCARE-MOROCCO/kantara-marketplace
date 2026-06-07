import "server-only";

import { unstable_noStore as noStore } from "next/cache";
import type { Prisma } from "@prisma/client";
import prisma from "./db";
import { getPayPalProviderReadiness } from "./paypal";
import {
  analyzeBooking,
  BOOKING_OPERATIONAL_SEGMENTS,
  getBookingStatusTransitionDisabledReason,
  type BookingLinkedDispute,
  type BookingLinkedHandover,
  type BookingLinkedPayment,
  type BookingLinkedVerification,
  type BookingOperationsRow,
} from "./bookingIntelligence";
import {
  buildBaseBookingWhere,
  normalizeBookingFilters,
  type BookingSearchParams,
  type NormalizedBookingFilters,
} from "./bookingFilters";

const PAYMENT_ATTENTION_STATUSES = ["draft", "order_created", "pending_approval", "failed", "requires_review"];
const PAYMENT_SETTLED_STATUSES = ["authorized", "captured"];
const OPEN_DISPUTE_STATUSES = ["open", "under_review", "awaiting_guest", "awaiting_partner", "awaiting_admin", "reopened"];
const PENDING_VERIFICATION_STATUSES = ["pending", "under_review", "needs_information"];
const ACTIVE_HANDOVER_STATUSES = ["not_scheduled", "pending_preparation", "ready", "in_progress", "issue_reported"];

type SummaryReservation = Awaited<ReturnType<typeof loadSummaryReservations>>[number];

function noMatchVerificationWhere(): Prisma.VerificationRecordWhereInput {
  return { id: "__no_booking_match__" };
}

function nonEmptyIn(ids: string[]): Prisma.StringFilter<"Reservation"> | string {
  return ids.length ? { in: ids } : "__no_booking_match__";
}

function unique(values: (string | null | undefined)[]) {
  return Array.from(new Set(values.filter(Boolean) as string[]));
}

function titleForReservation(reservation: {
  listingTitleSnapshot?: string | null;
  Home?: { approvedTitle?: string | null; title?: string | null } | null;
}) {
  return (
    reservation.listingTitleSnapshot ??
    reservation.Home?.approvedTitle ??
    reservation.Home?.title ??
    "Reservation"
  );
}

function personName(user?: { firstName?: string | null; lastName?: string | null; email?: string | null } | null) {
  if (!user) return "Not linked";
  return `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email || "Not linked";
}

function referenceForReservation(id: string) {
  return `RSV-${id.slice(0, 8).toUpperCase()}`;
}

function getNights(startDate: Date, endDate: Date, snapshot?: number | null) {
  if (snapshot && snapshot > 0) return snapshot;
  const nights = Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
  return nights > 0 ? nights : 0;
}

function latestDate(dates: (Date | null | undefined)[]) {
  const values = dates.filter(Boolean) as Date[];
  if (!values.length) return null;
  return new Date(Math.max(...values.map((date) => date.getTime())));
}

function groupByReservation<T extends { reservationId: string | null }>(items: T[]) {
  return items.reduce<Map<string, T[]>>((acc, item) => {
    if (!item.reservationId) return acc;
    const current = acc.get(item.reservationId) ?? [];
    current.push(item);
    acc.set(item.reservationId, current);
    return acc;
  }, new Map<string, T[]>());
}

function groupVerifications(records: BookingLinkedVerification[], reservations: SummaryReservation[], paymentsByReservationId: Map<string, { id: string }[]>) {
  const byReservation = new Map<string, BookingLinkedVerification[]>();
  reservations.forEach((reservation) => {
    const paymentIds = paymentsByReservationId.get(reservation.id)?.map((payment) => payment.id) ?? [];
    const items = records.filter((record) => {
      if (record.entityType === "guest" && record.entityId === reservation.userId) return true;
      if (record.entityType === "property" && record.entityId === reservation.homeId) return true;
      if (record.entityType === "payment" && paymentIds.includes(record.entityId)) return true;
      return false;
    });
    byReservation.set(reservation.id, items);
  });
  return byReservation;
}

async function reservationIdsForPaymentStatus(status: string | null) {
  if (!status) return null;
  if (status === "missing") {
    const records = await prisma.paymentRecord.findMany({
      where: { reservationId: { not: null } },
      select: { reservationId: true },
      distinct: ["reservationId"],
    });
    return { exclude: unique(records.map((record) => record.reservationId)) };
  }

  const statuses = status === "attention" ? PAYMENT_ATTENTION_STATUSES : [status];
  const records = await prisma.paymentRecord.findMany({
    where: { status: { in: statuses }, reservationId: { not: null } },
    select: { reservationId: true },
    distinct: ["reservationId"],
  });
  return { include: unique(records.map((record) => record.reservationId)) };
}

async function reservationIdsForHandoverStatus(status: string | null, now: Date) {
  if (!status) return null;
  const records = await prisma.handoverTask.findMany({
    where: status === "missing" ? { reservationId: { not: null } } : { status, reservationId: { not: null } },
    select: { reservationId: true },
    distinct: ["reservationId"],
  });
  const ids = unique(records.map((record) => record.reservationId));
  if (status === "missing") {
    return { exclude: ids, extra: { startDate: { gte: now }, bookingStatus: { notIn: ["cancelled", "completed"] } } as Prisma.ReservationWhereInput };
  }
  return { include: ids };
}

async function reservationIdsForDisputeStatus(status: string | null) {
  if (!status) return null;
  const statuses = status === "open_active" ? OPEN_DISPUTE_STATUSES : [status];
  const records = await prisma.disputeCase.findMany({
    where: { status: { in: statuses }, reservationId: { not: null } },
    select: { reservationId: true },
    distinct: ["reservationId"],
  });
  return { include: unique(records.map((record) => record.reservationId)) };
}

async function buildOperationalBookingWhere(filters: NormalizedBookingFilters, now: Date) {
  const and: Prisma.ReservationWhereInput[] = [buildBaseBookingWhere(filters, now)];

  async function applyIdFilter(filter: Promise<{ include?: string[]; exclude?: string[]; extra?: Prisma.ReservationWhereInput } | null>) {
    const ids = await filter;
    if (!ids) return;
    if (ids.extra) and.push(ids.extra);
    if (ids.include) and.push({ id: nonEmptyIn(ids.include) });
    if (ids.exclude?.length) and.push({ id: { notIn: ids.exclude } });
  }

  if (filters.segment === "payment_attention") {
    await applyIdFilter(reservationIdsForPaymentStatus("attention"));
  }
  if (filters.segment === "handover_missing") {
    await applyIdFilter(reservationIdsForHandoverStatus("missing", now));
  }
  if (filters.segment === "dispute_open") {
    await applyIdFilter(reservationIdsForDisputeStatus("open_active"));
  }

  await applyIdFilter(reservationIdsForPaymentStatus(filters.paymentStatus));
  await applyIdFilter(reservationIdsForHandoverStatus(filters.handoverStatus, now));
  await applyIdFilter(reservationIdsForDisputeStatus(filters.disputeStatus));

  if (filters.segment === "requires_attention" || filters.requiresAttentionOnly) {
    const [
      paymentAttention,
      openDisputes,
      activeHandovers,
      pendingGuestVerifications,
      pendingPropertyVerifications,
      settledPayments,
    ] = await Promise.all([
      reservationIdsForPaymentStatus("attention"),
      reservationIdsForDisputeStatus("open_active"),
      prisma.handoverTask.findMany({
        where: { status: { in: ACTIVE_HANDOVER_STATUSES }, reservationId: { not: null } },
        select: { reservationId: true },
        distinct: ["reservationId"],
      }),
      prisma.verificationRecord.findMany({
        where: { entityType: "guest", status: { in: PENDING_VERIFICATION_STATUSES } },
        select: { entityId: true },
        distinct: ["entityId"],
      }),
      prisma.verificationRecord.findMany({
        where: { entityType: "property", status: { in: PENDING_VERIFICATION_STATUSES } },
        select: { entityId: true },
        distinct: ["entityId"],
      }),
      prisma.paymentRecord.findMany({
        where: { status: { in: PAYMENT_SETTLED_STATUSES }, reservationId: { not: null } },
        select: { reservationId: true },
        distinct: ["reservationId"],
      }),
    ]);
    const handoverIds = unique(activeHandovers.map((item) => item.reservationId));
    const paymentAttentionIds = paymentAttention?.include ?? [];
    const openDisputeIds = openDisputes?.include ?? [];
    const pendingGuestIds = unique(pendingGuestVerifications.map((item) => item.entityId));
    const pendingPropertyIds = unique(pendingPropertyVerifications.map((item) => item.entityId));
    const settledPaymentReservationIds = unique(settledPayments.map((item) => item.reservationId));

    and.push({
      OR: [
        { bookingStatus: { in: ["requested", "under_review"] } },
        { id: { in: paymentAttentionIds.length ? paymentAttentionIds : ["__no_payment_attention__"] } },
        { id: { in: openDisputeIds.length ? openDisputeIds : ["__no_open_dispute__"] } },
        {
          startDate: { gte: now },
          bookingStatus: { notIn: ["cancelled", "completed"] },
          ...(handoverIds.length ? { id: { notIn: handoverIds } } : {}),
        },
        { userId: { in: pendingGuestIds.length ? pendingGuestIds : ["__no_pending_guest_verification__"] } },
        { homeId: { in: pendingPropertyIds.length ? pendingPropertyIds : ["__no_pending_property_verification__"] } },
        { priceLockedAt: null },
        { totalSnapshot: null },
        { nightlyPriceSnapshot: null, Home: { price: null } },
        {
          totalSnapshot: { gt: 0 },
          ...(settledPaymentReservationIds.length ? { id: { notIn: settledPaymentReservationIds } } : {}),
        },
      ],
    });
  }

  return and.length ? { AND: and.filter((item) => Object.keys(item).length > 0) } : {};
}

async function loadSummaryReservations(where: Prisma.ReservationWhereInput, filters: NormalizedBookingFilters) {
  return prisma.reservation.findMany({
    where,
    orderBy: [{ startDate: "asc" }, { createdAt: "desc" }],
    skip: (filters.page - 1) * filters.pageSize,
    take: filters.pageSize,
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
      listingVersionSnapshot: true,
      priceLockedAt: true,
      cancelledAt: true,
      completedAt: true,
      userId: true,
      homeId: true,
      User: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          _count: { select: { Reservation: true, Favorite: true } },
        },
      },
      Home: {
        select: {
          id: true,
          title: true,
          approvedTitle: true,
          city: true,
          price: true,
          cleaningFee: true,
          securityDeposit: true,
          userId: true,
          listingStatus: true,
          contentReviewStatus: true,
          _count: { select: { images: true } },
          User: { select: { id: true, email: true, firstName: true, lastName: true, role: true } },
        },
      },
    },
  });
}

async function loadLinkedSummary(reservations: SummaryReservation[]) {
  const reservationIds = reservations.map((reservation) => reservation.id);
  const guestIds = unique(reservations.map((reservation) => reservation.userId));
  const propertyIds = unique(reservations.map((reservation) => reservation.homeId));

  const [payments, disputes, handovers, premiumProfiles, auditEvents] = await Promise.all([
    reservationIds.length
      ? prisma.paymentRecord.findMany({
          where: { reservationId: { in: reservationIds } },
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            reservationId: true,
            amount: true,
            currency: true,
            status: true,
            method: true,
            providerOrderId: true,
            providerStatus: true,
            updatedAt: true,
            createdAt: true,
          },
        })
      : [],
    reservationIds.length
      ? prisma.disputeCase.findMany({
          where: { reservationId: { in: reservationIds } },
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            reservationId: true,
            caseNumber: true,
            status: true,
            priority: true,
            title: true,
            updatedAt: true,
            createdAt: true,
          },
        })
      : [],
    reservationIds.length
      ? prisma.handoverTask.findMany({
          where: { reservationId: { in: reservationIds } },
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            reservationId: true,
            taskNumber: true,
            status: true,
            type: true,
            title: true,
            scheduledFor: true,
            priority: true,
            updatedAt: true,
            createdAt: true,
          },
        })
      : [],
    guestIds.length
      ? prisma.premiumGuestProfile.findMany({
          where: { userId: { in: guestIds } },
          select: { id: true, userId: true, status: true, eligibilityScore: true, riskLevel: true },
        })
      : [],
    reservationIds.length
      ? prisma.adminAuditEvent.findMany({
          where: { targetType: "Reservation", targetId: { in: reservationIds } },
          orderBy: { createdAt: "desc" },
          take: Math.min(250, reservationIds.length * 5),
        })
      : [],
  ]);

  const paymentIds = payments.map((payment) => payment.id);
  const verifications = reservations.length
    ? await prisma.verificationRecord.findMany({
        where: {
          OR: [
            { entityType: "guest", entityId: { in: guestIds } },
            { entityType: "property", entityId: { in: propertyIds } },
            { entityType: "payment", entityId: { in: paymentIds } },
          ],
        },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          entityType: true,
          entityId: true,
          category: true,
          status: true,
          title: true,
          updatedAt: true,
          createdAt: true,
        },
      })
    : [];

  const paymentsByReservationId = groupByReservation(payments);
  const disputesByReservationId = groupByReservation(disputes);
  const handoversByReservationId = groupByReservation(handovers);
  const verificationsByReservationId = groupVerifications(verifications, reservations, paymentsByReservationId);
  const premiumByUserId = new Map(premiumProfiles.map((profile) => [profile.userId, profile]));
  const auditByReservationId = auditEvents.reduce<Map<string, typeof auditEvents>>((acc, event) => {
    if (!event.targetId) return acc;
    const current = acc.get(event.targetId) ?? [];
    current.push(event);
    acc.set(event.targetId, current);
    return acc;
  }, new Map());

  return {
    paymentsByReservationId,
    disputesByReservationId,
    handoversByReservationId,
    verificationsByReservationId,
    premiumByUserId,
    auditByReservationId,
  };
}

function statusFromCollection<T extends { status: string; priority?: string }>(
  items: T[],
  emptyStatus: string,
  priorityStatuses: string[] = []
) {
  if (!items.length) return emptyStatus;
  const priority = items.find((item) => priorityStatuses.includes(item.status));
  return priority?.status ?? items[0]?.status ?? emptyStatus;
}

function mapSummaryRow({
  reservation,
  linked,
  filters,
  now,
}: {
  reservation: SummaryReservation;
  linked: Awaited<ReturnType<typeof loadLinkedSummary>>;
  filters: NormalizedBookingFilters;
  now: Date;
}): BookingOperationsRow {
  const payments = (linked.paymentsByReservationId.get(reservation.id) ?? []) as BookingLinkedPayment[];
  const disputes = (linked.disputesByReservationId.get(reservation.id) ?? []) as BookingLinkedDispute[];
  const handovers = (linked.handoversByReservationId.get(reservation.id) ?? []) as BookingLinkedHandover[];
  const verifications = (linked.verificationsByReservationId.get(reservation.id) ?? []) as BookingLinkedVerification[];
  const premiumProfile = linked.premiumByUserId.get(reservation.userId ?? "") ?? null;
  const auditEvents = linked.auditByReservationId.get(reservation.id) ?? [];
  const insight = analyzeBooking({
    id: reservation.id,
    bookingStatus: reservation.bookingStatus,
    startDate: reservation.startDate,
    endDate: reservation.endDate,
    createdAt: reservation.createdAt,
    totalSnapshot: reservation.totalSnapshot,
    nightlyPriceSnapshot: reservation.nightlyPriceSnapshot,
    totalNightsSnapshot: reservation.totalNightsSnapshot,
    priceLockedAt: reservation.priceLockedAt,
    userId: reservation.userId,
    homeId: reservation.homeId,
    guestReservationCount: reservation.User?._count.Reservation ?? 0,
    guestFavoriteCount: reservation.User?._count.Favorite ?? 0,
    property: {
      price: reservation.Home?.price ?? null,
      listingStatus: reservation.Home?.listingStatus ?? null,
      contentReviewStatus: reservation.Home?.contentReviewStatus ?? null,
      imageCount: reservation.Home?._count.images ?? 0,
    },
    payments,
    handovers,
    disputes,
    verifications,
    premiumProfile,
    now,
  });
  const latest = latestDate([
    reservation.createdAt,
    ...payments.map((payment) => payment.updatedAt instanceof Date ? payment.updatedAt : payment.updatedAt ? new Date(payment.updatedAt) : null),
    ...handovers.map((task) => task.updatedAt instanceof Date ? task.updatedAt : task.updatedAt ? new Date(task.updatedAt) : null),
    ...disputes.map((caseItem) => caseItem.updatedAt instanceof Date ? caseItem.updatedAt : caseItem.updatedAt ? new Date(caseItem.updatedAt) : null),
    ...verifications.map((record) => record.updatedAt instanceof Date ? record.updatedAt : record.updatedAt ? new Date(record.updatedAt) : null),
    ...auditEvents.map((event) => event.createdAt),
  ]);
  const underReviewDisabledReason = getBookingStatusTransitionDisabledReason(reservation.bookingStatus, "under_review");
  const hasActiveHandover = handovers.some((handover) => handover.status !== "cancelled");
  const canCreateHandover =
    insight.upcomingArrival &&
    !hasActiveHandover &&
    !["cancelled", "completed"].includes(reservation.bookingStatus);
  const createHandoverDisabledReason = canCreateHandover
    ? null
    : hasActiveHandover
      ? "A handover task is already linked."
      : insight.upcomingArrival
        ? "Closed bookings cannot receive new handover tasks."
        : "Handover tasks are only bulk-created for upcoming arrivals.";

  return {
    id: reservation.id,
    reference: referenceForReservation(reservation.id),
    status: reservation.bookingStatus,
    guestName: personName(reservation.User),
    guestEmail: reservation.User?.email ?? null,
    guestId: reservation.userId ?? null,
    propertyTitle: titleForReservation(reservation),
    propertyCity: reservation.listingCitySnapshot ?? reservation.Home?.city ?? null,
    propertyId: reservation.homeId ?? null,
    partnerName: personName(reservation.Home?.User),
    partnerEmail: reservation.Home?.User?.email ?? null,
    partnerId: reservation.Home?.userId ?? null,
    checkInIso: reservation.startDate.toISOString(),
    checkOutIso: reservation.endDate.toISOString(),
    createdAtIso: reservation.createdAt.toISOString(),
    lastActivityIso: latest?.toISOString() ?? null,
    nights: getNights(reservation.startDate, reservation.endDate, reservation.totalNightsSnapshot),
    amount: reservation.totalSnapshot,
    currency: reservation.currencySnapshot ?? "USD",
    paymentStatus: statusFromCollection(payments, "missing", ["requires_review", "failed", "pending_approval"]),
    handoverStatus: statusFromCollection(handovers, "missing", ["issue_reported", "not_scheduled", "pending_preparation"]),
    disputeStatus: statusFromCollection(disputes, "none", OPEN_DISPUTE_STATUSES),
    verificationStatus: statusFromCollection(verifications, "none", PENDING_VERIFICATION_STATUSES),
    attentionLevel: insight.attentionLevel,
    attentionReasons: insight.attentionReasons,
    nextBestAction: insight.nextBestActions[0]?.label ?? "Monitor",
    readinessScore: insight.readinessScore,
    linkedCounts: insight.linkedCounts,
    canMarkUnderReview: !underReviewDisabledReason,
    markUnderReviewDisabledReason: underReviewDisabledReason,
    canCreateHandover,
    createHandoverDisabledReason,
    rowHref: `/admin/bookings?bookingId=${reservation.id}`,
  };
}

async function getSegmentCounts(filters: NormalizedBookingFilters, now: Date) {
  const countFilters = { ...filters, segment: "all" as const, status: null, bookingId: null };
  const baseWhere = buildBaseBookingWhere(countFilters, now);
  const [
    all,
    requested,
    confirmed,
    underReview,
    upcoming,
    active,
    past,
    cancelled,
    paymentAttention,
    openDisputes,
    handoverReservations,
    settledPayments,
    pendingGuestVerifications,
    pendingPropertyVerifications,
  ] = await Promise.all([
    prisma.reservation.count({ where: baseWhere }),
    prisma.reservation.count({ where: { AND: [baseWhere, { bookingStatus: "requested" }] } }),
    prisma.reservation.count({ where: { AND: [baseWhere, { bookingStatus: "confirmed" }] } }),
    prisma.reservation.count({ where: { AND: [baseWhere, { bookingStatus: "under_review" }] } }),
    prisma.reservation.count({ where: { AND: [baseWhere, { startDate: { gte: now }, bookingStatus: { notIn: ["cancelled", "completed"] } }] } }),
    prisma.reservation.count({ where: { AND: [baseWhere, { startDate: { lte: now }, endDate: { gte: now }, bookingStatus: { notIn: ["cancelled", "completed"] } }] } }),
    prisma.reservation.count({ where: { AND: [baseWhere, { OR: [{ endDate: { lt: now } }, { bookingStatus: "completed" }] }] } }),
    prisma.reservation.count({ where: { AND: [baseWhere, { bookingStatus: "cancelled" }] } }),
    prisma.paymentRecord.findMany({
      where: { status: { in: PAYMENT_ATTENTION_STATUSES }, reservationId: { not: null } },
      select: { reservationId: true },
      distinct: ["reservationId"],
    }),
    prisma.disputeCase.findMany({
      where: { status: { in: OPEN_DISPUTE_STATUSES }, reservationId: { not: null } },
      select: { reservationId: true },
      distinct: ["reservationId"],
    }),
    prisma.handoverTask.findMany({
      where: { reservationId: { not: null } },
      select: { reservationId: true },
      distinct: ["reservationId"],
    }),
    prisma.paymentRecord.findMany({
      where: { status: { in: PAYMENT_SETTLED_STATUSES }, reservationId: { not: null } },
      select: { reservationId: true },
      distinct: ["reservationId"],
    }),
    prisma.verificationRecord.findMany({
      where: { entityType: "guest", status: { in: PENDING_VERIFICATION_STATUSES } },
      select: { entityId: true },
      distinct: ["entityId"],
    }),
    prisma.verificationRecord.findMany({
      where: { entityType: "property", status: { in: PENDING_VERIFICATION_STATUSES } },
      select: { entityId: true },
      distinct: ["entityId"],
    }),
  ]);

  const paymentAttentionIds = unique(paymentAttention.map((item) => item.reservationId));
  const openDisputeIds = unique(openDisputes.map((item) => item.reservationId));
  const handoverIds = unique(handoverReservations.map((item) => item.reservationId));
  const settledPaymentIds = unique(settledPayments.map((item) => item.reservationId));
  const pendingGuestIds = unique(pendingGuestVerifications.map((item) => item.entityId));
  const pendingPropertyIds = unique(pendingPropertyVerifications.map((item) => item.entityId));

  const [paymentAttentionCount, openDisputeCount, handoverMissing, requiresAttention] = await Promise.all([
    paymentAttentionIds.length
      ? prisma.reservation.count({ where: { AND: [baseWhere, { id: { in: paymentAttentionIds } }] } })
      : 0,
    openDisputeIds.length
      ? prisma.reservation.count({ where: { AND: [baseWhere, { id: { in: openDisputeIds } }] } })
      : 0,
    prisma.reservation.count({
      where: {
        AND: [
          baseWhere,
          { startDate: { gte: now }, bookingStatus: { notIn: ["cancelled", "completed"] } },
          ...(handoverIds.length ? [{ id: { notIn: handoverIds } }] : []),
        ],
      },
    }),
    prisma.reservation.count({
      where: {
        AND: [
          baseWhere,
          {
            OR: [
              { bookingStatus: { in: ["requested", "under_review"] } },
              { priceLockedAt: null },
              { totalSnapshot: null },
              { nightlyPriceSnapshot: null, Home: { price: null } },
              { id: { in: paymentAttentionIds.length ? paymentAttentionIds : ["__no_payment_attention__"] } },
              { id: { in: openDisputeIds.length ? openDisputeIds : ["__no_open_dispute__"] } },
              { userId: { in: pendingGuestIds.length ? pendingGuestIds : ["__no_pending_guest__"] } },
              { homeId: { in: pendingPropertyIds.length ? pendingPropertyIds : ["__no_pending_property__"] } },
              {
                startDate: { gte: now },
                bookingStatus: { notIn: ["cancelled", "completed"] },
                ...(handoverIds.length ? { id: { notIn: handoverIds } } : {}),
              },
              {
                totalSnapshot: { gt: 0 },
                ...(settledPaymentIds.length ? { id: { notIn: settledPaymentIds } } : {}),
              },
            ],
          },
        ],
      },
    }),
  ]);

  const countMap: Record<string, number> = {
    all,
    requested,
    confirmed,
    under_review: underReview,
    upcoming_arrivals: upcoming,
    active_stays: active,
    past_stays: past,
    requires_attention: requiresAttention,
    payment_attention: paymentAttentionCount,
    handover_missing: handoverMissing,
    dispute_open: openDisputeCount,
    cancelled,
  };

  return BOOKING_OPERATIONAL_SEGMENTS.map((segment) => ({
    ...segment,
    count: countMap[segment.id] ?? 0,
  }));
}

export async function getBookingOperationsIndex(searchParams?: BookingSearchParams) {
  noStore();
  const now = new Date();
  const filters = normalizeBookingFilters(searchParams);
  const where = await buildOperationalBookingWhere(filters, now);

  const [totalCount, reservations, segmentCounts, provider] = await Promise.all([
    prisma.reservation.count({ where }),
    loadSummaryReservations(where, filters),
    getSegmentCounts(filters, now),
    getPayPalProviderReadiness(),
  ]);
  const linked = await loadLinkedSummary(reservations);
  const rows = reservations.map((reservation) => mapSummaryRow({ reservation, linked, filters, now }));
  const totalPages = Math.max(1, Math.ceil(totalCount / filters.pageSize));
  const attentionRows = rows.filter((row) => row.attentionLevel !== "none");

  return {
    provider,
    filters,
    rows,
    segmentCounts,
    pagination: {
      totalCount,
      totalPages,
      page: filters.page,
      pageSize: filters.pageSize,
      from: totalCount ? (filters.page - 1) * filters.pageSize + 1 : 0,
      to: Math.min(totalCount, filters.page * filters.pageSize),
    },
    intelligence: {
      currentPageAttentionCount: attentionRows.length,
      criticalCount: rows.filter((row) => row.attentionLevel === "critical").length,
      highCount: rows.filter((row) => row.attentionLevel === "high").length,
      paymentWorkCount: rows.filter((row) => ["missing", "pending_approval", "requires_review", "failed"].includes(row.paymentStatus)).length,
      handoverWorkCount: rows.filter((row) => row.handoverStatus === "missing" || row.handoverStatus === "issue_reported").length,
      disputeWorkCount: rows.filter((row) => row.disputeStatus !== "none" && !["resolved", "closed"].includes(row.disputeStatus)).length,
      averageReadiness: rows.length
        ? Math.round(rows.reduce((sum, row) => sum + row.readinessScore, 0) / rows.length)
        : null,
    },
  };
}

export async function getBookingOperationsDetail(bookingId: string | null | undefined) {
  noStore();
  if (!bookingId) return null;

  const reservation = await prisma.reservation.findUnique({
    where: { id: bookingId },
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
      listingVersionSnapshot: true,
      priceLockedAt: true,
      cancelledAt: true,
      completedAt: true,
      userId: true,
      homeId: true,
      User: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          profileImage: true,
          _count: { select: { Reservation: true, Favorite: true, Review: true } },
        },
      },
      Home: {
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
          submittedForReviewAt: true,
          approvedAt: true,
          userId: true,
          _count: { select: { images: true, reviews: true, Favorite: true } },
          User: { select: { id: true, email: true, firstName: true, lastName: true, role: true } },
        },
      },
    },
  });

  if (!reservation) return null;

  const payments = await prisma.paymentRecord.findMany({
    where: { reservationId: reservation.id },
    orderBy: { updatedAt: "desc" },
    include: { events: { orderBy: { createdAt: "desc" }, take: 20 } },
  });
  const paymentIds = payments.map((payment) => payment.id);

  const [handovers, disputes, verifications, premiumProfile, audits] = await Promise.all([
    prisma.handoverTask.findMany({
      where: { reservationId: reservation.id },
      orderBy: { updatedAt: "desc" },
      include: { events: { orderBy: { createdAt: "desc" }, take: 20 } },
    }),
    prisma.disputeCase.findMany({
      where: {
        OR: [
          { reservationId: reservation.id },
          ...(paymentIds.length ? [{ paymentRecordId: { in: paymentIds } }] : []),
        ],
      },
      orderBy: { updatedAt: "desc" },
      include: { events: { orderBy: { createdAt: "desc" }, take: 20 } },
    }),
    prisma.verificationRecord.findMany({
      where: {
        OR: [
          reservation.userId ? { entityType: "guest", entityId: reservation.userId } : noMatchVerificationWhere(),
          reservation.homeId ? { entityType: "property", entityId: reservation.homeId } : noMatchVerificationWhere(),
          ...(paymentIds.length ? [{ entityType: "payment", entityId: { in: paymentIds } }] : []),
          ...handoversForVerificationPlaceholder(),
        ],
      },
      orderBy: { updatedAt: "desc" },
      include: { events: { orderBy: { createdAt: "desc" }, take: 20 } },
    }),
    reservation.userId
      ? prisma.premiumGuestProfile.findUnique({
          where: { userId: reservation.userId },
          include: { events: { orderBy: { createdAt: "desc" }, take: 12 } },
        })
      : null,
    prisma.adminAuditEvent.findMany({
      where: {
        OR: [
          { targetType: "Reservation", targetId: reservation.id },
          ...(paymentIds.length ? [{ targetType: "PaymentRecord", targetId: { in: paymentIds } }] : []),
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 80,
    }),
  ]);

  const handoverIds = handovers.map((task) => task.id);
  const handoverVerifications = handoverIds.length
    ? await prisma.verificationRecord.findMany({
        where: { entityType: "handover", entityId: { in: handoverIds } },
        orderBy: { updatedAt: "desc" },
        include: { events: { orderBy: { createdAt: "desc" }, take: 20 } },
      })
    : [];
  const allVerifications = [...verifications, ...handoverVerifications];

  const insight = analyzeBooking({
    id: reservation.id,
    bookingStatus: reservation.bookingStatus,
    startDate: reservation.startDate,
    endDate: reservation.endDate,
    createdAt: reservation.createdAt,
    totalSnapshot: reservation.totalSnapshot,
    nightlyPriceSnapshot: reservation.nightlyPriceSnapshot,
    totalNightsSnapshot: reservation.totalNightsSnapshot,
    priceLockedAt: reservation.priceLockedAt,
    userId: reservation.userId,
    homeId: reservation.homeId,
    guestReservationCount: reservation.User?._count.Reservation ?? 0,
    guestFavoriteCount: reservation.User?._count.Favorite ?? 0,
    property: {
      price: reservation.Home?.price ?? null,
      listingStatus: reservation.Home?.listingStatus ?? null,
      contentReviewStatus: reservation.Home?.contentReviewStatus ?? null,
      imageCount: reservation.Home?._count.images ?? 0,
    },
    payments,
    handovers,
    disputes,
    verifications: allVerifications,
    premiumProfile,
  });

  const timeline = [
    {
      id: `reservation-created-${reservation.id}`,
      type: "reservation_created",
      summary: `Reservation ${referenceForReservation(reservation.id)} created.`,
      createdAt: reservation.createdAt,
      actor: reservation.userId,
      payloadPreview: null,
      href: `/admin/bookings?bookingId=${reservation.id}`,
    },
    ...audits.map((event) => ({
      id: `audit-${event.id}`,
      type: event.action,
      summary: event.summary,
      createdAt: event.createdAt,
      actor: event.actorId,
      payloadPreview: event.metadata ? JSON.stringify(event.metadata, null, 2) : null,
      href: event.targetType && event.targetId ? `/admin/bookings?bookingId=${reservation.id}#timeline` : undefined,
    })),
    ...payments.flatMap((payment) =>
      payment.events.map((event) => ({
        id: `payment-${event.id}`,
        type: event.type,
        summary: event.summary,
        createdAt: event.createdAt,
        actor: event.createdById,
        payloadPreview: event.payload ? JSON.stringify(event.payload, null, 2) : null,
        href: `/admin/payments?paymentId=${payment.id}`,
      }))
    ),
    ...handovers.flatMap((task) =>
      task.events.map((event) => ({
        id: `handover-${event.id}`,
        type: event.type,
        summary: event.message,
        createdAt: event.createdAt,
        actor: event.createdById,
        payloadPreview: event.payload ? JSON.stringify(event.payload, null, 2) : null,
        href: `/admin/handover?taskId=${task.id}`,
      }))
    ),
    ...disputes.flatMap((caseItem) =>
      caseItem.events.map((event) => ({
        id: `dispute-${event.id}`,
        type: event.type,
        summary: event.message,
        createdAt: event.createdAt,
        actor: event.createdById,
        payloadPreview: event.payload ? JSON.stringify(event.payload, null, 2) : null,
        href: `/admin/disputes?disputeId=${caseItem.id}`,
      }))
    ),
    ...allVerifications.flatMap((record) =>
      record.events.map((event) => ({
        id: `verification-${event.id}`,
        type: event.type,
        summary: event.message,
        createdAt: event.createdAt,
        actor: event.createdById,
        payloadPreview: event.payload ? JSON.stringify(event.payload, null, 2) : null,
        href: `/admin/verifications?verificationId=${record.id}`,
      }))
    ),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return {
    reference: referenceForReservation(reservation.id),
    reservation,
    payments,
    handovers,
    disputes,
    verifications: allVerifications,
    premiumProfile,
    insight,
    timeline,
    provider: getPayPalProviderReadiness(),
  };
}

function handoversForVerificationPlaceholder(): Prisma.VerificationRecordWhereInput[] {
  return [];
}

export function getBookingDisplayTitle(reservation: {
  id: string;
  listingTitleSnapshot?: string | null;
  Home?: { approvedTitle?: string | null; title?: string | null } | null;
}) {
  return titleForReservation(reservation);
}

export function getBookingReference(id: string) {
  return referenceForReservation(id);
}

export function getBookingPersonName(user?: { firstName?: string | null; lastName?: string | null; email?: string | null } | null) {
  return personName(user);
}
