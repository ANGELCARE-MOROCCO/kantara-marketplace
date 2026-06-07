import type { Prisma } from "@prisma/client";

export const GUEST_SEGMENTS = [
  { id: "all", label: "All guests" },
  { id: "new", label: "New guests" },
  { id: "active", label: "Active guests" },
  { id: "with_reservations", label: "Guests with reservations" },
  { id: "repeat", label: "Repeat guests" },
  { id: "upcoming_stays", label: "Upcoming stays" },
  { id: "current_stays", label: "Current stays" },
  { id: "payment_risk", label: "Payment risk" },
  { id: "dispute_exposure", label: "Dispute exposure" },
  { id: "handover_issue_exposure", label: "Handover issue exposure" },
  { id: "verification_pending", label: "Verification pending" },
  { id: "verification_missing", label: "Verification missing" },
  { id: "premium_candidates", label: "Premium candidates" },
  { id: "premium_ready", label: "Premium ready" },
  { id: "no_reservations", label: "No reservations yet" },
  { id: "requires_review", label: "Requires operator review" },
] as const;

export type GuestSegment = (typeof GUEST_SEGMENTS)[number]["id"];

export type GuestSearchParams = {
  q?: string | string[];
  segment?: string | string[];
  guestId?: string | string[];
  role?: string | string[];
  accountAge?: string | string[];
  reservationCount?: string | string[];
  upcomingStay?: string | string[];
  paymentRisk?: string | string[];
  disputeStatus?: string | string[];
  handoverIssue?: string | string[];
  verificationStatus?: string | string[];
  premiumStatus?: string | string[];
  preferredLanguage?: string | string[];
  preferredCurrency?: string | string[];
  latestActivity?: string | string[];
  riskLevel?: string | string[];
  requiresReview?: string | string[];
  page?: string | string[];
  notice?: string | string[];
  error?: string | string[];
};

export type NormalizedGuestFilters = {
  search: string | null;
  segment: GuestSegment;
  selectedGuestId: string | null;
  role: string | null;
  accountAge: string | null;
  reservationCount: string | null;
  upcomingStay: string | null;
  paymentRisk: string | null;
  disputeStatus: string | null;
  handoverIssue: string | null;
  verificationStatus: string | null;
  premiumStatus: string | null;
  preferredLanguage: string | null;
  preferredCurrency: string | null;
  latestActivity: string | null;
  riskLevel: string | null;
  requiresReview: string | null;
  page: number;
  pageSize: number;
  notice: string | null;
  error: string | null;
};

export function readGuestParam(searchParams: GuestSearchParams | undefined, key: keyof GuestSearchParams) {
  const value = searchParams?.[key];
  return Array.isArray(value) ? value[0] : value;
}

function stringParam(searchParams: GuestSearchParams | undefined, key: keyof GuestSearchParams) {
  const value = readGuestParam(searchParams, key)?.trim();
  return value ? value.slice(0, 160) : null;
}

function normalizeSegment(value?: string | null): GuestSegment {
  return GUEST_SEGMENTS.some((segment) => segment.id === value) ? (value as GuestSegment) : "all";
}

function normalizePage(value?: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.floor(parsed);
}

export function normalizeGuestFilters(searchParams?: GuestSearchParams): NormalizedGuestFilters {
  return {
    search: stringParam(searchParams, "q"),
    segment: normalizeSegment(stringParam(searchParams, "segment")),
    selectedGuestId: stringParam(searchParams, "guestId"),
    role: stringParam(searchParams, "role"),
    accountAge: stringParam(searchParams, "accountAge"),
    reservationCount: stringParam(searchParams, "reservationCount"),
    upcomingStay: stringParam(searchParams, "upcomingStay"),
    paymentRisk: stringParam(searchParams, "paymentRisk"),
    disputeStatus: stringParam(searchParams, "disputeStatus"),
    handoverIssue: stringParam(searchParams, "handoverIssue"),
    verificationStatus: stringParam(searchParams, "verificationStatus"),
    premiumStatus: stringParam(searchParams, "premiumStatus"),
    preferredLanguage: stringParam(searchParams, "preferredLanguage"),
    preferredCurrency: stringParam(searchParams, "preferredCurrency"),
    latestActivity: stringParam(searchParams, "latestActivity"),
    riskLevel: stringParam(searchParams, "riskLevel"),
    requiresReview: stringParam(searchParams, "requiresReview"),
    page: normalizePage(stringParam(searchParams, "page")),
    pageSize: 80,
    notice: stringParam(searchParams, "notice"),
    error: stringParam(searchParams, "error"),
  };
}

