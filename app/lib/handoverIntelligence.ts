import {
  HANDOVER_STATUSES,
  HANDOVER_TYPES,
  type HandoverStatus,
  type HandoverType,
} from "./handoverFilters";

export type HandoverAttentionLevel = "none" | "low" | "medium" | "high" | "critical";

export type HandoverChecklistItem = {
  label: string;
  done: boolean;
};

export type HandoverLinkedPayment = {
  id: string;
  status: string;
  providerStatus?: string | null;
  updatedAt?: Date | string | null;
  createdAt?: Date | string | null;
};

export type HandoverLinkedDispute = {
  id: string;
  status: string;
  priority: string;
  updatedAt?: Date | string | null;
  createdAt?: Date | string | null;
};

export type HandoverLinkedVerification = {
  id: string;
  entityType: string;
  entityId: string;
  category: string;
  status: string;
  updatedAt?: Date | string | null;
  createdAt?: Date | string | null;
};

export type HandoverReservationContext = {
  id: string;
  bookingStatus: string;
  startDate: Date | string;
  endDate: Date | string;
  totalSnapshot?: number | null;
  totalNightsSnapshot?: number | null;
  guestCount?: number | null;
  userId?: string | null;
  homeId?: string | null;
} | null;

export type HandoverPropertyContext = {
  id?: string | null;
  listingStatus?: string | null;
  contentReviewStatus?: string | null;
  price?: number | null;
  imageCount?: number;
} | null;

export type HandoverInsightInput = {
  id: string;
  taskNumber: string;
  type: string;
  status: string;
  priority: string;
  scheduledFor?: Date | string | null;
  completedAt?: Date | string | null;
  reservationId?: string | null;
  propertyId?: string | null;
  guestId?: string | null;
  partnerId?: string | null;
  checklist?: unknown;
  reservation: HandoverReservationContext;
  property?: HandoverPropertyContext;
  payments: HandoverLinkedPayment[];
  disputes: HandoverLinkedDispute[];
  verifications: HandoverLinkedVerification[];
  siblingTasks?: { id: string; type: string; status: string; reservationId?: string | null }[];
  now?: Date;
};

export type HandoverNextBestAction = {
  id: string;
  label: string;
  reason: string;
  href?: string;
  severity: HandoverAttentionLevel;
  disabledReason?: string | null;
};

export type HandoverChecklistProgress = {
  total: number;
  done: number;
  percent: number | null;
};

export type HandoverInsight = {
  upcomingArrival: boolean;
  upcomingCheckout: boolean;
  overdueTask: boolean;
  taskMissingReservation: boolean;
  paymentNotReady: boolean;
  paymentCaptured: boolean;
  disputeOpen: boolean;
  issueReported: boolean;
  checklistIncomplete: boolean;
  partnerNotVerified: boolean;
  propertyNotReady: boolean;
  noCheckInTaskForUpcomingReservation: boolean;
  noCheckoutTaskForUpcomingReservation: boolean;
  cleaningNeededAfterCheckout: boolean;
  maintenanceFollowUpOpen: boolean;
  guestSupportOpen: boolean;
  cancelledReservationTask: boolean;
  highPriorityIssue: boolean;
  readyForArrival: boolean;
  readyForCheckout: boolean;
  readyForCompletion: boolean;
  attentionLevel: HandoverAttentionLevel;
  attentionReasons: string[];
  nextBestActions: HandoverNextBestAction[];
  lifecycleStage: string;
  readinessScore: number;
  linkedCounts: {
    reservations: number;
    payments: number;
    disputes: number;
    verifications: number;
    events: number;
  };
  checklistProgress: HandoverChecklistProgress;
};

const OPEN_DISPUTE_STATUSES = new Set([
  "open",
  "under_review",
  "awaiting_guest",
  "awaiting_partner",
  "awaiting_admin",
  "reopened",
]);
const SETTLED_PAYMENT_STATUSES = new Set(["captured", "authorized"]);
const CAPTURED_PAYMENT_STATUSES = new Set(["captured"]);
const CLOSED_TASK_STATUSES = new Set(["completed", "cancelled"]);
const VERIFIED_STATUSES = new Set(["verified", "approved"]);
const READY_PROPERTY_STATUSES = new Set(["active", "approved", "published", "live"]);
const READY_CONTENT_STATUSES = new Set(["approved", "published", "live"]);

