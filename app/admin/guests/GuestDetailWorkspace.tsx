import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  CalendarCheck,
  CreditCard,
  FileText,
  Heart,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserRound,
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
import { Textarea } from "@/components/ui/textarea";
import { formatCurrencyAmount, formatDate, formatDateTime } from "@/app/lib/marketplaceStatus";
import type { GuestOperationsDetail } from "@/app/lib/guestOperations";
import { guestDisplayName, paymentReference, reservationReference } from "@/app/lib/guestIntelligence";
import {
  createGuestDisputeAction,
  createGuestPremiumProfileAction,
  createGuestVerificationAction,
  requestGuestInformationAction,
  updateGuestPremiumStatusAction,
} from "./actions";

type GuestDetailWorkspaceProps = {
  detail: GuestOperationsDetail;
  closeHref: string;
  returnTo: string;
  notice?: string | null;
  error?: string | null;
};

const tabs = [
  ["executive", "Executive Guest Brief"],
  ["stays", "Stay History"],
  ["payments", "Payments & Financial Reliability"],
  ["handover", "Handover & Stay Execution"],
  ["disputes", "Disputes & Support Risk"],
  ["verification", "Verification & Trust"],
  ["premium", "Premium Readiness"],
  ["preferences", "Preferences & Profile"],
  ["timeline", "Timeline"],
  ["actions", "Actions"],
] as const;

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

function QueueEmpty({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-md border border-dashed bg-slate-50 p-4 text-sm">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-muted-foreground">{description}</p>
    </div>
  );
}

function money(value?: number | string | { toString(): string } | null, currency: string | null = "USD") {
  if (value === null || value === undefined) return "Not set";
  return formatCurrencyAmount(Number(value.toString()), currency ?? "USD");
}

function getNights(startDate: Date, endDate: Date, snapshot?: number | null) {
  if (snapshot && snapshot > 0) return snapshot;
  const nights = Math.ceil((endDate.getTime() - startDate.getTime()) / 86_400_000);
  return nights > 0 ? nights : 0;
}

function propertyTitle(reservation: GuestOperationsDetail["reservations"][number]) {
  return reservation.listingTitleSnapshot ?? reservation.Home?.approvedTitle ?? reservation.Home?.title ?? "Property not linked";
}

function paymentStatusForReservation(detail: GuestOperationsDetail, reservationId: string) {
  const records = detail.payments.filter((payment) => payment.reservationId === reservationId);
  if (!records.length) return "missing";
  if (records.some((payment) => ["failed", "requires_review"].includes(payment.status))) return records.find((payment) => ["failed", "requires_review"].includes(payment.status))?.status ?? records[0].status;
  if (records.some((payment) => ["captured", "authorized"].includes(payment.status))) return records.find((payment) => ["captured", "authorized"].includes(payment.status))?.status ?? records[0].status;
  return records[0].status;
}

function handoverStatusForReservation(detail: GuestOperationsDetail, reservationId: string) {
  const records = detail.handovers.filter((task) => task.reservationId === reservationId);
  if (!records.length) return "missing";
  if (records.some((task) => task.status === "issue_reported")) return "issue_reported";
  if (records.some((task) => task.status !== "completed" && task.status !== "cancelled")) return records.find((task) => task.status !== "completed" && task.status !== "cancelled")?.status ?? records[0].status;
  return "completed";
}

function disputeStatusForReservation(detail: GuestOperationsDetail, reservationId: string) {
  const records = detail.disputes.filter((dispute) => dispute.reservationId === reservationId);
  if (!records.length) return "none";
  if (records.some((dispute) => ["open", "under_review", "awaiting_guest", "awaiting_partner", "awaiting_admin", "reopened"].includes(dispute.status))) return "open";
  return "resolved";
}

function paymentIssueHref(detail: GuestOperationsDetail) {
  const issue = detail.payments.find((payment) => ["failed", "requires_review", "pending_approval"].includes(payment.status));
  return issue ? `/admin/payments?paymentId=${issue.id}` : null;
}

function latestReservationHref(detail: GuestOperationsDetail) {
  const reservation = [...detail.reservations].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  return reservation ? `/admin/bookings?bookingId=${reservation.id}` : null;
}

function latestHandoverIssueHref(detail: GuestOperationsDetail) {
  const issue = detail.handovers.find((task) => task.status === "issue_reported" || task.priority === "high" || task.priority === "urgent");
  return issue ? `/admin/handover?handoverId=${issue.id}` : null;
}

