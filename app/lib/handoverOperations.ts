import "server-only";

import { unstable_noStore as noStore } from "next/cache";
import type { Prisma } from "@prisma/client";
import prisma from "./db";
import {
  HANDOVER_LIFECYCLE_SEGMENTS,
  HANDOVER_PRIORITIES,
  HANDOVER_STATUSES,
  HANDOVER_TYPES,
  baseHandoverWhereFromFilters,
  normalizeHandoverFilters,
  segmentWhere,
  type HandoverSearchParams,
  type NormalizedHandoverFilters,
} from "./handoverFilters";
import {
  HANDOVER_STATUS_LABELS,
  HANDOVER_TYPE_LABELS,
  analyzeHandoverTask,
  getHandoverStatusTransitionDisabledReason,
  type HandoverInsight,
  type HandoverLinkedDispute,
  type HandoverLinkedPayment,
  type HandoverLinkedVerification,
} from "./handoverIntelligence";
import { getHandoverTaskTimeline } from "./operationsTimeline";

export {
  HANDOVER_LIFECYCLE_SEGMENTS,
  HANDOVER_PRIORITIES,
  HANDOVER_STATUSES,
  HANDOVER_STATUS_LABELS,
  HANDOVER_TYPES,
  HANDOVER_TYPE_LABELS,
};

const PAYMENT_SETTLED_STATUSES = ["captured", "authorized"];
const PAYMENT_ATTENTION_STATUSES = ["draft", "order_created", "pending_approval", "failed", "requires_review"];
const OPEN_DISPUTE_STATUSES = ["open", "under_review", "awaiting_guest", "awaiting_partner", "awaiting_admin", "reopened"];
const ACTIVE_HANDOVER_STATUSES = ["not_scheduled", "pending_preparation", "ready", "in_progress", "issue_reported"];

export type HandoverOperationsRow = {
  id: string;
  taskNumber: string;
  type: string;
  typeLabel: string;
  status: string;
  statusLabel: string;
  priority: string;
  title: string;
  summary: string | null;
  reservationId: string | null;
  reservationReference: string;
  guestId: string | null;
  guestName: string;
  guestEmail: string | null;
  propertyId: string | null;
  propertyTitle: string;
  propertyCity: string | null;
  partnerId: string | null;
  partnerName: string;
  partnerEmail: string | null;
  scheduledForIso: string | null;
  checkInIso: string | null;
  checkOutIso: string | null;
  paymentStatus: string;
  disputeStatus: string;
  verificationStatus: string;
  checklistLabel: string;
  checklistPercent: number | null;
  checklistDone: number;
  checklistTotal: number;
  lastEventSummary: string | null;
  lastEventAtIso: string | null;
  updatedAtIso: string;
  attentionLevel: HandoverInsight["attentionLevel"];
  attentionReasons: string[];
  nextBestAction: string;
  lifecycleStage: string;
  readinessScore: number;
  linkedCounts: HandoverInsight["linkedCounts"];
  rowHref: string;
  canMarkPendingPreparation: boolean;
  markPendingPreparationDisabledReason: string | null;
  canMarkReady: boolean;
  markReadyDisabledReason: string | null;
  canStart: boolean;
  startDisabledReason: string | null;
  canComplete: boolean;
  completeDisabledReason: string | null;
};

export type HandoverQueueReservation = {
  id: string;
  reference: string;
  bookingStatus: string;
  title: string;
  city: string | null;
  guestName: string;
  guestEmail: string | null;
  propertyId: string | null;
  partnerId: string | null;
  checkInIso: string;
  checkOutIso: string;
  paymentStatus: string;
  hasCheckInTask: boolean;
  hasCheckoutTask: boolean;
  hasCleaningTask: boolean;
  missingCheckInTask: boolean;
  missingCheckoutTask: boolean;
  rowHref: string;
};

export type HandoverOperationsIndex = Awaited<ReturnType<typeof getHandoverOperationsIndex>>;
export type HandoverOperationsDetail = NonNullable<Awaited<ReturnType<typeof getHandoverOperationsDetail>>>;

type SummaryTask = Awaited<ReturnType<typeof loadSummaryTasks>>[number];
type SummaryReservation = Awaited<ReturnType<typeof loadReservationsForTasks>>[number];
type SummaryPayment = Awaited<ReturnType<typeof loadPaymentsForContexts>>[number];
type SummaryDispute = Awaited<ReturnType<typeof loadDisputesForContexts>>[number];
type SummaryVerification = Awaited<ReturnType<typeof loadVerificationsForContexts>>[number];

export function createHandoverTaskNumber() {
  return `HND-${Date.now().toString(36).toUpperCase()}`;
}

