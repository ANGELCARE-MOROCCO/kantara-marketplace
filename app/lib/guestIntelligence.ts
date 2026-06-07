export type GuestRiskLevel = "critical" | "high" | "medium" | "low" | "foundation";
export type GuestSignalStatus = "positive" | "attention" | "risk" | "foundation" | "insufficient";
export type GuestReviewSeverity = "critical" | "high" | "medium" | "low" | "info";

export type GuestIdentitySource = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
};

export type GuestReservationSource = {
  id: string;
  userId: string | null;
  homeId?: string | null;
  bookingStatus: string;
  startDate: Date;
  endDate: Date;
  createdAt: Date;
  cancelledAt?: Date | null;
  completedAt?: Date | null;
  totalNightsSnapshot?: number | null;
  totalSnapshot?: number | null;
  currencySnapshot?: string | null;
};

export type GuestPaymentSource = {
  id: string;
  reservationId: string | null;
  guestId: string | null;
  status: string;
  method: string;
  provider: string;
  amount?: { toString(): string } | number | string | null;
  currency: string;
  capturedAt?: Date | null;
  authorizedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type GuestDisputeSource = {
  id: string;
  guestId: string | null;
  reservationId?: string | null;
  paymentRecordId?: string | null;
  status: string;
  priority: string;
  title: string;
  createdAt: Date;
  openedAt?: Date | null;
  resolvedAt?: Date | null;
  closedAt?: Date | null;
  updatedAt: Date;
};

export type GuestHandoverSource = {
  id: string;
  reservationId: string | null;
  guestId: string | null;
  type: string;
  status: string;
  priority: string;
  scheduledFor?: Date | null;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  events?: { id: string; type: string; message: string; createdAt: Date; createdById?: string | null }[];
};

export type GuestVerificationSource = {
  id: string;
  entityId: string;
  category: string;
  status: string;
  title: string;
  summary?: string | null;
  evidenceSummary?: string | null;
  reviewedAt?: Date | null;
  expiresAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type GuestPremiumProfileSource = {
  id: string;
  userId: string;
  status: string;
  eligibilityScore: number;
  riskLevel: string;
  preferredCurrency?: string | null;
  preferredLanguage?: string | null;
  travelStyle?: string | null;
  notes?: string | null;
  reviewedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type GuestFavoriteSource = {
  id: string;
  userId: string | null;
  homeId: string | null;
  createAt: Date;
};

export type GuestSignal = {
  status: GuestSignalStatus;
  label: string;
  detail: string;
  score: number | null;
};

export type GuestNextAction = {
  id: string;
  label: string;
  reason: string;
  href?: string;
  severity: GuestReviewSeverity;
  disabledReason?: string | null;
};

export type GuestReviewTrigger = {
  id: string;
  guestId: string;
  reason: string;
  severity: GuestReviewSeverity;
  sourceType: string;
  sourceId?: string | null;
  sourceHref?: string | null;
  recommendedAction: string;
};

export type GuestIntelligenceInput = {
  guest: GuestIdentitySource;
  reservations: GuestReservationSource[];
  payments: GuestPaymentSource[];
  disputes: GuestDisputeSource[];
  handovers: GuestHandoverSource[];
  verifications: GuestVerificationSource[];
  premiumProfile: GuestPremiumProfileSource | null;
  favorites: GuestFavoriteSource[];
  now?: Date;
};

export type GuestIntelligence = {
  accountAgeDays: number | null;
  accountAgeLabel: string;
  profileCompletenessScore: number;
  profileCompletenessLabel: string;
  missingProfileBasics: boolean;
  hasReservations: boolean;
  repeatGuest: boolean;
  activeGuest: boolean;
  newGuest: boolean;
  hasUpcomingStay: boolean;
  hasCurrentStay: boolean;
  paidCleanly: boolean;
  paymentRequiresReview: boolean;
  failedPaymentExposure: boolean;
  manualSettlementExposure: boolean;
  openDisputeExposure: boolean;
  repeatedDisputeExposure: boolean;
  handoverIssueExposure: boolean;
  unresolvedHandoverIssue: boolean;
  verificationPending: boolean;
  verificationMissing: boolean;
  verificationRejected: boolean;
  verificationVerified: boolean;
  premiumCandidate: boolean;
  premiumProfileExists: boolean;
  premiumReady: boolean;
  requiresOperatorReview: boolean;
  guestRiskLevel: GuestRiskLevel;
  guestReadinessScore: number | null;
  guestValueSignal: GuestSignal;
  paymentReliabilitySignal: GuestSignal;
  stayExecutionSignal: GuestSignal;
  disputeExposureSignal: GuestSignal;
  verificationSignal: GuestSignal;
  premiumReadinessSignal: GuestSignal;
  latestActivityAt: Date | null;
  latestActivityLabel: string;
  upcomingStayLabel: string;
  currentStayLabel: string;
  blockers: string[];
  reviewTriggers: GuestReviewTrigger[];
  nextBestActions: GuestNextAction[];
  canCreateVerification: boolean;
  createVerificationDisabledReason: string | null;
  canCreatePremiumProfile: boolean;
  createPremiumProfileDisabledReason: string | null;
};

const OPEN_DISPUTE_STATUSES = new Set(["open", "under_review", "awaiting_guest", "awaiting_partner", "awaiting_admin", "reopened"]);
const RESOLVED_DISPUTE_STATUSES = new Set(["resolved", "closed"]);
const HIGH_DISPUTE_PRIORITIES = new Set(["high", "urgent", "critical"]);
const PAYMENT_SETTLED_STATUSES = new Set(["captured", "authorized"]);
const PAYMENT_REVIEW_STATUSES = new Set(["requires_review", "pending_approval"]);
const PAYMENT_FAILED_STATUSES = new Set(["failed"]);
const MANUAL_PAYMENT_METHODS = new Set(["manual", "bank_transfer", "cash_to_host"]);
const VERIFICATION_PENDING_STATUSES = new Set(["pending", "under_review", "needs_information"]);
const HANDOVER_OPEN_STATUSES = new Set(["not_scheduled", "pending_preparation", "ready", "in_progress", "issue_reported"]);
const HANDOVER_ISSUE_STATUSES = new Set(["issue_reported"]);
const BOOKING_ACTIVE_STATUSES = new Set(["requested", "reserved", "confirmed", "under_review"]);
const BOOKING_CONFIRMED_STATUSES = new Set(["reserved", "confirmed"]);

export function guestDisplayName(guest: Pick<GuestIdentitySource, "firstName" | "lastName" | "email">) {
  return `${guest.firstName ?? ""} ${guest.lastName ?? ""}`.trim() || guest.email;
}

export function guestInitials(guest: Pick<GuestIdentitySource, "firstName" | "lastName" | "email">) {
  const parts = [guest.firstName, guest.lastName].filter(Boolean) as string[];
  if (parts.length) return parts.map((part) => part.charAt(0).toUpperCase()).join("").slice(0, 2);
  return guest.email.slice(0, 2).toUpperCase();
}

export function reservationReference(id: string | null | undefined) {
  return id ? `RSV-${id.slice(0, 8).toUpperCase()}` : "Unlinked";
}

export function paymentReference(id: string | null | undefined) {
  return id ? `PAY-${id.slice(0, 8).toUpperCase()}` : "Unlinked";
}

export function disputeReference(caseNumber: string | null | undefined, id: string | null | undefined) {
  return caseNumber || (id ? `DSP-${id.slice(0, 8).toUpperCase()}` : "Unlinked");
}

function daysBetween(start: Date, end: Date) {
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000);
}

function dateLabel(date: Date | null) {
  if (!date) return "No activity";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function latestDate(values: (Date | null | undefined)[]) {
  const dates = values.filter(Boolean) as Date[];
  if (!dates.length) return null;
  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

function decimalNumber(value: GuestPaymentSource["amount"]) {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : 0;
}

function getReservationNights(reservation: GuestReservationSource) {
  if (reservation.totalNightsSnapshot && reservation.totalNightsSnapshot > 0) return reservation.totalNightsSnapshot;
  const nights = Math.ceil((reservation.endDate.getTime() - reservation.startDate.getTime()) / 86_400_000);
  return nights > 0 ? nights : 0;
}

function isCancelledReservation(reservation: GuestReservationSource) {
  return reservation.bookingStatus === "cancelled" || Boolean(reservation.cancelledAt);
}

function isUpcomingReservation(reservation: GuestReservationSource, now: Date) {
  return !isCancelledReservation(reservation) && BOOKING_ACTIVE_STATUSES.has(reservation.bookingStatus) && reservation.startDate > now;
}

function isCurrentReservation(reservation: GuestReservationSource, now: Date) {
  return !isCancelledReservation(reservation) && BOOKING_ACTIVE_STATUSES.has(reservation.bookingStatus) && reservation.startDate <= now && reservation.endDate >= now;
}

function isPastReservation(reservation: GuestReservationSource, now: Date) {
  return reservation.endDate < now || reservation.bookingStatus === "completed" || Boolean(reservation.completedAt);
}

function paymentIsSettled(payment: GuestPaymentSource) {
  return PAYMENT_SETTLED_STATUSES.has(payment.status) || Boolean(payment.capturedAt || payment.authorizedAt);
}

function reservationPaymentReady(reservation: GuestReservationSource, payments: GuestPaymentSource[]) {
  const linked = payments.filter((payment) => payment.reservationId === reservation.id);
  if (!reservation.totalSnapshot || reservation.totalSnapshot <= 0) return true;
  return linked.some(paymentIsSettled);
}

function verificationStatus(verifications: GuestVerificationSource[]) {
  if (verifications.some((record) => record.status === "verified")) return "verified";
  if (verifications.some((record) => record.status === "rejected")) return "rejected";
  if (verifications.some((record) => VERIFICATION_PENDING_STATUSES.has(record.status))) return "pending";
  if (verifications.some((record) => record.status === "expired")) return "expired";
  return "missing";
}

function activeVerificationTooOld(verifications: GuestVerificationSource[], now: Date) {
  return verifications.some((record) => VERIFICATION_PENDING_STATUSES.has(record.status) && daysBetween(record.updatedAt, now) >= 7);
}

function signal(status: GuestSignalStatus, label: string, detail: string, score: number | null): GuestSignal {
  return { status, label, detail, score };
}

function sourceHref(sourceType: string, sourceId?: string | null) {
  if (!sourceId) return undefined;
  if (sourceType === "reservation") return `/admin/bookings?bookingId=${sourceId}`;
  if (sourceType === "payment") return `/admin/payments?paymentId=${sourceId}`;
  if (sourceType === "dispute") return `/admin/disputes?disputeId=${sourceId}`;
  if (sourceType === "handover") return `/admin/handover?handoverId=${sourceId}`;
  if (sourceType === "verification") return `/admin/verifications?verificationId=${sourceId}`;
  if (sourceType === "premium") return `/admin/premium-guests?profileId=${sourceId}`;
  return undefined;
}

export function analyzeGuest(input: GuestIntelligenceInput): GuestIntelligence {
  const now = input.now ?? new Date();
  const { guest, reservations, payments, disputes, handovers, verifications, premiumProfile, favorites } = input;
  const upcomingReservations = reservations.filter((reservation) => isUpcomingReservation(reservation, now));
  const currentReservations = reservations.filter((reservation) => isCurrentReservation(reservation, now));
  const pastReservations = reservations.filter((reservation) => isPastReservation(reservation, now));
  const activeReservations = reservations.filter((reservation) => !isCancelledReservation(reservation) && BOOKING_ACTIVE_STATUSES.has(reservation.bookingStatus));
  const openDisputes = disputes.filter((dispute) => OPEN_DISPUTE_STATUSES.has(dispute.status));
  const resolvedDisputes = disputes.filter((dispute) => RESOLVED_DISPUTE_STATUSES.has(dispute.status));
  const highOpenDisputes = openDisputes.filter((dispute) => HIGH_DISPUTE_PRIORITIES.has(dispute.priority));
  const unsettledFailedPayments = payments.filter((payment) => PAYMENT_FAILED_STATUSES.has(payment.status));
  const reviewPayments = payments.filter((payment) => PAYMENT_REVIEW_STATUSES.has(payment.status));
  const manualPayments = payments.filter((payment) => MANUAL_PAYMENT_METHODS.has(payment.method) || payment.provider === "manual");
  const settledPayments = payments.filter(paymentIsSettled);
  const issueHandovers = handovers.filter((task) => {
    const eventIssue = task.events?.some((event) => event.type.includes("issue") || event.message.toLowerCase().includes("issue")) ?? false;
    return HANDOVER_ISSUE_STATUSES.has(task.status) || task.priority === "high" || task.priority === "urgent" || eventIssue;
  });
  const unresolvedIssueHandovers = issueHandovers.filter((task) => task.status !== "completed" && task.status !== "cancelled");
  const pendingHandovers = handovers.filter((task) => HANDOVER_OPEN_STATUSES.has(task.status));
  const vStatus = verificationStatus(verifications);
  const verificationPending = vStatus === "pending";
  const verificationMissing = vStatus === "missing";
  const verificationRejected = vStatus === "rejected";
  const verificationVerified = vStatus === "verified";
  const missingFields = [
    guest.email?.trim() ? null : "email",
    guest.firstName?.trim() ? null : "first name",
    guest.lastName?.trim() ? null : "last name",
  ].filter(Boolean) as string[];
  const profileCompletenessScore = Math.round(((3 - missingFields.length) / 3) * 100);
  const missingProfileBasics = missingFields.length > 0;
  const hasReservations = reservations.length > 0;
  const repeatGuest = reservations.length >= 2;
  const hasUpcomingStay = upcomingReservations.length > 0;
  const hasCurrentStay = currentReservations.length > 0;
  const activeGuest = activeReservations.length > 0 || hasUpcomingStay || hasCurrentStay;
  const newGuest = !hasReservations && payments.length === 0 && disputes.length === 0 && handovers.length === 0 && verifications.length === 0 && !premiumProfile;
  const paymentRequiresReview = reviewPayments.length > 0;
  const failedPaymentExposure = unsettledFailedPayments.length > 0;
  const manualSettlementExposure = manualPayments.length > 0;
  const openDisputeExposure = openDisputes.length > 0;
  const repeatedDisputeExposure = disputes.length >= 2;
  const handoverIssueExposure = issueHandovers.length > 0;
  const unresolvedHandoverIssue = unresolvedIssueHandovers.length > 0;
  const upcomingPaymentNotReady = upcomingReservations.some((reservation) => !reservationPaymentReady(reservation, payments));
  const currentPaymentNotReady = currentReservations.some((reservation) => !reservationPaymentReady(reservation, payments));
  const paidCleanly = settledPayments.length > 0 && !paymentRequiresReview && !failedPaymentExposure && !manualSettlementExposure;
  const upcomingConfirmedBooking = upcomingReservations.some((reservation) => BOOKING_CONFIRMED_STATUSES.has(reservation.bookingStatus));
  const unresolvedHighDispute = highOpenDisputes.length > 0;
  const premiumProfileExists = Boolean(premiumProfile);
  const premiumCandidate =
    (hasReservations || upcomingConfirmedBooking) &&
    !unresolvedHighDispute &&
    !failedPaymentExposure &&
    !verificationRejected &&
    !premiumProfileExists;
  const premiumReady = Boolean(premiumProfile && ["premium_ready", "verified"].includes(premiumProfile.status) && !unresolvedHighDispute && !failedPaymentExposure && !verificationRejected);
  const latestActivityAt = latestDate([
    ...reservations.map((reservation) => reservation.createdAt),
    ...payments.map((payment) => payment.updatedAt ?? payment.createdAt),
    ...disputes.map((dispute) => dispute.updatedAt ?? dispute.createdAt),
    ...handovers.map((task) => task.updatedAt ?? task.createdAt),
    ...verifications.map((record) => record.updatedAt ?? record.createdAt),
    ...favorites.map((favorite) => favorite.createAt),
    premiumProfile?.updatedAt,
  ]);

  const paymentReliabilitySignal = (() => {
    if (!payments.length && !hasReservations) return signal("insufficient", "Insufficient payment history", "No reservation or payment records exist for this guest yet.", null);
    if (failedPaymentExposure) return signal("risk", "Failed payment exposure", `${unsettledFailedPayments.length} failed payment record${unsettledFailedPayments.length === 1 ? "" : "s"} linked.`, 20);
    if (paymentRequiresReview) return signal("risk", "Payment requires review", `${reviewPayments.length} payment record${reviewPayments.length === 1 ? "" : "s"} require operator review.`, 35);
    if (manualSettlementExposure) return signal("attention", "Manual settlement exposure", "At least one payment used a manual or offline settlement method.", 45);
    if (upcomingPaymentNotReady || currentPaymentNotReady) return signal("attention", "Reservation payment not ready", "An upcoming or current stay does not have a settled payment record.", 50);
    if (paidCleanly) return signal("positive", "Paid cleanly", `${settledPayments.length} settled payment record${settledPayments.length === 1 ? "" : "s"} and no payment-risk records.`, 90);
    return signal("foundation", "Payment foundation", "Reservation history exists, but payment reliability is not yet fully evidenced.", 60);
  })();

  const stayExecutionSignal = (() => {
    if (!handovers.length && !pastReservations.length && !hasUpcomingStay && !hasCurrentStay) return signal("insufficient", "Insufficient stay execution history", "No handover or completed stay execution records exist yet.", null);
    if (unresolvedHandoverIssue) return signal("risk", "Unresolved handover issue", `${unresolvedIssueHandovers.length} issue-exposed handover task${unresolvedIssueHandovers.length === 1 ? "" : "s"} remain unresolved.`, 25);
    if (handoverIssueExposure) return signal("attention", "Handover issue exposure", "Issue history exists, but no linked issue task is currently open.", 55);
    if (pendingHandovers.length && (hasUpcomingStay || hasCurrentStay)) return signal("attention", "Upcoming handover pending", "Upcoming/current stay execution has open handover work.", 65);
    if (handovers.length || pastReservations.length) return signal("positive", "Clean stay execution", "No linked handover issues are currently recorded.", 88);
    return signal("foundation", "Stay execution foundation", "Stay execution signals will build after booking and handover records appear.", null);
  })();

  const disputeExposureSignal = (() => {
    if (!disputes.length) return signal(hasReservations ? "positive" : "foundation", "No dispute exposure", hasReservations ? "Reservation history exists with no linked disputes." : "No disputes recorded.", hasReservations ? 92 : null);
    if (openDisputeExposure && repeatedDisputeExposure) return signal("risk", "Open repeated dispute exposure", `${openDisputes.length} open and ${disputes.length} total linked dispute cases.`, 15);
    if (openDisputeExposure) return signal("risk", "Open dispute", `${openDisputes.length} open dispute case${openDisputes.length === 1 ? "" : "s"} linked.`, 30);
    if (repeatedDisputeExposure) return signal("attention", "Repeated dispute exposure", `${disputes.length} total dispute cases, currently resolved or closed.`, 55);
    if (resolvedDisputes.length === disputes.length) return signal("positive", "Resolved cleanly", "Linked dispute history is resolved or closed.", 78);
    return signal("attention", "Dispute exposure", `${disputes.length} linked dispute case${disputes.length === 1 ? "" : "s"}.`, 60);
  })();

  const verificationSignal = (() => {
    if (verificationVerified) return signal("positive", "Verified guest", "At least one guest verification record is verified.", 95);
    if (verificationRejected) return signal("risk", "Verification rejected", "A guest verification record is rejected.", 10);
    if (verificationPending) return signal("attention", "Verification pending", "A guest verification record is pending, under review, or needs information.", 55);
    if (verificationMissing && hasReservations) return signal("attention", "Verification missing", "Guest has reservation history but no guest verification record.", 35);
    return signal("foundation", "No verification record yet", "Verification can be created when operations need a trust review.", null);
  })();

  const premiumReadinessSignal = (() => {
    if (premiumReady) return signal("positive", "Premium ready", "A premium profile exists and has no active disqualifying risk signal.", Math.max(80, premiumProfile?.eligibilityScore ?? 80));
    if (premiumProfile) return signal(premiumProfile.status === "suspended" || premiumProfile.status === "rejected" ? "risk" : "attention", `Premium ${premiumProfile.status.replaceAll("_", " ")}`, `Eligibility score ${premiumProfile.eligibilityScore}; profile risk ${premiumProfile.riskLevel}.`, premiumProfile.eligibilityScore);
    if (premiumCandidate) return signal("attention", "Premium candidate", "Deterministic candidate rules pass and no premium profile exists.", 70);
    if (!hasReservations && !upcomingConfirmedBooking) return signal("foundation", "Not eligible yet", "Premium review requires reservation history or an upcoming confirmed booking.", null);
    return signal("attention", "Premium blocked", "One or more risk, payment, verification, or profile conditions block candidacy.", 35);
  })();

  const guestValueSignal = (() => {
    const totals = reservations
      .filter((reservation) => reservation.totalSnapshot && reservation.totalSnapshot > 0)
      .map((reservation) => ({ amount: reservation.totalSnapshot ?? 0, currency: reservation.currencySnapshot ?? "USD" }));
    const currencies = Array.from(new Set(totals.map((item) => item.currency)));
    const nights = reservations.reduce((sum, reservation) => sum + getReservationNights(reservation), 0);
    if (repeatGuest) return signal("positive", "Repeat guest", `${reservations.length} reservations and ${nights} stay night${nights === 1 ? "" : "s"} recorded.`, 85);
    if (totals.length && currencies.length === 1) {
      const total = totals.reduce((sum, item) => sum + item.amount, 0);
      if (total >= 5000) return signal("positive", "High snapshot value", `${currencies[0]} ${total.toLocaleString("en-US")} in reservation snapshots.`, 80);
      return signal("foundation", "Value tracked", `${currencies[0]} ${total.toLocaleString("en-US")} in reservation snapshots.`, 60);
    }
    if (totals.length && currencies.length > 1) return signal("foundation", "Multi-currency value tracked", "Reservation values exist but are not consolidated across currencies.", 60);
    if (favorites.length) return signal("foundation", "Saved-home intent", `${favorites.length} saved home${favorites.length === 1 ? "" : "s"} without enough stay value history yet.`, 45);
    return signal("insufficient", "Insufficient value history", "Value and priority signals will build after reservation/payment history exists.", null);
  })();

  const triggers: GuestReviewTrigger[] = [];
  const addTrigger = (id: string, reason: string, severity: GuestReviewSeverity, sourceType: string, sourceId: string | null | undefined, recommendedAction: string) => {
    triggers.push({
      id: `${id}-${guest.id}`,
      guestId: guest.id,
      reason,
      severity,
      sourceType,
      sourceId,
      sourceHref: sourceHref(sourceType, sourceId),
      recommendedAction,
    });
  };

  if (openDisputes.length) addTrigger("open-dispute", "Open dispute exposure", highOpenDisputes.length ? "critical" : "high", "dispute", openDisputes[0]?.id, "Open dispute and confirm owner, priority, and resolution path.");
  if (highOpenDisputes.length) addTrigger("urgent-dispute", "High or urgent dispute", "critical", "dispute", highOpenDisputes[0]?.id, "Escalate the latest high-priority dispute.");
  if (paymentRequiresReview) addTrigger("payment-review", "Payment requires review", "high", "payment", reviewPayments[0]?.id, "Open the payment issue and verify settlement readiness.");
  if (failedPaymentExposure) addTrigger("failed-payment", "Failed payment exposure", "high", "payment", unsettledFailedPayments[0]?.id, "Review failed payment before approving or prioritizing the guest.");
  if (upcomingPaymentNotReady || currentPaymentNotReady) addTrigger("upcoming-payment-not-ready", "Upcoming/current stay payment not ready", "high", "reservation", (currentReservations[0] ?? upcomingReservations[0])?.id, "Open latest booking and resolve payment readiness.");
  if (handoverIssueExposure) addTrigger("handover-issue", "Handover issue reported", unresolvedHandoverIssue ? "high" : "medium", "handover", issueHandovers[0]?.id, "Review handover issue and decide if dispute escalation is needed.");
  if (repeatedDisputeExposure) addTrigger("repeated-dispute", "Repeated dispute exposure", "medium", "dispute", disputes[0]?.id, "Review dispute pattern before premium or priority treatment.");
  if (activeVerificationTooOld(verifications, now)) addTrigger("verification-stale", "Verification pending too long", "medium", "verification", verifications.find((record) => VERIFICATION_PENDING_STATUSES.has(record.status))?.id, "Follow up on verification evidence or request information.");
  if (premiumCandidate) addTrigger("premium-candidate", "Premium candidate without profile", "low", "premium", null, "Create a premium profile for eligibility review.");
  if (hasReservations && verificationMissing) addTrigger("reservation-no-verification", "Reservation history without verification", "medium", "verification", null, "Create a guest verification record.");
  if (missingProfileBasics) addTrigger("missing-profile", `Missing basic profile fields: ${missingFields.join(", ")}`, "low", "guest", guest.id, "Confirm profile completeness through supported account flows.");
  if (manualSettlementExposure) addTrigger("manual-settlement", "Manual settlement exposure", "medium", "payment", manualPayments[0]?.id, "Review offline settlement evidence and reconciliation.");

  const blockers = triggers.filter((trigger) => ["critical", "high", "medium"].includes(trigger.severity)).map((trigger) => trigger.reason);
  const requiresOperatorReview = triggers.length > 0;

  let guestRiskLevel: GuestRiskLevel = "foundation";
  if (highOpenDisputes.length || (failedPaymentExposure && (hasUpcomingStay || hasCurrentStay))) guestRiskLevel = "critical";
  else if (openDisputeExposure || paymentRequiresReview || failedPaymentExposure || unresolvedHandoverIssue) guestRiskLevel = "high";
  else if (repeatedDisputeExposure || manualSettlementExposure || handoverIssueExposure || (hasReservations && verificationMissing) || verificationPending || missingProfileBasics) guestRiskLevel = "medium";
  else if (hasReservations || payments.length || verifications.length || premiumProfile) guestRiskLevel = "low";

  const hasOperationalHistory = hasReservations || payments.length > 0 || disputes.length > 0 || handovers.length > 0 || verifications.length > 0 || Boolean(premiumProfile);
  const guestReadinessScore = (() => {
    if (!hasOperationalHistory) return null;
    let score = 50;
    score += verificationSignal.score === null ? -5 : Math.round((verificationSignal.score - 50) * 0.25);
    score += paymentReliabilitySignal.score === null ? 0 : Math.round((paymentReliabilitySignal.score - 50) * 0.25);
    score += disputeExposureSignal.score === null ? 0 : Math.round((disputeExposureSignal.score - 50) * 0.25);
    score += stayExecutionSignal.score === null ? 0 : Math.round((stayExecutionSignal.score - 50) * 0.15);
    if (repeatGuest) score += 5;
    if (premiumProfile) score += 4;
    if (missingProfileBasics) score -= 6;
    if (guestRiskLevel === "critical") score -= 30;
    if (guestRiskLevel === "high") score -= 18;
    if (guestRiskLevel === "medium") score -= 8;
    return Math.max(0, Math.min(100, score));
  })();

  const canCreateVerification = !verificationPending && !verificationVerified;
  const createVerificationDisabledReason = canCreateVerification
    ? null
    : verificationPending
      ? "A guest verification record is already pending or under review."
      : "A verified guest verification record already exists.";
  const canCreatePremiumProfile = premiumCandidate;
  const createPremiumProfileDisabledReason = canCreatePremiumProfile
    ? null
    : premiumProfileExists
      ? "A premium guest profile already exists."
      : verificationRejected
        ? "Guest verification is rejected."
        : failedPaymentExposure
          ? "Guest has unresolved failed payment exposure."
          : unresolvedHighDispute
            ? "Guest has an unresolved high or urgent dispute."
            : !hasReservations && !upcomingConfirmedBooking
              ? "Premium candidacy requires reservation history or an upcoming confirmed booking."
              : "Guest does not currently pass premium candidate rules.";

  const nextBestActions: GuestNextAction[] = [];
  if (openDisputes[0]) nextBestActions.push({ id: "open_dispute", label: "Open dispute", reason: "Active dispute exposure is the highest-risk signal.", href: `/admin/disputes?disputeId=${openDisputes[0].id}`, severity: highOpenDisputes.length ? "critical" : "high" });
  if ((reviewPayments[0] || unsettledFailedPayments[0]) && nextBestActions.length < 4) {
    const payment = reviewPayments[0] ?? unsettledFailedPayments[0];
    nextBestActions.push({ id: "open_payment_issue", label: "Open payment issue", reason: "Payment reliability is not clean.", href: `/admin/payments?paymentId=${payment.id}`, severity: "high" });
  }
  if (issueHandovers[0] && nextBestActions.length < 4) nextBestActions.push({ id: "review_handover", label: "Review handover issue", reason: "Stay execution issue exposure is linked.", href: `/admin/handover?handoverId=${issueHandovers[0].id}`, severity: unresolvedHandoverIssue ? "high" : "medium" });
  if (canCreateVerification && nextBestActions.length < 4) nextBestActions.push({ id: "create_verification", label: "Create verification", reason: hasReservations ? "Guest has reservation history and no active verified/pending record." : "Create a trust foundation when operations need review.", severity: "medium" });
  if (canCreatePremiumProfile && nextBestActions.length < 4) nextBestActions.push({ id: "create_premium_profile", label: "Create premium profile", reason: "Guest passes deterministic premium candidate rules.", severity: "low" });
  if ((currentReservations[0] ?? upcomingReservations[0]) && nextBestActions.length < 4) {
    const reservation = currentReservations[0] ?? upcomingReservations[0];
    nextBestActions.push({ id: "open_latest_booking", label: "Open latest booking", reason: "Review stay context before approving, supporting, or prioritizing.", href: `/admin/bookings?bookingId=${reservation.id}`, severity: "info" });
  }
  if (!nextBestActions.length) {
    nextBestActions.push({ id: "monitor", label: "Monitor", reason: hasOperationalHistory ? "No active deterministic review trigger is present." : "Guest is in foundation state with insufficient history.", severity: "info" });
  }

  return {
    accountAgeDays: null,
    accountAgeLabel: "Not tracked in current User model",
    profileCompletenessScore,
    profileCompletenessLabel: missingFields.length ? `${profileCompletenessScore}% complete - missing ${missingFields.join(", ")}` : "Complete basic profile",
    missingProfileBasics,
    hasReservations,
    repeatGuest,
    activeGuest,
    newGuest,
    hasUpcomingStay,
    hasCurrentStay,
    paidCleanly,
    paymentRequiresReview,
    failedPaymentExposure,
    manualSettlementExposure,
    openDisputeExposure,
    repeatedDisputeExposure,
    handoverIssueExposure,
    unresolvedHandoverIssue,
    verificationPending,
    verificationMissing,
    verificationRejected,
    verificationVerified,
    premiumCandidate,
    premiumProfileExists,
    premiumReady,
    requiresOperatorReview,
    guestRiskLevel,
    guestReadinessScore,
    guestValueSignal,
    paymentReliabilitySignal,
    stayExecutionSignal,
    disputeExposureSignal,
    verificationSignal,
    premiumReadinessSignal,
    latestActivityAt,
    latestActivityLabel: dateLabel(latestActivityAt),
    upcomingStayLabel: upcomingReservations[0] ? `${reservationReference(upcomingReservations[0].id)} on ${dateLabel(upcomingReservations[0].startDate)}` : "No upcoming stay",
    currentStayLabel: currentReservations[0] ? `${reservationReference(currentReservations[0].id)} through ${dateLabel(currentReservations[0].endDate)}` : "No current stay",
    blockers,
    reviewTriggers: triggers,
    nextBestActions,
    canCreateVerification,
    createVerificationDisabledReason,
    canCreatePremiumProfile,
    createPremiumProfileDisabledReason,
  };
}
