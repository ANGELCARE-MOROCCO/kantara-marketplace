import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  Building2,
  CalendarCheck,
  ClipboardCheck,
  CreditCard,
  Hammer,
  Home,
  ShieldAlert,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";

import { ActionPanel } from "@/app/components/admin/ActionPanel";
import { LinkedRecordCard } from "@/app/components/admin/LinkedRecordCard";
import { ReadinessMeter } from "@/app/components/admin/ReadinessMeter";
import { RiskBadge } from "@/app/components/admin/RiskBadge";
import { StatusBadge } from "@/app/components/admin/StatusBadge";
import { Timeline } from "@/app/components/admin/Timeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrencyAmount, formatDate, formatDateTime } from "@/app/lib/marketplaceStatus";
import type { HandoverOperationsDetail } from "@/app/lib/handoverOperations";
import { HANDOVER_PRIORITIES, HANDOVER_STATUSES } from "@/app/lib/handoverOperations";
import {
  getHandoverStatusTransitionDisabledReason,
  normalizeHandoverChecklist,
} from "@/app/lib/handoverIntelligence";
import {
  createDisputeFromHandoverAction,
  reportHandoverIssueAction,
  scheduleHandoverTaskAction,
  updateHandoverChecklistAction,
  updateHandoverStatusAction,
} from "./actions";

type HandoverDetailDrawerProps = {
  detail: HandoverOperationsDetail;
  closeHref: string;
  returnTo: string;
  notice?: string | null;
  error?: string | null;
};

const tabs = [
  ["overview", "Overview"],
  ["reservation", "Reservation"],
  ["guest", "Guest"],
  ["property-partner", "Property / Partner"],
  ["checklist", "Checklist"],
  ["cleaning-maintenance", "Cleaning / Maintenance"],
  ["payment-readiness", "Payment Readiness"],
  ["issues-disputes", "Issues / Disputes"],
  ["timeline", "Timeline"],
  ["actions", "Actions"],
] as const;

