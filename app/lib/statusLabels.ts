export type StatusTranslate = (
  namespace: string,
  key: string,
  fallback: string
) => string;

export const STATUS_LABELS = [
  { value: "draft", key: "draft", baseText: "Draft" },
  { value: "submitted", key: "submitted", baseText: "Submitted" },
  { value: "pending_review", key: "pendingReview", baseText: "Pending review" },
  { value: "under_review", key: "underReview", baseText: "Under review" },
  { value: "needs_changes", key: "needsChanges", baseText: "Needs changes" },
  {
    value: "needs_information",
    key: "needsInformation",
    baseText: "Needs information",
  },
  { value: "approved", key: "approved", baseText: "Approved" },
  { value: "rejected", key: "rejected", baseText: "Rejected" },
  { value: "suspended", key: "suspended", baseText: "Suspended" },
  { value: "archived", key: "archived", baseText: "Archived" },
  { value: "public_live", key: "publicLive", baseText: "Public live" },
  { value: "missing", key: "missing", baseText: "Missing" },
  { value: "open", key: "open", baseText: "Open" },
  { value: "complete", key: "complete", baseText: "Complete" },
  { value: "requested", key: "requested", baseText: "Requested" },
  { value: "reserved", key: "reserved", baseText: "Reserved" },
  { value: "confirmed", key: "confirmed", baseText: "Confirmed" },
  { value: "cancelled", key: "cancelled", baseText: "Cancelled" },
  { value: "active", key: "active", baseText: "Active" },
  { value: "pending", key: "pending", baseText: "Pending" },
  { value: "queued", key: "queued", baseText: "Queued" },
  { value: "human_reviewed", key: "humanReviewed", baseText: "Human reviewed" },
  {
    value: "machine_translated",
    key: "machineTranslated",
    baseText: "Machine translated",
  },
  { value: "stale", key: "stale", baseText: "Stale" },
  { value: "failed", key: "failed", baseText: "Failed" },
] as const;

type StatusLabelRecord = (typeof STATUS_LABELS)[number];

const statusLabelByValue: Map<string, StatusLabelRecord> = new Map(
  STATUS_LABELS.map((status) => [status.value, status])
);

function fallbackStatusLabel(value?: string | null) {
  if (!value) return "Unknown";

  return value
    .split("_")
    .filter(Boolean)
    .map((part, index) =>
      index === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part
    )
    .join(" ");
}

function toCamelStatusKey(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part, index) =>
      index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)
    )
    .join("");
}

export function getStatusLabel(value?: string | null, t?: StatusTranslate) {
  const status = statusLabelByValue.get(value ?? "");
  const key = status?.key ?? toCamelStatusKey(value ?? "unknown");
  const fallback = status?.baseText ?? fallbackStatusLabel(value);

  return t ? t("status", key, fallback) : fallback;
}

export function getStatusTranslationKey(value: string) {
  return statusLabelByValue.get(value)?.key ?? toCamelStatusKey(value);
}
