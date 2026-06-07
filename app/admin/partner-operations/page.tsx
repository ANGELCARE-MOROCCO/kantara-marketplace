import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import type { Prisma } from "@prisma/client";
import {
  AlertTriangle,
  BadgeCheck,
  Briefcase,
  Building2,
  ClipboardCheck,
  CreditCard,
  FileWarning,
  Home,
  KeyRound,
  Layers3,
  MapPin,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";

import { ActionPanel } from "@/app/components/admin/ActionPanel";
import { EmptyState } from "@/app/components/admin/EmptyState";
import { FilterBar } from "@/app/components/admin/FilterBar";
import { IntelligencePanel } from "@/app/components/admin/IntelligencePanel";
import { KpiCard } from "@/app/components/admin/KpiCard";
import { LinkedRecordCard } from "@/app/components/admin/LinkedRecordCard";
import { ModuleShell } from "@/app/components/admin/ModuleShell";
import { ReadinessMeter } from "@/app/components/admin/ReadinessMeter";
import { StatusBadge } from "@/app/components/admin/StatusBadge";
import { Timeline } from "@/app/components/admin/Timeline";
import { WorkflowBoard } from "@/app/components/admin/WorkflowBoard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { requireAdmin } from "@/app/lib/auth";
import prisma from "@/app/lib/db";
import {
  APPLICANT_TYPES,
  MOROCCO_CITIES,
  PARTNER_APPLICATION_STATUSES,
  PARTNER_RISK_LEVELS,
  calculatePartnerReadinessScore,
  formatApplicantType,
  formatPartnerStatus,
  formatRiskLevel,
  getMinimumSubmissionIssues,
} from "@/app/lib/partner";
import {
  evaluatePartnerOperations,
  getLifecycleLabel,
  mapPartnerLifecycleState,
  type PartnerOperationalSignals,
} from "@/app/lib/partnerIntelligence";
import { PARTNER_DECISION_FILTERS, PARTNER_LIFECYCLE_FILTERS, normalizePartnerSearchParam } from "@/app/lib/partnerFilters";
import { formatCurrencyAmount, formatDateTime } from "@/app/lib/marketplaceStatus";
import {
  approvePartnerApplication,
  markPartnerApplicationUnderReview,
  rejectPartnerApplication,
  requestPartnerApplicationInformation,
  suspendPartnerApplication,
} from "@/app/partner/actions";
import { createDisputeCaseAction } from "../disputes/actions";
import { createVerificationRecordAction } from "../verifications/actions";

type SearchParams = {
  q?: string | string[];
  status?: string | string[];
  city?: string | string[];
  applicantType?: string | string[];
  lifecycle?: string | string[];
  decision?: string | string[];
  applicationId?: string | string[];
  notice?: string | string[];
  error?: string | string[];
  updated?: string | string[];
};

const PIPELINE_STATES = [
  "qualification_review",
  "needs_information",
  "verification_required",
  "supply_preparation",
  "marketplace_ready",
  "active_supply",
  "quality_watch",
  "suspended",
  "rejected",
];

function readParam(searchParams: SearchParams | undefined, key: keyof SearchParams) {
  return normalizePartnerSearchParam(searchParams?.[key]);
}

function buildWhere(searchParams?: SearchParams): Prisma.PartnerApplicationWhereInput {
  const status = readParam(searchParams, "status");
  const city = readParam(searchParams, "city");
  const applicantType = readParam(searchParams, "applicantType");
  const q = readParam(searchParams, "q")?.trim();
  const and: Prisma.PartnerApplicationWhereInput[] = [];

  if (status && PARTNER_APPLICATION_STATUSES.includes(status as any)) and.push({ status });
  if (city && MOROCCO_CITIES.includes(city as any)) {
    and.push({
      OR: [
        { city: { contains: city, mode: "insensitive" } },
        { operatingCities: { has: city } },
      ],
    });
  }
  if (applicantType && APPLICANT_TYPES.some((item) => item.value === applicantType)) and.push({ applicantType });
  if (q) {
    and.push({
      OR: [
        { legalName: { contains: q, mode: "insensitive" } },
        { displayName: { contains: q, mode: "insensitive" } },
        { primaryContactName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { companyName: { contains: q, mode: "insensitive" } },
        { user: { email: { contains: q, mode: "insensitive" } } },
      ],
    });
  }
  return and.length ? { AND: and } : {};
}

function uniqueById<T extends { id: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

async function getPartnerOperationsData(searchParams?: SearchParams) {
  noStore();
  const where = buildWhere(searchParams);

  const [applications, groupedStatuses] = await Promise.all([
    prisma.partnerApplication.findMany({
      where,
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true, role: true } },
        reviewedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
      orderBy: [{ submittedAt: "desc" }, { updatedAt: "desc" }],
      take: 500,
    }),
    prisma.partnerApplication.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const userIds = applications.map((application) => application.userId);
  const properties = userIds.length
    ? await prisma.home.findMany({
        where: { userId: { in: userIds } },
        select: {
          id: true,
          userId: true,
          listingStatus: true,
          contentReviewStatus: true,
          title: true,
          approvedTitle: true,
          approvedDescription: true,
          approvedNeighborhood: true,
          propertyType: true,
          stayType: true,
          city: true,
          neighborhood: true,
          price: true,
          latitude: true,
          longitude: true,
          archivedAt: true,
          deletedAt: true,
          approvedAt: true,
          createdAT: true,
          _count: { select: { images: true, features: true, Reservation: true } },
        },
      })
    : [];

  const propertyIds = properties.map((property) => property.id);
  const reservations = propertyIds.length
    ? await prisma.reservation.findMany({
        where: { homeId: { in: propertyIds } },
        orderBy: { createdAt: "desc" },
        take: 1000,
        select: {
          id: true,
          homeId: true,
          userId: true,
          bookingStatus: true,
          startDate: true,
          endDate: true,
          totalSnapshot: true,
          currencySnapshot: true,
          listingTitleSnapshot: true,
          listingCitySnapshot: true,
          createdAt: true,
        },
      })
    : [];
  const reservationIds = reservations.map((reservation) => reservation.id);

  const [payments, handovers, verifications, directDisputes, auditEvents] = await Promise.all([
    userIds.length || propertyIds.length || reservationIds.length
      ? prisma.paymentRecord.findMany({
          where: {
            OR: [
              { partnerId: { in: userIds } },
              { propertyId: { in: propertyIds } },
              { reservationId: { in: reservationIds } },
            ],
          },
          orderBy: { createdAt: "desc" },
          take: 1000,
          select: {
            id: true,
            partnerId: true,
            propertyId: true,
            reservationId: true,
            guestId: true,
            amount: true,
            currency: true,
            status: true,
            method: true,
            provider: true,
            providerStatus: true,
            providerOrderId: true,
            createdAt: true,
          },
        })
      : [],
    userIds.length || propertyIds.length || reservationIds.length
      ? prisma.handoverTask.findMany({
          where: {
            OR: [
              { partnerId: { in: userIds } },
              { propertyId: { in: propertyIds } },
              { reservationId: { in: reservationIds } },
            ],
          },
          orderBy: { updatedAt: "desc" },
          take: 1000,
          select: {
            id: true,
            partnerId: true,
            propertyId: true,
            reservationId: true,
            guestId: true,
            taskNumber: true,
            status: true,
            priority: true,
            type: true,
            title: true,
            scheduledFor: true,
            updatedAt: true,
          },
        })
      : [],
    userIds.length || propertyIds.length
      ? prisma.verificationRecord.findMany({
          where: {
            OR: [
              { entityType: "partner", entityId: { in: userIds } },
              { entityType: "partner", entityId: { in: applications.map((application) => application.id) } },
              { entityType: "property", entityId: { in: propertyIds } },
            ],
          },
          orderBy: { updatedAt: "desc" },
          take: 1000,
          select: { id: true, entityType: true, entityId: true, status: true, category: true, title: true, summary: true, evidenceSummary: true, reviewedAt: true, updatedAt: true },
        })
      : [],
    userIds.length || propertyIds.length || reservationIds.length
      ? prisma.disputeCase.findMany({
          where: {
            OR: [
              { partnerId: { in: userIds } },
              { propertyId: { in: propertyIds } },
              { reservationId: { in: reservationIds } },
            ],
          },
          orderBy: { createdAt: "desc" },
          take: 1000,
          select: { id: true, partnerId: true, propertyId: true, reservationId: true, paymentRecordId: true, caseNumber: true, status: true, priority: true, type: true, title: true, createdAt: true, resolvedAt: true, closedAt: true },
        })
      : [],
    applications.length
      ? prisma.adminAuditEvent.findMany({
          where: { targetType: "PartnerApplication", targetId: { in: applications.map((application) => application.id) } },
          orderBy: { createdAt: "desc" },
          take: 160,
        })
      : [],
  ]);

  const paymentIds = payments.map((payment) => payment.id);
  const paymentDisputes = paymentIds.length
    ? await prisma.disputeCase.findMany({
        where: { paymentRecordId: { in: paymentIds } },
        orderBy: { createdAt: "desc" },
        take: 500,
        select: { id: true, partnerId: true, propertyId: true, reservationId: true, paymentRecordId: true, caseNumber: true, status: true, priority: true, type: true, title: true, createdAt: true, resolvedAt: true, closedAt: true },
      })
    : [];
  const disputes = uniqueById([...directDisputes, ...paymentDisputes]);

  const propertiesByPartnerId = new Map<string, typeof properties>();
  for (const property of properties) {
    if (!property.userId) continue;
    propertiesByPartnerId.set(property.userId, [...(propertiesByPartnerId.get(property.userId) ?? []), property]);
  }
  const reservationsByHomeId = new Map<string, typeof reservations>();
  for (const reservation of reservations) {
    if (!reservation.homeId) continue;
    reservationsByHomeId.set(reservation.homeId, [...(reservationsByHomeId.get(reservation.homeId) ?? []), reservation]);
  }

  function relatedForPartner<T extends { partnerId?: string | null; propertyId?: string | null; reservationId?: string | null; paymentRecordId?: string | null }>(partnerId: string, partnerProperties: typeof properties, items: T[]) {
    const partnerPropertyIds = new Set(partnerProperties.map((property) => property.id));
    const partnerReservationIds = new Set(partnerProperties.flatMap((property) => (reservationsByHomeId.get(property.id) ?? []).map((reservation) => reservation.id)));
    const partnerPaymentIds = new Set(payments.filter((payment) => payment.partnerId === partnerId || (payment.propertyId && partnerPropertyIds.has(payment.propertyId)) || (payment.reservationId && partnerReservationIds.has(payment.reservationId))).map((payment) => payment.id));
    return uniqueById(items.filter((item) => item.partnerId === partnerId || (item.propertyId && partnerPropertyIds.has(item.propertyId)) || (item.reservationId && partnerReservationIds.has(item.reservationId)) || (item.paymentRecordId && partnerPaymentIds.has(item.paymentRecordId))) as any);
  }

  const partnerRows = applications.map((application) => {
    const partnerProperties = propertiesByPartnerId.get(application.userId) ?? [];
    const partnerReservations = partnerProperties.flatMap((property) => reservationsByHomeId.get(property.id) ?? []);
    const partnerPayments = relatedForPartner(application.userId, partnerProperties, payments);
    const partnerHandovers = relatedForPartner(application.userId, partnerProperties, handovers);
    const partnerDisputes = relatedForPartner(application.userId, partnerProperties, disputes);
    const partnerVerifications = verifications.filter((record) => record.entityId === application.userId || record.entityId === application.id || partnerProperties.some((property) => property.id === record.entityId));
    const missingPricingCount = partnerProperties.filter((property) => !property.price || property.price <= 0).length;
    const missingMediaCount = partnerProperties.filter((property) => property._count.images === 0).length;
    const missingContentCount = partnerProperties.filter((property) => !property.approvedTitle || !property.approvedDescription || !["approved", "published", "live"].includes(property.contentReviewStatus)).length;
    const missingLocationCount = partnerProperties.filter((property) => !property.city || property.latitude === null || property.longitude === null).length;
    const liveListingsCount = partnerProperties.filter((property) => ["approved", "public", "live", "published"].includes(property.listingStatus) || ["approved", "published"].includes(property.contentReviewStatus)).length;
    const pendingListingsCount = partnerProperties.filter((property) => ["pending_review", "submitted", "under_review"].includes(property.contentReviewStatus)).length;
    const blockedListingsCount = partnerProperties.filter((property) => !property.price || property._count.images === 0 || !property.approvedTitle || !property.city).length;
    const context = {
      propertiesCount: partnerProperties.length,
      liveListingsCount,
      pendingListingsCount,
      blockedListingsCount,
      missingPricingCount,
      missingMediaCount,
      missingContentCount,
      missingLocationCount,
      verifiedRecordsCount: partnerVerifications.filter((record) => record.status === "verified").length,
      pendingVerificationCount: partnerVerifications.filter((record) => ["pending", "under_review", "needs_information"].includes(record.status)).length,
      rejectedVerificationCount: partnerVerifications.filter((record) => record.status === "rejected").length,
      openDisputesCount: partnerDisputes.filter((caseItem: any) => !["resolved", "closed"].includes(caseItem.status)).length,
      highUrgentDisputesCount: partnerDisputes.filter((caseItem: any) => !["resolved", "closed"].includes(caseItem.status) && ["high", "urgent"].includes(caseItem.priority)).length,
      handoverIssuesCount: partnerHandovers.filter((task: any) => task.status === "issue_reported").length,
      unresolvedHandoversCount: partnerHandovers.filter((task: any) => !["completed", "cancelled"].includes(task.status)).length,
      paymentReviewCount: partnerPayments.filter((payment: any) => ["requires_review", "failed"].includes(payment.status)).length,
      manualSettlementCount: partnerPayments.filter((payment: any) => ["manual", "bank_transfer", "cash_to_host"].includes(payment.method)).length,
      reservationExposureCount: partnerReservations.length,
    };
    const signals = evaluatePartnerOperations(application, context);
    return { application, properties: partnerProperties, reservations: partnerReservations, payments: partnerPayments, handovers: partnerHandovers, disputes: partnerDisputes, verifications: partnerVerifications, context, signals };
  });

  const lifecycleFilter = readParam(searchParams, "lifecycle");
  const decisionFilter = readParam(searchParams, "decision");
  const filteredRows = partnerRows.filter((row) => {
    if (lifecycleFilter && row.signals.lifecycleState !== lifecycleFilter) return false;
    if (decisionFilter === "requires_decision" && !row.signals.decisionRequired) return false;
    if (decisionFilter === "blocked_supply" && row.context.blockedListingsCount === 0) return false;
    if (decisionFilter === "verification_gap" && row.context.verifiedRecordsCount > 0) return false;
    if (decisionFilter === "incident_exposure" && row.context.openDisputesCount + row.context.handoverIssuesCount === 0) return false;
    if (decisionFilter === "marketplace_ready" && !row.signals.marketplaceReady) return false;
    if (decisionFilter === "no_supply" && row.context.propertiesCount > 0) return false;
    return true;
  });

  const countByStatus = groupedStatuses.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = item._count._all;
    return acc;
  }, {});

  return { rows: filteredRows, allRows: partnerRows, countByStatus, auditEvents };
}

type PartnerData = Awaited<ReturnType<typeof getPartnerOperationsData>>;
type PartnerRow = PartnerData["rows"][number];
type PartnerApplication = PartnerRow["application"];

function applicationName(application: PartnerApplication) {
  return application.displayName || application.legalName || application.companyName || application.primaryContactName || `${application.user.firstName ?? ""} ${application.user.lastName ?? ""}`.trim() || application.user.email;
}

function toneForRisk(risk: PartnerOperationalSignals["riskLevel"]): "default" | "success" | "warning" | "danger" | "info" {
  if (risk === "critical" || risk === "high") return "danger";
  if (risk === "medium") return "warning";
  return "success";
}

function statusTone(score: number | null): "default" | "success" | "warning" | "danger" | "info" {
  if (score === null) return "info";
  if (score >= 80) return "success";
  if (score >= 55) return "warning";
  return "danger";
}

function actionDisabledReason(row: PartnerRow, action: string) {
  const current = row.application.status;
  if (action === "under_review" && current === "under_review") return "Application is already under review.";
  if (action === "approved" && current === "approved") return "Partner is already approved.";
  if (action === "rejected" && current === "rejected") return "Application is already rejected.";
  if (action === "suspended" && current === "suspended") return "Application is already suspended.";
  if (action === "approved") {
    const critical = row.signals.blockers.find((blocker) => blocker.severity === "critical");
    const submissionIssues = getMinimumSubmissionIssues(row.application);
    if (critical) return `Approval blocked: ${critical.title}.`;
    if (submissionIssues.length) return `Approval blocked: missing ${submissionIssues.slice(0, 2).join(", ")}.`;
    if (row.context.verifiedRecordsCount === 0) return "Approval blocked: partner verification is missing.";
  }
  return null;
}

export default async function PartnerOperationsPage({ searchParams }: { searchParams?: SearchParams }) {
  await requireAdmin();
  const data = await getPartnerOperationsData(searchParams);
  const selectedId = readParam(searchParams, "applicationId");
  const selected = selectedId ? data.allRows.find((row) => row.application.id === selectedId) ?? null : null;
  const notice = readParam(searchParams, "notice") ?? (readParam(searchParams, "updated") ? `Partner decision recorded: ${readParam(searchParams, "updated")}` : null);
  const decisionQueue = data.allRows.filter((row) => row.signals.decisionRequired).sort((a, b) => {
    const severity = { critical: 4, high: 3, medium: 2, low: 1 } as Record<string, number>;
    return (severity[b.signals.riskLevel] ?? 0) - (severity[a.signals.riskLevel] ?? 0);
  });
  const activeReviews = data.allRows.filter((row) => ["submitted", "under_review", "needs_information"].includes(row.application.status));
  const marketplaceReady = data.allRows.filter((row) => row.signals.marketplaceReady);
  const riskPartners = data.allRows.filter((row) => ["critical", "high"].includes(row.signals.riskLevel));
  const average = (values: (number | null | undefined)[]) => {
    const usable = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    return usable.length ? Math.round(usable.reduce((sum, value) => sum + value, 0) / usable.length) : null;
  };

  return (
    <ModuleShell
      title="Partner Operations Command"
      eyebrow="Supply Control Tower"
      description="Supply lifecycle, qualification gates, property readiness, verification, incident exposure, and approval discipline for Kantara marketplace partners."
      moduleStatus={decisionQueue.length ? "requires_review" : "operational"}
      statusLabel={`${decisionQueue.length} decisions required`}
      layout="split"
      notice={notice}
      error={readParam(searchParams, "error")}
      intelligence={
        <IntelligencePanel
          title="Executive supply intelligence"
          readiness={[
            { label: "Onboarding completeness", score: average(data.allRows.map((row) => row.signals.supplyHealth.onboarding)), detail: "Application and operating agreement readiness." },
            { label: "Verification coverage", score: average(data.allRows.map((row) => row.signals.supplyHealth.verification)), detail: "Partner/property verification coverage." },
            { label: "Portfolio readiness", score: average(data.allRows.map((row) => row.signals.supplyHealth.portfolio)), detail: "Supply completeness, pricing, media, and blockers." },
            { label: "Marketplace readiness", score: average(data.allRows.map((row) => row.signals.supplyHealth.marketplaceReadiness)), detail: "Composite readiness across supply gates." },
          ]}
          blockers={decisionQueue.slice(0, 7).map((row) => ({
            id: row.application.id,
            title: applicationName(row.application),
            description: row.signals.decisionReasons[0] ?? row.signals.recommendedDecision,
            severity: row.signals.riskLevel === "critical" ? "critical" : row.signals.riskLevel === "high" ? "high" : "medium",
            href: `/admin/partner-operations?applicationId=${row.application.id}`,
            actionLabel: row.signals.recommendedDecision,
          }))}
          suggestions={[
            {
              id: "ready_supply",
              title: `${marketplaceReady.length} marketplace-ready partners`,
              description: "Approved supply with no critical readiness blockers.",
              severity: marketplaceReady.length ? "low" : "info",
              href: "/admin/partner-operations?decision=marketplace_ready",
              actionLabel: "Review ready supply",
            },
            {
              id: "risk_supply",
              title: `${riskPartners.length} high-risk partners`,
              description: "Partners with critical disputes, verification gaps, or blocked supply quality gates.",
              severity: riskPartners.length ? "high" : "low",
              href: "/admin/partner-operations?decision=incident_exposure",
              actionLabel: "Open risk queue",
            },
          ]}
        />
      }
    >
      <div className="space-y-6">
        <section className="grid gap-4 md:grid-cols-4 xl:grid-cols-8">
          <KpiCard label="Partners" value={data.allRows.length} detail="Applications/accounts in scope" />
          <KpiCard label="Pending qualification" value={(data.countByStatus.submitted ?? 0) + (data.countByStatus.under_review ?? 0)} tone="warning" />
          <KpiCard label="Needs information" value={data.countByStatus.needs_information ?? 0} tone="warning" />
          <KpiCard label="Approved" value={data.countByStatus.approved ?? 0} tone="success" />
          <KpiCard label="Marketplace ready" value={marketplaceReady.length} tone="success" />
          <KpiCard label="Blocked inventory" value={data.allRows.reduce((sum, row) => sum + row.context.blockedListingsCount, 0)} tone="danger" />
          <KpiCard label="Open incidents" value={data.allRows.reduce((sum, row) => sum + row.context.openDisputesCount, 0)} tone="danger" />
          <KpiCard label="Verification gaps" value={data.allRows.filter((row) => row.context.verifiedRecordsCount === 0).length} tone="warning" />
        </section>

        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Decisions Required</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-950">Supply operator review queue</h2>
              <p className="mt-1 max-w-3xl text-sm text-slate-600">Partners enter this queue only when real qualification, supply, verification, incident, or marketplace-readiness signals require a decision.</p>
            </div>
            <StatusBadge status={decisionQueue.length ? "requires_review" : "operational"} label={`${decisionQueue.length} queued`} />
          </div>
          <div className="mt-5 grid gap-3 xl:grid-cols-2">
            {decisionQueue.slice(0, 8).map((row) => (
              <Link key={row.application.id} href={`/admin/partner-operations?applicationId=${row.application.id}`} className="group rounded-lg border bg-slate-50/70 p-4 transition hover:border-slate-400 hover:bg-white hover:shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-slate-950">{applicationName(row.application)}</p>
                      <StatusBadge status={row.signals.riskLevel} label={row.signals.riskLevel.toUpperCase()} />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{formatApplicantType(row.application.applicantType)} · {getLifecycleLabel(row.signals.lifecycleState)}</p>
                  </div>
                  <span className="text-xs font-semibold text-slate-500">{row.context.propertiesCount} supply</span>
                </div>
                <p className="mt-3 text-sm text-slate-700">{row.signals.decisionReasons[0] ?? row.signals.recommendedDecision}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                  <span>{row.signals.recommendedDecision}</span>
                  <span>·</span>
                  <span>{row.context.blockedListingsCount} blocked listings</span>
                  <span>·</span>
                  <span>{row.context.openDisputesCount} open incidents</span>
                </div>
              </Link>
            ))}
            {decisionQueue.length === 0 ? (
              <div className="rounded-lg border border-dashed p-5 text-sm text-slate-600 xl:col-span-2">No partner decisions are currently required from live records.</div>
            ) : null}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-5">
          <HealthTile label="Onboarding" score={average(data.allRows.map((row) => row.signals.supplyHealth.onboarding))} detail="Identity, contact, capacity, and agreements" />
          <HealthTile label="Verification" score={average(data.allRows.map((row) => row.signals.supplyHealth.verification))} detail="Partner/property trust coverage" />
          <HealthTile label="Portfolio" score={average(data.allRows.map((row) => row.signals.supplyHealth.portfolio))} detail="Supply presence and blockers" />
          <HealthTile label="Reliability" score={average(data.allRows.map((row) => row.signals.supplyHealth.operationalReliability))} detail="Disputes, handover, payment exposure" />
          <HealthTile label="Marketplace" score={average(data.allRows.map((row) => row.signals.supplyHealth.marketplaceReadiness))} detail="Composite supply readiness" />
        </section>

        <section className="rounded-xl border bg-white p-4 shadow-sm">
          <FilterBar
            action="/admin/partner-operations"
            query={readParam(searchParams, "q")}
            queryPlaceholder="Search partner, company, contact, email"
            selects={[
              { name: "status", label: "Application status", value: readParam(searchParams, "status"), options: [{ value: "", label: "Any status" }, ...PARTNER_APPLICATION_STATUSES.map((status) => ({ value: status, label: formatPartnerStatus(status) }))] },
              { name: "lifecycle", label: "Lifecycle", value: readParam(searchParams, "lifecycle"), options: [...PARTNER_LIFECYCLE_FILTERS] },
              { name: "decision", label: "Decision state", value: readParam(searchParams, "decision"), options: [...PARTNER_DECISION_FILTERS] },
              { name: "city", label: "City", value: readParam(searchParams, "city"), options: [{ value: "", label: "Any city" }, ...MOROCCO_CITIES.map((city) => ({ value: city, label: city }))] },
              { name: "applicantType", label: "Applicant type", value: readParam(searchParams, "applicantType"), options: [{ value: "", label: "Any type" }, ...APPLICANT_TYPES.map((type) => ({ value: type.value, label: type.label }))] },
            ]}
          />
        </section>

        <WorkflowBoard
          columns={PIPELINE_STATES.map((state) => ({
            id: state,
            title: getLifecycleLabel(state),
            status: state,
            records: data.rows.filter((row) => row.signals.lifecycleState === state),
            empty: `No partners in ${getLifecycleLabel(state).toLowerCase()}.`,
          }))}
          hrefForRecord={(row) => `/admin/partner-operations?applicationId=${row.application.id}`}
          renderCard={(row) => (
            <div className="rounded-lg border bg-white p-3 transition group-hover:border-slate-400">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{applicationName(row.application)}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatApplicantType(row.application.applicantType)}</p>
                </div>
                <StatusBadge status={row.signals.riskLevel} label={row.signals.riskLevel} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs text-slate-600">
                <span className="rounded-md bg-slate-50 p-2">{row.context.propertiesCount} supply</span>
                <span className="rounded-md bg-slate-50 p-2">{row.context.blockedListingsCount} blocked</span>
                <span className="rounded-md bg-slate-50 p-2">{row.signals.supplyHealth.marketplaceReadiness}% ready</span>
              </div>
            </div>
          )}
        />

        <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
          <div className="border-b p-4">
            <h2 className="text-lg font-semibold text-slate-950">Partner operations table</h2>
            <p className="mt-1 text-sm text-slate-600">Dense supply review table for qualification, approval, blockers, and incident exposure.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1320px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Partner</th>
                  <th className="px-4 py-3">Lifecycle</th>
                  <th className="px-4 py-3">Supply</th>
                  <th className="px-4 py-3">Quality gates</th>
                  <th className="px-4 py-3">Verification</th>
                  <th className="px-4 py-3">Incidents</th>
                  <th className="px-4 py-3">Readiness</th>
                  <th className="px-4 py-3">Next decision</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.rows.map((row) => (
                  <tr key={row.application.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-4 align-top">
                      <Link href={`/admin/partner-operations?applicationId=${row.application.id}`} className="font-semibold text-slate-950 hover:underline">{applicationName(row.application)}</Link>
                      <p className="mt-1 text-xs text-slate-500">{row.application.email || row.application.user.email}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatApplicantType(row.application.applicantType)} · {row.application.city ?? "No city"}</p>
                    </td>
                    <td className="px-4 py-4 align-top"><StatusBadge status={row.signals.lifecycleState} label={getLifecycleLabel(row.signals.lifecycleState)} /></td>
                    <td className="px-4 py-4 align-top text-xs text-slate-600">{row.context.propertiesCount} properties<br />{row.context.liveListingsCount} live · {row.context.pendingListingsCount} pending</td>
                    <td className="px-4 py-4 align-top text-xs text-slate-600">{row.context.missingPricingCount} missing pricing<br />{row.context.missingMediaCount} missing media · {row.context.missingContentCount} content gaps</td>
                    <td className="px-4 py-4 align-top"><StatusBadge status={row.context.verifiedRecordsCount ? "verified" : row.context.pendingVerificationCount ? "pending" : "missing"} label={row.context.verifiedRecordsCount ? "Verified" : row.context.pendingVerificationCount ? "Pending" : "Missing"} /></td>
                    <td className="px-4 py-4 align-top text-xs text-slate-600">{row.context.openDisputesCount} open disputes<br />{row.context.handoverIssuesCount} handover issues</td>
                    <td className="px-4 py-4 align-top"><ReadinessMeter label="" score={row.signals.supplyHealth.marketplaceReadiness} size="compact" /></td>
                    <td className="px-4 py-4 align-top text-xs text-slate-700">{row.signals.recommendedDecision}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {data.rows.length === 0 ? (
          <EmptyState
            title="No partner records match this control view"
            description="Partner applications appear here from real onboarding records. No fake supply accounts are created."
            why="The current filters returned no PartnerApplication rows."
            createsRecords="Partner records are created by the partner application/onboarding flow."
            checklist={["Clear filters.", "Review public partner onboarding flow.", "Use Property Trust for listing-level readiness."]}
            links={[{ href: "/admin/property-trust", label: "Open property trust" }]}
          />
        ) : null}

        {selected ? <PartnerWorkspace row={selected} auditEvents={data.auditEvents.filter((event) => event.targetId === selected.application.id)} /> : null}
      </div>
    </ModuleShell>
  );
}

function HealthTile({ label, score, detail }: { label: string; score: number | null; detail: string }) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-lg border bg-slate-50 p-2"><TrendingUp className="h-4 w-4 text-slate-600" /></div>
        <div className="min-w-0 flex-1">
          <ReadinessMeter label={label} score={score} detail={detail} size="compact" />
        </div>
      </div>
    </div>
  );
}