function latestDisputeHref(detail: GuestOperationsDetail) {
  const dispute = detail.disputes[0];
  return dispute ? `/admin/disputes?disputeId=${dispute.id}` : null;
}

function checklistStats(checklist: unknown) {
  if (!Array.isArray(checklist)) return { done: 0, total: 0, percent: null as number | null };
  const total = checklist.length;
  const done = checklist.filter((item) => {
    if (typeof item === "object" && item && "done" in item) return Boolean((item as { done?: unknown }).done);
    if (typeof item === "object" && item && "completed" in item) return Boolean((item as { completed?: unknown }).completed);
    return false;
  }).length;
  return { done, total, percent: total ? Math.round((done / total) * 100) : null };
}

function summaryCsv(detail: GuestOperationsDetail) {
  const rows = [
    ["field", "value"],
    ["guest_id", detail.guest.id],
    ["name", guestDisplayName(detail.guest)],
    ["email", detail.guest.email],
    ["role", detail.guest.role],
    ["risk_level", detail.intelligence.guestRiskLevel],
    ["readiness_score", detail.intelligence.guestReadinessScore ?? "insufficient history"],
    ["reservations", detail.reservations.length],
    ["payments", detail.payments.length],
    ["disputes", detail.disputes.length],
    ["handovers", detail.handovers.length],
    ["verification", detail.intelligence.verificationSignal.label],
    ["premium", detail.intelligence.premiumReadinessSignal.label],
    ["next_actions", detail.intelligence.nextBestActions.map((action) => action.label).join(" | ")],
  ];
  return `data:text/csv;charset=utf-8,${encodeURIComponent(rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n"))}`;
}

function reservationGroups(detail: GuestOperationsDetail) {
  const now = new Date();
  return {
    upcoming: detail.reservations.filter((reservation) => reservation.startDate > now && reservation.bookingStatus !== "cancelled"),
    current: detail.reservations.filter((reservation) => reservation.startDate <= now && reservation.endDate >= now && reservation.bookingStatus !== "cancelled"),
    past: detail.reservations.filter((reservation) => reservation.endDate < now || reservation.bookingStatus === "completed"),
    cancelled: detail.reservations.filter((reservation) => reservation.bookingStatus === "cancelled"),
  };
}

