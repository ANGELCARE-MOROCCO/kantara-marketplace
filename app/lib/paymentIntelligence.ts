export type PaymentAttentionLevel = "none" | "low" | "medium" | "high" | "critical";

export type PaymentProviderReadinessInput = {
  environment: string;
  isConfigured: boolean;
  hasClientId: boolean;
  hasSecret: boolean;
  hasWebhookId: boolean;
  hasPublicClientId: boolean;
  cardFieldsStatus: string;
};

export type PaymentLinkedCounts = {
  events: number;
  disputes: number;
  auditEvents: number;
  reservations: number;
  guests: number;
  properties: number;
  partners: number;
};

export type PaymentNextBestAction = {
  id: string;
  label: string;
  reason: string;
  href?: string;
  disabledReason?: string | null;
  severity: PaymentAttentionLevel;
};

export type PaymentInsightInput = {
  id: string;
  reservationId?: string | null;
  guestId?: string | null;
  propertyId?: string | null;
  partnerId?: string | null;
  amount: number;
  currency: string;
  status: string;
  method: string;
  provider: string;
  providerEnvironment: string;
  providerOrderId?: string | null;
  providerAuthorizationId?: string | null;
  providerCaptureId?: string | null;
  providerStatus?: string | null;
  failureReason?: string | null;
  snapshotJson?: unknown;
  capturedAt?: Date | string | null;
  authorizedAt?: Date | string | null;
  updatedAt: Date | string;
  createdAt: Date | string;
  lastProviderSyncAt?: Date | string | null;
  openDisputeCount: number;
  linkedCounts: PaymentLinkedCounts;
  providerReadiness: PaymentProviderReadinessInput;
  reservation?: {
    id: string;
    totalSnapshot?: number | null;
    currencySnapshot?: string | null;
    bookingStatus?: string | null;
  } | null;
  now?: Date;
};

export type PaymentInsight = {
  providerNotConfigured: boolean;
  missingClientId: boolean;
  missingSecret: boolean;
  webhookMissing: boolean;
  cardFieldsUnavailable: boolean;
  requiresReview: boolean;
  providerStatusUnknown: boolean;
  orderCreatedNotCaptured: boolean;
  authorizedNotCaptured: boolean;
  capturedWithoutReservationLink: boolean;
  failedPayment: boolean;
  staleProviderSync: boolean;
  disputeOpen: boolean;
  manualSettlement: boolean;
  paymentTerminalNoReservationSelected: boolean;
  selectedReservationMissingSnapshot: boolean;
  selectedReservationAlreadyCaptured: boolean;
  manualSettlementMissingReason: boolean;
  unlinkedManualPaymentRequiresReview: boolean;
  reservationPaymentConflict: boolean;
  reservationSnapshotMismatch: boolean;
  environmentMismatch: boolean;
  attentionLevel: PaymentAttentionLevel;
  attentionReasons: string[];
  nextBestActions: PaymentNextBestAction[];
  lifecycleStage: string;
  readinessScore: number;
  linkedCounts: PaymentLinkedCounts;
};

const OPEN_DISPUTE_STATUSES = new Set([
  "open",
  "under_review",
  "awaiting_guest",
  "awaiting_partner",
  "awaiting_admin",
  "reopened",
]);

export function isOpenDisputeStatus(status?: string | null) {
  return OPEN_DISPUTE_STATUSES.has(status ?? "");
}