function PartnerWorkspace({ row, auditEvents }: { row: PartnerRow; auditEvents: PartnerData["auditEvents"] }) {
  const application = row.application;
  const blockers = row.signals.blockers;
  const verificationVerified = row.context.verifiedRecordsCount > 0;
  const approvalBlocked = !verificationVerified || blockers.some((blocker) => blocker.severity === "critical") || getMinimumSubmissionIssues(application).length > 0;
  const tabs = [
    { id: "dossier", label: "Executive Dossier", content: <ExecutiveDossier row={row} /> },
    { id: "qualification", label: "Application & Qualification", content: <ApplicationQualification row={row} /> },
    { id: "portfolio", label: "Supply Portfolio", badge: row.properties.length, content: <SupplyPortfolio row={row} /> },
    { id: "quality", label: "Listing Quality Gates", content: <QualityGates row={row} /> },
    { id: "verification", label: "Verification & Compliance", badge: row.verifications.length, content: <VerificationPanel row={row} /> },
    { id: "demand", label: "Reservations & Demand", badge: row.reservations.length, content: <DemandPanel row={row} /> },
    { id: "handover", label: "Handover Reliability", badge: row.handovers.length, content: <HandoverPanel row={row} /> },
    { id: "incidents", label: "Disputes & Incidents", badge: row.disputes.length, content: <IncidentPanel row={row} /> },
    { id: "payments", label: "Payment / Settlement Exposure", badge: row.payments.length, content: <PaymentPanel row={row} /> },
    { id: "timeline", label: "Timeline", badge: auditEvents.length, content: <Timeline items={auditEvents.map((event) => ({ id: event.id, type: event.action, summary: event.summary, createdAt: event.createdAt, actor: event.actorId, payloadPreview: event.metadata ? JSON.stringify(event.metadata, null, 2) : null }))} /> },
    { id: "decision", label: "Decision Center", content: <DecisionCenter row={row} approvalBlocked={approvalBlocked} /> },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-sm">
      <Link href="/admin/partner-operations" className="absolute inset-0 cursor-default" aria-label="Close partner workspace" />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-[1180px] flex-col overflow-hidden border-l bg-slate-50 shadow-2xl xl:max-w-[1280px]">
        <div className="border-b bg-white px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-white">Supply dossier</span>
                <StatusBadge status={row.signals.lifecycleState} label={getLifecycleLabel(row.signals.lifecycleState)} />
                <StatusBadge status={row.signals.riskLevel} label={`${formatRiskLevel(row.signals.riskLevel)} risk`} />
                <StatusBadge status={approvalBlocked ? "blocked" : "ready"} label={approvalBlocked ? "Approval gated" : "Decision ready"} />
              </div>
              <h2 className="mt-3 truncate text-2xl font-semibold text-slate-950">{applicationName(application)}</h2>
              <p className="mt-1 text-sm text-slate-600">{formatApplicantType(application.applicantType)} · {application.email || application.user.email} · Submitted {formatDateTime(application.submittedAt, "not submitted")}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/admin/property-trust?q=${encodeURIComponent(applicationName(application))}`} className="rounded-md border bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400">Property trust</Link>
              <Link href="/admin/partner-operations" className="rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800">Close workspace</Link>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-5">
            <Metric label="Supply" value={`${row.context.propertiesCount} properties`} />
            <Metric label="Live / blocked" value={`${row.context.liveListingsCount} live · ${row.context.blockedListingsCount} blocked`} />
            <Metric label="Verification" value={row.context.verifiedRecordsCount ? "Verified coverage" : row.context.pendingVerificationCount ? "Pending review" : "Missing"} />
            <Metric label="Incidents" value={`${row.context.openDisputesCount} open · ${row.context.handoverIssuesCount} handover`} />
            <Metric label="Decision" value={row.signals.recommendedDecision} />
          </div>
        </div>
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <nav className="hidden w-64 shrink-0 overflow-y-auto border-r bg-white p-4 xl:block">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Workspace sections</p>
            <div className="space-y-1">
              {tabs.map((tab) => (
                <a key={tab.id} href={`#partner-${tab.id}`} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && tab.badge !== null ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{tab.badge}</span> : null}
                </a>
              ))}
            </div>
          </nav>
          <main className="min-w-0 flex-1 overflow-y-auto p-5 md:p-6">
            <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-5">
                {tabs.map((tab) => (
                  <section key={tab.id} id={`partner-${tab.id}`} className="scroll-mt-5 rounded-xl border bg-white p-5 shadow-sm">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-3">
                      <h3 className="text-base font-semibold text-slate-950">{tab.label}</h3>
                      {tab.badge !== undefined && tab.badge !== null ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{tab.badge}</span> : null}
                    </div>
                    {tab.content}
                  </section>
                ))}
              </div>
              <aside className="space-y-4 2xl:sticky 2xl:top-0 2xl:self-start">
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Decision cockpit</p>
                  <ReadinessMeter label="Marketplace readiness" score={row.signals.supplyHealth.marketplaceReadiness} detail={row.signals.marketplaceReady ? "Partner can be monitored as active supply." : "Approval is gated by supply/control blockers."} />
                  <div className="mt-4 space-y-2">
                    {row.signals.blockers.slice(0, 5).map((blocker) => (
                      <div key={blocker.title} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                        <p className="font-semibold">{blocker.title}</p>
                        <p className="mt-1 text-xs">{blocker.detail}</p>
                      </div>
                    ))}
                    {!row.signals.blockers.length ? <QueueEmpty label="No approval blockers are detected from current records." /> : null}
                  </div>
                </div>
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Recommended next action</p>
                  <p className="mt-2 text-lg font-semibold text-slate-950">{row.signals.recommendedDecision}</p>
                  <p className="mt-1 text-sm text-slate-600">{row.signals.decisionReasons[0] ?? "Use the decision center after reviewing supply gates and incident exposure."}</p>
                </div>
              </aside>
            </div>
          </main>
        </div>
      </aside>
    </div>
  );
}

