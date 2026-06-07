import Link from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  CreditCard,
  FileSearch,
  KeyRound,
  ShieldAlert,
} from "lucide-react";

import { EmptyState } from "@/app/components/admin/EmptyState";
import { IntelligencePanel } from "@/app/components/admin/IntelligencePanel";
import { KpiCard } from "@/app/components/admin/KpiCard";
import { ModuleShell } from "@/app/components/admin/ModuleShell";
import { ProviderStatus } from "@/app/components/admin/ProviderStatus";
import { ReadinessMeter } from "@/app/components/admin/ReadinessMeter";
import { RiskBadge } from "@/app/components/admin/RiskBadge";
import { StatusBadge } from "@/app/components/admin/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireAdmin } from "@/app/lib/auth";
import { getCurrencyDisplayState } from "@/app/lib/currency";
import {
  BOOKING_LIFECYCLE_STATUSES,
  BOOKING_OPERATIONAL_SEGMENTS,
} from "@/app/lib/bookingIntelligence";
import {
  createBookingsHref,
  readBookingParam,
  type BookingSearchParams,
} from "@/app/lib/bookingFilters";
import {
  getBookingOperationsDetail,
  getBookingOperationsIndex,
} from "@/app/lib/bookingOperations";
import { BookingDetailDrawer } from "./BookingDetailDrawer";
import { BookingOperationsClient } from "./BookingOperationsClient";

type AdminBookingsPageProps = {
  searchParams?: BookingSearchParams;
};

function selectLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function providerStatusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function activeSegmentDescription(segmentId: string) {
  return BOOKING_OPERATIONAL_SEGMENTS.find((segment) => segment.id === segmentId)?.description ?? "Current booking operations view.";
}

