"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  Building2,
  CheckSquare,
  CreditCard,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Square,
  UserRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PaymentOperationsRow } from "@/app/lib/paymentOperations";
import {
  bulkMarkPaymentsRequiresReviewAction,
  bulkSyncPayPalOrdersAction,
} from "./actions";

type PaymentOperationsClientProps = {
  rows: PaymentOperationsRow[];
  returnTo: string;
  selectedPaymentId?: string | null;
};

function ClientStatusBadge({ status }: { status?: string | null }) {
  const normalized = status || "not_set";
  const lower = normalized.toLowerCase();
  const tone =
    ["captured", "authorized", "completed", "recorded", "approved"].includes(lower)
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : ["failed", "requires_review", "cancelled", "refunded", "declined", "voided", "open_active"].includes(lower)
        ? "border-red-200 bg-red-50 text-red-800"
        : ["pending_approval", "order_created", "draft", "partially_refunded", "unknown"].includes(lower)
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <span className={`inline-flex min-h-7 items-center rounded-full border px-3 py-1 text-xs font-medium ${tone}`}>
      {normalized.replaceAll("_", " ")}
    </span>
  );
}

function ClientAttentionBadge({ level, reasons }: { level: PaymentOperationsRow["attentionLevel"]; reasons: string[] }) {
  const normalized = level ?? "none";
  const tone =
    normalized === "critical"
      ? "border-red-300 bg-red-100 text-red-900"
      : normalized === "high"
        ? "border-red-200 bg-red-50 text-red-800"
        : normalized === "medium"
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : normalized === "low"
            ? "border-blue-200 bg-blue-50 text-blue-800"
            : "border-emerald-200 bg-emerald-50 text-emerald-800";

  return (
    <span
      className={`inline-flex min-h-7 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${tone}`}
      title={reasons[0] ?? "No active payment attention reason"}
    >
      {normalized === "none" ? <BadgeCheck className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
      {normalized === "none" ? "clear" : normalized}
    </span>
  );
}

function formatDateTime(value: string | null) {
  if (!value) return "No event";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function csvEscape(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function selectedActionDisabledReason(
  selectedRows: PaymentOperationsRow[],
  capability: "canMarkRequiresReview" | "canSyncProvider",
  reasonKey: "markRequiresReviewDisabledReason" | "syncProviderDisabledReason"
) {
  if (!selectedRows.length) return "Select payments first.";
  if (selectedRows.some((row) => row[capability])) return null;
  return selectedRows[0]?.[reasonKey] ?? "Selected payments are not eligible for this action.";
}

export function PaymentOperationsClient({
  rows,
  returnTo,
  selectedPaymentId,
}: PaymentOperationsClientProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const selectedRows = useMemo(
    () => rows.filter((row) => selectedIds.includes(row.id)),
    [rows, selectedIds]
  );
  const allVisibleSelected = rows.length > 0 && rows.every((row) => selectedIds.includes(row.id));
  const markReviewDisabledReason = selectedActionDisabledReason(
    selectedRows,
    "canMarkRequiresReview",
    "markRequiresReviewDisabledReason"
  );
  const syncDisabledReason = selectedActionDisabledReason(
    selectedRows,
    "canSyncProvider",
    "syncProviderDisabledReason"
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
      "id",
      "status",
      "method",
      "provider",
      "paypal_order_id",
      "guest",
      "guest_email",
      "property",
      "city",
      "reservation_id",
      "amount",
      "currency",
      "provider_status",
      "authorization_id",
      "capture_id",
      "dispute_status",
      "created",
      "updated",
      "last_event",
      "attention",
      "reasons",
    ];
    const body = targetRows.map((row) =>
      [
        row.reference,
        row.id,
        row.status,
        row.method,
        row.provider,
        row.providerOrderId,
        row.guestName,
        row.guestEmail,
        row.propertyTitle,
        row.propertyCity,
        row.reservationId,
        row.amount,
        row.currency,
        row.providerStatus,
        row.providerAuthorizationId,
        row.providerCaptureId,
        row.disputeStatus,
        row.createdAtIso,
        row.updatedAtIso,
        row.lastEventSummary,
        row.attentionLevel,
        row.attentionReasons.join(" | "),
      ]
        .map(csvEscape)
        .join(",")
    );
    const blob = new Blob([[header.join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `kantara-payments-${selectedRows.length ? "selected" : "current-view"}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (!rows.length) return null;

  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-20 overflow-hidden rounded-lg border border-slate-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="border-b border-slate-200 bg-slate-950 px-4 py-3 text-white">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Payment queue</p>
              <p className="mt-1 text-sm text-slate-300">Bulk controls apply only to visible real payment records.</p>
            </div>
            <div className="inline-flex min-h-9 items-center rounded-md border border-white/10 bg-white/10 px-3 text-sm font-semibold">
              {rows.length} rows loaded
            </div>
          </div>
        </div>
        <div className="p-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleAllVisible}
              className="inline-flex min-h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium shadow-sm hover:border-slate-400"
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
            <form action={bulkMarkPaymentsRequiresReviewAction}>
              <input type="hidden" name="paymentIds" value={selectedIds.join(",")} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <input type="hidden" name="reason" value="Bulk payment review action from payment operations queue." />
              <Button
                type="submit"
                variant="outline"
                disabled={Boolean(markReviewDisabledReason)}
                title={markReviewDisabledReason ?? "Mark eligible selected payments for review"}
              >
                <ShieldAlert className="mr-2 h-4 w-4" />
                Mark review
              </Button>
            </form>
            <form action={bulkSyncPayPalOrdersAction}>
              <input type="hidden" name="paymentIds" value={selectedIds.join(",")} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <Button
                type="submit"
                variant="outline"
                disabled={Boolean(syncDisabledReason)}
                title={syncDisabledReason ?? "Sync selected PayPal order statuses"}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Sync PayPal
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
          <p className="mt-2 text-xs text-muted-foreground">Review bulk action disabled: {markReviewDisabledReason}</p>
        ) : null}
        {syncDisabledReason && selectedRows.length ? (
          <p className="mt-1 text-xs text-muted-foreground">Provider sync disabled: {syncDisabledReason}</p>
        ) : null}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[1840px] w-full border-collapse text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="w-11 px-3 py-3">
                  <span className="sr-only">Select</span>
                </th>
                <th className="px-3 py-3">Payment reference / id</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Method</th>
                <th className="px-3 py-3">Provider</th>
                <th className="px-3 py-3">PayPal order id</th>
                <th className="px-3 py-3">Guest</th>
                <th className="px-3 py-3">Property</th>
                <th className="px-3 py-3">Reservation / booking</th>
                <th className="px-3 py-3">Amount</th>
                <th className="px-3 py-3">Currency</th>
                <th className="px-3 py-3">Provider status</th>
                <th className="px-3 py-3">Capture / authorization id</th>
                <th className="px-3 py-3">Dispute status</th>
                <th className="px-3 py-3">Created date</th>
                <th className="px-3 py-3">Last event</th>
                <th className="px-3 py-3">Quick actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {rows.map((row) => {
                const selected = selectedIds.includes(row.id);
                const active = selectedPaymentId === row.id;
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
                      "cursor-pointer bg-white transition-colors hover:bg-slate-50",
                      selected ? "bg-blue-50/70" : "",
                      active ? "outline outline-2 outline-offset-[-2px] outline-slate-950/30" : "",
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
                      <div className="inline-flex items-center gap-2 font-semibold">
                        <FileText className="h-4 w-4 text-slate-500" />
                        {row.reference}
                      </div>
                      <div className="mt-1 max-w-[170px] truncate font-mono text-xs text-slate-500">{row.id}</div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="flex flex-col items-start gap-1.5">
                        <ClientStatusBadge status={row.status} />
                        <ClientAttentionBadge level={row.attentionLevel} reasons={row.attentionReasons} />
                        <div className="text-xs text-slate-500">{row.readinessScore}% ready</div>
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold capitalize">
                        <CreditCard className="h-3.5 w-3.5 text-slate-500" />
                        {row.method.replaceAll("_", " ")}
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="font-medium capitalize">{row.provider}</div>
                      <div className="mt-1 text-xs text-slate-500">{row.providerEnvironment}</div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="max-w-[210px] truncate font-mono text-xs">{row.providerOrderId ?? "Not created"}</div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="flex items-start gap-2">
                        <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                        <div>
                          <div className="max-w-[180px] truncate font-medium">{row.guestName}</div>
                          <div className="mt-1 max-w-[190px] truncate text-xs text-slate-500">{row.guestEmail ?? "No email"}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="flex items-start gap-2">
                        <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                        <div>
                          <div className="max-w-[230px] truncate font-medium">{row.propertyTitle}</div>
                          <div className="mt-1 text-xs text-slate-500">{row.propertyCity ?? row.propertyId ?? "Not linked"}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="max-w-[180px] truncate font-mono text-xs">{row.reservationId ?? "Missing link"}</div>
                      <div className="mt-1"><ClientStatusBadge status={row.bookingStatus ?? "missing"} /></div>
                    </td>
                    <td className="px-3 py-3 align-top font-semibold tabular-nums">{row.amountLabel}</td>
                    <td className="px-3 py-3 align-top">{row.currency}</td>
                    <td className="px-3 py-3 align-top">
                      <ClientStatusBadge status={row.providerStatus ?? "unknown"} />
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="max-w-[190px] truncate font-mono text-xs">{row.providerCaptureId ?? "No capture"}</div>
                      <div className="mt-1 max-w-[190px] truncate font-mono text-xs text-slate-500">{row.providerAuthorizationId ?? "No authorization"}</div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <ClientStatusBadge status={row.disputeStatus} />
                      <div className="mt-1 text-xs text-muted-foreground">{row.disputeCount} cases</div>
                    </td>
                    <td className="px-3 py-3 align-top">{formatDateTime(row.createdAtIso)}</td>
                    <td className="px-3 py-3 align-top">
                      <div>{formatDateTime(row.lastEventAtIso)}</div>
                      <div className="mt-1 max-w-[240px] truncate text-xs text-slate-500">{row.lastEventSummary ?? "No payment event recorded"}</div>
                    </td>
                    <td className="px-3 py-3 align-top" onClick={(event) => event.stopPropagation()}>
                      <div className="flex flex-col gap-2">
                        <Link
                          href={row.rowHref}
                          className="inline-flex min-h-8 items-center justify-center rounded-md border border-slate-200 bg-white px-2 text-xs font-medium shadow-sm hover:border-slate-400"
                        >
                          <FileText className="mr-1.5 h-3.5 w-3.5" />
                          Detail
                        </Link>
                        {row.reservationId ? (
                          <Link
                            href={`/admin/bookings?bookingId=${row.reservationId}`}
                            className="inline-flex min-h-8 items-center justify-center rounded-md border border-slate-200 bg-white px-2 text-xs font-medium shadow-sm hover:border-slate-400"
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
      </div>

      {isPending ? (
        <div className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm shadow-lg">
          <Loader2 className="h-4 w-4 animate-spin" />
          Opening payment workspace
        </div>
      ) : null}
    </div>
  );
}