export function getHandoverTaskReference(id: string) {
  return `HND-${id.slice(0, 8).toUpperCase()}`;
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

function taskTypeLabel(type: string) {
  return HANDOVER_TYPE_LABELS[type as keyof typeof HANDOVER_TYPE_LABELS] ?? type.replaceAll("_", " ");
}

function taskStatusLabel(status: string) {
  return HANDOVER_STATUS_LABELS[status as keyof typeof HANDOVER_STATUS_LABELS] ?? status.replaceAll("_", " ");
}

function latestDate(values: (Date | null | undefined)[]) {
  const dates = values.filter(Boolean) as Date[];
  if (!dates.length) return null;
  return new Date(Math.max(...dates.map((date) => date.getTime())));
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

function noMatchHandoverWhere(): Prisma.HandoverTaskWhereInput {
  return { id: "__no_handover_match__" };
}

async function searchHandoverWhere(query: string | null): Promise<Prisma.HandoverTaskWhereInput> {
  if (!query) return {};
  const q = query.trim();
  if (!q) return {};

  const [users, homes, reservations] = await Promise.all([
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
  ]);

  const userIds = unique([...users.map((user) => user.id), ...reservations.map((reservation) => reservation.userId)]);
  const propertyIds = unique([...homes.map((home) => home.id), ...reservations.map((reservation) => reservation.homeId)]);
  const partnerIds = unique([...homes.map((home) => home.userId), ...reservations.map((reservation) => reservation.Home?.userId)]);
  const reservationIds = unique(reservations.map((reservation) => reservation.id));

  return {
    OR: [
      { id: { contains: q, mode: "insensitive" } },
      { taskNumber: { contains: q, mode: "insensitive" } },
      { title: { contains: q, mode: "insensitive" } },
      { summary: { contains: q, mode: "insensitive" } },
      { reservationId: { contains: q, mode: "insensitive" } },
      { propertyId: { contains: q, mode: "insensitive" } },
      { guestId: { contains: q, mode: "insensitive" } },
      { partnerId: { contains: q, mode: "insensitive" } },
      ...(reservationIds.length ? [{ reservationId: { in: reservationIds } }] : []),
      ...(propertyIds.length ? [{ propertyId: { in: propertyIds } }] : []),
      ...(userIds.length ? [{ guestId: { in: userIds } }] : []),
      ...(partnerIds.length ? [{ partnerId: { in: partnerIds } }] : []),
    ],
  };
}

async function cityHandoverWhere(city: string | null): Promise<Prisma.HandoverTaskWhereInput> {
  if (!city) return {};
  const q = city.trim();
  if (!q) return {};

  const [homes, reservations] = await Promise.all([
    prisma.home.findMany({
      where: { city: { contains: q, mode: "insensitive" } },
      select: { id: true },
      take: 250,
    }),
    prisma.reservation.findMany({
      where: { listingCitySnapshot: { contains: q, mode: "insensitive" } },
      select: { id: true, homeId: true },
      take: 250,
    }),
  ]);

  const propertyIds = unique([...homes.map((home) => home.id), ...reservations.map((reservation) => reservation.homeId)]);
  const reservationIds = unique(reservations.map((reservation) => reservation.id));
  if (!propertyIds.length && !reservationIds.length) return noMatchHandoverWhere();

  return {
    OR: [
      ...(propertyIds.length ? [{ propertyId: { in: propertyIds } }] : []),
      ...(reservationIds.length ? [{ reservationId: { in: reservationIds } }] : []),
    ],
  };
}

async function upcomingReservationTaskWhere(kind: "arrival" | "checkout", now: Date): Promise<Prisma.HandoverTaskWhereInput> {
  const until = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const reservations = await prisma.reservation.findMany({
    where: {
      bookingStatus: { notIn: ["cancelled", "completed"] },
      ...(kind === "arrival" ? { startDate: { gte: now, lte: until } } : { endDate: { gte: now, lte: until } }),
    },
    select: { id: true },
    take: 500,
  });
  const ids = reservations.map((reservation) => reservation.id);
  return ids.length ? { reservationId: { in: ids } } : noMatchHandoverWhere();
}

async function paymentNotReadyTaskWhere(now: Date): Promise<Prisma.HandoverTaskWhereInput> {
  const [settled, payableReservations] = await Promise.all([
    prisma.paymentRecord.findMany({
      where: { status: { in: PAYMENT_SETTLED_STATUSES }, reservationId: { not: null } },
      select: { reservationId: true },
      distinct: ["reservationId"],
    }),
    prisma.reservation.findMany({
      where: {
        totalSnapshot: { gt: 0 },
        bookingStatus: { notIn: ["cancelled", "completed"] },
        startDate: { gte: now },
      },
      select: { id: true },
      take: 800,
    }),
  ]);
  const settledIds = new Set(unique(settled.map((payment) => payment.reservationId)));
  const notReadyIds = payableReservations.map((reservation) => reservation.id).filter((id) => !settledIds.has(id));
  return notReadyIds.length ? { reservationId: { in: notReadyIds } } : noMatchHandoverWhere();
}

async function disputeOpenTaskWhere(): Promise<Prisma.HandoverTaskWhereInput> {
  const disputes = await prisma.disputeCase.findMany({
    where: { status: { in: OPEN_DISPUTE_STATUSES } },
    select: { reservationId: true, propertyId: true, guestId: true, partnerId: true },
    take: 800,
  });
  const reservationIds = unique(disputes.map((dispute) => dispute.reservationId));
  const propertyIds = unique(disputes.map((dispute) => dispute.propertyId));
  const guestIds = unique(disputes.map((dispute) => dispute.guestId));
  const partnerIds = unique(disputes.map((dispute) => dispute.partnerId));
  if (!reservationIds.length && !propertyIds.length && !guestIds.length && !partnerIds.length) return noMatchHandoverWhere();
  return {
    OR: [
      ...(reservationIds.length ? [{ reservationId: { in: reservationIds } }] : []),
      ...(propertyIds.length ? [{ propertyId: { in: propertyIds } }] : []),
      ...(guestIds.length ? [{ guestId: { in: guestIds } }] : []),
      ...(partnerIds.length ? [{ partnerId: { in: partnerIds } }] : []),
    ],
  };
}

async function buildOperationalHandoverWhere(
  filters: NormalizedHandoverFilters,
  now: Date,
  overrides: Partial<NormalizedHandoverFilters> = {}
): Promise<Prisma.HandoverTaskWhereInput> {
  const effective = { ...filters, ...overrides };
  const and: Prisma.HandoverTaskWhereInput[] = [
    baseHandoverWhereFromFilters(effective, now),
    await searchHandoverWhere(effective.search),
    await cityHandoverWhere(effective.city),
  ];

  if (effective.upcomingArrivals) and.push(await upcomingReservationTaskWhere("arrival", now));
  if (effective.upcomingCheckouts) and.push(await upcomingReservationTaskWhere("checkout", now));
  if (effective.paymentNotReady) and.push(await paymentNotReadyTaskWhere(now));
  if (effective.disputeOpen) and.push(await disputeOpenTaskWhere());

  const clean = and.filter((item) => Object.keys(item).length > 0);
  return clean.length ? { AND: clean } : {};
}

async function loadSummaryTasks(where: Prisma.HandoverTaskWhereInput, filters: NormalizedHandoverFilters) {
  return prisma.handoverTask.findMany({
    where,
    orderBy: [{ priority: "desc" }, { scheduledFor: "asc" }, { updatedAt: "desc" }],
    skip: (filters.page - 1) * filters.pageSize,
    take: filters.pageSize,
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
      assignedToId: true,
      createdById: true,
      updatedById: true,
      createdAt: true,
      updatedAt: true,
      events: { orderBy: { createdAt: "desc" }, take: 4 },
    },
  });
}

async function loadBoardTasks(where: Prisma.HandoverTaskWhereInput) {
  return prisma.handoverTask.findMany({
    where,
    orderBy: [{ status: "asc" }, { priority: "desc" }, { scheduledFor: "asc" }, { updatedAt: "desc" }],
    take: 180,
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
      assignedToId: true,
      createdById: true,
      updatedById: true,
      createdAt: true,
      updatedAt: true,
      events: { orderBy: { createdAt: "desc" }, take: 4 },
    },
  });
}

