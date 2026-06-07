import type { Prisma } from "@prisma/client";

export const DISPUTE_TYPES = [
  "booking_issue",
  "payment_issue",
  "property_issue",
  "guest_issue",
  "partner_issue",
  "handover_issue",
  "verification_issue",
  "other",
] as const;

export const DISPUTE_STATUSES = [
  "open",
  "under_review",
  "awaiting_guest",
  "awaiting_partner",
  "awaiting_admin",
  "resolved",
  "closed",
  "reopened",
] as const;

export const DISPUTE_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

export const DISPUTE_SOURCE_TYPES = [
  "reservation",
  "payment",
  "handover",
  "guest",
  "property",
  "partner",
  "verification",
  "manual_exception",
] as const;

export const DISPUTE_AGE_BUCKETS = [
  "lt_24h",
  "one_to_three_days",
  "four_to_seven_days",
  "over_seven_days",
  "over_fourteen_days",
] as const;

export type DisputeType = (typeof DISPUTE_TYPES)[number];
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];
export type DisputePriority = (typeof DISPUTE_PRIORITIES)[number];
export type DisputeSourceType = (typeof DISPUTE_SOURCE_TYPES)[number];
export type DisputeAgeBucket = (typeof DISPUTE_AGE_BUCKETS)[number];

export type DisputeSearchParams = {
  q?: string | string[];
  status?: string | string[];
  priority?: string | string[];
  type?: string | string[];
  owner?: string | string[];
  linkedSourceType?: string | string[];
  openedFrom?: string | string[];
  openedTo?: string | string[];
  ageBucket?: string | string[];
  awaitingExternal?: string | string[];
  paymentRelated?: string | string[];
  handoverRelated?: string | string[];
  unresolved?: string | string[];
  urgentHigh?: string | string[];
  missingLinkedSource?: string | string[];
  reopened?: string | string[];
  page?: string | string[];
  pageSize?: string | string[];
  disputeId?: string | string[];
  notice?: string | string[];
  error?: string | string[];
  sourceType?: string | string[];
  sourceSearch?: string | string[];
};

export type NormalizedDisputeFilters = {
  search: string | null;
  status: DisputeStatus | null;
  priority: DisputePriority | null;
  type: DisputeType | null;
  owner: string | null;
  linkedSourceType: DisputeSourceType | null;
  openedFrom: Date | null;
  openedTo: Date | null;
  ageBucket: DisputeAgeBucket | null;
  awaitingExternal: boolean;
  paymentRelated: boolean;
  handoverRelated: boolean;
  unresolved: boolean;
  urgentHigh: boolean;
  missingLinkedSource: boolean;
  reopened: boolean;
  page: number;
  pageSize: number;
  disputeId: string | null;
  notice: string | null;
  error: string | null;
  sourceType: DisputeSourceType | null;
  sourceSearch: string | null;
};