function ExecutiveDossier({ row }: { row: PartnerRow }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Lifecycle state" value={getLifecycleLabel(row.signals.lifecycleState)} />
        <Metric label="Recommended decision" value={row.signals.recommendedDecision} />
        <Metric label="Supply potential" value={row.signals.supplyPotential} />
        <Metric label="Risk level" value={row.signals.riskLevel.toUpperCase()} />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <ReadinessMeter label="Partner readiness" score={row.signals.readinessScore} detail="Application and operating model completeness" />
        <ReadinessMeter label="Portfolio quality" score={row.signals.supplyHealth.portfolio} detail={`${row.context.propertiesCount} properties · ${row.context.blockedListingsCount} blocked`} />
        <ReadinessMeter label="Marketplace readiness" score={row.signals.supplyHealth.marketplaceReadiness} detail={row.signals.marketplaceReady ? "Ready for active supply monitoring" : "Blocked or foundation state"} />
      </div>
      <div className="grid gap-3">
        {row.signals.blockers.length ? row.signals.blockers.map((blocker) => (
          <LinkedRecordCard key={blocker.title} type="Decision blocker" title={blocker.title} subtitle={blocker.detail} status={blocker.severity} href={blocker.href} Icon={AlertTriangle} />
        )) : <QueueEmpty label="No critical partner blockers detected from current records." />}
      </div>
    </div>
  );
}