async function loadReservationsForTasks(reservationIds: string[]) {
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
          User: { select: { id: true, email: true, firstName: true, lastName: true, role: true } },
          Home: {
            select: {
              id: true,
              title: true,
              approvedTitle: true,
              city: true,
              guestCount: true,
              propertyType: true,
              stayType: true,
              price: true,
              listingStatus: true,
              contentReviewStatus: true,
              userId: true,
              _count: { select: { images: true } },
              User: { select: { id: true, email: true, firstName: true, lastName: true, role: true } },
            },
          },
        },
      })
    : [];
}

async function loadPaymentsForContexts(context: {
  reservationIds: string[];
  propertyIds: string[];
  guestIds: string[];
  partnerIds: string[];
}) {
  const ors: Prisma.PaymentRecordWhereInput[] = [
    ...(context.reservationIds.length ? [{ reservationId: { in: context.reservationIds } }] : []),
    ...(context.propertyIds.length ? [{ propertyId: { in: context.propertyIds } }] : []),
    ...(context.guestIds.length ? [{ guestId: { in: context.guestIds } }] : []),
    ...(context.partnerIds.length ? [{ partnerId: { in: context.partnerIds } }] : []),
  ];
  return ors.length
    ? prisma.paymentRecord.findMany({
        where: { OR: ors },
        orderBy: { updatedAt: "desc" },
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
          createdAt: true,
          updatedAt: true,
          events: { orderBy: { createdAt: "desc" }, take: 6 },
        },
      })
    : [];
}

async function loadDisputesForContexts(context: {
  reservationIds: string[];
  paymentIds: string[];
  propertyIds: string[];
  guestIds: string[];
  partnerIds: string[];
}) {
  const ors: Prisma.DisputeCaseWhereInput[] = [
    ...(context.reservationIds.length ? [{ reservationId: { in: context.reservationIds } }] : []),
    ...(context.paymentIds.length ? [{ paymentRecordId: { in: context.paymentIds } }] : []),
    ...(context.propertyIds.length ? [{ propertyId: { in: context.propertyIds } }] : []),
    ...(context.guestIds.length ? [{ guestId: { in: context.guestIds } }] : []),
    ...(context.partnerIds.length ? [{ partnerId: { in: context.partnerIds } }] : []),
  ];
  return ors.length
    ? prisma.disputeCase.findMany({
        where: { OR: ors },
        orderBy: { updatedAt: "desc" },
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
          openedAt: true,
          resolvedAt: true,
          closedAt: true,
          createdAt: true,
          updatedAt: true,
          events: { orderBy: { createdAt: "desc" }, take: 8 },
        },
      })
    : [];
}

