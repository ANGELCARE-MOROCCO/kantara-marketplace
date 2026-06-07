import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  ClipboardCheck,
  CreditCard,
  FileSearch,
  Flag,
  Home,
  Scale,
  Search,
  ShieldAlert,
  UserRound,
} from "lucide-react";

import { EmptyState } from "@/app/components/admin/EmptyState";
import { KpiCard } from "@/app/components/admin/KpiCard";
import { ModuleShell } from "@/app/components/admin/ModuleShell";
import { ReadinessMeter } from "@/app/components/admin/ReadinessMeter";
import { RiskBadge } from "@/app/components/admin/RiskBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { requireAdmin } from "@/app/lib/auth";
import {
  DISPUTE_AGE_BUCKETS,
  DISPUTE_PRIORITIES,
  DISPUTE_SOURCE_TYPES,
  DISPUTE_STATUSES,
  DISPUTE_TYPES,
  createDisputesHref,
  readDisputeParam,
  type DisputeSearchParams,
  type DisputeSourceType,
} from "@/app/lib/disputeFilters";
import {
  DISPUTE_STATUS_LABELS,
  DISPUTE_TYPE_LABELS,
} from "@/app/lib/disputeIntelligence";
import {
  getDisputeOperationsDetail,
  getDisputeOperationsIndex,
  type DisputeOperationsIndex,
  type DisputeOperationsRow,
} from "@/app/lib/disputeOperations";
import { formatCurrencyAmount, formatDate, formatDateTime } from "@/app/lib/marketplaceStatus";
import { createDisputeCaseAction } from "./actions";
import { DisputeDetailDrawer } from "./DisputeDetailDrawer";
import { DisputeOperationsClient } from "./DisputeOperationsClient";

type PageProps = {
  searchParams?: DisputeSearchParams;
};

const SOURCE_TYPE_LABELS: Record<DisputeSourceType, string> = {
  reservation: "Booking / reservation",
  payment: "Payment",
  handover: "Handover task",
  guest: "Guest",
  property: "Property",
  partner: "Partner",
  verification: "Verification",
  manual_exception: "Manual exception",
};

const AGE_BUCKET_LABELS: Record<(typeof DISPUTE_AGE_BUCKETS)[number], string> = {
  lt_24h: "Less than 24h",
  one_to_three_days: "1 to 3 days",
  four_to_seven_days: "4 to 7 days",
  over_seven_days: "Over 7 days",
  over_fourteen_days: "Over 14 days",
};

function optionLabel(value: string) {
  return value.replaceAll("_", " ");
}

function adminName(admin: DisputeOperationsIndex["admins"][number]) {
  return `${admin.firstName ?? ""} ${admin.lastName ?? ""}`.trim() || admin.email;
}

function selectedSourceType(data: DisputeOperationsIndex): DisputeSourceType {
  return data.filters.sourceType && data.filters.sourceType !== "manual_exception"
    ? data.filters.sourceType
    : "reservation";
}

function defaultCaseTypeForSource(sourceType: DisputeSourceType) {
  if (sourceType === "reservation") return "booking_issue";
  if (sourceType === "payment") return "payment_issue";
  if (sourceType === "handover") return "handover_issue";
  if (sourceType === "guest") return "guest_issue";
  if (sourceType === "property") return "property_issue";
  if (sourceType === "partner") return "partner_issue";
  if (sourceType === "verification") return "verification_issue";
  return "other";
}

function currentReturnTo(data: DisputeOperationsIndex) {
  return createDisputesHref(data.filters, { notice: null, error: null });
}

function closeDrawerHref(data: DisputeOperationsIndex) {
  return createDisputesHref(data.filters, { disputeId: null, notice: null, error: null });
}

function paginationFor(data: DisputeOperationsIndex) {
  const { pagination, filters } = data;
  return {
    ...pagination,
    previousHref: pagination.page > 1
      ? createDisputesHref(filters, { page: pagination.page - 1, notice: null, error: null })
      : null,
    nextHref: pagination.page < pagination.totalPages
      ? createDisputesHref(filters, { page: pagination.page + 1, notice: null, error: null })
      : null,
  };
}