function ApplicationQualification({ row }: { row: PartnerRow }) {
  const issues = getMinimumSubmissionIssues(row.application);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Metric label="Status" value={formatPartnerStatus(row.application.status)} />
        <Metric label="Applicant type" value={formatApplicantType(row.application.applicantType)} />
        <Metric label="Readiness" value={`${calculatePartnerReadinessScore(row.application)}/100`} />
        <Metric label="Company" value={row.application.companyName ?? "Not provided"} />
        <Metric label="Primary city" value={row.application.city ?? "Not provided"} />
        <Metric label="Operating cities" value={row.application.operatingCities?.length ? row.application.operatingCities.join(", ") : "Not provided"} />
      </div>
      <GateList title="Qualification gates" gates={[
        ["Applicant identity", !issues.some((issue) => issue.includes("Legal name")), "Legal/contact identity available"],
        ["Contact channel", Boolean(row.application.phone || row.application.whatsapp || row.application.email), "Phone, WhatsApp, or email available"],
        ["Supply estimate", Boolean(row.application.estimatedPropertyCount), "Estimated property count supplied"],
        ["Marketplace agreements", row.application.acceptsPlatformRules && row.application.acceptsManagedCommunication && row.application.acceptsHandoverPolicy && row.application.acceptsCommissionModel, "Kantara managed marketplace agreements accepted"],
        ["Operations capacity", Boolean(row.application.operationalCapacity && row.application.cleaningProcess && row.application.maintenanceProcess), "Operating, cleaning, and maintenance capacity described"],
      ]} />
      {issues.length ? <QueueEmpty label={`Missing required inputs: ${issues.join(", ")}`} /> : null}
    </div>
  );
}