async function loadVerificationsForContexts(context: {
  handoverIds: string[];
  paymentIds: string[];
  propertyIds: string[];
  guestIds: string[];
  partnerIds: string[];
}) {
  const ors: Prisma.VerificationRecordWhereInput[] = [
    ...(context.handoverIds.length ? [{ entityType: "handover", entityId: { in: context.handoverIds } }] : []),
    ...(context.paymentIds.length ? [{ entityType: "payment", entityId: { in: context.paymentIds } }] : []),
    ...(context.propertyIds.length ? [{ entityType: "property", entityId: { in: context.propertyIds } }] : []),
    ...(context.guestIds.length ? [{ entityType: "guest", entityId: { in: context.guestIds } }] : []),
    ...(context.partnerIds.length ? [{ entityType: "partner", entityId: { in: context.partnerIds } }] : []),
  ];
  return ors.length
    ? prisma.verificationRecord.findMany({
        where: { OR: ors },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          entityType: true,
          entityId: true,
          category: true,
          status: true,
          title: true,
          summary: true,
          evidenceSummary: true,
          createdAt: true,
          updatedAt: true,
          events: { orderBy: { createdAt: "desc" }, take: 6 },
        },
      })
    : [];
}

async function loadLinkedSummary(tasks: SummaryTask[]) {
  const reservationIds = unique(tasks.map((task) => task.reservationId));
  const reservations = await loadReservationsForTasks(reservationIds);
  const reservationById = new Map(reservations.map((reservation) => [reservation.id, reservation]));

  const propertyIds = unique([
    ...tasks.map((task) => task.propertyId),
    ...reservations.map((reservation) => reservation.homeId),
  ]);
  const guestIds = unique([
    ...tasks.map((task) => task.guestId),
    ...reservations.map((reservation) => reservation.userId),
  ]);
  const partnerIds = unique([
    ...tasks.map((task) => task.partnerId),
    ...reservations.map((reservation) => reservation.Home?.userId),
  ]);

  const [properties, guests, partners] = await Promise.all([
    propertyIds.length
      ? prisma.home.findMany({
          where: { id: { in: propertyIds } },
          select: {
            id: true,
            title: true,
            approvedTitle: true,
            city: true,
            neighborhood: true,
            propertyType: true,
            stayType: true,
            price: true,
            listingStatus: true,
            contentReviewStatus: true,
            userId: true,
            _count: { select: { images: true, reviews: true, Favorite: true } },
            User: { select: { id: true, email: true, firstName: true, lastName: true, role: true } },
          },
        })
      : [],
    guestIds.length
      ? prisma.user.findMany({
          where: { id: { in: guestIds } },
          select: { id: true, email: true, firstName: true, lastName: true, role: true, _count: { select: { Reservation: true, Favorite: true } } },
        })
      : [],
    partnerIds.length
      ? prisma.user.findMany({
          where: { id: { in: partnerIds } },
          select: { id: true, email: true, firstName: true, lastName: true, role: true },
        })
      : [],
  ]);

  const payments = await loadPaymentsForContexts({ reservationIds, propertyIds, guestIds, partnerIds });
  const paymentIds = payments.map((payment) => payment.id);
  const [disputes, verifications] = await Promise.all([
    loadDisputesForContexts({ reservationIds, paymentIds, propertyIds, guestIds, partnerIds }),
    loadVerificationsForContexts({ handoverIds: tasks.map((task) => task.id), paymentIds, propertyIds, guestIds, partnerIds }),
  ]);

  const siblingTasks = reservationIds.length
    ? await prisma.handoverTask.findMany({
        where: { reservationId: { in: reservationIds } },
        select: { id: true, reservationId: true, type: true, status: true },
      })
    : [];

  return {
    reservations,
    reservationById,
    propertiesById: new Map(properties.map((item) => [item.id, item])),
    guestsById: new Map(guests.map((item) => [item.id, item])),
    partnersById: new Map(partners.map((item) => [item.id, item])),
    payments,
    disputes,
    verifications,
    siblingTasks,
  };
}

function paymentsForTask(task: SummaryTask, payments: SummaryPayment[]) {
  return payments.filter((payment) =>
    (task.reservationId && payment.reservationId === task.reservationId) ||
    (task.propertyId && payment.propertyId === task.propertyId) ||
    (task.guestId && payment.guestId === task.guestId) ||
    (task.partnerId && payment.partnerId === task.partnerId)
  );
}

function disputesForTask(task: SummaryTask, disputes: SummaryDispute[], payments: SummaryPayment[]) {
  const paymentIds = paymentsForTask(task, payments).map((payment) => payment.id);
  return disputes.filter((dispute) =>
    (task.reservationId && dispute.reservationId === task.reservationId) ||
    (task.propertyId && dispute.propertyId === task.propertyId) ||
    (task.guestId && dispute.guestId === task.guestId) ||
    (task.partnerId && dispute.partnerId === task.partnerId) ||
    (dispute.paymentRecordId && paymentIds.includes(dispute.paymentRecordId))
  );
}