function TriageQueue({ rows }: { rows: DisputeOperationsRow[] }) {
  return (
    <section className="rounded-md border border-slate-300 bg-slate-950 p-4 text-white shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Needs decision now</p>
          <h2 className="mt-1 text-lg font-semibold">Executive triage queue</h2>
          <p className="mt-1 text-sm text-slate-300">
            Urgent, overdue, payment-blocked, handover-escalated, reopened, stale, and unlinked cases only.
          </p>
        </div>
        <div className="inline-flex min-h-9 items-center rounded-md border border-white/10 bg-white/10 px-3 text-sm font-semibold">
          {rows.length} decision items
        </div>
      </div>
      <div className="mt-4 grid gap-3 xl:grid-cols-3 2xl:grid-cols-4">
        {rows.length ? rows.slice(0, 12).map((row) => (
          <Link
            key={row.id}
            href={row.rowHref}
            className="block rounded-md border border-white/10 bg-white p-3 text-slate-950 shadow-sm transition-colors hover:border-white"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{row.caseNumber}</p>
                <p className="mt-1 line-clamp-2 text-xs text-slate-600">{row.title}</p>
              </div>
              <RiskBadge severity={row.attentionLevel} />
            </div>
            <div className="mt-3 grid gap-1 text-xs text-slate-600">
              <span>Severity: {row.priority}</span>
              <span>Reason: {row.triageReasons[0] ?? row.attentionReasons[0] ?? "Requires review"}</span>
              <span>Source: {row.linkedSourceLabel}</span>
              <span>Age: {row.ageLabel}</span>
              <span className="font-medium text-slate-950">Next: {row.nextBestAction}</span>
            </div>
          </Link>
        )) : (
          <div className="rounded-md border border-dashed border-white/15 p-4 text-sm text-slate-300 xl:col-span-3 2xl:col-span-4">
            No cases currently match the decision-now rules. The queue is intentionally empty unless real cases are urgent, stale, reopened, blocked, or missing linked context.
          </div>
        )}
      </div>
    </section>
  );
}

function AdvancedFilters({ data }: { data: DisputeOperationsIndex }) {
  const { filters } = data;
  return (
    <section className="rounded-md border bg-background p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Case views and filters</p>
          <h2 className="mt-1 text-lg font-semibold">Advanced case filtering</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Filter by case, linked records, owner, age, source type, payment risk, handover risk, and unresolved state.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/admin/disputes">Reset filters</Link>
        </Button>
      </div>
      <form action="/admin/disputes" className="mt-4 grid gap-3 xl:grid-cols-6">
        <label className="xl:col-span-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Search</span>
          <div className="mt-1 flex">
            <Input
              name="q"
              defaultValue={filters.search ?? ""}
              placeholder="Case, title, guest, property, partner, reservation, payment"
              className="rounded-r-none"
            />
            <Button type="submit" variant="outline" className="rounded-l-none">
              <Search className="h-4 w-4" />
              <span className="sr-only">Search disputes</span>
            </Button>
          </div>
        </label>
        <FilterSelect label="Status" name="status" value={filters.status} options={DISPUTE_STATUSES.map((status) => [status, DISPUTE_STATUS_LABELS[status]])} />
        <FilterSelect label="Priority" name="priority" value={filters.priority} options={DISPUTE_PRIORITIES.map((priority) => [priority, optionLabel(priority)])} />
        <FilterSelect label="Type" name="type" value={filters.type} options={DISPUTE_TYPES.map((type) => [type, DISPUTE_TYPE_LABELS[type]])} />
        <FilterSelect label="Owner" name="owner" value={filters.owner} options={[["unassigned", "Unassigned"], ...data.admins.map((admin) => [admin.id, adminName(admin)] as const)]} />
        <FilterSelect label="Linked source" name="linkedSourceType" value={filters.linkedSourceType} options={DISPUTE_SOURCE_TYPES.map((type) => [type, SOURCE_TYPE_LABELS[type]])} />
        <FilterSelect label="Age bucket" name="ageBucket" value={filters.ageBucket} options={DISPUTE_AGE_BUCKETS.map((bucket) => [bucket, AGE_BUCKET_LABELS[bucket]])} />
        <label>
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Opened from</span>
          <Input type="date" name="openedFrom" defaultValue={filters.openedFrom?.toISOString().slice(0, 10) ?? ""} className="mt-1" />
        </label>
        <label>
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Opened to</span>
          <Input type="date" name="openedTo" defaultValue={filters.openedTo?.toISOString().slice(0, 10) ?? ""} className="mt-1" />
        </label>
        <FilterSelect label="Rows" name="pageSize" value={String(filters.pageSize)} options={["10", "25", "50", "100"].map((size) => [size, size])} />
        <div className="xl:col-span-6">
          <div className="grid gap-2 text-sm md:grid-cols-2 xl:grid-cols-4">
            <FilterToggle name="awaitingExternal" label="Awaiting external party" checked={filters.awaitingExternal} />
            <FilterToggle name="paymentRelated" label="Payment-related" checked={filters.paymentRelated} />
            <FilterToggle name="handoverRelated" label="Handover-related" checked={filters.handoverRelated} />
            <FilterToggle name="unresolved" label="Unresolved only" checked={filters.unresolved} />
            <FilterToggle name="urgentHigh" label="Urgent / high" checked={filters.urgentHigh} />
            <FilterToggle name="missingLinkedSource" label="Missing linked source" checked={filters.missingLinkedSource} />
            <FilterToggle name="reopened" label="Reopened cases" checked={filters.reopened} />
          </div>
        </div>
      </form>
    </section>
  );
}

