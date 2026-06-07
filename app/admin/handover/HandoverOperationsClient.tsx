"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  CheckSquare,
  ClipboardCheck,
  Download,
  FileText,
  Loader2,
  PackageCheck,
  Square,
  UserPlus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { HandoverOperationsRow } from "@/app/lib/handoverOperations";
import { HANDOVER_STATUSES } from "@/app/lib/handoverFilters";
import { HANDOVER_STATUS_LABELS } from "@/app/lib/handoverIntelligence";
import {
  bulkAssignHandoverTasksAction,
  bulkCreateHandoverTasksFromUpcomingReservationsAction,
  bulkUpdateHandoverStatusAction,
  updateHandoverStatusAction,
} from "./actions";

type AdminOption = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
};

type HandoverOperationsClientProps = {
  rows: HandoverOperationsRow[];
  boardRows: HandoverOperationsRow[];
  statusCounts: Record<string, number>;
  returnTo: string;
  selectedHandoverId?: string | null;
  assignableAdmins: AdminOption[];
  automationCandidateCount: number;
  pagination: {
    totalCount: number;
    from: number;
    to: number;
    page: number;
    totalPages: number;
    previousHref: string | null;
    nextHref: string | null;
  };
};

const dateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "2-digit",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDate(value: string | null) {
  if (!value) return "Not linked";
  return dateFormatter.format(new Date(value));
}

function formatDateTime(value: string | null) {
  if (!value) return "Not scheduled";
  return dateTimeFormatter.format(new Date(value));
}

function csvEscape(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function ClientStatusBadge({ status, label }: { status?: string | null; label?: string | null }) {
  const normalized = status || "not_set";
  const tone =
    ["captured", "authorized", "confirmed", "ready", "completed", "verified"].includes(normalized)
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : ["failed", "requires_review", "cancelled", "issue_reported", "open", "urgent", "critical"].includes(normalized)
        ? "border-red-200 bg-red-50 text-red-800"
        : ["pending_approval", "requested", "under_review", "pending_preparation", "missing", "not_scheduled"].includes(normalized)
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <span className={`inline-flex min-h-7 items-center rounded-full border px-3 py-1 text-xs font-medium ${tone}`}>
      {label ?? normalized.replaceAll("_", " ")}
    </span>
  );
}

