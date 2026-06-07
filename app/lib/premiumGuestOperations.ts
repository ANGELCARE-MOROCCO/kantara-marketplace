import "server-only";

import { unstable_noStore as noStore } from "next/cache";
import prisma from "./db";

export const PREMIUM_GUEST_STATUSES = [
  "candidate",
  "under_review",
  "verified",
  "premium_ready",
  "suspended",
  "rejected",
] as const;

export const PREMIUM_GUEST_RISK_LEVELS = ["low", "medium", "high"] as const;

export type PremiumGuestFilters = {
  q?: string | null;
  status?: string | null;
  riskLevel?: string | null;
};

export async function getPremiumGuestOperationsData(filters: PremiumGuestFilters = {}) {
  noStore();

  const profiles = await prisma.premiumGuestProfile.findMany({
    where: {
      ...(filters.status && PREMIUM_GUEST_STATUSES.includes(filters.status as any)
        ? { status: filters.status }
        : {}),
      ...(filters.riskLevel && PREMIUM_GUEST_RISK_LEVELS.includes(filters.riskLevel as any)
        ? { riskLevel: filters.riskLevel }
        : {}),
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    take: 100,
    include: { events: { orderBy: { createdAt: "desc" }, take: 12 } },
  });
  const profileUserIds = profiles.map((profile) => profile.userId);
  const q = filters.q?.trim();
  const candidateWhere = q
    ? {
        OR: [
          { email: { contains: q, mode: "insensitive" as const } },
          { firstName: { contains: q, mode: "insensitive" as const } },
          { lastName: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};
  const [candidateUsers, users, countsByStatus, disputes, verifications, reservations, payments] = await Promise.all([
    prisma.user.findMany({
      where: {
        role: { notIn: ["admin", "super_admin"] },
        ...(profileUserIds.length ? { id: { notIn: profileUserIds } } : {}),
        ...candidateWhere,
      },
      orderBy: { email: "asc" },
      take: 80,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        _count: { select: { Reservation: true, Favorite: true } },
      },
    }),
    profileUserIds.length
      ? prisma.user.findMany({
          where: { id: { in: profileUserIds } },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            _count: { select: { Reservation: true, Favorite: true } },
          },
        })
      : [],
    prisma.premiumGuestProfile.groupBy({ by: ["status"], _count: { _all: true } }),
    profileUserIds.length
      ? prisma.disputeCase.groupBy({
          by: ["guestId"],
          where: { guestId: { in: profileUserIds } },
          _count: { _all: true },
        })
      : [],
    profileUserIds.length
      ? prisma.verificationRecord.findMany({
          where: { entityType: "guest", entityId: { in: profileUserIds } },
          orderBy: { updatedAt: "desc" },
          select: { id: true, entityId: true, status: true, category: true, title: true },
        })
      : [],
    profileUserIds.length
      ? prisma.reservation.findMany({
          where: { userId: { in: profileUserIds } },
          orderBy: { createdAt: "desc" },
          take: 160,
          select: {
            id: true,
            userId: true,
            bookingStatus: true,
            startDate: true,
            endDate: true,
            listingTitleSnapshot: true,
            totalSnapshot: true,
            currencySnapshot: true,
          },
        })
      : [],
    profileUserIds.length
      ? prisma.paymentRecord.findMany({
          where: { guestId: { in: profileUserIds } },
          orderBy: { createdAt: "desc" },
          take: 160,
          select: {
            id: true,
            guestId: true,
            status: true,
            method: true,
            amount: true,
            currency: true,
            providerOrderId: true,
          },
        })
      : [],
  ]);

  const userById = new Map(users.map((user) => [user.id, user]));
  const disputeCountByGuestId = new Map(disputes.map((item) => [item.guestId ?? "", item._count._all]));
  const verificationByGuestId = verifications.reduce<Map<string, typeof verifications>>((acc, item) => {
    const list = acc.get(item.entityId) ?? [];
    list.push(item);
    acc.set(item.entityId, list);
    return acc;
  }, new Map());
  const reservationsByGuestId = reservations.reduce<Map<string, typeof reservations>>((acc, item) => {
    const list = acc.get(item.userId ?? "") ?? [];
    if (item.userId) {
      list.push(item);
      acc.set(item.userId, list);
    }
    return acc;
  }, new Map());
  const paymentsByGuestId = payments.reduce<Map<string, typeof payments>>((acc, item) => {
    const list = acc.get(item.guestId ?? "") ?? [];
    if (item.guestId) {
      list.push(item);
      acc.set(item.guestId, list);
    }
    return acc;
  }, new Map());

  return {
    profiles,
    candidateUsers,
    userById,
    disputeCountByGuestId,
    verificationByGuestId,
    reservationsByGuestId,
    paymentsByGuestId,
    countByStatus: countsByStatus.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = item._count._all;
      return acc;
    }, {}),
  };
}

export function calculatePremiumEligibilityScore({
  reservationCount,
  favoriteCount,
  verificationStatus,
  disputeCount,
  riskLevel,
}: {
  reservationCount: number;
  favoriteCount: number;
  verificationStatus?: string | null;
  disputeCount: number;
  riskLevel: string;
}) {
  let score = 25;
  score += Math.min(25, reservationCount * 10);
  score += Math.min(10, favoriteCount * 2);
  if (verificationStatus === "verified") score += 25;
  if (verificationStatus === "under_review") score += 10;
  if (disputeCount === 0) score += 10;
  if (riskLevel === "medium") score -= 15;
  if (riskLevel === "high") score -= 35;
  return Math.max(0, Math.min(100, score));
}
