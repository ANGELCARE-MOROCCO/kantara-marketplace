import "server-only";

import { unstable_noStore as noStore } from "next/cache";
import type { Prisma } from "@prisma/client";
import prisma from "./db";

export const VERIFICATION_ENTITY_TYPES = ["guest", "partner", "property", "payment", "handover"] as const;
export const VERIFICATION_CATEGORIES = [
  "identity",
  "ownership",
  "authorization",
  "compliance",
  "property_quality",
  "payment_risk",
  "premium_guest",
  "operational_readiness",
] as const;
export const VERIFICATION_STATUSES = [
  "pending",
  "under_review",
  "verified",
  "needs_information",
  "rejected",
  "expired",
] as const;

export type VerificationFilters = {
  q?: string | null;
  entityType?: string | null;
  category?: string | null;
  status?: string | null;
};

function buildWhere(filters: VerificationFilters): Prisma.VerificationRecordWhereInput {
  const and: Prisma.VerificationRecordWhereInput[] = [];
  if (filters.entityType && VERIFICATION_ENTITY_TYPES.includes(filters.entityType as any)) {
    and.push({ entityType: filters.entityType });
  }
  if (filters.category && VERIFICATION_CATEGORIES.includes(filters.category as any)) {
    and.push({ category: filters.category });
  }
  if (filters.status && VERIFICATION_STATUSES.includes(filters.status as any)) {
    and.push({ status: filters.status });
  }
  const q = filters.q?.trim();
  if (q) {
    and.push({
      OR: [
        { id: { contains: q, mode: "insensitive" } },
        { entityId: { contains: q, mode: "insensitive" } },
        { title: { contains: q, mode: "insensitive" } },
        { summary: { contains: q, mode: "insensitive" } },
        { evidenceSummary: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  return and.length ? { AND: and } : {};
}

export async function getVerificationOperationsData(filters: VerificationFilters = {}) {
  noStore();
  const where = buildWhere(filters);

  const [records, countsByStatus, countsByCategory] = await Promise.all([
    prisma.verificationRecord.findMany({
      where,
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 100,
      include: {
        events: { orderBy: { createdAt: "desc" }, take: 12 },
      },
    }),
    prisma.verificationRecord.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.verificationRecord.groupBy({ by: ["category"], _count: { _all: true } }),
  ]);

  const guestIds = records.filter((record) => record.entityType === "guest").map((record) => record.entityId);
  const partnerIds = records.filter((record) => record.entityType === "partner").map((record) => record.entityId);
  const propertyIds = records.filter((record) => record.entityType === "property").map((record) => record.entityId);
  const paymentIds = records.filter((record) => record.entityType === "payment").map((record) => record.entityId);
  const handoverIds = records.filter((record) => record.entityType === "handover").map((record) => record.entityId);

  const [guests, partners, properties, payments, handovers, disputes] = await Promise.all([
    guestIds.length
      ? prisma.user.findMany({
          where: { id: { in: guestIds } },
          select: { id: true, email: true, firstName: true, lastName: true, role: true },
        })
      : [],
    partnerIds.length
      ? prisma.user.findMany({
          where: { id: { in: partnerIds } },
          select: { id: true, email: true, firstName: true, lastName: true, role: true },
        })
      : [],
    propertyIds.length
      ? prisma.home.findMany({
          where: { id: { in: propertyIds } },
          select: { id: true, title: true, approvedTitle: true, city: true, contentReviewStatus: true },
        })
      : [],
    paymentIds.length
      ? prisma.paymentRecord.findMany({
          where: { id: { in: paymentIds } },
          select: { id: true, amount: true, currency: true, status: true, providerOrderId: true },
        })
      : [],
    handoverIds.length
      ? prisma.handoverTask.findMany({
          where: { id: { in: handoverIds } },
          select: { id: true, taskNumber: true, status: true, priority: true, title: true },
        })
      : [],
    records.length
      ? prisma.disputeCase.findMany({
          where: {
            OR: [
              { guestId: { in: guestIds } },
              { partnerId: { in: partnerIds } },
              { propertyId: { in: propertyIds } },
              { paymentRecordId: { in: paymentIds } },
            ],
          },
          select: {
            id: true,
            caseNumber: true,
            status: true,
            priority: true,
            title: true,
            guestId: true,
            partnerId: true,
            propertyId: true,
            paymentRecordId: true,
          },
        })
      : [],
  ]);

  return {
    records,
    guestsById: new Map(guests.map((item) => [item.id, item])),
    partnersById: new Map(partners.map((item) => [item.id, item])),
    propertiesById: new Map(properties.map((item) => [item.id, item])),
    paymentsById: new Map(payments.map((item) => [item.id, item])),
    handoversById: new Map(handovers.map((item) => [item.id, item])),
    disputes,
    countByStatus: countsByStatus.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = item._count._all;
      return acc;
    }, {}),
    countByCategory: countsByCategory.reduce<Record<string, number>>((acc, item) => {
      acc[item.category] = item._count._all;
      return acc;
    }, {}),
  };
}