function FilterSelect({
  label,
  name,
  value,
  options,
}: {
  label: string;
  name: string;
  value?: string | null;
  options: readonly (readonly [string, string])[];
}) {
  return (
    <label>
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <select
        name={name}
        defaultValue={value ?? ""}
        className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        <option value="">Any {label.toLowerCase()}</option>
        {options.map(([optionValue, optionText]) => (
          <option key={optionValue} value={optionValue}>{optionText}</option>
        ))}
      </select>
    </label>
  );
}

function FilterToggle({ name, label, checked }: { name: string; label: string; checked: boolean }) {
  return (
    <label className="inline-flex min-h-10 items-center gap-2 rounded-md border bg-muted/20 px-3">
      <input type="checkbox" name={name} value="1" defaultChecked={checked} className="h-4 w-4 rounded border-input" />
      <span>{label}</span>
    </label>
  );
}

function CreateCasePanel({ data, returnTo }: { data: DisputeOperationsIndex; returnTo: string }) {
  const activeSourceType = selectedSourceType(data);
  const candidates = data.sourceCandidates[activeSourceType] ?? [];

  return (
    <section className="rounded-md border bg-background p-4 shadow-sm">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Linked-source-first intake</p>
          <h2 className="mt-1 text-lg font-semibold">Create dispute case</h2>
          <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
            New cases should start from a real booking, payment, handover, guest, property, partner, or verification record. Manual unlinked incidents are controlled exceptions.
          </p>
        </div>
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          Evidence is summarized only. Do not store card data, IDs, raw documents, passwords, provider secrets, or access codes.
        </div>
      </div>

      <form action="/admin/disputes" className="mt-4 grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)_auto]">
        <label>
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Source type</span>
          <select
            name="sourceType"
            defaultValue={activeSourceType}
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {DISPUTE_SOURCE_TYPES.filter((type) => type !== "manual_exception").map((type) => (
              <option key={type} value={type}>{SOURCE_TYPE_LABELS[type]}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Find source record</span>
          <Input
            name="sourceSearch"
            defaultValue={data.filters.sourceSearch ?? ""}
            placeholder="Search record id, title, guest email, provider order, task number"
            className="mt-1"
          />
        </label>
        <div className="flex items-end">
          <Button type="submit" variant="outline" className="w-full lg:w-auto">Load sources</Button>
        </div>
      </form>

      <form action={createDisputeCaseAction} className="mt-4 grid gap-3 xl:grid-cols-6">
        <input type="hidden" name="returnTo" value={returnTo} />
        <input type="hidden" name="sourceType" value={activeSourceType} />
        <label className="xl:col-span-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Selected linked source</span>
          <select
            name="sourceId"
            required
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Choose {SOURCE_TYPE_LABELS[activeSourceType].toLowerCase()}</option>
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.label} {candidate.status ? `- ${candidate.status}` : ""}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-muted-foreground">
            {candidates.length ? `${candidates.length} real records available.` : "No matching real source records were found."}
          </span>
        </label>
        <FilterSelect label="Case type" name="type" value={defaultCaseTypeForSource(activeSourceType)} options={DISPUTE_TYPES.map((type) => [type, DISPUTE_TYPE_LABELS[type]])} />
        <FilterSelect label="Priority" name="priority" value="medium" options={DISPUTE_PRIORITIES.map((priority) => [priority, optionLabel(priority)])} />
        <FilterSelect label="Initial status" name="initialStatus" value="open" options={[["open", "Open"], ["under_review", "Under review"]]} />
        <FilterSelect label="Assignment" name="assignedToId" value={null} options={data.admins.map((admin) => [admin.id, adminName(admin)] as const)} />
        <label className="xl:col-span-3">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Title</span>
          <Input name="title" required placeholder="Concise incident title" className="mt-1" />
        </label>
        <label className="xl:col-span-3">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Summary</span>
          <Textarea name="summary" rows={3} required placeholder="Operational summary without sensitive data" className="mt-1" />
        </label>
        <label className="xl:col-span-3">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Optional evidence summary</span>
          <Textarea name="operationalEvidenceSummary" rows={3} placeholder="Safe evidence summary only" className="mt-1" />
        </label>
        <label className="xl:col-span-3">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Missing evidence</span>
          <Textarea name="missingEvidence" rows={3} placeholder="Information still required before resolution" className="mt-1" />
        </label>
        <div className="xl:col-span-6 flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Creation writes a DisputeEvent and AdminAuditEvent. No fake cases or seeded records are created.
          </p>
          <Button type="submit" disabled={!candidates.length}>Create linked dispute</Button>
        </div>
      </form>

      <details className="mt-4 rounded-md border border-dashed p-4">
        <summary className="cursor-pointer text-sm font-semibold">Advanced: manual unlinked incident exception</summary>
        <p className="mt-2 text-sm text-muted-foreground">
          Use only when no linked source exists yet. The case is flagged as missing linked source and remains a blocker until linked or resolved.
        </p>
        <form action={createDisputeCaseAction} className="mt-4 grid gap-3 lg:grid-cols-3">
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="sourceType" value="manual_exception" />
          <FilterSelect label="Case type" name="type" value="other" options={DISPUTE_TYPES.map((type) => [type, DISPUTE_TYPE_LABELS[type]])} />
          <FilterSelect label="Priority" name="priority" value="medium" options={DISPUTE_PRIORITIES.map((priority) => [priority, optionLabel(priority)])} />
          <FilterSelect label="Initial status" name="initialStatus" value="open" options={[["open", "Open"], ["under_review", "Under review"]]} />
          <Input name="title" required placeholder="Manual incident title" className="lg:col-span-2" />
          <Textarea name="manualReason" required rows={3} placeholder="Required reason for no linked source" />
          <Textarea name="summary" required rows={4} placeholder="Safe operational summary" className="lg:col-span-3" />
          <Button type="submit" variant="outline" className="lg:col-span-3">Create manual exception case</Button>
        </form>
      </details>
    </section>
  );
}

function IntelligenceRail({ data }: { data: DisputeOperationsIndex }) {
  const { intelligence } = data;
  return (
    <div className="space-y-4">
      <section className="rounded-md border bg-background p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md border bg-slate-50">
            <ShieldAlert className="h-4 w-4" />
          </div>
          <div>
            <h2 className="font-semibold">Risk intelligence</h2>
            <p className="mt-1 text-xs text-muted-foreground">Deterministic signals from linked dispute, payment, handover, booking, guest, property, partner, and verification records.</p>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          <ReadinessMeter
            label="Average resolution readiness"
            score={intelligence.averageReadiness}
            detail={intelligence.averageReadiness === null ? "No real cases loaded." : "Computed from the current case view."}
          />
          <RiskRow label="Highest severity" value={intelligence.highestSeverityCases.length} href={createDisputesHref(data.filters, { urgentHigh: "1", notice: null, error: null })} />
          <RiskRow label="Financial exposure" value={formatCurrencyAmount(intelligence.financialExposure, "USD")} />
          <RiskRow label="Missing linked source" value={intelligence.missingLinkedSourceCases.length} href={createDisputesHref(data.filters, { missingLinkedSource: "1", notice: null, error: null })} />
          <RiskRow label="Stalled external party" value={intelligence.stalledExternalCases.length} href={createDisputesHref(data.filters, { awaitingExternal: "1", notice: null, error: null })} />
          <RiskRow label="Handover escalations" value={intelligence.handoverEscalations.length} href={createDisputesHref(data.filters, { handoverRelated: "1", notice: null, error: null })} />
          <RiskRow label="Payment escalations" value={intelligence.paymentEscalations.length} href={createDisputesHref(data.filters, { paymentRelated: "1", notice: null, error: null })} />
          <RiskRow label="Repeated patterns" value={intelligence.repeatedPatternCases.length} />
        </div>
      </section>

      <RiskList
        title="Highest severity cases"
        icon={<Flag className="h-4 w-4" />}
        rows={intelligence.highestSeverityCases}
        empty="No high-severity unresolved cases in the current real dataset."
      />
      <RiskList
        title="Oldest open cases"
        icon={<AlertTriangle className="h-4 w-4" />}
        rows={data.boardRows.filter((row) => !["resolved", "closed"].includes(row.status)).sort((a, b) => new Date(a.openedAtIso).getTime() - new Date(b.openedAtIso).getTime()).slice(0, 6)}
        empty="No open cases."
      />
      <RiskList
        title="Payment escalations"
        icon={<CreditCard className="h-4 w-4" />}
        rows={intelligence.paymentEscalations.slice(0, 6)}
        empty="No linked payment escalations."
      />
      <RiskList
        title="Handover escalations"
        icon={<ClipboardCheck className="h-4 w-4" />}
        rows={intelligence.handoverEscalations.slice(0, 6)}
        empty="No linked handover escalations."
      />
    </div>
  );
}

function RiskRow({ label, value, href }: { label: string; value: string | number; href?: string }) {
  const content = (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
  return href ? <Link href={href} className="block hover:border-foreground/30">{content}</Link> : content;
}

function RiskList({
  title,
  icon,
  rows,
  empty,
}: {
  title: string;
  icon: ReactNode;
  rows: DisputeOperationsRow[];
  empty: string;
}) {
  return (
    <section className="rounded-md border bg-background p-4 shadow-sm">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="mt-3 space-y-2">
        {rows.length ? rows.map((row) => (
          <Link key={row.id} href={row.rowHref} className="block rounded-md border p-3 text-sm hover:border-foreground/30">
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium">{row.caseNumber}</span>
              <RiskBadge severity={row.attentionLevel} />
            </div>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{row.title}</p>
            <p className="mt-2 text-xs text-muted-foreground">{row.ageLabel} - {row.nextBestAction}</p>
          </Link>
        )) : (
          <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">{empty}</div>
        )}
      </div>
    </section>
  );
}

export default async function DisputesPage({ searchParams }: PageProps) {
  await requireAdmin();
  const selectedDisputeId = readDisputeParam(searchParams, "disputeId") ?? null;
  const [data, detail] = await Promise.all([
    getDisputeOperationsIndex(searchParams),
    getDisputeOperationsDetail(selectedDisputeId),
  ]);
  const returnTo = currentReturnTo(data);
  const openCases = data.intelligence.openCases;
  const urgentHighCases = data.intelligence.urgentHighCases;
  const awaitingExternalCount = data.intelligence.awaitingExternalCount;
  const oldestOpen = data.intelligence.oldestOpenCase;
  const resolvedClosed = data.intelligence.resolvedCount + data.intelligence.closedCount;

  return (
    <ModuleShell
      title="Dispute Resolution Command"
      eyebrow="Trust, safety, finance, and stay operations"
      description="Incident command for linked marketplace risk: guest trust, partner accountability, payments, handover execution, property quality, evidence review, and structured closure."
      moduleStatus={urgentHighCases ? "urgent" : openCases ? "requires_review" : "operational"}
      statusLabel={urgentHighCases ? `${urgentHighCases} urgent/high` : `${openCases} open`}
      notice={data.filters.notice}
      error={data.filters.error}
      layout="split"
      intelligence={<IntelligenceRail data={data} />}
      primaryAction={<Button asChild><a href="#case-intake">Create linked case</a></Button>}
      secondaryActions={
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link href="/admin/bookings">Open bookings</Link></Button>
          <Button asChild variant="outline"><Link href="/admin/payments">Open payments</Link></Button>
          <Button asChild variant="outline"><Link href="/admin/handover">Open handover</Link></Button>
        </div>
      }
    >
      <div className="space-y-5">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <KpiCard
            label="Open cases"
            value={openCases}
            detail="Open, under review, awaiting, or reopened cases."
            href={createDisputesHref(data.filters, { unresolved: "1", notice: null, error: null })}
            tone={openCases ? "warning" : "success"}
          />
          <KpiCard
            label="Urgent / high"
            value={urgentHighCases}
            detail="Unresolved senior-priority cases."
            href={createDisputesHref(data.filters, { urgentHigh: "1", notice: null, error: null })}
            tone={urgentHighCases ? "danger" : "success"}
          />
          <KpiCard
            label="Awaiting external"
            value={awaitingExternalCount}
            detail="Awaiting guest or partner response."
            href={createDisputesHref(data.filters, { awaitingExternal: "1", notice: null, error: null })}
            tone={awaitingExternalCount ? "warning" : "success"}
          />
          <KpiCard
            label="Average age"
            value={data.intelligence.averageAgeDays === null ? "N/A" : `${data.intelligence.averageAgeDays}d`}
            detail="Average age across unresolved real cases."
          />
          <KpiCard
            label="Resolved / closed"
            value={resolvedClosed}
            detail={`${data.intelligence.resolvedCount} resolved, ${data.intelligence.closedCount} closed.`}
            tone="info"
          />
          <KpiCard
            label="Oldest unresolved"
            value={oldestOpen ? oldestOpen.ageLabel : "None"}
            detail={oldestOpen ? `${oldestOpen.caseNumber} opened ${formatDate(oldestOpen.openedAtIso)}` : "No unresolved cases."}
            href={oldestOpen?.rowHref}
            tone={oldestOpen ? "warning" : "success"}
          />
        </section>

        <section className="grid gap-3 rounded-md border bg-background p-4 shadow-sm md:grid-cols-2 xl:grid-cols-4">
          <LifecycleTile icon={<FileSearch className="h-4 w-4" />} title="Intake" detail="Linked-source-first creation from booking, payment, handover, guest, property, partner, or verification." />
          <LifecycleTile icon={<ShieldAlert className="h-4 w-4" />} title="Triage" detail="Severity, ownership, SLA age, source linkage, and financial or operational exposure." />
          <LifecycleTile icon={<Scale className="h-4 w-4" />} title="Investigation" detail="Evidence summaries, linked context, payment state, handover state, and timeline review." />
          <LifecycleTile icon={<ClipboardCheck className="h-4 w-4" />} title="Resolution & learning" detail="Structured outcome, rationale, closure discipline, audit events, and root area classification." />
        </section>

        <TriageQueue rows={data.triageRows} />
        <AdvancedFilters data={data} />
        <section id="case-intake">
          <CreateCasePanel data={data} returnTo={returnTo} />
        </section>

        {!data.rows.length && !data.boardRows.length ? (
          <EmptyState
            title="No dispute cases yet."
            description="Disputes are created from real linked operational sources or from a controlled manual exception. No fake cases are shown or generated."
            why="There are no DisputeCase rows matching the current view."
            createsRecords="Create a linked case from a booking, payment, handover task, guest, property, partner, or verification record. Manual unlinked cases require a reason."
            checklist={[
              "Use source search above to load real records.",
              "Open Payments, Handover, or Bookings to inspect linked context before intake.",
              "Do not store passports, IDs, raw documents, card data, provider secrets, or access codes.",
            ]}
            links={[
              { href: "/admin/bookings", label: "Open bookings" },
              { href: "/admin/payments", label: "Open payments" },
              { href: "/admin/handover", label: "Open handover" },
            ]}
          />
        ) : (
          <DisputeOperationsClient
            rows={data.rows}
            boardRows={data.boardRows}
            statusCounts={data.statusCounts}
            returnTo={returnTo}
            selectedDisputeId={selectedDisputeId}
            admins={data.admins}
            pagination={paginationFor(data)}
          />
        )}

        <section className="rounded-md border bg-background p-4 shadow-sm">
          <h2 className="text-lg font-semibold">Security and compliance guardrails</h2>
          <div className="mt-3 grid gap-3 text-sm md:grid-cols-3">
            <Guardrail icon={<CreditCard className="h-4 w-4" />} title="Payment data" detail="Do not store card numbers, CVV, PayPal secrets, raw provider payloads, or payment credentials." />
            <Guardrail icon={<UserRound className="h-4 w-4" />} title="Identity evidence" detail="Summarize evidence; do not store passport numbers, ID numbers, or raw sensitive documents." />
            <Guardrail icon={<Home className="h-4 w-4" />} title="Access security" detail="Do not store door codes, lockbox codes, alarm codes, passwords, or private access instructions." />
          </div>
        </section>
      </div>

      {detail ? (
        <DisputeDetailDrawer
          detail={detail}
          closeHref={closeDrawerHref(data)}
          returnTo={returnTo}
          notice={data.filters.notice}
          error={data.filters.error}
        />
      ) : selectedDisputeId ? (
        <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-xl rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900 shadow-lg">
          Dispute case was not found. <Link href={closeDrawerHref(data)} className="font-semibold underline">Close detail request</Link>.
        </div>
      ) : null}
    </ModuleShell>
  );
}

function LifecycleTile({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  );
}

function Guardrail({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center gap-2 font-medium">
        {icon}
        <span>{title}</span>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-600">{detail}</p>
    </div>
  );
}
