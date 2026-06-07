import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import {
  CalendarCheck,
  ClipboardCheck,
  Hammer,
  Home,
  PackageCheck,
  ShieldAlert,
  UserRound,
} from "lucide-react";

import { EmptyState } from "@/app/components/admin/EmptyState";
import { IntelligencePanel } from "@/app/components/admin/IntelligencePanel";
import { KpiCard } from "@/app/components/admin/KpiCard";
import { LinkedRecordCard } from "@/app/components/admin/LinkedRecordCard";
import { ModuleShell } from "@/app/components/admin/ModuleShell";
import { ReadinessMeter } from "@/app/components/admin/ReadinessMeter";
import { RiskBadge } from "@/app/components/admin/RiskBadge";
import { StatusBadge } from "@/app/components/admin/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { requireAdmin } from "@/app/lib/auth";
import {
  HANDOVER_PRIORITIES,
  HANDOVER_STATUSES,
  HANDOVER_TYPES,
  getHandoverOperationsDetail,
  getHandoverOperationsIndex,
} from "@/app/lib/handoverOperations";
import {
  createHandoverHref,
  readHandoverParam,
  type HandoverSearchParams,
} from "@/app/lib/handoverFilters";
import { formatDate, formatDateTime } from "@/app/lib/marketplaceStatus";
import { createHandoverTaskAction } from "./actions";
import { HandoverDetailDrawer } from "./HandoverDetailDrawer";
import { HandoverOperationsClient } from "./HandoverOperationsClient";

type AdminHandoverPageProps = {
  searchParams?: HandoverSearchParams;
};

function selectLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dateInputValue(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : "";
}

function dateTimeInputValue(value?: Date | null) {
  return value ? value.toISOString().slice(0, 16) : "";
}

function personName(user: { firstName: string; lastName: string; email: string }) {
  return `${user.firstName} ${user.lastName}`.trim() || user.email;
}

function reservationOptionLabel(item: Awaited<ReturnType<typeof getHandoverOperationsIndex>>["queues"]["availableReservations"][number]) {
  return `${item.reference} - ${formatDate(item.checkInIso)} - ${item.title} - ${item.guestName}`;
}

