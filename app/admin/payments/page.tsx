import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Banknote,
  BadgeCheck,
  CalendarDays,
  CircleDollarSign,
  ClipboardCheck,
  CreditCard,
  KeyRound,
  Link2,
  ListFilter,
  LockKeyhole,
  ReceiptText,
  Search,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";

import { EmptyState } from "@/app/components/admin/EmptyState";
import { IntelligencePanel } from "@/app/components/admin/IntelligencePanel";
import { KpiCard } from "@/app/components/admin/KpiCard";
import { ModuleShell } from "@/app/components/admin/ModuleShell";
import { ProviderStatus } from "@/app/components/admin/ProviderStatus";
import { ReadinessMeter } from "@/app/components/admin/ReadinessMeter";
import { RiskBadge } from "@/app/components/admin/RiskBadge";
import { StatusBadge } from "@/app/components/admin/StatusBadge";
import { PayPalCardTerminal } from "@/app/components/payments/PayPalCardTerminal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { requireAdmin } from "@/app/lib/auth";
import { isCurrencyCode } from "@/app/lib/globalization";
import { formatCurrencyAmount, formatDate } from "@/app/lib/marketplaceStatus";
import {
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  getPaymentOperationsDetail,
  getPaymentOperationsIndex,
  getPaymentTerminalReservations,
} from "@/app/lib/paymentOperations";
import {
  PAYMENT_OPERATIONAL_SEGMENTS,
  createPaymentsHref,
  readPaymentParam,
  type PaymentSearchParams,
} from "@/app/lib/paymentFilters";
import { PaymentDetailDrawer } from "./PaymentDetailDrawer";
import { PaymentOperationsClient } from "./PaymentOperationsClient";
import {
  createPayPalOrderAction,
  recordManualSettlementAction,
} from "./actions";

type AdminPaymentsPageProps = {
  searchParams?: PaymentSearchParams;
};

function selectLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function providerDisabledReason(provider: Awaited<ReturnType<typeof getPaymentOperationsIndex>>["provider"]) {
  if (provider.isConfigured) return null;
  if (!provider.hasClientId && !provider.hasSecret) {
    return "PayPal action disabled: PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are missing.";
  }
  if (!provider.hasClientId) return "PayPal action disabled: PAYPAL_CLIENT_ID is missing.";
  if (!provider.hasSecret) return "PayPal action disabled: PAYPAL_CLIENT_SECRET is missing.";
  return "PayPal action disabled: provider is not configured.";
}

type TerminalReservation = Awaited<ReturnType<typeof getPaymentTerminalReservations>>[number];
type PaymentFiltersForHiddenInputs = Awaited<ReturnType<typeof getPaymentOperationsIndex>>["filters"];

function personLabel(person?: { firstName?: string | null; lastName?: string | null; email?: string | null } | null) {
  if (!person) return "Not linked";
  return `${person.firstName ?? ""} ${person.lastName ?? ""}`.trim() || person.email || "Not linked";
}

function reservationLabel(reservation: Awaited<ReturnType<typeof getPaymentTerminalReservations>>[number]) {
  const guest = personLabel(reservation.User) || "Guest";
  const title = reservation.listingTitleSnapshot ?? reservation.Home?.approvedTitle ?? reservation.Home?.title ?? "Reservation";
  const amount = reservation.totalSnapshot
    ? formatCurrencyAmount(reservation.totalSnapshot, reservation.currencySnapshot)
    : "amount not locked";
  return `${title} - ${guest} - ${amount}`;
}

function reservationReference(reservation: TerminalReservation) {
  return `RES-${reservation.id.slice(0, 8).toUpperCase()}`;
}

function reservationTitle(reservation: TerminalReservation) {
  return reservation.listingTitleSnapshot ?? reservation.Home?.approvedTitle ?? reservation.Home?.title ?? "Reservation";
}

function reservationCity(reservation: TerminalReservation) {
  return reservation.listingCitySnapshot ?? reservation.Home?.city ?? "Location not set";
}

function reservationNights(reservation: TerminalReservation) {
  if (reservation.totalNightsSnapshot && reservation.totalNightsSnapshot > 0) return reservation.totalNightsSnapshot;
  const start = new Date(reservation.startDate);
  const end = new Date(reservation.endDate);
  const nights = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  return nights > 0 ? nights : 0;
}

function reservationAmountDue(reservation: TerminalReservation) {
  return reservation.totalSnapshot
    ? formatCurrencyAmount(reservation.totalSnapshot, reservation.currencySnapshot)
    : "Price snapshot missing";
}

function hasCapturedPayment(reservation: TerminalReservation) {
  return reservation.paymentRecords.some((payment) => payment.status === "captured");
}

function reservationIsCancelled(reservation: TerminalReservation) {
  return Boolean(reservation.cancelledAt) || ["cancelled", "canceled"].includes(reservation.bookingStatus.toLowerCase());
}

function terminalDisabledReason(
  reservation: TerminalReservation | null,
  provider: Awaited<ReturnType<typeof getPaymentOperationsIndex>>["provider"]
) {
  if (!reservation) return "Select a reservation first";
  if (reservationIsCancelled(reservation)) return "Reservation is cancelled";
  if (!reservation.totalSnapshot || reservation.totalSnapshot <= 0) return "Reservation has no price snapshot";
  if (!isCurrencyCode(reservation.currencySnapshot)) return "Currency is unsupported";
  if (!provider.isConfigured) return "PayPal is not configured";
  if (hasCapturedPayment(reservation)) return "Payment already captured";
  return null;
}

function settlementDisabledReason(reservation: TerminalReservation | null) {
  if (!reservation) return "Select a reservation first";
  return null;
}