export function GuestDetailWorkspace({
  detail,
  closeHref,
  returnTo,
  notice,
  error,
}: GuestDetailWorkspaceProps) {
  const name = guestDisplayName(detail.guest);
  const intelligence = detail.intelligence;
  const primaryAction = intelligence.nextBestActions[0];
  const groups = reservationGroups(detail);
  const latestBookingHref = latestReservationHref(detail);
  const latestPaymentHref = paymentIssueHref(detail);
  const handoverIssueHref = latestHandoverIssueHref(detail);
  const disputeHref = latestDisputeHref(detail);
  const canMarkPremiumReady = Boolean(detail.premiumProfile && intelligence.verificationVerified && !intelligence.failedPaymentExposure && !intelligence.openDisputeExposure);
  const premiumReadyDisabledReason = canMarkPremiumReady ? null : "Requires an existing profile, verified guest verification, no failed payment exposure, and no open dispute exposure.";
  const premiumVerificationDisabledReason = detail.verifications.some((record) => record.category === "premium_guest" && ["pending", "under_review", "needs_information", "verified"].includes(record.status))
    ? "A premium guest verification is already active or verified."
    : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/20">
      <div className="absolute inset-y-0 right-0 flex w-full max-w-[min(96vw,1800px)] flex-col border-l bg-background shadow-2xl">
        <header className="border-b bg-background p-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={closeHref} className="inline-flex min-h-9 w-9 items-center justify-center rounded-md border hover:border-foreground/30">
                  <X className="h-4 w-4" />
                  <span className="sr-only">Close guest detail</span>
                </Link>
                <RiskBadge severity={intelligence.guestRiskLevel === "foundation" ? "info" : intelligence.guestRiskLevel} label={intelligence.guestRiskLevel === "foundation" ? "Foundation state" : `${intelligence.guestRiskLevel} risk`} />
                <StatusBadge status={detail.guest.role} />
                <StatusBadge status={intelligence.verificationVerified ? "verified" : intelligence.verificationPending ? "pending" : intelligence.verificationRejected ? "rejected" : "foundation"} label={intelligence.verificationSignal.label} />
                <StatusBadge status={detail.premiumProfile?.status ?? "foundation"} label={intelligence.premiumReadinessSignal.label} />
              </div>
              <h2 className="mt-3 truncate text-2xl font-semibold">{name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {detail.guest.email} - {intelligence.accountAgeLabel} - {detail.premiumProfile?.preferredLanguage ?? "language not tracked"} / {detail.premiumProfile?.preferredCurrency ?? "currency not tracked"}
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:min-w-[560px]">
              <DetailMetric label="Primary recommended action" value={primaryAction?.label ?? "Monitor"} detail={primaryAction?.reason} />
              <DetailMetric label="Latest activity" value={intelligence.latestActivityLabel} detail={intelligence.latestActivityAt ? formatDateTime(intelligence.latestActivityAt) : "No operational activity yet"} />
            </div>
          </div>
          <nav className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {tabs.map(([id, label]) => (
              <a key={id} href={`#${id}`} className="whitespace-nowrap rounded-md border px-3 py-2 text-xs font-medium hover:border-foreground/30">
                {label}
              </a>
            ))}
          </nav>
          {notice ? <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</div> : null}
          {error ? <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</div> : null}
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
            <div className="space-y-4">
              <Section id="executive" title="Executive Guest Brief">
                <div className="grid gap-3 md:grid-cols-3">
                  <DetailMetric label="Identity" value={name} detail={detail.guest.email} />
                  <DetailMetric label="Account age" value={intelligence.accountAgeLabel} detail="User.createdAt is not present in the current schema." />
                  <DetailMetric label="Booking/stay count" value={detail.reservations.length} detail={intelligence.repeatGuest ? "Repeat guest signal." : "Repeat signal not established."} />
                  <DetailMetric label="Upcoming/current stay" value={intelligence.hasCurrentStay ? intelligence.currentStayLabel : intelligence.upcomingStayLabel} />
                  <DetailMetric label="Payment reliability" value={intelligence.paymentReliabilitySignal.label} detail={intelligence.paymentReliabilitySignal.detail} />
                  <DetailMetric label="Dispute exposure" value={intelligence.disputeExposureSignal.label} detail={intelligence.disputeExposureSignal.detail} />
                  <DetailMetric label="Handover exposure" value={intelligence.stayExecutionSignal.label} detail={intelligence.stayExecutionSignal.detail} />
                  <DetailMetric label="Verification" value={intelligence.verificationSignal.label} detail={intelligence.verificationSignal.detail} />
                  <DetailMetric label="Premium eligibility" value={intelligence.premiumReadinessSignal.label} detail={intelligence.premiumReadinessSignal.detail} />
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <ReadinessMeter label="Guest readiness score" score={intelligence.guestReadinessScore} detail={intelligence.guestReadinessScore === null ? "Insufficient history. Score is not invented." : "Computed from payment, verification, dispute, handover, and stay history."} />
                  <div className="rounded-md border p-4">
                    <p className="text-sm font-semibold">Blockers and next-best actions</p>
                    {intelligence.blockers.length ? (
                      <ul className="mt-3 space-y-2 text-sm">
                        {intelligence.blockers.map((blocker) => <li key={blocker} className="rounded-md border bg-slate-50 px-3 py-2">{blocker}</li>)}
                      </ul>
                    ) : (
                      <p className="mt-3 rounded-md border border-dashed p-3 text-sm text-muted-foreground">No deterministic blocker is currently active.</p>
                    )}
                    <div className="mt-3 grid gap-2">
                      {intelligence.nextBestActions.map((action) => (
                        <div key={action.id} className="rounded-md border p-3">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-semibold">{action.label}</p>
                            <RiskBadge severity={action.severity} />
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{action.reason}</p>
                          {action.href ? <Link className="mt-2 inline-flex text-xs font-medium underline-offset-4 hover:underline" href={action.href}>Open linked source</Link> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Section>

              <Section id="stays" title="Stay History">
                {detail.reservations.length ? (
                  <div className="space-y-4">
                    {([
                      ["Current", groups.current],
                      ["Upcoming", groups.upcoming],
                      ["Past", groups.past],
                      ["Cancelled", groups.cancelled],
                    ] as const).map(([label, reservations]) => (
                      <div key={label}>
                        <div className="mb-2 flex items-center justify-between">
                          <h4 className="text-sm font-semibold">{label}</h4>
                          <span className="text-xs text-muted-foreground">{reservations.length} stays</span>
                        </div>
                        {reservations.length ? (
                          <div className="grid gap-2">
                            {reservations.map((reservation) => (
                              <div key={reservation.id} className="grid gap-3 rounded-md border p-3 lg:grid-cols-[minmax(0,1.2fr)_repeat(5,minmax(120px,1fr))_110px] lg:items-center">
                                <div>
                                  <p className="font-semibold">{reservationReference(reservation.id)}</p>
                                  <p className="mt-1 text-xs text-muted-foreground">{propertyTitle(reservation)} - {reservation.listingCitySnapshot ?? reservation.Home?.city ?? "City not set"}</p>
                                </div>
                                <StatusBadge status={reservation.bookingStatus} />
                                <DetailTiny label="Dates" value={`${formatDate(reservation.startDate)} - ${formatDate(reservation.endDate)}`} />
                                <DetailTiny label="Nights" value={getNights(reservation.startDate, reservation.endDate, reservation.totalNightsSnapshot)} />
                                <DetailTiny label="Snapshot" value={money(reservation.totalSnapshot, reservation.currencySnapshot)} />
                                <DetailTiny label="Payment" value={<StatusBadge status={paymentStatusForReservation(detail, reservation.id)} />} />
                                <DetailTiny label="Ops" value={<><StatusBadge status={handoverStatusForReservation(detail, reservation.id)} /><span className="ml-1"><StatusBadge status={disputeStatusForReservation(detail, reservation.id)} /></span></>} />
                                <Button asChild variant="outline" size="sm"><Link href={`/admin/bookings?bookingId=${reservation.id}`}>Open</Link></Button>
                              </div>
                            ))}
                          </div>
                        ) : <QueueEmpty title={`No ${label.toLowerCase()} stays`} description="No reservation records are currently in this group." />}
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="Foundation guest state"
                    description="This guest has no reservation history yet. Stay cards, payment readiness, handover state, and dispute exposure will appear after a real booking exists."
                    why="No Reservation rows are linked to this User."
                    createsRecords="Guests appear here through signup, reservation, and checkout flows. Admins do not create fake guest history."
                    links={[{ href: "/admin/bookings", label: "Open bookings" }, { href: "/", label: "Open marketplace" }]}
                  />
                )}
              </Section>

              <Section id="payments" title="Payments & Financial Reliability">
                <div className="grid gap-3 md:grid-cols-3">
                  <DetailMetric label="Financial reliability" value={intelligence.paymentReliabilitySignal.label} detail={intelligence.paymentReliabilitySignal.detail} />
                  <DetailMetric label="Captured/authorized" value={detail.payments.filter((payment) => ["captured", "authorized"].includes(payment.status)).length} />
                  <DetailMetric label="Failed/review/manual" value={detail.payments.filter((payment) => ["failed", "requires_review", "pending_approval"].includes(payment.status) || ["manual", "bank_transfer", "cash_to_host"].includes(payment.method)).length} />
                </div>
                <div className="mt-4 grid gap-3">
                  {detail.payments.length ? detail.payments.map((payment) => (
                    <div key={payment.id} className="rounded-md border p-3">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <p className="font-semibold">{paymentReference(payment.id)}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{money(payment.amount, payment.currency)} - {payment.method.replaceAll("_", " ")} - {payment.provider}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <StatusBadge status={payment.status} />
                          <StatusBadge status={payment.providerStatus ?? "provider_unknown"} />
                        </div>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-4">
                        <DetailTiny label="PayPal order" value={payment.providerOrderId ?? "Not recorded"} />
                        <DetailTiny label="Capture" value={payment.providerCaptureId ?? "No capture id"} />
                        <DetailTiny label="Authorization" value={payment.providerAuthorizationId ?? "No authorization id"} />
                        <DetailTiny label="Failure reason" value={payment.failureReason ?? "No failure reason"} />
                      </div>
                      {payment.events.length ? (
                        <div className="mt-3 rounded-md border bg-slate-50 p-3 text-xs text-muted-foreground">
                          Latest payment event: {payment.events[0].summary} ({formatDateTime(payment.events[0].createdAt)})
                        </div>
                      ) : null}
                      <div className="mt-3 flex gap-2">
                        <Button asChild variant="outline" size="sm"><Link href={`/admin/payments?paymentId=${payment.id}`}>Open payment</Link></Button>
                        <Button asChild variant="outline" size="sm"><Link href={`/admin/disputes?paymentRecordId=${payment.id}`}>Open disputes</Link></Button>
                      </div>
                    </div>
                  )) : (
                    <QueueEmpty title="No payment issues recorded" description={detail.reservations.length ? "No PaymentRecord rows are linked to this guest or their reservations yet." : "No payment records exist because the guest has no booking history yet."} />
                  )}
                </div>
              </Section>

              <Section id="handover" title="Handover & Stay Execution">
                <div className="grid gap-3 md:grid-cols-3">
                  <DetailMetric label="Stay execution signal" value={intelligence.stayExecutionSignal.label} detail={intelligence.stayExecutionSignal.detail} />
                  <DetailMetric label="Issue-reported tasks" value={detail.handovers.filter((task) => task.status === "issue_reported").length} />
                  <DetailMetric label="Open handover tasks" value={detail.handovers.filter((task) => !["completed", "cancelled"].includes(task.status)).length} />
                </div>
                <div className="mt-4 grid gap-3">
                  {detail.handovers.length ? detail.handovers.map((task) => {
                    const stats = checklistStats(task.checklist);
                    return (
                      <div key={task.id} className="rounded-md border p-3">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <p className="font-semibold">{task.taskNumber} - {task.title}</p>
                            <p className="mt-1 text-sm text-muted-foreground">{task.type.replaceAll("_", " ")} - scheduled {formatDateTime(task.scheduledFor, "Not scheduled")}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <StatusBadge status={task.status} />
                            <RiskBadge severity={task.priority} />
                          </div>
                        </div>
                        <div className="mt-3 grid gap-3 md:grid-cols-3">
                          <DetailTiny label="Checklist progress" value={stats.total ? `${stats.done}/${stats.total} (${stats.percent}%)` : "No checklist recorded"} />
                          <DetailTiny label="Completed" value={task.completedAt ? formatDateTime(task.completedAt) : "Not completed"} />
                          <DetailTiny label="Latest event" value={task.events[0]?.message ?? "No handover event recorded"} />
                        </div>
                        <div className="mt-3 flex gap-2">
                          <Button asChild variant="outline" size="sm"><Link href={`/admin/handover?handoverId=${task.id}`}>Open handover task</Link></Button>
                          <Button asChild variant="outline" size="sm"><Link href={`/admin/disputes?sourceType=handover&sourceId=${task.id}`}>Create dispute from issue</Link></Button>
                        </div>
                      </div>
                    );
                  }) : (
                    <QueueEmpty title="No handover exposure" description="No HandoverTask rows are linked to this guest. Check-in, checkout, cleaning, maintenance, and support tasks will appear after booking operations create them." />
                  )}
                </div>
              </Section>

              <Section id="disputes" title="Disputes & Support Risk">
                <div className="grid gap-3 md:grid-cols-3">
                  <DetailMetric label="Dispute signal" value={intelligence.disputeExposureSignal.label} detail={intelligence.disputeExposureSignal.detail} />
                  <DetailMetric label="Open cases" value={detail.disputes.filter((dispute) => ["open", "under_review", "awaiting_guest", "awaiting_partner", "awaiting_admin", "reopened"].includes(dispute.status)).length} />
                  <DetailMetric label="Resolved cases" value={detail.disputes.filter((dispute) => ["resolved", "closed"].includes(dispute.status)).length} />
                </div>
                <div className="mt-4 grid gap-3">
                  {detail.disputes.length ? detail.disputes.map((dispute) => (
                    <LinkedRecordCard
                      key={dispute.id}
                      type="Dispute"
                      title={`${dispute.caseNumber}: ${dispute.title}`}
                      subtitle={`${dispute.type.replaceAll("_", " ")} - latest event: ${dispute.events[0]?.message ?? "No event yet"}`}
                      status={dispute.status}
                      href={`/admin/disputes?disputeId=${dispute.id}`}
                      Icon={ShieldAlert}
                      meta={`Priority ${dispute.priority}; opened ${formatDate(dispute.openedAt ?? dispute.createdAt)}.`}
                    />
                  )) : (
                    <QueueEmpty title="No dispute exposure" description="No DisputeCase rows are linked to this guest, their reservations, or guest-linked payments." />
                  )}
                </div>
              </Section>

              <Section id="verification" title="Verification & Trust">
                <div className="grid gap-3 md:grid-cols-3">
                  <DetailMetric label="Verification signal" value={intelligence.verificationSignal.label} detail={intelligence.verificationSignal.detail} />
                  <DetailMetric label="Profile completeness" value={intelligence.profileCompletenessLabel} />
                  <DetailMetric label="Trust readiness" value={intelligence.verificationVerified ? "Verified" : intelligence.canCreateVerification ? "Verification-ready" : "Verification in progress"} />
                </div>
                <div className="mt-4 grid gap-3">
                  {detail.verifications.length ? detail.verifications.map((record) => (
                    <div key={record.id} className="rounded-md border p-3">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <p className="font-semibold">{record.title}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{record.category.replaceAll("_", " ")} - {record.summary ?? "No summary recorded"}</p>
                        </div>
                        <StatusBadge status={record.status} />
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-3">
                        <DetailTiny label="Evidence summary" value={record.evidenceSummary ?? "Evidence summary not recorded"} />
                        <DetailTiny label="Reviewed" value={record.reviewedAt ? formatDateTime(record.reviewedAt) : "Not reviewed"} />
                        <DetailTiny label="Expires" value={record.expiresAt ? formatDate(record.expiresAt) : "No expiry"} />
                      </div>
                      <div className="mt-3"><Button asChild variant="outline" size="sm"><Link href={`/admin/verifications?verificationId=${record.id}`}>Open verification module</Link></Button></div>
                    </div>
                  )) : (
                    <QueueEmpty title="No verification record yet" description="No raw ID/passport data is displayed or stored here. Create a status-only verification record when operations need trust review." />
                  )}
                </div>
              </Section>

              <Section id="premium" title="Premium Readiness">
                <div className="grid gap-3 md:grid-cols-3">
                  <DetailMetric label="Premium signal" value={intelligence.premiumReadinessSignal.label} detail={intelligence.premiumReadinessSignal.detail} />
                  <DetailMetric label="Candidate rule" value={intelligence.premiumCandidate ? "Eligible candidate" : "Not eligible now"} detail={intelligence.createPremiumProfileDisabledReason ?? "Passes deterministic rules."} />
                  <DetailMetric label="Risk level" value={detail.premiumProfile?.riskLevel ?? intelligence.guestRiskLevel} />
                </div>
                {detail.premiumProfile ? (
                  <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
                    <LinkedRecordCard
                      type="Premium profile"
                      title={detail.premiumProfile.status.replaceAll("_", " ")}
                      subtitle={`Eligibility ${detail.premiumProfile.eligibilityScore}; risk ${detail.premiumProfile.riskLevel}.`}
                      status={detail.premiumProfile.status}
                      href={`/admin/premium-guests?profileId=${detail.premiumProfile.id}`}
                      Icon={Sparkles}
                    />
                    <ReadinessMeter label="Eligibility score" score={detail.premiumProfile.eligibilityScore} detail="Stored on PremiumGuestProfile and updated by safe premium actions." />
                  </div>
                ) : (
                  <div className="mt-4">
                    <QueueEmpty title="No premium profile yet" description="This is an internal verified traveler eligibility review, not a subscription or benefits module." />
                  </div>
                )}
              </Section>

              <Section id="preferences" title="Preferences & Profile">
                <div className="grid gap-3 md:grid-cols-3">
                  <DetailMetric label="Name" value={name} />
                  <DetailMetric label="Email" value={detail.guest.email} />
                  <DetailMetric label="Role/status" value={<StatusBadge status={detail.guest.role} />} />
                  <DetailMetric label="Account created date" value="Not tracked in current User model" />
                  <DetailMetric label="Preferred language" value={detail.premiumProfile?.preferredLanguage ?? "Not tracked"} />
                  <DetailMetric label="Preferred currency" value={detail.premiumProfile?.preferredCurrency ?? "Not tracked"} />
                  <DetailMetric label="Profile completeness" value={intelligence.profileCompletenessLabel} />
                  <DetailMetric label="Travel style" value={detail.premiumProfile?.travelStyle ?? "Not tracked"} />
                  <DetailMetric label="Saved homes" value={detail.favorites.length} />
                </div>
                <div className="mt-4 grid gap-3">
                  {detail.favorites.length ? detail.favorites.map((favorite) => (
                    <LinkedRecordCard
                      key={favorite.id}
                      type="Saved home"
                      title={favorite.Home?.approvedTitle ?? favorite.Home?.title ?? favorite.homeId ?? "Saved home"}
                      subtitle={`${favorite.Home?.city ?? "City not set"} - saved ${formatDate(favorite.createAt)}`}
                      status={favorite.Home?.listingStatus ?? favorite.Home?.contentReviewStatus}
                      href={favorite.homeId ? `/admin/listings?homeId=${favorite.homeId}` : undefined}
                      Icon={Heart}
                    />
                  )) : (
                    <QueueEmpty title="No saved homes recorded" description="Favorites will appear when the guest saves real marketplace homes." />
                  )}
                </div>
              </Section>

              <Section id="timeline" title="Timeline">
                <Timeline
                  items={detail.timeline.map((item) => ({
                    id: item.id,
                    type: `${item.sourceModule}: ${item.type}`,
                    summary: item.summary,
                    createdAt: item.createdAt,
                    actor: item.actor,
                    href: item.href,
                  }))}
                />
              </Section>

              <Section id="actions" title="Actions">
                <div className="grid gap-4 lg:grid-cols-2">
                  <ActionPanel title="Trust & verification" description="Creates or updates status-only verification records. Do not enter raw identity document values.">
                    <form action={createGuestVerificationAction} className="space-y-3 rounded-md border p-3">
                      <input type="hidden" name="guestId" value={detail.guest.id} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <input type="hidden" name="category" value="identity" />
                      <Textarea name="summary" rows={2} placeholder="Operational summary" />
                      <Textarea name="evidenceSummary" rows={2} placeholder="Evidence summary only; no passport, ID, or document numbers." />
                      <Button type="submit" variant="outline" className="w-full" disabled={!intelligence.canCreateVerification} title={intelligence.createVerificationDisabledReason ?? "Create guest verification"}>Create verification</Button>
                      {intelligence.createVerificationDisabledReason ? <p className="text-xs text-muted-foreground">{intelligence.createVerificationDisabledReason}</p> : null}
                    </form>
                    <form action={requestGuestInformationAction} className="space-y-3 rounded-md border p-3">
                      <input type="hidden" name="guestId" value={detail.guest.id} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <Textarea name="message" rows={2} placeholder="Information request summary. No sensitive document numbers." />
                      <Button type="submit" variant="outline" className="w-full">Request information</Button>
                    </form>
                  </ActionPanel>

                  <ActionPanel title="Premium eligibility" description="Internal verified traveler review only. No paid plan, public privilege, or fabricated benefit is created.">
                    {!detail.premiumProfile ? (
                      <form action={createGuestPremiumProfileAction} className="space-y-3 rounded-md border p-3">
                        <input type="hidden" name="guestId" value={detail.guest.id} />
                        <input type="hidden" name="returnTo" value={returnTo} />
                        <Button type="submit" variant="outline" className="w-full" disabled={!intelligence.canCreatePremiumProfile} title={intelligence.createPremiumProfileDisabledReason ?? "Create premium profile"}>Create premium profile</Button>
                        {intelligence.createPremiumProfileDisabledReason ? <p className="text-xs text-muted-foreground">{intelligence.createPremiumProfileDisabledReason}</p> : null}
                      </form>
                    ) : (
                      <div className="grid gap-3">
                        <form action={updateGuestPremiumStatusAction} className="space-y-3 rounded-md border p-3">
                          <input type="hidden" name="guestId" value={detail.guest.id} />
                          <input type="hidden" name="profileId" value={detail.premiumProfile.id} />
                          <input type="hidden" name="returnTo" value={returnTo} />
                          <input type="hidden" name="status" value="under_review" />
                          <Textarea name="note" rows={2} placeholder="Internal premium review note" />
                          <Button type="submit" variant="outline" className="w-full">Start premium review</Button>
                        </form>
                        <form action={updateGuestPremiumStatusAction} className="space-y-3 rounded-md border p-3">
                          <input type="hidden" name="guestId" value={detail.guest.id} />
                          <input type="hidden" name="profileId" value={detail.premiumProfile.id} />
                          <input type="hidden" name="returnTo" value={returnTo} />
                          <input type="hidden" name="status" value="premium_ready" />
                          <input type="hidden" name="note" value="Premium ready status set from Guest Intelligence Command after deterministic safety checks." />
                          <Button type="submit" variant="outline" className="w-full" disabled={!canMarkPremiumReady} title={premiumReadyDisabledReason ?? "Mark premium ready"}>Mark premium ready</Button>
                          {premiumReadyDisabledReason ? <p className="text-xs text-muted-foreground">{premiumReadyDisabledReason}</p> : null}
                        </form>
                        <form action={updateGuestPremiumStatusAction} className="space-y-3 rounded-md border p-3">
                          <input type="hidden" name="guestId" value={detail.guest.id} />
                          <input type="hidden" name="profileId" value={detail.premiumProfile.id} />
                          <input type="hidden" name="returnTo" value={returnTo} />
                          <select name="status" defaultValue="suspended" className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                            <option value="suspended">Suspend profile</option>
                            <option value="rejected">Reject profile</option>
                          </select>
                          <Textarea name="note" rows={2} placeholder="Required internal rationale. No sensitive personal data." />
                          <Button type="submit" variant="outline" className="w-full">Record premium decision</Button>
                        </form>
                      </div>
                    )}
                    <form action={createGuestVerificationAction} className="space-y-3 rounded-md border p-3">
                      <input type="hidden" name="guestId" value={detail.guest.id} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <input type="hidden" name="category" value="premium_guest" />
                      <input type="hidden" name="title" value={`Premium guest verification for ${name}`} />
                      <Button type="submit" variant="outline" className="w-full" disabled={Boolean(premiumVerificationDisabledReason)} title={premiumVerificationDisabledReason ?? "Create premium verification"}>Create premium verification</Button>
                      {premiumVerificationDisabledReason ? <p className="text-xs text-muted-foreground">{premiumVerificationDisabledReason}</p> : null}
                    </form>
                  </ActionPanel>

                  <ActionPanel title="Support/dispute" description="Creates a guest-linked dispute with safe summaries only. Payment data, identity document values, and access codes are blocked server-side.">
                    <form action={createGuestDisputeAction} className="space-y-3 rounded-md border p-3">
                      <input type="hidden" name="guestId" value={detail.guest.id} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <select name="priority" defaultValue="medium" className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                        <option value="low">Low priority</option>
                        <option value="medium">Medium priority</option>
                        <option value="high">High priority</option>
                        <option value="urgent">Urgent priority</option>
                      </select>
                      <Textarea name="title" rows={1} placeholder="Case title" />
                      <Textarea name="summary" rows={3} placeholder="Operational summary. No card, ID, passport, PayPal secret, or access-code data." />
                      <Button type="submit" variant="outline" className="w-full">Create guest dispute</Button>
                    </form>
                  </ActionPanel>

                  <ActionPanel title="Booking/payment navigation" description="Navigation actions open linked operational modules without mutating guest account authority.">
                    <div className="grid gap-2">
                      {latestBookingHref ? <Button asChild variant="outline"><Link href={latestBookingHref}>Open latest booking</Link></Button> : <DisabledAction label="Open latest booking" reason="No linked reservation exists." />}
                      {latestPaymentHref ? <Button asChild variant="outline"><Link href={latestPaymentHref}>Open latest payment issue</Link></Button> : <DisabledAction label="Open latest payment issue" reason="No failed/requires-review payment is linked." />}
                      {handoverIssueHref ? <Button asChild variant="outline"><Link href={handoverIssueHref}>Open handover issue</Link></Button> : <DisabledAction label="Open handover issue" reason="No handover issue is linked." />}
                      {disputeHref ? <Button asChild variant="outline"><Link href={disputeHref}>Open dispute</Link></Button> : <DisabledAction label="Open dispute" reason="No dispute case is linked." />}
                      <Button asChild variant="outline"><a href={summaryCsv(detail)} download={`kantara-guest-${detail.guest.id}.csv`}>Export operational summary</a></Button>
                      <DisabledAction label="Mark internal review" reason="No supported guest review status field exists in the current schema, so this module does not mutate account status." />
                    </div>
                  </ActionPanel>
                </div>
              </Section>
            </div>

            <aside className="space-y-4">
              <div className="rounded-md border bg-background p-4 shadow-sm">
                <h3 className="font-semibold">Operating posture</h3>
                <div className="mt-3 grid gap-3">
                  <ReadinessMeter label="Guest readiness" score={intelligence.guestReadinessScore} size="compact" />
                  <DetailMetric label="Risk" value={<RiskBadge severity={intelligence.guestRiskLevel === "foundation" ? "info" : intelligence.guestRiskLevel} label={intelligence.guestRiskLevel} />} />
                  <DetailMetric label="Value signal" value={intelligence.guestValueSignal.label} detail={intelligence.guestValueSignal.detail} />
                  <DetailMetric label="Next action" value={primaryAction?.label ?? "Monitor"} detail={primaryAction?.reason} />
                </div>
              </div>
              <div className="rounded-md border bg-background p-4 shadow-sm">
                <h3 className="font-semibold">Privacy guardrails</h3>
                <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
                  <li className="rounded-md border bg-slate-50 p-2">No raw ID/passport data is displayed.</li>
                  <li className="rounded-md border bg-slate-50 p-2">No card data, CVV, or PayPal secret is displayed.</li>
                  <li className="rounded-md border bg-slate-50 p-2">No private access codes or handover instructions are shown.</li>
                  <li className="rounded-md border bg-slate-50 p-2">Role and account status editing is intentionally unavailable.</li>
                </ul>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailTiny({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 break-words text-xs font-medium">{value}</div>
    </div>
  );
}

function DisabledAction({ label, reason }: { label: string; reason: string }) {
  return (
    <div className="rounded-md border border-dashed p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{label}</p>
        <Button type="button" variant="outline" size="sm" disabled>Disabled</Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{reason}</p>
    </div>
  );
}