export default async function AdminHandoverPage({ searchParams }: AdminHandoverPageProps) {
  await requireAdmin();
  const data = await getHandoverOperationsIndex(searchParams);
  const selectedDetail = data.filters.handoverId ? await getHandoverOperationsDetail(data.filters.handoverId) : null;
  const notice = readHandoverParam(searchParams, "notice");
  const error = readHandoverParam(searchParams, "error");
  const closeHref = createHandoverHref(data.filters, { handoverId: null, notice: null, error: null });
  const returnTo = createHandoverHref(data.filters, { notice: null, error: null });
  const rows = data.rows.map((row) => ({
    ...row,
    rowHref: createHandoverHref(data.filters, { handoverId: row.id, notice: null, error: null }),
  }));
  const boardRows = data.boardRows.map((row) => ({
    ...row,
    rowHref: createHandoverHref(data.filters, { handoverId: row.id, notice: null, error: null }),
  }));
  const previousHref = data.pagination.page > 1
    ? createHandoverHref(data.filters, { page: data.pagination.page - 1, handoverId: null, notice: null, error: null })
    : null;
  const nextHref = data.pagination.page < data.pagination.totalPages
    ? createHandoverHref(data.filters, { page: data.pagination.page + 1, handoverId: null, notice: null, error: null })
    : null;
  const moduleStatus = data.intelligence.criticalCount
    ? "critical"
    : data.intelligence.highCount || data.intelligence.issueReportedCount
      ? "requires_review"
      : data.intelligence.currentPageAttentionCount
        ? "watching"
        : "operational";
  const allTaskCount = Object.values(data.statusCounts).reduce((sum, count) => sum + count, 0);
  const hasNoTasks = allTaskCount === 0 && data.pagination.totalCount === 0;
  const arrivalsMissing = data.queues.upcomingArrivals.filter((item) => item.missingCheckInTask);
  const checkoutsMissing = data.queues.upcomingCheckouts.filter((item) => item.missingCheckoutTask);

  return (
    <ModuleShell
      title="Handover Operations"
      description="Full stay-cycle execution control for pre-arrival preparation, check-in readiness, guest arrival, property handover, cleaning, maintenance, in-stay support, checkout, inspection, issue follow-up, and linked dispute escalation."
      moduleStatus={moduleStatus}
      statusLabel={
        data.intelligence.issueReportedCount
          ? `${data.intelligence.issueReportedCount} issues reported`
          : `${data.intelligence.activeTasksCount} active tasks`
      }
      notice={notice}
      error={error}
      layout="operations"
      navigation={<StayCycleRail data={data} />}
      intelligence={
        <IntelligencePanel
          title="Handover intelligence"
          readiness={[
            {
              label: "Readiness score",
              score: data.intelligence.averageReadiness,
              detail: data.intelligence.averageReadiness === null
                ? "No handover tasks in the current view."
                : "Computed from live linked task, reservation, payment, dispute, property, partner, and checklist state.",
            },
            {
              label: "Arrival coverage",
              score: data.queues.upcomingArrivals.length
                ? Math.max(0, 100 - arrivalsMissing.length * 20)
                : null,
              detail: `${arrivalsMissing.length} upcoming arrival${arrivalsMissing.length === 1 ? "" : "s"} missing check-in tasks.`,
            },
          ]}
          blockers={[
            ...data.queues.urgentIssues.slice(0, 3).map((row) => ({
              id: `urgent-${row.id}`,
              title: `${row.taskNumber} urgent issue`,
              description: row.attentionReasons[0] ?? row.title,
              severity: row.attentionLevel === "none" ? "info" as const : row.attentionLevel,
              href: createHandoverHref(data.filters, { handoverId: row.id }),
              actionLabel: "Open task",
            })),
            ...data.queues.overdueRows.slice(0, 2).map((row) => ({
              id: `overdue-${row.id}`,
              title: `${row.taskNumber} overdue`,
              description: row.attentionReasons[0] ?? "Task is overdue.",
              severity: "high" as const,
              href: createHandoverHref(data.filters, { handoverId: row.id }),
              actionLabel: "Open task",
            })),
            ...data.queues.paymentNotReadyRows.slice(0, 2).map((row) => ({
              id: `payment-${row.id}`,
              title: `${row.taskNumber} payment not ready`,
              description: "Linked payment is missing, pending, failed, or requires review.",
              severity: "medium" as const,
              href: createHandoverHref(data.filters, { handoverId: row.id }),
              actionLabel: "Open task",
            })),
          ]}
          suggestions={[
            {
              id: "bulk-create",
              title: "Create tasks from upcoming paid reservations",
              description: `${data.automationCandidateCount} upcoming confirmed/reserved paid reservation${data.automationCandidateCount === 1 ? "" : "s"} appear eligible.`,
              severity: data.automationCandidateCount ? "medium" : "info",
            },
            {
              id: "missing-arrivals",
              title: "Upcoming arrivals without handover task",
              description: `${arrivalsMissing.length} arrival${arrivalsMissing.length === 1 ? "" : "s"} missing check-in task coverage.`,
              severity: arrivalsMissing.length ? "high" : "info",
              href: createHandoverHref(data.filters, { upcomingArrivals: true, page: 1, handoverId: null }),
              actionLabel: "Filter arrivals",
            },
            {
              id: "missing-checkouts",
              title: "Upcoming checkouts without checkout task",
              description: `${checkoutsMissing.length} checkout${checkoutsMissing.length === 1 ? "" : "s"} missing checkout task coverage.`,
              severity: checkoutsMissing.length ? "medium" : "info",
              href: createHandoverHref(data.filters, { upcomingCheckouts: true, page: 1, handoverId: null }),
              actionLabel: "Filter checkouts",
            },
            ...data.intelligence.nextBestActions.slice(0, 4).map((action) => ({
              id: `nba-${action.id}`,
              title: action.title,
              description: action.description,
              severity: action.severity === "none" ? "info" as const : action.severity,
              href: action.href,
              actionLabel: "Open task",
            })),
          ]}
        >
          <RightIntelligenceBreakdown data={data} />
        </IntelligencePanel>
      }
    >
      <div className="space-y-5">
        <section className="rounded-md border border-slate-300 bg-white p-4 shadow-sm">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={data.filters.segment} label={selectLabel(data.filters.segment)} />
                <RiskBadge severity={moduleStatus === "critical" ? "critical" : moduleStatus === "requires_review" ? "high" : "info"} label={moduleStatus === "operational" ? "Field queue stable" : "Review needed"} />
              </div>
              <h1 className="mt-3 text-2xl font-semibold">Full Stay Cycle Command Center</h1>
              <p className="mt-2 max-w-4xl text-sm text-muted-foreground">
                Live field operations for preparation, arrival, property handover, cleaning, maintenance, guest support, checkout, inspection, issues, and dispute escalation. No fake tasks and no private access details are stored.
              </p>
            </div>
            <ReadinessMeter
              label="Current view readiness"
              score={data.intelligence.averageReadiness}
              detail={data.intelligence.averageReadiness === null ? "No tasks in this view." : `${data.pagination.from}-${data.pagination.to} of ${data.pagination.totalCount} tasks in scope.`}
            />
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <KpiCard label="Active tasks" value={data.intelligence.activeTasksCount} detail="Not scheduled, pending, ready, in progress, or issue reported." />
          <KpiCard label="Upcoming arrivals" value={data.intelligence.upcomingArrivalsCount} detail={`${arrivalsMissing.length} missing check-in task coverage`} href={createHandoverHref(data.filters, { upcomingArrivals: true, page: 1, handoverId: null })} tone={arrivalsMissing.length ? "warning" : "success"} />
          <KpiCard label="Upcoming checkouts" value={data.intelligence.upcomingCheckoutsCount} detail={`${checkoutsMissing.length} missing checkout task coverage`} href={createHandoverHref(data.filters, { upcomingCheckouts: true, page: 1, handoverId: null })} tone={checkoutsMissing.length ? "warning" : "success"} />
          <KpiCard label="Issues reported" value={data.intelligence.issueReportedCount} href={createHandoverHref(data.filters, { status: "issue_reported", page: 1, handoverId: null })} tone={data.intelligence.issueReportedCount ? "danger" : "success"} />
          <KpiCard label="Readiness score" value={data.intelligence.averageReadiness === null ? "Foundation" : `${data.intelligence.averageReadiness}%`} tone={(data.intelligence.averageReadiness ?? 100) < 70 ? "warning" : "success"} />
        </section>

        <section className="grid gap-4 xl:grid-cols-4">
          <QueuePanel title="Upcoming arrivals" Icon={CalendarCheck}>
            {data.queues.upcomingArrivals.slice(0, 6).map((item) => (
              <LinkedRecordCard
                key={`arrival-${item.id}`}
                type={item.missingCheckInTask ? "Arrival missing task" : "Arrival covered"}
                title={`${item.reference}: ${item.title}`}
                subtitle={`${formatDate(item.checkInIso)} - ${item.guestName}`}
                status={item.missingCheckInTask ? "missing" : item.paymentStatus}
                href={item.rowHref}
                Icon={UserRound}
                meta={item.city ?? "City not set"}
              />
            ))}
            {data.queues.upcomingArrivals.length === 0 ? <QueueEmpty label="No upcoming arrivals in the current operations window." /> : null}
          </QueuePanel>

          <QueuePanel title="Upcoming checkouts" Icon={PackageCheck}>
            {data.queues.upcomingCheckouts.slice(0, 6).map((item) => (
              <LinkedRecordCard
                key={`checkout-${item.id}`}
                type={item.missingCheckoutTask ? "Checkout missing task" : "Checkout covered"}
                title={`${item.reference}: ${item.title}`}
                subtitle={`${formatDate(item.checkOutIso)} - ${item.guestName}`}
                status={item.missingCheckoutTask ? "missing" : item.bookingStatus}
                href={item.rowHref}
                Icon={CalendarCheck}
                meta={item.city ?? "City not set"}
              />
            ))}
            {data.queues.upcomingCheckouts.length === 0 ? <QueueEmpty label="No upcoming checkouts in the current operations window." /> : null}
          </QueuePanel>

          <QueuePanel title="Cleaning / turnover" Icon={ClipboardCheck}>
            {data.queues.cleaningQueue.slice(0, 6).map((row) => (
              <LinkedRecordCard
                key={`cleaning-${row.id}`}
                type={row.typeLabel}
                title={`${row.taskNumber}: ${row.title}`}
                subtitle={`${formatDateTime(row.scheduledForIso, "Not scheduled")} - ${row.propertyTitle}`}
                status={row.status}
                href={row.rowHref}
                Icon={Home}
                meta={`${row.checklistLabel} checklist`}
              />
            ))}
            {data.queues.cleaningQueue.length === 0 ? <QueueEmpty label="No cleaning or turnover tasks in the current table view." /> : null}
          </QueuePanel>

          <QueuePanel title="Maintenance / issues" Icon={Hammer}>
            {data.queues.maintenanceQueue.slice(0, 6).map((row) => (
              <LinkedRecordCard
                key={`maintenance-${row.id}`}
                type={row.typeLabel}
                title={`${row.taskNumber}: ${row.title}`}
                subtitle={row.attentionReasons[0] ?? row.propertyTitle}
                status={row.priority}
                href={row.rowHref}
                Icon={ShieldAlert}
                meta={row.disputeStatus === "none" ? "No linked dispute" : `Dispute ${row.disputeStatus}`}
              />
            ))}
            {data.queues.maintenanceQueue.length === 0 ? <QueueEmpty label="No maintenance or issue-follow-up tasks in the current table view." /> : null}
          </QueuePanel>
        </section>

        <section className="rounded-md border bg-background p-4 shadow-sm">
          <div className="flex flex-col gap-1">
            <h2 className="font-semibold">Advanced filters</h2>
            <p className="text-sm text-muted-foreground">
              Search and filter by task, reservation, guest, property, partner, lifecycle, dates, city, assignment, payment readiness, disputes, and missing links.
            </p>
          </div>
          <form action="/admin/handover" className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <input type="hidden" name="segment" value={data.filters.segment === "all" ? "" : data.filters.segment} />
            <label className="xl:col-span-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Search</span>
              <Input name="q" defaultValue={data.filters.search ?? ""} placeholder="Reservation, guest, property, partner, task number" className="mt-1" />
            </label>
            <FilterSelect name="type" label="Task type" value={data.filters.type} options={HANDOVER_TYPES.map((type) => [type, selectLabel(type)])} empty="Any type" />
            <FilterSelect name="status" label="Status" value={data.filters.status} options={HANDOVER_STATUSES.map((status) => [status, selectLabel(status)])} empty="Any status" />
            <FilterSelect name="priority" label="Priority" value={data.filters.priority} options={HANDOVER_PRIORITIES.map((priority) => [priority, selectLabel(priority)])} empty="Any priority" />
            <label>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Page size</span>
              <select name="pageSize" defaultValue={data.filters.pageSize} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size} rows</option>)}
              </select>
            </label>
            <label>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Scheduled from</span>
              <Input name="scheduledFrom" type="date" defaultValue={dateInputValue(data.filters.scheduledFrom)} className="mt-1" />
            </label>
            <label>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Scheduled to</span>
              <Input name="scheduledTo" type="date" defaultValue={dateInputValue(data.filters.scheduledTo)} className="mt-1" />
            </label>
            <label>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">City</span>
              <Input name="city" defaultValue={data.filters.city ?? ""} placeholder="City" className="mt-1" />
            </label>
            <label>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Property id</span>
              <Input name="propertyId" defaultValue={data.filters.propertyId ?? ""} placeholder="Property id" className="mt-1" />
            </label>
            <label>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Assigned admin</span>
              <select name="assignedToId" defaultValue={data.filters.assignedToId ?? ""} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">Any assignee</option>
                {data.assignableAdmins.map((admin) => (
                  <option key={admin.id} value={admin.id}>{personName(admin)}</option>
                ))}
              </select>
            </label>
            <div className="grid gap-2 rounded-md border bg-muted/20 p-3 text-sm md:col-span-2 xl:col-span-6">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Operational flags</span>
              <div className="flex flex-wrap gap-3">
                <FlagCheckbox name="issueOnly" checked={data.filters.issueOnly} label="Issue reported only" />
                <FlagCheckbox name="missingReservation" checked={data.filters.missingReservation} label="Missing reservation link" />
                <FlagCheckbox name="upcomingArrivals" checked={data.filters.upcomingArrivals} label="Upcoming arrivals" />
                <FlagCheckbox name="upcomingCheckouts" checked={data.filters.upcomingCheckouts} label="Upcoming checkouts" />
                <FlagCheckbox name="paymentNotReady" checked={data.filters.paymentNotReady} label="Payment not ready" />
                <FlagCheckbox name="disputeOpen" checked={data.filters.disputeOpen} label="Dispute open" />
              </div>
            </div>
            <div className="flex gap-2 md:col-span-2 xl:col-span-6">
              <Button type="submit">Apply filters</Button>
              <Button asChild variant="outline"><Link href="/admin/handover">Reset</Link></Button>
            </div>
          </form>
        </section>

        <section className="rounded-md border bg-background p-4 shadow-sm">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h2 className="font-semibold">Create manual handover task</h2>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Use this for cleaning, maintenance, checkout, guest support, and issue follow-up work that is not generated from reservations. Store operational readiness only.
              </p>
            </div>
            <RiskBadge severity="info" label="No access secrets" />
          </div>
          <form action={createHandoverTaskAction} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <input type="hidden" name="returnTo" value={returnTo} />
            <label className="xl:col-span-3">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Linked reservation</span>
              <select name="reservationId" className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">No reservation link</option>
                {data.queues.availableReservations.map((reservation) => (
                  <option key={reservation.id} value={reservation.id}>{reservationOptionLabel(reservation)}</option>
                ))}
              </select>
            </label>
            <FilterSelect name="type" label="Task type" value="check_in" options={HANDOVER_TYPES.map((type) => [type, selectLabel(type)])} empty={null} />
            <FilterSelect name="priority" label="Priority" value="medium" options={HANDOVER_PRIORITIES.map((priority) => [priority, selectLabel(priority)])} empty={null} />
            <label>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Scheduled for</span>
              <Input name="scheduledFor" type="datetime-local" defaultValue={dateTimeInputValue(null)} className="mt-1" />
            </label>
            <label className="md:col-span-2 xl:col-span-6">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Title</span>
              <Input name="title" placeholder="Operational task title" required className="mt-1" />
            </label>
            <label className="md:col-span-2 xl:col-span-6">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Safe summary</span>
              <Textarea name="summary" rows={3} placeholder="Operational summary only. Do not store access codes or private instructions." className="mt-1" />
            </label>
            <label>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Property id optional</span>
              <Input name="propertyId" placeholder="Property id" className="mt-1" />
            </label>
            <label>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Guest id optional</span>
              <Input name="guestId" placeholder="Guest id" className="mt-1" />
            </label>
            <label>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Partner id optional</span>
              <Input name="partnerId" placeholder="Partner id" className="mt-1" />
            </label>
            <label>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Assign to</span>
              <select name="assignedToId" className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">Unassigned</option>
                {data.assignableAdmins.map((admin) => (
                  <option key={admin.id} value={admin.id}>{personName(admin)}</option>
                ))}
              </select>
            </label>
            <label className="md:col-span-2 xl:col-span-6">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Custom checklist optional</span>
              <Textarea name="checklist" rows={4} placeholder="Optional safe checklist labels, one per line. Leave empty for task-specific defaults." className="mt-1" />
            </label>
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 md:col-span-2 xl:col-span-6">
              Do not store door codes, lockbox codes, alarm codes, passwords, or private access instructions. Access coordination handled outside this record.
            </div>
            <Button type="submit" className="md:col-span-2 xl:col-span-6">Create manual handover task</Button>
          </form>
        </section>

        {hasNoTasks ? (
          <EmptyState
            title="No handover tasks yet."
            description="Tasks are created from upcoming reservations or manually for cleaning, maintenance, checkout, and issue follow-up."
            why="No HandoverTask rows exist in this operations view. No fake tasks are generated."
            createsRecords="Task creation depends on real reservations or explicit manual operations work."
            checklist={[
              "Create tasks from upcoming reservations.",
              "Open bookings to review reservation readiness.",
              "Open payments to confirm payment readiness.",
              "Create a manual handover task when field work exists outside reservation automation.",
            ]}
            links={[
              { href: "/admin/bookings", label: "Open bookings" },
              { href: "/admin/payments", label: "Open payments" },
            ]}
          />
        ) : null}

        {data.queues.availableReservations.length === 0 ? (
          <div className="rounded-md border border-dashed bg-background p-5 text-sm text-muted-foreground">
            <h2 className="font-semibold text-foreground">No reservations available for automatic handover task creation.</h2>
            <p className="mt-2">Open bookings to create or review reservations. Automatic task creation never fabricates reservation records.</p>
            <Button asChild variant="outline" className="mt-4"><Link href="/admin/bookings">Open bookings</Link></Button>
          </div>
        ) : null}

        <HandoverOperationsClient
          rows={rows}
          boardRows={boardRows}
          statusCounts={data.statusCounts}
          returnTo={returnTo}
          selectedHandoverId={data.filters.handoverId}
          assignableAdmins={data.assignableAdmins}
          automationCandidateCount={data.automationCandidateCount}
          pagination={{
            totalCount: data.pagination.totalCount,
            from: data.pagination.from,
            to: data.pagination.to,
            page: data.pagination.page,
            totalPages: data.pagination.totalPages,
            previousHref,
            nextHref,
          }}
        />

        {selectedDetail ? (
          <HandoverDetailDrawer
            detail={selectedDetail}
            closeHref={closeHref}
            returnTo={returnTo}
            notice={notice}
            error={error}
          />
        ) : null}
      </div>
    </ModuleShell>
  );
}

