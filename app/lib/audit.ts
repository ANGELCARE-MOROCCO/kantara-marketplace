import "server-only";

import type { Prisma } from "@prisma/client";
import prisma from "./db";

type PrismaExecutor = typeof prisma | Prisma.TransactionClient;

export async function writeAdminAuditEvent({
  tx,
  actorId,
  module,
  action,
  targetType,
  targetId,
  summary,
  metadata,
}: {
  tx?: PrismaExecutor;
  actorId?: string | null;
  module: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  summary: string;
  metadata?: Prisma.InputJsonValue | null;
}) {
  const client = tx ?? prisma;

  await client.adminAuditEvent.create({
    data: {
      actorId: actorId ?? null,
      module,
      action,
      targetType: targetType ?? null,
      targetId: targetId ?? null,
      summary,
      metadata: metadata ?? undefined,
    },
  });
}

export async function getRecentAdminAuditEvents(limit = 12) {
  return prisma.adminAuditEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
