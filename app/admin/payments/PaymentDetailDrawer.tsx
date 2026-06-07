import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  Banknote,
  BadgeCheck,
  Building2,
  CalendarCheck,
  CircleDollarSign,
  Clock,
  CreditCard,
  ExternalLink,
  FileText,
  Link2,
  LockKeyhole,
  ReceiptText,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  UserRound,
  Wallet,
  X,
} from "lucide-react";

import { ActionPanel } from "@/app/components/admin/ActionPanel";
import { EmptyState } from "@/app/components/admin/EmptyState";
import { LinkedRecordCard } from "@/app/components/admin/LinkedRecordCard";
import { ReadinessMeter } from "@/app/components/admin/ReadinessMeter";
import { RiskBadge } from "@/app/components/admin/RiskBadge";
import { StatusBadge } from "@/app/components/admin/StatusBadge";
import { Timeline } from "@/app/components/admin/Timeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrencyAmount, formatDate, formatDateTime } from "@/app/lib/marketplaceStatus";
import { getPaymentActionDisabledReason } from "@/app/lib/paymentIntelligence";
import { getPaymentOperationsDetail } from "@/app/lib/paymentOperations";
import {
  authorizePayPalOrderAction,
  cancelPaymentAction,
  capturePayPalOrderAction,
  createPayPalOrderForPaymentAction,
  markPaymentRequiresReviewAction,
  openDisputeForPaymentAction,
  recordManualSettlementAction,
  resyncPayPalOrderAction,
} from "./actions";

type PaymentDetail = NonNullable<Awaited<ReturnType<typeof getPaymentOperationsDetail>>>;

type PaymentDetailDrawerProps = {
  detail: PaymentDetail;
  closeHref: string;
  returnTo: string;
  notice?: string | null;
  error?: string | null;
};

const tabs = [
  ["overview", "Overview"],
  ["paypal-order", "PayPal Order"],
  ["reservation", "Reservation"],
  ["guest", "Guest"],
  ["property-partner", "Property / Partner"],
  ["events", "Events"],
  ["disputes", "Disputes"],
  ["timeline", "Timeline"],
  ["actions", "Actions"],
] as const;

