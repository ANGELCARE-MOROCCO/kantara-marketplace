import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  Building2,
  CalendarCheck,
  ClipboardCheck,
  CreditCard,
  FileSearch,
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
import type { DisputeOperationsDetail } from "@/app/lib/disputeOperations";
import {
  DISPUTE_OUTCOMES,
  DISPUTE_PRIORITIES,
  DISPUTE_STATUSES,
  EVIDENCE_QUALITY_LEVELS,
} from "@/app/lib/disputeOperations";
import { VERIFICATION_CATEGORIES, VERIFICATION_ENTITY_TYPES } from "@/app/lib/verificationOperations";
import { normalizeHandoverChecklist } from "@/app/lib/handoverIntelligence";
import { isDisputeStatusTransitionAllowed } from "@/app/lib/disputeIntelligence";
import {
  assignDisputeAction,
  closeDisputeCaseAction,
  createDisputeVerificationAction,
  reopenDisputeCaseAction,
  requestDisputeInformationAction,
  resolveDisputeCaseAction,
  updateDisputeEvidenceAction,
  updateDisputePriorityAction,
  updateDisputeStatusAction,
} from "./actions";

type DisputeDetailDrawerProps = {
  detail: DisputeOperationsDetail;
  closeHref: string;
  returnTo: string;
  notice?: string | null;
  error?: string | null;
};

const tabs = [
  ["case-brief", "Case Brief"],
  ["linked-context", "Linked Context"],
  ["guest-partner", "Guest & Partner Context"],
  ["payment-exposure", "Payment & Exposure"],
  ["handover-operations", "Handover & Operations"],
  ["evidence-summary", "Evidence Summary"],
  ["timeline", "Timeline"],
  ["resolution-workspace", "Resolution Workspace"],
  ["actions", "Actions"],
] as const;

