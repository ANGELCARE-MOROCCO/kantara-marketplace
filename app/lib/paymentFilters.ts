import type { Prisma } from "@prisma/client";

export const PAYMENT_PAGE_SIZES = [25, 50, 100] as const;

export const PAYMENT_OPERATIONAL_SEGMENTS = [
  { id: "all", label: "All", description: "Every payment record matching the current filters." },
  { id: "draft", label: "Draft", description: "Internal draft payment records without a provider order." },
  { id: "order_created", label: "Order created", description: "PayPal orders created and waiting for approval or capture." },
  { id: "pending_approval", label: "Pending approval", description: "Payments waiting for guest approval or provider completion." },
  { id: "authorized", label: "Authorized", description: "Authorized payments not yet captured." },
  { id: "captured", label: "Captured", description: "Captured or settled payment records." },
  { id: "failed", label: "Failed", description: "Failed provider or internal payment records." },
  { id: "requires_review", label: "Requires review", description: "Payments held for manual operations review." },
  { id: "cancelled", label: "Cancelled", description: "Payment records cancelled internally or by provider state." },
  { id: "refunded", label: "Refunded / partially refunded", description: "Refunded and partially refunded payment records." },
  { id: "manual_settlements", label: "Manual settlements", description: "Internal settlement records that do not pretend to be PayPal captures." },
  { id: "provider_unsynced", label: "Provider unsynced", description: "PayPal records needing a provider status refresh." },
  { id: "linked_reservation", label: "Linked to reservation", description: "Payment records connected to a reservation." },
  { id: "missing_reservation", label: "Missing reservation link", description: "Payment records without a linked reservation." },
] as const;

export type PaymentOperationalSegment = (typeof PAYMENT_OPERATIONAL_SEGMENTS)[number]["id"];

export type PaymentSearchParams = {
  q?: string | string[];
  search?: string | string[];
  segment?: string | string[];
  status?: string | string[];
  providerStatus?: string | string[];
  method?: string | string[];
  providerEnvironment?: string | string[];
  currency?: string | string[];
  amountMin?: string | string[];
  amountMax?: string | string[];
  createdFrom?: string | string[];
  createdTo?: string | string[];
  requiresReviewOnly?: string | string[];
  missingReservationLinkOnly?: string | string[];
  disputeStatus?: string | string[];
  page?: string | string[];
  pageSize?: string | string[];
  paymentId?: string | string[];
  terminalSearch?: string | string[];
  terminalReservationId?: string | string[];
  settlementSearch?: string | string[];
  settlementReservationId?: string | string[];
  notice?: string | string[];
  error?: string | string[];
};

export type NormalizedPaymentFilters = {
  search: string | null;
  segment: PaymentOperationalSegment;
  status: string | null;
  providerStatus: string | null;
  method: string | null;
  providerEnvironment: string | null;
  currency: string | null;
  amountMin: number | null;
  amountMax: number | null;
  createdFrom: Date | null;
  createdTo: Date | null;
  requiresReviewOnly: boolean;
  missingReservationLinkOnly: boolean;
  disputeStatus: string | null;
  page: number;
  pageSize: number;
  paymentId: string | null;
};

const SEGMENT_IDS = new Set<string>(PAYMENT_OPERATIONAL_SEGMENTS.map((segment) => segment.id));
const PAYMENT_ENVIRONMENTS = new Set(["sandbox", "live", "internal"]);

export function readPaymentParam(
  searchParams: PaymentSearchParams | undefined,
  key: keyof PaymentSearchParams
) {
  const value = searchParams?.[key];
  return Array.isArray(value) ? value[0] : value;
}

function cleanString(value?: string | null, maxLength = 160) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function parsePositiveNumber(value?: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseDate(value?: string | null, endOfDay = false) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  }
  return date;
}

function parseBoolean(value?: string | null) {
  return value === "1" || value === "true" || value === "on" || value === "yes";
}

export function normalizePaymentFilters(searchParams?: PaymentSearchParams): NormalizedPaymentFilters {
  const rawSegment = cleanString(readPaymentParam(searchParams, "segment"), 60);
  const pageSizeRaw = Number(readPaymentParam(searchParams, "pageSize") ?? "");
  const pageRaw = Number(readPaymentParam(searchParams, "page") ?? "");
  const pageSize = PAYMENT_PAGE_SIZES.includes(pageSizeRaw as (typeof PAYMENT_PAGE_SIZES)[number])
    ? pageSizeRaw
    : 25;

  return {
    search: cleanString(
      readPaymentParam(searchParams, "search") ?? readPaymentParam(searchParams, "q"),
      180
    ),
    segment: SEGMENT_IDS.has(rawSegment ?? "") ? (rawSegment as PaymentOperationalSegment) : "all",
    status: cleanString(readPaymentParam(searchParams, "status"), 60),
    providerStatus: cleanString(readPaymentParam(searchParams, "providerStatus"), 80),
    method: cleanString(readPaymentParam(searchParams, "method"), 60),
    providerEnvironment: PAYMENT_ENVIRONMENTS.has(readPaymentParam(searchParams, "providerEnvironment") ?? "")
      ? readPaymentParam(searchParams, "providerEnvironment") ?? null
      : null,
    currency: cleanString(readPaymentParam(searchParams, "currency"), 8)?.toUpperCase() ?? null,
    amountMin: parsePositiveNumber(readPaymentParam(searchParams, "amountMin")),
    amountMax: parsePositiveNumber(readPaymentParam(searchParams, "amountMax")),
    createdFrom: parseDate(readPaymentParam(searchParams, "createdFrom")),
    createdTo: parseDate(readPaymentParam(searchParams, "createdTo"), true),
    requiresReviewOnly: parseBoolean(readPaymentParam(searchParams, "requiresReviewOnly")),
    missingReservationLinkOnly: parseBoolean(readPaymentParam(searchParams, "missingReservationLinkOnly")),
    disputeStatus: cleanString(readPaymentParam(searchParams, "disputeStatus"), 60),
    page: Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1,
    pageSize,
    paymentId: cleanString(readPaymentParam(searchParams, "paymentId"), 100),
  };
}