function verificationsForTask(task: SummaryTask, verifications: SummaryVerification[], payments: SummaryPayment[]) {
  const paymentIds = paymentsForTask(task, payments).map((payment) => payment.id);
  return verifications.filter((record) =>
    (record.entityType === "handover" && record.entityId === task.id) ||
    (task.propertyId && record.entityType === "property" && record.entityId === task.propertyId) ||
    (task.guestId && record.entityType === "guest" && record.entityId === task.guestId) ||
    (task.partnerId && record.entityType === "partner" && record.entityId === task.partnerId) ||
    (record.entityType === "payment" && paymentIds.includes(record.entityId))
  );
}

function mapTaskRow(task: SummaryTask, linked: Awaited<ReturnType<typeof loadLinkedSummary>>, now: Date): HandoverOperationsRow {
  const reservation = task.reservationId ? linked.reservationById.get(task.reservationId) ?? null : null;
  const propertyId = task.propertyId ?? reservation?.homeId ?? null;
  const guestId = task.guestId ?? reservation?.userId ?? null;
  const partnerId = task.partnerId ?? reservation?.Home?.userId ?? null;
  const property = propertyId ? linked.propertiesById.get(propertyId) ?? reservation?.Home ?? null : null;
  const guest = guestId ? linked.guestsById.get(guestId) ?? reservation?.User ?? null : null;
  const partner = partnerId ? linked.partnersById.get(partnerId) ?? property?.User ?? reservation?.Home?.User ?? null : null;
  const payments = paymentsForTask({ ...task, propertyId, guestId, partnerId }, linked.payments) as HandoverLinkedPayment[];
  const disputes = disputesForTask({ ...task, propertyId, guestId, partnerId }, linked.disputes, linked.payments) as HandoverLinkedDispute[];
  const verifications = verificationsForTask({ ...task, propertyId, guestId, partnerId }, linked.verifications, linked.payments) as HandoverLinkedVerification[];
  const insight = analyzeHandoverTask({
    ...task,
    propertyId,
    guestId,
    partnerId,
    reservation,
    property: property
      ? {
          id: property.id,
          listingStatus: property.listingStatus,
          contentReviewStatus: property.contentReviewStatus,
          price: property.price,
          imageCount: property._count?.images ?? 0,
        }
      : null,
    payments,
    disputes,
    verifications,
    siblingTasks: linked.siblingTasks,
    now,
  });
  const lastEvent = task.events[0] ?? null;
  const latest = latestDate([task.updatedAt, task.createdAt, lastEvent?.createdAt ?? null]);
  const pendingReason = getHandoverStatusTransitionDisabledReason(task.status, "pending_preparation");
  const readyReason = getHandoverStatusTransitionDisabledReason(task.status, "ready") ??
    (insight.paymentNotReady
      ? "Payment readiness is blocked."
      : insight.disputeOpen
        ? "Open dispute must be reviewed before marking ready."
        : insight.propertyNotReady
          ? "Property readiness is incomplete."
          : insight.checklistIncomplete
            ? "Checklist must be completed before marking ready."
            : null);
  const startReason = getHandoverStatusTransitionDisabledReason(task.status, "in_progress");
  const completeReason = getHandoverStatusTransitionDisabledReason(task.status, "completed") ??
    (!insight.readyForCompletion ? "Resolve blockers and complete the checklist before completion." : null);

  return {
    id: task.id,
    taskNumber: task.taskNumber,
    type: task.type,
    typeLabel: taskTypeLabel(task.type),
    status: task.status,
    statusLabel: taskStatusLabel(task.status),
    priority: task.priority,
    title: task.title,
    summary: task.summary,
    reservationId: task.reservationId,
    reservationReference: getReservationReference(task.reservationId),
    guestId,
    guestName: personName(guest),
    guestEmail: guest?.email ?? null,
    propertyId,
    propertyTitle: propertyTitle(property),
    propertyCity: reservation?.listingCitySnapshot ?? property?.city ?? null,
    partnerId,
    partnerName: personName(partner),
    partnerEmail: partner?.email ?? null,
    scheduledForIso: task.scheduledFor?.toISOString() ?? null,
    checkInIso: reservation?.startDate.toISOString() ?? null,
    checkOutIso: reservation?.endDate.toISOString() ?? null,
    paymentStatus: statusFromCollection(payments, reservation?.totalSnapshot ? "missing" : "not_required", PAYMENT_ATTENTION_STATUSES),
    disputeStatus: statusFromCollection(disputes, "none", OPEN_DISPUTE_STATUSES),
    verificationStatus: statusFromCollection(verifications, "none", ["pending", "under_review", "needs_information"]),
    checklistLabel: insight.checklistProgress.percent === null
      ? "No checklist"
      : `${insight.checklistProgress.done}/${insight.checklistProgress.total}`,
    checklistPercent: insight.checklistProgress.percent,
    checklistDone: insight.checklistProgress.done,
    checklistTotal: insight.checklistProgress.total,
    lastEventSummary: lastEvent?.message ?? null,
    lastEventAtIso: lastEvent?.createdAt.toISOString() ?? null,
    updatedAtIso: latest?.toISOString() ?? task.updatedAt.toISOString(),
    attentionLevel: insight.attentionLevel,
    attentionReasons: insight.attentionReasons,
    nextBestAction: insight.nextBestActions[0]?.label ?? "Keep in operations queue",
    lifecycleStage: insight.lifecycleStage,
    readinessScore: insight.readinessScore,
    linkedCounts: { ...insight.linkedCounts, events: task.events.length },
    rowHref: `/admin/handover?handoverId=${task.id}`,
    canMarkPendingPreparation: !pendingReason,
    markPendingPreparationDisabledReason: pendingReason,
    canMarkReady: !readyReason,
    markReadyDisabledReason: readyReason,
    canStart: !startReason,
    startDisabledReason: startReason,
    canComplete: !completeReason,
    completeDisabledReason: completeReason,
  };
}