function personName(user?: { firstName?: string | null; lastName?: string | null; email?: string | null } | null) {
  if (!user) return "Not linked";
  return `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email || "Not linked";
}

function propertyTitle(property?: { approvedTitle?: string | null; title?: string | null } | null) {
  return property?.approvedTitle ?? property?.title ?? "Property not linked";
}

function money(amount?: number | string | { toString(): string } | null, currency = "USD") {
  if (amount === null || amount === undefined) return "Not computable";
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
  if (status === "under_review") return "Mark under review";
  if (status === "awaiting_guest") return "Request guest info";
  if (status === "awaiting_partner") return "Request partner info";
  if (status === "awaiting_admin") return "Request admin follow-up";
  return status.replaceAll("_", " ");
}

function statusDisabledReason(detail: DisputeOperationsDetail, nextStatus: string) {
  if (["resolved", "closed", "reopened"].includes(nextStatus)) {
    if (nextStatus === "resolved") return "Use the Resolution Workspace so outcome, rationale, and confirmation are captured.";
    if (nextStatus === "closed") return "Use the close action so closure reason and confirmation are captured.";
    return "Use the reopen action so reopen reason is captured.";
  }
  return isDisputeStatusTransitionAllowed(detail.dispute.status, nextStatus);
}

function evidenceValue(value?: string | null) {
  return value?.trim() || "Not recorded";
}

function reservationNights(detail: DisputeOperationsDetail) {
  if (detail.reservation?.totalNightsSnapshot) return detail.reservation.totalNightsSnapshot;
  if (!detail.reservation) return null;
  const nights = Math.ceil((detail.reservation.endDate.getTime() - detail.reservation.startDate.getTime()) / (24 * 60 * 60 * 1000));
  return nights > 0 ? nights : 0;
}

function defaultVerificationEntity(detail: DisputeOperationsDetail) {
  if (detail.insight.paymentRequiresReview && detail.payment) return { entityType: "payment", entityId: detail.payment.id };
  if (detail.insight.handoverIssueOpen && detail.handovers[0]) return { entityType: "handover", entityId: detail.handovers[0].id };
  if (detail.property) return { entityType: "property", entityId: detail.property.id };
  if (detail.guest) return { entityType: "guest", entityId: detail.guest.id };
  if (detail.partner) return { entityType: "partner", entityId: detail.partner.id };
  return { entityType: "guest", entityId: "" };
}

export function DisputeDetailDrawer({
  detail,
  closeHref,
  returnTo,
  notice,
  error,
}: DisputeDetailDrawerProps) {
  const primaryAction = detail.insight.nextBestActions[0];
  const guestName = personName(detail.guest);
  const partnerName = personName(detail.partner);
  const activeRelatedCases = detail.relatedCases.filter((item) => !["resolved", "closed"].includes(item.status));
  const guestVerifications = detail.verifications.filter((record) => record.entityType === "guest");
  const propertyVerifications = detail.verifications.filter((record) => record.entityType === "property");
  const partnerVerifications = detail.verifications.filter((record) => record.entityType === "partner");
  const paymentVerifications = detail.verifications.filter((record) => record.entityType === "payment");
  const handover = detail.handovers[0] ?? null;
  const handoverChecklist = handover ? normalizeHandoverChecklist(handover.checklist, handover.type) : [];
  const handoverChecklistDone = handoverChecklist.filter((item) => item.done).length;
  const defaultVerification = defaultVerificationEntity(detail);

  return (
    <div className="fixed inset-0 z-50 bg-black/20">
      <div className="absolute inset-y-0 right-0 flex w-full max-w-[min(96vw,1880px)] flex-col border-l bg-background shadow-2xl">
        <header className="border-b bg-background p-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={closeHref} className="inline-flex min-h-9 w-9 items-center justify-center rounded-md border hover:border-foreground/30">
                  <X className="h-4 w-4" />
                  <span className="sr-only">Close dispute detail</span>
                </Link>
                <StatusBadge status={detail.dispute.status} label={detail.statusLabel} />
                <StatusBadge status={detail.dispute.priority} />
                <StatusBadge status={detail.dispute.type} label={detail.typeLabel} />
                <RiskBadge severity={detail.insight.attentionLevel} label={detail.insight.attentionLevel === "none" ? "No active escalation" : `${detail.insight.attentionLevel} escalation`} />
                {detail.insight.reopenedCase ? <RiskBadge severity="high" label="Reopened" /> : null}
              </div>
              <h2 className="mt-3 truncate text-2xl font-semibold">{detail.dispute.caseNumber}</h2>
              <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
                {detail.dispute.title} - opened {formatDateTime(detail.dispute.openedAt)} - age {detail.insight.caseAge.label}
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:min-w-[680px]">
              <DetailMetric label="Assignment" value={detail.owner ? personName(detail.owner) : "Unassigned"} detail={detail.owner?.email} />
              <DetailMetric label="Linked source" value={detail.insight.operationalRootArea.replaceAll("_", " ")} detail={detail.reservationReference} />
              <DetailMetric label="Financial exposure" value={detail.insight.financialExposure.label} />
              <DetailMetric label="Primary next action" value={primaryAction?.label ?? "Continue investigation"} detail={primaryAction?.reason} />
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
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_350px]">
            <div className="space-y-4">
              <Section id="case-brief" title="Case Brief">
                <div className="grid gap-4 lg:grid-cols-3">
                  <ReadinessMeter
                    label="Resolution readiness"
                    score={detail.insight.resolutionReadinessScore}
                    detail={`${detail.insight.attentionReasons.length} blocker${detail.insight.attentionReasons.length === 1 ? "" : "s"} detected.`}
                  />
                  <DetailMetric label="Root area" value={detail.insight.operationalRootArea.replaceAll("_", " ")} />
                  <DetailMetric label="Current blocker" value={detail.insight.attentionReasons[0] ?? "No deterministic blocker"} />
                </div>
                <div className="mt-4 rounded-md border p-4 text-sm text-muted-foreground">
                  {detail.dispute.summary}
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-4">
                  <DetailMetric label="Priority rationale" value={detail.dispute.priority} detail={detail.insight.urgentCase ? "Urgent unresolved case requires senior review." : detail.insight.highPriorityCase ? "High-priority operational case." : "Standard priority."} />
                  <DetailMetric label="Current owner" value={detail.owner ? personName(detail.owner) : "Unassigned"} />
                  <DetailMetric label="Guest impact" value={detail.guest ? "Guest context linked" : "No guest linked"} detail={detail.insight.repeatedGuestDisputes ? "Repeated guest dispute exposure." : undefined} />
                  <DetailMetric label="Partner impact" value={detail.partner ? "Partner context linked" : "No partner linked"} detail={detail.insight.repeatedPartnerDisputes ? "Repeated partner dispute exposure." : undefined} />
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <div className="rounded-md border p-4">
                    <h4 className="text-sm font-semibold">Open blockers</h4>
                    <div className="mt-3 space-y-2">
                      {detail.insight.attentionReasons.length ? detail.insight.attentionReasons.map((reason) => (
                        <div key={reason} className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                          <span>{reason}</span>
                        </div>
                      )) : (
                        <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                          No blockers are currently derived from linked records.
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="rounded-md border p-4">
                    <h4 className="text-sm font-semibold">Next-best actions</h4>
                    <div className="mt-3 space-y-2">
                      {detail.insight.nextBestActions.map((action) => (
                        <Link key={action.id} href={action.href ?? returnTo} className="block rounded-md border p-3 text-sm transition-colors hover:border-foreground/30">
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
              </Section>

              <Section id="linked-context" title="Linked Context">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <LinkedRecordCard type="Booking/reservation" title={detail.reservationReference} subtitle={detail.reservation?.listingTitleSnapshot ?? "No reservation linked"} status={detail.reservation?.bookingStatus} href={detail.reservation ? `/admin/bookings?bookingId=${detail.reservation.id}` : undefined} Icon={CalendarCheck} />
                  <LinkedRecordCard type="Payment" title={detail.payment ? money(detail.payment.amount, detail.payment.currency) : "No payment linked"} subtitle={detail.payment?.providerOrderId ?? detail.payment?.id} status={detail.payment?.status} href={detail.payment ? `/admin/payments?paymentId=${detail.payment.id}` : undefined} Icon={CreditCard} />
                  <LinkedRecordCard type="Handover" title={handover ? `${handover.taskNumber}: ${handover.title}` : "No handover linked"} subtitle={handover?.type.replaceAll("_", " ")} status={handover?.status} href={handover ? `/admin/handover?handoverId=${handover.id}` : undefined} Icon={ClipboardCheck} />
                  <LinkedRecordCard type="Guest" title={guestName} subtitle={detail.guest?.email} status={detail.guest?.role} href={detail.guest ? `/admin/guests?guestId=${detail.guest.id}` : undefined} Icon={UserRound} />
                  <LinkedRecordCard type="Property" title={propertyTitle(detail.property)} subtitle={detail.property?.city} status={detail.property?.listingStatus} href={detail.property ? `/admin/property-trust?homeId=${detail.property.id}` : undefined} Icon={Home} />
                  <LinkedRecordCard type="Partner" title={partnerName} subtitle={detail.partner?.email} status={detail.partner?.role} href={detail.partner ? `/admin/partner-operations?partnerId=${detail.partner.id}` : undefined} Icon={Building2} />
                </div>
                <div className="mt-4 grid gap-2">
                  {detail.verifications.length ? detail.verifications.slice(0, 6).map((record) => (
                    <LinkedRecordCard key={record.id} type="Verification" title={record.title} subtitle={`${record.entityType} - ${record.category}`} status={record.status} href={`/admin/verifications?verificationId=${record.id}`} Icon={Sparkles} />
                  )) : (
                    <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No linked verification records.</div>
                  )}
                  {detail.relatedCases.length ? detail.relatedCases.slice(0, 6).map((item) => (
                    <LinkedRecordCard key={item.id} type="Related case" title={`${item.caseNumber}: ${item.title}`} subtitle={item.type.replaceAll("_", " ")} status={item.status} href={`/admin/disputes?disputeId=${item.id}`} Icon={ShieldAlert} />
                  )) : null}
                </div>
              </Section>

              <Section id="guest-partner" title="Guest & Partner Context">
                <div className="grid gap-3 md:grid-cols-4">
                  <DetailMetric label="Guest" value={guestName} detail={detail.guest?.email} />
                  <DetailMetric label="Guest reservations" value={detail.guest?._count?.Reservation ?? detail.reservation?.User?._count.Reservation ?? "Not linked"} />
                  <DetailMetric label="Guest dispute exposure" value={`${detail.relatedCases.filter((item) => item.guestId === detail.guest?.id).length} related cases`} />
                  <DetailMetric label="Premium/verification" value={detail.premiumProfile?.status ?? guestVerifications[0]?.status ?? "Not recorded"} />
                  <DetailMetric label="Property" value={propertyTitle(detail.property)} detail={detail.property?.city} />
                  <DetailMetric label="Partner" value={partnerName} detail={detail.partner?.email} />
                  <DetailMetric label="Partner verification" value={partnerVerifications[0]?.status ?? "Not recorded"} />
                  <DetailMetric label="Property/partner cases" value={`${activeRelatedCases.filter((item) => item.propertyId === detail.property?.id || item.partnerId === detail.partner?.id).length} active related`} />
                </div>
                <div className="mt-4 rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
                  This workspace surfaces dispute context and safe operational links only. It does not edit auth, account security, payment credentials, or private contact routing.
                </div>
              </Section>

              <Section id="payment-exposure" title="Payment & Exposure">
                <div className="grid gap-3 md:grid-cols-4">
                  <DetailMetric label="Payment state" value={<StatusBadge status={detail.payment?.status ?? "none"} />} />
                  <DetailMetric label="Provider state" value={detail.payment?.providerStatus ?? "Not recorded"} />
                  <DetailMetric label="Method" value={detail.payment?.method ?? "Not linked"} />
                  <DetailMetric label="Exposure" value={detail.insight.financialExposure.label} />
                  <DetailMetric label="PayPal order" value={detail.payment?.providerOrderId ?? "Not linked"} />
                  <DetailMetric label="Capture id" value={detail.payment?.providerCaptureId ?? "Not captured"} />
                  <DetailMetric label="Payment review" value={detail.insight.paymentRequiresReview ? "Requires review" : "No payment review blocker"} />
                  <DetailMetric label="Payment verification" value={paymentVerifications[0]?.status ?? "Not recorded"} />
                </div>
                {detail.reservation ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-4">
                    <DetailMetric label="Reservation total" value={money(detail.reservation.totalSnapshot, detail.reservation.currencySnapshot)} />
                    <DetailMetric label="Nights" value={reservationNights(detail) ?? "Not set"} />
                    <DetailMetric label="Check-in" value={formatDate(detail.reservation.startDate)} />
                    <DetailMetric label="Check-out" value={formatDate(detail.reservation.endDate)} />
                  </div>
                ) : null}
                <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
                  Payment and reservation snapshot values are read-only here. Use Payments for provider review, sync, capture, or settlement actions.
                </div>
                <Button asChild variant="outline" className="mt-4">
                  <Link href={detail.payment ? `/admin/payments?paymentId=${detail.payment.id}` : "/admin/payments"}>Open payment workspace</Link>
                </Button>
              </Section>

              <Section id="handover-operations" title="Handover & Operations">
                {handover ? (
                  <div className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-4">
                      <DetailMetric label="Task" value={handover.taskNumber} detail={handover.title} />
                      <DetailMetric label="Type" value={handover.type.replaceAll("_", " ")} />
                      <DetailMetric label="Status" value={<StatusBadge status={handover.status} />} />
                      <DetailMetric label="Priority" value={<StatusBadge status={handover.priority} />} />
                      <DetailMetric label="Checklist" value={`${handoverChecklistDone}/${handoverChecklist.length}`} detail={handoverChecklist.length ? `${Math.round((handoverChecklistDone / handoverChecklist.length) * 100)}% complete` : "No checklist"} />
                      <DetailMetric label="Issue open" value={detail.insight.handoverIssueOpen ? "Yes" : "No"} />
                      <DetailMetric label="Cleaning/maintenance context" value={["cleaning", "maintenance"].includes(handover.type) ? handover.type.replaceAll("_", " ") : "Not direct"} />
                      <DetailMetric label="Events" value={handover.events.length} />
                    </div>
                    <div className="rounded-md border p-4 text-sm text-muted-foreground">
                      {handover.summary ?? "No handover issue summary recorded."}
                    </div>
                    <Button asChild variant="outline">
                      <Link href={`/admin/handover?handoverId=${handover.id}`}>Open handover task</Link>
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    No handover task is linked to this dispute context.
                  </div>
                )}
              </Section>

              <Section id="evidence-summary" title="Evidence Summary">
                <div className="grid gap-3 md:grid-cols-2">
                  <EvidencePanel label="Guest statement summary" value={detail.evidence?.guestStatementSummary} />
                  <EvidencePanel label="Partner statement summary" value={detail.evidence?.partnerStatementSummary} />
                  <EvidencePanel label="Internal observation" value={detail.evidence?.internalObservation} />
                  <EvidencePanel label="Operational evidence summary" value={detail.evidence?.operationalEvidenceSummary} />
                  <EvidencePanel label="Supporting references" value={detail.evidence?.supportingReferences} />
                  <EvidencePanel label="Missing evidence" value={detail.evidence?.missingEvidence} />
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <DetailMetric label="Evidence quality" value={<StatusBadge status={detail.evidence?.evidenceQuality ?? "weak"} />} />
                  <DetailMetric label="Resolution readiness impact" value={detail.evidence ? "Evidence summary present" : "Evidence missing"} />
                  <DetailMetric label="Security rule" value="Summaries only" detail="No raw documents, card data, IDs, or access codes." />
                </div>
                <form action={updateDisputeEvidenceAction} className="mt-4 grid gap-3 rounded-md border p-4 md:grid-cols-2">
                  <input type="hidden" name="disputeId" value={detail.dispute.id} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <Textarea name="guestStatementSummary" rows={3} placeholder="Guest statement summary" defaultValue={detail.evidence?.guestStatementSummary ?? ""} />
                  <Textarea name="partnerStatementSummary" rows={3} placeholder="Partner statement summary" defaultValue={detail.evidence?.partnerStatementSummary ?? ""} />
                  <Textarea name="internalObservation" rows={3} placeholder="Internal observation" defaultValue={detail.evidence?.internalObservation ?? ""} />
                  <Textarea name="operationalEvidenceSummary" rows={3} placeholder="Operational evidence summary" defaultValue={detail.evidence?.operationalEvidenceSummary ?? ""} />
                  <Textarea name="supportingReferences" rows={2} placeholder="Supporting references" defaultValue={detail.evidence?.supportingReferences ?? ""} />
                  <Textarea name="missingEvidence" rows={2} placeholder="Missing evidence" defaultValue={detail.evidence?.missingEvidence ?? ""} />
                  <label>
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Evidence quality</span>
                    <select name="evidenceQuality" defaultValue={detail.evidence?.evidenceQuality ?? "weak"} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      {EVIDENCE_QUALITY_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
                    </select>
                  </label>
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                    Do not store passport numbers, ID numbers, card data, raw documents, access codes, passwords, lockbox codes, or raw PayPal payloads.
                  </div>
                  <Button type="submit" className="md:col-span-2">Update evidence summary</Button>
                </form>
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

              <Section id="resolution-workspace" title="Resolution Workspace">
                <div className="grid gap-4 lg:grid-cols-3">
                  <ReadinessMeter label="Resolution readiness" score={detail.insight.resolutionReadinessScore} detail="Computed from assignment, linked source, evidence, payment, handover, and SLA state." />
                  <DetailMetric label="Ready for resolution" value={detail.insight.readyForResolution ? "Yes" : "Not yet"} />
                  <DetailMetric label="Ready for closure" value={detail.insight.readyForClosure ? "Yes" : "Requires resolution or close reason"} />
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <div className="rounded-md border p-4">
                    <h4 className="text-sm font-semibold">Open blockers</h4>
                    <div className="mt-3 space-y-2">
                      {detail.insight.attentionReasons.length ? detail.insight.attentionReasons.map((reason) => (
                        <div key={reason} className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">{reason}</div>
                      )) : (
                        <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">No blockers detected.</div>
                      )}
                    </div>
                  </div>
                  <div className="rounded-md border p-4">
                    <h4 className="text-sm font-semibold">Recommended outcome</h4>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {detail.insight.paymentRequiresReview
                        ? "payment_review_required"
                        : detail.insight.handoverIssueOpen
                          ? "handover_completed"
                          : detail.insight.operationalRootArea === "property"
                            ? "property_issue_confirmed"
                            : "Use operator judgment after evidence review."}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Recommendation is deterministic and advisory; the operator must select the final outcome.
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid gap-4 lg:grid-cols-3">
                  <form action={resolveDisputeCaseAction} className="grid gap-3 rounded-md border p-4 lg:col-span-2">
                    <input type="hidden" name="disputeId" value={detail.dispute.id} />
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <h4 className="text-sm font-semibold">Resolve with structured outcome</h4>
                    <select name="outcome" defaultValue={detail.resolution?.outcome ?? ""} className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm" required>
                      <option value="">Select outcome</option>
                      {DISPUTE_OUTCOMES.map((outcome) => <option key={outcome} value={outcome}>{outcome.replaceAll("_", " ")}</option>)}
                    </select>
                    <Textarea name="rationale" rows={4} placeholder="Required resolution rationale" defaultValue={detail.resolution?.rationale ?? ""} required />
                    <Textarea name="internalFinalNote" rows={3} placeholder="Internal final note" defaultValue={detail.resolution?.internalFinalNote ?? ""} />
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input type="checkbox" name="followUpRequired" defaultChecked={detail.resolution?.followUpRequired ?? false} className="h-4 w-4 rounded border-input" />
                      Follow-up required
                    </label>
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input type="checkbox" name="confirmation" className="h-4 w-4 rounded border-input" required />
                      I confirm this resolution has outcome, rationale, and safe notes only.
                    </label>
                    <Button type="submit" disabled={detail.dispute.status === "closed"}>Resolve case</Button>
                    {detail.dispute.status === "closed" ? <p className="text-xs text-muted-foreground">Closed cases must be reopened before resolution changes.</p> : null}
                  </form>
                  <div className="grid gap-4">
                    <form action={closeDisputeCaseAction} className="grid gap-3 rounded-md border p-4">
                      <input type="hidden" name="disputeId" value={detail.dispute.id} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <h4 className="text-sm font-semibold">Close case</h4>
                      <Textarea name="closeReason" rows={3} placeholder="Close reason required if no resolution exists" />
                      <label className="inline-flex items-center gap-2 text-sm">
                        <input type="checkbox" name="confirmation" className="h-4 w-4 rounded border-input" required />
                        Confirm closure
                      </label>
                      <Button type="submit" variant="outline" disabled={detail.dispute.status === "closed"}>Close</Button>
                    </form>
                    <form action={reopenDisputeCaseAction} className="grid gap-3 rounded-md border p-4">
                      <input type="hidden" name="disputeId" value={detail.dispute.id} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <h4 className="text-sm font-semibold">Reopen case</h4>
                      <Textarea name="reopenReason" rows={3} placeholder="Required reopen reason" required />
                      <Button type="submit" variant="outline" disabled={detail.dispute.status === "reopened"}>Reopen</Button>
                    </form>
                  </div>
                </div>
              </Section>

              <Section id="actions" title="Actions">
                <ActionPanel
                  title="Case actions"
                  description="Every mutation writes a DisputeEvent and AdminAuditEvent. Sensitive payment, identity, and access-code data is rejected."
                  result={notice ?? error}
                >
                  <div className="grid gap-4 lg:grid-cols-2">
                    <ActionGroup title="Assignment">
                      <form action={assignDisputeAction} className="grid gap-3 rounded-md border p-3">
                        <input type="hidden" name="disputeId" value={detail.dispute.id} />
                        <input type="hidden" name="returnTo" value={returnTo} />
                        <select name="assignedToId" defaultValue={detail.dispute.assignedToId ?? ""} className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
                          <option value="">Clear assignee</option>
                          {detail.admins.map((admin) => <option key={admin.id} value={admin.id}>{personName(admin)}</option>)}
                        </select>
                        <Button type="submit" variant="outline">Update assignment</Button>
                      </form>
                    </ActionGroup>
                    <ActionGroup title="Priority">
                      <form action={updateDisputePriorityAction} className="grid gap-3 rounded-md border p-3">
                        <input type="hidden" name="disputeId" value={detail.dispute.id} />
                        <input type="hidden" name="returnTo" value={returnTo} />
                        <select name="priority" defaultValue={detail.dispute.priority} className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
                          {DISPUTE_PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                        </select>
                        <Textarea name="message" rows={2} placeholder="Priority rationale" />
                        <Button type="submit" variant="outline">Update priority</Button>
                      </form>
                    </ActionGroup>
                    <ActionGroup title="Status lifecycle">
                      {DISPUTE_STATUSES.filter((status) => !["resolved", "closed", "reopened"].includes(status)).map((status) => {
                        const reason = statusDisabledReason(detail, status);
                        return (
                          <form key={status} action={updateDisputeStatusAction} className="grid gap-2 rounded-md border p-3">
                            <input type="hidden" name="disputeId" value={detail.dispute.id} />
                            <input type="hidden" name="returnTo" value={returnTo} />
                            <input type="hidden" name="status" value={status} />
                            <Textarea name="message" rows={2} placeholder="Timeline message" />
                            <Button type="submit" variant="outline" disabled={Boolean(reason)}>{actionLabel(status)}</Button>
                            {reason ? <p className="text-xs text-muted-foreground">{reason}</p> : <p className="text-xs text-muted-foreground">Enabled. Creates event and audit record.</p>}
                          </form>
                        );
                      })}
                    </ActionGroup>
                    <ActionGroup title="Information requests">
                      {["guest", "partner", "admin"].map((party) => (
                        <form key={party} action={requestDisputeInformationAction} className="grid gap-2 rounded-md border p-3">
                          <input type="hidden" name="disputeId" value={detail.dispute.id} />
                          <input type="hidden" name="returnTo" value={returnTo} />
                          <input type="hidden" name="party" value={party} />
                          <Textarea name="message" rows={2} placeholder={`Request ${party} information`} required />
                          <Button type="submit" variant="outline" disabled={detail.dispute.status === "closed"}>Request {party} info</Button>
                          {detail.dispute.status === "closed" ? <p className="text-xs text-muted-foreground">Closed cases must be reopened before requesting information.</p> : null}
                        </form>
                      ))}
                    </ActionGroup>
                    <ActionGroup title="Verification">
                      <form action={createDisputeVerificationAction} className="grid gap-3 rounded-md border p-3">
                        <input type="hidden" name="disputeId" value={detail.dispute.id} />
                        <input type="hidden" name="returnTo" value={returnTo} />
                        <select name="entityType" defaultValue={defaultVerification.entityType} className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
                          {VERIFICATION_ENTITY_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                        </select>
                        <Input name="entityId" defaultValue={defaultVerification.entityId} placeholder="Entity id" required />
                        <select name="category" defaultValue="operational_readiness" className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
                          {VERIFICATION_CATEGORIES.map((category) => <option key={category} value={category}>{category.replaceAll("_", " ")}</option>)}
                        </select>
                        <Input name="title" defaultValue={`Verification review for ${detail.dispute.caseNumber}`} />
                        <Textarea name="summary" rows={2} placeholder="Safe verification summary" />
                        <Button type="submit" variant="outline">Create verification</Button>
                      </form>
                    </ActionGroup>
                    <ActionGroup title="Linked operations">
                      <div className="grid gap-2">
                        <Button asChild variant="outline"><Link href={detail.reservation ? `/admin/bookings?bookingId=${detail.reservation.id}` : "/admin/bookings"}>Open booking</Link></Button>
                        <Button asChild variant="outline"><Link href={detail.payment ? `/admin/payments?paymentId=${detail.payment.id}` : "/admin/payments"}>Open payment</Link></Button>
                        <Button asChild variant="outline"><Link href={handover ? `/admin/handover?handoverId=${handover.id}` : "/admin/handover"}>Open handover</Link></Button>
                        <Button asChild variant="outline"><Link href={detail.guest ? `/admin/guests?guestId=${detail.guest.id}` : "/admin/guests"}>Open guest</Link></Button>
                        <Button asChild variant="outline"><Link href={detail.property ? `/admin/property-trust?homeId=${detail.property.id}` : "/admin/property-trust"}>Open property/partner</Link></Button>
                      </div>
                    </ActionGroup>
                  </div>
                </ActionPanel>
              </Section>
            </div>

            <aside className="space-y-4">
              <ReadinessMeter label="Resolution readiness" score={detail.insight.resolutionReadinessScore} detail="Computed from live linked records." />
              <div className="rounded-md border bg-background p-4 shadow-sm">
                <h3 className="text-sm font-semibold">Linked counts</h3>
                <div className="mt-3 grid gap-2 text-sm">
                  <CountRow label="Payments" value={detail.payments.length} />
                  <CountRow label="Handovers" value={detail.handovers.length} />
                  <CountRow label="Verifications" value={detail.verifications.length} />
                  <CountRow label="Related cases" value={detail.relatedCases.length} />
                  <CountRow label="Timeline events" value={detail.timeline.length} />
                </div>
              </div>
              <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                <div className="flex gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>Do not store sensitive payment, identity, document, provider-secret, or access-code data in dispute records.</p>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

function EvidencePanel({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-md border p-4">
      <h4 className="text-sm font-semibold">{label}</h4>
      <p className="mt-2 text-sm text-muted-foreground">{evidenceValue(value)}</p>
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