export function readDisputeParam(searchParams: DisputeSearchParams | undefined, key: keyof DisputeSearchParams) {
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

export function normalizeDisputeFilters(searchParams?: DisputeSearchParams): NormalizedDisputeFilters {
  return {
    search: readDisputeParam(searchParams, "q")?.trim() || null,
    status: parseEnum(readDisputeParam(searchParams, "status"), DISPUTE_STATUSES),
    priority: parseEnum(readDisputeParam(searchParams, "priority"), DISPUTE_PRIORITIES),
    type: parseEnum(readDisputeParam(searchParams, "type"), DISPUTE_TYPES),
    owner: readDisputeParam(searchParams, "owner")?.trim() || null,
    linkedSourceType: parseEnum(readDisputeParam(searchParams, "linkedSourceType"), DISPUTE_SOURCE_TYPES),
    openedFrom: parseDate(readDisputeParam(searchParams, "openedFrom")),
    openedTo: parseDate(readDisputeParam(searchParams, "openedTo")),
    ageBucket: parseEnum(readDisputeParam(searchParams, "ageBucket"), DISPUTE_AGE_BUCKETS),
    awaitingExternal: parseBoolean(readDisputeParam(searchParams, "awaitingExternal")),
    paymentRelated: parseBoolean(readDisputeParam(searchParams, "paymentRelated")),
    handoverRelated: parseBoolean(readDisputeParam(searchParams, "handoverRelated")),
    unresolved: parseBoolean(readDisputeParam(searchParams, "unresolved")),
    urgentHigh: parseBoolean(readDisputeParam(searchParams, "urgentHigh")),
    missingLinkedSource: parseBoolean(readDisputeParam(searchParams, "missingLinkedSource")),
    reopened: parseBoolean(readDisputeParam(searchParams, "reopened")),
    page: parsePage(readDisputeParam(searchParams, "page")),
    pageSize: parsePageSize(readDisputeParam(searchParams, "pageSize")),
    disputeId: readDisputeParam(searchParams, "disputeId") ?? null,
    notice: readDisputeParam(searchParams, "notice") ?? null,
    error: readDisputeParam(searchParams, "error") ?? null,
    sourceType: parseEnum(readDisputeParam(searchParams, "sourceType"), DISPUTE_SOURCE_TYPES),
    sourceSearch: readDisputeParam(searchParams, "sourceSearch")?.trim() || null,
  };
}

export function createDisputesHref(
  filters: NormalizedDisputeFilters,
  overrides: Partial<Record<keyof NormalizedDisputeFilters, string | number | boolean | Date | null>>
) {
  const params = new URLSearchParams();
  const values: Record<string, string | number | boolean | Date | null> = {
    q: filters.search,
    status: filters.status,
    priority: filters.priority,
    type: filters.type,
    owner: filters.owner,
    linkedSourceType: filters.linkedSourceType,
    openedFrom: filters.openedFrom,
    openedTo: filters.openedTo,
    ageBucket: filters.ageBucket,
    awaitingExternal: filters.awaitingExternal ? "1" : null,
    paymentRelated: filters.paymentRelated ? "1" : null,
    handoverRelated: filters.handoverRelated ? "1" : null,
    unresolved: filters.unresolved ? "1" : null,
    urgentHigh: filters.urgentHigh ? "1" : null,
    missingLinkedSource: filters.missingLinkedSource ? "1" : null,
    reopened: filters.reopened ? "1" : null,
    page: filters.page > 1 ? filters.page : null,
    pageSize: filters.pageSize === 25 ? null : filters.pageSize,
    disputeId: filters.disputeId,
    notice: filters.notice,
    error: filters.error,
    sourceType: filters.sourceType,
    sourceSearch: filters.sourceSearch,
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
  return `/admin/disputes${query ? `?${query}` : ""}`;
}

export function sourceTypeWhere(sourceType: DisputeSourceType | null): Prisma.DisputeCaseWhereInput {
  if (!sourceType) return {};
  if (sourceType === "reservation") return { reservationId: { not: null } };
  if (sourceType === "payment") return { OR: [{ paymentRecordId: { not: null } }, { type: "payment_issue" }] };
  if (sourceType === "handover") return { type: "handover_issue" };
  if (sourceType === "guest") return { guestId: { not: null } };
  if (sourceType === "property") return { propertyId: { not: null } };
  if (sourceType === "partner") return { partnerId: { not: null } };
  if (sourceType === "verification") return { type: "verification_issue" };
  if (sourceType === "manual_exception") {
    return {
      reservationId: null,
      paymentRecordId: null,
      propertyId: null,
      guestId: null,
      partnerId: null,
    };
  }
  return {};
}

export function ageBucketWhere(ageBucket: DisputeAgeBucket | null, now: Date): Prisma.DisputeCaseWhereInput {
  if (!ageBucket) return {};
  const oneDay = 24 * 60 * 60 * 1000;
  const ago = (days: number) => new Date(now.getTime() - days * oneDay);
  if (ageBucket === "lt_24h") return { openedAt: { gte: ago(1) } };
  if (ageBucket === "one_to_three_days") return { openedAt: { lt: ago(1), gte: ago(3) } };
  if (ageBucket === "four_to_seven_days") return { openedAt: { lt: ago(3), gte: ago(7) } };
  if (ageBucket === "over_seven_days") return { openedAt: { lt: ago(7) } };
  if (ageBucket === "over_fourteen_days") return { openedAt: { lt: ago(14) } };
  return {};
}

export function baseDisputeWhereFromFilters(filters: NormalizedDisputeFilters, now: Date): Prisma.DisputeCaseWhereInput {
  const and: Prisma.DisputeCaseWhereInput[] = [];

  if (filters.status) and.push({ status: filters.status });
  if (filters.priority) and.push({ priority: filters.priority });
  if (filters.type) and.push({ type: filters.type });
  if (filters.owner) and.push({ assignedToId: filters.owner === "unassigned" ? null : filters.owner });
  if (filters.openedFrom || filters.openedTo) {
    and.push({
      openedAt: {
        ...(filters.openedFrom ? { gte: filters.openedFrom } : {}),
        ...(filters.openedTo ? { lte: filters.openedTo } : {}),
      },
    });
  }
  if (filters.awaitingExternal) and.push({ status: { in: ["awaiting_guest", "awaiting_partner"] } });
  if (filters.unresolved) and.push({ status: { notIn: ["resolved", "closed"] } });
  if (filters.urgentHigh) and.push({ priority: { in: ["urgent", "high"] } });
  if (filters.missingLinkedSource) and.push(sourceTypeWhere("manual_exception"));
  if (filters.reopened) and.push({ status: "reopened" });
  if (filters.paymentRelated) and.push(sourceTypeWhere("payment"));
  if (filters.handoverRelated) and.push(sourceTypeWhere("handover"));
  and.push(sourceTypeWhere(filters.linkedSourceType));
  and.push(ageBucketWhere(filters.ageBucket, now));

  const clean = and.filter((item) => Object.keys(item).length > 0);
  return clean.length ? { AND: clean } : {};
}
