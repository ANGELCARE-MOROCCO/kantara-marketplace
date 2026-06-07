export const BOOKING_LIFECYCLE_STATUSES = [
  "requested",
  "reserved",
  "confirmed",
  "under_review",
  "cancelled",
  "completed",
] as const;

export type BookingLifecycleStatus = (typeof BOOKING_LIFECYCLE_STATUSES)[number];

export const BOOKING_OPERATIONAL_SEGMENTS = [
  { id: "all", label: "All", description: "Every reservation matching the current filters." },
  { id: "requested", label: "Requested", description: "Guest requests waiting for operations review." },
  { id: "confirmed", label: "Confirmed", description: "Confirmed reservations in the operating queue." },
  { id: "under_review", label: "Under review", description: "Reservations already held for internal review." },
  { id: "upcoming_arrivals", label: "Upcoming arrivals", description: "Future arrivals requiring readiness checks." },
  { id: "active_stays", label: "Active/current stays", description: "Reservations currently in stay dates." },
  { id: "past_stays", label: "Past stays", description: "Reservations whose checkout date has passed." },
  { id: "requires_attention", label: "Requires attention", description: "Reservations with computed blockers or review work." },
  { id: "payment_attention", label: "Payment pending/requires review", description: "Reservations linked to unsettled or review payments." },
  { id: "handover_missing", label: "Handover missing", description: "Upcoming reservations without a linked field-ops task." },
  { id: "dispute_open", label: "Dispute open", description: "Reservations linked to an unresolved dispute." },
  { id: "cancelled", label: "Cancelled", description: "Cancelled reservations." },
] as const;

export type BookingOperationalSegment = (typeof BOOKING_OPERATIONAL_SEGMENTS)[number]["id"];
export type BookingAttentionLevel = "none" | "low" | "medium" | "high" | "critical";

export type BookingLinkedPayment = {
  id: string;
  status: string;
  providerStatus?: string | null;
  providerOrderId?: string | null;
  updatedAt?: Date | string | null;
  createdAt?: Date | string | null;
};

export type BookingLinkedHandover = {
  id: string;
  status: string;
  scheduledFor?: Date | string | null;
  updatedAt?: Date | string | null;
  createdAt?: Date | string | null;
};

export type BookingLinkedDispute = {
  id: string;
  status: string;
  priority: string;
  updatedAt?: Date | string | null;
  createdAt?: Date | string | null;
};

export type BookingLinkedVerification = {
  id: string;
  entityType: string;
  entityId: string;
  category: string;
  status: string;
  updatedAt?: Date | string | null;
  createdAt?: Date | string | null;
};

export type BookingPremiumProfile = {
  id: string;
  status: string;
  eligibilityScore: number;
  riskLevel: string;
} | null;

export type BookingInsightInput = {
  id: string;
  bookingStatus: string;
  startDate: Date | string;
  endDate: Date | string;
  createdAt: Date | string;
  totalSnapshot?: number | null;
  nightlyPriceSnapshot?: number | null;
  totalNightsSnapshot?: number | null;
  priceLockedAt?: Date | string | null;
  userId?: string | null;
  homeId?: string | null;
  guestReservationCount?: number;
  guestFavoriteCount?: number;
  property?: {
    price?: number | null;
    listingStatus?: string | null;
    contentReviewStatus?: string | null;
    imageCount?: number;
  } | null;
  payments: BookingLinkedPayment[];
  handovers: BookingLinkedHandover[];
  disputes: BookingLinkedDispute[];
  verifications: BookingLinkedVerification[];
  premiumProfile?: BookingPremiumProfile;
  now?: Date;
};

export type BookingNextBestAction = {
  id: string;
  label: string;
  reason: string;
  href?: string;
  disabledReason?: string | null;
  severity: BookingAttentionLevel;
};