export default async function AdminBookingsPage({ searchParams }: AdminBookingsPageProps) {
  await requireAdmin();
  const [data, currencyState] = await Promise.all([
    getBookingOperationsIndex(searchParams),
    getCurrencyDisplayState(),
  ]);
  const selectedId = data.filters.bookingId;
  const selectedDetail = selectedId ? await getBookingOperationsDetail(selectedId) : null;
  const closeHref = createBookingsHref(data.filters, { bookingId: null, notice: null, error: null });
  const returnTo = createBookingsHref(data.filters, { bookingId: selectedId ?? null, notice: null, error: null });
  const rows = data.rows.map((row) => ({
    ...row,
    rowHref: createBookingsHref(data.filters, { bookingId: row.id, notice: null, error: null }),
  }));
  const notice = readBookingParam(searchParams, "notice");
  const error = readBookingParam(searchParams, "error");
  const statusCounts = Object.fromEntries(data.segmentCounts.map((segment) => [segment.id, segment.count]));
  const hasRows = rows.length > 0;
  const moduleStatus = data.intelligence.criticalCount
    ? "critical"
    : data.intelligence.highCount
      ? "requires_review"
      : data.intelligence.currentPageAttentionCount
        ? "watching"
        : "operational";

  return (
    <ModuleShell
      title="Bookings"
      description="Reservation operations command center for high-volume booking control, lifecycle review, protected price snapshots, payment settlement, handover readiness, disputes, verification risk, and linked guest/property/partner context."
      moduleStatus={moduleStatus}
      statusLabel={
        data.intelligence.currentPageAttentionCount
          ? `${data.intelligence.currentPageAttentionCount} rows need attention on this page`
          : "Current page clear"
      }
      environment={`PayPal ${providerStatusLabel(data.provider.status)}`}
      notice={notice}
      error={error}
      layout="split"
      intelligence={
        <IntelligencePanel
          title="Booking operations intelligence"
          readiness={[
            {
              label: "Current view readiness",
              score: data.intelligence.averageReadiness,
              detail: data.intelligence.averageReadiness === null
                ? "No reservations in this view."
                : `${data.pagination.from}-${data.pagination.to} of ${data.pagination.totalCount} reservations in scope.`,
            },
            {
              label: "Payment work",
              score: hasRows ? Math.max(0, 100 - data.intelligence.paymentWorkCount * 12) : null,
              detail: `${data.intelligence.paymentWorkCount} rows on this page are missing settlement or need review.`,
            },
            {
              label: "Handover work",
              score: hasRows ? Math.max(0, 100 - data.intelligence.handoverWorkCount * 12) : null,
              detail: `${data.intelligence.handoverWorkCount} rows need handover attention on this page.`,
            },
          ]}
          blockers={rows
            .filter((row) => row.attentionLevel === "critical" || row.attentionLevel === "high")
            .slice(0, 6)
            .map((row) => ({
              id: row.id,
              title: `${row.reference}: ${row.nextBestAction}`,
              description: row.attentionReasons[0] ?? "Booking requires operations review.",
              severity: row.attentionLevel === "none" ? "info" : row.attentionLevel,
              href: row.rowHref,
              actionLabel: "Open booking",
            }))}
          suggestions={[
            {
              id: "payment-attention",
              title: "Open payment attention view",
              description: "Filter to reservations with pending, failed, or review payment records.",
              severity: statusCounts.payment_attention ? "high" : "info",
              href: createBookingsHref(data.filters, { segment: "payment_attention", page: 1, bookingId: null }),
              actionLabel: "Open view",
            },
            {
              id: "handover-missing",
              title: "Open missing handovers",
              description: "Find upcoming arrivals without a linked field-ops task.",
              severity: statusCounts.handover_missing ? "high" : "info",
              href: createBookingsHref(data.filters, { segment: "handover_missing", page: 1, bookingId: null }),
              actionLabel: "Open view",
            },
            {
              id: "paypal-status",
              title: data.provider.isConfigured ? "PayPal order creation available" : "PayPal setup required",
              description: data.provider.isConfigured
                ? `Provider is ${data.provider.environment}; orders can be created from locked snapshots.`
                : "PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are required before order creation.",
              severity: data.provider.isConfigured ? "info" : "high",
              href: "/admin/payments",
              actionLabel: "Open payments",
            },
          ]}
        />
      }
    >
      <div className="space-y-5">
        <section className="rounded-md border bg-background p-4 shadow-sm">
          <div className="grid gap-4 xl:grid-cols-[1fr_360px] xl:items-start">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={data.filters.segment} label={selectLabel(data.filters.segment)} />
                <RiskBadge
                  severity={moduleStatus === "critical" ? "critical" : moduleStatus === "requires_review" ? "high" : "info"}
                  label={moduleStatus === "operational" ? "Queue stable" : "Review needed"}
                />
              </div>
              <h1 className="mt-3 text-2xl font-semibold">Reservation Control Room</h1>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                {activeSegmentDescription(data.filters.segment)} Rows open into a live booking workspace with linked records, timelines, and validated actions.
              </p>
            </div>
            <ProviderStatus
              provider="PayPal"
              environment={data.provider.environment}
              status={data.provider.status}
              details={[
                { label: "Environment", ok: true, value: data.provider.environment },
                { label: "Client id", ok: data.provider.hasClientId, value: data.provider.hasClientId ? "Present" : "Missing" },
                { label: "Server secret", ok: data.provider.hasSecret, value: data.provider.hasSecret ? "Present" : "Missing" },
                { label: "Webhook id", ok: data.provider.hasWebhookId, value: data.provider.hasWebhookId ? "Configured" : "Unconfigured" },
              ]}
            />
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <KpiCard label="Reservations in view" value={data.pagination.totalCount} />
          <KpiCard label="Requires attention" value={statusCounts.requires_attention ?? 0} href={createBookingsHref(data.filters, { segment: "requires_attention", page: 1, bookingId: null })} tone={(statusCounts.requires_attention ?? 0) ? "danger" : "success"} />
          <KpiCard label="Payment attention" value={statusCounts.payment_attention ?? 0} href={createBookingsHref(data.filters, { segment: "payment_attention", page: 1, bookingId: null })} tone={(statusCounts.payment_attention ?? 0) ? "warning" : "success"} />
          <KpiCard label="Handover missing" value={statusCounts.handover_missing ?? 0} href={createBookingsHref(data.filters, { segment: "handover_missing", page: 1, bookingId: null })} tone={(statusCounts.handover_missing ?? 0) ? "warning" : "success"} />
          <KpiCard label="Open disputes" value={statusCounts.dispute_open ?? 0} href={createBookingsHref(data.filters, { segment: "dispute_open", page: 1, bookingId: null })} tone={(statusCounts.dispute_open ?? 0) ? "danger" : "success"} />
        </section>

        <section className="rounded-md border bg-background p-4 shadow-sm">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="font-semibold">Saved operational views</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Segments are deterministic filters over real reservations and linked payment, handover, dispute, and verification records.
              </p>
            </div>
            <ReadinessMeter
              label="Current page readiness"
              score={data.intelligence.averageReadiness}
              detail={data.intelligence.averageReadiness === null ? "No rows to score." : "Computed from linked operational state."}
            />
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            {data.segmentCounts.map((segment) => {
              const active = data.filters.segment === segment.id;
              return (
                <Link
                  key={segment.id}
                  href={createBookingsHref(data.filters, { segment: segment.id, page: 1, bookingId: null })}
                  className={[
                    "rounded-md border p-3 text-sm transition-colors hover:border-foreground/30",
                    active ? "border-foreground/40 bg-muted/50" : "bg-background",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{segment.label}</span>
                    <span className="rounded-full border bg-background px-2 py-0.5 text-xs font-semibold">{segment.count}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{segment.description}</p>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="rounded-md border bg-background p-4 shadow-sm">
          <div className="flex flex-col gap-1">
            <h2 className="font-semibold">Advanced filters</h2>
            <p className="text-sm text-muted-foreground">
              Query reservations by guest, property, booking id, linked record state, partner, date range, and attention state.
            </p>
          </div>
          <form action="/admin/bookings" className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <input type="hidden" name="segment" value={data.filters.segment} />
            <label className="xl:col-span-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Search</span>
              <Input
                name="search"
                defaultValue={data.filters.search ?? ""}
                placeholder="Guest, email, property, city, reservation id"
                className="mt-1"
              />
            </label>
            <label>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</span>
              <select name="status" defaultValue={data.filters.status ?? ""} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">Any status</option>
                {BOOKING_LIFECYCLE_STATUSES.map((status) => (
                  <option key={status} value={status}>{selectLabel(status)}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Payment</span>
              <select name="paymentStatus" defaultValue={data.filters.paymentStatus ?? ""} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">Any payment</option>
                <option value="missing">Missing</option>
                <option value="attention">Pending/review/failed</option>
                <option value="pending_approval">Pending approval</option>
                <option value="authorized">Authorized</option>
                <option value="captured">Captured</option>
                <option value="requires_review">Requires review</option>
                <option value="failed">Failed</option>
              </select>
            </label>
            <label>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Handover</span>
              <select name="handoverStatus" defaultValue={data.filters.handoverStatus ?? ""} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">Any handover</option>
                <option value="missing">Missing</option>
                <option value="not_scheduled">Not scheduled</option>
                <option value="pending_preparation">Pending preparation</option>
                <option value="ready">Ready</option>
                <option value="in_progress">In progress</option>
                <option value="completed">Completed</option>
                <option value="issue_reported">Issue reported</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
            <label>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Dispute</span>
              <select name="disputeStatus" defaultValue={data.filters.disputeStatus ?? ""} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">Any dispute</option>
                <option value="open_active">Open/active</option>
                <option value="open">Open</option>
                <option value="under_review">Under review</option>
                <option value="awaiting_guest">Awaiting guest</option>
                <option value="awaiting_partner">Awaiting partner</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </label>
            <label>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">From</span>
              <Input name="from" type="date" defaultValue={data.filters.from ?? ""} className="mt-1" />
            </label>
            <label>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">To</span>
              <Input name="to" type="date" defaultValue={data.filters.to ?? ""} className="mt-1" />
            </label>
            <label>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Property id</span>
              <Input name="propertyId" defaultValue={data.filters.propertyId ?? ""} placeholder="Property id" className="mt-1" />
            </label>
            <label>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Partner id</span>
              <Input name="partnerId" defaultValue={data.filters.partnerId ?? ""} placeholder="Partner/host id" className="mt-1" />
            </label>
            <label>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Page size</span>
              <select name="pageSize" defaultValue={String(data.filters.pageSize)} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="10">10 rows</option>
                <option value="25">25 rows</option>
                <option value="50">50 rows</option>
                <option value="100">100 rows</option>
              </select>
            </label>
            <label className="flex min-h-10 items-center gap-2 rounded-md border px-3 text-sm md:mt-5">
              <input type="checkbox" name="attentionOnly" value="1" defaultChecked={data.filters.requiresAttentionOnly} className="h-4 w-4 rounded border-input" />
              Requires attention only
            </label>
            <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-6">
              <Button type="submit">Apply filters</Button>
              <Link className="inline-flex min-h-10 items-center rounded-md border px-3 text-sm font-medium hover:border-foreground/30" href="/admin/bookings">
                Reset
              </Link>
            </div>
          </form>
        </section>

        <section className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-3">
            <div className="flex flex-col gap-2 rounded-md border bg-background p-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="font-semibold">Booking queue</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Showing {data.pagination.from}-{data.pagination.to} of {data.pagination.totalCount}. Rows are clickable; action buttons stay isolated.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge status={data.filters.segment} label={selectLabel(data.filters.segment)} />
                <RiskBadge severity={data.intelligence.criticalCount ? "critical" : data.intelligence.highCount ? "high" : "info"} label={`${data.intelligence.currentPageAttentionCount} attention`} />
              </div>
            </div>

            <BookingOperationsClient
              rows={rows}
              returnTo={returnTo}
              selectedBookingId={selectedId}
            />

            {!hasRows ? (
              <EmptyState
                title="No reservations match this operations view"
                description="Bookings are never fabricated. This view is empty because no real Reservation rows match the selected segment and filters."
                why="The current query returned zero Reservation records after applying status, date, linked payment/handover/dispute filters, and attention rules."
                createsRecords="Guest reservation flows create reservations. Admins can prepare payment, handover, dispute, and verification operations only after real bookings exist."
                checklist={[
                  "Remove filters or switch to the All segment.",
                  "Review Property Trust if expected supply has not reached public booking readiness.",
                  "Open Marketplace Operations for supply, payment, and localization readiness.",
                  data.provider.isConfigured ? "PayPal is configured for order creation." : "PayPal setup is required before booking payment orders can be created.",
                ]}
                links={[
                  { href: "/admin/marketplace-operations", label: "Open Marketplace Operations" },
                  { href: "/admin/property-trust", label: "Open Property Trust" },
                  { href: "/admin/payments", label: "Open Payments" },
                ]}
              />
            ) : null}

            <div className="flex flex-col gap-3 rounded-md border bg-background p-3 shadow-sm md:flex-row md:items-center md:justify-between">
              <p className="text-sm text-muted-foreground">
                Page {data.pagination.page} of {data.pagination.totalPages}
              </p>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={createBookingsHref(data.filters, { page: Math.max(1, data.pagination.page - 1), bookingId: null })}
                  className={[
                    "inline-flex min-h-10 items-center rounded-md border px-3 text-sm font-medium hover:border-foreground/30",
                    data.pagination.page <= 1 ? "pointer-events-none opacity-50" : "",
                  ].join(" ")}
                >
                  Previous
                </Link>
                <Link
                  href={createBookingsHref(data.filters, { page: Math.min(data.pagination.totalPages, data.pagination.page + 1), bookingId: null })}
                  className={[
                    "inline-flex min-h-10 items-center rounded-md border px-3 text-sm font-medium hover:border-foreground/30",
                    data.pagination.page >= data.pagination.totalPages ? "pointer-events-none opacity-50" : "",
                  ].join(" ")}
                >
                  Next
                </Link>
              </div>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-md border bg-background p-4 shadow-sm">
              <h2 className="font-semibold">Queue blockers</h2>
              <div className="mt-3 space-y-3">
                {rows.filter((row) => row.attentionReasons.length).slice(0, 8).map((row) => (
                  <Link key={row.id} href={row.rowHref} className="block rounded-md border p-3 hover:border-foreground/30">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{row.reference}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{row.attentionReasons[0]}</p>
                      </div>
                      <RiskBadge severity={row.attentionLevel} />
                    </div>
                  </Link>
                ))}
                {rows.every((row) => row.attentionReasons.length === 0) ? (
                  <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                    No blockers in the current page.
                  </div>
                ) : null}
              </div>
            </div>

            <div className="rounded-md border bg-background p-4 shadow-sm">
              <h2 className="font-semibold">Operational routing</h2>
              <div className="mt-3 grid gap-2">
                <Link href={createBookingsHref(data.filters, { segment: "upcoming_arrivals", page: 1, bookingId: null })} className="inline-flex min-h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium hover:border-foreground/30">
                  <CalendarDays className="h-4 w-4" />
                  Upcoming arrivals
                </Link>
                <Link href={createBookingsHref(data.filters, { segment: "payment_attention", page: 1, bookingId: null })} className="inline-flex min-h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium hover:border-foreground/30">
                  <CreditCard className="h-4 w-4" />
                  Payment queue
                </Link>
                <Link href={createBookingsHref(data.filters, { segment: "handover_missing", page: 1, bookingId: null })} className="inline-flex min-h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium hover:border-foreground/30">
                  <KeyRound className="h-4 w-4" />
                  Missing handovers
                </Link>
                <Link href={createBookingsHref(data.filters, { segment: "dispute_open", page: 1, bookingId: null })} className="inline-flex min-h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium hover:border-foreground/30">
                  <ShieldAlert className="h-4 w-4" />
                  Open disputes
                </Link>
                <Link href="/admin/verifications" className="inline-flex min-h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium hover:border-foreground/30">
                  <FileSearch className="h-4 w-4" />
                  Verification queue
                </Link>
              </div>
            </div>

            <div className="rounded-md border bg-background p-4 shadow-sm">
              <h2 className="font-semibold">Snapshot protection</h2>
              <div className="mt-3 flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Booking operations never mutate reservation price snapshots. Payment and handover records are linked to the booking, not written into the protected snapshot.
                </p>
              </div>
            </div>
          </aside>
        </section>
      </div>

      {selectedDetail ? (
        <BookingDetailDrawer
          detail={selectedDetail}
          currencyState={currencyState}
          closeHref={closeHref}
          returnTo={returnTo}
          notice={notice}
          error={error}
        />
      ) : selectedId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4">
          <div className="max-w-lg rounded-md border bg-background p-6 shadow-2xl">
            <h2 className="text-lg font-semibold">Booking not found</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              The selected reservation id does not exist or is no longer available.
            </p>
            <Link href={closeHref} className="mt-4 inline-flex min-h-10 items-center rounded-md border px-3 text-sm font-medium hover:border-foreground/30">
              Return to booking queue
            </Link>
          </div>
        </div>
      ) : null}
    </ModuleShell>
  );
}
