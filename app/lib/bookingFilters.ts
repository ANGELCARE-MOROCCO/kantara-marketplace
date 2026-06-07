import type { Prisma } from "@prisma/client";
import {
  BOOKING_LIFECYCLE_STATUSES,
  BOOKING_OPERATIONAL_SEGMENTS,
  type BookingLifecycleStatus,
  type BookingOperationalSegment,
} from "./bookingIntelligence";

export type BookingSearchParams = {
  [key: string]: string | string[] | undefined;
};

export type NormalizedBookingFilters = {
  page: number;
  pageSize: number;
  search: string | null;
  status: string | null;
  segment: BookingOperationalSegment;
  from: string | null;
  to: string | null;
  paymentStatus: string | null;
  handoverStatus: string | null;
  disputeStatus: string | null;
  partnerId: string | null;
  propertyId: string | null;
  requiresAttentionOnly: boolean;
  bookingId: string | null;
};

const SEGMENT_IDS = new Set(BOOKING_OPERATIONAL_SEGMENTS.map((segment) => segment.id));

export function readBookingParam(
  searchParams: BookingSearchParams | undefined,
  key: string
) {
  const value = searchParams?.[key];
  return Array.isArray(value) ? value[0] : value;
}

export function parseBookingDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function normalizeBookingFilters(searchParams?: BookingSearchParams): NormalizedBookingFilters {
  const rawPage = Number(readBookingParam(searchParams, "page") ?? "1");
  const rawPageSize = Number(readBookingParam(searchParams, "pageSize") ?? "25");
  const rawSegment = readBookingParam(searchParams, "segment") ?? "all";
  const status = readBookingParam(searchParams, "status")?.trim() || null;

  return {
    page: Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1,
    pageSize: Number.isFinite(rawPageSize)
      ? Math.min(100, Math.max(10, Math.floor(rawPageSize)))
      : 25,
    search: readBookingParam(searchParams, "search")?.trim() || readBookingParam(searchParams, "q")?.trim() || null,
    status: status && BOOKING_LIFECYCLE_STATUSES.includes(status as BookingLifecycleStatus) ? status : null,
    segment: SEGMENT_IDS.has(rawSegment as BookingOperationalSegment)
      ? (rawSegment as BookingOperationalSegment)
      : "all",
    from: readBookingParam(searchParams, "from")?.trim() || null,
    to: readBookingParam(searchParams, "to")?.trim() || null,
    paymentStatus: readBookingParam(searchParams, "paymentStatus")?.trim() || null,
    handoverStatus: readBookingParam(searchParams, "handoverStatus")?.trim() || null,
    disputeStatus: readBookingParam(searchParams, "disputeStatus")?.trim() || null,
    partnerId: readBookingParam(searchParams, "partnerId")?.trim() || null,
    propertyId: readBookingParam(searchParams, "propertyId")?.trim() || null,
    requiresAttentionOnly: readBookingParam(searchParams, "attentionOnly") === "1",
    bookingId:
      readBookingParam(searchParams, "bookingId")?.trim() ||
      readBookingParam(searchParams, "reservationId")?.trim() ||
      null,
  };
}

export function buildBaseBookingWhere(
  filters: NormalizedBookingFilters,
  now = new Date()
): Prisma.ReservationWhereInput {
  const and: Prisma.ReservationWhereInput[] = [];
  const from = parseBookingDate(filters.from);
  const to = parseBookingDate(filters.to);

  if (filters.status) and.push({ bookingStatus: filters.status });
  if (filters.propertyId) and.push({ homeId: filters.propertyId });
  if (filters.partnerId) and.push({ Home: { userId: filters.partnerId } });
  if (from) and.push({ startDate: { gte: from } });
  if (to) {
    const endOfDay = new Date(to);
    endOfDay.setUTCHours(23, 59, 59, 999);
    and.push({ endDate: { lte: endOfDay } });
  }

  if (filters.segment === "requested") and.push({ bookingStatus: "requested" });
  if (filters.segment === "confirmed") and.push({ bookingStatus: "confirmed" });
  if (filters.segment === "under_review") and.push({ bookingStatus: "under_review" });
  if (filters.segment === "cancelled") and.push({ bookingStatus: "cancelled" });
  if (filters.segment === "upcoming_arrivals") {
    and.push({ startDate: { gte: now }, bookingStatus: { notIn: ["cancelled", "completed"] } });
  }
  if (filters.segment === "active_stays") {
    and.push({
      startDate: { lte: now },
      endDate: { gte: now },
      bookingStatus: { notIn: ["cancelled", "completed"] },
    });
  }
  if (filters.segment === "past_stays") {
    and.push({
      OR: [{ endDate: { lt: now } }, { bookingStatus: "completed" }],
    });
  }

  const search = filters.search;
  if (search) {
    and.push({
      OR: [
        { id: { contains: search, mode: "insensitive" } },
        { bookingStatus: { contains: search, mode: "insensitive" } },
        { listingTitleSnapshot: { contains: search, mode: "insensitive" } },
        { listingCitySnapshot: { contains: search, mode: "insensitive" } },
        { User: { email: { contains: search, mode: "insensitive" } } },
        { User: { firstName: { contains: search, mode: "insensitive" } } },
        { User: { lastName: { contains: search, mode: "insensitive" } } },
        { Home: { title: { contains: search, mode: "insensitive" } } },
        { Home: { approvedTitle: { contains: search, mode: "insensitive" } } },
        { Home: { city: { contains: search, mode: "insensitive" } } },
        { Home: { User: { email: { contains: search, mode: "insensitive" } } } },
        { Home: { User: { firstName: { contains: search, mode: "insensitive" } } } },
        { Home: { User: { lastName: { contains: search, mode: "insensitive" } } } },
      ],
    });
  }

  return and.length ? { AND: and } : {};
}

export function createBookingsHref(
  filters: NormalizedBookingFilters,
  overrides: Partial<Record<keyof NormalizedBookingFilters | "notice" | "error", string | number | boolean | null | undefined>>
) {
  const search = new URLSearchParams();

  const values: Record<string, string | number | boolean | null | undefined> = {
    page: filters.page > 1 ? filters.page : null,
    pageSize: filters.pageSize !== 25 ? filters.pageSize : null,
    search: filters.search,
    status: filters.status,
    segment: filters.segment !== "all" ? filters.segment : null,
    from: filters.from,
    to: filters.to,
    paymentStatus: filters.paymentStatus,
    handoverStatus: filters.handoverStatus,
    disputeStatus: filters.disputeStatus,
    partnerId: filters.partnerId,
    propertyId: filters.propertyId,
    attentionOnly: filters.requiresAttentionOnly ? "1" : null,
    bookingId: filters.bookingId,
    ...overrides,
  };

  Object.entries(values).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== false && value !== "") {
      search.set(key, String(value));
    }
  });

  return `/admin/bookings${search.toString() ? `?${search.toString()}` : ""}`;
}
