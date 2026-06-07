import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  Home,
  LifeBuoy,
  LockKeyhole,
  MapPin,
  ReceiptText,
  ShieldCheck,
  Users,
} from "lucide-react";

import prisma from "@/app/lib/db";
import { getCurrentUser, isAdminRole } from "@/app/lib/auth";
import { getCurrencyDisplayState, formatSnapshotMoney } from "@/app/lib/currency";
import { getPayPalProviderReadiness } from "@/app/lib/paypal";
import { formatDate } from "@/app/lib/marketplaceStatus";
import { CheckoutPaymentClient } from "./CheckoutPaymentClient";

type CheckoutPageProps = {
  params: { reservationId: string };
};

function getNightCount(startDate: Date, endDate: Date, snapshot?: number | null) {
  if (snapshot && snapshot > 0) return snapshot;
  const nights = Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
  return nights > 0 ? nights : 0;
}

function personName(user?: { firstName?: string | null; lastName?: string | null; email?: string | null } | null) {
  if (!user) return "Not linked";
  return `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email || "Not linked";
}

function propertyTitle(reservation: NonNullable<Awaited<ReturnType<typeof getCheckoutReservation>>>) {
  return reservation.listingTitleSnapshot ?? reservation.Home?.approvedTitle ?? reservation.Home?.title ?? "Kantara stay";
}

async function getCheckoutReservation(reservationId: string) {
  noStore();

  return prisma.reservation.findUnique({
    where: { id: reservationId },
    include: {
      User: { select: { id: true, email: true, firstName: true, lastName: true, role: true } },
      Home: {
        select: {
          id: true,
          title: true,
          approvedTitle: true,
          city: true,
          country: true,
          guestCount: true,
          guests: true,
          userId: true,
          listingStatus: true,
          User: { select: { id: true, email: true, firstName: true, lastName: true, role: true } },
        },
      },
    },
  });
}

async function getReservationPayments(reservationId: string) {
  return prisma.paymentRecord.findMany({
    where: { reservationId },
    orderBy: { updatedAt: "desc" },
    take: 8,
    include: { events: { orderBy: { createdAt: "desc" }, take: 4 } },
  });
}

function StateShell({
  title,
  message,
  action,
  tone = "neutral",
}: {
  title: string;
  message: string;
  action?: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-950"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-950"
        : tone === "danger"
          ? "border-red-200 bg-red-50 text-red-950"
          : "border-slate-200 bg-white text-slate-950";

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_42%,#f8fafc_100%)]">
      <div className="mx-auto flex min-h-screen max-w-3xl items-center px-5 py-12">
        <div className={`w-full rounded-lg border p-6 shadow-[0_24px_80px_rgba(15,23,42,0.10)] ${toneClass}`}>
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border bg-white/70">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Kantara secure checkout</p>
              <h1 className="text-2xl font-semibold">{title}</h1>
              <p className="mt-2 text-sm text-muted-foreground">{message}</p>
              {action ? <div className="mt-5">{action}</div> : null}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default async function CheckoutPage({ params }: CheckoutPageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const [reservation, currencyState, provider] = await Promise.all([
    getCheckoutReservation(params.reservationId),
    getCurrencyDisplayState(),
    getPayPalProviderReadiness(),
  ]);

  if (!reservation || (!isAdminRole(user.role) && reservation.userId !== user.id)) {
    return (
      <StateShell
        title="Reservation not found"
        message="We could not find a payable reservation for this checkout session."
        tone="warning"
        action={<Link className="inline-flex min-h-10 items-center rounded-md border bg-white px-3 text-sm font-medium shadow-sm hover:border-foreground/30" href="/reservations">Open reservations</Link>}
      />
    );
  }

  const payments = await getReservationPayments(reservation.id);
  const capturedPayment = payments.find((payment) => payment.status === "captured");
  const reviewPayment = payments.find((payment) => payment.status === "requires_review");
  const failedPayment = payments.find((payment) => payment.status === "failed");
  const activePayment = payments.find((payment) => ["draft", "order_created", "pending_approval", "authorized"].includes(payment.status));
  const latestPayment = capturedPayment ?? reviewPayment ?? failedPayment ?? activePayment ?? payments[0] ?? null;
  const nights = getNightCount(reservation.startDate, reservation.endDate, reservation.totalNightsSnapshot);
  const currency = reservation.currencySnapshot ?? "USD";
  const nightlyPrice = reservation.nightlyPriceSnapshot;
  const subtotal = reservation.subtotalSnapshot ?? (nightlyPrice === null ? null : nightlyPrice * nights);
  const cleaningFee = reservation.cleaningFeeSnapshot;
  const deposit = reservation.securityDepositSnapshot;
  const total = reservation.totalSnapshot ?? (subtotal === null ? null : subtotal + (cleaningFee ?? 0) + (deposit ?? 0));
  const amountLabel = formatSnapshotMoney({ amount: total, snapshotCurrency: currency, state: currencyState });
  const guestCount = reservation.Home?.guestCount ?? (reservation.Home?.guests ? Number(reservation.Home.guests) : null);
  const checkoutState =
    reservation.bookingStatus === "cancelled"
      ? "cancelled"
      : capturedPayment
        ? "already_paid"
        : reviewPayment
          ? "requires_review"
          : failedPayment
            ? "failed"
            : !provider.isConfigured
              ? "not_configured"
              : "ready";
  const environmentBadge = provider.environment === "sandbox" || process.env.NODE_ENV !== "production"
    ? `${provider.displayEnvironment} mode`
    : null;

  if (!total || total <= 0) {
    return (
      <StateShell
        title="Reservation total is unavailable"
        message="This reservation does not have a payable locked price snapshot. Kantara support can review the booking before checkout."
        tone="warning"
        action={<Link className="inline-flex min-h-10 items-center rounded-md border bg-white px-3 text-sm font-medium shadow-sm hover:border-foreground/30" href="/reservations">Back to reservations</Link>}
      />
    );
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_36%,#f8fafc_100%)] text-slate-950">
      <div className="mx-auto max-w-[1320px] px-4 py-5 sm:px-6 lg:px-8">
        <Link href="/reservations" className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950">
          <ArrowLeft className="h-4 w-4" />
          Reservations
        </Link>

        <header className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_20px_70px_rgba(15,23,42,0.08)]">
          <div className="grid gap-0 lg:grid-cols-[1fr_390px]">
            <div className="p-5 sm:p-7">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <Link href="/" className="inline-flex items-center gap-3">
                    <span className="flex h-12 w-12 items-center justify-center rounded-md bg-slate-950 text-lg font-semibold text-white shadow-sm">K</span>
                    <span>
                      <span className="block text-xl font-semibold tracking-normal">Kantara</span>
                      <span className="block text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Marketplace payments</span>
                    </span>
                  </Link>
                  <div className="mt-7 max-w-3xl">
                    <p className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-900">
                      <LockKeyhole className="h-3.5 w-3.5" />
                      Secure checkout
                    </p>
                    <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Complete your Kantara reservation payment</h1>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                      Review the locked reservation snapshot, then approve payment through PayPal hosted checkout. Kantara keeps payment references and operational events; card details stay with PayPal.
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2 text-xs font-semibold">
                  {environmentBadge ? <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-900">{environmentBadge}</span> : null}
                  <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-blue-900">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Provider verified
                  </span>
                </div>
              </div>
            </div>
            <div className="border-t bg-slate-950 p-5 text-white lg:border-l lg:border-t-0 sm:p-7">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Reservation reference</p>
              <p className="mt-2 font-mono text-xl font-semibold">RSV-{reservation.id.slice(0, 8).toUpperCase()}</p>
              <div className="mt-6 grid gap-3">
                <HeaderTrustCue icon={<CreditCard className="h-4 w-4" />} title="Secure payment powered by PayPal" />
                <HeaderTrustCue icon={<LifeBuoy className="h-4 w-4" />} title="Payment support available" />
                <HeaderTrustCue icon={<ReceiptText className="h-4 w-4" />} title="Protected price snapshot" />
              </div>
            </div>
          </div>
        </header>

        <div className="grid gap-6 py-6 lg:grid-cols-[minmax(0,1fr)_420px] xl:gap-7">
          <section className="space-y-5">
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <SectionEyebrow icon={<Home className="h-4 w-4" />} label="Stay summary" />
                  <h2 className="mt-3 text-2xl font-semibold tracking-tight">{propertyTitle(reservation)}</h2>
                  <p className="mt-2 flex items-center gap-2 text-sm text-slate-600">
                    <MapPin className="h-4 w-4" />
                    {[reservation.listingCitySnapshot ?? reservation.Home?.city, reservation.Home?.country].filter(Boolean).join(", ") || "Location pending"}
                  </p>
                </div>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-semibold capitalize text-slate-700">{reservation.bookingStatus.replaceAll("_", " ")}</span>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <CheckoutMetric icon={<CalendarDays className="h-4 w-4" />} label="Check-in" value={formatDate(reservation.startDate)} />
                <CheckoutMetric icon={<CalendarDays className="h-4 w-4" />} label="Check-out" value={formatDate(reservation.endDate)} />
                <CheckoutMetric icon={<Home className="h-4 w-4" />} label="Nights" value={String(nights)} />
                <CheckoutMetric icon={<Users className="h-4 w-4" />} label="Guests" value={guestCount && Number.isFinite(guestCount) ? String(guestCount) : "Not set"} />
                <CheckoutMetric icon={<Users className="h-4 w-4" />} label="Guest" value={personName(reservation.User)} detail={reservation.User?.email} />
                <CheckoutMetric icon={<BadgeCheck className="h-4 w-4" />} label="Partner / host" value={personName(reservation.Home?.User)} detail={reservation.Home?.User?.role} />
                <CheckoutMetric label="Property status" value={reservation.Home?.listingStatus ?? "Not linked"} />
                <CheckoutMetric label="Reservation reference" value={`RSV-${reservation.id.slice(0, 8).toUpperCase()}`} />
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <SectionEyebrow icon={<CircleDollarSign className="h-4 w-4" />} label="Price summary" />
                  <h2 className="mt-3 text-xl font-semibold tracking-tight">Locked amount due</h2>
                  <p className="mt-1 text-sm text-slate-600">The checkout amount is read from the protected reservation snapshot.</p>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-right">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Total due</p>
                  <p className="mt-1 text-2xl font-semibold">{amountLabel}</p>
                </div>
              </div>
              <div className="mt-5 overflow-hidden rounded-md border border-slate-200">
                <PriceLine label="Nightly price" value={formatSnapshotMoney({ amount: nightlyPrice, snapshotCurrency: currency, state: currencyState })} detail={`${nights} night${nights === 1 ? "" : "s"}`} />
                <PriceLine label="Subtotal" value={formatSnapshotMoney({ amount: subtotal, snapshotCurrency: currency, state: currencyState })} />
                <PriceLine label="Cleaning fee" value={formatSnapshotMoney({ amount: cleaningFee, snapshotCurrency: currency, state: currencyState, emptyLabel: "Not included" })} />
                <PriceLine label="Deposit" value={formatSnapshotMoney({ amount: deposit, snapshotCurrency: currency, state: currencyState, emptyLabel: "Not included" })} />
                <PriceLine label="Taxes / fees" value="Captured only if included in the locked reservation snapshot" />
                <PriceLine label="Total due" value={amountLabel} strong />
              </div>
              <p className="mt-4 rounded-md border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-950">
                Checkout reads the protected reservation price snapshot. It does not update listing prices, reservation totals, currency, fees, or deposits.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {[
                { title: "Secure checkout", copy: "Payment approval is handled through PayPal hosted checkout.", icon: ShieldCheck },
                { title: "Payment processed by PayPal", copy: "Kantara stores provider references and operational events only.", icon: CreditCard },
                { title: "No card storage", copy: "Kantara does not store card numbers or CVV.", icon: LockKeyhole },
                { title: "Protected price snapshot", copy: "The reservation total shown here comes from locked booking data.", icon: ReceiptText },
                { title: "Verified marketplace flow", copy: "Checkout records connect back to payment operations and bookings.", icon: BadgeCheck },
                { title: "Support available", copy: "Payment issues can be reviewed by Kantara operations.", icon: LifeBuoy },
              ].map(({ title, copy, icon: Icon }) => (
                <div key={title} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-800">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-medium">{title}</p>
                      <p className="mt-1 text-sm leading-5 text-slate-600">{copy}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <aside className="space-y-5 lg:sticky lg:top-5 lg:self-start">
            <CheckoutPaymentClient
              reservationId={reservation.id}
              initialPaymentRecordId={latestPayment?.id ?? null}
              publicClientId={process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? null}
              providerConfigured={provider.isConfigured}
              providerEnvironment={provider.displayEnvironment}
              amountLabel={amountLabel}
              currency={currency}
              initialState={checkoutState}
              initialCaptureId={capturedPayment?.providerCaptureId ?? null}
            />

            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-blue-200 bg-blue-50 text-blue-800">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-semibold">Payment operations link</h2>
                  <p className="mt-1 text-sm leading-5 text-slate-600">
                    Payment records created here appear in the Kantara payments operations center with source, provider ids, events, and linked booking context.
                  </p>
                </div>
              </div>
              {latestPayment ? (
                <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
                  <p className="font-semibold capitalize">{latestPayment.status.replaceAll("_", " ")}</p>
                  <p className="mt-1 break-words text-slate-600">{latestPayment.providerOrderId ?? latestPayment.method}</p>
                </div>
              ) : (
                <div className="mt-4 rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-600">
                  No payment record exists yet. PayPal checkout will create one through the secure server route.
                </div>
              )}
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-800">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-semibold">After payment</h2>
                  <p className="mt-1 text-sm leading-5 text-slate-600">
                    After capture, your reservation payment status updates for Kantara operations. The next step is booking confirmation and handover preparation where applicable.
                  </p>
                </div>
              </div>
              <Link href="/reservations" className="mt-4 inline-flex min-h-10 items-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium shadow-sm hover:border-slate-400">
                Back to reservations
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

function HeaderTrustCue({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/10 text-white">{icon}</span>
      <span className="font-medium text-slate-100">{title}</span>
    </div>
  );
}

function SectionEyebrow({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
      {icon}
      {label}
    </p>
  );
}

function CheckoutMetric({
  icon,
  label,
  value,
  detail,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  detail?: string | null;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/70 p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-1 break-words text-sm font-semibold">{value}</p>
      {detail ? <p className="mt-1 break-words text-xs text-slate-500">{detail}</p> : null}
    </div>
  );
}

function PriceLine({
  label,
  value,
  detail,
  strong,
}: {
  label: string;
  value: string;
  detail?: string;
  strong?: boolean;
}) {
  return (
    <div className={strong ? "flex items-start justify-between gap-4 border-t bg-slate-950 px-4 py-4 text-white" : "flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-3 last:border-b-0"}>
      <div>
        <p className={strong ? "font-semibold" : "text-sm"}>{label}</p>
        {detail ? <p className={strong ? "mt-1 text-xs text-slate-300" : "mt-1 text-xs text-slate-500"}>{detail}</p> : null}
      </div>
      <p className={strong ? "text-right text-lg font-semibold" : "max-w-[220px] text-right text-sm font-medium text-slate-700"}>{value}</p>
    </div>
  );
}