function personName(user?: { firstName?: string | null; lastName?: string | null; email?: string | null } | null) {
  if (!user) return "Not linked";
  return `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email || "Not linked";
}

function money(amount?: number | string | { toString(): string } | null, currency = "USD") {
  if (amount === null || amount === undefined) return "Not set";
  return formatCurrencyAmount(Number(amount.toString()), currency);
}

function DetailMetric({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 break-words text-sm font-semibold">{value}</div>
      {detail ? <div className="mt-1 text-xs text-muted-foreground">{detail}</div> : null}
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28 rounded-md border bg-background p-4 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function actionLabel(status: string) {
  if (status === "pending_preparation") return "Mark pending preparation";
  if (status === "ready") return "Mark ready";
  if (status === "in_progress") return "Start task";
  if (status === "completed") return "Complete task";
  if (status === "cancelled") return "Cancel task";
  return status.replaceAll("_", " ");
}

function statusDisabledReason(detail: HandoverOperationsDetail, nextStatus: string) {
  const basicReason = getHandoverStatusTransitionDisabledReason(detail.task.status, nextStatus);
  if (basicReason) return basicReason;
  if (nextStatus === "ready") {
    if (detail.insight.paymentNotReady) return "Payment readiness is blocked.";
    if (detail.insight.disputeOpen) return "Open dispute must be reviewed before marking ready.";
    if (detail.insight.propertyNotReady) return "Property readiness is incomplete.";
    if (detail.insight.checklistIncomplete) return "Checklist must be completed before marking ready.";
  }
  if (nextStatus === "completed" && !detail.insight.readyForCompletion) {
    return "Resolve blockers and complete the checklist before completion.";
  }
  return null;
}

function paymentReadinessStatus(detail: HandoverOperationsDetail) {
  if (!detail.reservation?.totalSnapshot) return "not_required";
  if (detail.payments.some((payment) => ["captured", "authorized"].includes(payment.status))) return "ready";
  if (detail.payments.some((payment) => ["failed", "requires_review"].includes(payment.status))) return "requires_review";
  return "not_ready";
}

function propertyTitle(detail: HandoverOperationsDetail) {
  return detail.property?.approvedTitle ?? detail.property?.title ?? detail.reservation?.listingTitleSnapshot ?? "Property not linked";
}

function reservationNights(detail: HandoverOperationsDetail) {
  if (detail.reservation?.totalNightsSnapshot) return detail.reservation.totalNightsSnapshot;
  if (!detail.reservation) return null;
  const nights = Math.ceil((detail.reservation.endDate.getTime() - detail.reservation.startDate.getTime()) / (24 * 60 * 60 * 1000));
  return nights > 0 ? nights : 0;
}

export function HandoverDetailDrawer({
  detail,
  closeHref,
  returnTo,
  notice,
  error,
}: HandoverDetailDrawerProps) {
  const checklistItems = normalizeHandoverChecklist(detail.task.checklist, detail.task.type);
  const primaryAction = detail.insight.nextBestActions[0];
  const guestName = personName(detail.guest);
  const partnerName = personName(detail.partner);
  const paymentStatus = paymentReadinessStatus(detail);
  const guestVerifications = detail.verifications.filter((record) => record.entityType === "guest");
  const propertyVerifications = detail.verifications.filter((record) => record.entityType === "property");
  const partnerVerifications = detail.verifications.filter((record) => record.entityType === "partner");
  const activeDisputes = detail.disputes.filter((dispute) => !["resolved", "closed"].includes(dispute.status));

  return (
    <div className="fixed inset-0 z-50 bg-black/20">
      <div className="absolute inset-y-0 right-0 flex w-full max-w-[min(96vw,1840px)] flex-col border-l bg-background shadow-2xl">
        <header className="border-b bg-background p-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={closeHref} className="inline-flex min-h-9 w-9 items-center justify-center rounded-md border hover:border-foreground/30">
                  <X className="h-4 w-4" />
                  <span className="sr-only">Close handover detail</span>
                </Link>
                <StatusBadge status={detail.task.status} label={detail.statusLabel} />
                <StatusBadge status={detail.task.priority} />
                <RiskBadge severity={detail.insight.attentionLevel} label={detail.insight.attentionLevel === "none" ? "No active risk" : `${detail.insight.attentionLevel} attention`} />
                {detail.insight.issueReported ? <RiskBadge severity="high" label="Issue reported" /> : null}
              </div>
              <h2 className="mt-3 truncate text-2xl font-semibold">{detail.task.taskNumber}</h2>
              <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
                {detail.typeLabel} - {detail.task.title} - {formatDateTime(detail.task.scheduledFor, "Not scheduled")}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Access coordination handled outside this record. Do not store private access codes here.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:min-w-[620px]">
              <DetailMetric label="Linked reservation" value={detail.reservationReference} detail={detail.reservation?.bookingStatus ?? "Missing reservation link"} />
              <DetailMetric label="Guest" value={guestName} detail={detail.guest?.email ?? "No guest email"} />
              <DetailMetric label="Property" value={propertyTitle(detail)} detail={detail.property?.city ?? detail.reservation?.listingCitySnapshot ?? "City not set"} />
              <DetailMetric label="Primary next action" value={primaryAction?.label ?? "Monitor"} detail={primaryAction?.reason} />
            </div>
          </div>
          <nav className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {tabs.map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                className="whitespace-nowrap rounded-md border px-3 py-2 text-xs font-medium hover:border-foreground/30"
              >
                {label}
              </a>
            ))}
          </nav>
          {notice ? <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</div> : null}
          {error ? <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</div> : null}
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-4">
              <Section id="overview" title="Overview">
                <div className="grid gap-4 lg:grid-cols-3">
                  <ReadinessMeter
                    label="Handover readiness"
                    score={detail.insight.readinessScore}
                    detail={`${detail.insight.attentionReasons.length} blocker${detail.insight.attentionReasons.length === 1 ? "" : "s"} detected from linked records.`}
                  />
                  <DetailMetric label="Lifecycle stage" value={detail.insight.lifecycleStage.replaceAll("_", " ")} />
                  <DetailMetric label="Scheduled time" value={formatDateTime(detail.task.scheduledFor, "Not scheduled")} />
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-4">
                  <DetailMetric label="Current status" value={<StatusBadge status={detail.task.status} label={detail.statusLabel} />} />
                  <DetailMetric label="Task type" value={detail.typeLabel} />
                  <DetailMetric label="Priority" value={<StatusBadge status={detail.task.priority} />} />
                  <DetailMetric label="Checklist progress" value={detail.insight.checklistProgress.percent === null ? "No checklist" : `${detail.insight.checklistProgress.percent}%`} detail={`${detail.insight.checklistProgress.done}/${detail.insight.checklistProgress.total} complete`} />
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <div className="rounded-md border p-4">
                    <h4 className="text-sm font-semibold">Operational blockers</h4>
                    <div className="mt-3 space-y-2">
                      {detail.insight.attentionReasons.length ? detail.insight.attentionReasons.map((reason) => (
                        <div key={reason} className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                          <span>{reason}</span>
                        </div>
                      )) : (
                        <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                          No operational blockers are derived from linked records.
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="rounded-md border p-4">
                    <h4 className="text-sm font-semibold">Next-best actions</h4>
                    <div className="mt-3 space-y-2">
                      {detail.insight.nextBestActions.map((action) => (
                        <Link
                          key={action.id}
                          href={action.href ?? returnTo}
                          className="block rounded-md border p-3 text-sm transition-colors hover:border-foreground/30"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-medium">{action.label}</span>
                            <RiskBadge severity={action.severity} />
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{action.reason}</p>
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-4">
                  <LinkedRecordCard type="Reservation" title={detail.reservationReference} subtitle={detail.reservation?.bookingStatus ?? "Missing link"} status={detail.reservation?.bookingStatus} href={detail.reservation ? `/admin/bookings?bookingId=${detail.reservation.id}` : undefined} Icon={CalendarCheck} />
                  <LinkedRecordCard type="Guest" title={guestName} subtitle={detail.guest?.email} status={detail.guest?.role} href={detail.guest?.id ? `/admin/guests?guestId=${detail.guest.id}` : undefined} Icon={UserRound} />
                  <LinkedRecordCard type="Property" title={propertyTitle(detail)} subtitle={detail.property?.city ?? detail.reservation?.listingCitySnapshot} status={detail.property?.listingStatus} href={detail.property?.id ? `/admin/property-trust?homeId=${detail.property.id}` : undefined} Icon={Home} />
                  <LinkedRecordCard type="Partner/host" title={partnerName} subtitle={detail.partner?.email} status={detail.partner?.role} href={detail.partner?.id ? `/admin/partner-operations?partnerId=${detail.partner.id}` : undefined} Icon={Building2} />
                </div>
              </Section>

              <Section id="reservation" title="Reservation">
                {detail.reservation ? (
                  <div className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-4">
                      <DetailMetric label="Reference" value={detail.reservationReference} />
                      <DetailMetric label="Booking status" value={<StatusBadge status={detail.reservation.bookingStatus} />} />
                      <DetailMetric label="Check-in" value={formatDate(detail.reservation.startDate)} />
                      <DetailMetric label="Check-out" value={formatDate(detail.reservation.endDate)} />
                      <DetailMetric label="Nights" value={reservationNights(detail) ?? "Not set"} />
                      <DetailMetric label="Guest count" value={detail.reservation.Home?.guestCount ?? "Not set"} />
                      <DetailMetric label="Snapshot locked" value={formatDateTime(detail.reservation.priceLockedAt, "Not locked")} />
                      <DetailMetric label="Version" value={detail.reservation.listingVersionSnapshot ?? "Not set"} />
                    </div>
                    <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
                      Reservation price snapshots are immutable in this workspace. Handover actions do not mutate nightly price, fees, deposits, totals, currency, or lock time.
                    </div>
                    <div className="grid gap-3 md:grid-cols-4">
                      <DetailMetric label="Nightly" value={money(detail.reservation.nightlyPriceSnapshot, detail.reservation.currencySnapshot)} />
                      <DetailMetric label="Cleaning fee" value={money(detail.reservation.cleaningFeeSnapshot, detail.reservation.currencySnapshot)} />
                      <DetailMetric label="Deposit" value={money(detail.reservation.securityDepositSnapshot, detail.reservation.currencySnapshot)} />
                      <DetailMetric label="Total" value={money(detail.reservation.totalSnapshot, detail.reservation.currencySnapshot)} />
                    </div>
                    <Button asChild variant="outline">
                      <Link href={`/admin/bookings?bookingId=${detail.reservation.id}`}>Open linked booking</Link>
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    No reservation is linked to this handover task.
                  </div>
                )}
              </Section>

              <Section id="guest" title="Guest">
                <div className="grid gap-3 md:grid-cols-3">
                  <DetailMetric label="Guest" value={guestName} />
                  <DetailMetric label="Email" value={detail.guest?.email ?? "Not linked"} />
                  <DetailMetric label="Role" value={detail.guest?.role ?? "Not linked"} />
                  <DetailMetric label="Language" value={detail.premiumProfile?.preferredLanguage ?? "Not recorded"} />
                  <DetailMetric label="Currency" value={detail.premiumProfile?.preferredCurrency ?? "Not recorded"} />
                  <DetailMetric label="Premium status" value={detail.premiumProfile?.status ?? "No premium profile"} />
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <LinkedRecordCard type="Verification" title="Guest verification" subtitle={`${guestVerifications.length} linked records`} status={guestVerifications[0]?.status ?? "none"} href={detail.guest?.id ? `/admin/verifications?entityType=guest&q=${detail.guest.id}` : undefined} Icon={Sparkles} />
                  <LinkedRecordCard type="Dispute exposure" title={`${activeDisputes.length} active dispute${activeDisputes.length === 1 ? "" : "s"}`} subtitle="Derived from linked reservation, guest, property, partner, and payment context." status={activeDisputes[0]?.status ?? "none"} href="#issues-disputes" Icon={ShieldAlert} />
                </div>
                <div className="mt-4 rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
                  Contact handling stays in approved communication tools. This drawer records operational state only and does not expose private contact routing.
                </div>
              </Section>

              <Section id="property-partner" title="Property / Partner">
                <div className="grid gap-3 md:grid-cols-4">
                  <DetailMetric label="Property" value={propertyTitle(detail)} />
                  <DetailMetric label="City" value={detail.property?.city ?? detail.reservation?.listingCitySnapshot ?? "Not set"} />
                  <DetailMetric label="Property type" value={detail.property?.propertyType ?? detail.reservation?.listingPropertyTypeSnapshot ?? "Not set"} />
                  <DetailMetric label="Listing status" value={<StatusBadge status={detail.property?.listingStatus} />} />
                  <DetailMetric label="Content readiness" value={<StatusBadge status={detail.property?.contentReviewStatus} />} />
                  <DetailMetric label="Media readiness" value={`${detail.property?._count?.images ?? 0} media assets`} />
                  <DetailMetric label="Pricing readiness" value={detail.property?.price ? money(detail.property.price, detail.reservation?.currencySnapshot ?? "USD") : "Missing price"} />
                  <DetailMetric label="Partner/host" value={partnerName} detail={detail.partner?.email} />
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <LinkedRecordCard type="Partner verification" title={`${partnerVerifications.length} linked records`} status={partnerVerifications[0]?.status ?? "none"} href={detail.partner?.id ? `/admin/verifications?entityType=partner&q=${detail.partner.id}` : undefined} Icon={UserRound} />
                  <LinkedRecordCard type="Property trust" title="Open property trust workspace" subtitle="Listing readiness, media, pricing, and content controls." status={detail.property?.contentReviewStatus} href={detail.property?.id ? `/admin/property-trust?homeId=${detail.property.id}` : undefined} Icon={Home} />
                </div>
              </Section>

              <Section id="checklist" title="Checklist">
                <form action={updateHandoverChecklistAction} className="space-y-4">
                  <input type="hidden" name="handoverId" value={detail.task.id} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <ReadinessMeter
                    label="Task-specific checklist progress"
                    score={detail.insight.checklistProgress.percent}
                    detail={`${detail.insight.checklistProgress.done}/${detail.insight.checklistProgress.total} completed. Checklist items are safe readiness controls only.`}
                  />
                  <div className="grid gap-2">
                    {checklistItems.map((item) => (
                      <label key={item.label} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                        <span>{item.label}</span>
                        <input type="hidden" name="checklistLabel" value={item.label} />
                        <input
                          name="checklistDone"
                          value={item.label}
                          type="checkbox"
                          defaultChecked={item.done}
                          className="h-4 w-4 rounded border-input"
                        />
                      </label>
                    ))}
                  </div>
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                    Do not store door codes, lockbox codes, alarm codes, passwords, or private access instructions in checklist labels or notes.
                  </div>
                  <Button type="submit" disabled={detail.task.status === "cancelled"}>Save checklist</Button>
                </form>
              </Section>

              <Section id="cleaning-maintenance" title="Cleaning / Maintenance">
                <div className="grid gap-3 md:grid-cols-4">
                  <DetailMetric label="Cleaning status" value={detail.task.type === "cleaning" ? <StatusBadge status={detail.task.status} /> : detail.siblingTasks.find((task) => task.type === "cleaning")?.status ?? "No cleaning task linked"} />
                  <DetailMetric label="Maintenance status" value={detail.task.type === "maintenance" ? <StatusBadge status={detail.task.status} /> : detail.siblingTasks.find((task) => task.type === "maintenance")?.status ?? "No maintenance task linked"} />
                  <DetailMetric label="Priority" value={<StatusBadge status={detail.task.priority} />} />
                  <DetailMetric label="Follow-up required" value={detail.insight.maintenanceFollowUpOpen || detail.insight.cleaningNeededAfterCheckout ? "Yes" : "No"} />
                </div>
                <div className="mt-4 rounded-md border p-4">
                  <h4 className="text-sm font-semibold">Issue summary</h4>
                  <p className="mt-2 text-sm text-muted-foreground">{detail.task.summary ?? "No cleaning or maintenance issue summary recorded."}</p>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <LinkedRecordCard type="Cleaning turnover" title={detail.insight.cleaningNeededAfterCheckout ? "Cleaning turnover needed" : "Cleaning state derived"} subtitle="Based on linked checkout date and cleaning tasks." status={detail.insight.cleaningNeededAfterCheckout ? "requires_review" : "clear"} Icon={ClipboardCheck} />
                  <LinkedRecordCard type="Maintenance" title={detail.insight.maintenanceFollowUpOpen ? "Maintenance follow-up open" : "No open maintenance signal"} subtitle="Escalate only when the issue needs case handling." status={detail.insight.maintenanceFollowUpOpen ? detail.task.priority : "clear"} Icon={Hammer} />
                </div>
                <form action={createDisputeFromHandoverAction} className="mt-4 grid gap-3 rounded-md border p-4 md:grid-cols-2">
                  <input type="hidden" name="handoverId" value={detail.task.id} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <Input name="title" placeholder="Dispute title" defaultValue={`Handover issue - ${detail.task.taskNumber}`} />
                  <select name="priority" defaultValue={detail.task.priority} className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
                    {HANDOVER_PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                  </select>
                  <Textarea name="summary" rows={3} placeholder="Safe issue summary. Do not store access codes." className="md:col-span-2" />
                  <Button type="submit" variant="outline" className="md:col-span-2">Create linked dispute if issue escalates</Button>
                </form>
              </Section>

              <Section id="payment-readiness" title="Payment Readiness">
                <div className="grid gap-3 md:grid-cols-3">
                  <DetailMetric label="Readiness state" value={<StatusBadge status={paymentStatus} />} />
                  <DetailMetric label="Payment blocker" value={detail.insight.paymentNotReady ? "Payment not ready" : "No payment blocker"} />
                  <DetailMetric label="Linked records" value={detail.payments.length} />
                </div>
                <div className="mt-4 grid gap-2">
                  {detail.payments.length ? detail.payments.map((payment) => (
                    <LinkedRecordCard
                      key={payment.id}
                      type="Payment"
                      title={`${payment.provider} ${money(payment.amount, payment.currency)}`}
                      subtitle={payment.providerOrderId ?? payment.id}
                      status={payment.status}
                      href={`/admin/payments?paymentId=${payment.id}`}
                      Icon={CreditCard}
                      meta={payment.providerStatus ?? payment.method}
                    />
                  )) : (
                    <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                      No payment record is linked to this handover context.
                    </div>
                  )}
                </div>
                <div className="mt-4 rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
                  Payment readiness is read-only here. Use Payments for provider sync, order creation, capture, or review workflows.
                </div>
                <Button asChild variant="outline" className="mt-4">
                  <Link href={detail.reservation ? `/admin/payments?q=${detail.reservation.id}` : "/admin/payments"}>Open payments</Link>
                </Button>
              </Section>

              <Section id="issues-disputes" title="Issues / Disputes">
                <div className="grid gap-3 md:grid-cols-3">
                  <DetailMetric label="Issue reported" value={detail.insight.issueReported ? "Yes" : "No"} />
                  <DetailMetric label="Open disputes" value={activeDisputes.length} />
                  <DetailMetric label="Risk badge" value={<RiskBadge severity={detail.insight.attentionLevel} />} />
                </div>
                <div className="mt-4 grid gap-2">
                  {detail.disputes.length ? detail.disputes.map((dispute) => (
                    <LinkedRecordCard
                      key={dispute.id}
                      type="Dispute"
                      title={`${dispute.caseNumber}: ${dispute.title}`}
                      subtitle={dispute.summary}
                      status={dispute.status}
                      href={`/admin/disputes?disputeId=${dispute.id}`}
                      Icon={ShieldAlert}
                      meta={`${dispute.priority} priority`}
                    />
                  )) : (
                    <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                      No dispute is linked to this task context.
                    </div>
                  )}
                </div>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <form action={reportHandoverIssueAction} className="grid gap-3 rounded-md border p-4">
                    <input type="hidden" name="handoverId" value={detail.task.id} />
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <h4 className="text-sm font-semibold">Report issue</h4>
                    <select name="priority" defaultValue={detail.task.priority === "low" ? "medium" : detail.task.priority} className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
                      {HANDOVER_PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                    </select>
                    <Textarea name="issueSummary" rows={4} placeholder="Required safe issue summary. Do not store access codes or private instructions." required />
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input type="checkbox" name="createDispute" className="h-4 w-4 rounded border-input" />
                      Create linked dispute from this issue
                    </label>
                    <Button type="submit" variant="destructive">Report issue</Button>
                  </form>
                  <form action={createDisputeFromHandoverAction} className="grid gap-3 rounded-md border p-4">
                    <input type="hidden" name="handoverId" value={detail.task.id} />
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <h4 className="text-sm font-semibold">Create linked dispute</h4>
                    <Input name="title" placeholder="Dispute title" defaultValue={`Handover issue - ${detail.task.taskNumber}`} required />
                    <select name="priority" defaultValue={detail.task.priority} className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
                      {HANDOVER_PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                    </select>
                    <Textarea name="summary" rows={4} placeholder="Required safe dispute summary." required />
                    <Button type="submit" variant="outline">Create dispute</Button>
                  </form>
                </div>
              </Section>

              <Section id="timeline" title="Timeline">
                <Timeline
                  items={detail.timeline.map((item) => ({
                    id: item.id,
                    type: `${item.module}:${item.type}`,
                    summary: item.summary,
                    createdAt: item.createdAt,
                    actor: item.actorId,
                    href: item.href,
                  }))}
                />
              </Section>

              <Section id="actions" title="Actions">
                <ActionPanel
                  title="Validated handover actions"
                  description="Actions create handover events and admin audit events. Security-sensitive access details are rejected."
                  result={notice ?? error}
                >
                  <div className="grid gap-4 lg:grid-cols-2">
                    <ActionGroup title="Scheduling">
                      <form action={scheduleHandoverTaskAction} className="grid gap-3 rounded-md border p-3">
                        <input type="hidden" name="handoverId" value={detail.task.id} />
                        <input type="hidden" name="returnTo" value={returnTo} />
                        <Input name="scheduledFor" type="datetime-local" defaultValue={detail.task.scheduledFor?.toISOString().slice(0, 16)} />
                        <Button type="submit" variant="outline" disabled={detail.task.status === "cancelled"}>Schedule task</Button>
                        {detail.task.status === "cancelled" ? <p className="text-xs text-muted-foreground">Cancelled tasks cannot be scheduled.</p> : null}
                      </form>
                    </ActionGroup>

                    <ActionGroup title="Status lifecycle">
                      {HANDOVER_STATUSES.filter((status) => status !== "issue_reported").map((status) => {
                        const reason = statusDisabledReason(detail, status);
                        return (
                          <form key={status} action={updateHandoverStatusAction} className="grid gap-2 rounded-md border p-3">
                            <input type="hidden" name="handoverId" value={detail.task.id} />
                            <input type="hidden" name="returnTo" value={returnTo} />
                            <input type="hidden" name="status" value={status} />
                            <Textarea name="message" rows={2} placeholder="Optional timeline message" />
                            <Button type="submit" variant={status === "cancelled" ? "destructive" : "outline"} disabled={Boolean(reason)}>
                              {actionLabel(status)}
                            </Button>
                            {reason ? <p className="text-xs text-muted-foreground">{reason}</p> : <p className="text-xs text-muted-foreground">Enabled. Creates timeline and audit events.</p>}
                          </form>
                        );
                      })}
                    </ActionGroup>

                    <ActionGroup title="Issue handling">
                      <form action={reportHandoverIssueAction} className="grid gap-3 rounded-md border p-3">
                        <input type="hidden" name="handoverId" value={detail.task.id} />
                        <input type="hidden" name="returnTo" value={returnTo} />
                        <select name="priority" defaultValue={detail.task.priority === "low" ? "medium" : detail.task.priority} className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
                          {HANDOVER_PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                        </select>
                        <Textarea name="issueSummary" rows={3} placeholder="Required safe issue summary" required />
                        <label className="inline-flex items-center gap-2 text-sm">
                          <input type="checkbox" name="createDispute" className="h-4 w-4 rounded border-input" />
                          Create linked dispute
                        </label>
                        <Button type="submit" variant="destructive">Report issue</Button>
                      </form>
                    </ActionGroup>

                    <ActionGroup title="Linked records">
                      <div className="grid gap-2">
                        <Button asChild variant="outline"><Link href={detail.reservation ? `/admin/bookings?bookingId=${detail.reservation.id}` : "/admin/bookings"}>Open booking</Link></Button>
                        <Button asChild variant="outline"><Link href={detail.reservation ? `/admin/payments?q=${detail.reservation.id}` : "/admin/payments"}>Open payment</Link></Button>
                        <Button asChild variant="outline"><Link href={detail.guest?.id ? `/admin/guests?guestId=${detail.guest.id}` : "/admin/guests"}>Open guest</Link></Button>
                        <Button asChild variant="outline"><Link href={detail.property?.id ? `/admin/property-trust?homeId=${detail.property.id}` : "/admin/property-trust"}>Open property/partner</Link></Button>
                      </div>
                    </ActionGroup>
                  </div>
                </ActionPanel>
              </Section>
            </div>

            <aside className="space-y-4">
              <ReadinessMeter label="Drawer readiness" score={detail.insight.readinessScore} detail="Computed from linked operational state." />
              <div className="rounded-md border bg-background p-4 shadow-sm">
                <h3 className="text-sm font-semibold">Linked counts</h3>
                <div className="mt-3 grid gap-2 text-sm">
                  <CountRow label="Payments" value={detail.payments.length} />
                  <CountRow label="Disputes" value={detail.disputes.length} />
                  <CountRow label="Verifications" value={detail.verifications.length} />
                  <CountRow label="Sibling tasks" value={detail.siblingTasks.length} />
                  <CountRow label="Timeline events" value={detail.timeline.length} />
                </div>
              </div>
              <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                <div className="flex gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>Never store door codes, lockbox codes, alarm codes, passwords, or private access instructions in this workspace.</p>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h4 className="text-sm font-semibold">{title}</h4>
      <div className="mt-3 grid gap-3">{children}</div>
    </div>
  );
}

function CountRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
