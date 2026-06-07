import "server-only";

import type { CommandQueueItem, OperationsBlocker, OperationsSeverity } from "./operationsBlockers";

export function queueToBlockers(queue: CommandQueueItem[]): OperationsBlocker[] {
  const grouped = new Map<string, OperationsBlocker>();

  for (const item of queue) {
    const key = `${item.module}:${item.reason}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    grouped.set(key, {
      id: key,
      module: item.module,
      severity: item.severity,
      title: item.reason,
      description: `${item.entityLabel}: ${item.nextAction}`,
      count: 1,
      href: item.href,
      nextAction: item.nextAction,
    });
  }

  return Array.from(grouped.values());
}

export function disabledReasonForAction({
  requiresAdmin = true,
  exists = true,
  providerReady = true,
  allowed = true,
  reason,
}: {
  requiresAdmin?: boolean;
  exists?: boolean;
  providerReady?: boolean;
  allowed?: boolean;
  reason?: string | null;
}) {
  if (!requiresAdmin) return "Admin access is required.";
  if (!exists) return "The target record no longer exists.";
  if (!providerReady) return "Provider configuration is incomplete.";
  if (!allowed) return reason ?? "This action is not allowed in the current lifecycle state.";
  return null;
}

export function paymentRiskSeverity(status?: string | null, providerStatus?: string | null): OperationsSeverity {
  if (status === "failed" || status === "requires_review") return "high";
  if (providerStatus && !["COMPLETED", "APPROVED", "CREATED", "SAVED"].includes(providerStatus)) {
    return "medium";
  }
  return "low";
}

export function disputeSeverity(priority?: string | null, status?: string | null): OperationsSeverity {
  if (priority === "urgent") return "critical";
  if (priority === "high") return "high";
  if (status === "reopened") return "high";
  if (["open", "under_review", "awaiting_admin"].includes(status ?? "")) return "medium";
  return "low";
}

export function verificationSeverity(status?: string | null, ageDays = 0): OperationsSeverity {
  if (status === "rejected" || status === "expired") return "high";
  if (ageDays >= 7 && ["pending", "under_review", "needs_information"].includes(status ?? "")) return "high";
  if (["pending", "under_review", "needs_information"].includes(status ?? "")) return "medium";
  return "low";
}

export function readinessLabel(score: number | null) {
  if (score === null) return "Foundation";
  if (score >= 85) return "Operating";
  if (score >= 60) return "Watch";
  return "Blocked";
}
