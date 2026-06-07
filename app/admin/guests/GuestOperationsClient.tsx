"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  CheckSquare,
  Download,
  FileText,
  Loader2,
  ShieldCheck,
  Sparkles,
  Square,
  UserRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { GuestOperationsRow } from "@/app/lib/guestOperations";
import {
  bulkCreateGuestVerificationsAction,
  bulkCreatePremiumProfilesAction,
  createGuestPremiumProfileAction,
  createGuestVerificationAction,
} from "./actions";

type GuestOperationsClientProps = {
  rows: GuestOperationsRow[];
  returnTo: string;
  selectedGuestId?: string | null;
  pagination: {
    totalCount: number;
    visibleCount: number;
    from: number;
    to: number;
    page: number;
    totalPages: number;
    previousHref: string | null;
    nextHref: string | null;
  };
};

function csvEscape(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function formatDate(value: string | null) {
  if (!value) return "No activity";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function ClientStatusBadge({ status, label }: { status?: string | null; label?: string | null }) {
  const normalized = status || "not_set";
  const tone =
    ["verified", "premium_ready", "low", "captured", "paid_cleanly", "complete", "ready"].includes(normalized)
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : ["critical", "high", "failed", "rejected", "open", "requires_review", "payment_requires_review"].includes(normalized)
        ? "border-red-200 bg-red-50 text-red-800"
        : ["medium", "pending", "candidate", "under_review", "missing", "manual_settlement_exposure", "foundation"].includes(normalized)
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <span className={`inline-flex min-h-7 items-center rounded-full border px-3 py-1 text-xs font-medium ${tone}`}>
      {label ?? normalized.replaceAll("_", " ")}
    </span>
  );
}

function RiskPill({ row }: { row: GuestOperationsRow }) {
  const risk = row.riskLevel;
  const tone =
    risk === "critical"
      ? "border-red-300 bg-red-100 text-red-900"
      : risk === "high"
        ? "border-red-200 bg-red-50 text-red-800"
        : risk === "medium"
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : risk === "low"
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-slate-200 bg-slate-50 text-slate-700";
  return (
    <span
      className={`inline-flex min-h-7 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${tone}`}
      title={row.reviewReasons[0] ?? "No active operator review trigger"}
    >
      {risk === "low" ? <BadgeCheck className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
      {risk}
    </span>
  );
}

function selectedActionDisabledReason(
  selectedRows: GuestOperationsRow[],
  capability: "canCreateVerification" | "canCreatePremiumProfile",
  reasonKey: "createVerificationDisabledReason" | "createPremiumProfileDisabledReason",
  emptyReason: string
) {
  if (!selectedRows.length) return "Select guests first.";
  if (selectedRows.some((row) => row[capability])) return null;
  return selectedRows[0]?.[reasonKey] ?? emptyReason;
}

export function GuestOperationsClient({
  rows,
  returnTo,
  selectedGuestId,
  pagination,
}: GuestOperationsClientProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const selectedRows = useMemo(
    () => rows.filter((row) => selectedIds.includes(row.id)),
    [rows, selectedIds]
  );
  const allVisibleSelected = rows.length > 0 && rows.every((row) => selectedIds.includes(row.id));
  const verificationDisabledReason = selectedActionDisabledReason(
    selectedRows,
    "canCreateVerification",
    "createVerificationDisabledReason",
    "Selected guests already have active or verified verification records."
  );
  const premiumDisabledReason = selectedActionDisabledReason(
    selectedRows,
    "canCreatePremiumProfile",
    "createPremiumProfileDisabledReason",
    "Selected guests do not currently pass premium candidate rules."
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
      "guest_id",
      "name",
      "email",
      "role",
      "account_age",
      "reservations",
      "upcoming_current_stay",
      "payment_health",
      "dispute_exposure",
      "handover_exposure",
      "verification_state",
      "premium_state",
      "preferred_language",
      "preferred_currency",
      "risk_level",
      "readiness_score",
      "value_signal",
      "latest_activity",
      "next_action",
      "review_reasons",
    ];
    const body = targetRows.map((row) =>
      [
        row.id,
        row.name,
        row.email,
        row.role,
        row.accountAgeLabel,
        row.reservationCount,
        row.upcomingCurrentStay,
        row.paymentHealth,
        row.disputeExposureLabel,
        row.handoverExposureLabel,
        row.verificationState,
        row.premiumState,
        row.preferredLanguage,
        row.preferredCurrency,
        row.riskLevel,
        row.readinessScore ?? "insufficient history",
        row.valueSignal,
        row.latestActivityIso,
        row.nextActionLabel,
        row.reviewReasons.join(" | "),
      ]
        .map(csvEscape)
        .join(",")
    );
    const blob = new Blob([[header.join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `kantara-guests-${selectedRows.length ? "selected" : "current-view"}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (!rows.length) return null;

  return (
    <div className="space-y-4">
      <section className="sticky top-0 z-20 overflow-hidden rounded-md border bg-background/95 shadow-sm backdrop-blur">
        <div className="border-b bg-slate-950 px-4 py-3 text-white">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="font-semibold">Guest lifecycle table</h2>
              <p className="mt-1 text-xs text-slate-300">
                Showing {pagination.from}-{pagination.to} of {pagination.visibleCount} filtered guests. Bulk actions are safe operational creates only.
              </p>
            </div>
            <div className="inline-flex min-h-9 items-center rounded-md border border-white/10 bg-white/10 px-3 text-sm font-semibold">
              {selectedRows.length} selected
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
            <Button type="button" variant="outline" onClick={exportSelectedRows}>
              <Download className="mr-2 h-4 w-4" />
              Export {selectedRows.length ? "selected" : "view"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setSelectedIds([])} disabled={!selectedRows.length}>
              Clear selection
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <form action={bulkCreateGuestVerificationsAction}>
              <input type="hidden" name="guestIds" value={selectedIds.join(",")} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <Button
                type="submit"
                variant="outline"
                disabled={Boolean(verificationDisabledReason)}
                title={verificationDisabledReason ?? "Create verification records for eligible selected guests"}
              >
                <ShieldCheck className="mr-2 h-4 w-4" />
                Create verifications
              </Button>
            </form>
            <form action={bulkCreatePremiumProfilesAction}>
              <input type="hidden" name="guestIds" value={selectedIds.join(",")} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <Button
                type="submit"
                variant="outline"
                disabled={Boolean(premiumDisabledReason)}
                title={premiumDisabledReason ?? "Create premium profiles for eligible selected guests"}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Create premium profiles
              </Button>
            </form>
            <Button type="button" variant="outline" disabled title="Bulk role/status editing is disabled because this module does not mutate account authority.">
              Bulk account edit disabled
            </Button>
          </div>
        </div>
        <div className="border-t px-4 py-2 text-xs text-muted-foreground">
          {verificationDisabledReason && selectedRows.length ? <p>Verification bulk action disabled: {verificationDisabledReason}</p> : null}
          {premiumDisabledReason && selectedRows.length ? <p>Premium bulk action disabled: {premiumDisabledReason}</p> : null}
        </div>
      </section>

      <section className="overflow-hidden rounded-md border bg-background shadow-sm">
        <div className="border-b bg-muted/40 px-4 py-3">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-semibold">Advanced guest table</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Dense operational view. Rows open the guest intelligence workspace.
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
          <table className="min-w-[2320px] w-full border-collapse text-sm">
            <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="w-11 px-3 py-3"><span className="sr-only">Select</span></th>
                <th className="px-3 py-3">Guest identity</th>
                <th className="px-3 py-3">Account age</th>
                <th className="px-3 py-3">Role/status</th>
                <th className="px-3 py-3">Reservations</th>
                <th className="px-3 py-3">Upcoming/current stay</th>
                <th className="px-3 py-3">Payment health</th>
                <th className="px-3 py-3">Dispute exposure</th>
                <th className="px-3 py-3">Handover exposure</th>
                <th className="px-3 py-3">Verification state</th>
                <th className="px-3 py-3">Premium state</th>
                <th className="px-3 py-3">Language/currency</th>
                <th className="px-3 py-3">Risk level</th>
                <th className="px-3 py-3">Value/readiness</th>
                <th className="px-3 py-3">Latest activity</th>
                <th className="px-3 py-3">Next action</th>
                <th className="px-3 py-3">Quick actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => {
                const selected = selectedIds.includes(row.id);
                const active = selectedGuestId === row.id;
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
                      active ? "outline outline-2 outline-offset-[-2px] outline-slate-900/25" : "",
                    ].join(" ")}
                  >
                    <td className="px-3 py-3 align-top" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${row.name}`}
                        checked={selected}
                        onChange={() => toggle(row.id)}
                        className="h-4 w-4 rounded border-input"
                      />
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-slate-50 text-xs font-semibold">
                          {row.initials}
                        </div>
                        <div className="min-w-0">
                          <div className="max-w-[190px] truncate font-semibold">{row.name}</div>
                          <div className="mt-1 max-w-[220px] truncate text-xs text-muted-foreground">{row.email}</div>
                          <div className="mt-1 max-w-[180px] truncate font-mono text-[11px] text-slate-500">{row.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="max-w-[170px] text-xs text-slate-600">{row.accountAgeLabel}</div>
                    </td>
                    <td className="px-3 py-3 align-top"><ClientStatusBadge status={row.role} /></td>
                    <td className="px-3 py-3 align-top">
                      <div className="font-semibold tabular-nums">{row.reservationCount}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{row.favoriteCount} saved homes</div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="max-w-[190px] truncate text-xs">{row.upcomingCurrentStay}</div>
                    </td>
                    <td className="px-3 py-3 align-top"><ClientStatusBadge status={row.paymentHealth.toLowerCase().replaceAll(" ", "_")} label={row.paymentHealth} /></td>
                    <td className="px-3 py-3 align-top"><ClientStatusBadge status={row.openDisputeExposure ? "open" : row.disputeExposure ? "exposed" : "none"} label={row.disputeExposureLabel} /></td>
                    <td className="px-3 py-3 align-top"><ClientStatusBadge status={row.unresolvedHandoverIssue ? "high" : row.handoverIssueExposure ? "medium" : "low"} label={row.handoverExposureLabel} /></td>
                    <td className="px-3 py-3 align-top"><ClientStatusBadge status={row.verificationState} /></td>
                    <td className="px-3 py-3 align-top"><ClientStatusBadge status={row.premiumState} /></td>
                    <td className="px-3 py-3 align-top">
                      <div>{row.preferredLanguage ?? "Not tracked"}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{row.preferredCurrency ?? "Not tracked"}</div>
                    </td>
                    <td className="px-3 py-3 align-top"><RiskPill row={row} /></td>
                    <td className="px-3 py-3 align-top">
                      <div className="max-w-[190px] truncate font-medium">{row.valueSignal}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{row.readinessScore === null ? "Insufficient history" : `${row.readinessScore}% readiness`}</div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div>{formatDate(row.latestActivityIso)}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{row.latestActivityLabel}</div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="max-w-[190px] font-medium">{row.nextActionLabel}</div>
                      <div className="mt-1 max-w-[220px] truncate text-xs text-muted-foreground">
                        {row.reviewReasons[0] ?? "No active review trigger"}
                      </div>
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
                        {row.nextActionHref ? (
                          <Link
                            href={row.nextActionHref}
                            className="inline-flex min-h-8 items-center justify-center rounded-md border px-2 text-xs font-medium hover:border-foreground/30"
                          >
                            Source
                            <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
                          </Link>
                        ) : null}
                        <form action={createGuestVerificationAction}>
                          <input type="hidden" name="guestId" value={row.id} />
                          <input type="hidden" name="returnTo" value={returnTo} />
                          <input type="hidden" name="category" value="identity" />
                          <Button type="submit" size="sm" variant="outline" className="w-full" disabled={!row.canCreateVerification} title={row.createVerificationDisabledReason ?? "Create guest verification"}>
                            Verify
                          </Button>
                        </form>
                        <form action={createGuestPremiumProfileAction}>
                          <input type="hidden" name="guestId" value={row.id} />
                          <input type="hidden" name="returnTo" value={returnTo} />
                          <Button type="submit" size="sm" variant="outline" className="w-full" disabled={!row.canCreatePremiumProfile} title={row.createPremiumProfileDisabledReason ?? "Create premium profile"}>
                            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                            Premium
                          </Button>
                        </form>
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
          Opening guest workspace
        </div>
      ) : null}
    </div>
  );
}
