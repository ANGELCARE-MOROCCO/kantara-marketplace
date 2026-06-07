import type { Prisma } from "@prisma/client";

export const HANDOVER_TYPES = [
  "check_in",
  "check_out",
  "cleaning",
  "maintenance",
  "key_handover",
  "guest_support",
  "issue_followup",
] as const;

export const HANDOVER_STATUSES = [
  "not_scheduled",
  "pending_preparation",
  "ready",
  "in_progress",
  "completed",
  "issue_reported",
  "cancelled",
] as const;

export const HANDOVER_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

export const HANDOVER_LIFECYCLE_SEGMENTS = [
  {
    id: "all",
    label: "All operations",
    description: "Every handover task matching the active filters.",
  },
  {
    id: "pre_arrival",
    label: "Pre-arrival",
    description: "Preparation work before a guest reaches the property.",
  },
  {
    id: "check_in",
    label: "Check-in",
    description: "Arrival readiness, check-in, and access coordination records.",
  },
  {
    id: "in_stay_support",
    label: "In-stay support",
    description: "Open guest support work during the stay window.",
  },
  {
    id: "cleaning_turnover",
    label: "Cleaning / turnover",
    description: "Cleaning and reset tasks tied to checkout or room turnover.",
  },
  {
    id: "maintenance",
    label: "Maintenance",
    description: "Maintenance follow-up and repair coordination.",
  },
  {
    id: "checkout",
    label: "Checkout",
    description: "Departure preparation and property return controls.",
  },
  {
    id: "post_checkout",
    label: "Post-checkout",
    description: "Inspection, evidence, cleaning closure, and follow-up work.",
  },
  {
    id: "issue_followup",
    label: "Issue follow-up",
    description: "Reported issues, open disputes, and escalation workflow.",
  },
] as const;

export type HandoverType = (typeof HANDOVER_TYPES)[number];
export type HandoverStatus = (typeof HANDOVER_STATUSES)[number];
export type HandoverPriority = (typeof HANDOVER_PRIORITIES)[number];
export type HandoverLifecycleSegment = (typeof HANDOVER_LIFECYCLE_SEGMENTS)[number]["id"];

export type HandoverSearchParams = {
  q?: string | string[];
  status?: string | string[];
  type?: string | string[];
  priority?: string | string[];
  segment?: string | string[];
  scheduledFrom?: string | string[];
  scheduledTo?: string | string[];
  city?: string | string[];
  propertyId?: string | string[];
  assignedToId?: string | string[];
  issueOnly?: string | string[];
  missingReservation?: string | string[];
  upcomingArrivals?: string | string[];
  upcomingCheckouts?: string | string[];
  paymentNotReady?: string | string[];
  disputeOpen?: string | string[];
  page?: string | string[];
  pageSize?: string | string[];
  handoverId?: string | string[];
  taskId?: string | string[];
  notice?: string | string[];
  error?: string | string[];
};

export type NormalizedHandoverFilters = {
  search: string | null;
  status: HandoverStatus | null;
  type: HandoverType | null;
  priority: HandoverPriority | null;
  segment: HandoverLifecycleSegment;
  scheduledFrom: Date | null;
  scheduledTo: Date | null;
  city: string | null;
  propertyId: string | null;
  assignedToId: string | null;
  issueOnly: boolean;
  missingReservation: boolean;
  upcomingArrivals: boolean;
  upcomingCheckouts: boolean;
  paymentNotReady: boolean;
  disputeOpen: boolean;
  page: number;
  pageSize: number;
  handoverId: string | null;
  notice: string | null;
  error: string | null;
};

export function readHandoverParam(searchParams: HandoverSearchParams | undefined, key: keyof HandoverSearchParams) {
  const value = searchParams?.[key];
  return Array.isArray(value) ? value[0] : value;
}

function parseBoolean(value?: string | null) {
  return value === "1" || value === "true" || value === "on" || value === "yes";
}

function parsePage(value?: string | null) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 500) : 1;
}

