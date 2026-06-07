import "server-only";

import { unstable_noStore as noStore } from "next/cache";
import type { Prisma } from "@prisma/client";
import prisma from "./db";
import { normalizeCurrency } from "./globalization";
import { formatCurrencyAmount } from "./marketplaceStatus";
import { getPayPalProviderReadiness } from "./paypal";
import {
  analyzePayment,
  isOpenDisputeStatus,
  type PaymentInsight,
  type PaymentLinkedCounts,
} from "./paymentIntelligence";
import {
  PAYMENT_OPERATIONAL_SEGMENTS,
  basePaymentWhereFromFilters,
  normalizePaymentFilters,
  paymentSegmentWhere,
  type NormalizedPaymentFilters,
  type PaymentSearchParams,
} from "./paymentFilters";

export const PAYMENT_STATUSES = [
  "draft",
  "order_created",
  "pending_approval",
  "authorized",
  "captured",
  "failed",
  "cancelled",
  "refunded",
  "partially_refunded",
  "requires_review",
] as const;

export const PAYMENT_METHODS = [
  "paypal_card",
  "paypal_wallet",
  "manual",
  "bank_transfer",
  "cash_to_host",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type PaymentOperationsRow = {
  id: string;
  reference: string;
  status: string;
  method: string;
  provider: string;
  providerEnvironment: string;
  providerOrderId: string | null;
  providerAuthorizationId: string | null;
  providerCaptureId: string | null;
  providerStatus: string | null;
  amount: number;
  amountLabel: string;
  currency: string;
  guestId: string | null;
  guestName: string;
  guestEmail: string | null;
  propertyId: string | null;
  propertyTitle: string;
  propertyCity: string | null;
  reservationId: string | null;
  bookingStatus: string | null;
  partnerId: string | null;
  partnerName: string;
  partnerEmail: string | null;
  disputeStatus: string;
  disputeCount: number;
  createdAtIso: string;
  updatedAtIso: string;
  lastEventAtIso: string | null;
  lastEventSummary: string | null;
  attentionLevel: PaymentInsight["attentionLevel"];
  attentionReasons: string[];
  nextBestAction: string;
  readinessScore: number;
  linkedCounts: PaymentLinkedCounts;
  canMarkRequiresReview: boolean;
  markRequiresReviewDisabledReason: string | null;
  canSyncProvider: boolean;
  syncProviderDisabledReason: string | null;
  rowHref: string;
};

type SummaryPaymentRecord = Awaited<ReturnType<typeof loadSummaryPaymentRecords>>[number];

function unique(values: (string | null | undefined)[]) {
  return Array.from(new Set(values.filter(Boolean) as string[]));
}

function noMatchPaymentWhere(): Prisma.PaymentRecordWhereInput {
  return { id: "__no_payment_match__" };
}

function paymentReference(id: string) {
  return `PAY-${id.slice(0, 8).toUpperCase()}`;
}

function personName(user?: { firstName?: string | null; lastName?: string | null; email?: string | null } | null) {
  if (!user) return "Not linked";
  return `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email || "Not linked";
}

function propertyTitle(property?: { approvedTitle?: string | null; title?: string | null } | null) {
  return property?.approvedTitle ?? property?.title ?? "Property not linked";
}

function decimalToNumber(value: Prisma.Decimal | number | string | null | undefined) {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : 0;
}

function latestDate(values: (Date | null | undefined)[]) {
  const real = values.filter(Boolean) as Date[];
  if (!real.length) return null;
  return new Date(Math.max(...real.map((value) => value.getTime())));
}

function paypalEventDate(events: { type: string; createdAt: Date }[]) {
  return events.find((event) => event.type.startsWith("paypal_") || event.type.includes("webhook"))?.createdAt ?? null;
}

async function searchPaymentWhere(query: string | null): Promise<Prisma.PaymentRecordWhereInput> {
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
      take: 60,
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
      take: 60,
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
      take: 60,
      select: { id: true, userId: true, homeId: true },
    }),
  ]);

  const guestIds = unique([...users.map((user) => user.id), ...reservations.map((reservation) => reservation.userId)]);
  const propertyIds = unique([...homes.map((home) => home.id), ...reservations.map((reservation) => reservation.homeId)]);
  const partnerIds = unique(homes.map((home) => home.userId));
  const reservationIds = unique(reservations.map((reservation) => reservation.id));

  return {
    OR: [
      { id: { contains: q, mode: "insensitive" } },
      { reservationId: { contains: q, mode: "insensitive" } },
      { bookingId: { contains: q, mode: "insensitive" } },
      { guestId: { contains: q, mode: "insensitive" } },
      { propertyId: { contains: q, mode: "insensitive" } },
      { partnerId: { contains: q, mode: "insensitive" } },
      { providerOrderId: { contains: q, mode: "insensitive" } },
      { providerAuthorizationId: { contains: q, mode: "insensitive" } },
      { providerCaptureId: { contains: q, mode: "insensitive" } },
      { failureReason: { contains: q, mode: "insensitive" } },
      ...(guestIds.length ? [{ guestId: { in: guestIds } }] : []),
      ...(propertyIds.length ? [{ propertyId: { in: propertyIds } }] : []),
      ...(partnerIds.length ? [{ partnerId: { in: partnerIds } }] : []),
      ...(reservationIds.length ? [{ reservationId: { in: reservationIds } }] : []),
    ],
  };
}

async function disputePaymentWhere(status: string | null): Promise<Prisma.PaymentRecordWhereInput> {
  if (!status) return {};
  const statuses = status === "open_active"
    ? ["open", "under_review", "awaiting_guest", "awaiting_partner", "awaiting_admin", "reopened"]
    : [status];
  const disputes = await prisma.disputeCase.findMany({
    where: { status: { in: statuses }, paymentRecordId: { not: null } },
    select: { paymentRecordId: true },
    distinct: ["paymentRecordId"],
  });
  const paymentIds = unique(disputes.map((dispute) => dispute.paymentRecordId));
  return paymentIds.length ? { id: { in: paymentIds } } : noMatchPaymentWhere();
}

async function buildPaymentWhere(filters: NormalizedPaymentFilters): Promise<Prisma.PaymentRecordWhereInput> {
  const and: Prisma.PaymentRecordWhereInput[] = [
    basePaymentWhereFromFilters(filters),
    paymentSegmentWhere(filters.segment),
    await searchPaymentWhere(filters.search),
    await disputePaymentWhere(filters.disputeStatus),
  ].filter((item) => Object.keys(item).length > 0);

  return and.length ? { AND: and } : {};
}

async function loadSummaryPaymentRecords(where: Prisma.PaymentRecordWhereInput, filters: NormalizedPaymentFilters) {
  return prisma.paymentRecord.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    skip: (filters.page - 1) * filters.pageSize,
    take: filters.pageSize,
    select: {
      id: true,
      reservationId: true,
      bookingId: true,
      guestId: true,
      propertyId: true,
      partnerId: true,
      amount: true,
      currency: true,
      baseAmount: true,
      baseCurrency: true,
      provider: true,
      providerEnvironment: true,
      providerOrderId: true,
      providerAuthorizationId: true,
      providerCaptureId: true,
      providerStatus: true,
      status: true,
      method: true,
      snapshotJson: true,
      failureReason: true,
      createdById: true,
      updatedById: true,
      capturedAt: true,
      authorizedAt: true,
      cancelledAt: true,
      createdAt: true,
      updatedAt: true,
      events: {
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          type: true,
          summary: true,
          providerEventId: true,
          createdAt: true,
          createdById: true,
        },
      },
    },
  });
}

async function loadLinkedSummary(records: SummaryPaymentRecord[]) {
  const paymentIds = records.map((record) => record.id);
  const reservationIds = unique(records.map((record) => record.reservationId));
  const directGuestIds = unique(records.map((record) => record.guestId));
  const directPropertyIds = unique(records.map((record) => record.propertyId));
  const directPartnerIds = unique(records.map((record) => record.partnerId));

  const [reservations, directProperties, directGuests, disputes, auditEvents] = await Promise.all([
    reservationIds.length
      ? prisma.reservation.findMany({
          where: { id: { in: reservationIds } },
          select: {
            id: true,
            startDate: true,
            endDate: true,
            bookingStatus: true,
            totalSnapshot: true,
            subtotalSnapshot: true,
            nightlyPriceSnapshot: true,
            cleaningFeeSnapshot: true,
            securityDepositSnapshot: true,
            totalNightsSnapshot: true,
            currencySnapshot: true,
            listingTitleSnapshot: true,
            listingCitySnapshot: true,
            userId: true,
            homeId: true,
            User: { select: { id: true, email: true, firstName: true, lastName: true, role: true } },
            Home: {
              select: {
                id: true,
                title: true,
                approvedTitle: true,
                city: true,
                userId: true,
                listingStatus: true,
                contentReviewStatus: true,
                price: true,
                cleaningFee: true,
                securityDeposit: true,
                User: { select: { id: true, email: true, firstName: true, lastName: true, role: true } },
              },
            },
          },
        })
      : [],
    directPropertyIds.length
      ? prisma.home.findMany({
          where: { id: { in: directPropertyIds } },
          select: {
            id: true,
            title: true,
            approvedTitle: true,
            city: true,
            userId: true,
            listingStatus: true,
            contentReviewStatus: true,
            price: true,
            cleaningFee: true,
            securityDeposit: true,
            User: { select: { id: true, email: true, firstName: true, lastName: true, role: true } },
          },
        })
      : [],
    directGuestIds.length
      ? prisma.user.findMany({
          where: { id: { in: directGuestIds } },
          select: { id: true, email: true, firstName: true, lastName: true, role: true },
        })
      : [],
    paymentIds.length
      ? prisma.disputeCase.findMany({
          where: { paymentRecordId: { in: paymentIds } },
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            caseNumber: true,
            paymentRecordId: true,
            reservationId: true,
            status: true,
            priority: true,
            title: true,
            updatedAt: true,
            createdAt: true,
          },
        })
      : [],
    paymentIds.length
      ? prisma.adminAuditEvent.findMany({
          where: { targetType: "PaymentRecord", targetId: { in: paymentIds } },
          select: { id: true, targetId: true },
        })
      : [],
  ]);

  const reservationGuestIds = unique(reservations.map((reservation) => reservation.userId));
  const reservationPropertyIds = unique(reservations.map((reservation) => reservation.homeId));
  const reservationPartnerIds = unique(reservations.map((reservation) => reservation.Home?.userId));
  const missingGuestIds = unique([...reservationGuestIds, ...directGuestIds]);
  const missingPropertyIds = unique([...reservationPropertyIds, ...directPropertyIds]);
  const missingPartnerIds = unique([...reservationPartnerIds, ...directPartnerIds]);

  const [guests, properties, partners] = await Promise.all([
    missingGuestIds.length
      ? prisma.user.findMany({
          where: { id: { in: missingGuestIds } },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            _count: { select: { Reservation: true } },
          },
        })
      : [],
    missingPropertyIds.length
      ? prisma.home.findMany({
          where: { id: { in: missingPropertyIds } },
          select: {
            id: true,
            title: true,
            approvedTitle: true,
            city: true,
            userId: true,
            listingStatus: true,
            contentReviewStatus: true,
            price: true,
            cleaningFee: true,
            securityDeposit: true,
            _count: { select: { images: true, features: true } },
            User: { select: { id: true, email: true, firstName: true, lastName: true, role: true } },
          },
        })
      : [],
    missingPartnerIds.length
      ? prisma.user.findMany({
          where: { id: { in: missingPartnerIds } },
          select: { id: true, email: true, firstName: true, lastName: true, role: true },
        })
      : [],
  ]);

  const reservationsById = new Map(reservations.map((reservation) => [reservation.id, reservation]));
  const guestById = new Map([...directGuests, ...guests].map((guest) => [guest.id, guest]));
  const propertyById = new Map([...directProperties, ...properties].map((property) => [property.id, property]));
  const partnerById = new Map(partners.map((partner) => [partner.id, partner]));
  const disputesByPaymentId = disputes.reduce<Map<string, typeof disputes>>((acc, dispute) => {
    if (!dispute.paymentRecordId) return acc;
    const list = acc.get(dispute.paymentRecordId) ?? [];
    list.push(dispute);
    acc.set(dispute.paymentRecordId, list);
    return acc;
  }, new Map());
  const auditCountByPaymentId = auditEvents.reduce<Map<string, number>>((acc, event) => {
    if (!event.targetId) return acc;
    acc.set(event.targetId, (acc.get(event.targetId) ?? 0) + 1);
    return acc;
  }, new Map());

  return {
    reservationsById,
    guestById,
    propertyById,
    partnerById,
    disputesByPaymentId,
    auditCountByPaymentId,
  };
}

function rowForPayment({
  record,
  linked,
  filters,
  provider,
}: {
  record: SummaryPaymentRecord;
  linked: Awaited<ReturnType<typeof loadLinkedSummary>>;
  filters: NormalizedPaymentFilters;
  provider: ReturnType<typeof getPayPalProviderReadiness>;
}): PaymentOperationsRow {
  const reservation = record.reservationId ? linked.reservationsById.get(record.reservationId) : null;
  const guestId = record.guestId ?? reservation?.userId ?? null;
  const propertyId = record.propertyId ?? reservation?.homeId ?? null;
  const property = propertyId ? linked.propertyById.get(propertyId) ?? reservation?.Home : reservation?.Home ?? null;
  const guest = guestId ? linked.guestById.get(guestId) ?? reservation?.User : reservation?.User ?? null;
  const partnerId = record.partnerId ?? property?.userId ?? reservation?.Home?.userId ?? null;
  const partner = partnerId ? linked.partnerById.get(partnerId) ?? property?.User ?? reservation?.Home?.User : property?.User ?? reservation?.Home?.User ?? null;
  const disputes = linked.disputesByPaymentId.get(record.id) ?? [];
  const openDisputeCount = disputes.filter((dispute) => isOpenDisputeStatus(dispute.status)).length;
  const lastEvent = record.events[0] ?? null;
  const linkedCounts: PaymentLinkedCounts = {
    events: record.events.length,
    disputes: disputes.length,
    auditEvents: linked.auditCountByPaymentId.get(record.id) ?? 0,
    reservations: record.reservationId ? 1 : 0,
    guests: guestId ? 1 : 0,
    properties: propertyId ? 1 : 0,
    partners: partnerId ? 1 : 0,
  };
  const amount = decimalToNumber(record.amount);
  const insight = analyzePayment({
    id: record.id,
    reservationId: record.reservationId,
    guestId,
    propertyId,
    partnerId,
    amount,
    currency: record.currency,
    status: record.status,
    method: record.method,
    provider: record.provider,
    providerEnvironment: record.providerEnvironment,
    providerOrderId: record.providerOrderId,
    providerAuthorizationId: record.providerAuthorizationId,
    providerCaptureId: record.providerCaptureId,
    providerStatus: record.providerStatus,
    failureReason: record.failureReason,
    snapshotJson: record.snapshotJson,
    capturedAt: record.capturedAt,
    authorizedAt: record.authorizedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastProviderSyncAt: paypalEventDate(record.events),
    openDisputeCount,
    linkedCounts,
    providerReadiness: provider,
    reservation: reservation
      ? {
          id: reservation.id,
          totalSnapshot: reservation.totalSnapshot,
          currencySnapshot: reservation.currencySnapshot,
          bookingStatus: reservation.bookingStatus,
        }
      : null,
  });
  const disputeStatus = openDisputeCount ? "open_active" : disputes[0]?.status ?? "none";

  return {
    id: record.id,
    reference: paymentReference(record.id),
    status: record.status,
    method: record.method,
    provider: record.provider,
    providerEnvironment: record.providerEnvironment,
    providerOrderId: record.providerOrderId,
    providerAuthorizationId: record.providerAuthorizationId,
    providerCaptureId: record.providerCaptureId,
    providerStatus: record.providerStatus,
    amount,
    amountLabel: formatCurrencyAmount(amount, record.currency),
    currency: record.currency,
    guestId,
    guestName: personName(guest),
    guestEmail: guest?.email ?? null,
    propertyId,
    propertyTitle: reservation?.listingTitleSnapshot ?? propertyTitle(property),
    propertyCity: reservation?.listingCitySnapshot ?? property?.city ?? null,
    reservationId: record.reservationId,
    bookingStatus: reservation?.bookingStatus ?? null,
    partnerId,
    partnerName: personName(partner),
    partnerEmail: partner?.email ?? null,
    disputeStatus,
    disputeCount: disputes.length,
    createdAtIso: record.createdAt.toISOString(),
    updatedAtIso: record.updatedAt.toISOString(),
    lastEventAtIso: lastEvent?.createdAt.toISOString() ?? null,
    lastEventSummary: lastEvent?.summary ?? null,
    attentionLevel: insight.attentionLevel,
    attentionReasons: insight.attentionReasons,
    nextBestAction: insight.nextBestActions[0]?.label ?? "Monitor",
    readinessScore: insight.readinessScore,
    linkedCounts,
    canMarkRequiresReview: record.status !== "requires_review",
    markRequiresReviewDisabledReason: record.status === "requires_review" ? "Payment is already marked requires review." : null,
    canSyncProvider: record.provider === "paypal" && Boolean(record.providerOrderId) && provider.isConfigured,
    syncProviderDisabledReason: !record.providerOrderId
      ? "Payment record has no PayPal order id."
      : !provider.isConfigured
        ? "PayPal provider is not configured."
        : null,
    rowHref: `/admin/payments?paymentId=${record.id}`,
  };
}

export async function getPaymentOperationsIndex(searchParams?: PaymentSearchParams) {
  noStore();

  const filters = normalizePaymentFilters(searchParams);
  const provider = getPayPalProviderReadiness();
  const where = await buildPaymentWhere(filters);
  const [totalCount, records, segmentCounts, statusGroups, methodGroups] = await Promise.all([
    prisma.paymentRecord.count({ where }),
    loadSummaryPaymentRecords(where, filters),
    Promise.all(
      PAYMENT_OPERATIONAL_SEGMENTS.map(async (segment) => ({
        id: segment.id,
        label: segment.label,
        description: segment.description,
        count: await prisma.paymentRecord.count({
          where: await buildPaymentWhere({ ...filters, segment: segment.id, page: 1 }),
        }),
      }))
    ),
    prisma.paymentRecord.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.paymentRecord.groupBy({ by: ["method"], _count: { _all: true } }),
  ]);
  const linked = await loadLinkedSummary(records);
  const rows = records.map((record) => rowForPayment({ record, linked, filters, provider }));
  const totalPages = Math.max(1, Math.ceil(totalCount / filters.pageSize));
  const from = totalCount === 0 ? 0 : (filters.page - 1) * filters.pageSize + 1;
  const to = Math.min(totalCount, filters.page * filters.pageSize);
  const highAttentionRows = rows.filter((row) => row.attentionLevel === "critical" || row.attentionLevel === "high");
  const currentPageReadiness = rows.length
    ? Math.round(rows.reduce((sum, row) => sum + row.readinessScore, 0) / rows.length)
    : null;
  const countByStatus = Object.fromEntries(statusGroups.map((group) => [group.status, group._count._all]));
  const countByMethod = Object.fromEntries(methodGroups.map((group) => [group.method, group._count._all]));

  return {
    provider,
    filters,
    rows,
    segmentCounts,
    countByStatus,
    countByMethod,
    pagination: {
      page: filters.page,
      pageSize: filters.pageSize,
      totalCount,
      totalPages,
      from,
      to,
      hasPrevious: filters.page > 1,
      hasNext: filters.page < totalPages,
    },
    intelligence: {
      currentPageReadiness,
      currentPageAttentionCount: rows.filter((row) => row.attentionLevel !== "none").length,
      highCount: rows.filter((row) => row.attentionLevel === "high").length,
      criticalCount: rows.filter((row) => row.attentionLevel === "critical").length,
      providerUnsyncedCount: rows.filter((row) => row.attentionReasons.some((reason) => reason.toLowerCase().includes("synced"))).length,
      reviewCount: rows.filter((row) => row.status === "requires_review").length,
      manualSettlementCount: rows.filter((row) => ["manual", "bank_transfer", "cash_to_host"].includes(row.method) || row.provider === "manual").length,
      blockers: highAttentionRows.slice(0, 6),
    },
  };
}

export async function getPaymentOperationsDetail(paymentId: string) {
  noStore();

  const provider = getPayPalProviderReadiness();
  const payment = await prisma.paymentRecord.findUnique({
    where: { id: paymentId },
    include: {
      events: { orderBy: { createdAt: "desc" }, take: 80 },
    },
  });
  if (!payment) return null;

  const reservation = payment.reservationId
    ? await prisma.reservation.findUnique({
        where: { id: payment.reservationId },
        include: {
          User: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
              _count: { select: { Reservation: true, Favorite: true, Review: true } },
            },
          },
          Home: {
            include: {
              User: { select: { id: true, email: true, firstName: true, lastName: true, role: true } },
              _count: { select: { images: true, features: true, reviews: true } },
            },
          },
        },
      })
    : null;
  const guestId = payment.guestId ?? reservation?.userId ?? null;
  const propertyId = payment.propertyId ?? reservation?.homeId ?? null;
  const [guest, property] = await Promise.all([
    guestId
      ? prisma.user.findUnique({
          where: { id: guestId },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            _count: { select: { Reservation: true, Favorite: true, Review: true } },
          },
        })
      : null,
    propertyId
      ? prisma.home.findUnique({
          where: { id: propertyId },
          include: {
            User: { select: { id: true, email: true, firstName: true, lastName: true, role: true } },
            _count: { select: { images: true, features: true, reviews: true } },
          },
        })
      : null,
  ]);
  const partnerId = payment.partnerId ?? property?.userId ?? reservation?.Home?.userId ?? null;
  const [partner, disputes, auditEvents, premiumProfile, verifications] = await Promise.all([
    partnerId
      ? prisma.user.findUnique({
          where: { id: partnerId },
          select: { id: true, email: true, firstName: true, lastName: true, role: true },
        })
      : null,
    prisma.disputeCase.findMany({
      where: {
        OR: [
          { paymentRecordId: payment.id },
          ...(payment.reservationId ? [{ reservationId: payment.reservationId }] : []),
          ...(guestId ? [{ guestId }] : []),
          ...(propertyId ? [{ propertyId }] : []),
          ...(partnerId ? [{ partnerId }] : []),
        ],
      },
      orderBy: { updatedAt: "desc" },
      include: { events: { orderBy: { createdAt: "desc" }, take: 20 } },
    }),
    prisma.adminAuditEvent.findMany({
      where: {
        OR: [
          { targetType: "PaymentRecord", targetId: payment.id },
          ...(payment.reservationId ? [{ targetType: "Reservation", targetId: payment.reservationId }] : []),
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 80,
    }),
    guestId
      ? prisma.premiumGuestProfile.findUnique({
          where: { userId: guestId },
          include: { events: { orderBy: { createdAt: "desc" }, take: 12 } },
        })
      : null,
    prisma.verificationRecord.findMany({
      where: {
        OR: [
          { entityType: "payment", entityId: payment.id },
          ...(guestId ? [{ entityType: "guest", entityId: guestId }] : []),
          ...(propertyId ? [{ entityType: "property", entityId: propertyId }] : []),
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 30,
    }),
  ]);

  const openDisputeCount = disputes.filter((dispute) => isOpenDisputeStatus(dispute.status)).length;
  const linkedCounts: PaymentLinkedCounts = {
    events: payment.events.length,
    disputes: disputes.length,
    auditEvents: auditEvents.length,
    reservations: payment.reservationId ? 1 : 0,
    guests: guestId ? 1 : 0,
    properties: propertyId ? 1 : 0,
    partners: partnerId ? 1 : 0,
  };
  const amount = decimalToNumber(payment.amount);
  const insight = analyzePayment({
    id: payment.id,
    reservationId: payment.reservationId,
    guestId,
    propertyId,
    partnerId,
    amount,
    currency: payment.currency,
    status: payment.status,
    method: payment.method,
    provider: payment.provider,
    providerEnvironment: payment.providerEnvironment,
    providerOrderId: payment.providerOrderId,
    providerAuthorizationId: payment.providerAuthorizationId,
    providerCaptureId: payment.providerCaptureId,
    providerStatus: payment.providerStatus,
    failureReason: payment.failureReason,
    snapshotJson: payment.snapshotJson,
    capturedAt: payment.capturedAt,
    authorizedAt: payment.authorizedAt,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
    lastProviderSyncAt: paypalEventDate(payment.events),
    openDisputeCount,
    linkedCounts,
    providerReadiness: provider,
    reservation: reservation
      ? {
          id: reservation.id,
          totalSnapshot: reservation.totalSnapshot,
          currencySnapshot: reservation.currencySnapshot,
          bookingStatus: reservation.bookingStatus,
        }
      : null,
  });
  const timeline = [
    ...payment.events.map((event) => ({
      id: event.id,
      type: event.type,
      summary: event.summary,
      createdAt: event.createdAt,
      actor: event.createdById,
      payloadPreview: event.payload ? JSON.stringify(event.payload, null, 2) : null,
    })),
    ...auditEvents.map((event) => ({
      id: event.id,
      type: `audit_${event.action}`,
      summary: event.summary,
      createdAt: event.createdAt,
      actor: event.actorId,
      payloadPreview: event.metadata ? JSON.stringify(event.metadata, null, 2) : null,
    })),
    ...disputes.flatMap((dispute) =>
      dispute.events.map((event) => ({
        id: event.id,
        type: `dispute_${event.type}`,
        summary: event.message,
        createdAt: event.createdAt,
        actor: event.createdById,
        payloadPreview: event.payload ? JSON.stringify(event.payload, null, 2) : null,
        href: `/admin/disputes?disputeId=${dispute.id}`,
      }))
    ),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return {
    payment,
    reference: paymentReference(payment.id),
    amount,
    amountLabel: formatCurrencyAmount(amount, payment.currency),
    provider,
    reservation,
    guest: guest ?? reservation?.User ?? null,
    property: property ?? reservation?.Home ?? null,
    partner: partner ?? property?.User ?? reservation?.Home?.User ?? null,
    premiumProfile,
    verifications,
    disputes,
    auditEvents,
    insight,
    timeline,
    lastActivityAt: latestDate([
      payment.updatedAt,
      payment.events[0]?.createdAt,
      auditEvents[0]?.createdAt,
      disputes[0]?.updatedAt,
    ]),
    source: sourceForPayment(payment.snapshotJson),
  };
}

function getNightCount(startDate: Date, endDate: Date) {
  const nights = Math.ceil(
    (endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)
  );

  return nights > 0 ? nights : 0;
}

export async function getReservationPaymentSnapshot(reservationId: string) {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      bookingStatus: true,
      cancelledAt: true,
      nightlyPriceSnapshot: true,
      cleaningFeeSnapshot: true,
      securityDepositSnapshot: true,
      totalNightsSnapshot: true,
      subtotalSnapshot: true,
      totalSnapshot: true,
      currencySnapshot: true,
      listingTitleSnapshot: true,
      listingCitySnapshot: true,
      userId: true,
      homeId: true,
      User: { select: { id: true, email: true, firstName: true, lastName: true } },
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
        },
      },
    },
  });

  if (!reservation) return null;

  const nights = reservation.totalNightsSnapshot ?? getNightCount(reservation.startDate, reservation.endDate);
  const nightly = reservation.nightlyPriceSnapshot ?? reservation.Home?.price ?? null;
  const cleaning = reservation.cleaningFeeSnapshot ?? reservation.Home?.cleaningFee ?? 0;
  const deposit = reservation.securityDepositSnapshot ?? reservation.Home?.securityDeposit ?? 0;
  const subtotal = reservation.subtotalSnapshot ?? (nightly === null ? null : nightly * nights);
  const total = reservation.totalSnapshot ?? (subtotal === null ? null : subtotal + cleaning + deposit);

  return {
    reservation,
    amount: total,
    currency: reservation.currencySnapshot ?? "USD",
    guestId: reservation.userId,
    propertyId: reservation.homeId,
    partnerId: reservation.Home?.userId ?? null,
    snapshotJson: {
      source: "reservation_snapshot",
      reservationId: reservation.id,
      bookingStatus: reservation.bookingStatus,
      cancelledAt: reservation.cancelledAt?.toISOString() ?? null,
      startDate: reservation.startDate.toISOString(),
      endDate: reservation.endDate.toISOString(),
      nightlyPriceSnapshot: reservation.nightlyPriceSnapshot,
      cleaningFeeSnapshot: reservation.cleaningFeeSnapshot,
      securityDepositSnapshot: reservation.securityDepositSnapshot,
      totalNightsSnapshot: nights,
      subtotalSnapshot: subtotal,
      totalSnapshot: total,
      currencySnapshot: reservation.currencySnapshot,
      listingTitleSnapshot: reservation.listingTitleSnapshot,
      listingCitySnapshot: reservation.listingCitySnapshot,
    },
  };
}

export function parsePaymentAmount(value?: FormDataEntryValue | string | number | null) {
  const parsed = Number(String(value ?? "").trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed.toFixed(2);
}

export function isPaymentStatus(value?: string | null): value is PaymentStatus {
  return PAYMENT_STATUSES.includes(value as PaymentStatus);
}

export function isPaymentMethod(value?: string | null): value is PaymentMethod {
  return PAYMENT_METHODS.includes(value as PaymentMethod);
}

export function normalizePaymentCurrency(value?: string | null) {
  return normalizeCurrency(value, "USD");
}

export function sourceForPayment(snapshotJson: Prisma.JsonValue | null) {
  if (!snapshotJson || typeof snapshotJson !== "object" || Array.isArray(snapshotJson)) {
    return "unknown";
  }
  const source = snapshotJson.source;
  if (typeof source === "string" && source.trim()) return source;
  const checkoutSource = snapshotJson.checkoutSource;
  if (typeof checkoutSource === "string" && checkoutSource.trim()) return checkoutSource;
  if (snapshotJson.manualSettlementNote) return "manual_settlement";
  return "operations";
}

export async function findReusableCheckoutPayment(reservationId: string) {
  return prisma.paymentRecord.findFirst({
    where: {
      reservationId,
      provider: "paypal",
      status: { in: ["draft", "order_created", "pending_approval", "authorized", "requires_review"] },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getPaymentTerminalReservations(query?: string | null, selectedReservationId?: string | null) {
  noStore();

  const search = query?.trim();
  const searchWhere: Prisma.ReservationWhereInput[] = [];

  if (search) {
    const [users, homes] = await Promise.all([
      prisma.user.findMany({
        where: {
          OR: [
            { id: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
            { firstName: { contains: search, mode: "insensitive" } },
            { lastName: { contains: search, mode: "insensitive" } },
          ],
        },
        take: 40,
        select: { id: true },
      }),
      prisma.home.findMany({
        where: {
          OR: [
            { id: { contains: search, mode: "insensitive" } },
            { title: { contains: search, mode: "insensitive" } },
            { approvedTitle: { contains: search, mode: "insensitive" } },
            { city: { contains: search, mode: "insensitive" } },
          ],
        },
        take: 40,
        select: { id: true },
      }),
    ]);

    const userIds = unique(users.map((user) => user.id));
    const homeIds = unique(homes.map((home) => home.id));
    searchWhere.push({
      OR: [
        { id: { contains: search, mode: "insensitive" } },
        { bookingStatus: { contains: search, mode: "insensitive" } },
        { listingTitleSnapshot: { contains: search, mode: "insensitive" } },
        { listingCitySnapshot: { contains: search, mode: "insensitive" } },
        ...(userIds.length ? [{ userId: { in: userIds } }] : []),
        ...(homeIds.length ? [{ homeId: { in: homeIds } }] : []),
      ],
    });
  }

  if (selectedReservationId) searchWhere.push({ id: selectedReservationId });

  const reservations = await prisma.reservation.findMany({
    where: searchWhere.length === 0
      ? {}
      : searchWhere.length === 1
        ? searchWhere[0]
        : { OR: searchWhere },
    orderBy: { createdAt: "desc" },
    take: 80,
    select: {
      id: true,
      startDate: true,
      endDate: true,
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
      userId: true,
      homeId: true,
      cancelledAt: true,
      User: { select: { id: true, email: true, firstName: true, lastName: true } },
      Home: {
        select: {
          id: true,
          title: true,
          approvedTitle: true,
          city: true,
          userId: true,
          User: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      },
    },
  });

  const reservationIds = unique(reservations.map((reservation) => reservation.id));
  const [payments, disputes] = await Promise.all([
    reservationIds.length
      ? prisma.paymentRecord.findMany({
          where: { reservationId: { in: reservationIds } },
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            reservationId: true,
            status: true,
            method: true,
            provider: true,
            providerOrderId: true,
            providerStatus: true,
            amount: true,
            currency: true,
            createdAt: true,
            updatedAt: true,
          },
        })
      : [],
    reservationIds.length
      ? prisma.disputeCase.findMany({
          where: { reservationId: { in: reservationIds } },
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            caseNumber: true,
            reservationId: true,
            status: true,
            priority: true,
            title: true,
            updatedAt: true,
          },
        })
      : [],
  ]);

  const paymentsByReservationId = payments.reduce<Map<string, typeof payments>>((acc, payment) => {
    if (!payment.reservationId) return acc;
    const list = acc.get(payment.reservationId) ?? [];
    list.push(payment);
    acc.set(payment.reservationId, list);
    return acc;
  }, new Map());
  const disputesByReservationId = disputes.reduce<Map<string, typeof disputes>>((acc, dispute) => {
    if (!dispute.reservationId) return acc;
    const list = acc.get(dispute.reservationId) ?? [];
    list.push(dispute);
    acc.set(dispute.reservationId, list);
    return acc;
  }, new Map());

  return reservations.map((reservation) => ({
    ...reservation,
    paymentRecords: paymentsByReservationId.get(reservation.id) ?? [],
    disputeCases: disputesByReservationId.get(reservation.id) ?? [],
  }));
}