export type BookingInsight = {
  requiresAttention: boolean;
  paymentMissing: boolean;
  paymentRequiresReview: boolean;
  handoverMissingForUpcomingStay: boolean;
  disputeOpen: boolean;
  verificationPending: boolean;
  propertyMissingPricing: boolean;
  propertyMissingMedia: boolean;
  guestPremiumCandidate: boolean;
  reservationSnapshotIncomplete: boolean;
  upcomingArrival: boolean;
  activeStay: boolean;
  pastStay: boolean;
  cancellationRisk: boolean;
  attentionLevel: BookingAttentionLevel;
  attentionReasons: string[];
  nextBestActions: BookingNextBestAction[];
  linkedCounts: {
    payments: number;
    handovers: number;
    disputes: number;
    verifications: number;
  };
  lifecycleStage: string;
  readinessScore: number;
};

export type BookingOperationsRow = {
  id: string;
  reference: string;
  status: string;
  guestName: string;
  guestEmail: string | null;
  guestId: string | null;
  propertyTitle: string;
  propertyCity: string | null;
  propertyId: string | null;
  partnerName: string;
  partnerEmail: string | null;
  partnerId: string | null;
  checkInIso: string;
  checkOutIso: string;
  createdAtIso: string;
  lastActivityIso: string | null;
  nights: number;
  amount: number | null;
  currency: string;
  paymentStatus: string;
  handoverStatus: string;
  disputeStatus: string;
  verificationStatus: string;
  attentionLevel: BookingAttentionLevel;
  attentionReasons: string[];
  nextBestAction: string;
  readinessScore: number;
  linkedCounts: BookingInsight["linkedCounts"];
  canMarkUnderReview: boolean;
  markUnderReviewDisabledReason: string | null;
  canCreateHandover: boolean;
  createHandoverDisabledReason: string | null;
  rowHref: string;
};

const PAYMENT_SETTLED_STATUSES = new Set(["captured", "authorized"]);
const PAYMENT_REVIEW_STATUSES = new Set(["failed", "requires_review"]);
const PAYMENT_PENDING_STATUSES = new Set(["draft", "order_created", "pending_approval"]);
const OPEN_DISPUTE_STATUSES = new Set(["open", "under_review", "awaiting_guest", "awaiting_partner", "awaiting_admin", "reopened"]);
const PENDING_VERIFICATION_STATUSES = new Set(["pending", "under_review", "needs_information"]);
const CLOSED_BOOKING_STATUSES = new Set(["cancelled", "completed"]);

function asDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysUntil(date: Date, now: Date) {
  return Math.ceil((date.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

function addReason(
  reasons: string[],
  severityScores: number[],
  reason: string,
  severity: BookingAttentionLevel
) {
  reasons.push(reason);
  severityScores.push(
    severity === "critical" ? 4 : severity === "high" ? 3 : severity === "medium" ? 2 : severity === "low" ? 1 : 0
  );
}

function scoreToLevel(score: number): BookingAttentionLevel {
  if (score >= 4) return "critical";
  if (score === 3) return "high";
  if (score === 2) return "medium";
  if (score === 1) return "low";
  return "none";
}

export function getBookingStatusTransitionDisabledReason(currentStatus: string, nextStatus: string) {
  if (currentStatus === nextStatus) return "Reservation is already in this status.";
  if (!BOOKING_LIFECYCLE_STATUSES.includes(nextStatus as BookingLifecycleStatus)) {
    return "Unsupported booking status.";
  }
  if (nextStatus === "under_review") return null;
  if (currentStatus === "cancelled") return "Cancelled reservations cannot move directly into another lifecycle state.";
  if (currentStatus === "completed") return "Completed reservations cannot be changed without reopening to under review first.";
  if (nextStatus === "confirmed" && !["requested", "reserved", "under_review"].includes(currentStatus)) {
    return "Only requested, reserved, or under-review reservations can be manually confirmed.";
  }
  if (nextStatus === "cancelled" && currentStatus === "completed") {
    return "Completed reservations cannot be cancelled.";
  }
  return null;
}

export function getBulkMarkUnderReviewDisabledReason(statuses: string[]) {
  if (!statuses.length) return "Select at least one booking.";
  const eligible = statuses.some((status) => !getBookingStatusTransitionDisabledReason(status, "under_review"));
  return eligible ? null : "Selected bookings are already closed or under review.";
}

export function analyzeBooking(input: BookingInsightInput): BookingInsight {
  const now = input.now ?? new Date();
  const startDate = asDate(input.startDate) ?? now;
  const endDate = asDate(input.endDate) ?? startDate;
  const imageCount = input.property?.imageCount ?? 0;
  const isClosed = CLOSED_BOOKING_STATUSES.has(input.bookingStatus);
  const upcomingArrival = startDate >= now && !isClosed;
  const activeStay = startDate <= now && endDate >= now && !isClosed;
  const pastStay = endDate < now || input.bookingStatus === "completed";
  const soonArrival = upcomingArrival && daysUntil(startDate, now) <= 3;
  const urgentArrival = upcomingArrival && daysUntil(startDate, now) <= 1;

  const settledPayment = input.payments.some((payment) => PAYMENT_SETTLED_STATUSES.has(payment.status));
  const paymentMissing = !isClosed && Boolean(input.totalSnapshot && input.totalSnapshot > 0) && !settledPayment;
  const paymentRequiresReview = input.payments.some((payment) => {
    const providerUnknown = payment.providerStatus && ["FAILED", "DECLINED", "VOIDED"].includes(payment.providerStatus.toUpperCase());
    return PAYMENT_REVIEW_STATUSES.has(payment.status) || Boolean(providerUnknown);
  });
  const paymentPending = input.payments.some((payment) => PAYMENT_PENDING_STATUSES.has(payment.status));
  const handoverMissingForUpcomingStay = upcomingArrival && input.handovers.length === 0;
  const disputeOpen = input.disputes.some((dispute) => OPEN_DISPUTE_STATUSES.has(dispute.status));
  const urgentDispute = input.disputes.some((dispute) => OPEN_DISPUTE_STATUSES.has(dispute.status) && dispute.priority === "urgent");
  const verificationPending = input.verifications.some((record) => PENDING_VERIFICATION_STATUSES.has(record.status));
  const propertyMissingPricing = !input.totalSnapshot && !input.nightlyPriceSnapshot && !input.property?.price;
  const propertyMissingMedia = Boolean(input.homeId) && imageCount === 0;
  const reservationSnapshotIncomplete = !input.priceLockedAt || !input.totalSnapshot || !input.totalNightsSnapshot;
  const guestPremiumCandidate = !input.premiumProfile && (input.guestReservationCount ?? 0) >= 2 && !disputeOpen;
  const cancellationRisk = ["requested", "under_review"].includes(input.bookingStatus) && soonArrival;

  const reasons: string[] = [];
  const severityScores: number[] = [];

  if (urgentDispute) addReason(reasons, severityScores, "Urgent unresolved dispute is linked to this booking.", "critical");
  if (urgentArrival && handoverMissingForUpcomingStay) addReason(reasons, severityScores, "Arrival is within 24 hours and no handover task exists.", "critical");
  if (paymentRequiresReview) addReason(reasons, severityScores, "Linked payment requires review or has a failed provider state.", "high");
  if (disputeOpen && !urgentDispute) addReason(reasons, severityScores, "Open dispute is linked to this reservation.", "high");
  if (handoverMissingForUpcomingStay && !urgentArrival) addReason(reasons, severityScores, "Upcoming reservation has no handover task.", "high");
  if (paymentMissing && !paymentRequiresReview) {
    addReason(
      reasons,
      severityScores,
      paymentPending ? "Payment is not settled yet." : "No captured or authorized payment is linked.",
      soonArrival ? "high" : "medium"
    );
  }
  if (verificationPending) addReason(reasons, severityScores, "Verification queue has pending or needs-information records.", "medium");
  if (reservationSnapshotIncomplete) addReason(reasons, severityScores, "Reservation price snapshot is incomplete or lacks a lock timestamp.", "medium");
  if (propertyMissingPricing) addReason(reasons, severityScores, "Linked property or reservation lacks usable pricing context.", "medium");
  if (propertyMissingMedia) addReason(reasons, severityScores, "Linked property has no media attached.", "low");
  if (guestPremiumCandidate) addReason(reasons, severityScores, "Guest may be a premium profile candidate based on repeat booking history.", "low");
  if (cancellationRisk) addReason(reasons, severityScores, "Unresolved requested/review status is close to arrival.", "medium");

  let readinessScore = 100;
  if (urgentDispute) readinessScore -= 35;
  if (paymentRequiresReview) readinessScore -= 25;
  if (paymentMissing) readinessScore -= soonArrival ? 25 : 15;
  if (handoverMissingForUpcomingStay) readinessScore -= soonArrival ? 25 : 18;
  if (disputeOpen) readinessScore -= 20;
  if (verificationPending) readinessScore -= 12;
  if (reservationSnapshotIncomplete) readinessScore -= 18;
  if (propertyMissingPricing) readinessScore -= 12;
  if (propertyMissingMedia) readinessScore -= 6;
  readinessScore = Math.max(0, Math.min(100, readinessScore));

  const attentionLevel = scoreToLevel(Math.max(0, ...severityScores));
  const nextBestActions: BookingNextBestAction[] = [];

  if (paymentRequiresReview || paymentMissing) {
    nextBestActions.push({
      id: "payment",
      label: paymentRequiresReview ? "Review linked payment" : "Create or settle payment",
      reason: paymentRequiresReview ? "A linked payment is blocked." : "No settled payment is linked.",
      href: `/admin/bookings?bookingId=${input.id}#payments`,
      severity: paymentRequiresReview ? "high" : "medium",
    });
  }
  if (handoverMissingForUpcomingStay) {
    nextBestActions.push({
      id: "handover",
      label: "Create handover task",
      reason: "Upcoming arrivals need field-ops readiness before check-in.",
      href: `/admin/bookings?bookingId=${input.id}#handover`,
      severity: soonArrival ? "critical" : "high",
    });
  }
  if (disputeOpen) {
    nextBestActions.push({
      id: "dispute",
      label: "Open dispute workspace",
      reason: "A linked dispute is active.",
      href: `/admin/bookings?bookingId=${input.id}#disputes`,
      severity: urgentDispute ? "critical" : "high",
    });
  }
  if (verificationPending) {
    nextBestActions.push({
      id: "verification",
      label: "Review verification",
      reason: "Trust or readiness verification is pending.",
      href: `/admin/bookings?bookingId=${input.id}#verifications`,
      severity: "medium",
    });
  }
  if (!nextBestActions.length) {
    nextBestActions.push({
      id: "monitor",
      label: activeStay ? "Monitor active stay" : pastStay ? "Review operational history" : "Keep in normal queue",
      reason: "No active blockers are detected from linked data.",
      href: `/admin/bookings?bookingId=${input.id}`,
      severity: "none",
    });
  }

  const lifecycleStage = isClosed
    ? input.bookingStatus
    : activeStay
      ? "active_stay"
      : upcomingArrival
        ? "upcoming_arrival"
        : pastStay
          ? "past_stay"
          : input.bookingStatus;

  return {
    requiresAttention: reasons.length > 0,
    paymentMissing,
    paymentRequiresReview,
    handoverMissingForUpcomingStay,
    disputeOpen,
    verificationPending,
    propertyMissingPricing,
    propertyMissingMedia,
    guestPremiumCandidate,
    reservationSnapshotIncomplete,
    upcomingArrival,
    activeStay,
    pastStay,
    cancellationRisk,
    attentionLevel,
    attentionReasons: reasons,
    nextBestActions,
    linkedCounts: {
      payments: input.payments.length,
      handovers: input.handovers.length,
      disputes: input.disputes.length,
      verifications: input.verifications.length,
    },
    lifecycleStage,
    readinessScore,
  };
}
