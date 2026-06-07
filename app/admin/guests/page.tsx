import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  CreditCard,
  FileSearch,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";

import { EmptyState } from "@/app/components/admin/EmptyState";
import { KpiCard } from "@/app/components/admin/KpiCard";
import { ModuleShell } from "@/app/components/admin/ModuleShell";
import { RiskBadge } from "@/app/components/admin/RiskBadge";
import { StatusBadge } from "@/app/components/admin/StatusBadge";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/app/lib/auth";
import {
  getGuestOperationsData,
  type GuestOperationsRow,
  type GuestPortfolioHealthItem,
  type GuestQueueItem,
} from "@/app/lib/guestOperations";
import {
  GUEST_SEGMENTS,
  guestFilterHref,
  type GuestSearchParams,
  type NormalizedGuestFilters,
} from "@/app/lib/guestFilters";
import { GuestOperationsClient } from "./GuestOperationsClient";
import { GuestDetailWorkspace } from "./GuestDetailWorkspace";

function SelectField({
  label,
  name,
  value,
  options,
}: {
  label: string;
  name: string;
  value?: string | null;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <select
        name={name}
        defaultValue={value ?? ""}
        className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function SegmentRail({
  filters,
  counts,
}: {
  filters: NormalizedGuestFilters;
  counts: Record<string, number>;
}) {
  return (
    <aside className="rounded-md border bg-background p-3 shadow-sm">
      <div className="px-2 pb-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Segments</p>
        <p className="mt-1 text-xs text-muted-foreground">Real-data lifecycle filters.</p>
      </div>
      <div className="grid gap-1">
        {GUEST_SEGMENTS.map((item) => {
          const active = filters.segment === item.id;
          return (
            <Link
              key={item.id}
              href={guestFilterHref(filters, { segment: item.id === "all" ? null : item.id, guestId: null, page: null })}
              className={[
                "flex items-center justify-between rounded-md px-2 py-2 text-sm font-medium transition-colors",
                active ? "bg-slate-950 text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              ].join(" ")}
            >
              <span>{item.label}</span>
              <span className={active ? "rounded-full bg-white/15 px-2 py-0.5 text-xs" : "rounded-full bg-muted px-2 py-0.5 text-xs"}>
                {counts[item.id] ?? 0}
              </span>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}

function HealthMatrix({ items }: { items: GuestPortfolioHealthItem[] }) {
  return (
    <section className="rounded-md border bg-background p-4 shadow-sm">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="font-semibold">Guest portfolio health</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Deterministic health matrix from linked guest, reservation, payment, handover, dispute, verification, and premium records.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">Null scores mean insufficient history, not hidden analytics.</p>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-md border bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{item.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
              </div>
              <StatusBadge status={item.status} label={item.status} />
            </div>
            <div className="mt-4 flex items-end justify-between gap-3">
              <p className="text-2xl font-semibold tracking-tight">
                {item.score === null ? "Foundation" : `${item.score}%`}
              </p>
              <div className="h-2 w-28 rounded-full bg-slate-200">
                <div
                  className="h-2 rounded-full bg-slate-950"
                  style={{ width: `${item.score ?? 14}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function OperatorReviewQueue({ items }: { items: GuestQueueItem[] }) {
  return (
    <section className="rounded-md border bg-background shadow-sm">
      <div className="border-b p-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-semibold">Needs operator review</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Deterministic triggers only: disputes, payments, handover issues, verification gaps, premium candidates, and profile completeness.
            </p>
          </div>
          <StatusBadge status={items.length ? "requires_review" : "operational"} label={`${items.length} queue items`} />
        </div>
      </div>
      {items.length ? (
        <div className="divide-y">
          {items.slice(0, 12).map((item) => (
            <div key={item.id} className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_120px_180px_220px_130px] lg:items-center">
              <div className="min-w-0">
                <Link href={item.rowHref} className="font-semibold underline-offset-4 hover:underline">{item.guestName}</Link>
                <p className="mt-1 truncate text-sm text-muted-foreground">{item.guestEmail}</p>
                <p className="mt-2 text-sm">{item.triggerReason}</p>
              </div>
              <RiskBadge severity={item.severity} />
              <div className="text-sm">
                <p className="font-medium capitalize">{item.sourceType.replaceAll("_", " ")}</p>
                <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{item.sourceId ?? "Guest-level trigger"}</p>
              </div>
              <p className="text-sm text-muted-foreground">{item.recommendedAction}</p>
              <div className="flex flex-col gap-2">
                {item.sourceHref ? (
                  <Button asChild variant="outline" size="sm"><Link href={item.sourceHref}>Open source</Link></Button>
                ) : null}
                <Button asChild variant="outline" size="sm"><Link href={item.rowHref}>Open guest</Link></Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-4">
          <EmptyState
            title="No guests require deterministic review"
            description="No open dispute, payment risk, handover issue, stale verification, premium candidate, missing verification, missing profile basics, or manual settlement trigger is active in the current portfolio."
            why="The queue is built only from existing operational records."
            createsRecords="Queue items appear when real booking, payment, handover, dispute, verification, or premium records create a review trigger."
          />
        </div>
      )}
    </section>
  );
}

function AdvancedFilters({
  filters,
  roles,
  languages,
  currencies,
}: {
  filters: NormalizedGuestFilters;
  roles: { value: string; label: string; count: number }[];
  languages: string[];
  currencies: string[];
}) {
  return (
    <form action="/admin/guests" className="rounded-md border bg-background p-4 shadow-sm">
      {filters.segment !== "all" ? <input type="hidden" name="segment" value={filters.segment} /> : null}
      <div className="grid gap-3 xl:grid-cols-[minmax(240px,1.4fr)_repeat(5,minmax(150px,1fr))]">
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">Search</span>
          <input
            name="q"
            defaultValue={filters.search ?? ""}
            placeholder="Name, email, or guest id"
            className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
        <SelectField label="Role/status" name="role" value={filters.role} options={[{ value: "", label: "Any role" }, ...roles.map((role) => ({ value: role.value, label: `${role.label} (${role.count})` }))]} />
        <SelectField label="Account age" name="accountAge" value={filters.accountAge} options={[{ value: "", label: "Any" }, { value: "not_tracked", label: "Not tracked in User model" }, { value: "tracked", label: "Tracked only" }]} />
        <SelectField label="Reservations" name="reservationCount" value={filters.reservationCount} options={[{ value: "", label: "Any count" }, { value: "none", label: "No reservations" }, { value: "one", label: "One reservation" }, { value: "repeat", label: "Repeat guest" }, { value: "three_plus", label: "3+ reservations" }]} />
        <SelectField label="Upcoming stay" name="upcomingStay" value={filters.upcomingStay} options={[{ value: "", label: "Any" }, { value: "yes", label: "Has upcoming" }, { value: "no", label: "No upcoming" }]} />
        <SelectField label="Payment risk" name="paymentRisk" value={filters.paymentRisk} options={[{ value: "", label: "Any" }, { value: "yes", label: "Payment risk" }, { value: "no", label: "No payment risk" }]} />
      </div>
      <div className="mt-3 grid gap-3 xl:grid-cols-6">
        <SelectField label="Dispute status" name="disputeStatus" value={filters.disputeStatus} options={[{ value: "", label: "Any" }, { value: "none", label: "No exposure" }, { value: "open", label: "Open dispute" }, { value: "exposed", label: "Any exposure" }, { value: "repeated", label: "Repeated exposure" }]} />
        <SelectField label="Handover issue" name="handoverIssue" value={filters.handoverIssue} options={[{ value: "", label: "Any" }, { value: "yes", label: "Issue exposure" }, { value: "unresolved", label: "Unresolved issue" }, { value: "no", label: "No issue exposure" }]} />
        <SelectField label="Verification" name="verificationStatus" value={filters.verificationStatus} options={[{ value: "", label: "Any" }, { value: "missing", label: "Missing" }, { value: "pending", label: "Pending" }, { value: "verified", label: "Verified" }, { value: "rejected", label: "Rejected" }]} />
        <SelectField label="Premium" name="premiumStatus" value={filters.premiumStatus} options={[{ value: "", label: "Any" }, { value: "none", label: "No profile" }, { value: "candidate", label: "Candidate" }, { value: "profile_exists", label: "Profile exists" }, { value: "premium_ready", label: "Premium ready" }, { value: "under_review", label: "Under review" }, { value: "suspended", label: "Suspended" }, { value: "rejected", label: "Rejected" }]} />
        <SelectField label="Risk level" name="riskLevel" value={filters.riskLevel} options={[{ value: "", label: "Any" }, { value: "critical", label: "Critical" }, { value: "high", label: "High" }, { value: "medium", label: "Medium" }, { value: "low", label: "Low" }, { value: "foundation", label: "Foundation" }]} />
        <SelectField label="Requires review" name="requiresReview" value={filters.requiresReview} options={[{ value: "", label: "Any" }, { value: "yes", label: "Requires review" }, { value: "no", label: "No review trigger" }]} />
      </div>
      <div className="mt-3 grid gap-3 xl:grid-cols-[repeat(3,minmax(150px,1fr))_auto] xl:items-end">
        <SelectField label="Preferred language" name="preferredLanguage" value={filters.preferredLanguage} options={[{ value: "", label: "Any language" }, ...languages.map((language) => ({ value: language, label: language }))]} />
        <SelectField label="Preferred currency" name="preferredCurrency" value={filters.preferredCurrency} options={[{ value: "", label: "Any currency" }, ...currencies.map((currency) => ({ value: currency, label: currency }))]} />
        <SelectField label="Latest activity" name="latestActivity" value={filters.latestActivity} options={[{ value: "", label: "Any activity" }, { value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }, { value: "90", label: "Last 90 days" }, { value: "365", label: "Last year" }, { value: "none", label: "No activity" }]} />
        <div className="flex gap-2">
          <Button type="submit">Apply filters</Button>
          <Button asChild variant="outline"><Link href="/admin/guests">Reset</Link></Button>
        </div>
      </div>
    </form>
  );
}

function RowRail({
  title,
  rows,
  empty,
  icon,
}: {
  title: string;
  rows: GuestOperationsRow[];
  empty: string;
  icon: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
      </div>
      <div className="mt-2 space-y-2">
        {rows.length ? rows.map((row) => (
          <Link key={row.id} href={row.rowHref} className="block rounded-md border p-3 transition-colors hover:border-foreground/30">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{row.name}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{row.email}</p>
              </div>
              <RiskBadge severity={row.riskLevel === "foundation" ? "info" : row.riskLevel} label={row.riskLevel} />
            </div>
            <p className="mt-2 truncate text-xs text-muted-foreground">{row.nextActionLabel} - {row.valueSignal}</p>
          </Link>
        )) : (
          <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">{empty}</p>
        )}
      </div>
    </div>
  );
}

function RightRail({ data }: { data: Awaited<ReturnType<typeof getGuestOperationsData>> }) {
  return (
    <aside className="space-y-4 rounded-md border bg-background p-4 shadow-sm">
      <div>
        <h2 className="text-base font-semibold">Guest intelligence rail</h2>
        <p className="mt-1 text-xs text-muted-foreground">No fake analytics; every list is derived from current guest rows.</p>
      </div>
      <RowRail title="Highest-risk guests" rows={data.rightRail.highestRiskGuests} empty="No high-risk guest triggers." icon={<AlertTriangle className="h-4 w-4" />} />
      <RowRail title="Premium candidates" rows={data.rightRail.premiumCandidates} empty="No deterministic premium candidates." icon={<Sparkles className="h-4 w-4" />} />
      <RowRail title="Repeat guests" rows={data.rightRail.repeatGuests} empty="No repeat guests yet." icon={<BadgeCheck className="h-4 w-4" />} />
      <RowRail title="Payment issue guests" rows={data.rightRail.paymentIssueGuests} empty="No payment-risk guests." icon={<CreditCard className="h-4 w-4" />} />
      <RowRail title="Dispute-exposed guests" rows={data.rightRail.disputeExposedGuests} empty="No dispute-exposed guests." icon={<ShieldAlert className="h-4 w-4" />} />
      <RowRail title="Verification blockers" rows={data.rightRail.verificationBlockers} empty="No verification blockers." icon={<ShieldCheck className="h-4 w-4" />} />
      <RowRail title="Clean history" rows={data.rightRail.cleanHistoryGuests} empty="No high-confidence clean-history guests yet." icon={<BadgeCheck className="h-4 w-4" />} />
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <FileSearch className="h-4 w-4" />
          Recent guest activity
        </div>
        <div className="mt-2 space-y-2">
          {data.rightRail.recentActivity.length ? data.rightRail.recentActivity.map((row) => (
            <Link key={row.id} href={row.rowHref} className="block rounded-md border p-3 text-sm hover:border-foreground/30">
              <p className="truncate font-medium">{row.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{row.latestActivityLabel}</p>
            </Link>
          )) : (
            <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">No guest operational activity yet.</p>
          )}
        </div>
      </div>
    </aside>
  );
}

export default async function AdminGuestsPage({
  searchParams,
}: {
  searchParams?: GuestSearchParams;
}) {
  await requireAdmin();
  const data = await getGuestOperationsData(searchParams);
  const returnTo = guestFilterHref(data.filters, { notice: null, error: null });
  const closeHref = guestFilterHref(data.filters, { guestId: null, notice: null, error: null });

  return (
    <ModuleShell
      title="Guest Intelligence Command"
      description="Guest trust, stay history, payment reliability, dispute exposure, and premium readiness."
      moduleStatus={data.reviewQueue.length ? "requires_review" : "operational"}
      statusLabel={`${data.pagination.visibleCount} visible guests`}
      notice={data.filters.notice}
      error={data.filters.error}
      layout="operations"
      navigation={<SegmentRail filters={data.filters} counts={data.segmentCounts} />}
      intelligence={<RightRail data={data} />}
    >
      <div className="space-y-5">
        <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-9">
          <KpiCard label="Total guests" value={data.metrics.totalGuests} detail={`${data.totalGuestCount} non-admin guest/user records exist.`} />
          <KpiCard label="Active guests" value={data.metrics.activeGuests} tone={data.metrics.activeGuests ? "success" : "default"} />
          <KpiCard label="With reservations" value={data.metrics.guestsWithReservations} />
          <KpiCard label="Repeat guests" value={data.metrics.repeatGuests} tone={data.metrics.repeatGuests ? "success" : "default"} />
          <KpiCard label="Premium candidates" value={data.metrics.premiumCandidates} tone={data.metrics.premiumCandidates ? "warning" : "default"} />
          <KpiCard label="Verification pending" value={data.metrics.verificationPending} tone={data.metrics.verificationPending ? "warning" : "default"} />
          <KpiCard label="Dispute exposed" value={data.metrics.disputeExposedGuests} tone={data.metrics.disputeExposedGuests ? "danger" : "success"} />
          <KpiCard label="Payment risk" value={data.metrics.paymentRiskGuests} tone={data.metrics.paymentRiskGuests ? "danger" : "success"} />
          <KpiCard label="Handover issues" value={data.metrics.handoverIssueExposedGuests} tone={data.metrics.handoverIssueExposedGuests ? "warning" : "success"} />
        </section>

        <HealthMatrix items={data.portfolioHealth} />
        <OperatorReviewQueue items={data.reviewQueue} />
        <AdvancedFilters
          filters={data.filters}
          roles={data.filterOptions.roles}
          languages={data.filterOptions.languages}
          currencies={data.filterOptions.currencies}
        />

        {data.rows.length === 0 ? (
          <EmptyState
            title="No guests yet"
            description="Guests appear after real signup, reservation, or checkout activity. This module does not create fake guests or seed data."
            why="No non-admin User records matched the current guest scope."
            createsRecords="Guest accounts originate in signup/reservation/checkout flows, then accumulate operational context through bookings, payments, handover, disputes, verifications, and premium review."
            links={[{ href: "/admin/bookings", label: "Open bookings" }, { href: "/", label: "Open public marketplace" }]}
          />
        ) : data.visibleRows.length === 0 ? (
          <EmptyState
            title="No guests match these filters"
            description="The filters returned no guest rows. No placeholder guests or analytics are generated."
            why="The current segment, search, risk, verification, payment, dispute, or preference filters do not match live records."
            createsRecords="Adjust filters or wait for real operational records to enter the marketplace."
            links={[{ href: "/admin/guests", label: "Reset guest filters" }]}
          />
        ) : (
          <GuestOperationsClient
            rows={data.visibleRows}
            returnTo={returnTo}
            selectedGuestId={data.filters.selectedGuestId}
            pagination={data.pagination}
          />
        )}
      </div>

      {data.selectedDetail ? (
        <GuestDetailWorkspace
          detail={data.selectedDetail}
          closeHref={closeHref}
          returnTo={returnTo}
          notice={data.filters.notice}
          error={data.filters.error}
        />
      ) : null}
    </ModuleShell>
  );
}