function parsePageSize(value?: string | null) {
  const parsed = Number(value);
  return [10, 25, 50, 100].includes(parsed) ? parsed : 25;
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseEnum<T extends readonly string[]>(value: string | null | undefined, allowed: T): T[number] | null {
  return value && allowed.includes(value) ? value : null;
}

export function normalizeHandoverFilters(searchParams?: HandoverSearchParams): NormalizedHandoverFilters {
  const handoverId =
    readHandoverParam(searchParams, "handoverId") ??
    readHandoverParam(searchParams, "taskId") ??
    null;

  return {
    search: readHandoverParam(searchParams, "q")?.trim() || null,
    status: parseEnum(readHandoverParam(searchParams, "status"), HANDOVER_STATUSES),
    type: parseEnum(readHandoverParam(searchParams, "type"), HANDOVER_TYPES),
    priority: parseEnum(readHandoverParam(searchParams, "priority"), HANDOVER_PRIORITIES),
    segment: parseEnum(readHandoverParam(searchParams, "segment"), HANDOVER_LIFECYCLE_SEGMENTS.map((segment) => segment.id)) ?? "all",
    scheduledFrom: parseDate(readHandoverParam(searchParams, "scheduledFrom")),
    scheduledTo: parseDate(readHandoverParam(searchParams, "scheduledTo")),
    city: readHandoverParam(searchParams, "city")?.trim() || null,
    propertyId: readHandoverParam(searchParams, "propertyId")?.trim() || null,
    assignedToId: readHandoverParam(searchParams, "assignedToId")?.trim() || null,
    issueOnly: parseBoolean(readHandoverParam(searchParams, "issueOnly")),
    missingReservation: parseBoolean(readHandoverParam(searchParams, "missingReservation")),
    upcomingArrivals: parseBoolean(readHandoverParam(searchParams, "upcomingArrivals")),
    upcomingCheckouts: parseBoolean(readHandoverParam(searchParams, "upcomingCheckouts")),
    paymentNotReady: parseBoolean(readHandoverParam(searchParams, "paymentNotReady")),
    disputeOpen: parseBoolean(readHandoverParam(searchParams, "disputeOpen")),
    page: parsePage(readHandoverParam(searchParams, "page")),
    pageSize: parsePageSize(readHandoverParam(searchParams, "pageSize")),
    handoverId,
    notice: readHandoverParam(searchParams, "notice") ?? null,
    error: readHandoverParam(searchParams, "error") ?? null,
  };
}

export function createHandoverHref(
  filters: NormalizedHandoverFilters,
  overrides: Partial<Record<keyof NormalizedHandoverFilters, string | number | boolean | Date | null>>
) {
  const params = new URLSearchParams();
  const values: Record<string, string | number | boolean | Date | null> = {
    q: filters.search,
    status: filters.status,
    type: filters.type,
    priority: filters.priority,
    segment: filters.segment === "all" ? null : filters.segment,
    scheduledFrom: filters.scheduledFrom,
    scheduledTo: filters.scheduledTo,
    city: filters.city,
    propertyId: filters.propertyId,
    assignedToId: filters.assignedToId,
    issueOnly: filters.issueOnly ? "1" : null,
    missingReservation: filters.missingReservation ? "1" : null,
    upcomingArrivals: filters.upcomingArrivals ? "1" : null,
    upcomingCheckouts: filters.upcomingCheckouts ? "1" : null,
    paymentNotReady: filters.paymentNotReady ? "1" : null,
    disputeOpen: filters.disputeOpen ? "1" : null,
    page: filters.page > 1 ? filters.page : null,
    pageSize: filters.pageSize === 25 ? null : filters.pageSize,
    handoverId: filters.handoverId,
    notice: filters.notice,
    error: filters.error,
    ...overrides,
  };

  Object.entries(values).forEach(([key, value]) => {
    if (value === null || value === undefined || value === false || value === "") return;
    if (value instanceof Date) {
      params.set(key, value.toISOString().slice(0, 10));
      return;
    }
    params.set(key, String(value));
  });

  const query = params.toString();
  return `/admin/handover${query ? `?${query}` : ""}`;
}

export function segmentWhere(segment: HandoverLifecycleSegment, now: Date): Prisma.HandoverTaskWhereInput {
  if (segment === "pre_arrival") {
    return {
      type: { in: ["check_in", "key_handover"] },
      status: { in: ["not_scheduled", "pending_preparation", "ready"] },
    };
  }
  if (segment === "check_in") return { type: { in: ["check_in", "key_handover"] } };
  if (segment === "in_stay_support") return { type: "guest_support", status: { notIn: ["completed", "cancelled"] } };
  if (segment === "cleaning_turnover") return { type: "cleaning" };
  if (segment === "maintenance") return { type: "maintenance" };
  if (segment === "checkout") return { type: "check_out" };
  if (segment === "post_checkout") {
    return {
      OR: [
        { type: { in: ["cleaning", "maintenance", "issue_followup"] } },
        { scheduledFor: { lt: now }, status: { in: ["pending_preparation", "ready", "in_progress", "issue_reported"] } },
      ],
    };
  }
  if (segment === "issue_followup") return { OR: [{ type: "issue_followup" }, { status: "issue_reported" }] };
  return {};
}

export function baseHandoverWhereFromFilters(filters: NormalizedHandoverFilters, now: Date): Prisma.HandoverTaskWhereInput {
  const and: Prisma.HandoverTaskWhereInput[] = [segmentWhere(filters.segment, now)];

  if (filters.status) and.push({ status: filters.status });
  if (filters.type) and.push({ type: filters.type });
  if (filters.priority) and.push({ priority: filters.priority });
  if (filters.propertyId) and.push({ propertyId: filters.propertyId });
  if (filters.assignedToId) and.push({ assignedToId: filters.assignedToId });
  if (filters.issueOnly) and.push({ status: "issue_reported" });
  if (filters.missingReservation) and.push({ reservationId: null });

  if (filters.scheduledFrom || filters.scheduledTo) {
    and.push({
      scheduledFor: {
        ...(filters.scheduledFrom ? { gte: filters.scheduledFrom } : {}),
        ...(filters.scheduledTo ? { lte: filters.scheduledTo } : {}),
      },
    });
  }

  if (filters.upcomingArrivals) and.push({ type: { in: ["check_in", "key_handover"] } });
  if (filters.upcomingCheckouts) and.push({ type: { in: ["check_out", "cleaning"] } });

  return and.filter((item) => Object.keys(item).length > 0).length
    ? { AND: and.filter((item) => Object.keys(item).length > 0) }
    : {};
}