async function getSegmentCounts(filters: NormalizedHandoverFilters, now: Date) {
  const baseFilters = { ...filters, segment: "all" as const, status: null, handoverId: null, page: 1 };
  const baseWhere = await buildOperationalHandoverWhere(baseFilters, now);
  const counts = await Promise.all(
    HANDOVER_LIFECYCLE_SEGMENTS.map(async (segment) => ({
      ...segment,
      count: await prisma.handoverTask.count({ where: { AND: [baseWhere, segmentWhere(segment.id, now)] } }),
    }))
  );
  return counts;
}

async function getUpcomingReservationQueues(now: Date) {
  const until = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const reservations = await prisma.reservation.findMany({
    where: {
      bookingStatus: { notIn: ["cancelled", "completed"] },
      OR: [
        { startDate: { gte: now, lte: until } },
        { endDate: { gte: now, lte: until } },
      ],
    },
    orderBy: { startDate: "asc" },
    take: 160,
    select: {
      id: true,
      startDate: true,
      endDate: true,
      bookingStatus: true,
      totalSnapshot: true,
      listingTitleSnapshot: true,
      listingCitySnapshot: true,
      userId: true,
      homeId: true,
      User: { select: { email: true, firstName: true, lastName: true } },
      Home: { select: { id: true, title: true, approvedTitle: true, city: true, userId: true } },
    },
  });

  const reservationIds = reservations.map((reservation) => reservation.id);
  const [payments, tasks] = await Promise.all([
    reservationIds.length
      ? prisma.paymentRecord.findMany({
          where: { reservationId: { in: reservationIds } },
          select: { reservationId: true, status: true, updatedAt: true },
          orderBy: { updatedAt: "desc" },
        })
      : [],
    reservationIds.length
      ? prisma.handoverTask.findMany({
          where: { reservationId: { in: reservationIds }, status: { not: "cancelled" } },
          select: { reservationId: true, type: true, status: true },
        })
      : [],
  ]);

  const queueItems: HandoverQueueReservation[] = reservations.map((reservation) => {
    const reservationPayments = payments.filter((payment) => payment.reservationId === reservation.id);
    const reservationTasks = tasks.filter((task) => task.reservationId === reservation.id);
    const hasCheckInTask = reservationTasks.some((task) => task.type === "check_in");
    const hasCheckoutTask = reservationTasks.some((task) => task.type === "check_out");
    const hasCleaningTask = reservationTasks.some((task) => task.type === "cleaning");
    return {
      id: reservation.id,
      reference: getReservationReference(reservation.id),
      bookingStatus: reservation.bookingStatus,
      title: reservation.listingTitleSnapshot ?? reservation.Home?.approvedTitle ?? reservation.Home?.title ?? "Reservation",
      city: reservation.listingCitySnapshot ?? reservation.Home?.city ?? null,
      guestName: personName(reservation.User),
      guestEmail: reservation.User?.email ?? null,
      propertyId: reservation.homeId,
      partnerId: reservation.Home?.userId ?? null,
      checkInIso: reservation.startDate.toISOString(),
      checkOutIso: reservation.endDate.toISOString(),
      paymentStatus: statusFromCollection(reservationPayments, reservation.totalSnapshot ? "missing" : "not_required", PAYMENT_ATTENTION_STATUSES),
      hasCheckInTask,
      hasCheckoutTask,
      hasCleaningTask,
      missingCheckInTask: !hasCheckInTask && reservation.startDate >= now,
      missingCheckoutTask: !hasCheckoutTask && reservation.endDate >= now,
      rowHref: `/admin/bookings?bookingId=${reservation.id}`,
    };
  });

  return {
    upcomingArrivals: queueItems.filter((item) => new Date(item.checkInIso) >= now),
    upcomingCheckouts: queueItems.filter((item) => new Date(item.checkOutIso) >= now),
    availableReservations: queueItems,
  };
}