export function buildBaseGuestWhere(filters: NormalizedGuestFilters): Prisma.UserWhereInput {
  const and: Prisma.UserWhereInput[] = [{ role: { notIn: ["admin", "super_admin"] } }];

  if (filters.role) and.push({ role: filters.role });
  if (filters.search) {
    const q = filters.search;
    and.push({
      OR: [
        { id: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  return { AND: and };
}

export function guestFilterHref(filters: NormalizedGuestFilters, overrides: Record<string, string | number | null | undefined> = {}) {
  const params = new URLSearchParams();
  const values: Record<string, string | number | null | undefined> = {
    q: filters.search,
    segment: filters.segment === "all" ? null : filters.segment,
    guestId: filters.selectedGuestId,
    role: filters.role,
    accountAge: filters.accountAge,
    reservationCount: filters.reservationCount,
    upcomingStay: filters.upcomingStay,
    paymentRisk: filters.paymentRisk,
    disputeStatus: filters.disputeStatus,
    handoverIssue: filters.handoverIssue,
    verificationStatus: filters.verificationStatus,
    premiumStatus: filters.premiumStatus,
    preferredLanguage: filters.preferredLanguage,
    preferredCurrency: filters.preferredCurrency,
    latestActivity: filters.latestActivity,
    riskLevel: filters.riskLevel,
    requiresReview: filters.requiresReview,
    page: filters.page > 1 ? filters.page : null,
    ...overrides,
  };

  Object.entries(values).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== "") params.set(key, String(value));
  });

  return `/admin/guests${params.toString() ? `?${params.toString()}` : ""}`;
}

export type GuestFilterable = {
  name: string;
  email: string;
  id: string;
  role: string;
  reservationCount: number;
  hasUpcomingStay: boolean;
  hasCurrentStay: boolean;
  paymentRisk: boolean;
  openDisputeExposure: boolean;
  disputeExposure: boolean;
  repeatedDisputeExposure: boolean;
  handoverIssueExposure: boolean;
  unresolvedHandoverIssue: boolean;
  verificationState: string;
  verificationPending: boolean;
  verificationMissing: boolean;
  verificationRejected: boolean;
  premiumState: string;
  premiumCandidate: boolean;
  premiumReady: boolean;
  premiumProfileExists: boolean;
  preferredLanguage: string | null;
  preferredCurrency: string | null;
  latestActivityIso: string | null;
  riskLevel: string;
  requiresOperatorReview: boolean;
  newGuest: boolean;
  activeGuest: boolean;
};

export function guestMatchesSegment(row: GuestFilterable, segment: GuestSegment) {
  if (segment === "new") return row.newGuest;
  if (segment === "active") return row.activeGuest;
  if (segment === "with_reservations") return row.reservationCount > 0;
  if (segment === "repeat") return row.reservationCount >= 2;
  if (segment === "upcoming_stays") return row.hasUpcomingStay;
  if (segment === "current_stays") return row.hasCurrentStay;
  if (segment === "payment_risk") return row.paymentRisk;
  if (segment === "dispute_exposure") return row.disputeExposure;
  if (segment === "handover_issue_exposure") return row.handoverIssueExposure;
  if (segment === "verification_pending") return row.verificationPending;
  if (segment === "verification_missing") return row.verificationMissing;
  if (segment === "premium_candidates") return row.premiumCandidate;
  if (segment === "premium_ready") return row.premiumReady;
  if (segment === "no_reservations") return row.reservationCount === 0;
  if (segment === "requires_review") return row.requiresOperatorReview;
  return true;
}

export function guestMatchesFilters(row: GuestFilterable, filters: NormalizedGuestFilters, now = new Date()) {
  if (!guestMatchesSegment(row, filters.segment)) return false;
  if (filters.accountAge === "tracked") return false;
  if (filters.reservationCount === "none" && row.reservationCount !== 0) return false;
  if (filters.reservationCount === "one" && row.reservationCount !== 1) return false;
  if (filters.reservationCount === "repeat" && row.reservationCount < 2) return false;
  if (filters.reservationCount === "three_plus" && row.reservationCount < 3) return false;
  if (filters.upcomingStay === "yes" && !row.hasUpcomingStay) return false;
  if (filters.upcomingStay === "no" && row.hasUpcomingStay) return false;
  if (filters.paymentRisk === "yes" && !row.paymentRisk) return false;
  if (filters.paymentRisk === "no" && row.paymentRisk) return false;
  if (filters.disputeStatus === "none" && row.disputeExposure) return false;
  if (filters.disputeStatus === "open" && !row.openDisputeExposure) return false;
  if (filters.disputeStatus === "exposed" && !row.disputeExposure) return false;
  if (filters.disputeStatus === "repeated" && !row.repeatedDisputeExposure) return false;
  if (filters.handoverIssue === "yes" && !row.handoverIssueExposure) return false;
  if (filters.handoverIssue === "unresolved" && !row.unresolvedHandoverIssue) return false;
  if (filters.handoverIssue === "no" && row.handoverIssueExposure) return false;
  if (filters.verificationStatus === "missing" && !row.verificationMissing) return false;
  if (filters.verificationStatus === "pending" && !row.verificationPending) return false;
  if (filters.verificationStatus === "verified" && row.verificationState !== "verified") return false;
  if (filters.verificationStatus === "rejected" && !row.verificationRejected) return false;
  if (filters.premiumStatus === "none" && row.premiumProfileExists) return false;
  if (filters.premiumStatus === "candidate" && !row.premiumCandidate) return false;
  if (filters.premiumStatus === "profile_exists" && !row.premiumProfileExists) return false;
  if (filters.premiumStatus === "premium_ready" && !row.premiumReady) return false;
  if (filters.premiumStatus && !["none", "candidate", "profile_exists", "premium_ready"].includes(filters.premiumStatus) && row.premiumState !== filters.premiumStatus) return false;
  if (filters.preferredLanguage && row.preferredLanguage !== filters.preferredLanguage) return false;
  if (filters.preferredCurrency && row.preferredCurrency !== filters.preferredCurrency) return false;
  if (filters.riskLevel && row.riskLevel !== filters.riskLevel) return false;
  if (filters.requiresReview === "yes" && !row.requiresOperatorReview) return false;
  if (filters.requiresReview === "no" && row.requiresOperatorReview) return false;
  if (filters.latestActivity) {
    if (filters.latestActivity === "none" && row.latestActivityIso) return false;
    if (filters.latestActivity !== "none") {
      const days = Number(filters.latestActivity);
      if (Number.isFinite(days)) {
        if (!row.latestActivityIso) return false;
        const activity = new Date(row.latestActivityIso);
        const ageDays = Math.floor((now.getTime() - activity.getTime()) / 86_400_000);
        if (ageDays > days) return false;
      }
    }
  }
  return true;
}