export const HANDOVER_TYPE_LABELS: Record<HandoverType, string> = {
  check_in: "Check-in",
  check_out: "Checkout",
  cleaning: "Cleaning",
  maintenance: "Maintenance",
  key_handover: "Key handover",
  guest_support: "Guest support",
  issue_followup: "Issue follow-up",
};

export const HANDOVER_STATUS_LABELS: Record<HandoverStatus, string> = {
  not_scheduled: "Not scheduled",
  pending_preparation: "Pending preparation",
  ready: "Ready",
  in_progress: "In progress",
  completed: "Completed",
  issue_reported: "Issue reported",
  cancelled: "Cancelled",
};

const TASK_CHECKLISTS: Record<HandoverType, string[]> = {
  check_in: [
    "Property preparation reviewed",
    "Arrival timing confirmed",
    "Guest instructions reviewed",
    "Partner/host readiness confirmed",
    "Payment readiness checked",
    "Issue escalation path clear",
  ],
  key_handover: [
    "Access coordination owner confirmed",
    "Arrival timing confirmed",
    "Guest instructions reviewed",
    "Partner/host readiness confirmed",
    "Payment readiness checked",
    "Issue escalation path clear",
  ],
  cleaning: [
    "Cleaning scheduled",
    "Rooms reset",
    "Bathroom/kitchen check",
    "Linen/towels check",
    "Damage/maintenance scan",
    "Photos/evidence note if safe",
  ],
  maintenance: [
    "Issue identified",
    "Priority set",
    "Partner notified",
    "Resolution tracked",
    "Guest impact assessed",
    "Follow-up required",
  ],
  check_out: [
    "Checkout timing reviewed",
    "Property return confirmed",
    "Cleaning turnover triggered",
    "Damage/issue scan",
    "Deposit/follow-up note if applicable",
  ],
  guest_support: [
    "Guest request classified",
    "Response owner assigned",
    "Property/partner impact checked",
    "Payment or dispute risk checked",
    "Follow-up requirement recorded",
  ],
  issue_followup: [
    "Issue summary reviewed",
    "Priority confirmed",
    "Linked records checked",
    "Dispute escalation decision made",
    "Resolution owner assigned",
    "Follow-up required",
  ],
};

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
  severity: HandoverAttentionLevel
) {
  reasons.push(reason);
  severityScores.push(
    severity === "critical" ? 4 : severity === "high" ? 3 : severity === "medium" ? 2 : severity === "low" ? 1 : 0
  );
}

function scoreToLevel(score: number): HandoverAttentionLevel {
  if (score >= 4) return "critical";
  if (score === 3) return "high";
  if (score === 2) return "medium";
  if (score === 1) return "low";
  return "none";
}

function isKnownType(type: string): type is HandoverType {
  return HANDOVER_TYPES.includes(type as HandoverType);
}

export function getDefaultHandoverChecklist(type: string): HandoverChecklistItem[] {
  const labels = isKnownType(type) ? TASK_CHECKLISTS[type] : TASK_CHECKLISTS.issue_followup;
  return labels.map((label) => ({ label, done: false }));
}

export function normalizeHandoverChecklist(checklist: unknown, type: string): HandoverChecklistItem[] {
  if (!Array.isArray(checklist) || checklist.length === 0) {
    return getDefaultHandoverChecklist(type);
  }

  const parsed = checklist
    .map((item, index) => {
      if (typeof item === "object" && item && "label" in item) {
        const label = String((item as { label?: unknown }).label ?? "").trim();
        if (!label) return null;
        return {
          label: label.slice(0, 160),
          done: Boolean((item as { done?: unknown }).done),
        };
      }
      if (typeof item === "string" && item.trim()) {
        return { label: item.trim().slice(0, 160), done: false };
      }
      return { label: `Checklist item ${index + 1}`, done: false };
    })
    .filter(Boolean) as HandoverChecklistItem[];

  return parsed.length ? parsed.slice(0, 30) : getDefaultHandoverChecklist(type);
}