async function getAutomationCandidateCount(now: Date) {
  const until = new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000);
  const [reservations, settledPayments, existingTasks] = await Promise.all([
    prisma.reservation.findMany({
      where: {
        bookingStatus: { in: ["confirmed", "reserved"] },
        startDate: { gte: now, lte: until },
      },
      select: { id: true },
      take: 500,
    }),
    prisma.paymentRecord.findMany({
      where: { status: { in: PAYMENT_SETTLED_STATUSES }, reservationId: { not: null } },
      select: { reservationId: true },
      distinct: ["reservationId"],
    }),
    prisma.handoverTask.findMany({
      where: { status: { not: "cancelled" }, type: { in: ["check_in", "check_out"] } },
      select: { reservationId: true, type: true },
    }),
  ]);

  const paid = new Set(unique(settledPayments.map((payment) => payment.reservationId)));
  const hasCheckIn = new Set(existingTasks.filter((task) => task.type === "check_in").map((task) => task.reservationId).filter(Boolean) as string[]);
  return reservations.filter((reservation) => paid.has(reservation.id) && !hasCheckIn.has(reservation.id)).length;
}

async function getAssignableAdmins() {
  return prisma.user.findMany({
    where: { role: { contains: "admin", mode: "insensitive" } },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    take: 80,
    select: { id: true, email: true, firstName: true, lastName: true, role: true },
  });
}

export async function getHandoverOperationsIndex(searchParams?: HandoverSearchParams) {
  noStore();
  const now = new Date();
  const filters = normalizeHandoverFilters(searchParams);
  const where = await buildOperationalHandoverWhere(filters, now);
  const boardWhere = await buildOperationalHandoverWhere({ ...filters, status: null, page: 1 }, now);

  const [totalCount, tasks, boardTasks, statusGroups, segmentCounts, queues, automationCandidateCount, assignableAdmins] = await Promise.all([
    prisma.handoverTask.count({ where }),
    loadSummaryTasks(where, filters),
    loadBoardTasks(boardWhere),
    prisma.handoverTask.groupBy({ by: ["status"], where: boardWhere, _count: { _all: true } }),
    getSegmentCounts(filters, now),
    getUpcomingReservationQueues(now),
    getAutomationCandidateCount(now),
    getAssignableAdmins(),
  ]);

  const uniqueTasks = Array.from(new Map([...tasks, ...boardTasks].map((task) => [task.id, task])).values());
  const linked = await loadLinkedSummary(uniqueTasks);
  const rowById = new Map(uniqueTasks.map((task) => [task.id, mapTaskRow(task, linked, now)]));
  const rows = tasks.map((task) => rowById.get(task.id)).filter(Boolean) as HandoverOperationsRow[];
  const boardRows = boardTasks.map((task) => rowById.get(task.id)).filter(Boolean) as HandoverOperationsRow[];
  const attentionRows = rows.filter((row) => row.attentionLevel !== "none");
  const statusCounts = statusGroups.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = item._count._all;
    return acc;
  }, {});
  const maintenanceQueue = rows.filter((row) =>
    row.type === "maintenance" ||
    row.type === "issue_followup" ||
    row.status === "issue_reported" ||
    row.attentionReasons.some((reason) => reason.toLowerCase().includes("maintenance"))
  );
  const cleaningQueue = rows.filter((row) => row.type === "cleaning" || row.attentionReasons.some((reason) => reason.toLowerCase().includes("cleaning")));
  const overdueRows = rows.filter((row) => row.attentionReasons.some((reason) => reason.toLowerCase().includes("overdue")));
  const paymentNotReadyRows = rows.filter((row) => row.paymentStatus === "missing" || PAYMENT_ATTENTION_STATUSES.includes(row.paymentStatus));
  const disputeOpenRows = rows.filter((row) => OPEN_DISPUTE_STATUSES.includes(row.disputeStatus));
  const issueRows = rows.filter((row) => row.status === "issue_reported");
  const missingReservationRows = rows.filter((row) => !row.reservationId);
  const averageReadiness = rows.length ? Math.round(rows.reduce((sum, row) => sum + row.readinessScore, 0) / rows.length) : null;

  return {
    filters,
    rows,
    boardRows,
    segmentCounts,
    statusCounts,
    queues: {
      ...queues,
      cleaningQueue,
      maintenanceQueue,
      urgentIssues: issueRows.filter((row) => ["high", "urgent"].includes(row.priority) || row.attentionLevel === "critical"),
      overdueRows,
      paymentNotReadyRows,
      disputeOpenRows,
      missingReservationRows,
    },
    automationCandidateCount,
    assignableAdmins,
    pagination: {
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / filters.pageSize)),
      page: filters.page,
      pageSize: filters.pageSize,
      from: totalCount ? (filters.page - 1) * filters.pageSize + 1 : 0,
      to: Math.min(totalCount, filters.page * filters.pageSize),
    },
    intelligence: {
      activeTasksCount: Object.entries(statusCounts).reduce((sum, [status, count]) => ACTIVE_HANDOVER_STATUSES.includes(status) ? sum + count : sum, 0),
      upcomingArrivalsCount: queues.upcomingArrivals.length,
      upcomingCheckoutsCount: queues.upcomingCheckouts.length,
      issueReportedCount: issueRows.length,
      currentPageAttentionCount: attentionRows.length,
      criticalCount: rows.filter((row) => row.attentionLevel === "critical").length,
      highCount: rows.filter((row) => row.attentionLevel === "high").length,
      averageReadiness,
      nextBestActions: rows
        .filter((row) => row.attentionLevel !== "none")
        .slice(0, 8)
        .map((row) => ({
          id: row.id,
          title: row.nextBestAction,
          description: `${row.taskNumber} - ${row.attentionReasons[0] ?? "Task needs operational attention."}`,
          severity: row.attentionLevel,
          href: row.rowHref,
        })),
    },
  };
}

