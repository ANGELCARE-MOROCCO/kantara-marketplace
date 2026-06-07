import { calculatePartnerReadinessScore, getMinimumSubmissionIssues, type PartnerApplicationReadinessInput } from "@/app/lib/partner";

export type PartnerOperationalSignals = {
  lifecycleState: string;
  readinessScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  decisionRequired: boolean;
  recommendedDecision: string;
  decisionReasons: string[];
  blockers: { title: string; detail: string; severity: "critical" | "high" | "medium" | "low"; href?: string }[];
  nextBestActions: string[];
  marketplaceReady: boolean;
  supplyPotential: string;
  supplyHealth: {
    onboarding: number | null;
    verification: number | null;
    portfolio: number | null;
    listingQuality: number | null;
    operationalReliability: number | null;
    marketplaceReadiness: number | null;
  };
};

type PartnerApplicationLike = PartnerApplicationReadinessInput & {
  status?: string | null;
  internalRiskLevel?: string | null;
  submittedAt?: Date | string | null;
  updatedAt?: Date | string | null;
};

type PartnerContext = {
  propertiesCount: number;
  liveListingsCount: number;
  pendingListingsCount: number;
  blockedListingsCount: number;
  missingPricingCount: number;
  missingMediaCount: number;
  missingContentCount: number;
  missingLocationCount: number;
  verifiedRecordsCount: number;
  pendingVerificationCount: number;
  rejectedVerificationCount: number;
  openDisputesCount: number;
  highUrgentDisputesCount: number;
  handoverIssuesCount: number;
  unresolvedHandoversCount: number;
  paymentReviewCount: number;
  manualSettlementCount: number;
  reservationExposureCount: number;
};

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function safeDateAgeDays(value?: Date | string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
}

export function mapPartnerLifecycleState(application: PartnerApplicationLike, context: PartnerContext) {
  const status = application.status ?? "draft";
  if (status === "approved" && context.liveListingsCount > 0) return "active_supply";
  if (status === "approved" && context.propertiesCount > 0) return "marketplace_ready";
  if (status === "approved") return "approved_no_supply";
  if (status === "under_review" && context.pendingVerificationCount > 0) return "verification_required";
  if (status === "under_review" && context.propertiesCount > 0) return "supply_preparation";
  if (status === "submitted") return "qualification_review";
  if (status === "needs_information") return "needs_information";
  if (status === "suspended") return "suspended";
  if (status === "rejected") return "rejected";
  if (status === "draft") return "lead_draft";
  return status;
}

export function getLifecycleLabel(state: string) {
  const labels: Record<string, string> = {
    lead_draft: "Lead / draft",
    qualification_review: "Qualification review",
    needs_information: "Needs information",
    verification_required: "Verification required",
    supply_preparation: "Supply preparation",
    marketplace_ready: "Marketplace ready",
    approved_no_supply: "Approved / no supply",
    active_supply: "Active supply",
    quality_watch: "Quality watch",
    suspended: "Suspended",
    rejected: "Rejected",
  };
  return labels[state] ?? state.replaceAll("_", " ");
}