function AttentionBadge({ row }: { row: HandoverOperationsRow }) {
  const tone =
    row.attentionLevel === "critical"
      ? "border-red-300 bg-red-100 text-red-900"
      : row.attentionLevel === "high"
        ? "border-red-200 bg-red-50 text-red-800"
        : row.attentionLevel === "medium"
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : row.attentionLevel === "low"
            ? "border-blue-200 bg-blue-50 text-blue-800"
            : "border-emerald-200 bg-emerald-50 text-emerald-800";

  return (
    <span
      className={`inline-flex min-h-7 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${tone}`}
      title={row.attentionReasons[0] ?? "No active blocker"}
    >
      {row.attentionLevel === "none" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
      {row.attentionLevel === "none" ? "clear" : row.attentionLevel}
    </span>
  );
}

function selectedActionDisabledReason(
  selectedRows: HandoverOperationsRow[],
  capability: "canMarkPendingPreparation" | "canMarkReady" | "canStart" | "canComplete",
  reasonKey: "markPendingPreparationDisabledReason" | "markReadyDisabledReason" | "startDisabledReason" | "completeDisabledReason"
) {
  if (!selectedRows.length) return "Select handover tasks first.";
  if (selectedRows.some((row) => row[capability])) return null;
  return selectedRows[0]?.[reasonKey] ?? "Selected handover tasks are not eligible for this action.";
}

function adminName(admin: AdminOption) {
  return `${admin.firstName} ${admin.lastName}`.trim() || admin.email;
}

export function HandoverOperationsClient({
  rows,
  boardRows,
  statusCounts,
  returnTo,
  selectedHandoverId,
  assignableAdmins,
  automationCandidateCount,
  pagination,
}: HandoverOperationsClientProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const selectedRows = useMemo(
    () => rows.filter((row) => selectedIds.includes(row.id)),
    [rows, selectedIds]
  );
  const allVisibleSelected = rows.length > 0 && rows.every((row) => selectedIds.includes(row.id));
  const pendingPrepDisabledReason = selectedActionDisabledReason(
    selectedRows,
    "canMarkPendingPreparation",
    "markPendingPreparationDisabledReason"
  );
  const readyDisabledReason = selectedActionDisabledReason(selectedRows, "canMarkReady", "markReadyDisabledReason");
  const assignDisabledReason = selectedRows.length ? null : "Select handover tasks first.";

  function toggle(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  function toggleAllVisible() {
    setSelectedIds((current) => {
      if (allVisibleSelected) return current.filter((id) => !rows.some((row) => row.id === id));
      return Array.from(new Set([...current, ...rows.map((row) => row.id)]));
    });
  }

  function exportSelectedRows() {
    const targetRows = selectedRows.length ? selectedRows : rows;
    const header = [
      "task_number",
      "type",
      "status",
      "priority",
      "reservation_reference",
      "guest",
      "guest_email",
      "property",
      "city",
      "partner",
      "scheduled_for",
      "check_in",
      "check_out",
      "payment_status",
      "dispute_status",
      "checklist_progress",
      "last_event",
      "attention",
      "readiness_score",
      "next_best_action",
      "attention_reasons",
    ];
    const body = targetRows.map((row) =>
      [
        row.taskNumber,
        row.type,
        row.status,
        row.priority,
        row.reservationReference,
        row.guestName,
        row.guestEmail,
        row.propertyTitle,
        row.propertyCity,
        row.partnerName,
        row.scheduledForIso,
        row.checkInIso,
        row.checkOutIso,
        row.paymentStatus,
        row.disputeStatus,
        row.checklistLabel,
        row.lastEventSummary,
        row.attentionLevel,
        row.readinessScore,
        row.nextBestAction,
        row.attentionReasons.join(" | "),
      ]
        .map(csvEscape)
        .join(",")
    );
    const blob = new Blob([[header.join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `kantara-handover-${selectedRows.length ? "selected" : "current-view"}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (!rows.length && !boardRows.length) {
    return null;
  }

  return (
    <div className="space-y-5">
      <section className="rounded-md border border-slate-300 bg-slate-950 p-4 text-white shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Operational lanes</p>
            <h2 className="mt-1 text-lg font-semibold">Stay execution board</h2>
            <p className="mt-1 text-sm text-slate-300">
              Status counts are computed from real HandoverTask rows in the current view.
            </p>
          </div>
          <div className="inline-flex min-h-9 items-center rounded-md border border-white/10 bg-white/10 px-3 text-sm font-semibold">
            {boardRows.length} preview cards loaded
          </div>
        </div>
        <div className="mt-4 overflow-x-auto pb-1">
          <div className="grid min-w-[1540px] gap-3" style={{ gridTemplateColumns: `repeat(${HANDOVER_STATUSES.length}, minmax(210px, 1fr))` }}>
            {HANDOVER_STATUSES.map((status) => {
              const cards = boardRows.filter((row) => row.status === status).slice(0, 5);
              return (
                <section key={status} className="rounded-md border border-white/10 bg-white/[0.06]">
                  <div className="flex items-start justify-between gap-3 border-b border-white/10 p-3">
                    <div>
                      <h3 className="text-sm font-semibold">{HANDOVER_STATUS_LABELS[status]}</h3>
                      <p className="mt-1 text-xs text-slate-400">{statusCounts[status] ?? 0} tasks</p>
                    </div>
                    <span className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-xs font-semibold">
                      {statusCounts[status] ?? 0}
                    </span>
                  </div>
                  <div className="space-y-2 p-2">
                    {cards.length ? cards.map((row) => (
                      <Link
                        key={row.id}
                        href={row.rowHref}
                        className="block rounded-md border border-white/10 bg-white p-3 text-slate-950 shadow-sm transition-colors hover:border-white"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{row.taskNumber}</p>
                            <p className="mt-1 line-clamp-2 text-xs text-slate-600">{row.title}</p>
                          </div>
                          <ClientStatusBadge status={row.priority} />
                        </div>
                        <div className="mt-3 grid gap-1 text-xs text-slate-600">
                          <span>{row.typeLabel}</span>
                          <span>{formatDateTime(row.scheduledForIso)}</span>
                          <span>{row.checklistLabel} checklist</span>
                        </div>
                      </Link>
                    )) : (
                      <div className="rounded-md border border-dashed border-white/15 p-3 text-xs text-slate-400">
                        No {HANDOVER_STATUS_LABELS[status].toLowerCase()} tasks.
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </section>

      <section className="sticky top-0 z-20 overflow-hidden rounded-md border bg-background/95 shadow-sm backdrop-blur">
        <div className="border-b bg-muted/40 px-4 py-3">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="font-semibold">Bulk operations</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Actions apply to selected visible tasks only. Disabled controls expose exact validation reasons.
              </p>
            </div>
            <div className="text-sm">
              <span className="font-semibold">{selectedRows.length}</span>
              <span className="text-muted-foreground"> selected</span>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-3 p-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={toggleAllVisible}
              className="inline-flex min-h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium hover:border-foreground/30"
            >
              {allVisibleSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
              {allVisibleSelected ? "Deselect page" : "Select page"}
            </button>
            <Button type="button" variant="outline" onClick={exportSelectedRows} disabled={!rows.length}>
              <Download className="mr-2 h-4 w-4" />
              Export {selectedRows.length ? "selected" : "view"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setSelectedIds([])} disabled={!selectedRows.length}>
              Clear selection
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <form action={bulkUpdateHandoverStatusAction}>
              <input type="hidden" name="handoverIds" value={selectedIds.join(",")} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <input type="hidden" name="status" value="pending_preparation" />
              <input type="hidden" name="message" value="Bulk marked pending preparation from handover operations." />
              <Button
                type="submit"
                variant="outline"
                disabled={Boolean(pendingPrepDisabledReason)}
                title={pendingPrepDisabledReason ?? "Move eligible selected tasks to pending preparation"}
              >
                <ClipboardCheck className="mr-2 h-4 w-4" />
                Mark pending prep
              </Button>
            </form>
            <form action={bulkUpdateHandoverStatusAction}>
              <input type="hidden" name="handoverIds" value={selectedIds.join(",")} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <input type="hidden" name="status" value="ready" />
              <input type="hidden" name="message" value="Bulk marked ready from handover operations." />
              <Button
                type="submit"
                variant="outline"
                disabled={Boolean(readyDisabledReason)}
                title={readyDisabledReason ?? "Move eligible selected tasks to ready"}
              >
                <PackageCheck className="mr-2 h-4 w-4" />
                Mark ready
              </Button>
            </form>
            <form action={bulkAssignHandoverTasksAction} className="flex gap-2">
              <input type="hidden" name="handoverIds" value={selectedIds.join(",")} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <select
                name="assignedToId"
                className="h-10 min-w-[180px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                disabled={Boolean(assignDisabledReason)}
                title={assignDisabledReason ?? "Assign selected tasks"}
              >
                <option value="">Clear assignee</option>
                {assignableAdmins.map((admin) => (
                  <option key={admin.id} value={admin.id}>{adminName(admin)}</option>
                ))}
              </select>
              <Button type="submit" variant="outline" disabled={Boolean(assignDisabledReason)} title={assignDisabledReason ?? "Assign selected tasks"}>
                <UserPlus className="mr-2 h-4 w-4" />
                Assign
              </Button>
            </form>
            <form action={bulkCreateHandoverTasksFromUpcomingReservationsAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="returnTo" value={returnTo} />
              <label className="inline-flex min-h-10 items-center gap-2 rounded-md border px-3 text-xs font-medium">
                <input name="includeCheckout" type="checkbox" className="h-4 w-4 rounded border-input" defaultChecked />
                Include checkout tasks
              </label>
              <Button type="submit" variant="default" title="Create tasks from upcoming confirmed or reserved paid reservations without matching handover tasks">
                Create from reservations
              </Button>
            </form>
          </div>
        </div>
        <div className="border-t px-4 py-2 text-xs text-muted-foreground">
          {pendingPrepDisabledReason && selectedRows.length ? <p>Pending prep disabled: {pendingPrepDisabledReason}</p> : null}
          {readyDisabledReason && selectedRows.length ? <p>Ready disabled: {readyDisabledReason}</p> : null}
          <p>{automationCandidateCount} upcoming confirmed/reserved paid reservation{automationCandidateCount === 1 ? "" : "s"} currently appear eligible for automatic check-in task creation.</p>
        </div>
      </section>

      <section className="overflow-hidden rounded-md border bg-background shadow-sm">
        <div className="border-b bg-muted/40 px-4 py-3">
          <div className="flex flex-col gap-1 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-semibold">High-density handover table</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Showing {pagination.from}-{pagination.to} of {pagination.totalCount} tasks.
              </p>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm" disabled={!pagination.previousHref}>
                {pagination.previousHref ? <Link href={pagination.previousHref}>Previous</Link> : <span>Previous</span>}
              </Button>
              <Button asChild variant="outline" size="sm" disabled={!pagination.nextHref}>
                {pagination.nextHref ? <Link href={pagination.nextHref}>Next</Link> : <span>Next</span>}
              </Button>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1760px] w-full border-collapse text-sm">
            <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="w-11 px-3 py-3"><span className="sr-only">Select</span></th>
                <th className="px-3 py-3">Task number</th>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Priority</th>
                <th className="px-3 py-3">Reservation</th>
                <th className="px-3 py-3">Guest</th>
                <th className="px-3 py-3">Property</th>
                <th className="px-3 py-3">City</th>
                <th className="px-3 py-3">Partner/host</th>
                <th className="px-3 py-3">Scheduled for</th>
                <th className="px-3 py-3">Check-in/out</th>
                <th className="px-3 py-3">Payment</th>
                <th className="px-3 py-3">Dispute</th>
                <th className="px-3 py-3">Checklist</th>
                <th className="px-3 py-3">Last event</th>
                <th className="px-3 py-3">Quick actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => {
                const selected = selectedIds.includes(row.id);
                const active = selectedHandoverId === row.id;
                return (
                  <tr
                    key={row.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => startTransition(() => router.push(row.rowHref))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        startTransition(() => router.push(row.rowHref));
                      }
                    }}
                    className={[
                      "cursor-pointer bg-background transition-colors hover:bg-slate-50",
                      selected ? "bg-blue-50/60" : "",
                      active ? "outline outline-2 outline-offset-[-2px] outline-slate-900/20" : "",
                    ].join(" ")}
                  >
                    <td className="px-3 py-3 align-top" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${row.taskNumber}`}
                        checked={selected}
                        onChange={() => toggle(row.id)}
                        className="h-4 w-4 rounded border-input"
                      />
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="font-semibold">{row.taskNumber}</div>
                      <div className="mt-1 max-w-[180px] truncate text-xs text-muted-foreground">{row.title}</div>
                      <div className="mt-2"><AttentionBadge row={row} /></div>
                    </td>
                    <td className="px-3 py-3 align-top">{row.typeLabel}</td>
                    <td className="px-3 py-3 align-top"><ClientStatusBadge status={row.status} label={row.statusLabel} /></td>
                    <td className="px-3 py-3 align-top"><ClientStatusBadge status={row.priority} /></td>
                    <td className="px-3 py-3 align-top">
                      <div className="font-medium">{row.reservationReference}</div>
                      <div className="mt-1 max-w-[140px] truncate text-xs text-muted-foreground">{row.reservationId ?? "Missing link"}</div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="max-w-[160px] truncate font-medium">{row.guestName}</div>
                      <div className="mt-1 max-w-[180px] truncate text-xs text-muted-foreground">{row.guestEmail ?? "No guest email"}</div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="max-w-[190px] truncate font-medium">{row.propertyTitle}</div>
                      <div className="mt-1 max-w-[180px] truncate text-xs text-muted-foreground">{row.propertyId ?? "No property id"}</div>
                    </td>
                    <td className="px-3 py-3 align-top">{row.propertyCity ?? "Not set"}</td>
                    <td className="px-3 py-3 align-top">
                      <div className="max-w-[170px] truncate">{row.partnerName}</div>
                      <div className="mt-1 max-w-[180px] truncate text-xs text-muted-foreground">{row.partnerEmail ?? "No host email"}</div>
                    </td>
                    <td className="px-3 py-3 align-top">{formatDateTime(row.scheduledForIso)}</td>
                    <td className="px-3 py-3 align-top">
                      <div>{formatDate(row.checkInIso)}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{formatDate(row.checkOutIso)}</div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <ClientStatusBadge status={row.paymentStatus} />
                      <div className="mt-1 text-xs text-muted-foreground">{row.linkedCounts.payments} records</div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <ClientStatusBadge status={row.disputeStatus} />
                      <div className="mt-1 text-xs text-muted-foreground">{row.linkedCounts.disputes} cases</div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="min-w-[110px]">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span>{row.checklistLabel}</span>
                          <span>{row.checklistPercent === null ? "Foundation" : `${row.checklistPercent}%`}</span>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-muted">
                          <div
                            className="h-2 rounded-full bg-emerald-600"
                            style={{ width: `${row.checklistPercent ?? 12}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="max-w-[220px] truncate">{row.lastEventSummary ?? "No events yet"}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{formatDateTime(row.lastEventAtIso)}</div>
                    </td>
                    <td className="px-3 py-3 align-top" onClick={(event) => event.stopPropagation()}>
                      <div className="flex flex-col gap-2">
                        <Link
                          href={row.rowHref}
                          className="inline-flex min-h-8 items-center justify-center rounded-md border px-2 text-xs font-medium hover:border-foreground/30"
                        >
                          <FileText className="mr-1.5 h-3.5 w-3.5" />
                          Detail
                        </Link>
                        <form action={updateHandoverStatusAction}>
                          <input type="hidden" name="handoverId" value={row.id} />
                          <input type="hidden" name="returnTo" value={returnTo} />
                          <input type="hidden" name="status" value="ready" />
                          <input type="hidden" name="message" value="Marked ready from handover operations table." />
                          <Button type="submit" size="sm" variant="outline" className="w-full" disabled={!row.canMarkReady} title={row.markReadyDisabledReason ?? "Mark ready"}>
                            Ready
                          </Button>
                        </form>
                        {row.reservationId ? (
                          <Link
                            href={`/admin/bookings?bookingId=${row.reservationId}`}
                            className="inline-flex min-h-8 items-center justify-center rounded-md border px-2 text-xs font-medium hover:border-foreground/30"
                          >
                            Booking
                            <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {isPending ? (
        <div className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm shadow-lg">
          <Loader2 className="h-4 w-4 animate-spin" />
          Opening handover workspace
        </div>
      ) : null}
    </div>
  );
}