function SupplyPortfolio({ row }: { row: PartnerRow }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {row.properties.length ? row.properties.map((property: any) => (
        <LinkedRecordCard key={property.id} type="Supply record" title={property.approvedTitle ?? property.title ?? property.id} subtitle={`${property.city ?? "No city"} · ${property.propertyType ?? "No type"}`} status={property.contentReviewStatus} href={`/admin/property-trust?homeId=${property.id}`} Icon={Home} meta={`${property._count.images} images · ${property.price ? `${property.price} nightly` : "missing pricing"} · ${property._count.Reservation} reservations`} />
      )) : <QueueEmpty label="No supply submitted yet. Request property submission before treating this partner as active supply." />}
    </div>
  );
}

function QualityGates({ row }: { row: PartnerRow }) {
  return (
    <div className="space-y-3">
      {row.properties.length ? row.properties.map((property: any) => (
        <div key={property.id} className="rounded-lg border bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold">{property.approvedTitle ?? property.title ?? property.id}</h3>
              <p className="mt-1 text-sm text-slate-500">{property.city ?? "No city"} · {property.propertyType ?? "No type"}</p>
            </div>
            <StatusBadge status={property.contentReviewStatus} />
          </div>
          <GateList title="Listing quality gates" gates={[
            ["Pricing complete", Boolean(property.price && property.price > 0), "Usable nightly price exists"],
            ["Media complete", property._count.images > 0, `${property._count.images} images linked`],
            ["Approved content", Boolean(property.approvedTitle && property.approvedDescription), "Approved public title and description"],
            ["Location complete", Boolean(property.city && property.latitude !== null && property.longitude !== null), "City and map coordinates available"],
            ["Features available", property._count.features > 0, `${property._count.features} feature/rule records`],
          ]} />
        </div>
      )) : <QueueEmpty label="No property quality gates are available because the partner has not submitted supply." />}
    </div>
  );
}