function StayCycleRail({ data }: { data: Awaited<ReturnType<typeof getHandoverOperationsIndex>> }) {
  return (
    <section className="rounded-md border bg-background p-3 shadow-sm">
      <h2 className="px-1 text-sm font-semibold">Stay cycle rail</h2>
      <p className="mt-1 px-1 text-xs text-muted-foreground">Lifecycle segments filter and summarize real tasks.</p>
      <div className="mt-3 grid gap-2">
        {data.segmentCounts.map((segment) => {
          const active = data.filters.segment === segment.id;
          return (
            <Link
              key={segment.id}
              href={createHandoverHref(data.filters, { segment: segment.id === "all" ? null : segment.id, page: 1, handoverId: null, notice: null, error: null })}
              className={[
                "rounded-md border p-3 text-sm transition-colors hover:border-foreground/30",
                active ? "border-foreground/40 bg-muted/50" : "bg-background",
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{segment.label}</span>
                <span className="rounded-full border bg-background px-2 py-0.5 text-xs font-semibold">{segment.count}</span>
              </div>
              <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{segment.description}</p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function RightIntelligenceBreakdown({ data }: { data: Awaited<ReturnType<typeof getHandoverOperationsIndex>> }) {
  const rows = [
    ["Urgent issues", data.queues.urgentIssues.length, data.queues.urgentIssues.length ? "critical" : "info"],
    ["Arrivals without task", data.queues.upcomingArrivals.filter((item) => item.missingCheckInTask).length, "high"],
    ["Checkouts without task", data.queues.upcomingCheckouts.filter((item) => item.missingCheckoutTask).length, "medium"],
    ["Tasks overdue", data.queues.overdueRows.length, "high"],
    ["Payment not ready", data.queues.paymentNotReadyRows.length, "medium"],
    ["Dispute open", data.queues.disputeOpenRows.length, "high"],
    ["Maintenance issue open", data.queues.maintenanceQueue.length, "medium"],
    ["Missing reservation link", data.queues.missingReservationRows.length, "medium"],
  ] as const;

  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <h3 className="text-sm font-semibold">Signal breakdown</h3>
      <div className="mt-3 grid gap-2">
        {rows.map(([label, count, severity]) => (
          <div key={label} className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <RiskBadge severity={count ? severity : "info"} label={String(count)} />
          </div>
        ))}
      </div>
    </div>
  );
}

function QueuePanel({ title, Icon, children }: { title: string; Icon: ComponentType<{ className?: string }>; children: ReactNode }) {
  return (
    <section className="rounded-md border bg-background p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h2 className="font-semibold">{title}</h2>
      </div>
      <div className="mt-3 space-y-2">{children}</div>
    </section>
  );
}

function QueueEmpty({ label }: { label: string }) {
  return <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">{label}</div>;
}

function FilterSelect({
  name,
  label,
  value,
  options,
  empty,
}: {
  name: string;
  label: string;
  value?: string | null;
  options: [string, string][];
  empty: string | null;
}) {
  return (
    <label>
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <select name={name} defaultValue={value ?? ""} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
        {empty !== null ? <option value="">{empty}</option> : null}
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </label>
  );
}

function FlagCheckbox({ name, checked, label }: { name: string; checked: boolean; label: string }) {
  return (
    <label className="inline-flex items-center gap-2">
      <input name={name} type="checkbox" defaultChecked={checked} className="h-4 w-4 rounded border-input" />
      {label}
    </label>
  );
}