export async function getHandoverOperationsDetail(handoverId: string | null | undefined) {
  noStore();
  if (!handoverId) return null;

  const task = await prisma.handoverTask.findUnique({
    where: { id: handoverId },
    include: { events: { orderBy: { createdAt: "desc" }, take: 80 } },
  });
  if (!task) return null;

  const reservation = task.reservationId
    ? await prisma.reservation.findUnique({
        where: { id: task.reservationId },
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
              guestCount: true,
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
      })
    : null;

  const propertyId = task.propertyId ?? reservation?.homeId ?? null;
  const guestId = task.guestId ?? reservation?.userId ?? null;
  const partnerId = task.partnerId ?? reservation?.Home?.userId ?? null;

  const [property, guest, partner] = await Promise.all([
    propertyId && propertyId !== reservation?.homeId
      ? prisma.home.findUnique({
          where: { id: propertyId },
          select: {
            id: true,
            title: true,
            approvedTitle: true,
            city: true,
            guestCount: true,
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
        })
      : null,
    guestId && guestId !== reservation?.userId
      ? prisma.user.findUnique({
          where: { id: guestId },
          select: { id: true, email: true, firstName: true, lastName: true, role: true, _count: { select: { Reservation: true, Favorite: true, Review: true } } },
        })
      : null,
    partnerId && partnerId !== reservation?.Home?.userId
      ? prisma.user.findUnique({
          where: { id: partnerId },
          select: { id: true, email: true, firstName: true, lastName: true, role: true },
        })
      : null,
  ]);

  const effectiveProperty = property ?? reservation?.Home ?? null;
  const effectiveGuest = guest ?? reservation?.User ?? null;
  const effectivePartner = partner ?? effectiveProperty?.User ?? reservation?.Home?.User ?? null;
  const context = {
    reservationIds: unique([task.reservationId]),
    propertyIds: unique([propertyId]),
    guestIds: unique([guestId]),
    partnerIds: unique([partnerId]),
  };
  const payments = await loadPaymentsForContexts(context);
  const paymentIds = payments.map((payment) => payment.id);
  const [disputes, verifications, siblingTasks, premiumProfile, assignableAdmins] = await Promise.all([
    loadDisputesForContexts({ ...context, paymentIds }),
    loadVerificationsForContexts({ handoverIds: [task.id], paymentIds, propertyIds: context.propertyIds, guestIds: context.guestIds, partnerIds: context.partnerIds }),
    task.reservationId
      ? prisma.handoverTask.findMany({
          where: { reservationId: task.reservationId },
          orderBy: { updatedAt: "desc" },
          select: { id: true, reservationId: true, taskNumber: true, type: true, status: true, priority: true, title: true, scheduledFor: true },
        })
      : [],
    guestId
      ? prisma.premiumGuestProfile.findUnique({
          where: { userId: guestId },
          include: { events: { orderBy: { createdAt: "desc" }, take: 12 } },
        })
      : null,
    getAssignableAdmins(),
  ]);
  const insight = analyzeHandoverTask({
    ...task,
    propertyId,
    guestId,
    partnerId,
    reservation,
    property: effectiveProperty
      ? {
          id: effectiveProperty.id,
          listingStatus: effectiveProperty.listingStatus,
          contentReviewStatus: effectiveProperty.contentReviewStatus,
          price: effectiveProperty.price,
          imageCount: effectiveProperty._count?.images ?? 0,
        }
      : null,
    payments: payments as HandoverLinkedPayment[],
    disputes: disputes as HandoverLinkedDispute[],
    verifications: verifications as HandoverLinkedVerification[],
    siblingTasks,
  });
  const timeline = await getHandoverTaskTimeline({
    taskId: task.id,
    reservationId: task.reservationId,
    paymentIds,
    disputeIds: disputes.map((dispute) => dispute.id),
  });

  return {
    task,
    taskReference: task.taskNumber || getHandoverTaskReference(task.id),
    typeLabel: taskTypeLabel(task.type),
    statusLabel: taskStatusLabel(task.status),
    reservation,
    reservationReference: getReservationReference(task.reservationId),
    property: effectiveProperty,
    guest: effectiveGuest,
    partner: effectivePartner,
    payments,
    disputes,
    verifications,
    siblingTasks,
    premiumProfile,
    assignableAdmins,
    insight,
    timeline,
  };
}

export async function getHandoverOperationsData(searchParams?: HandoverSearchParams) {
  return getHandoverOperationsIndex(searchParams);
}