function VerificationPanel({ row }: { row: PartnerRow }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        {row.verifications.length ? row.verifications.map((verification: any) => (
          <LinkedRecordCard key={verification.id} type={verification.entityType === "property" ? "Property verification" : "Partner verification"} title={verification.title} subtitle={`${verification.category.replaceAll("_", " ")} · ${verification.summary ?? "No summary"}`} status={verification.status} href={`/admin/verifications?verificationId=${verification.id}`} Icon={BadgeCheck} />
        )) : <QueueEmpty label="No verification record yet. Partner approval should be backed by authorization/compliance review where applicable." />}
      </div>
      <form action={createVerificationRecordAction} className="grid gap-3 rounded-lg border bg-slate-50/60 p-4 md:grid-cols-2">
        <input type="hidden" name="entityType" value="partner" />
        <input type="hidden" name="entityId" value={row.application.userId} />
        <input type="hidden" name="category" value="authorization" />
        <input type="hidden" name="title" value={`Partner authorization review for ${applicationName(row.application)}`} />
        <Textarea name="summary" rows={2} placeholder="Authorization/compliance summary" />
        <Textarea name="evidenceSummary" rows={2} placeholder="Evidence summary only. Do not store raw ID/passport/legal numbers." />
        <Button type="submit" variant="outline" className="md:col-span-2">Create partner verification</Button>
      </form>
    </div>
  );
}

