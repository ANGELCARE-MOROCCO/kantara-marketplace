import "server-only";

import prisma from "./db";

export type UnifiedTimelineItem = {
  id: string;
  module: string;
  type: string;
  summary: string;
  actorId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  createdAt: Date;
  href?: string;
};

export type HandoverTimelineInput = {
  taskId: string;
  reservationId?: string | null;
  paymentIds?: string[];
  disputeIds?: string[];
};

export type DisputeTimelineInput = {
  disputeId: string;
  reservationId?: string | null;
  paymentIds?: string[];
  handoverIds?: string[];
  verificationIds?: string[];
};

export async function getUnifiedOperationsTimeline(limit = 24): Promise<UnifiedTimelineItem[]> {
  const [adminEvents, listingEvents, paymentEvents, disputeEvents, verificationEvents, premiumEvents, handoverEvents] =
    await Promise.all([
      prisma.adminAuditEvent.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      prisma.listingAuditEvent.findMany({
        orderBy: { createdAt: "desc" },
        take: Math.ceil(limit / 2),
      }),
      prisma.paymentEvent.findMany({
        orderBy: { createdAt: "desc" },
        take: Math.ceil(limit / 2),
      }),
      prisma.disputeEvent.findMany({
        orderBy: { createdAt: "desc" },
        take: Math.ceil(limit / 2),
      }),
      prisma.verificationEvent.findMany({
        orderBy: { createdAt: "desc" },
        take: Math.ceil(limit / 2),
      }),
      prisma.premiumGuestEvent.findMany({
        orderBy: { createdAt: "desc" },
        take: Math.ceil(limit / 2),
      }),
      prisma.handoverEvent.findMany({
        orderBy: { createdAt: "desc" },
        take: Math.ceil(limit / 2),
      }),
    ]);

  const items: UnifiedTimelineItem[] = [
    ...adminEvents.map((event) => ({
      id: event.id,
      module: event.module,
      type: event.action,
      summary: event.summary,
      actorId: event.actorId,
      targetType: event.targetType,
      targetId: event.targetId,
      createdAt: event.createdAt,
      href: hrefForTarget(event.targetType, event.targetId),
    })),
    ...listingEvents.map((event) => ({
      id: event.id,
      module: "property_trust",
      type: event.eventType,
      summary: event.message ?? "Listing event",
      actorId: event.actorId,
      targetType: "Home",
      targetId: event.homeId,
      createdAt: event.createdAt,
      href: event.homeId ? `/admin/property-trust?homeId=${event.homeId}` : "/admin/property-trust",
    })),
    ...paymentEvents.map((event) => ({
      id: event.id,
      module: "payments",
      type: event.type,
      summary: event.summary,
      actorId: event.createdById,
      targetType: "PaymentRecord",
      targetId: event.paymentRecordId,
      createdAt: event.createdAt,
      href: `/admin/payments?paymentId=${event.paymentRecordId}`,
    })),
    ...disputeEvents.map((event) => ({
      id: event.id,
      module: "disputes",
      type: event.type,
      summary: event.message,
      actorId: event.createdById,
      targetType: "DisputeCase",
      targetId: event.disputeCaseId,
      createdAt: event.createdAt,
      href: `/admin/disputes?disputeId=${event.disputeCaseId}`,
    })),
    ...verificationEvents.map((event) => ({
      id: event.id,
      module: "verifications",
      type: event.type,
      summary: event.message,
      actorId: event.createdById,
      targetType: "VerificationRecord",
      targetId: event.verificationRecordId,
      createdAt: event.createdAt,
      href: `/admin/verifications?verificationId=${event.verificationRecordId}`,
    })),
    ...premiumEvents.map((event) => ({
      id: event.id,
      module: "premium_guests",
      type: event.type,
      summary: event.message,
      actorId: event.createdById,
      targetType: "PremiumGuestProfile",
      targetId: event.premiumGuestProfileId,
      createdAt: event.createdAt,
      href: `/admin/premium-guests?profileId=${event.premiumGuestProfileId}`,
    })),
    ...handoverEvents.map((event) => ({
      id: event.id,
      module: "handover",
      type: event.type,
      summary: event.message,
      actorId: event.createdById,
      targetType: "HandoverTask",
      targetId: event.handoverTaskId,
      createdAt: event.createdAt,
      href: `/admin/handover?handoverId=${event.handoverTaskId}`,
    })),
  ];

  return items
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);
}