export function evaluatePartnerOperations(application: PartnerApplicationLike, context: PartnerContext): PartnerOperationalSignals {
  const readinessScore = calculatePartnerReadinessScore(application);
  const lifecycleState = mapPartnerLifecycleState(application, context);
  const submissionIssues = getMinimumSubmissionIssues(application);
  const applicationAge = safeDateAgeDays(application.submittedAt ?? application.updatedAt);
  const blockers: PartnerOperationalSignals["blockers"] = [];
  const nextBestActions: string[] = [];

  if (submissionIssues.length) {
    blockers.push({
      title: "Application essentials incomplete",
      detail: submissionIssues.slice(0, 4).join(", "),
      severity: "high",
    });
  }
  if (application.status === "submitted" && (applicationAge ?? 0) >= 7) {
    blockers.push({ title: "Stale application review", detail: `${applicationAge} days without final decision.`, severity: "medium" });
  }
  if (context.propertiesCount === 0) {
    blockers.push({ title: "No submitted supply", detail: "Partner has no linked property records yet.", severity: application.status === "approved" ? "high" : "medium" });
  }
  if (context.missingPricingCount > 0) {
    blockers.push({ title: "Pricing gate blocked", detail: `${context.missingPricingCount} properties are missing usable pricing.`, severity: "high", href: "/admin/property-trust?issue=missing_price" });
  }
  if (context.missingMediaCount > 0) {
    blockers.push({ title: "Media gate blocked", detail: `${context.missingMediaCount} properties have no approved images.`, severity: "high", href: "/admin/property-trust?issue=missing_images" });
  }
  if (context.missingContentCount > 0) {
    blockers.push({ title: "Content approval gate blocked", detail: `${context.missingContentCount} listings need approved public content.`, severity: "medium", href: "/admin/property-trust" });
  }
  if (context.verifiedRecordsCount === 0) {
    blockers.push({ title: "Verification missing", detail: "No verified partner authorization/compliance record exists.", severity: "medium", href: "/admin/verifications?entityType=partner" });
  }
  if (context.rejectedVerificationCount > 0) {
    blockers.push({ title: "Rejected verification", detail: "At least one partner verification was rejected.", severity: "critical", href: "/admin/verifications?status=rejected" });
  }
  if (context.highUrgentDisputesCount > 0) {
    blockers.push({ title: "High severity dispute exposure", detail: `${context.highUrgentDisputesCount} high/urgent disputes are linked to this partner.`, severity: "critical", href: "/admin/disputes?priority=urgent" });
  }
  if (context.handoverIssuesCount > 0) {
    blockers.push({ title: "Handover reliability concern", detail: `${context.handoverIssuesCount} handover tasks reported issues.`, severity: "high", href: "/admin/handover?status=issue_reported" });
  }
  if (context.paymentReviewCount > 0) {
    blockers.push({ title: "Payment review exposure", detail: `${context.paymentReviewCount} linked payment records require review.`, severity: "medium", href: "/admin/payments?status=requires_review" });
  }

  const verificationScore = context.verifiedRecordsCount > 0 ? 100 : context.pendingVerificationCount > 0 ? 55 : null;
  const portfolioScore = context.propertiesCount === 0 ? null : clamp(100 - context.blockedListingsCount * 18 - context.missingPricingCount * 14 - context.missingMediaCount * 14 - context.missingContentCount * 10);
  const listingQualityScore = context.propertiesCount === 0 ? null : clamp(100 - context.missingPricingCount * 20 - context.missingMediaCount * 20 - context.missingContentCount * 15 - context.missingLocationCount * 10);
  const reliabilityScore = context.reservationExposureCount === 0 ? null : clamp(100 - context.openDisputesCount * 18 - context.handoverIssuesCount * 18 - context.paymentReviewCount * 12);
  const marketplaceReadiness = clamp(Math.round((readinessScore + (verificationScore ?? 45) + (portfolioScore ?? 35) + (listingQualityScore ?? 35) + (reliabilityScore ?? 60)) / 5));

  const riskLevel: PartnerOperationalSignals["riskLevel"] = blockers.some((item) => item.severity === "critical")
    ? "critical"
    : blockers.filter((item) => item.severity === "high").length >= 2
      ? "high"
      : blockers.some((item) => item.severity === "high" || item.severity === "medium")
        ? "medium"
        : "low";

  const marketplaceReady = application.status === "approved" && context.liveListingsCount > 0 && blockers.filter((item) => ["critical", "high"].includes(item.severity)).length === 0;
  const supplyPotential = context.propertiesCount >= 8 || (application.currentPortfolioSize ?? application.estimatedPropertyCount ?? 0) >= 8
    ? "High portfolio potential"
    : context.propertiesCount > 0 || (application.estimatedPropertyCount ?? 0) > 0
      ? "Emerging supply potential"
      : "Supply not visible yet";

  if (application.status === "submitted") nextBestActions.push("Move application into qualification review.");
  if (submissionIssues.length) nextBestActions.push("Request missing qualification information.");
  if (context.verifiedRecordsCount === 0) nextBestActions.push("Create partner verification record.");
  if (context.missingPricingCount || context.missingMediaCount || context.missingContentCount) nextBestActions.push("Send blocked listings to property trust review.");
  if (context.highUrgentDisputesCount) nextBestActions.push("Resolve high-severity partner incidents before approval or growth.");
  if (marketplaceReady) nextBestActions.push("Maintain active supply and monitor reliability.");
  if (!nextBestActions.length) nextBestActions.push("Continue monitoring partner readiness and supply quality.");

  const recommendedDecision = blockers.some((item) => item.severity === "critical")
    ? "Do not approve — investigate critical blocker"
    : application.status === "submitted"
      ? "Start qualification review"
      : submissionIssues.length
        ? "Request information"
        : context.verifiedRecordsCount === 0
          ? "Move to verification required"
          : context.propertiesCount === 0
            ? "Request supply submission"
            : context.missingPricingCount || context.missingMediaCount || context.missingContentCount
              ? "Request supply fixes"
              : application.status !== "approved"
                ? "Eligible for approval review"
                : marketplaceReady
                  ? "Active supply — monitor quality"
                  : "Approved — resolve remaining supply gaps";

  return {
    lifecycleState,
    readinessScore,
    riskLevel,
    decisionRequired: blockers.length > 0 || ["submitted", "under_review", "needs_information"].includes(application.status ?? ""),
    recommendedDecision,
    decisionReasons: blockers.map((item) => item.title),
    blockers,
    nextBestActions,
    marketplaceReady,
    supplyPotential,
    supplyHealth: {
      onboarding: readinessScore,
      verification: verificationScore,
      portfolio: portfolioScore,
      listingQuality: listingQualityScore,
      operationalReliability: reliabilityScore,
      marketplaceReadiness,
    },
  };
}
