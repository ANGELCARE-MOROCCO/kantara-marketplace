import {
  DISPUTE_PRIORITIES,
  DISPUTE_STATUSES,
  DISPUTE_TYPES,
  type DisputePriority,
  type DisputeStatus,
  type DisputeType,
} from "./disputeFilters";

export type DisputeAttentionLevel = "none" | "low" | "medium" | "high" | "critical";

export const DISPUTE_TYPE_LABELS: Record<DisputeType, string> = {
  booking_issue: "Booking issue",
  payment_issue: "Payment issue",
  property_issue: "Property issue",
  guest_issue: "Guest issue",
  partner_issue: "Partner issue",
  handover_issue: "Handover issue",
  verification_issue: "Verification issue",
  other: "Other",
};

export const DISPUTE_STATUS_LABELS: Record<DisputeStatus, string> = {
  open: "Open",
  under_review: "Under review",
  awaiting_guest: "Awaiting guest",
  awaiting_partner: "Awaiting partner",
  awaiting_admin: "Awaiting admin",
  resolved: "Resolved",
  closed: "Closed",
  reopened: "Reopened",
};

export const DISPUTE_OUTCOMES = [
  "guest_supported",
  "partner_action_required",
  "payment_review_required",
  "handover_completed",
  "property_issue_confirmed",
  "no_action_required",
  "duplicate_case",
  "unresolved_closed",
] as const;

export const EVIDENCE_QUALITY_LEVELS = ["weak", "partial", "sufficient", "strong"] as const;

export type DisputeOutcome = (typeof DISPUTE_OUTCOMES)[number];
export type EvidenceQualityLevel = (typeof EVIDENCE_QUALITY_LEVELS)[number];

export type DisputeEvidenceSummary = {
  guestStatementSummary: string | null;
  partnerStatementSummary: string | null;
  internalObservation: string | null;
  operationalEvidenceSummary: string | null;
  supportingReferences: string | null;
  missingEvidence: string | null;
  evidenceQuality: EvidenceQualityLevel;
};

export type DisputeResolutionRecord = {
  outcome: DisputeOutcome | null;
  rationale: string | null;
  internalFinalNote: string | null;
  followUpRequired: boolean;
  resolvedAt?: Date | string | null;
};

export type DisputeLinkedPayment = {
  id: string;
  amount?: number | string | { toString(): string } | null;
  currency?: string | null;
  status: string;
  method?: string | null;
  providerStatus?: string | null;
  providerOrderId?: string | null;
  providerCaptureId?: string | null;
};

export type DisputeLinkedHandover = {
  id: string;
  taskNumber: string;
  type: string;
  status: string;
  priority: string;
  checklist?: unknown;
  summary?: string | null;
};

export type DisputeLinkedVerification = {
  id: string;
  entityType: string;
  entityId: string;
  category: string;
  status: string;
};

export type DisputeInsightInput = {
  id: string;
  caseNumber: string;
  type: string;
  status: string;
  priority: string;
  openedAt: Date | string;
  resolvedAt?: Date | string | null;
  closedAt?: Date | string | null;
  assignedToId?: string | null;
  reservationId?: string | null;
  paymentRecordId?: string | null;
  propertyId?: string | null;
  guestId?: string | null;
  partnerId?: string | null;
  reservation?: {
    id: string;
    bookingStatus: string;
    totalSnapshot?: number | null;
    currencySnapshot?: string | null;
    startDate?: Date | string | null;
    endDate?: Date | string | null;
  } | null;
  payments: DisputeLinkedPayment[];
  handovers: DisputeLinkedHandover[];
  verifications: DisputeLinkedVerification[];
  evidence?: DisputeEvidenceSummary | null;
  resolution?: DisputeResolutionRecord | null;
  latestEventAt?: Date | string | null;
  repeatedCounts?: {
    guest: number;
    property: number;
    partner: number;
  };
  now?: Date;
};

export type DisputeNextBestAction = {
  id: string;
  label: string;
  reason: string;
  href?: string;
  severity: DisputeAttentionLevel;
  disabledReason?: string | null;
};

