import "server-only";

export type OperationsSeverity = "critical" | "high" | "medium" | "low" | "info";

export type CommandQueueItem = {
  id: string;
  module: string;
  severity: OperationsSeverity;
  entityType: string;
  entityId?: string | null;
  entityLabel: string;
  reason: string;
  nextAction: string;
  href: string;
  createdAt?: Date | null;
  ageLabel?: string | null;
};

export type OperationsBlocker = {
  id: string;
  module: string;
  severity: OperationsSeverity;
  title: string;
  description: string;
  count: number;
  href: string;
  nextAction: string;
};

export type HealthMatrixArea = {
  id: string;
  label: string;
  score: number | null;
  status: string;
  detail: string;
  href: string;
  blockers: number;
};

export type ModuleCommandSummary = {
  id: string;
  title: string;
  href: string;
  count: number | null;
  openWork: number;
  severity: OperationsSeverity;
  status: string;
  lastActivity?: Date | null;
  nextAction: string;
  providerState?: string | null;
};

const severityRank: Record<OperationsSeverity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

export function sortCommandQueue(items: CommandQueueItem[]) {
  return [...items].sort((a, b) => {
    const severityDelta = severityRank[b.severity] - severityRank[a.severity];
    if (severityDelta !== 0) return severityDelta;
    return (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0);
  });
}

export function highestSeverity(items: { severity: OperationsSeverity }[]): OperationsSeverity {
  return items.reduce<OperationsSeverity>((highest, item) => {
    return severityRank[item.severity] > severityRank[highest] ? item.severity : highest;
  }, "info");
}

export function formatAge(date?: Date | null, now = new Date()) {
  if (!date) return null;
  const ms = Math.max(0, now.getTime() - date.getTime());
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days >= 1) return `${days}d old`;
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours >= 1) return `${hours}h old`;
  return "new";
}

export function scoreFromSignals({
  positive,
  warning,
  critical,
  foundation = false,
}: {
  positive: number;
  warning: number;
  critical: number;
  foundation?: boolean;
}) {
  if (foundation && positive === 0 && warning === 0 && critical === 0) return null;
  const raw = 100 - warning * 12 - critical * 25;
  return Math.max(15, Math.min(100, positive > 0 ? raw : raw - 25));
}
