import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  Building2,
  CreditCard,
  FileText,
  KeyRound,
  ShieldAlert,
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatSnapshotMoney, getCurrencyDisplayState } from "@/app/lib/currency";
import { formatDate, formatDateTime } from "@/app/lib/marketplaceStatus";
import {
  getBookingDisplayTitle,
  getBookingOperationsDetail,
  getBookingPersonName,
} from "@/app/lib/bookingOperations";
import { getBookingStatusTransitionDisabledReason } from "@/app/lib/bookingIntelligence";
import {
  createBookingDisputeAction,
  createBookingHandoverTaskAction,
  createBookingPayPalOrderAction,
  createBookingVerificationRecordAction,
  markBookingPaymentRequiresReviewAction,
  updateBookingHandoverStatusAction,
  updateBookingStatusAction,
} from "./actions";

type BookingDetail = NonNullable<Awaited<ReturnType<typeof getBookingOperationsDetail>>>;
type CurrencyState = Awaited<ReturnType<typeof getCurrencyDisplayState>>;

type BookingDetailDrawerProps = {
  detail: BookingDetail;
  currencyState: CurrencyState;
  closeHref: string;
  returnTo: string;
  notice?: string | null;
  error?: string | null;
};

const tabs = [
  ["overview", "Overview"],
  ["guest", "Guest"],
  ["property", "Property"],
  ["price", "Price Snapshot"],
  ["payments", "Payments"],
  ["handover", "Handover"],
  ["disputes", "Disputes"],
  ["verifications", "Verifications / Risk"],
  ["timeline", "Timeline"],
  ["actions", "Actions"],
] as const;

function money(value: number | null, currencyState: CurrencyState, currency?: string | null) {
  return formatSnapshotMoney({
    amount: value,
    snapshotCurrency: currency ?? "USD",
    state: currencyState,
  });
}