export type DisputeInsight = {
  caseAge: {
    days: number;
    hours: number;
    label: string;
  };
  urgentCase: boolean;
  highPriorityCase: boolean;
  overdueCase: boolean;
  awaitingGuestTooLong: boolean;
  awaitingPartnerTooLong: boolean;
  awaitingExternalResponse: boolean;
  paymentLinkedDispute: boolean;
  handoverLinkedDispute: boolean;
  missingLinkedSource: boolean;
  paymentRequiresReview: boolean;
  handoverIssueOpen: boolean;
  verificationRecommended: boolean;
  repeatedGuestDisputes: boolean;
  repeatedPropertyDisputes: boolean;
  repeatedPartnerDisputes: boolean;
  financialExposure: {
    amount: number | null;
    currency: string;
    label: string;
  };
  readyForResolution: boolean;
  readyForClosure: boolean;
  staleResolvedCase: boolean;
  reopenedCase: boolean;
  operationalRootArea: string;
  attentionLevel: DisputeAttentionLevel;
  attentionReasons: string[];
  nextBestActions: DisputeNextBestAction[];
  lifecycleStage: string;
  linkedCounts: {
    reservations: number;
    payments: number;
    handovers: number;
    verifications: number;
    relatedCases: number;
  };
  resolutionReadinessScore: number;
};

const OPEN_STATUSES = new Set(["open", "under_review", "awaiting_guest", "awaiting_partner", "awaiting_admin", "reopened"]);
const EXTERNAL_STATUSES = new Set(["awaiting_guest", "awaiting_partner"]);
const PAYMENT_REVIEW_STATUSES = new Set(["failed", "requires_review", "pending_approval"]);
const HANDOEVER_ACTIVE_ISSUE_STATUSES = new Set(["issue_reported", "in_progress", "pending_preparation"]);

function asDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function amountToNumber(value: number | string | { toString(): string } | null | undefined) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
}

function ageFrom(start: Date, now: Date) {
  const diffMs = Math.max(0, now.getTime() - start.getTime());
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  const days = Math.floor(hours / 24);
  return {
    days,
    hours,
    label: days >= 1 ? `${days}d ${hours % 24}h` : `${hours}h`,
  };
}

function addReason(
  reasons: string[],
  severityScores: number[],
  reason: string,
  severity: DisputeAttentionLevel
) {
  reasons.push(reason);
  severityScores.push(
    severity === "critical" ? 4 : severity === "high" ? 3 : severity === "medium" ? 2 : severity === "low" ? 1 : 0
  );
}

function scoreToLevel(score: number): DisputeAttentionLevel {
  if (score >= 4) return "critical";
  if (score === 3) return "high";
  if (score === 2) return "medium";
  if (score === 1) return "low";
  return "none";
}