function DemandPanel({ row }: { row: PartnerRow }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {row.reservations.length ? row.reservations.slice(0, 30).map((reservation) => (
        <LinkedRecordCard key={reservation.id} type="Reservation" title={reservation.listingTitleSnapshot ?? reservation.id} subtitle={`${formatDateTime(reservation.startDate)} → ${formatDateTime(reservation.endDate)} · ${reservation.listingCitySnapshot ?? "No city"}`} status={reservation.bookingStatus} href={`/admin/bookings?bookingId=${reservation.id}`} Icon={Briefcase} meta={reservation.totalSnapshot ? formatCurrencyAmount(String(reservation.totalSnapshot), reservation.currencySnapshot) : "No locked total"} />
      )) : <QueueEmpty label="No demand exposure yet. Reservations will appear after guests book partner supply." />}
    </div>
  );
}

function HandoverPanel({ row }: { row: PartnerRow }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {row.handovers.length ? row.handovers.map((task: any) => (
        <LinkedRecordCard key={task.id} type="Handover" title={`${task.taskNumber}: ${task.title}`} subtitle={`${task.type.replaceAll("_", " ")} · ${formatDateTime(task.scheduledFor, "unscheduled")}`} status={task.status} href={`/admin/handover?handoverId=${task.id}`} Icon={KeyRound} />
      )) : <QueueEmpty label="No handover history yet. This is a foundation state until bookings generate field operations tasks." />}
    </div>
  );
}