function hrefForTarget(targetType?: string | null, targetId?: string | null) {
  if (!targetType || !targetId) return undefined;
  if (targetType === "PaymentRecord") return `/admin/payments?paymentId=${targetId}`;
  if (targetType === "DisputeCase") return `/admin/disputes?disputeId=${targetId}`;
  if (targetType === "VerificationRecord") return `/admin/verifications?verificationId=${targetId}`;
  if (targetType === "PremiumGuestProfile") return `/admin/premium-guests?profileId=${targetId}`;
  if (targetType === "HandoverTask") return `/admin/handover?handoverId=${targetId}`;
  if (targetType === "Reservation") return `/admin/bookings?reservationId=${targetId}`;
  if (targetType === "Home") return `/admin/property-trust?homeId=${targetId}`;
  if (targetType === "PartnerApplication") return `/admin/partner-operations?applicationId=${targetId}`;
  return undefined;
}

export async function getHandoverTaskTimeline({
  taskId,
  reservationId,
  paymentIds = [],
  disputeIds = [],
}: HandoverTimelineInput): Promise<UnifiedTimelineItem[]> {
  const [handoverEvents, auditEvents, paymentEvents, disputeEvents] = await Promise.all([
    prisma.handoverEvent.findMany({
      where: { handoverTaskId: taskId },
      orderBy: { createdAt: "desc" },
      take: 80,
    }),
    prisma.adminAuditEvent.findMany({
      where: {
        OR: [
          { targetType: "HandoverTask", targetId: taskId },
          ...(reservationId ? [{ targetType: "Reservation", targetId: reservationId }] : []),
          ...(paymentIds.length ? [{ targetType: "PaymentRecord", targetId: { in: paymentIds } }] : []),
          ...(disputeIds.length ? [{ targetType: "DisputeCase", targetId: { in: disputeIds } }] : []),
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 120,
    }),
    paymentIds.length
      ? prisma.paymentEvent.findMany({
          where: { paymentRecordId: { in: paymentIds } },
          orderBy: { createdAt: "desc" },
          take: 80,
        })
      : [],
    disputeIds.length
      ? prisma.disputeEvent.findMany({
          where: { disputeCaseId: { in: disputeIds } },
          orderBy: { createdAt: "desc" },
          take: 80,
        })
      : [],
  ]);

  const items: UnifiedTimelineItem[] = [
    ...handoverEvents.map((event) => ({
      id: `handover-${event.id}`,
      module: "handover",
      type: event.type,
      summary: event.message,
      actorId: event.createdById,
      targetType: "HandoverTask",
      targetId: event.handoverTaskId,
      createdAt: event.createdAt,
      href: `/admin/handover?handoverId=${event.handoverTaskId}`,
    })),
    ...auditEvents.map((event) => ({
      id: `audit-${event.id}`,
      module: event.module,
      type: event.action,
      summary: event.summary,
      actorId: event.actorId,
      targetType: event.targetType,
      targetId: event.targetId,
      createdAt: event.createdAt,
      href: hrefForTarget(event.targetType, event.targetId),
    })),
    ...paymentEvents.map((event) => ({
      id: `payment-${event.id}`,
      module: "payments",
      type: event.type,
      summary: event.summary,
      actorId: event.createdById,
      targetType: "PaymentRecord",
      targetId: event.paymentRecordId,
      createdAt: event.createdAt,
      href: `/admin/payments?paymentId=${event.paymentRecordId}`,
    })),
    ...disputeEvents.map((event) => ({
      id: `dispute-${event.id}`,
      module: "disputes",
      type: event.type,
      summary: event.message,
      actorId: event.createdById,
      targetType: "DisputeCase",
      targetId: event.disputeCaseId,
      createdAt: event.createdAt,
      href: `/admin/disputes?disputeId=${event.disputeCaseId}`,
    })),
  ];

  return items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 160);
}

export async function getDisputeCaseTimeline({
  disputeId,
  reservationId,
  paymentIds = [],
  handoverIds = [],
  verificationIds = [],
}: DisputeTimelineInput): Promise<UnifiedTimelineItem[]> {
  const [disputeEvents, auditEvents, paymentEvents, handoverEvents, verificationEvents] = await Promise.all([
    prisma.disputeEvent.findMany({
      where: { disputeCaseId: disputeId },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.adminAuditEvent.findMany({
      where: {
        OR: [
          { targetType: "DisputeCase", targetId: disputeId },
          ...(reservationId ? [{ targetType: "Reservation", targetId: reservationId }] : []),
          ...(paymentIds.length ? [{ targetType: "PaymentRecord", targetId: { in: paymentIds } }] : []),
          ...(handoverIds.length ? [{ targetType: "HandoverTask", targetId: { in: handoverIds } }] : []),
          ...(verificationIds.length ? [{ targetType: "VerificationRecord", targetId: { in: verificationIds } }] : []),
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 140,
    }),
    paymentIds.length
      ? prisma.paymentEvent.findMany({
          where: { paymentRecordId: { in: paymentIds } },
          orderBy: { createdAt: "desc" },
          take: 80,
        })
      : [],
    handoverIds.length
      ? prisma.handoverEvent.findMany({
          where: { handoverTaskId: { in: handoverIds } },
          orderBy: { createdAt: "desc" },
          take: 80,
        })
      : [],
    verificationIds.length
      ? prisma.verificationEvent.findMany({
          where: { verificationRecordId: { in: verificationIds } },
          orderBy: { createdAt: "desc" },
          take: 80,
        })
      : [],
  ]);

  const items: UnifiedTimelineItem[] = [
    ...disputeEvents.map((event) => ({
      id: `dispute-${event.id}`,
      module: "disputes",
      type: event.type,
      summary: event.message,
      actorId: event.createdById,
      targetType: "DisputeCase",
      targetId: event.disputeCaseId,
      createdAt: event.createdAt,
      href: `/admin/disputes?disputeId=${event.disputeCaseId}`,
    })),
    ...auditEvents.map((event) => ({
      id: `audit-${event.id}`,
      module: event.module,
      type: event.action,
      summary: event.summary,
      actorId: event.actorId,
      targetType: event.targetType,
      targetId: event.targetId,
      createdAt: event.createdAt,
      href: hrefForTarget(event.targetType, event.targetId),
    })),
    ...paymentEvents.map((event) => ({
      id: `payment-${event.id}`,
      module: "payments",
      type: event.type,
      summary: event.summary,
      actorId: event.createdById,
      targetType: "PaymentRecord",
      targetId: event.paymentRecordId,
      createdAt: event.createdAt,
      href: `/admin/payments?paymentId=${event.paymentRecordId}`,
    })),
    ...handoverEvents.map((event) => ({
      id: `handover-${event.id}`,
      module: "handover",
      type: event.type,
      summary: event.message,
      actorId: event.createdById,
      targetType: "HandoverTask",
      targetId: event.handoverTaskId,
      createdAt: event.createdAt,
      href: `/admin/handover?handoverId=${event.handoverTaskId}`,
    })),
    ...verificationEvents.map((event) => ({
      id: `verification-${event.id}`,
      module: "verifications",
      type: event.type,
      summary: event.message,
      actorId: event.createdById,
      targetType: "VerificationRecord",
      targetId: event.verificationRecordId,
      createdAt: event.createdAt,
      href: `/admin/verifications?verificationId=${event.verificationRecordId}`,
    })),
  ];

  return items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 180);
}