function formatExposure(amount: number | null, currency: string) {
  if (amount === null) return "Not computable";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function evidenceQualityScore(evidence?: DisputeEvidenceSummary | null) {
  if (!evidence) return 0;
  if (evidence.evidenceQuality === "strong") return 4;
  if (evidence.evidenceQuality === "sufficient") return 3;
  if (evidence.evidenceQuality === "partial") return 2;
  return 1;
}

function determineRootArea(input: DisputeInsightInput) {
  if (input.type === "payment_issue" || input.paymentRecordId || input.payments.length) return "payment";
  if (input.type === "handover_issue" || input.handovers.length) return "handover";
  if (input.type === "property_issue" || input.propertyId) return "property";
  if (input.type === "guest_issue" || input.guestId) return "guest";
  if (input.type === "partner_issue" || input.partnerId) return "partner";
  if (input.type === "verification_issue" || input.verifications.length) return "verification";
  if (input.type === "booking_issue" || input.reservationId) return "booking";
  return "manual_exception";
}

export function isDisputeStatusTransitionAllowed(currentStatus: string, nextStatus: string) {
  if (currentStatus === nextStatus) return "Case is already in this status.";
  if (!DISPUTE_STATUSES.includes(nextStatus as DisputeStatus)) return "Unsupported dispute status.";
  if (currentStatus === "closed" && nextStatus !== "reopened") {
    return "Closed cases must be reopened before other lifecycle actions.";
  }
  if (currentStatus === "resolved" && ["awaiting_guest", "awaiting_partner"].includes(nextStatus)) {
    return "Resolved cases should be reopened before requesting more information.";
  }
  if (nextStatus === "closed" && !["resolved", "reopened", "under_review", "awaiting_admin"].includes(currentStatus)) {
    return "Close requires a resolved case or an explicit close reason from a reviewed state.";
  }
  return null;
}

export function analyzeDisputeCase(input: DisputeInsightInput): DisputeInsight {
  const now = input.now ?? new Date();
  const openedAt = asDate(input.openedAt) ?? now;
  const latestActivity = asDate(input.latestEventAt) ?? openedAt;
  const age = ageFrom(openedAt, now);
  const staleAge = ageFrom(latestActivity, now);
  const isOpen = OPEN_STATUSES.has(input.status);
  const urgentCase = input.priority === "urgent";
  const highPriorityCase = input.priority === "high" || urgentCase;
  const reopenedCase = input.status === "reopened";
  const overdueLimit =
    urgentCase ? 1 :
    input.priority === "high" ? 3 :
    input.priority === "medium" ? 7 :
    14;
  const overdueCase = isOpen && age.days >= overdueLimit;
  const awaitingExternalResponse = EXTERNAL_STATUSES.has(input.status);
  const awaitingGuestTooLong = input.status === "awaiting_guest" && staleAge.days >= 3;
  const awaitingPartnerTooLong = input.status === "awaiting_partner" && staleAge.days >= 3;
  const paymentLinkedDispute = Boolean(input.paymentRecordId || input.type === "payment_issue" || input.payments.length);
  const handoverLinkedDispute = Boolean(input.type === "handover_issue" || input.handovers.length);
  const missingLinkedSource = !input.reservationId && !input.paymentRecordId && !input.propertyId && !input.guestId && !input.partnerId;
  const paymentRequiresReview = input.payments.some((payment) => PAYMENT_REVIEW_STATUSES.has(payment.status));
  const handoverIssueOpen = input.handovers.some((task) =>
    task.status === "issue_reported" ||
    (task.type === "maintenance" && HANDOEVER_ACTIVE_ISSUE_STATUSES.has(task.status))
  );
  const verificationRecommended = Boolean(
    input.type === "verification_issue" ||
    (input.type === "guest_issue" && !input.verifications.some((record) => record.entityType === "guest" && record.status === "verified")) ||
    (input.type === "property_issue" && !input.verifications.some((record) => record.entityType === "property" && record.status === "verified")) ||
    (input.type === "payment_issue" && !input.verifications.some((record) => record.entityType === "payment"))
  );
  const repeatedGuestDisputes = (input.repeatedCounts?.guest ?? 0) >= 2;
  const repeatedPropertyDisputes = (input.repeatedCounts?.property ?? 0) >= 2;
  const repeatedPartnerDisputes = (input.repeatedCounts?.partner ?? 0) >= 2;
  const paymentExposure = input.payments
    .map((payment) => amountToNumber(payment.amount))
    .filter((amount): amount is number => amount !== null)
    .reduce((sum, amount) => sum + amount, 0);
  const reservationExposure = input.reservation?.totalSnapshot ?? null;
  const exposureAmount = paymentExposure > 0 ? paymentExposure : reservationExposure;
  const exposureCurrency = input.payments[0]?.currency ?? input.reservation?.currencySnapshot ?? "USD";
  const evidenceScore = evidenceQualityScore(input.evidence);
  const hasEvidence = evidenceScore >= 2;
  const hasResolution = Boolean(input.resolution?.outcome && input.resolution.rationale);
  const readyForResolution = isOpen && Boolean(input.assignedToId) && hasEvidence && !paymentRequiresReview;
  const readyForClosure = Boolean(hasResolution || input.status === "resolved");
  const resolvedAt = asDate(input.resolvedAt);
  const staleResolvedCase = input.status === "resolved" && Boolean(resolvedAt) && ageFrom(resolvedAt ?? now, now).days >= 3;
  const operationalRootArea = determineRootArea(input);

  const reasons: string[] = [];
  const severityScores: number[] = [];

  if (urgentCase && isOpen) addReason(reasons, severityScores, "Urgent unresolved case requires senior review.", "critical");
  if (reopenedCase) addReason(reasons, severityScores, "Case has been reopened and needs renewed investigation.", "high");
  if (overdueCase) addReason(reasons, severityScores, "Case age exceeds the priority SLA threshold.", highPriorityCase ? "high" : "medium");
  if (awaitingGuestTooLong) addReason(reasons, severityScores, "Guest response has been pending for more than three days.", "medium");
  if (awaitingPartnerTooLong) addReason(reasons, severityScores, "Partner response has been pending for more than three days.", "medium");
  if (paymentRequiresReview) addReason(reasons, severityScores, "Linked payment requires review or failed.", "high");
  if (handoverIssueOpen) addReason(reasons, severityScores, "Linked handover issue remains open.", "high");
  if (missingLinkedSource) addReason(reasons, severityScores, "Case is missing a linked operational source.", "medium");
  if (!input.assignedToId && isOpen) addReason(reasons, severityScores, "Active case is unassigned.", "medium");
  if (!hasEvidence && isOpen) addReason(reasons, severityScores, "Evidence summary is weak or missing.", "medium");
  if (verificationRecommended) addReason(reasons, severityScores, "Verification review is recommended for this case type.", "low");
  if (repeatedGuestDisputes) addReason(reasons, severityScores, "Guest has repeated dispute exposure.", "medium");
  if (repeatedPropertyDisputes) addReason(reasons, severityScores, "Property has repeated dispute exposure.", "medium");
  if (repeatedPartnerDisputes) addReason(reasons, severityScores, "Partner has repeated dispute exposure.", "medium");
  if (staleResolvedCase) addReason(reasons, severityScores, "Resolved case has been waiting for closure.", "low");

  let resolutionReadinessScore = 100;
  if (!input.assignedToId && isOpen) resolutionReadinessScore -= 20;
  if (missingLinkedSource) resolutionReadinessScore -= 18;
  if (!hasEvidence) resolutionReadinessScore -= 25;
  if (paymentRequiresReview) resolutionReadinessScore -= 18;
  if (handoverIssueOpen) resolutionReadinessScore -= 16;
  if (overdueCase) resolutionReadinessScore -= 12;
  if (awaitingGuestTooLong || awaitingPartnerTooLong) resolutionReadinessScore -= 10;
  if (hasResolution) resolutionReadinessScore += 10;
  resolutionReadinessScore = Math.max(0, Math.min(100, resolutionReadinessScore));

  const nextBestActions: DisputeNextBestAction[] = [];
  if (!input.assignedToId && isOpen) {
    nextBestActions.push({
      id: "assign",
      label: "Assign owner",
      reason: "An active dispute needs clear resolution authority.",
      href: `/admin/disputes?disputeId=${input.id}#actions`,
      severity: "medium",
    });
  }
  if (paymentRequiresReview) {
    nextBestActions.push({
      id: "payment_review",
      label: "Review linked payment",
      reason: "Payment state is blocking dispute resolution.",
      href: input.paymentRecordId ? `/admin/payments?paymentId=${input.paymentRecordId}` : "/admin/payments",
      severity: "high",
    });
  }
  if (handoverIssueOpen) {
    nextBestActions.push({
      id: "handover_review",
      label: "Review handover escalation",
      reason: "Linked handover work still has an operational issue.",
      href: input.handovers[0] ? `/admin/handover?handoverId=${input.handovers[0].id}` : "/admin/handover",
      severity: "high",
    });
  }
  if (!hasEvidence && isOpen) {
    nextBestActions.push({
      id: "evidence",
      label: "Update evidence summary",
      reason: "Resolution requires a safe evidence summary and quality level.",
      href: `/admin/disputes?disputeId=${input.id}#evidence-summary`,
      severity: "medium",
    });
  }
  if (awaitingGuestTooLong) {
    nextBestActions.push({
      id: "guest_followup",
      label: "Request guest follow-up",
      reason: "Guest response is stale.",
      href: `/admin/disputes?disputeId=${input.id}#actions`,
      severity: "medium",
    });
  }
  if (awaitingPartnerTooLong) {
    nextBestActions.push({
      id: "partner_followup",
      label: "Request partner follow-up",
      reason: "Partner response is stale.",
      href: `/admin/disputes?disputeId=${input.id}#actions`,
      severity: "medium",
    });
  }
  if (readyForResolution) {
    nextBestActions.push({
      id: "resolve",
      label: "Prepare structured resolution",
      reason: "Assignment and evidence are sufficient for resolution review.",
      href: `/admin/disputes?disputeId=${input.id}#resolution-workspace`,
      severity: "low",
    });
  }
  if (staleResolvedCase) {
    nextBestActions.push({
      id: "close",
      label: "Close resolved case",
      reason: "Resolved case has aged past closure review threshold.",
      href: `/admin/disputes?disputeId=${input.id}#resolution-workspace`,
      severity: "low",
    });
  }
  if (!nextBestActions.length) {
    nextBestActions.push({
      id: "monitor",
      label: input.status === "closed" ? "Audit closed case" : "Continue investigation",
      reason: "No higher-priority deterministic blocker is active.",
      href: `/admin/disputes?disputeId=${input.id}`,
      severity: "none",
    });
  }

  return {
    caseAge: age,
    urgentCase,
    highPriorityCase,
    overdueCase,
    awaitingGuestTooLong,
    awaitingPartnerTooLong,
    awaitingExternalResponse,
    paymentLinkedDispute,
    handoverLinkedDispute,
    missingLinkedSource,
    paymentRequiresReview,
    handoverIssueOpen,
    verificationRecommended,
    repeatedGuestDisputes,
    repeatedPropertyDisputes,
    repeatedPartnerDisputes,
    financialExposure: {
      amount: exposureAmount,
      currency: exposureCurrency,
      label: formatExposure(exposureAmount, exposureCurrency),
    },
    readyForResolution,
    readyForClosure,
    staleResolvedCase,
    reopenedCase,
    operationalRootArea,
    attentionLevel: scoreToLevel(Math.max(0, ...severityScores)),
    attentionReasons: reasons,
    nextBestActions,
    lifecycleStage: input.status === "closed"
      ? "closure"
      : input.status === "resolved"
        ? "resolution"
        : input.status.startsWith("awaiting_")
          ? "investigation"
          : input.status === "open"
            ? "intake"
            : input.status === "reopened"
              ? "reopened_investigation"
              : "triage",
    linkedCounts: {
      reservations: input.reservationId ? 1 : 0,
      payments: input.payments.length,
      handovers: input.handovers.length,
      verifications: input.verifications.length,
      relatedCases: (input.repeatedCounts?.guest ?? 0) + (input.repeatedCounts?.property ?? 0) + (input.repeatedCounts?.partner ?? 0),
    },
    resolutionReadinessScore,
  };
}

export function normalizeEvidenceQuality(value?: string | null): EvidenceQualityLevel {
  return EVIDENCE_QUALITY_LEVELS.includes(value as EvidenceQualityLevel)
    ? value as EvidenceQualityLevel
    : "weak";
}

export function normalizeDisputeOutcome(value?: string | null): DisputeOutcome | null {
  return DISPUTE_OUTCOMES.includes(value as DisputeOutcome) ? value as DisputeOutcome : null;
}

export function disputeTypeLabel(type: string) {
  return DISPUTE_TYPE_LABELS[type as DisputeType] ?? type.replaceAll("_", " ");
}

export function disputeStatusLabel(status: string) {
  return DISPUTE_STATUS_LABELS[status as DisputeStatus] ?? status.replaceAll("_", " ");
}

export function isKnownDisputePriority(priority: string | null | undefined): priority is DisputePriority {
  return DISPUTE_PRIORITIES.includes(priority as DisputePriority);
}