export function createPaymentsHref(
  filters: NormalizedPaymentFilters,
  updates: Partial<Record<keyof NormalizedPaymentFilters | "notice" | "error", string | number | boolean | null | undefined>>
) {
  const params = new URLSearchParams();
  const next = { ...filters, ...updates };

  if (next.search) params.set("search", String(next.search));
  if (next.segment && next.segment !== "all") params.set("segment", String(next.segment));
  if (next.status) params.set("status", String(next.status));
  if (next.providerStatus) params.set("providerStatus", String(next.providerStatus));
  if (next.method) params.set("method", String(next.method));
  if (next.providerEnvironment) params.set("providerEnvironment", String(next.providerEnvironment));
  if (next.currency) params.set("currency", String(next.currency));
  if (next.amountMin !== null && next.amountMin !== undefined) params.set("amountMin", String(next.amountMin));
  if (next.amountMax !== null && next.amountMax !== undefined) params.set("amountMax", String(next.amountMax));
  if (next.createdFrom instanceof Date) params.set("createdFrom", next.createdFrom.toISOString().slice(0, 10));
  if (next.createdTo instanceof Date) params.set("createdTo", next.createdTo.toISOString().slice(0, 10));
  if (next.requiresReviewOnly) params.set("requiresReviewOnly", "1");
  if (next.missingReservationLinkOnly) params.set("missingReservationLinkOnly", "1");
  if (next.disputeStatus) params.set("disputeStatus", String(next.disputeStatus));
  if (next.page && Number(next.page) > 1) params.set("page", String(next.page));
  if (next.pageSize && Number(next.pageSize) !== 25) params.set("pageSize", String(next.pageSize));
  if (next.paymentId) params.set("paymentId", String(next.paymentId));
  if (updates.notice) params.set("notice", String(updates.notice));
  if (updates.error) params.set("error", String(updates.error));

  const query = params.toString();
  return `/admin/payments${query ? `?${query}` : ""}`;
}

export function basePaymentWhereFromFilters(filters: NormalizedPaymentFilters): Prisma.PaymentRecordWhereInput {
  const and: Prisma.PaymentRecordWhereInput[] = [];

  if (filters.status) and.push({ status: filters.status });
  if (filters.providerStatus) {
    and.push({ providerStatus: { contains: filters.providerStatus, mode: "insensitive" } });
  }
  if (filters.method) and.push({ method: filters.method });
  if (filters.providerEnvironment) and.push({ providerEnvironment: filters.providerEnvironment });
  if (filters.currency) and.push({ currency: filters.currency });
  if (filters.amountMin !== null || filters.amountMax !== null) {
    and.push({
      amount: {
        ...(filters.amountMin !== null ? { gte: filters.amountMin } : {}),
        ...(filters.amountMax !== null ? { lte: filters.amountMax } : {}),
      },
    });
  }
  if (filters.createdFrom || filters.createdTo) {
    and.push({
      createdAt: {
        ...(filters.createdFrom ? { gte: filters.createdFrom } : {}),
        ...(filters.createdTo ? { lte: filters.createdTo } : {}),
      },
    });
  }
  if (filters.requiresReviewOnly) and.push({ status: "requires_review" });
  if (filters.missingReservationLinkOnly) and.push({ reservationId: null });

  return and.length ? { AND: and } : {};
}

export function paymentSegmentWhere(segment: PaymentOperationalSegment): Prisma.PaymentRecordWhereInput {
  if (segment === "all") return {};
  if (segment === "refunded") return { status: { in: ["refunded", "partially_refunded"] } };
  if (segment === "manual_settlements") {
    return {
      OR: [
        { provider: "manual" },
        { method: { in: ["manual", "bank_transfer", "cash_to_host"] } },
      ],
    };
  }
  if (segment === "provider_unsynced") {
    return {
      provider: "paypal",
      providerOrderId: { not: null },
      OR: [
        { providerStatus: null },
        { events: { none: { type: { in: ["paypal_order_resynced", "paypal_order_captured", "paypal_order_authorized"] } } } },
      ],
    };
  }
  if (segment === "linked_reservation") return { reservationId: { not: null } };
  if (segment === "missing_reservation") return { reservationId: null };
  return { status: segment };
}