function paymentPageHrefWithParams(href: string, params: Record<string, string | null | undefined>) {
  const url = new URL(href, "http://localhost");
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  });
  return `${url.pathname}${url.search}`;
}

function FilterHiddenInputs({ filters }: { filters: PaymentFiltersForHiddenInputs }) {
  return (
    <>
      {filters.search ? <input type="hidden" name="search" value={filters.search} /> : null}
      {filters.segment !== "all" ? <input type="hidden" name="segment" value={filters.segment} /> : null}
      {filters.status ? <input type="hidden" name="status" value={filters.status} /> : null}
      {filters.providerStatus ? <input type="hidden" name="providerStatus" value={filters.providerStatus} /> : null}
      {filters.method ? <input type="hidden" name="method" value={filters.method} /> : null}
      {filters.providerEnvironment ? <input type="hidden" name="providerEnvironment" value={filters.providerEnvironment} /> : null}
      {filters.currency ? <input type="hidden" name="currency" value={filters.currency} /> : null}
      {filters.amountMin !== null ? <input type="hidden" name="amountMin" value={filters.amountMin} /> : null}
      {filters.amountMax !== null ? <input type="hidden" name="amountMax" value={filters.amountMax} /> : null}
      {filters.createdFrom ? <input type="hidden" name="createdFrom" value={filters.createdFrom.toISOString().slice(0, 10)} /> : null}
      {filters.createdTo ? <input type="hidden" name="createdTo" value={filters.createdTo.toISOString().slice(0, 10)} /> : null}
      {filters.requiresReviewOnly ? <input type="hidden" name="requiresReviewOnly" value="1" /> : null}
      {filters.missingReservationLinkOnly ? <input type="hidden" name="missingReservationLinkOnly" value="1" /> : null}
      {filters.disputeStatus ? <input type="hidden" name="disputeStatus" value={filters.disputeStatus} /> : null}
      {filters.pageSize !== 25 ? <input type="hidden" name="pageSize" value={filters.pageSize} /> : null}
      {filters.paymentId ? <input type="hidden" name="paymentId" value={filters.paymentId} /> : null}
    </>
  );
}

function ReservationContextCard({ reservation }: { reservation: TerminalReservation }) {
  const payments = reservation.paymentRecords;
  const disputes = reservation.disputeCases;
  const latestPayment = payments[0] ?? null;
  const captured = hasCapturedPayment(reservation);
  const cancelled = reservationIsCancelled(reservation);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white text-sm shadow-sm">
      <div className="border-b border-slate-200 bg-slate-950 p-4 text-white">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              <Link2 className="h-3.5 w-3.5" />
              Selected reservation
            </p>
            <h3 className="mt-2 font-mono text-lg font-semibold">{reservationReference(reservation)}</h3>
            <p className="mt-1 truncate text-sm text-slate-300">{reservationTitle(reservation)} - {reservationCity(reservation)}</p>
          </div>
          <StatusBadge status={reservation.bookingStatus} label={selectLabel(reservation.bookingStatus)} className="border-white/10 bg-white/10 text-white" />
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <span className={captured ? "rounded-md border border-emerald-300/30 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-100" : "rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200"}>
            {captured ? "Captured payment exists" : "No captured payment"}
          </span>
          <span className={cancelled ? "rounded-md border border-red-300/30 bg-red-400/10 px-3 py-2 text-xs font-semibold text-red-100" : "rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200"}>
            {cancelled ? "Cancelled reservation" : "Reservation payable check"}
          </span>
          <span className={disputes.length ? "rounded-md border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-100" : "rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200"}>
            {disputes.length ? `${disputes.length} linked dispute cases` : "No linked disputes"}
          </span>
        </div>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
        <TerminalContextMetric icon={<Users className="h-4 w-4" />} label="Guest" value={personLabel(reservation.User)} detail={reservation.User?.email ?? "No email linked"} />
        <TerminalContextMetric icon={<BadgeCheck className="h-4 w-4" />} label="Partner" value={personLabel(reservation.Home?.User)} detail={reservation.Home?.User?.email ?? "No partner linked"} />
        <TerminalContextMetric icon={<CalendarDays className="h-4 w-4" />} label="Stay dates" value={`${formatDate(reservation.startDate)} - ${formatDate(reservation.endDate)}`} detail={`${reservationNights(reservation)} nights`} />
        <TerminalContextMetric icon={<CircleDollarSign className="h-4 w-4" />} label="Amount due" value={reservationAmountDue(reservation)} detail="Locked reservation snapshot" />
      </div>
      <div className="grid gap-3 border-t border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
        <TerminalContextMetric icon={<ReceiptText className="h-4 w-4" />} label="Existing payments" value={String(payments.length)} detail={latestPayment ? `${selectLabel(latestPayment.status)} - ${formatCurrencyAmount(latestPayment.amount.toString(), latestPayment.currency)}` : "No linked payments"} />
        <TerminalContextMetric icon={<CreditCard className="h-4 w-4" />} label="Payment status" value={captured ? "Captured" : latestPayment ? selectLabel(latestPayment.status) : "No payment yet"} detail={latestPayment?.providerOrderId ?? "No PayPal order id"} />
        <TerminalContextMetric icon={<ShieldCheck className="h-4 w-4" />} label="Dispute / risk" value={disputes.length ? `${disputes.length} linked` : "No linked disputes"} detail={disputes[0] ? `${selectLabel(disputes[0].status)} - ${selectLabel(disputes[0].priority)}` : "No payment dispute risk"} />
      </div>
    </div>
  );
}