function IncidentPanel({ row }: { row: PartnerRow }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        {row.disputes.length ? row.disputes.map((dispute: any) => (
          <LinkedRecordCard key={dispute.id} type="Incident" title={`${dispute.caseNumber}: ${dispute.title}`} subtitle={`${dispute.type.replaceAll("_", " ")} · ${dispute.priority}`} status={dispute.status} href={`/admin/disputes?disputeId=${dispute.id}`} Icon={ShieldAlert} />
        )) : <QueueEmpty label="No dispute exposure recorded for this partner." />}
      </div>
      <form action={createDisputeCaseAction} className="grid gap-3 rounded-lg border bg-slate-50/60 p-4 md:grid-cols-2">
        <input type="hidden" name="returnTo" value={`/admin/partner-operations?applicationId=${row.application.id}`} />
        <input type="hidden" name="partnerId" value={row.application.userId} />
        <input type="hidden" name="type" value="partner_issue" />
        <select name="priority" defaultValue="medium" className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select>
        <Input name="title" placeholder="Partner incident title" />
        <Textarea name="summary" rows={2} placeholder="Operational case summary" className="md:col-span-2" />
        <Button type="submit" variant="outline" className="md:col-span-2">Create partner-linked dispute</Button>
      </form>
    </div>
  );
}

function PaymentPanel({ row }: { row: PartnerRow }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {row.payments.length ? row.payments.map((payment: any) => (
        <LinkedRecordCard key={payment.id} type="Payment" title={formatCurrencyAmount(payment.amount.toString(), payment.currency)} subtitle={`${payment.method} · ${payment.providerOrderId ?? "no provider order"}`} status={payment.status} href={`/admin/payments?paymentId=${payment.id}`} Icon={CreditCard} meta={payment.providerStatus ?? undefined} />
      )) : <QueueEmpty label="No payment or settlement exposure is linked to this partner yet. No payout logic is assumed." />}
    </div>
  );
}

function DecisionCenter({ row, approvalBlocked }: { row: PartnerRow; approvalBlocked: boolean }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-slate-50/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">Recommended decision</h3>
            <p className="mt-1 text-sm text-slate-600">{row.signals.recommendedDecision}</p>
          </div>
          <StatusBadge status={approvalBlocked ? "blocked" : "ready"} label={approvalBlocked ? "Approval blocked" : "Decision ready"} />
        </div>
        {row.signals.blockers.length ? <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">{row.signals.blockers.map((blocker) => <li key={blocker.title}>{blocker.title}: {blocker.detail}</li>)}</ul> : null}
      </div>
      <ActionPanel title="Decision center" description="Decisions validate current status, show blockers, require reasons where appropriate, update the partner lifecycle, and write audit events.">
        <PartnerActionForm action={markPartnerApplicationUnderReview} applicationId={row.application.id} currentRiskLevel={row.application.internalRiskLevel} returnTo={`/admin/partner-operations?applicationId=${row.application.id}`} buttonLabel="Move to qualification review" disabledReason={actionDisabledReason(row, "under_review")} />
        <PartnerActionForm action={requestPartnerApplicationInformation} applicationId={row.application.id} currentRiskLevel={row.application.internalRiskLevel} returnTo={`/admin/partner-operations?applicationId=${row.application.id}`} reasonName="needsInformationReason" reasonPlaceholder="Specific information or supply fixes required" buttonLabel="Request information / supply fixes" />
        <PartnerActionForm action={approvePartnerApplication} applicationId={row.application.id} currentRiskLevel={row.application.internalRiskLevel} returnTo={`/admin/partner-operations?applicationId=${row.application.id}`} buttonLabel="Approve partner" disabledReason={actionDisabledReason(row, "approved")} />
        <PartnerActionForm action={rejectPartnerApplication} applicationId={row.application.id} currentRiskLevel={row.application.internalRiskLevel} returnTo={`/admin/partner-operations?applicationId=${row.application.id}`} reasonName="rejectionReason" reasonPlaceholder="Required rejection reason" buttonLabel="Reject" destructive disabledReason={actionDisabledReason(row, "rejected")} />
        <PartnerActionForm action={suspendPartnerApplication} applicationId={row.application.id} currentRiskLevel={row.application.internalRiskLevel} returnTo={`/admin/partner-operations?applicationId=${row.application.id}`} reasonName="adminNotes" reasonPlaceholder="Required suspension reason / quality watch rationale" buttonLabel="Suspend / quality pause" destructive disabledReason={actionDisabledReason(row, "suspended")} />
      </ActionPanel>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number | null | undefined }) {
  return <div className="rounded-lg border bg-slate-50/70 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 break-words text-sm font-medium text-slate-950">{value ?? "Not available"}</p></div>;
}

function QueueEmpty({ label }: { label: string }) {
  return <div className="rounded-lg border border-dashed bg-slate-50/60 p-4 text-sm text-slate-600">{label}</div>;
}

function GateList({ title, gates }: { title: string; gates: [string, boolean, string][] }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <h3 className="font-semibold">{title}</h3>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {gates.map(([label, passed, detail]) => (
          <div key={label} className="flex items-start gap-3 rounded-md border bg-slate-50/70 p-3">
            {passed ? <ShieldCheck className="mt-0.5 h-4 w-4 text-emerald-600" /> : <FileWarning className="mt-0.5 h-4 w-4 text-amber-600" />}
            <div><p className="text-sm font-medium">{label}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PartnerActionForm({ action, applicationId, currentRiskLevel, returnTo, reasonName, reasonPlaceholder, buttonLabel, destructive, disabledReason }: { action: (formData: FormData) => Promise<void>; applicationId: string; currentRiskLevel?: string | null; returnTo: string; reasonName?: string; reasonPlaceholder?: string; buttonLabel: string; destructive?: boolean; disabledReason?: string | null }) {
  return (
    <form action={action} className="space-y-3 rounded-lg border bg-white p-3">
      <input type="hidden" name="applicationId" value={applicationId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <select name="internalRiskLevel" defaultValue={currentRiskLevel ?? "unreviewed"} className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
        {PARTNER_RISK_LEVELS.map((risk) => <option key={risk.value} value={risk.value}>{risk.label}</option>)}
      </select>
      {reasonName ? <Textarea name={reasonName} placeholder={reasonPlaceholder} rows={2} required /> : null}
      {reasonName !== "adminNotes" ? <Textarea name="adminNotes" placeholder="Internal operator note / decision rationale" rows={2} /> : null}
      <Button type="submit" variant={destructive ? "destructive" : "outline"} className="w-full" disabled={Boolean(disabledReason)}>{buttonLabel}</Button>
      {disabledReason ? <p className="text-xs text-slate-500">{disabledReason}</p> : null}
    </form>
  );
}