function personName(user?: { firstName?: string | null; lastName?: string | null; email?: string | null } | null) {
  if (!user) return "Not linked";
  return `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email || "Not linked";
}

function propertyTitle(property?: { approvedTitle?: string | null; title?: string | null } | null) {
  return property?.approvedTitle ?? property?.title ?? "Property not linked";
}

function snapshotValue(snapshotJson: unknown, key: string) {
  if (!snapshotJson || typeof snapshotJson !== "object" || Array.isArray(snapshotJson)) return null;
  const value = (snapshotJson as Record<string, unknown>)[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

function getApprovalUrl(snapshotJson: unknown) {
  return snapshotValue(snapshotJson, "approvalUrl");
}

function DetailMetric({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        {icon}
        {label}
      </p>
      <div className="mt-2 break-words text-sm font-semibold text-slate-950">{value}</div>
      {detail ? <div className="mt-1 break-words text-xs leading-5 text-slate-500">{detail}</div> : null}
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-600">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function PaymentActionForm({
  action,
  paymentId,
  returnTo,
  label,
  disabledReason,
  destructive,
  Icon,
}: {
  action: (formData: FormData) => Promise<void>;
  paymentId: string;
  returnTo: string;
  label: string;
  disabledReason?: string | null;
  destructive?: boolean;
  Icon?: ComponentType<{ className?: string }>;
}) {
  return (
    <form action={action} className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
      <input type="hidden" name="paymentId" value={paymentId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <Button
        type="submit"
        variant={destructive ? "destructive" : "outline"}
        className="w-full"
        disabled={Boolean(disabledReason)}
      >
        {Icon ? <Icon className="mr-2 h-4 w-4" /> : null}
        {label}
      </Button>
      {disabledReason ? <p className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs leading-5 text-slate-600">{disabledReason}</p> : null}
    </form>
  );
}

function ActionGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <h4 className="text-sm font-semibold text-slate-950">{title}</h4>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}

export function PaymentDetailDrawer({
  detail,
  closeHref,
  returnTo,
  notice,
  error,
}: PaymentDetailDrawerProps) {
  const { payment, insight, reservation, guest, property, partner, provider } = detail;
  const approvalUrl = getApprovalUrl(payment.snapshotJson);
  const guestName = personName(guest);
  const partnerName = personName(partner);
  const title = payment.providerOrderId ?? detail.reference;
  const primaryAction = insight.nextBestActions[0];
  const paymentVerification = detail.verifications.find((record) => record.entityType === "payment");
  const guestVerification = detail.verifications.find((record) => record.entityType === "guest");
  const propertyVerification = detail.verifications.find((record) => record.entityType === "property");
  const providerWarning = !provider.isConfigured
    ? "PayPal setup is incomplete. PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are required before provider operations run."
    : null;
  const paymentActionInput = {
    status: payment.status,
    provider: payment.provider,
    providerOrderId: payment.providerOrderId,
    providerAuthorizationId: payment.providerAuthorizationId,
    providerCaptureId: payment.providerCaptureId,
    reservationId: payment.reservationId,
    amount: detail.amount,
  };
  const createOrderDisabledReason = getPaymentActionDisabledReason({
    action: "create_paypal_order",
    payment: paymentActionInput,
    provider,
  });
  const captureDisabledReason = getPaymentActionDisabledReason({
    action: "capture_paypal_order",
    payment: paymentActionInput,
    provider,
  });
  const authorizeDisabledReason = getPaymentActionDisabledReason({
    action: "authorize_paypal_order",
    payment: paymentActionInput,
    provider,
  });
  const syncDisabledReason = getPaymentActionDisabledReason({
    action: "sync_paypal_order",
    payment: paymentActionInput,
    provider,
  });
  const reviewDisabledReason = getPaymentActionDisabledReason({
    action: "mark_requires_review",
    payment: paymentActionInput,
    provider,
  });
  const cancelDisabledReason = getPaymentActionDisabledReason({
    action: "cancel_payment",
    payment: paymentActionInput,
    provider,
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-sm">
      <div className="absolute inset-y-0 right-0 flex w-full max-w-[min(96vw,1840px)] flex-col border-l border-slate-300 bg-slate-50 shadow-2xl">
        <header className="border-b border-slate-200 bg-white">
          <div className="bg-slate-950 p-4 text-white">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={closeHref} className="inline-flex min-h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/10 hover:bg-white/15">
                    <X className="h-4 w-4" />
                    <span className="sr-only">Close payment detail</span>
                  </Link>
                  <StatusBadge status={payment.status} className="border-white/10 bg-white/10 text-white" />
                  <StatusBadge status={payment.providerStatus ?? "unknown"} label={payment.providerStatus ?? "Provider unknown"} className="border-white/10 bg-white/10 text-white" />
                  <RiskBadge severity={insight.attentionLevel} label={insight.attentionLevel === "none" ? "No active payment risk" : `${insight.attentionLevel} attention`} />
                  <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-white">{detail.reference}</span>
                </div>
                <h2 className="mt-4 truncate text-2xl font-semibold tracking-tight">{title}</h2>
                <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-300">
                  <span className="inline-flex items-center gap-1.5"><CircleDollarSign className="h-4 w-4" />{detail.amountLabel}</span>
                  <span className="text-slate-600">/</span>
                  <span className="inline-flex items-center gap-1.5"><Wallet className="h-4 w-4" />{payment.provider}</span>
                  <span className="text-slate-600">/</span>
                  <span className="inline-flex items-center gap-1.5"><Activity className="h-4 w-4" />{payment.providerEnvironment}</span>
                  <span className="text-slate-600">/</span>
                  <span className="inline-flex items-center gap-1.5"><UserRound className="h-4 w-4" />{guestName}</span>
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:min-w-[600px]">
                <DetailMetric icon={<CircleDollarSign className="h-4 w-4" />} label="Amount / currency" value={detail.amountLabel} detail={payment.currency} />
                <DetailMetric icon={<Link2 className="h-4 w-4" />} label="Linked reservation" value={reservation ? `RSV-${reservation.id.slice(0, 8).toUpperCase()}` : "Missing"} detail={reservation?.bookingStatus ?? "No reservation link"} />
                <DetailMetric icon={<UserRound className="h-4 w-4" />} label="Guest" value={guestName} detail={guest?.email ?? "No guest email"} />
                <DetailMetric icon={<FileText className="h-4 w-4" />} label="Primary next action" value={primaryAction?.label ?? "Monitor"} detail={primaryAction?.reason} />
              </div>
            </div>
          </div>
          <nav className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-white px-4 py-3">
            {tabs.map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                className="whitespace-nowrap rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-slate-400 hover:bg-white"
              >
                {label}
              </a>
            ))}
          </nav>
          {notice ? <div className="mx-4 mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</div> : null}
          {error ? <div className="mx-4 mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</div> : null}
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-4">
              <Section id="overview" title="Overview">
                <div className="grid gap-4 lg:grid-cols-3">
                  <ReadinessMeter label="Payment readiness" score={insight.readinessScore} detail={`${insight.attentionReasons.length} computed attention reason${insight.attentionReasons.length === 1 ? "" : "s"}.`} />
                  <DetailMetric icon={<Activity className="h-4 w-4" />} label="Lifecycle stage" value={insight.lifecycleStage.replaceAll("_", " ")} />
                  <DetailMetric icon={<ReceiptText className="h-4 w-4" />} label="Source" value={detail.source.replaceAll("_", " ")} detail={detail.source === "guest_checkout" ? "Created through guest checkout." : "Operational source from payment snapshot."} />
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-4">
                  <DetailMetric icon={<CircleDollarSign className="h-4 w-4" />} label="Amount" value={detail.amountLabel} />
                  <DetailMetric icon={<CreditCard className="h-4 w-4" />} label="Method" value={payment.method.replaceAll("_", " ")} />
                  <DetailMetric icon={<Wallet className="h-4 w-4" />} label="Provider" value={payment.provider} />
                  <DetailMetric icon={<Activity className="h-4 w-4" />} label="Environment" value={payment.providerEnvironment} />
                  <DetailMetric label="Provider status" value={payment.providerStatus ?? "Unknown"} />
                  <DetailMetric label="Authorization id" value={payment.providerAuthorizationId ?? "Not recorded"} />
                  <DetailMetric label="Capture id" value={payment.providerCaptureId ?? "Not recorded"} />
                  <DetailMetric icon={<Clock className="h-4 w-4" />} label="Last activity" value={formatDateTime(detail.lastActivityAt)} />
                </div>
                <div className="mt-4 grid gap-3">
                  {insight.attentionReasons.length ? (
                    insight.attentionReasons.map((reason) => (
                      <div key={reason} className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-950">
                        <div className="flex gap-2">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                          <span>{reason}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-md border border-dashed border-emerald-300 bg-emerald-50 p-4 text-sm leading-5 text-emerald-950">
                      <div className="flex gap-2">
                        <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>No active payment blockers are derived from provider, reservation, dispute, event, or audit data.</span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-4">
                  <LinkedRecordCard type="Reservation" title={reservation ? reservation.id : "No reservation"} subtitle={reservation ? `${formatDate(reservation.startDate)} - ${formatDate(reservation.endDate)}` : "Payment is not linked"} status={reservation?.bookingStatus ?? "missing"} href={reservation ? `/admin/bookings?bookingId=${reservation.id}` : undefined} Icon={CalendarCheck} />
                  <LinkedRecordCard type="Guest" title={guestName} subtitle={guest?.email} status={guest?.role} href={guest ? `/admin/guests?guestId=${guest.id}` : undefined} Icon={UserRound} />
                  <LinkedRecordCard type="Property" title={propertyTitle(property)} subtitle={property?.city} status={property?.listingStatus} href={property ? `/admin/property-trust?homeId=${property.id}` : undefined} Icon={Building2} />
                  <LinkedRecordCard type="Disputes" title={`${detail.disputes.length} linked case${detail.disputes.length === 1 ? "" : "s"}`} subtitle={detail.disputes[0]?.title ?? "No active payment case"} status={detail.disputes[0]?.status ?? "none"} href="#disputes" Icon={ShieldAlert} />
                </div>
              </Section>

              <Section id="paypal-order" title="PayPal Order">
                {providerWarning ? (
                  <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-950">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{providerWarning}</span>
                    </div>
                  </div>
                ) : null}
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <DetailMetric icon={<Wallet className="h-4 w-4" />} label="Provider order id" value={payment.providerOrderId ?? "Not created"} />
                  <DetailMetric icon={<ShieldCheck className="h-4 w-4" />} label="Authorization id" value={payment.providerAuthorizationId ?? "Not recorded"} />
                  <DetailMetric icon={<CreditCard className="h-4 w-4" />} label="Capture id" value={payment.providerCaptureId ?? "Not recorded"} />
                  <DetailMetric icon={<Activity className="h-4 w-4" />} label="Provider status" value={payment.providerStatus ?? "Unknown"} />
                  <DetailMetric label="Environment" value={payment.providerEnvironment} />
                  <DetailMetric icon={<Clock className="h-4 w-4" />} label="Last synced" value={formatDateTime(payment.events.find((event) => event.type.startsWith("paypal_"))?.createdAt, "Not synced")} />
                  <DetailMetric icon={<ShieldCheck className="h-4 w-4" />} label="Orders API" value={provider.ordersApiReady ? "Ready" : "Disabled"} />
                  <DetailMetric icon={<LockKeyhole className="h-4 w-4" />} label="Card fields" value={provider.cardFieldsStatus.replaceAll("_", " ")} />
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-3">
                  <PaymentActionForm action={createPayPalOrderForPaymentAction} paymentId={payment.id} returnTo={returnTo} label="Create PayPal order" disabledReason={createOrderDisabledReason} Icon={CreditCard} />
                  <PaymentActionForm action={capturePayPalOrderAction} paymentId={payment.id} returnTo={returnTo} label="Capture PayPal order" disabledReason={captureDisabledReason} Icon={CreditCard} />
                  <PaymentActionForm action={authorizePayPalOrderAction} paymentId={payment.id} returnTo={returnTo} label="Authorize PayPal order" disabledReason={authorizeDisabledReason} Icon={ShieldCheck} />
                  <PaymentActionForm action={resyncPayPalOrderAction} paymentId={payment.id} returnTo={returnTo} label="Sync provider status" disabledReason={syncDisabledReason} Icon={RefreshCw} />
                  {approvalUrl ? (
                    <Link
                      href={approvalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium hover:border-foreground/30"
                    >
                      Open PayPal approval
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  ) : (
                    <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-3 text-sm leading-5 text-slate-600">No PayPal approval URL is stored for this record.</div>
                  )}
                </div>
                <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm leading-5 text-emerald-950">
                  <div className="flex items-start gap-2">
                    <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>Only configured/missing readiness is shown here. Client secrets, access tokens, and raw card payloads are never displayed.</span>
                  </div>
                </div>
              </Section>

              <Section id="reservation" title="Reservation">
                {reservation ? (
                  <div className="space-y-4">
                    <LinkedRecordCard
                      type="Linked reservation"
                      title={reservation.listingTitleSnapshot ?? propertyTitle(reservation.Home)}
                      subtitle={`${formatDate(reservation.startDate)} - ${formatDate(reservation.endDate)}`}
                      status={reservation.bookingStatus}
                      href={`/admin/bookings?bookingId=${reservation.id}`}
                      Icon={CalendarCheck}
                      meta={`Reservation ${reservation.id}`}
                    />
                    <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm leading-5 text-blue-950">
                      <div className="flex items-start gap-2">
                        <ReceiptText className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>Reservation price snapshot values are read-only. Payment operations do not mutate nightly price, fees, deposits, totals, currency, or lock timestamps.</span>
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <DetailMetric label="Nightly price" value={reservation.nightlyPriceSnapshot === null ? "Not captured" : formatCurrencyAmount(reservation.nightlyPriceSnapshot, reservation.currencySnapshot)} />
                      <DetailMetric label="Nights" value={reservation.totalNightsSnapshot ?? "Not captured"} />
                      <DetailMetric label="Cleaning fee" value={reservation.cleaningFeeSnapshot === null ? "Not captured" : formatCurrencyAmount(reservation.cleaningFeeSnapshot, reservation.currencySnapshot)} />
                      <DetailMetric label="Deposit" value={reservation.securityDepositSnapshot === null ? "Not captured" : formatCurrencyAmount(reservation.securityDepositSnapshot, reservation.currencySnapshot)} />
                      <DetailMetric label="Subtotal" value={reservation.subtotalSnapshot === null ? "Not captured" : formatCurrencyAmount(reservation.subtotalSnapshot, reservation.currencySnapshot)} />
                      <DetailMetric label="Total" value={reservation.totalSnapshot === null ? "Not captured" : formatCurrencyAmount(reservation.totalSnapshot, reservation.currencySnapshot)} />
                      <DetailMetric label="Currency" value={reservation.currencySnapshot} />
                      <DetailMetric label="Booking status" value={reservation.bookingStatus} />
                    </div>
                  </div>
                ) : (
                  <EmptyState
                    title="No reservation linked"
                    description="This payment record is missing a reservation link or represents an internal manual settlement."
                    why="PaymentRecord.reservationId is empty or the reservation could not be resolved."
                    createsRecords="Create PayPal checkout payments from real reservations, or record manual settlements clearly as internal operational records."
                    links={[{ href: "/admin/bookings", label: "Open bookings" }]}
                  />
                )}
              </Section>

              <Section id="guest" title="Guest">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <DetailMetric label="Name" value={guestName} />
                  <DetailMetric label="Email" value={guest?.email ?? "Not linked"} />
                  <DetailMetric label="Account role" value={guest?.role ?? "Not linked"} />
                  <DetailMetric label="Reservation count" value={guest?._count?.Reservation ?? 0} />
                  <DetailMetric label="Premium profile" value={detail.premiumProfile?.status ?? "No profile"} detail={detail.premiumProfile ? `Risk: ${detail.premiumProfile.riskLevel}` : null} />
                  <DetailMetric label="Dispute exposure" value={`${detail.disputes.filter((item) => item.guestId === guest?.id || item.paymentRecordId === payment.id).length} linked`} />
                  <DetailMetric label="Verification status" value={guestVerification?.status ?? "No linked guest verification"} />
                  <DetailMetric label="Favorites / reviews" value={`${guest?._count?.Favorite ?? 0} favorites / ${guest?._count?.Review ?? 0} reviews`} />
                </div>
              </Section>

              <Section id="property-partner" title="Property / Partner">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <DetailMetric label="Property title" value={propertyTitle(property)} />
                  <DetailMetric label="City" value={property?.city ?? reservation?.listingCitySnapshot ?? "Not set"} />
                  <DetailMetric label="Listing status" value={property?.listingStatus ?? "Not linked"} />
                  <DetailMetric label="Content review" value={property?.contentReviewStatus ?? "No review state"} />
                  <DetailMetric label="Pricing readiness" value={property?.price ? `${property.price} nightly base` : "No live property price"} />
                  <DetailMetric label="Media readiness" value={`${property?._count?.images ?? 0} images`} />
                  <DetailMetric label="Property trust" value={propertyVerification?.status ?? "No linked property verification"} />
                  <DetailMetric label="Partner / host" value={partnerName} detail={partner?.email ?? "No partner email"} />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {property ? (
                    <Link className="inline-flex min-h-10 items-center rounded-md border px-3 text-sm font-medium hover:border-foreground/30" href={`/admin/property-trust?homeId=${property.id}`}>
                      Open property trust
                    </Link>
                  ) : null}
                  {partner ? (
                    <Link className="inline-flex min-h-10 items-center rounded-md border px-3 text-sm font-medium hover:border-foreground/30" href={`/admin/partner-operations?partnerId=${partner.id}`}>
                      Open partner operations
                    </Link>
                  ) : null}
                </div>
              </Section>

              <Section id="events" title="Events">
                <Timeline
                  items={payment.events.map((event) => ({
                    id: event.id,
                    type: event.type,
                    summary: event.summary,
                    createdAt: event.createdAt,
                    actor: event.createdById,
                    payloadPreview: event.payload ? JSON.stringify(event.payload, null, 2) : null,
                  }))}
                />
              </Section>

              <Section id="disputes" title="Disputes">
                <div className="grid gap-3">
                  {detail.disputes.length ? (
                    detail.disputes.map((caseItem) => (
                      <LinkedRecordCard
                        key={caseItem.id}
                        type="Dispute case"
                        title={`${caseItem.caseNumber}: ${caseItem.title}`}
                        subtitle={`Priority: ${caseItem.priority} - ${caseItem.summary}`}
                        status={caseItem.status}
                        href={`/admin/disputes?disputeId=${caseItem.id}`}
                        Icon={ShieldAlert}
                        meta={caseItem.paymentRecordId ? `Payment: ${caseItem.paymentRecordId}` : undefined}
                      />
                    ))
                  ) : (
                    <EmptyState
                      title="No linked disputes"
                      description="No DisputeCase row is linked to this payment, reservation, guest, property, or partner context."
                      why="No real dispute case exists for the linked payment context."
                      createsRecords="Create a dispute only for a real payment or marketplace incident."
                    />
                  )}
                </div>
              </Section>

              <Section id="timeline" title="Timeline">
                <Timeline items={detail.timeline} />
              </Section>

              <Section id="actions" title="Actions">
                <div className="grid gap-4 xl:grid-cols-2">
                  <ActionPanel
                    title="PayPal operations"
                    description="All PayPal calls run server-side. Actions are disabled with exact reasons when provider state or payment state is not safe."
                  >
                    <ActionGroup title="Order / capture / authorization">
                      <PaymentActionForm action={createPayPalOrderForPaymentAction} paymentId={payment.id} returnTo={returnTo} label="Create PayPal order from reservation snapshot" disabledReason={createOrderDisabledReason} Icon={CreditCard} />
                      <PaymentActionForm action={capturePayPalOrderAction} paymentId={payment.id} returnTo={returnTo} label="Capture PayPal order" disabledReason={captureDisabledReason} Icon={CreditCard} />
                      <PaymentActionForm action={authorizePayPalOrderAction} paymentId={payment.id} returnTo={returnTo} label="Authorize PayPal order" disabledReason={authorizeDisabledReason} Icon={ShieldCheck} />
                      <PaymentActionForm action={resyncPayPalOrderAction} paymentId={payment.id} returnTo={returnTo} label="Sync PayPal provider status" disabledReason={syncDisabledReason} Icon={RefreshCw} />
                    </ActionGroup>
                  </ActionPanel>

                  <ActionPanel
                    title="Settlement operations"
                    description="Manual settlement records are internal records only and never pretend PayPal captured funds."
                  >
                    <ActionGroup title="Manual settlement">
                      <form action={recordManualSettlementAction} className="space-y-3 rounded-md border border-amber-200 bg-amber-50 p-3">
                        <input type="hidden" name="returnTo" value={returnTo} />
                        {reservation ? <input type="hidden" name="reservationId" value={reservation.id} /> : null}
                        <div className="rounded-md border border-amber-200 bg-white/80 p-3 text-xs leading-5 text-amber-950">
                          Internal settlement only. This does not call PayPal and does not capture funds through the provider.
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Input name="amount" defaultValue={detail.amount.toFixed(2)} placeholder="Amount" />
                          <Input name="currency" defaultValue={payment.currency} maxLength={3} />
                        </div>
                        <select name="method" defaultValue="manual" className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                          <option value="manual">Manual</option>
                          <option value="bank_transfer">Bank transfer</option>
                          <option value="cash_to_host">Cash to host</option>
                        </select>
                        <Textarea name="settlementNote" rows={2} placeholder="Operational settlement note. No card data." />
                        <Textarea name="overrideReason" rows={2} placeholder="Required if amount differs from the reservation snapshot." />
                        <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
                          <input type="checkbox" name="offlineConfirmation" value="yes" className="mt-1" />
                          <span>I confirm this records an offline settlement only and does not mean PayPal captured funds.</span>
                        </label>
                        <Button type="submit" variant="outline" className="w-full" disabled={!reservation}>
                          <Banknote className="mr-2 h-4 w-4" />
                          Record internal settlement
                        </Button>
                        {!reservation ? <p className="rounded-md border border-amber-200 bg-white/80 p-2 text-xs leading-5 text-amber-950">Manual settlement from the detail drawer requires a linked reservation. Use the advanced payment terminal exception path for unlinked reconciliation records.</p> : null}
                        <p className="text-xs leading-5 text-amber-950">This creates a manual PaymentRecord/PaymentEvent. It is not a PayPal capture.</p>
                      </form>
                    </ActionGroup>
                  </ActionPanel>

                  <ActionPanel title="Review / risk" description="Review actions write payment events and audit events.">
                    <ActionGroup title="Risk state">
                      <form action={markPaymentRequiresReviewAction} className="space-y-2 rounded-md border p-3">
                        <input type="hidden" name="paymentId" value={payment.id} />
                        <input type="hidden" name="returnTo" value={returnTo} />
                        <Textarea name="reason" rows={2} placeholder="Review reason" />
                        <Button type="submit" variant="outline" className="w-full" disabled={Boolean(reviewDisabledReason)}>
                          Mark requires review
                        </Button>
                        {reviewDisabledReason ? <p className="text-xs text-muted-foreground">{reviewDisabledReason}</p> : null}
                      </form>
                      <PaymentActionForm action={cancelPaymentAction} paymentId={payment.id} returnTo={returnTo} label="Cancel draft/order" destructive disabledReason={cancelDisabledReason} />
                    </ActionGroup>
                  </ActionPanel>

                  <ActionPanel title="Dispute / linked booking" description="Escalations create real dispute records and keep links back to reservation, guest, property, and partner.">
                    <ActionGroup title="Dispute and linked records">
                      <form action={openDisputeForPaymentAction} className="space-y-2 rounded-md border p-3">
                        <input type="hidden" name="paymentId" value={payment.id} />
                        <input type="hidden" name="returnTo" value={returnTo} />
                        <Input name="title" placeholder="Dispute title" />
                        <Textarea name="summary" rows={2} placeholder="Dispute summary" />
                        <Button type="submit" variant="outline" className="w-full">Create linked dispute</Button>
                      </form>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {reservation ? <Link className="inline-flex min-h-10 items-center justify-center rounded-md border px-3 text-sm font-medium hover:border-foreground/30" href={`/admin/bookings?bookingId=${reservation.id}`}>Open linked booking</Link> : null}
                        {guest ? <Link className="inline-flex min-h-10 items-center justify-center rounded-md border px-3 text-sm font-medium hover:border-foreground/30" href={`/admin/guests?guestId=${guest.id}`}>Open linked guest</Link> : null}
                        {property ? <Link className="inline-flex min-h-10 items-center justify-center rounded-md border px-3 text-sm font-medium hover:border-foreground/30" href={`/admin/property-trust?homeId=${property.id}`}>Open linked property</Link> : null}
                      </div>
                    </ActionGroup>
                  </ActionPanel>
                </div>
              </Section>
            </div>

            <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 bg-slate-950 p-4 text-white">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Live brief</p>
                  <h3 className="mt-1 font-semibold">Payment brief</h3>
                </div>
                <div className="p-4">
                <div className="mt-3 space-y-3">
                  <ReadinessMeter label="Readiness" score={insight.readinessScore} detail={`${insight.linkedCounts.events} events, ${insight.linkedCounts.disputes} disputes, ${insight.linkedCounts.auditEvents} audit records.`} />
                  <LinkedRecordCard type="Next action" title={primaryAction?.label ?? "Monitor"} subtitle={primaryAction?.reason} href={primaryAction?.href} Icon={FileText} status={primaryAction?.severity} />
                  <DetailMetric label="Payment status" value={<StatusBadge status={payment.status} />} />
                  <DetailMetric label="Provider status" value={<StatusBadge status={payment.providerStatus ?? "unknown"} label={payment.providerStatus ?? "Unknown"} />} />
                  <DetailMetric label="Verification" value={paymentVerification?.status ?? "No payment verification"} />
                </div>
                </div>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
                <h3 className="flex items-center gap-2 font-semibold text-emerald-950">
                  <LockKeyhole className="h-4 w-4" />
                  Security controls
                </h3>
                <ul className="mt-3 space-y-2 text-sm leading-5 text-emerald-950">
                  <li className="rounded-md border border-emerald-200 bg-white/70 p-2">No card number, CVV, or raw card payload is stored.</li>
                  <li className="rounded-md border border-emerald-200 bg-white/70 p-2">PAYPAL_CLIENT_SECRET remains server-only.</li>
                  <li className="rounded-md border border-emerald-200 bg-white/70 p-2">Reservation price snapshots are read-only.</li>
                  <li className="rounded-md border border-emerald-200 bg-white/70 p-2">Manual settlements are internal operational records only.</li>
                </ul>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