function asDate(value?: Date | string | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function scoreToLevel(score: number): PaymentAttentionLevel {
  if (score >= 4) return "critical";
  if (score === 3) return "high";
  if (score === 2) return "medium";
  if (score === 1) return "low";
  return "none";
}

function addReason(
  reasons: string[],
  severityScores: number[],
  reason: string,
  severity: PaymentAttentionLevel
) {
  reasons.push(reason);
  severityScores.push(
    severity === "critical" ? 4 : severity === "high" ? 3 : severity === "medium" ? 2 : severity === "low" ? 1 : 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function snapshotNumber(snapshot: unknown, key: string) {
  if (!isRecord(snapshot)) return null;
  const value = snapshot[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function snapshotString(snapshot: unknown, key: string) {
  if (!isRecord(snapshot)) return null;
  const value = snapshot[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function getPaymentActionDisabledReason({
  action,
  payment,
  provider,
}: {
  action:
    | "create_paypal_order"
    | "capture_paypal_order"
    | "authorize_paypal_order"
    | "sync_paypal_order"
    | "mark_requires_review"
    | "cancel_payment"
    | "record_manual_settlement"
    | "create_dispute";
  payment?: {
    status: string;
    provider: string;
    providerOrderId?: string | null;
    providerAuthorizationId?: string | null;
    providerCaptureId?: string | null;
    reservationId?: string | null;
    amount?: number | null;
  } | null;
  provider?: PaymentProviderReadinessInput | null;
}) {
  if (action.startsWith("create_paypal") || action.includes("paypal") || action === "sync_paypal_order") {
    if (!provider?.isConfigured) {
      if (!provider?.hasClientId && !provider?.hasSecret) {
        return "PayPal action disabled: PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are missing.";
      }
      if (!provider?.hasClientId) return "PayPal action disabled: PAYPAL_CLIENT_ID is missing.";
      if (!provider?.hasSecret) return "PayPal action disabled: PAYPAL_CLIENT_SECRET is missing.";
      return "PayPal action disabled: provider is not configured.";
    }
  }

  if (action === "create_paypal_order") {
    if (!payment?.reservationId) return "Create PayPal order is disabled: a linked reservation snapshot is required.";
    if (!payment.amount || payment.amount <= 0) return "Create PayPal order is disabled: payment amount must be positive.";
    if (payment.providerOrderId) return "Create PayPal order is disabled: this payment already has a PayPal order id.";
    if (["captured", "cancelled", "refunded", "partially_refunded"].includes(payment.status)) {
      return "Create PayPal order is disabled: closed payment records cannot create a new provider order.";
    }
  }

  if (action === "capture_paypal_order") {
    if (!payment?.providerOrderId) return "Capture disabled: payment record has no PayPal order id.";
    if (payment.providerCaptureId || payment.status === "captured") return "Capture disabled: payment is already captured.";
    if (payment.status === "cancelled") return "Capture disabled: cancelled payment records cannot be captured.";
  }

  if (action === "authorize_paypal_order") {
    if (!payment?.providerOrderId) return "Authorize disabled: payment record has no PayPal order id.";
    if (payment.providerAuthorizationId || payment.status === "authorized") return "Authorize disabled: authorization is already recorded.";
    if (payment.status === "captured") return "Authorize disabled: captured payments do not need authorization.";
    if (payment.status === "cancelled") return "Authorize disabled: cancelled payment records cannot be authorized.";
  }

  if (action === "sync_paypal_order" && !payment?.providerOrderId) {
    return "Sync disabled: payment record has no PayPal order id.";
  }

  if (action === "mark_requires_review" && payment?.status === "requires_review") {
    return "Review action disabled: payment is already marked requires review.";
  }

  if (action === "cancel_payment") {
    if (!payment) return "Cancel disabled: payment record is required.";
    if (!["draft", "order_created", "pending_approval", "requires_review"].includes(payment.status)) {
      return "Cancel disabled: only draft, order-created, pending approval, or review records can be cancelled safely.";
    }
  }

  return null;
}

export function analyzePayment(input: PaymentInsightInput): PaymentInsight {
  const now = input.now ?? new Date();
  const providerStatus = input.providerStatus?.toUpperCase() ?? "";
  const isPayPal = input.provider === "paypal";
  const manualSettlement = input.provider === "manual" || ["manual", "bank_transfer", "cash_to_host"].includes(input.method);
  const providerNotConfigured = isPayPal && !input.providerReadiness.isConfigured;
  const missingClientId = isPayPal && !input.providerReadiness.hasClientId;
  const missingSecret = isPayPal && !input.providerReadiness.hasSecret;
  const webhookMissing = isPayPal && !input.providerReadiness.hasWebhookId;
  const cardFieldsUnavailable = isPayPal && !input.providerReadiness.hasPublicClientId;
  const requiresReview = input.status === "requires_review";
  const failedPayment = input.status === "failed" || ["FAILED", "DECLINED", "VOIDED", "DENIED"].includes(providerStatus);
  const providerStatusUnknown = isPayPal && Boolean(input.providerOrderId) && !input.providerStatus;
  const orderCreatedNotCaptured = isPayPal && Boolean(input.providerOrderId) && !input.providerCaptureId && ["order_created", "pending_approval"].includes(input.status);
  const authorizedNotCaptured = isPayPal && Boolean(input.providerAuthorizationId || input.status === "authorized") && !input.providerCaptureId;
  const capturedWithoutReservationLink = input.status === "captured" && !input.reservationId;
  const paymentTerminalNoReservationSelected = false;
  const selectedReservationMissingSnapshot = Boolean(input.reservation && (!input.reservation.totalSnapshot || input.reservation.totalSnapshot <= 0));
  const selectedReservationAlreadyCaptured = false;
  const unlinkedManualPaymentRequiresReview = manualSettlement && !input.reservationId && input.status === "requires_review";
  const manualSettlementMissingReason = manualSettlement && input.status === "requires_review" && !input.failureReason && unlinkedManualPaymentRequiresReview;
  const reservationPaymentConflict = Boolean(
    input.reservationId &&
      input.status !== "captured" &&
      input.provider !== "manual" &&
      input.providerCaptureId &&
      input.capturedAt === null
  );
  const disputeOpen = input.openDisputeCount > 0;
  const lastSyncAt = asDate(input.lastProviderSyncAt);
  const staleProviderSync = isPayPal && Boolean(input.providerOrderId) && (!lastSyncAt || now.getTime() - lastSyncAt.getTime() > 24 * 60 * 60 * 1000);
  const environmentMismatch =
    isPayPal &&
    input.providerEnvironment !== "internal" &&
    input.providerReadiness.environment !== "not_configured" &&
    input.providerEnvironment !== input.providerReadiness.environment;
  const snapshotTotal = snapshotNumber(input.snapshotJson, "totalSnapshot");
  const snapshotCurrency = snapshotString(input.snapshotJson, "currencySnapshot");
  const reservationSnapshotMismatch = Boolean(
    input.reservation &&
      ((snapshotTotal !== null &&
        input.reservation.totalSnapshot !== null &&
        input.reservation.totalSnapshot !== undefined &&
        Math.abs(snapshotTotal - input.reservation.totalSnapshot) >= 0.01) ||
        (snapshotCurrency &&
          input.reservation.currencySnapshot &&
          snapshotCurrency !== input.reservation.currencySnapshot))
  );

  const reasons: string[] = [];
  const severityScores: number[] = [];

  if (missingClientId && missingSecret) addReason(reasons, severityScores, "PayPal server credentials are missing.", "critical");
  else {
    if (missingClientId) addReason(reasons, severityScores, "PAYPAL_CLIENT_ID is missing.", "critical");
    if (missingSecret) addReason(reasons, severityScores, "PAYPAL_CLIENT_SECRET is missing.", "critical");
  }
  if (environmentMismatch) addReason(reasons, severityScores, "Payment provider environment differs from current PayPal environment.", "high");
  if (failedPayment) addReason(reasons, severityScores, input.failureReason ?? "Payment is failed or provider declined/voided it.", "high");
  if (requiresReview) addReason(reasons, severityScores, input.failureReason ?? "Payment is marked for operations review.", "high");
  if (disputeOpen) addReason(reasons, severityScores, "Open dispute is linked to this payment.", "high");
  if (reservationSnapshotMismatch) addReason(reasons, severityScores, "Payment snapshot differs from the linked reservation snapshot.", "high");
  if (authorizedNotCaptured) addReason(reasons, severityScores, "PayPal authorization exists but capture is not recorded.", "medium");
  if (orderCreatedNotCaptured) addReason(reasons, severityScores, "PayPal order exists but no capture is recorded.", "medium");
  if (providerStatusUnknown) addReason(reasons, severityScores, "Provider status is unknown for this PayPal order.", "medium");
  if (staleProviderSync) addReason(reasons, severityScores, "Provider status has not been synced in the last 24 hours.", "medium");
  if (capturedWithoutReservationLink) addReason(reasons, severityScores, "Captured payment is not linked to a reservation.", "medium");
  if (selectedReservationMissingSnapshot) addReason(reasons, severityScores, "Linked reservation has no locked price snapshot.", "medium");
  if (reservationPaymentConflict) addReason(reasons, severityScores, "Reservation payment state conflicts with captured provider data.", "medium");
  if (unlinkedManualPaymentRequiresReview) addReason(reasons, severityScores, "Payment record missing reservation link and requires reconciliation.", "medium");
  if (manualSettlementMissingReason) addReason(reasons, severityScores, "Manual settlement requires a documented operational reason.", "medium");
  if (manualSettlement) addReason(reasons, severityScores, "Manual settlement record: this is not a PayPal processor capture.", "low");
  if (webhookMissing) addReason(reasons, severityScores, "PAYPAL_WEBHOOK_ID is not configured; webhook readiness is incomplete.", "low");
  if (cardFieldsUnavailable) addReason(reasons, severityScores, "Public PayPal client id is missing; hosted card fields cannot load.", "low");

  let readinessScore = 100;
  if (providerNotConfigured) readinessScore -= 35;
  if (environmentMismatch) readinessScore -= 24;
  if (failedPayment) readinessScore -= 30;
  if (requiresReview) readinessScore -= 26;
  if (disputeOpen) readinessScore -= 22;
  if (reservationSnapshotMismatch) readinessScore -= 22;
  if (authorizedNotCaptured) readinessScore -= 16;
  if (orderCreatedNotCaptured) readinessScore -= 14;
  if (providerStatusUnknown) readinessScore -= 12;
  if (staleProviderSync) readinessScore -= 10;
  if (capturedWithoutReservationLink) readinessScore -= 12;
  if (selectedReservationMissingSnapshot) readinessScore -= 12;
  if (reservationPaymentConflict) readinessScore -= 14;
  if (unlinkedManualPaymentRequiresReview) readinessScore -= 16;
  if (manualSettlementMissingReason) readinessScore -= 12;
  if (webhookMissing) readinessScore -= 4;
  if (cardFieldsUnavailable) readinessScore -= 4;
  readinessScore = Math.max(0, Math.min(100, readinessScore));

  const nextBestActions: PaymentNextBestAction[] = [];
  if (providerNotConfigured) {
    nextBestActions.push({
      id: "configure_paypal",
      label: "Configure PayPal environment",
      reason: "Provider actions stay disabled until server credentials are present.",
      href: "/admin/settings",
      severity: "critical",
    });
  }
  if (requiresReview || failedPayment) {
    nextBestActions.push({
      id: "review_payment",
      label: "Review failure and linked records",
      reason: input.failureReason ?? "A failed or review payment needs operator decisioning.",
      href: `/admin/payments?paymentId=${input.id}#actions`,
      severity: "high",
    });
  }
  if (staleProviderSync || providerStatusUnknown) {
    nextBestActions.push({
      id: "sync_paypal_order",
      label: "Sync PayPal status",
      reason: "Provider status should be refreshed before manual decisions.",
      href: `/admin/payments?paymentId=${input.id}#actions`,
      disabledReason: getPaymentActionDisabledReason({
        action: "sync_paypal_order",
        payment: input,
        provider: input.providerReadiness,
      }),
      severity: "medium",
    });
  }
  if (authorizedNotCaptured) {
    nextBestActions.push({
      id: "capture_authorization",
      label: "Capture authorized order",
      reason: "Authorization is recorded without a capture id.",
      href: `/admin/payments?paymentId=${input.id}#actions`,
      disabledReason: getPaymentActionDisabledReason({
        action: "capture_paypal_order",
        payment: input,
        provider: input.providerReadiness,
      }),
      severity: "medium",
    });
  }
  if (orderCreatedNotCaptured && !authorizedNotCaptured) {
    nextBestActions.push({
      id: "confirm_approval",
      label: "Confirm approval or sync order",
      reason: "PayPal order exists but no capture is recorded.",
      href: `/admin/payments?paymentId=${input.id}#paypal-order`,
      severity: "medium",
    });
  }
  if (capturedWithoutReservationLink) {
    nextBestActions.push({
      id: "reservation_link",
      label: "Resolve missing reservation link",
      reason: "Captured operational payments should be tied to a reservation when possible.",
      href: "/admin/bookings",
      severity: "medium",
    });
  }
  if (unlinkedManualPaymentRequiresReview) {
    nextBestActions.push({
      id: "reconcile_unlinked_manual_payment",
      label: "Reconcile missing reservation link",
      reason: "Unlinked manual exception records must be tied back to a reservation or reviewed as an exception.",
      href: "/admin/bookings",
      severity: "medium",
    });
  }
  if (disputeOpen) {
    nextBestActions.push({
      id: "open_dispute",
      label: "Open linked dispute",
      reason: "An unresolved dispute is linked to this payment.",
      href: `/admin/payments?paymentId=${input.id}#disputes`,
      severity: "high",
    });
  }
  if (!nextBestActions.length) {
    nextBestActions.push({
      id: "monitor",
      label: input.status === "captured" ? "Monitor settlement history" : "Keep in normal queue",
      reason: "No critical blockers are detected from linked provider and operations data.",
      href: `/admin/payments?paymentId=${input.id}`,
      severity: "none",
    });
  }

  const lifecycleStage = manualSettlement
    ? "manual_settlement"
    : input.status === "captured"
      ? "captured"
      : input.providerCaptureId
        ? "capture_recorded"
        : input.providerAuthorizationId
          ? "authorized_not_captured"
          : input.providerOrderId
            ? "paypal_order_created"
            : input.status;

  return {
    providerNotConfigured,
    missingClientId,
    missingSecret,
    webhookMissing,
    cardFieldsUnavailable,
    requiresReview,
    providerStatusUnknown,
    orderCreatedNotCaptured,
    authorizedNotCaptured,
    capturedWithoutReservationLink,
    failedPayment,
    staleProviderSync,
    disputeOpen,
    manualSettlement,
    paymentTerminalNoReservationSelected,
    selectedReservationMissingSnapshot,
    selectedReservationAlreadyCaptured,
    manualSettlementMissingReason,
    unlinkedManualPaymentRequiresReview,
    reservationPaymentConflict,
    reservationSnapshotMismatch,
    environmentMismatch,
    attentionLevel: scoreToLevel(Math.max(0, ...severityScores)),
    attentionReasons: reasons,
    nextBestActions,
    lifecycleStage,
    readinessScore,
    linkedCounts: input.linkedCounts,
  };
}
