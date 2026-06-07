"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckSquare,
  Download,
  FileText,
  KeyRound,
  Loader2,
  Square,
} from "lucide-react";

import { RiskBadge } from "@/app/components/admin/RiskBadge";
import { Button } from "@/components/ui/button";
import type { BookingOperationsRow } from "@/app/lib/bookingIntelligence";
import {
  bulkCreateHandoverTasksForBookingsAction,
  bulkMarkBookingsUnderReviewAction,
} from "./actions";

type BookingOperationsClientProps = {
  rows: BookingOperationsRow[];
  returnTo: string;
  selectedBookingId?: string | null;
};

const dateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "2-digit",
  year: "numeric",
});

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}

function formatDateTime(value: string | null) {
  if (!value) return "No activity";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatMoney(amount: number | null, currency: string) {
  if (amount === null) return "Snapshot incomplete";
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency || "USD"} ${amount}`;
  }
}

function ClientStatusBadge({ status }: { status: string }) {
  const normalized = status || "not_set";
  const tone =
    ["captured", "authorized", "confirmed", "ready", "completed", "verified"].includes(normalized)
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : ["requires_review", "failed", "cancelled", "issue_reported", "open", "urgent"].includes(normalized)
        ? "border-red-200 bg-red-50 text-red-800"
        : ["pending_approval", "requested", "under_review", "pending_preparation", "missing"].includes(normalized)
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <span className={`inline-flex min-h-7 items-center rounded-full border px-3 py-1 text-xs font-medium ${tone}`}>
      {normalized.replaceAll("_", " ")}
    </span>
  );
}

function getSelectionDisabledReason(
  selectedRows: BookingOperationsRow[],
  key: "canMarkUnderReview" | "canCreateHandover",
  reasonKey: "markUnderReviewDisabledReason" | "createHandoverDisabledReason"
) {
  if (!selectedRows.length) return "Select bookings first.";
  if (selectedRows.some((row) => row[key])) return null;
  return selectedRows[0]?.[reasonKey] ?? "Selected bookings are not eligible for this action.";
}

function csvEscape(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export function BookingOperationsClient({
  rows,
  returnTo,
  selectedBookingId,
}: BookingOperationsClientProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const selectedRows = useMemo(
    () => rows.filter((row) => selectedIds.includes(row.id)),
    [rows, selectedIds]
  );
  const allVisibleSelected = rows.length > 0 && rows.every((row) => selectedIds.includes(row.id));
  const markReviewDisabledReason = getSelectionDisabledReason(
    selectedRows,
    "canMarkUnderReview",
    "markUnderReviewDisabledReason"
  );
  const handoverDisabledReason = getSelectionDisabledReason(
    selectedRows,
    "canCreateHandover",
    "createHandoverDisabledReason"
  );

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
      "reference",
      "status",
      "guest",
      "guest_email",
      "property",
      "city",
      "partner",
      "check_in",
      "check_out",
      "nights",
      "amount",
      "currency",
      "payment_status",
      "handover_status",
      "dispute_status",
      "verification_status",
      "readiness_score",
      "attention_reasons",
    ];
    const body = targetRows.map((row) =>
      [
        row.reference,
        row.status,
        row.guestName,
        row.guestEmail,
        row.propertyTitle,
        row.propertyCity,
        row.partnerName,
        row.checkInIso,
        row.checkOutIso,
        row.nights,
        row.amount,
        row.currency,
        row.paymentStatus,
        row.handoverStatus,
        row.disputeStatus,
        row.verificationStatus,
        row.readinessScore,
        row.attentionReasons.join(" | "),
      ]
        .map(csvEscape)
        .join(",")
    );
    const blob = new Blob([[header.join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `kantara-bookings-${selectedRows.length ? "selected" : "current-view"}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (!rows.length) return null;

  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-20 rounded-md border bg-background/95 p-3 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleAllVisible}
              className="inline-flex min-h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium hover:border-foreground/30"
            >
              {allVisibleSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
              {allVisibleSelected ? "Deselect page" : "Select page"}
            </button>
            <div className="text-sm">
              <span className="font-semibold">{selectedRows.length}</span>
              <span className="text-muted-foreground"> selected</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <form action={bulkMarkBookingsUnderReviewAction}>
              <input type="hidden" name="bookingIds" value={selectedIds.join(",")} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <input type="hidden" name="note" value="Bulk under-review action from booking queue." />
              <Button
                type="submit"
                variant="outline"
                disabled={Boolean(markReviewDisabledReason)}
                title={markReviewDisabledReason ?? "Mark eligible selected bookings under review"}
              >
                Mark under review
              </Button>
            </form>
            <form action={bulkCreateHandoverTasksForBookingsAction}>
              <input type="hidden" name="bookingIds" value={selectedIds.join(",")} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <Button
                type="submit"
                variant="outline"
                disabled={Boolean(handoverDisabledReason)}
                title={handoverDisabledReason ?? "Create handover tasks for eligible upcoming bookings"}
              >
                <KeyRound className="mr-2 h-4 w-4" />
                Create handover tasks
              </Button>
            </form>
            <Button type="button" variant="outline" onClick={exportSelectedRows}>
              <Download className="mr-2 h-4 w-4" />
              Export {selectedRows.length ? "selected" : "view"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setSelectedIds([])} disabled={!selectedRows.length}>
              Clear
            </Button>
          </div>
        </div>
        {markReviewDisabledReason && selectedRows.length ? (
          <p className="mt-2 text-xs text-muted-foreground">Under-review action disabled: {markReviewDisabledReason}</p>
        ) : null}
        {handoverDisabledReason && selectedRows.length ? (
          <p className="mt-1 text-xs text-muted-foreground">Handover bulk action disabled: {handoverDisabledReason}</p>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-md border bg-background shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[1380px] w-full border-collapse text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-11 px-3 py-3">
                  <span className="sr-only">Select</span>
                </th>
                <th className="px-3 py-3">Reference</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Guest</th>
                <th className="px-3 py-3">Property</th>
                <th className="px-3 py-3">City</th>
                <th className="px-3 py-3">Partner/host</th>
                <th className="px-3 py-3">Check-in</th>
                <th className="px-3 py-3">Check-out</th>
                <th className="px-3 py-3">Nights</th>
                <th className="px-3 py-3">Locked amount</th>
                <th className="px-3 py-3">Payment</th>
                <th className="px-3 py-3">Handover</th>
                <th className="px-3 py-3">Dispute</th>
                <th className="px-3 py-3">Verification/risk</th>
                <th className="px-3 py-3">Created</th>
                <th className="px-3 py-3">Last activity</th>
                <th className="px-3 py-3">Quick actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => {
                const selected = selectedIds.includes(row.id);
                const active = selectedBookingId === row.id;
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
                      "cursor-pointer bg-background transition-colors hover:bg-muted/35",
                      selected ? "bg-blue-50/50" : "",
                      active ? "outline outline-2 outline-offset-[-2px] outline-foreground/20" : "",
                    ].join(" ")}
                  >
                    <td className="px-3 py-3 align-top" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${row.reference}`}
                        checked={selected}
                        onChange={() => toggle(row.id)}
                        className="h-4 w-4 rounded border-input"
                      />
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="font-semibold">{row.reference}</div>
                      <div className="mt-1 max-w-[120px] truncate text-xs text-muted-foreground">{row.id}</div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <ClientStatusBadge status={row.status} />
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="font-medium">{row.guestName}</div>
                      <div className="mt-1 max-w-[180px] truncate text-xs text-muted-foreground">{row.guestEmail ?? "No email"}</div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="max-w-[210px] truncate font-medium">{row.propertyTitle}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{row.propertyId ?? "No property id"}</div>
                    </td>
                    <td className="px-3 py-3 align-top">{row.propertyCity ?? "Not set"}</td>
                    <td className="px-3 py-3 align-top">
                      <div className="max-w-[170px] truncate">{row.partnerName}</div>
                      <div className="mt-1 max-w-[170px] truncate text-xs text-muted-foreground">{row.partnerEmail ?? "No host email"}</div>
                    </td>
                    <td className="px-3 py-3 align-top">{formatDate(row.checkInIso)}</td>
                    <td className="px-3 py-3 align-top">{formatDate(row.checkOutIso)}</td>
                    <td className="px-3 py-3 align-top">{row.nights}</td>
                    <td className="px-3 py-3 align-top">
                      <div className="font-medium">{formatMoney(row.amount, row.currency)}</div>
                      <div className="mt-1 text-xs text-muted-foreground">Snapshot protected</div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <ClientStatusBadge status={row.paymentStatus} />
                      <div className="mt-1 text-xs text-muted-foreground">{row.linkedCounts.payments} records</div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <ClientStatusBadge status={row.handoverStatus} />
                      <div className="mt-1 text-xs text-muted-foreground">{row.linkedCounts.handovers} tasks</div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <ClientStatusBadge status={row.disputeStatus} />
                      <div className="mt-1 text-xs text-muted-foreground">{row.linkedCounts.disputes} cases</div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="flex flex-col gap-1">
                        <RiskBadge severity={row.attentionLevel} label={row.attentionLevel === "none" ? "clear" : row.attentionLevel} />
                        <span className="text-xs text-muted-foreground">{row.readinessScore}% ready</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top">{formatDate(row.createdAtIso)}</td>
                    <td className="px-3 py-3 align-top">{formatDateTime(row.lastActivityIso)}</td>
                    <td className="px-3 py-3 align-top" onClick={(event) => event.stopPropagation()}>
                      <div className="flex flex-col gap-2">
                        <Link
                          href={row.rowHref}
                          className="inline-flex min-h-8 items-center justify-center rounded-md border px-2 text-xs font-medium hover:border-foreground/30"
                        >
                          <FileText className="mr-1.5 h-3.5 w-3.5" />
                          Detail
                        </Link>
                        <Link
                          href={`/admin/payments?q=${encodeURIComponent(row.id)}`}
                          className="inline-flex min-h-8 items-center justify-center rounded-md border px-2 text-xs font-medium hover:border-foreground/30"
                        >
                          Payments
                          <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {isPending ? (
        <div className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm shadow-lg">
          <Loader2 className="h-4 w-4 animate-spin" />
          Opening booking workspace
        </div>
      ) : null}

      {rows.some((row) => row.attentionLevel === "critical" || row.attentionLevel === "high") ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <div className="flex gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              High-attention rows are derived from payment, handover, dispute, verification, and snapshot state.
              Open a row for validated actions and audit-backed workflow changes.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
