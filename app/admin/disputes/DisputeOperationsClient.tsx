"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  CheckSquare,
  Download,
  FileText,
  Loader2,
  ShieldAlert,
  Square,
  UserPlus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { DisputeOperationsRow } from "@/app/lib/disputeOperations";
import { DISPUTE_STATUSES } from "@/app/lib/disputeFilters";
import { DISPUTE_STATUS_LABELS } from "@/app/lib/disputeIntelligence";
import {
  assignDisputeAction,
  bulkAssignDisputesAction,
  bulkMarkDisputesUnderReviewAction,
  bulkRequestAdminFollowupAction,
  updateDisputeStatusAction,
} from "./actions";

type AdminOption = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
};

type DisputeOperationsClientProps = {
  rows: DisputeOperationsRow[];
  boardRows: DisputeOperationsRow[];
  statusCounts: Record<string, number>;
  returnTo: string;
  selectedDisputeId?: string | null;
  admins: AdminOption[];
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
  if (!value) return "Not set";
  return dateFormatter.format(new Date(value));
}

function formatDateTime(value: string | null) {
  if (!value) return "No event";
  return dateTimeFormatter.format(new Date(value));
}

function csvEscape(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function adminName(admin: AdminOption) {
  return `${admin.firstName} ${admin.lastName}`.trim() || admin.email;
}

function ClientStatusBadge({ status, label }: { status?: string | null; label?: string | null }) {
  const normalized = status || "not_set";
  const tone =
    ["resolved", "closed", "captured", "authorized"].includes(normalized)
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : ["urgent", "high", "failed", "requires_review", "reopened"].includes(normalized)
        ? "border-red-200 bg-red-50 text-red-800"
        : ["open", "under_review", "awaiting_guest", "awaiting_partner", "awaiting_admin", "pending_approval", "missing"].includes(normalized)
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : "border-slate-200 bg-slate-50 text-slate-700";
  return (
    <span className={`inline-flex min-h-7 items-center rounded-full border px-3 py-1 text-xs font-medium ${tone}`}>
      {label ?? normalized.replaceAll("_", " ")}
    </span>
  );
}

function AttentionBadge({ row }: { row: DisputeOperationsRow }) {
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
  selectedRows: DisputeOperationsRow[],
  capability: "canMarkUnderReview" | "canRequestAdminFollowup",
  reasonKey: "markUnderReviewDisabledReason" | "requestAdminFollowupDisabledReason"
) {
  if (!selectedRows.length) return "Select dispute cases first.";
  if (selectedRows.some((row) => row[capability])) return null;
  return selectedRows[0]?.[reasonKey] ?? "Selected dispute cases are not eligible for this action.";
}

export function DisputeOperationsClient({
  rows,
  boardRows,
  statusCounts,
  returnTo,
  selectedDisputeId,
  admins,
  pagination,
}: DisputeOperationsClientProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const selectedRows = useMemo(
    () => rows.filter((row) => selectedIds.includes(row.id)),
    [rows, selectedIds]
  );
  const allVisibleSelected = rows.length > 0 && rows.every((row) => selectedIds.includes(row.id));
  const underReviewDisabledReason = selectedActionDisabledReason(selectedRows, "canMarkUnderReview", "markUnderReviewDisabledReason");
  const adminFollowupDisabledReason = selectedActionDisabledReason(selectedRows, "canRequestAdminFollowup", "requestAdminFollowupDisabledReason");
  const assignDisabledReason = selectedRows.length ? null : "Select dispute cases first.";

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
      "case_number",
      "priority",
      "type",
      "status",
      "title",
      "linked_source",
      "reservation",
      "payment_state",
      "handover_state",
      "guest",
      "property",
      "partner",
      "owner",
      "opened",
      "age",
      "latest_event",
      "next_action",
      "attention",
      "financial_exposure",
      "resolution_readiness",
      "attention_reasons",
    ];
    const body = targetRows.map((row) =>
      [
        row.caseNumber,
        row.priority,
        row.type,
        row.status,
        row.title,
        row.linkedSourceLabel,
        row.reservationReference,
        row.paymentState,
        row.handoverState,
        row.guestName,
        row.propertyTitle,
        row.partnerName,
        row.assignedOwner,
        row.openedAtIso,
        row.ageLabel,
        row.latestEventSummary,
        row.nextBestAction,
        row.attentionLevel,
        row.financialExposureLabel,
        row.resolutionReadinessScore,
        row.attentionReasons.join(" | "),
      ]
        .map(csvEscape)
        .join(",")
    );
    const blob = new Blob([[header.join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `kantara-disputes-${selectedRows.length ? "selected" : "current-view"}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (!rows.length && !boardRows.length) return null;

  return (
    <div className="space-y-5">
      <section className="rounded-md border border-slate-300 bg-slate-950 p-4 text-white shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Case lifecycle board</p>
            <h2 className="mt-1 text-lg font-semibold">Incident command lanes</h2>
            <p className="mt-1 text-sm text-slate-300">
              Cards are real DisputeCase rows, grouped by operational status.
            </p>
          </div>
          <div className="inline-flex min-h-9 items-center rounded-md border border-white/10 bg-white/10 px-3 text-sm font-semibold">
            {boardRows.length} preview cards loaded
          </div>
        </div>
        <div className="mt-4 overflow-x-auto pb-1">
          <div className="grid min-w-[1760px] gap-3" style={{ gridTemplateColumns: `repeat(${DISPUTE_STATUSES.length}, minmax(210px, 1fr))` }}>
            {DISPUTE_STATUSES.map((status) => {
              const cards = boardRows.filter((row) => row.status === status).slice(0, 5);
              return (
                <section key={status} className="rounded-md border border-white/10 bg-white/[0.06]">
                  <div className="flex items-start justify-between gap-3 border-b border-white/10 p-3">
                    <div>
                      <h3 className="text-sm font-semibold">{DISPUTE_STATUS_LABELS[status]}</h3>
                      <p className="mt-1 text-xs text-slate-400">{statusCounts[status] ?? 0} cases</p>
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
                            <p className="truncate text-sm font-semibold">{row.caseNumber}</p>
                            <p className="mt-1 line-clamp-2 text-xs text-slate-600">{row.title}</p>
                          </div>
                          <ClientStatusBadge status={row.priority} />
                        </div>
                        <div className="mt-3 grid gap-1 text-xs text-slate-600">
                          <span>{row.typeLabel}</span>
                          <span>{row.linkedSourceLabel}</span>
                          <span>{row.ageLabel} old - {row.assignedOwner}</span>
                          <span>{row.latestEventSummary ?? "No event yet"}</span>
                        </div>
                      </Link>
                    )) : (
                      <div className="rounded-md border border-dashed border-white/15 p-3 text-xs text-slate-400">
                        No {DISPUTE_STATUS_LABELS[status].toLowerCase()} cases.
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
              <h2 className="font-semibold">Bulk case operations</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Bulk actions are limited to assignment, review state, follow-up, export, and selection control. Bulk resolve/close stays disabled.
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
            <form action={bulkMarkDisputesUnderReviewAction}>
              <input type="hidden" name="disputeIds" value={selectedIds.join(",")} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <Button
                type="submit"
                variant="outline"
                disabled={Boolean(underReviewDisabledReason)}
                title={underReviewDisabledReason ?? "Mark eligible selected cases under review"}
              >
                <ShieldAlert className="mr-2 h-4 w-4" />
                Mark under review
              </Button>
            </form>
            <form action={bulkRequestAdminFollowupAction}>
              <input type="hidden" name="disputeIds" value={selectedIds.join(",")} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <input type="hidden" name="message" value="Bulk admin follow-up requested from dispute command center." />
              <Button
                type="submit"
                variant="outline"
                disabled={Boolean(adminFollowupDisabledReason)}
                title={adminFollowupDisabledReason ?? "Request admin follow-up for selected cases"}
              >
                Request admin follow-up
              </Button>
            </form>
            <form action={bulkAssignDisputesAction} className="flex gap-2">
              <input type="hidden" name="disputeIds" value={selectedIds.join(",")} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <select
                name="assignedToId"
                className="h-10 min-w-[190px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                disabled={Boolean(assignDisabledReason)}
                title={assignDisabledReason ?? "Assign selected cases"}
              >
                <option value="">Clear assignee</option>
                {admins.map((admin) => (
                  <option key={admin.id} value={admin.id}>{adminName(admin)}</option>
                ))}
              </select>
              <Button type="submit" variant="outline" disabled={Boolean(assignDisabledReason)} title={assignDisabledReason ?? "Assign selected cases"}>
                <UserPlus className="mr-2 h-4 w-4" />
                Assign
              </Button>
            </form>
            <Button type="button" variant="outline" disabled title="Bulk resolution is disabled because each case requires outcome, rationale, and confirmation.">
              Bulk resolve disabled
            </Button>
            <Button type="button" variant="outline" disabled title="Bulk close is disabled because each case requires resolution or close reason plus confirmation.">
              Bulk close disabled
            </Button>
          </div>
        </div>
        <div className="border-t px-4 py-2 text-xs text-muted-foreground">
          {underReviewDisabledReason && selectedRows.length ? <p>Under review disabled: {underReviewDisabledReason}</p> : null}
          {adminFollowupDisabledReason && selectedRows.length ? <p>Admin follow-up disabled: {adminFollowupDisabledReason}</p> : null}
        </div>
      </section>

      <section className="overflow-hidden rounded-md border bg-background shadow-sm">
        <div className="border-b bg-muted/40 px-4 py-3">
          <div className="flex flex-col gap-1 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-semibold">Advanced case table</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Showing {pagination.from}-{pagination.to} of {pagination.totalCount} cases.
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
          <table className="min-w-[1880px] w-full border-collapse text-sm">
            <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="w-11 px-3 py-3"><span className="sr-only">Select</span></th>
                <th className="px-3 py-3">Case number</th>
                <th className="px-3 py-3">Priority</th>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Title</th>
                <th className="px-3 py-3">Booking/reservation</th>
                <th className="px-3 py-3">Payment</th>
                <th className="px-3 py-3">Handover</th>
                <th className="px-3 py-3">Guest</th>
                <th className="px-3 py-3">Property</th>
                <th className="px-3 py-3">Partner</th>
                <th className="px-3 py-3">Owner</th>
                <th className="px-3 py-3">Opened</th>
                <th className="px-3 py-3">Age</th>
                <th className="px-3 py-3">Latest event</th>
                <th className="px-3 py-3">Next action</th>
                <th className="px-3 py-3">Quick actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => {
                const selected = selectedIds.includes(row.id);
                const active = selectedDisputeId === row.id;
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
                        aria-label={`Select ${row.caseNumber}`}
                        checked={selected}
                        onChange={() => toggle(row.id)}
                        className="h-4 w-4 rounded border-input"
                      />
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="font-semibold">{row.caseNumber}</div>
                      <div className="mt-2"><AttentionBadge row={row} /></div>
                      <div className="mt-1 max-w-[160px] truncate text-xs text-muted-foreground">{row.linkedSourceLabel}</div>
                    </td>
                    <td className="px-3 py-3 align-top"><ClientStatusBadge status={row.priority} /></td>
                    <td className="px-3 py-3 align-top">{row.typeLabel}</td>
                    <td className="px-3 py-3 align-top"><ClientStatusBadge status={row.status} label={row.statusLabel} /></td>
                    <td className="px-3 py-3 align-top">
                      <div className="max-w-[240px] truncate font-medium">{row.title}</div>
                      <div className="mt-1 max-w-[240px] truncate text-xs text-muted-foreground">{row.summary}</div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="font-medium">{row.reservationReference}</div>
                      <div className="mt-1 max-w-[140px] truncate text-xs text-muted-foreground">{row.reservationId ?? "No reservation"}</div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <ClientStatusBadge status={row.paymentState} />
                      <div className="mt-1 text-xs text-muted-foreground">{row.financialExposureLabel}</div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <ClientStatusBadge status={row.handoverState} />
                      <div className="mt-1 text-xs text-muted-foreground">{row.linkedCounts.handovers} tasks</div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="max-w-[160px] truncate font-medium">{row.guestName}</div>
                      <div className="mt-1 max-w-[170px] truncate text-xs text-muted-foreground">{row.guestEmail ?? "No guest email"}</div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="max-w-[180px] truncate font-medium">{row.propertyTitle}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{row.propertyCity ?? "City not set"}</div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="max-w-[170px] truncate">{row.partnerName}</div>
                      <div className="mt-1 max-w-[170px] truncate text-xs text-muted-foreground">{row.partnerEmail ?? "No host email"}</div>
                    </td>
                    <td className="px-3 py-3 align-top">{row.assignedOwner}</td>
                    <td className="px-3 py-3 align-top">{formatDate(row.openedAtIso)}</td>
                    <td className="px-3 py-3 align-top">{row.ageLabel}</td>
                    <td className="px-3 py-3 align-top">
                      <div className="max-w-[220px] truncate">{row.latestEventSummary ?? "No event yet"}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{formatDateTime(row.latestEventAtIso)}</div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="max-w-[180px] font-medium">{row.nextBestAction}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{row.resolutionReadinessScore}% ready</div>
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
                        <form action={updateDisputeStatusAction}>
                          <input type="hidden" name="disputeId" value={row.id} />
                          <input type="hidden" name="returnTo" value={returnTo} />
                          <input type="hidden" name="status" value="under_review" />
                          <input type="hidden" name="message" value="Marked under review from dispute table." />
                          <Button type="submit" size="sm" variant="outline" className="w-full" disabled={!row.canMarkUnderReview} title={row.markUnderReviewDisabledReason ?? "Mark under review"}>
                            Review
                          </Button>
                        </form>
                        {row.paymentRecordId ? (
                          <Link
                            href={`/admin/payments?paymentId=${row.paymentRecordId}`}
                            className="inline-flex min-h-8 items-center justify-center rounded-md border px-2 text-xs font-medium hover:border-foreground/30"
                          >
                            Payment
                            <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
                          </Link>
                        ) : row.reservationId ? (
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
          Opening dispute workspace
        </div>
      ) : null}
    </div>
  );
}