function TerminalContextMetric({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail?: string | null;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
        {icon}
        {label}
      </p>
      <p className="mt-2 break-words font-semibold text-slate-950">{value}</p>
      {detail ? <p className="mt-1 break-words text-xs leading-5 text-slate-500">{detail}</p> : null}
    </div>
  );
}

function CommandSignal({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2">
      <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-slate-400">
        {icon}
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function OperationsSignalCard({
  icon,
  label,
  value,
  detail,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "success" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50"
        : "border-slate-200 bg-slate-50";

  return (
    <div className={`rounded-md border p-3 ${toneClass}`}>
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        {icon}
        {label}
      </p>
      <p className="mt-2 break-words font-semibold text-slate-950">{value}</p>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{detail}</p>
    </div>
  );
}

function activeSegmentDescription(segmentId: string) {
  return PAYMENT_OPERATIONAL_SEGMENTS.find((segment) => segment.id === segmentId)?.description ?? "Current payment operations view.";
}

export default async function AdminPaymentsPage({ searchParams }: AdminPaymentsPageProps) {
  await requireAdmin();
  const terminalSearch = readPaymentParam(searchParams, "terminalSearch") ?? "";
  const terminalReservationId = readPaymentParam(searchParams, "terminalReservationId") ?? null;
  const settlementSearch = readPaymentParam(searchParams, "settlementSearch") ?? "";
  const settlementReservationId = readPaymentParam(searchParams, "settlementReservationId") ?? null;
  const [data, terminalReservations, settlementReservations] = await Promise.all([
    getPaymentOperationsIndex(searchParams),
    getPaymentTerminalReservations(terminalSearch, terminalReservationId),
    getPaymentTerminalReservations(settlementSearch, settlementReservationId),
  ]);
  const selectedId = data.filters.paymentId;
  const selectedDetail = selectedId ? await getPaymentOperationsDetail(selectedId) : null;
  const closeHref = createPaymentsHref(data.filters, { paymentId: null, notice: null, error: null });
  const returnTo = createPaymentsHref(data.filters, { paymentId: selectedId ?? null, notice: null, error: null });
  const selectedTerminalReservation = terminalReservationId
    ? terminalReservations.find((reservation) => reservation.id === terminalReservationId) ?? null
    : null;
  const selectedSettlementReservation = settlementReservationId
    ? settlementReservations.find((reservation) => reservation.id === settlementReservationId) ?? null
    : null;
  const terminalReturnTo = paymentPageHrefWithParams(returnTo, {
    terminalSearch,
    terminalReservationId,
    settlementSearch,
    settlementReservationId,
  });
  const settlementReturnTo = paymentPageHrefWithParams(returnTo, {
    terminalSearch,
    terminalReservationId,
    settlementSearch,
    settlementReservationId,
  });
  const terminalBlocker = terminalDisabledReason(selectedTerminalReservation, data.provider);
  const settlementBlocker = settlementDisabledReason(selectedSettlementReservation);
  const rows = data.rows.map((row) => ({
    ...row,
    rowHref: createPaymentsHref(data.filters, { paymentId: row.id, notice: null, error: null }),
  }));
  const notice = readPaymentParam(searchParams, "notice");
  const error = readPaymentParam(searchParams, "error");
  const statusCounts = Object.fromEntries(data.segmentCounts.map((segment) => [segment.id, segment.count]));
  const providerBlocker = providerDisabledReason(data.provider);
  const moduleStatus = data.intelligence.criticalCount
    ? "critical"
    : data.intelligence.highCount
      ? "requires_review"
      : data.intelligence.currentPageAttentionCount
        ? "watching"
        : "operational";

  return (
    <ModuleShell
      title="Payments"
      description="Finance-grade payment operations for hosted checkout readiness, PayPal order and capture workflows, reservation-linked records, manual exception settlement, disputes, timelines, and audit-safe provider diagnostics."
      moduleStatus={moduleStatus}
      statusLabel={
        data.intelligence.currentPageAttentionCount
          ? `${data.intelligence.currentPageAttentionCount} rows need attention on this page`
          : "Current page clear"
      }
      environment={`PayPal ${data.provider.displayEnvironment}`}
      notice={notice}
      error={error}
      layout="split"
      primaryAction={
        <Button asChild>
          <Link href="#payment-terminal">
            <Wallet className="mr-2 h-4 w-4" />
            Open terminal
          </Link>
        </Button>
      }
      secondaryActions={
        <>
          <Button asChild variant="outline">
            <Link href="#payment-queue">
              <ListFilter className="mr-2 h-4 w-4" />
              Payment queue
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/settings">
              <Settings className="mr-2 h-4 w-4" />
              Provider settings
            </Link>
          </Button>
        </>
      }
      intelligence={
        <IntelligencePanel
          title="Payment intelligence"
          readiness={[
            {
              label: "Current view readiness",
              score: data.intelligence.currentPageReadiness,
              detail: data.pagination.totalCount
                ? `${data.pagination.from}-${data.pagination.to} of ${data.pagination.totalCount} payment records in scope.`
                : "No payment records in this view.",
            },
            {
              label: "PayPal provider readiness",
              score: data.provider.isConfigured ? (data.provider.hasWebhookId ? 92 : 82) : 22,
              detail: data.provider.isConfigured
                ? `Orders and capture API calls are enabled for ${data.provider.environment}.`
                : "Server credentials are missing; provider actions are disabled.",
            },
            {
              label: "Manual settlement discipline",
              score: data.intelligence.manualSettlementCount ? 80 : null,
              detail: `${data.intelligence.manualSettlementCount} manual settlement rows in this page; they are clearly marked as non-PayPal captures.`,
            },
          ]}
          blockers={[
            ...(!data.provider.isConfigured
              ? [{
                  id: "paypal_env",
                  title: "PayPal credentials missing",
                  description: providerBlocker ?? "PayPal provider is not configured.",
                  severity: "critical" as const,
                  href: "/admin/settings",
                  actionLabel: "Open settings",
                }]
              : []),
            ...data.intelligence.blockers.map((row) => ({
              id: row.id,
              title: `${row.reference}: ${row.nextBestAction}`,
              description: row.attentionReasons[0] ?? "Payment requires operations review.",
              severity: (row.attentionLevel === "none" ? "info" : row.attentionLevel) as "critical" | "high" | "medium" | "low" | "info",
              href: createPaymentsHref(data.filters, { paymentId: row.id, notice: null, error: null }),
              actionLabel: "Open payment",
            })),
          ]}
          suggestions={[
            {
              id: "provider_unsynced",
              title: "Sync provider state before decisions",
              description: "Use PayPal sync for selected order ids before review, dispute, or cancellation decisions.",
              severity: (data.intelligence.providerUnsyncedCount ? "medium" : "info") as "medium" | "info",
              href: createPaymentsHref(data.filters, { segment: "provider_unsynced", page: 1, paymentId: null }),
              actionLabel: "Open unsynced",
            },
            {
              id: "missing_reservation",
              title: "Watch captured records without reservations",
              description: "Captured records without a reservation link need operational reconciliation.",
              severity: ((statusCounts.missing_reservation ?? 0) ? "medium" : "info") as "medium" | "info",
              href: createPaymentsHref(data.filters, { segment: "missing_reservation", page: 1, paymentId: null }),
              actionLabel: "Open missing links",
            },
            {
              id: "card_security",
              title: "Hosted payment fields only",
              description: "Kantara never stores card number, CVV, or raw card payloads. PayPal handles card entry.",
              severity: "info",
            },
          ]}
        />
      }
    >
      <div className="space-y-5">
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-950 p-5 text-white">
            <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-start 2xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={data.filters.segment} label={selectLabel(data.filters.segment)} className="border-white/10 bg-white/10 text-white" />
                <RiskBadge
                  severity={moduleStatus === "critical" ? "critical" : moduleStatus === "requires_review" ? "high" : "info"}
                  label={moduleStatus === "operational" ? "Queue stable" : "Review needed"}
                />
              </div>
                <h1 className="mt-3 text-2xl font-semibold tracking-tight">Payment Operations Control Room</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                {activeSegmentDescription(data.filters.segment)} Rows open into a payment workspace with PayPal order state, linked booking context, disputes, events, timeline, and validated actions.
              </p>
            </div>
              <div className="grid gap-2 sm:grid-cols-3 2xl:min-w-[520px]">
                <CommandSignal icon={<Activity className="h-4 w-4" />} label="Queue scope" value={`${data.pagination.totalCount} records`} />
                <CommandSignal icon={<AlertTriangle className="h-4 w-4" />} label="Attention" value={`${data.intelligence.currentPageAttentionCount} visible`} />
                <CommandSignal icon={<ShieldCheck className="h-4 w-4" />} label="Provider" value={data.provider.status.replaceAll("_", " ")} />
              </div>
            </div>
          </div>
          <div className="grid gap-5 p-5 xl:grid-cols-[1fr_410px] xl:items-start">
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
              <OperationsSignalCard icon={<CreditCard className="h-4 w-4" />} label="PayPal environment" value={data.provider.displayEnvironment} detail={data.provider.isConfigured ? "Orders and captures can run server-side." : "Provider actions are currently disabled."} />
              <OperationsSignalCard icon={<KeyRound className="h-4 w-4" />} label="Credentials" value={data.provider.isConfigured ? "Server ready" : "Missing"} detail={providerBlocker ?? "Client ID and secret are configured without exposing secrets."} tone={data.provider.isConfigured ? "success" : "warning"} />
              <OperationsSignalCard icon={<ReceiptText className="h-4 w-4" />} label="Manual settlements" value={String(data.intelligence.manualSettlementCount)} detail="Internal records only, never PayPal captures." />
              <OperationsSignalCard icon={<ClipboardCheck className="h-4 w-4" />} label="Next best action" value={data.intelligence.blockers[0]?.nextBestAction ?? "Monitor queue"} detail={data.intelligence.blockers[0]?.attentionReasons[0] ?? "No critical blocker surfaced on this page."} />
            </div>
            <ProviderStatus
              provider="PayPal"
              environment={data.provider.displayEnvironment}
              status={data.provider.status}
              details={[
                { label: "Environment", ok: data.provider.displayEnvironment !== "not configured", value: data.provider.displayEnvironment },
                { label: "Client ID", ok: data.provider.hasClientId, value: data.provider.hasClientId ? "Configured" : "Missing" },
                { label: "Server secret", ok: data.provider.hasSecret, value: data.provider.hasSecret ? "Configured server-side" : "Missing" },
                { label: "Webhook ID", ok: data.provider.hasWebhookId, value: data.provider.hasWebhookId ? "Configured" : "Optional / missing" },
                { label: "Public SDK ID", ok: data.provider.hasPublicClientId, value: data.provider.hasPublicClientId ? "Configured" : "Missing" },
                { label: "Card fields", ok: data.provider.hasPublicClientId, value: data.provider.cardFieldsStatus.replaceAll("_", " ") },
              ]}
            />
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <KpiCard label="Payments in view" value={data.pagination.totalCount} />
          <KpiCard label="Requires review" value={statusCounts.requires_review ?? 0} href={createPaymentsHref(data.filters, { segment: "requires_review", page: 1, paymentId: null })} tone={(statusCounts.requires_review ?? 0) ? "danger" : "success"} />
          <KpiCard label="Order created" value={statusCounts.order_created ?? 0} href={createPaymentsHref(data.filters, { segment: "order_created", page: 1, paymentId: null })} tone={(statusCounts.order_created ?? 0) ? "warning" : "success"} />
          <KpiCard label="Authorized" value={statusCounts.authorized ?? 0} href={createPaymentsHref(data.filters, { segment: "authorized", page: 1, paymentId: null })} tone={(statusCounts.authorized ?? 0) ? "info" : "success"} />
          <KpiCard label="Provider unsynced" value={statusCounts.provider_unsynced ?? 0} href={createPaymentsHref(data.filters, { segment: "provider_unsynced", page: 1, paymentId: null })} tone={(statusCounts.provider_unsynced ?? 0) ? "warning" : "success"} />
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(620px,0.95fr)_minmax(0,1.05fr)] 2xl:grid-cols-[minmax(760px,1fr)_minmax(0,1fr)]">
          <div className="space-y-5">
            <PayPalCardTerminal
              environment={data.provider.displayEnvironment}
              status={data.provider.status}
              isConfigured={data.provider.isConfigured}
              hasPublicClientId={data.provider.hasPublicClientId}
              hasWebhookId={data.provider.hasWebhookId}
            />

            <div id="payment-terminal" className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 bg-white p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-blue-200 bg-blue-50 text-blue-800">
                      <CreditCard className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Reservation-first terminal</p>
                      <h2 className="mt-1 text-xl font-semibold tracking-tight">Create a linked PayPal order</h2>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                        Select a reservation first. PayPal orders are created from locked reservation price snapshots and are revalidated by the server action.
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex min-h-10 items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-950">
                    <LockKeyhole className="h-4 w-4" />
                    Snapshot amount only
                  </span>
                </div>
              </div>

              <div className="grid gap-4 p-5 2xl:grid-cols-[minmax(280px,1fr)_minmax(260px,0.85fr)_minmax(240px,0.75fr)]">
                <div className="space-y-3">
                  <form action="/admin/payments" className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                    <FilterHiddenInputs filters={data.filters} />
                    {settlementSearch ? <input type="hidden" name="settlementSearch" value={settlementSearch} /> : null}
                    {settlementReservationId ? <input type="hidden" name="settlementReservationId" value={settlementReservationId} /> : null}
                    <label>
                      <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <Search className="h-4 w-4 text-slate-500" />
                        Search reservation, guest, property, or booking reference
                      </span>
                      <Input
                        name="terminalSearch"
                        defaultValue={terminalSearch}
                        placeholder="Start with a reservation reference, guest email, or property title"
                        className="mt-1"
                      />
                    </label>
                    <label>
                      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Reservation selection</span>
                      <select
                        name="terminalReservationId"
                        defaultValue={terminalReservationId ?? ""}
                        className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm"
                      >
                        <option value="">Start with a reservation reference, guest email, or property title</option>
                        {terminalReservations.map((reservation) => (
                          <option key={reservation.id} value={reservation.id}>
                            {reservationLabel(reservation)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" variant="outline">Load reservation</Button>
                      <Button asChild type="button" variant="ghost">
                        <Link href={paymentPageHrefWithParams(terminalReturnTo, { terminalSearch: null, terminalReservationId: null })}>Clear</Link>
                      </Button>
                    </div>
                    {!terminalReservations.length && !terminalSearch ? (
                      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                        <p className="font-semibold">No reservations available for payment creation.</p>
                        <Button asChild type="button" variant="outline" className="mt-3">
                          <Link href="/admin/bookings">Open bookings</Link>
                        </Button>
                      </div>
                    ) : null}
                    {!terminalReservations.length && terminalSearch ? (
                      <p className="rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-600">No reservations matched this payment terminal search.</p>
                    ) : null}
                  </form>

                  {selectedTerminalReservation ? (
                    <ReservationContextCard reservation={selectedTerminalReservation} />
                  ) : (
                    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-600">
                          <Link2 className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-semibold">Select a reservation to create a PayPal order.</p>
                          <p className="mt-1 leading-5 text-slate-600">PayPal orders must be linked to a reservation price snapshot. Manual exception payments are separated below and require a reason.</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <form action={createPayPalOrderAction} className="grid content-start gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <input type="hidden" name="returnTo" value={terminalReturnTo} />
                  {selectedTerminalReservation ? <input type="hidden" name="reservationId" value={selectedTerminalReservation.id} /> : null}
                  <div>
                    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      <CircleDollarSign className="h-4 w-4" />
                      Amount due
                    </p>
                    <p className="mt-2 text-2xl font-semibold tracking-tight">{selectedTerminalReservation ? reservationAmountDue(selectedTerminalReservation) : "No reservation selected"}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">Read from the locked reservation snapshot. The terminal does not accept manual PayPal amounts.</p>
                  </div>
                  <label>
                    <span className="text-sm font-medium">Payment method</span>
                    <select name="method" defaultValue="paypal_card" className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option value="paypal_card">PayPal hosted card</option>
                      <option value="paypal_wallet">PayPal wallet checkout</option>
                    </select>
                  </label>
                  <label>
                    <span className="text-sm font-medium">Order intent</span>
                    <select name="intent" defaultValue="CAPTURE" className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option value="CAPTURE">Capture flow</option>
                      <option value="AUTHORIZE">Authorize first</option>
                    </select>
                  </label>
                  <Button type="submit" disabled={Boolean(terminalBlocker)}>
                    <CreditCard className="mr-2 h-4 w-4" />
                    Create PayPal order
                  </Button>
                  {terminalBlocker ? <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs font-medium leading-5 text-amber-950">{terminalBlocker}</p> : null}
                </form>

                <div className="grid content-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-700" />
                    <p className="font-semibold">Blockers and next actions</p>
                  </div>
                  <ul className="grid gap-2">
                    <li className="rounded-md border border-slate-200 bg-white p-3">
                      <span className="font-medium">{terminalBlocker ?? "Ready to create PayPal order"}</span>
                      <p className="mt-1 text-xs leading-5 text-slate-600">
                        {selectedTerminalReservation
                          ? "Provider and reservation checks run again on the server before creating any order."
                          : "Select reservation context before starting a provider order."}
                      </p>
                    </li>
                    <li className="rounded-md border border-slate-200 bg-white p-3">
                      <span className="font-medium">Existing linked payments</span>
                      <p className="mt-1 text-xs leading-5 text-slate-600">
                        {selectedTerminalReservation
                          ? `${selectedTerminalReservation.paymentRecords.length} payment records linked to this reservation.`
                          : "No reservation selected."}
                      </p>
                    </li>
                    <li className="rounded-md border border-slate-200 bg-white p-3">
                      <span className="font-medium">Operational risk</span>
                      <p className="mt-1 text-xs leading-5 text-slate-600">
                        {selectedTerminalReservation?.disputeCases.length
                          ? `${selectedTerminalReservation.disputeCases.length} linked dispute cases should be reviewed before settlement decisions.`
                          : "No linked dispute blocker detected from selected context."}
                      </p>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-amber-200 bg-white shadow-sm">
              <div className="border-b border-amber-200 bg-amber-50 p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-amber-200 bg-white text-amber-800">
                      <Banknote className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-800">Controlled exception path</p>
                      <h2 className="mt-1 text-xl font-semibold tracking-tight text-amber-950">Exception settlement record</h2>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-950">
                        Use only when funds were settled outside PayPal, such as bank transfer, cash-to-host, or verified offline settlement. This creates internal records only.
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex min-h-10 items-center gap-2 rounded-md border border-amber-300 bg-white px-3 text-sm font-semibold text-amber-950">
                    <AlertTriangle className="h-4 w-4" />
                    Advanced operation
                  </span>
                </div>
              </div>

              <div className="grid gap-4 p-5 2xl:grid-cols-[minmax(280px,1fr)_minmax(280px,0.9fr)]">
                <div className="space-y-3">
                  <form action="/admin/payments" className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                    <FilterHiddenInputs filters={data.filters} />
                    {terminalSearch ? <input type="hidden" name="terminalSearch" value={terminalSearch} /> : null}
                    {terminalReservationId ? <input type="hidden" name="terminalReservationId" value={terminalReservationId} /> : null}
                    <label>
                      <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <Search className="h-4 w-4 text-slate-500" />
                        Search reservation, guest, property, or booking reference
                      </span>
                      <Input
                        name="settlementSearch"
                        defaultValue={settlementSearch}
                        placeholder="Start with a reservation reference, guest email, or property title"
                        className="mt-1"
                      />
                    </label>
                    <label>
                      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Reservation selection</span>
                      <select
                        name="settlementReservationId"
                        defaultValue={settlementReservationId ?? ""}
                        className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm"
                      >
                        <option value="">Start with a reservation reference, guest email, or property title</option>
                        {settlementReservations.map((reservation) => (
                          <option key={reservation.id} value={reservation.id}>
                            {reservationLabel(reservation)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" variant="outline">Load settlement context</Button>
                      <Button asChild type="button" variant="ghost">
                        <Link href={paymentPageHrefWithParams(settlementReturnTo, { settlementSearch: null, settlementReservationId: null })}>Clear</Link>
                      </Button>
                    </div>
                  </form>

                  {selectedSettlementReservation ? (
                    <ReservationContextCard reservation={selectedSettlementReservation} />
                  ) : (
                    <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/60 p-4 text-sm text-amber-950">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <div>
                          <p className="font-semibold">Select a reservation before recording an exception settlement.</p>
                          <p className="mt-1 leading-5">Offline settlement records should inherit guest, property, partner, and price snapshot context whenever possible.</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <form action={recordManualSettlementAction} className="grid content-start gap-3 rounded-lg border border-amber-200 bg-white p-4 shadow-sm">
                  <input type="hidden" name="returnTo" value={settlementReturnTo} />
                  {selectedSettlementReservation ? <input type="hidden" name="reservationId" value={selectedSettlementReservation.id} /> : null}
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-950">
                    <p className="font-semibold">Records internal settlement only</p>
                    <p className="mt-1">This does not call PayPal, does not capture funds, and must not contain card numbers or CVV.</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label>
                      <span className="text-sm font-medium">Amount</span>
                      <Input
                        name="amount"
                        defaultValue={selectedSettlementReservation?.totalSnapshot?.toFixed(2) ?? ""}
                        inputMode="decimal"
                        placeholder="Amount from snapshot"
                        className="mt-1"
                      />
                    </label>
                    <label>
                      <span className="text-sm font-medium">Currency</span>
                      <Input
                        name="currency"
                        defaultValue={selectedSettlementReservation?.currencySnapshot ?? "USD"}
                        maxLength={3}
                        className="mt-1"
                      />
                    </label>
                  </div>
                  <label>
                    <span className="text-sm font-medium">Settlement method</span>
                    <select name="method" defaultValue="manual" className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option value="bank_transfer">Bank transfer</option>
                      <option value="cash_to_host">Cash to host</option>
                      <option value="manual">Manual</option>
                    </select>
                  </label>
                  <Textarea name="settlementNote" placeholder="Settlement note. No card data." rows={2} />
                  <Textarea name="overrideReason" placeholder="Required only if amount differs from the reservation snapshot." rows={2} />
                  <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
                    <input type="checkbox" name="offlineConfirmation" value="yes" className="mt-1" />
                    <span>I confirm this records an offline settlement only and does not mean PayPal captured funds.</span>
                  </label>
                  <Button type="submit" variant="outline" disabled={Boolean(settlementBlocker)}>
                    <Banknote className="mr-2 h-4 w-4" />
                    Record exception settlement
                  </Button>
                  {settlementBlocker ? <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs font-medium leading-5 text-amber-950">{settlementBlocker}</p> : null}
                  {selectedSettlementReservation && !selectedSettlementReservation.totalSnapshot ? (
                    <p className="text-xs text-amber-700">Reservation has no price snapshot; an amount override reason is required.</p>
                  ) : null}
                </form>
              </div>

              <details className="mx-5 mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-950">
                <summary className="cursor-pointer font-semibold">Advanced: record settlement without reservation</summary>
                <p className="mt-2 text-amber-900">
                  High-risk exception path. This creates a requires-review payment record that is missing reservation context and must be reconciled.
                </p>
                <form action={recordManualSettlementAction} className="mt-3 grid gap-3 rounded-md border border-red-200 bg-white p-3 text-foreground">
                  <input type="hidden" name="returnTo" value={settlementReturnTo} />
                  <input type="hidden" name="unlinkedManualSettlement" value="yes" />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label>
                      <span className="text-sm font-medium">Amount</span>
                      <Input name="amount" inputMode="decimal" className="mt-1" />
                    </label>
                    <label>
                      <span className="text-sm font-medium">Currency</span>
                      <Input name="currency" defaultValue="USD" maxLength={3} className="mt-1" />
                    </label>
                  </div>
                  <label>
                    <span className="text-sm font-medium">Settlement method</span>
                    <select name="method" defaultValue="manual" className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option value="bank_transfer">Bank transfer</option>
                      <option value="cash_to_host">Cash to host</option>
                      <option value="manual">Manual</option>
                    </select>
                  </label>
                  <Input name="payerDescription" placeholder="Payer name/email or description" />
                  <Textarea name="operationalReason" placeholder="Operational reason for missing reservation link" rows={2} />
                  <Textarea name="adminNote" placeholder="Admin note. No card data." rows={2} />
                  <Button type="submit" variant="outline" className="border-red-200 text-red-950 hover:bg-red-50">
                    Record unlinked exception for review
                  </Button>
                </form>
              </details>
            </div>
          </div>

          <div id="payment-queue" className="space-y-5 scroll-mt-6">
            <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 bg-white p-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                    <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      <ListFilter className="h-4 w-4" />
                      Queue segmentation
                    </p>
                    <h2 className="mt-2 text-lg font-semibold">Operational views</h2>
                    <p className="mt-1 text-sm leading-5 text-slate-600">
                    Segments are deterministic filters over real payment records and linked provider state.
                  </p>
                </div>
                <ReadinessMeter
                  label="Current page readiness"
                  score={data.intelligence.currentPageReadiness}
                  detail={data.intelligence.currentPageReadiness === null ? "No rows to score." : "Computed from linked payment state."}
                />
              </div>
              </div>
              <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-7">
                {data.segmentCounts.map((segment) => {
                  const active = data.filters.segment === segment.id;
                  return (
                    <Link
                      key={segment.id}
                      href={createPaymentsHref(data.filters, { segment: segment.id, page: 1, paymentId: null })}
                      className={[
                        "rounded-md border p-3 text-sm transition-colors hover:border-slate-400 hover:bg-slate-50",
                        active ? "border-slate-950 bg-slate-950 text-white shadow-sm" : "border-slate-200 bg-white",
                      ].join(" ")}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium">{segment.label}</span>
                        <span className={active ? "rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-xs font-semibold text-white" : "rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700"}>{segment.count}</span>
                      </div>
                      <p className={active ? "mt-2 line-clamp-2 text-xs leading-5 text-slate-300" : "mt-2 line-clamp-2 text-xs leading-5 text-slate-600"}>{segment.description}</p>
                    </Link>
                  );
                })}
              </div>
            </section>

            <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-1">
                  <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    <Search className="h-4 w-4" />
                    Filter console
                  </p>
                  <h2 className="mt-2 font-semibold">Advanced filters</h2>
                  <p className="text-sm leading-5 text-slate-600">
                  Search provider ids, guest, property, reservation id, status, method, environment, amount, date, and dispute state.
                </p>
              </div>
              </div>
              <form action="/admin/payments" className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-6">
                <input type="hidden" name="segment" value={data.filters.segment} />
                <label className="xl:col-span-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Search</span>
                  <Input
                    name="search"
                    defaultValue={data.filters.search ?? ""}
                    placeholder="PayPal id, guest, property, city, reservation id"
                    className="mt-1"
                  />
                </label>
                <label>
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Payment status</span>
                  <select name="status" defaultValue={data.filters.status ?? ""} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="">Any status</option>
                    {PAYMENT_STATUSES.map((status) => (
                      <option key={status} value={status}>{selectLabel(status)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Provider status</span>
                  <Input name="providerStatus" defaultValue={data.filters.providerStatus ?? ""} placeholder="COMPLETED, CREATED" className="mt-1" />
                </label>
                <label>
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Method</span>
                  <select name="method" defaultValue={data.filters.method ?? ""} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="">Any method</option>
                    {PAYMENT_METHODS.map((method) => (
                      <option key={method} value={method}>{selectLabel(method)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Environment</span>
                  <select name="providerEnvironment" defaultValue={data.filters.providerEnvironment ?? ""} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="">Any env</option>
                    <option value="sandbox">Sandbox</option>
                    <option value="live">Live</option>
                    <option value="internal">Internal</option>
                  </select>
                </label>
                <label>
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Currency</span>
                  <Input name="currency" defaultValue={data.filters.currency ?? ""} placeholder="USD" className="mt-1" maxLength={3} />
                </label>
                <label>
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Min amount</span>
                  <Input name="amountMin" defaultValue={data.filters.amountMin ?? ""} inputMode="decimal" className="mt-1" />
                </label>
                <label>
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Max amount</span>
                  <Input name="amountMax" defaultValue={data.filters.amountMax ?? ""} inputMode="decimal" className="mt-1" />
                </label>
                <label>
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Created from</span>
                  <Input name="createdFrom" type="date" defaultValue={data.filters.createdFrom?.toISOString().slice(0, 10) ?? ""} className="mt-1" />
                </label>
                <label>
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Created to</span>
                  <Input name="createdTo" type="date" defaultValue={data.filters.createdTo?.toISOString().slice(0, 10) ?? ""} className="mt-1" />
                </label>
                <label>
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Dispute</span>
                  <select name="disputeStatus" defaultValue={data.filters.disputeStatus ?? ""} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="">Any dispute</option>
                    <option value="open_active">Open active</option>
                    <option value="open">Open</option>
                    <option value="under_review">Under review</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                </label>
                <div className="flex flex-wrap items-end gap-3 xl:col-span-3">
                  <label className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-medium">
                    <input type="checkbox" name="requiresReviewOnly" defaultChecked={data.filters.requiresReviewOnly} />
                    Requires review only
                  </label>
                  <label className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-medium">
                    <input type="checkbox" name="missingReservationLinkOnly" defaultChecked={data.filters.missingReservationLinkOnly} />
                    Missing reservation link only
                  </label>
                </div>
                <div className="flex items-end gap-2 xl:col-span-3">
                  <Button type="submit">
                    <ListFilter className="mr-2 h-4 w-4" />
                    Apply filters
                  </Button>
                  <Button asChild type="button" variant="outline">
                    <Link href="/admin/payments">Clear</Link>
                  </Button>
                </div>
              </form>
            </section>

            {rows.length ? (
              <>
                <PaymentOperationsClient
                  rows={rows}
                  returnTo={returnTo}
                  selectedPaymentId={selectedId}
                />
                <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm md:flex-row md:items-center md:justify-between">
                  <div className="text-slate-600">
                    Showing <span className="font-medium text-foreground">{data.pagination.from}</span> to <span className="font-medium text-foreground">{data.pagination.to}</span> of <span className="font-medium text-foreground">{data.pagination.totalCount}</span> payments
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" disabled={!data.pagination.hasPrevious}>
                      <Link href={data.pagination.hasPrevious ? createPaymentsHref(data.filters, { page: data.pagination.page - 1, paymentId: null }) : createPaymentsHref(data.filters, {})}>
                        Previous
                      </Link>
                    </Button>
                    <span className="inline-flex min-h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 font-medium">
                      Page {data.pagination.page} of {data.pagination.totalPages}
                    </span>
                    <Button asChild variant="outline" disabled={!data.pagination.hasNext}>
                      <Link href={data.pagination.hasNext ? createPaymentsHref(data.filters, { page: data.pagination.page + 1, paymentId: null }) : createPaymentsHref(data.filters, {})}>
                        Next
                      </Link>
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <EmptyState
                title="No payment records found"
                description="Payments are created from reservations, guest checkout, PayPal order creation, or clearly marked manual settlement records. No fake payment records are seeded."
                why="The current filters returned no PaymentRecord rows."
                createsRecords="Open bookings, configure PayPal env, or create a manual settlement record only when a real off-platform settlement exists."
                checklist={[
                  "PayPal requires PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET before provider actions run.",
                  "Checkout and operations use hosted PayPal flows; raw card numbers and CVV are never collected.",
                  "Reservation price snapshots remain read-only.",
                ]}
                links={[
                  { href: "/admin/bookings", label: "Open bookings" },
                  { href: "/admin/settings", label: "Configure PayPal env" },
                  { href: "/admin/marketplace-operations", label: "Open marketplace operations" },
                ]}
              />
            )}
          </div>
        </section>

        {!data.provider.isConfigured ? (
          <section className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <div className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">PayPal setup checklist</p>
                <p className="mt-1">{providerBlocker}</p>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  <li className="rounded-md border border-amber-200 bg-background/70 p-2">Set PAYPAL_ENV to sandbox or live.</li>
                  <li className="rounded-md border border-amber-200 bg-background/70 p-2">Set PAYPAL_CLIENT_ID for server API calls.</li>
                  <li className="rounded-md border border-amber-200 bg-background/70 p-2">Set PAYPAL_CLIENT_SECRET server-side only.</li>
                  <li className="rounded-md border border-amber-200 bg-background/70 p-2">Set NEXT_PUBLIC_PAYPAL_CLIENT_ID only if guest checkout needs the JS SDK.</li>
                  <li className="rounded-md border border-amber-200 bg-background/70 p-2">Set PAYPAL_WEBHOOK_ID when webhook verification is enabled.</li>
                  <li className="rounded-md border border-amber-200 bg-background/70 p-2">Use PayPal-hosted checkout/card fields only. No raw card form is allowed.</li>
                </ul>
              </div>
            </div>
          </section>
        ) : null}
      </div>

      {selectedDetail ? (
        <PaymentDetailDrawer
          detail={selectedDetail}
          closeHref={closeHref}
          returnTo={returnTo}
          notice={notice}
          error={error}
        />
      ) : null}
    </ModuleShell>
  );
}