export function getChecklistProgress(checklist: unknown, type: string): HandoverChecklistProgress {
  const items = normalizeHandoverChecklist(checklist, type);
  const done = items.filter((item) => item.done).length;
  return {
    total: items.length,
    done,
    percent: items.length ? Math.round((done / items.length) * 100) : null,
  };
}

export function getHandoverStatusTransitionDisabledReason(currentStatus: string, nextStatus: string) {
  if (currentStatus === nextStatus) return "Task is already in this status.";
  if (!HANDOVER_STATUSES.includes(nextStatus as HandoverStatus)) return "Unsupported handover status.";
  if (currentStatus === "cancelled") return "Cancelled tasks cannot move directly into another lifecycle state.";
  if (currentStatus === "completed" && nextStatus !== "issue_reported") {
    return "Completed tasks can only be reopened by reporting a new issue.";
  }
  if (nextStatus === "ready" && currentStatus === "not_scheduled") {
    return "Schedule the task or move it to pending preparation before marking ready.";
  }
  if (nextStatus === "completed" && !["ready", "in_progress", "issue_reported"].includes(currentStatus)) {
    return "Only ready, in-progress, or issue-reported tasks can be completed.";
  }
  if (nextStatus === "issue_reported") {
    return "Use the issue reporting action so summary and priority are captured.";
  }
  return null;
}