function DetailMetric({ label, value, detail }: { label: string; value: string | number | null; detail?: string | null }) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold">{value ?? "Not set"}</p>
      {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 rounded-md border bg-background p-4 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function lifecycleActionLabel(status: string) {
  if (status === "under_review") return "Mark under review";
  if (status === "confirmed") return "Confirm manually";
  if (status === "cancelled") return "Admin cancel";
  if (status === "completed") return "Mark completed";
  return status.replaceAll("_", " ");
}

function paymentSourceLabel(snapshotJson: unknown) {
  if (!snapshotJson || typeof snapshotJson !== "object" || Array.isArray(snapshotJson)) {
    return "source unknown";
  }
  const source = (snapshotJson as Record<string, unknown>).checkoutSource ?? (snapshotJson as Record<string, unknown>).source;
  return typeof source === "string" && source.trim()
    ? source.replaceAll("_", " ")
    : "operations";
}

export function BookingDetailDrawer({
  detail,
  currencyState,
  closeHref,
  returnTo,
  notice,
  error,
}: BookingDetailDrawerProps) {
  const { reservation, insight } = detail;
  const title = getBookingDisplayTitle(reservation);
  const guestName = getBookingPersonName(reservation.User);
  const partnerName = getBookingPersonName(reservation.Home?.User);
  const amount = money(reservation.totalSnapshot, currencyState, reservation.currencySnapshot);
  const primaryAction = insight.nextBestActions[0];
  const guestVerifications = detail.verifications.filter((record) => record.entityType === "guest");
  const propertyVerifications = detail.verifications.filter((record) => record.entityType === "property");
  const paymentVerifications = detail.verifications.filter((record) => record.entityType === "payment");
  const handoverVerifications = detail.verifications.filter((record) => record.entityType === "handover");
  const hasPayment = detail.payments.length > 0;
  const createPaymentDisabledReason = !detail.provider.isConfigured
    ? "PayPal order creation is disabled until PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are configured."
    : !reservation.totalSnapshot || reservation.totalSnapshot <= 0
      ? "This reservation does not have a payable locked total snapshot."
      : null;
  const activeHandover = detail.handovers.find((task) => task.status !== "cancelled");

  return (
    <div className="fixed inset-0 z-50 bg-black/20">
      <div className="absolute inset-y-0 right-0 flex w-full max-w-[min(96vw,1800px)] flex-col border-l bg-background shadow-2xl">
        <header className="border-b bg-background p-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={closeHref} className="inline-flex min-h-9 w-9 items-center justify-center rounded-md border hover:border-foreground/30">
                  <X className="h-4 w-4" />
                  <span className="sr-only">Close booking detail</span>
                </Link>
                <StatusBadge status={reservation.bookingStatus} />
                <RiskBadge severity={insight.attentionLevel} label={insight.attentionLevel === "none" ? "No active risk" : `${insight.attentionLevel} attention`} />
                <span className="rounded-full border bg-muted px-3 py-1 text-xs font-medium">{detail.reference}</span>
              </div>
              <h2 className="mt-3 truncate text-2xl font-semibold">{title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {guestName} - {reservation.listingCitySnapshot ?? reservation.Home?.city ?? "City not set"} - {formatDate(reservation.startDate)} to {formatDate(reservation.endDate)}
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:min-w-[520px]">
              <DetailMetric label="Locked amount" value={amount} detail="Reservation snapshot is read-only." />
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
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-4">
              <Section id="overview" title="Overview">
                <div className="grid gap-4 lg:grid-cols-3">
                  <ReadinessMeter label="Booking readiness" score={insight.readinessScore} detail={`${insight.attentionReasons.length} computed attention reason${insight.attentionReasons.length === 1 ? "" : "s"}.`} />
                  <DetailMetric label="Lifecycle stage" value={insight.lifecycleStage.replaceAll("_", " ")} />
                  <DetailMetric label="Created" value={formatDateTime(reservation.createdAt)} />
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-3">
                  <LinkedRecordCard
                    type="Guest"
                    title={guestName}
                    subtitle={reservation.User?.email}
                    status={reservation.User?.role}
                    href={reservation.userId ? `/admin/guests?guestId=${reservation.userId}` : undefined}
                    Icon={UserRound}
                    meta={`${reservation.User?._count.Reservation ?? 0} reservations`}
                  />
                  <LinkedRecordCard
                    type="Property"
                    title={reservation.Home?.approvedTitle ?? reservation.Home?.title ?? "Property not linked"}
                    subtitle={reservation.Home?.city}
                    status={reservation.Home?.contentReviewStatus}
                    href={reservation.homeId ? `/admin/property-trust?homeId=${reservation.homeId}` : undefined}
                    Icon={Building2}
                    meta={`${reservation.Home?._count.images ?? 0} media assets`}
                  />
                  <LinkedRecordCard
                    type="Partner/host"
                    title={partnerName}
                    subtitle={reservation.Home?.User?.email}
                    status={reservation.Home?.User?.role}
                    href={reservation.Home?.userId ? `/admin/partner-operations?partnerId=${reservation.Home.userId}` : undefined}
                    Icon={UserRound}
                  />
                </div>
                <div className="mt-4 grid gap-3">
                  {insight.attentionReasons.length ? (
                    insight.attentionReasons.map((reason) => (
                      <div key={reason} className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                        <div className="flex gap-2">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                          <span>{reason}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                      No blockers are currently derived from linked payment, handover, dispute, verification, or snapshot data.
                    </div>
                  )}
                </div>
              </Section>

              <Section id="guest" title="Guest">
                <div className="grid gap-3 lg:grid-cols-4">
                  <DetailMetric label="Name" value={guestName} />
                  <DetailMetric label="Email" value={reservation.User?.email ?? "Not linked"} />
                  <DetailMetric label="Account role" value={reservation.User?.role ?? "Not linked"} />
                  <DetailMetric label="Reservations" value={reservation.User?._count.Reservation ?? 0} />
                  <DetailMetric label="Favorites" value={reservation.User?._count.Favorite ?? 0} />
                  <DetailMetric label="Reviews" value={reservation.User?._count.Review ?? 0} />
                  <DetailMetric label="Premium profile" value={detail.premiumProfile?.status ?? "No profile"} />
                  <DetailMetric label="Verification" value={guestVerifications[0]?.status ?? "No linked guest verification"} />
                </div>
                {detail.premiumProfile ? (
                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    <ReadinessMeter label="Premium eligibility score" score={detail.premiumProfile.eligibilityScore} detail={`Risk level: ${detail.premiumProfile.riskLevel}`} />
                    <LinkedRecordCard
                      type="Premium guest profile"
                      title={detail.premiumProfile.status.replaceAll("_", " ")}
                      subtitle="Verified traveler foundation, not a paid subscription."
                      href={`/admin/premium-guests?profileId=${detail.premiumProfile.id}`}
                    />
                  </div>
                ) : (
                  <EmptyState
                    title="No premium guest profile"
                    description="Premium readiness is shown only when a real PremiumGuestProfile exists."
                    why="This guest has no PremiumGuestProfile row."
                    createsRecords="Premium Guests can create a profile after real eligibility review."
                    links={[{ href: `/admin/premium-guests?q=${encodeURIComponent(reservation.User?.email ?? reservation.userId ?? "")}`, label: "Open Premium Guests" }]}
                  />
                )}
              </Section>

              <Section id="property" title="Property">
                <div className="grid gap-3 lg:grid-cols-4">
                  <DetailMetric label="Property title" value={reservation.Home?.approvedTitle ?? reservation.Home?.title ?? "Not linked"} />
                  <DetailMetric label="City" value={reservation.listingCitySnapshot ?? reservation.Home?.city ?? "Not set"} />
                  <DetailMetric label="Property type" value={reservation.listingPropertyTypeSnapshot ?? reservation.Home?.propertyType ?? "Not set"} />
                  <DetailMetric label="Listing status" value={reservation.Home?.listingStatus ?? "Not linked"} />
                  <DetailMetric label="Content review" value={reservation.Home?.contentReviewStatus ?? "Not linked"} />
                  <DetailMetric label="Media readiness" value={`${reservation.Home?._count.images ?? 0} images`} />
                  <DetailMetric label="Pricing readiness" value={reservation.Home?.price ? `${reservation.Home.price} nightly base` : "No live property price"} />
                  <DetailMetric label="Trust review" value={propertyVerifications[0]?.status ?? reservation.Home?.contentReviewStatus ?? "No verification"} />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {reservation.homeId ? (
                    <>
                      <Link className="inline-flex min-h-10 items-center rounded-md border px-3 text-sm font-medium hover:border-foreground/30" href={`/admin/property-trust?homeId=${reservation.homeId}`}>
                        Open property trust
                      </Link>
                      <Link className="inline-flex min-h-10 items-center rounded-md border px-3 text-sm font-medium hover:border-foreground/30" href={`/homes/${reservation.homeId}`}>
                        View public listing
                      </Link>
                    </>
                  ) : null}
                </div>
              </Section>

              <Section id="price" title="Price Snapshot">
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                  Reservation snapshot values are protected and read-only. Admin actions here never mutate nightly price, fees, deposits, totals, currency, or lock timestamp.
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <DetailMetric label="Nightly price" value={money(reservation.nightlyPriceSnapshot, currencyState, reservation.currencySnapshot)} />
                  <DetailMetric label="Nights" value={reservation.totalNightsSnapshot ?? "Not captured"} />
                  <DetailMetric label="Cleaning fee" value={money(reservation.cleaningFeeSnapshot, currencyState, reservation.currencySnapshot)} />
                  <DetailMetric label="Security deposit" value={money(reservation.securityDepositSnapshot, currencyState, reservation.currencySnapshot)} />
                  <DetailMetric label="Subtotal" value={money(reservation.subtotalSnapshot, currencyState, reservation.currencySnapshot)} />
                  <DetailMetric label="Total" value={amount} />
                  <DetailMetric label="Currency" value={reservation.currencySnapshot ?? "USD"} />
                  <DetailMetric label="Price locked at" value={formatDateTime(reservation.priceLockedAt, "No lock timestamp")} />
                  <DetailMetric label="Listing version" value={reservation.listingVersionSnapshot ?? "Not captured"} />
                </div>
              </Section>

              <Section id="payments" title="Payments">
                <div className="grid gap-3">
                  {detail.payments.length ? (
                    detail.payments.map((payment) => (
                      <div key={payment.id} className="rounded-md border p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <LinkedRecordCard
                            type="Payment record"
                            title={`${payment.currency} ${payment.amount.toString()}`}
                            subtitle={payment.providerOrderId ?? payment.method}
                            status={payment.status}
                            href={`/admin/payments?paymentId=${payment.id}`}
                            Icon={CreditCard}
                            meta={`${payment.providerStatus ?? payment.providerEnvironment} - ${paymentSourceLabel(payment.snapshotJson)}`}
                          />
                          <form action={markBookingPaymentRequiresReviewAction} className="grid gap-2 lg:w-72">
                            <input type="hidden" name="paymentId" value={payment.id} />
                            <input type="hidden" name="returnTo" value={returnTo} />
                            <Input name="reason" placeholder="Review reason" />
                            <Button type="submit" variant="outline" disabled={payment.status === "requires_review"}>
                              Mark requires review
                            </Button>
                            {payment.status === "requires_review" ? <p className="text-xs text-muted-foreground">Already marked for review.</p> : null}
                          </form>
                        </div>
                        {payment.events.length ? (
                          <div className="mt-4 border-t pt-3">
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
                          </div>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <EmptyState
                      title="No linked payment records"
                      description="Payment records appear only after a real PayPal order or manual settlement record is created."
                      why="No PaymentRecord row is linked to this reservation."
                      createsRecords="Use PayPal order creation when provider env is configured, or open Payments for manual operational settlement."
                      links={[{ href: "/admin/payments", label: "Open Payments" }]}
                    />
                  )}
                </div>
                <form action={createBookingPayPalOrderAction} className="mt-4 grid gap-3 rounded-md border p-4 md:grid-cols-2">
                  <input type="hidden" name="reservationId" value={reservation.id} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <input type="hidden" name="method" value="paypal_card" />
                  <label>
                    <span className="text-sm font-medium">PayPal intent</span>
                    <select name="intent" defaultValue="CAPTURE" className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option value="CAPTURE">Capture flow</option>
                      <option value="AUTHORIZE">Authorize first</option>
                    </select>
                  </label>
                  <DetailMetric label="Payable snapshot" value={amount} detail={`Provider: ${detail.provider.status.replaceAll("_", " ")}`} />
                  <Button type="submit" className="md:col-span-2" disabled={Boolean(createPaymentDisabledReason)}>
                    Create PayPal order from locked snapshot
                  </Button>
                  {createPaymentDisabledReason ? <p className="md:col-span-2 text-xs text-muted-foreground">{createPaymentDisabledReason}</p> : null}
                </form>
              </Section>

              <Section id="handover" title="Handover">
                <div className="grid gap-3">
                  {detail.handovers.length ? (
                    detail.handovers.map((task) => (
                      <div key={task.id} className="rounded-md border p-4">
                        <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
                          <LinkedRecordCard
                            type="Handover task"
                            title={`${task.taskNumber}: ${task.title}`}
                            subtitle={formatDateTime(task.scheduledFor, "Not scheduled")}
                            status={task.status}
                            href={`/admin/handover?taskId=${task.id}`}
                            Icon={KeyRound}
                            meta={`Priority: ${task.priority}`}
                          />
                          <form action={updateBookingHandoverStatusAction} className="grid gap-2">
                            <input type="hidden" name="taskId" value={task.id} />
                            <input type="hidden" name="returnTo" value={returnTo} />
                            <select name="status" defaultValue={task.status} className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
                              <option value="not_scheduled">Not scheduled</option>
                              <option value="pending_preparation">Pending preparation</option>
                              <option value="ready">Ready</option>
                              <option value="in_progress">In progress</option>
                              <option value="completed">Completed</option>
                              <option value="issue_reported">Issue reported</option>
                              <option value="cancelled">Cancelled</option>
                            </select>
                            <Input name="message" placeholder="Status update note" />
                            <Button type="submit" variant="outline">Update handover status</Button>
                          </form>
                        </div>
                        {task.checklist ? (
                          <pre className="mt-3 max-h-32 overflow-auto rounded-md bg-muted p-3 text-xs text-muted-foreground">
                            {JSON.stringify(task.checklist, null, 2)}
                          </pre>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <EmptyState
                      title="No handover task linked"
                      description="Upcoming stays should have a field-ops task before arrival."
                      why="No HandoverTask row is linked to this reservation."
                      createsRecords="Create a task below or bulk-create eligible tasks from the booking queue."
                    />
                  )}
                </div>
                <form action={createBookingHandoverTaskAction} className="mt-4 grid gap-3 rounded-md border p-4 md:grid-cols-2">
                  <input type="hidden" name="reservationId" value={reservation.id} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <select name="type" defaultValue="check_in" className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="check_in">Check in</option>
                    <option value="check_out">Check out</option>
                    <option value="cleaning">Cleaning</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="key_handover">Key handover</option>
                    <option value="guest_support">Guest support</option>
                  </select>
                  <select name="priority" defaultValue={insight.attentionLevel === "critical" ? "urgent" : "medium"} className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                  <Input name="scheduledFor" type="datetime-local" />
                  <Input name="title" defaultValue={`Arrival readiness for ${title}`} />
                  <Textarea name="summary" rows={2} className="md:col-span-2" placeholder="Safe operational summary. Do not store access codes or private entry instructions." />
                  <Textarea name="checklist" rows={3} className="md:col-span-2" defaultValue={"Confirm arrival window\nConfirm property readiness\nConfirm guest support owner"} />
                  <Button type="submit" variant="outline" className="md:col-span-2" disabled={["cancelled", "completed"].includes(reservation.bookingStatus)}>
                    Create handover task
                  </Button>
                </form>
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
                      title="No linked dispute cases"
                      description="No case is currently tied to this booking, payment, property, guest, partner, or handover context."
                      why="No DisputeCase row is linked to this reservation or its payments."
                      createsRecords="Create a dispute only when there is a real operational incident."
                    />
                  )}
                </div>
                <form action={createBookingDisputeAction} className="mt-4 grid gap-3 rounded-md border p-4 md:grid-cols-2">
                  <input type="hidden" name="reservationId" value={reservation.id} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <select name="type" defaultValue="booking_issue" className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="booking_issue">Booking issue</option>
                    <option value="payment_issue">Payment issue</option>
                    <option value="property_issue">Property issue</option>
                    <option value="guest_issue">Guest issue</option>
                    <option value="handover_issue">Handover issue</option>
                    <option value="verification_issue">Verification issue</option>
                    <option value="other">Other</option>
                  </select>
                  <select name="priority" defaultValue={insight.attentionLevel === "critical" ? "urgent" : "medium"} className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                  {hasPayment ? (
                    <select name="paymentRecordId" defaultValue="" className="md:col-span-2 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option value="">No payment link</option>
                      {detail.payments.map((payment) => (
                        <option key={payment.id} value={payment.id}>{payment.currency} {payment.amount.toString()} - {payment.status}</option>
                      ))}
                    </select>
                  ) : null}
                  <Input name="title" placeholder="Case title" className="md:col-span-2" />
                  <Textarea name="summary" placeholder="Case summary" rows={2} className="md:col-span-2" />
                  <Button type="submit" variant="outline" className="md:col-span-2">Create linked dispute</Button>
                </form>
              </Section>

              <Section id="verifications" title="Verifications / Risk">
                <div className="grid gap-3 lg:grid-cols-4">
                  <DetailMetric label="Guest verification" value={guestVerifications[0]?.status ?? "No record"} />
                  <DetailMetric label="Property verification" value={propertyVerifications[0]?.status ?? "No record"} />
                  <DetailMetric label="Payment risk" value={paymentVerifications[0]?.status ?? "No record"} />
                  <DetailMetric label="Operational readiness" value={handoverVerifications[0]?.status ?? "No record"} />
                </div>
                <div className="mt-4 grid gap-3">
                  {detail.verifications.length ? (
                    detail.verifications.map((record) => (
                      <LinkedRecordCard
                        key={record.id}
                        type={`${record.entityType} verification`}
                        title={record.title}
                        subtitle={record.evidenceSummary ?? record.summary ?? record.category.replaceAll("_", " ")}
                        status={record.status}
                        href={`/admin/verifications?verificationId=${record.id}`}
                        Icon={ShieldAlert}
                        meta={record.category.replaceAll("_", " ")}
                      />
                    ))
                  ) : (
                    <EmptyState
                      title="No linked verification records"
                      description="Verification records contain status and evidence summaries only."
                      why="No VerificationRecord rows are linked to this guest, property, payment, or handover task."
                      createsRecords="Create a verification when trust, payment risk, or operational readiness review is needed."
                    />
                  )}
                </div>
                <form action={createBookingVerificationRecordAction} className="mt-4 grid gap-3 rounded-md border p-4 md:grid-cols-2">
                  <input type="hidden" name="reservationId" value={reservation.id} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <select name="entityType" defaultValue="guest" className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="guest">Guest</option>
                    <option value="property">Property</option>
                    <option value="payment">Payment</option>
                    <option value="handover">Handover</option>
                  </select>
                  <Input name="entityId" placeholder="Entity id for payment/handover only" />
                  <select name="category" defaultValue="operational_readiness" className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="identity">Identity</option>
                    <option value="property_quality">Property quality</option>
                    <option value="payment_risk">Payment risk</option>
                    <option value="premium_guest">Premium guest</option>
                    <option value="operational_readiness">Operational readiness</option>
                  </select>
                  <Input name="title" defaultValue={`Reservation risk review ${detail.reference}`} />
                  <Textarea name="summary" rows={2} className="md:col-span-2" placeholder="Operational summary only." />
                  <Textarea name="evidenceSummary" rows={2} className="md:col-span-2" placeholder="Evidence summary only. Do not store passport, ID, or document numbers." />
                  <Button type="submit" variant="outline" className="md:col-span-2">Create verification record</Button>
                </form>
              </Section>

              <Section id="timeline" title="Timeline">
                <Timeline items={detail.timeline} />
              </Section>

              <Section id="actions" title="Actions">
                <div className="grid gap-4 xl:grid-cols-2">
                  <ActionPanel
                    title="Booking lifecycle"
                    description="Status changes are validated and audited. Price snapshots remain immutable."
                  >
                    {["under_review", "confirmed", "cancelled", "completed"].map((status) => {
                      const disabledReason = getBookingStatusTransitionDisabledReason(reservation.bookingStatus, status);
                      return (
                        <form key={status} action={updateBookingStatusAction} className="space-y-2 rounded-md border p-3">
                          <input type="hidden" name="reservationId" value={reservation.id} />
                          <input type="hidden" name="status" value={status} />
                          <input type="hidden" name="returnTo" value={returnTo} />
                          <Textarea name="note" placeholder="Optional internal audit note" rows={2} />
                          <Button
                            type="submit"
                            variant={status === "cancelled" ? "destructive" : "outline"}
                            className="w-full"
                            disabled={Boolean(disabledReason)}
                          >
                            {lifecycleActionLabel(status)}
                          </Button>
                          {disabledReason ? <p className="text-xs text-muted-foreground">{disabledReason}</p> : null}
                        </form>
                      );
                    })}
                  </ActionPanel>
                  <ActionPanel
                    title="Operational controls"
                    description="Linked actions create real payment, handover, dispute, and verification records."
                  >
                    <LinkedRecordCard
                      type="Payment operations"
                      title={createPaymentDisabledReason ? "PayPal order unavailable" : "PayPal order available"}
                      subtitle={createPaymentDisabledReason ?? "Create orders from the Payment tab using the locked snapshot."}
                      status={detail.provider.status}
                      href="#payments"
                      Icon={CreditCard}
                    />
                    <LinkedRecordCard
                      type="Handover operations"
                      title={activeHandover ? "Handover task linked" : "No active handover task"}
                      subtitle={activeHandover ? activeHandover.title : "Create a task from the Handover tab if this stay is upcoming."}
                      status={activeHandover?.status ?? "missing"}
                      href="#handover"
                      Icon={KeyRound}
                    />
                    <LinkedRecordCard
                      type="Trust and risk"
                      title={`${detail.verifications.length} verification record${detail.verifications.length === 1 ? "" : "s"}`}
                      subtitle="Sensitive identity/document values are not stored."
                      status={insight.attentionLevel}
                      href="#verifications"
                      Icon={ShieldAlert}
                    />
                  </ActionPanel>
                </div>
              </Section>
            </div>

            <aside className="space-y-4">
              <div className="rounded-md border bg-background p-4 shadow-sm">
                <h3 className="font-semibold">Operations brief</h3>
                <div className="mt-3 space-y-3">
                  <ReadinessMeter label="Readiness" score={insight.readinessScore} detail={`${detail.payments.length} payments, ${detail.handovers.length} handovers, ${detail.disputes.length} disputes.`} />
                  <LinkedRecordCard
                    type="Next action"
                    title={primaryAction?.label ?? "Monitor"}
                    subtitle={primaryAction?.reason}
                    href={primaryAction?.href}
                    Icon={FileText}
                    status={primaryAction?.severity}
                  />
                  <DetailMetric label="Payment state" value={detail.payments[0]?.status ?? "No payment"} />
                  <DetailMetric label="Handover state" value={activeHandover?.status ?? "No active task"} />
                  <DetailMetric label="Dispute state" value={detail.disputes[0]?.status ?? "No dispute"} />
                </div>
              </div>
              <div className="rounded-md border bg-background p-4 shadow-sm">
                <h3 className="font-semibold">Security controls</h3>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <li className="rounded-md border bg-muted/20 p-2">No card number, CVV, or raw card payload is stored.</li>
                  <li className="rounded-md border bg-muted/20 p-2">No passport, ID number, or raw document storage is accepted.</li>
                  <li className="rounded-md border bg-muted/20 p-2">No door codes, lockbox codes, or private access instructions are stored.</li>
                  <li className="rounded-md border bg-muted/20 p-2">Reservation price snapshots are read-only.</li>
                </ul>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
