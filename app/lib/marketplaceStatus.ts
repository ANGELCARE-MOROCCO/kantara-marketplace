import "server-only";

export type StatusTone = "success" | "info" | "warning" | "danger" | "neutral";

const labelOverrides: Record<string, string> = {
  not_configured: "Not configured",
  sandbox_ready: "Sandbox ready",
  live_ready: "Live ready",
  missing_client_id: "Missing client ID",
  missing_secret: "Missing secret",
  webhook_unverified: "Webhook unverified",
  card_fields_unavailable: "Card fields unavailable",
  operational: "Operational",
  pending_approval: "Pending approval",
  order_created: "Order created",
  requires_review: "Requires review",
  under_review: "Under review",
  needs_information: "Needs information",
  awaiting_guest: "Awaiting guest",
  awaiting_partner: "Awaiting partner",
  awaiting_admin: "Awaiting admin",
  premium_ready: "Premium ready",
  issue_reported: "Issue reported",
  pending_preparation: "Pending preparation",
  not_scheduled: "Not scheduled",
  host_verified: "Host verified",
  guest_basic: "Guest",
  host_pending: "Host pending",
};

const successStatuses = new Set([
  "approved",
  "verified",
  "premium_ready",
  "captured",
  "authorized",
  "completed",
  "resolved",
  "closed",
  "ready",
  "operational",
  "sandbox_ready",
  "live_ready",
  "host_verified",
  "success",
]);

const infoStatuses = new Set([
  "submitted",
  "pending",
  "pending_review",
  "under_review",
  "order_created",
  "pending_approval",
  "open",
  "in_progress",
  "candidate",
  "draft",
  "requested",
  "reserved",
  "confirmed",
]);

const warningStatuses = new Set([
  "needs_information",
  "awaiting_guest",
  "awaiting_partner",
  "awaiting_admin",
  "requires_review",
  "not_scheduled",
  "pending_preparation",
  "webhook_unverified",
  "card_fields_unavailable",
  "partially_refunded",
  "medium",
  "high",
  "stale",
]);

const dangerStatuses = new Set([
  "rejected",
  "suspended",
  "cancelled",
  "failed",
  "urgent",
  "issue_reported",
  "missing_client_id",
  "missing_secret",
  "not_configured",
  "refunded",
  "expired",
  "blocked",
]);

export function getStatusText(status?: string | null) {
  if (!status) return "No status";
  return (
    labelOverrides[status] ??
    status
      .split("_")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}

export function getStatusTone(status?: string | null): StatusTone {
  const normalized = status ?? "";
  if (successStatuses.has(normalized)) return "success";
  if (infoStatuses.has(normalized)) return "info";
  if (warningStatuses.has(normalized)) return "warning";
  if (dangerStatuses.has(normalized)) return "danger";
  return "neutral";
}

export function formatDate(value?: Date | string | number | null, fallback = "Not set") {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(
  value?: Date | string | number | null,
  fallback = "Not recorded"
) {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatNumber(value?: number | null) {
  return new Intl.NumberFormat("en-US").format(value ?? 0);
}

export function formatCurrencyAmount(amount: number | string, currency: string) {
  const numeric = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(numeric)) return `${currency} ${String(amount)}`;

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: currency === "JPY" ? 0 : 2,
    }).format(numeric);
  } catch {
    return `${currency} ${numeric.toFixed(2)}`;
  }
}

export function percent(value: number) {
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

export function includesQuery(values: (string | null | undefined)[], query?: string | null) {
  const normalized = query?.trim().toLowerCase();
  if (!normalized) return true;

  return values.some((value) => value?.toLowerCase().includes(normalized));
}