export function analyzeHandoverTask(input: HandoverInsightInput): HandoverInsight {
  const now = input.now ?? new Date();
  const scheduledFor = asDate(input.scheduledFor);
  const reservationStart = asDate(input.reservation?.startDate);
  const reservationEnd = asDate(input.reservation?.endDate);
  const reservationClosed = ["cancelled", "completed"].includes(input.reservation?.bookingStatus ?? "");
  const activeTask = !CLOSED_TASK_STATUSES.has(input.status);
  const upcomingArrival = Boolean(reservationStart && reservationStart >= now && daysUntil(reservationStart, now) <= 14 && !reservationClosed);
  const upcomingCheckout = Boolean(reservationEnd && reservationEnd >= now && daysUntil(reservationEnd, now) <= 14 && !reservationClosed);
  const overdueTask = Boolean(scheduledFor && scheduledFor < now && activeTask);
  const taskMissingReservation = !input.reservationId;
  const settledPayment = input.payments.some((payment) => SETTLED_PAYMENT_STATUSES.has(payment.status));
  const paymentCaptured = input.payments.some((payment) => CAPTURED_PAYMENT_STATUSES.has(payment.status));
  const payableReservation = Boolean(input.reservation?.totalSnapshot && input.reservation.totalSnapshot > 0);
  const paymentNotReady = Boolean(input.reservationId && payableReservation && !settledPayment && !reservationClosed);
  const disputeOpen = input.disputes.some((dispute) => OPEN_DISPUTE_STATUSES.has(dispute.status));
  const urgentDispute = input.disputes.some((dispute) => OPEN_DISPUTE_STATUSES.has(dispute.status) && dispute.priority === "urgent");
  const issueReported = input.status === "issue_reported";
  const checklistProgress = getChecklistProgress(input.checklist, input.type);
  const checklistIncomplete = Boolean(checklistProgress.total && checklistProgress.percent !== 100);
  const partnerNotVerified = Boolean(
    input.partnerId &&
    !input.verifications.some(
      (record) => record.entityType === "partner" && record.entityId === input.partnerId && VERIFIED_STATUSES.has(record.status)
    )
  );
  const propertyNotReady = Boolean(
    input.propertyId &&
    (
      !READY_PROPERTY_STATUSES.has((input.property?.listingStatus ?? "").toLowerCase()) ||
      !READY_CONTENT_STATUSES.has((input.property?.contentReviewStatus ?? "").toLowerCase()) ||
      !input.property?.price ||
      !input.property?.imageCount
    )
  );
  const siblingTasks = input.siblingTasks ?? [];
  const noCheckInTaskForUpcomingReservation = Boolean(
    input.reservationId &&
    upcomingArrival &&
    !siblingTasks.some((task) => task.reservationId === input.reservationId && task.type === "check_in" && task.status !== "cancelled")
  );
  const noCheckoutTaskForUpcomingReservation = Boolean(
    input.reservationId &&
    upcomingCheckout &&
    !siblingTasks.some((task) => task.reservationId === input.reservationId && task.type === "check_out" && task.status !== "cancelled")
  );
  const cleaningNeededAfterCheckout = Boolean(
    input.reservationId &&
    reservationEnd &&
    reservationEnd <= new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000) &&
    !siblingTasks.some((task) => task.reservationId === input.reservationId && task.type === "cleaning" && task.status !== "cancelled")
  );
  const maintenanceFollowUpOpen = input.type === "maintenance" && activeTask;
  const guestSupportOpen = input.type === "guest_support" && activeTask;
  const cancelledReservationTask = input.reservation?.bookingStatus === "cancelled" && activeTask;
  const highPriorityIssue = issueReported && ["high", "urgent"].includes(input.priority);
  const readyForArrival = Boolean(
    ["check_in", "key_handover"].includes(input.type) &&
    input.status === "ready" &&
    !paymentNotReady &&
    !disputeOpen &&
    !propertyNotReady &&
    !checklistIncomplete
  );
  const readyForCheckout = Boolean(
    input.type === "check_out" &&
    ["ready", "in_progress"].includes(input.status) &&
    !disputeOpen &&
    !issueReported &&
    !checklistIncomplete
  );
  const readyForCompletion = Boolean(
    ["ready", "in_progress"].includes(input.status) &&
    !paymentNotReady &&
    !disputeOpen &&
    !issueReported &&
    !checklistIncomplete
  );

  const reasons: string[] = [];
  const severityScores: number[] = [];

  if (urgentDispute) addReason(reasons, severityScores, "Urgent open dispute is linked to this stay.", "critical");
  if (highPriorityIssue) addReason(reasons, severityScores, "High-priority handover issue is reported.", input.priority === "urgent" ? "critical" : "high");
  if (overdueTask) addReason(reasons, severityScores, "Task is overdue and still active.", input.priority === "urgent" ? "critical" : "high");
  if (paymentNotReady) addReason(reasons, severityScores, "Linked payment is not captured or authorized.", upcomingArrival ? "high" : "medium");
  if (disputeOpen && !urgentDispute) addReason(reasons, severityScores, "Open dispute is linked to this task context.", "high");
  if (cancelledReservationTask) addReason(reasons, severityScores, "Linked reservation is cancelled while task remains active.", "high");
  if (taskMissingReservation) addReason(reasons, severityScores, "Task is missing a linked reservation.", "medium");
  if (checklistIncomplete) addReason(reasons, severityScores, "Checklist is incomplete.", "medium");
  if (propertyNotReady) addReason(reasons, severityScores, "Linked property readiness is incomplete.", "medium");
  if (partnerNotVerified) addReason(reasons, severityScores, "Partner/host verification is not complete.", "medium");
  if (noCheckoutTaskForUpcomingReservation) addReason(reasons, severityScores, "Upcoming checkout has no checkout task.", "medium");
  if (cleaningNeededAfterCheckout) addReason(reasons, severityScores, "Cleaning turnover task is needed after checkout.", "medium");
  if (guestSupportOpen) addReason(reasons, severityScores, "Guest support work is open.", "low");
  if (maintenanceFollowUpOpen) addReason(reasons, severityScores, "Maintenance follow-up is open.", input.priority === "urgent" ? "high" : "medium");

  let readinessScore = 100;
  if (urgentDispute) readinessScore -= 35;
  if (highPriorityIssue) readinessScore -= input.priority === "urgent" ? 30 : 24;
  if (overdueTask) readinessScore -= 22;
  if (paymentNotReady) readinessScore -= upcomingArrival ? 22 : 15;
  if (disputeOpen) readinessScore -= 20;
  if (cancelledReservationTask) readinessScore -= 18;
  if (taskMissingReservation) readinessScore -= 14;
  if (checklistIncomplete) readinessScore -= Math.max(8, 25 - Math.round((checklistProgress.percent ?? 0) / 5));
  if (propertyNotReady) readinessScore -= 12;
  if (partnerNotVerified) readinessScore -= 10;
  if (cleaningNeededAfterCheckout) readinessScore -= 10;
  readinessScore = Math.max(0, Math.min(100, readinessScore));

  const nextBestActions: HandoverNextBestAction[] = [];
  if (issueReported) {
    nextBestActions.push({
      id: "issue",
      label: "Work reported issue",
      reason: "Issue-reported tasks need resolution notes or dispute escalation.",
      href: `/admin/handover?handoverId=${input.id}#issues-disputes`,
      severity: highPriorityIssue ? "high" : "medium",
    });
  }
  if (paymentNotReady) {
    nextBestActions.push({
      id: "payment",
      label: "Review payment readiness",
      reason: "Stay operations should not be marked arrival-ready until payment is captured or authorized.",
      href: input.reservationId ? `/admin/payments?q=${encodeURIComponent(input.reservationId)}` : "/admin/payments",
      severity: upcomingArrival ? "high" : "medium",
    });
  }
  if (overdueTask) {
    nextBestActions.push({
      id: "overdue",
      label: "Reschedule or start task",
      reason: "Scheduled time has passed while the task is still active.",
      href: `/admin/handover?handoverId=${input.id}#actions`,
      severity: "high",
    });
  }
  if (disputeOpen) {
    nextBestActions.push({
      id: "dispute",
      label: "Open linked dispute",
      reason: "A dispute is active against this task context.",
      href: `/admin/handover?handoverId=${input.id}#issues-disputes`,
      severity: urgentDispute ? "critical" : "high",
    });
  }
  if (checklistIncomplete) {
    nextBestActions.push({
      id: "checklist",
      label: "Complete checklist",
      reason: "Task-specific readiness checklist is not complete.",
      href: `/admin/handover?handoverId=${input.id}#checklist`,
      severity: "medium",
    });
  }
  if (propertyNotReady || partnerNotVerified) {
    nextBestActions.push({
      id: "property_partner",
      label: "Review property/partner readiness",
      reason: propertyNotReady ? "Property readiness is incomplete." : "Partner verification is incomplete.",
      href: input.propertyId ? `/admin/property-trust?homeId=${input.propertyId}` : "/admin/partner-operations",
      severity: "medium",
    });
  }
  if (cancelledReservationTask) {
    nextBestActions.push({
      id: "cancel_task",
      label: "Cancel handover task",
      reason: "Linked reservation is cancelled.",
      href: `/admin/handover?handoverId=${input.id}#actions`,
      severity: "high",
    });
  }
  if (!nextBestActions.length) {
    nextBestActions.push({
      id: "normal_queue",
      label: readyForCompletion ? "Complete when field work is confirmed" : "Keep in operations queue",
      reason: "No critical blocker is derived from linked operational records.",
      href: `/admin/handover?handoverId=${input.id}`,
      severity: "none",
    });
  }

  const lifecycleStage =
    input.status === "completed"
      ? "completed"
      : input.status === "cancelled"
        ? "cancelled"
        : issueReported
          ? "issue_followup"
          : input.type === "guest_support"
            ? "in_stay_support"
            : input.type === "cleaning"
              ? "cleaning_turnover"
              : input.type === "maintenance"
                ? "maintenance"
                : input.type === "check_out"
                  ? reservationEnd && reservationEnd < now ? "post_checkout" : "checkout"
                  : upcomingArrival
                    ? "pre_arrival"
                    : HANDOVER_TYPES.includes(input.type as HandoverType)
                      ? input.type
                      : "operations";

  return {
    upcomingArrival,
    upcomingCheckout,
    overdueTask,
    taskMissingReservation,
    paymentNotReady,
    paymentCaptured,
    disputeOpen,
    issueReported,
    checklistIncomplete,
    partnerNotVerified,
    propertyNotReady,
    noCheckInTaskForUpcomingReservation,
    noCheckoutTaskForUpcomingReservation,
    cleaningNeededAfterCheckout,
    maintenanceFollowUpOpen,
    guestSupportOpen,
    cancelledReservationTask,
    highPriorityIssue,
    readyForArrival,
    readyForCheckout,
    readyForCompletion,
    attentionLevel: scoreToLevel(Math.max(0, ...severityScores)),
    attentionReasons: reasons,
    nextBestActions,
    lifecycleStage,
    readinessScore,
    linkedCounts: {
      reservations: input.reservationId ? 1 : 0,
      payments: input.payments.length,
      disputes: input.disputes.length,
      verifications: input.verifications.length,
      events: 0,
    },
    checklistProgress,
  };
}
