import { NoItems } from "../components/NoItem";
import { PropertyImage } from "../components/PropertyImage";
import { getCurrentUser } from "../lib/auth";
import prisma from "../lib/db";
import { getPropertyTypeLabel } from "../lib/propertyFeatures";
import { buildHomeGallery } from "../lib/propertyImages";
import {
  formatSnapshotMoney,
  getCurrencyDisplayState,
} from "../lib/currency";
import { getTranslator } from "../lib/i18n";
import { getStatusLabel } from "../lib/statusLabels";
import { BadgeCheck, CalendarDays, HomeIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import type { ReactNode } from "react";

async function getData(userId: string) {
  noStore();

  return prisma.reservation.findMany({
    where: {
      userId,
    },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      bookingStatus: true,
      nightlyPriceSnapshot: true,
      cleaningFeeSnapshot: true,
      securityDepositSnapshot: true,
      totalNightsSnapshot: true,
      subtotalSnapshot: true,
      totalSnapshot: true,
      currencySnapshot: true,
      listingTitleSnapshot: true,
      listingCitySnapshot: true,
      listingPropertyTypeSnapshot: true,
      listingVersionSnapshot: true,
      priceLockedAt: true,
      Home: {
        select: {
          id: true,
          country: true,
          city: true,
          title: true,
          propertyType: true,
          photo: true,
          price: true,
          cleaningFee: true,
          securityDeposit: true,
          images: {
            orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
            take: 1,
            select: {
              url: true,
              altText: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

function formatDate(value: Date) {
  return value.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getNightCount(startDate: Date, endDate: Date) {
  const nights = Math.ceil(
    (endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)
  );

  return nights > 0 ? nights : 0;
}

function tTemplate(
  t: (namespace: string, key: string, fallback: string) => string,
  namespace: string,
  key: string,
  fallback: string,
  values: Record<string, string | number>
) {
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    t(namespace, key, fallback)
  );
}

export default async function ReservationsRoute() {
  const user = await getCurrentUser();
  if (!user?.id) return redirect("/");

  const [data, currencyState, translator] = await Promise.all([
    getData(user.id),
    getCurrencyDisplayState(),
    getTranslator(),
  ]);
  const t = translator.t;

  return (
    <section className="container mx-auto mt-10 px-5 lg:px-10">
      <h1 className="text-3xl font-semibold tracking-tight">
        {t("reservations", "title", "Your reservations")}
      </h1>

      {data.length === 0 ? (
        <NoItems
          title={t("reservations", "empty_title", "No reservations yet")}
          description={t(
            "reservations",
            "empty_description",
            "Confirmed and requested stays will appear here."
          )}
        />
      ) : (
        <div className="mt-8 grid gap-5">
          {data.map((item) => {
            const home = item.Home;
            const title =
              item.listingTitleSnapshot ??
              home?.title ??
              t("reservations", "reserved_listing", "Reserved listing");
            const city = item.listingCitySnapshot ?? home?.city ?? home?.country;
            const propertyType =
              getPropertyTypeLabel(
                item.listingPropertyTypeSnapshot ?? home?.propertyType,
                t
              ) ??
              item.listingPropertyTypeSnapshot?.replaceAll("_", " ") ??
              home?.propertyType?.replaceAll("_", " ") ??
              t("listing", "property", "Property");
            const hasLockedPrice = item.nightlyPriceSnapshot !== null;
            const currency = item.currencySnapshot ?? "USD";
            const nightlyPrice = item.nightlyPriceSnapshot ?? home?.price ?? null;
            const cleaningFee =
              item.cleaningFeeSnapshot ?? home?.cleaningFee ?? null;
            const securityDeposit =
              item.securityDepositSnapshot ?? home?.securityDeposit ?? null;
            const nights =
              item.totalNightsSnapshot ??
              getNightCount(item.startDate, item.endDate);
            const subtotal =
              item.subtotalSnapshot ??
              (nightlyPrice === null ? null : nightlyPrice * nights);
            const total =
              item.totalSnapshot ??
              (subtotal === null
                ? null
                : subtotal + (cleaningFee ?? 0) + (securityDeposit ?? 0));
            const gallery = buildHomeGallery({
              images: home?.images ?? [],
              legacyPhoto: home?.photo,
              title,
            });
            const image = gallery[0];

            return (
              <article
                key={item.id}
                className="grid gap-5 rounded-md border bg-background p-4 md:grid-cols-[220px_minmax(0,1fr)]"
              >
                <Link
                  href={home ? `/home/${home.id}` : "/reservations"}
                  className="relative aspect-[4/3] overflow-hidden rounded-md bg-muted"
                >
                  <PropertyImage
                    src={image?.url}
                    alt={image?.altText ?? title}
                    fill
                    className="object-cover"
                    fallbackTitle={t(
                      "listing",
                      "fallback.listing_image_unavailable",
                      "Listing image unavailable"
                    )}
                    fallbackDescription={t(
                      "listing",
                      "fallback.listing_media_changed",
                      "The listing media may have changed."
                    )}
                    sizes="220px"
                  />
                </Link>

                <div className="min-w-0 space-y-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h2 className="text-xl font-semibold">{title}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {[city, propertyType].filter(Boolean).join(" - ")}
                      </p>
                    </div>
                    <span className="rounded-md border bg-muted px-2 py-1 text-xs font-medium">
                      {getStatusLabel(item.bookingStatus, t)}
                    </span>
                  </div>

                  <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <ReservationMetric
                      label={t("reservations", "dates", "Dates")}
                      value={`${formatDate(item.startDate)} - ${formatDate(
                        item.endDate
                      )}`}
                      icon={<CalendarDays className="h-4 w-4" />}
                    />
                    <ReservationMetric
                      label={t(
                        "reservations",
                        "nightly_price",
                        "Nightly price"
                      )}
                      value={formatSnapshotMoney({
                        amount: nightlyPrice,
                        snapshotCurrency: currency,
                        state: currencyState,
                      })}
                      icon={<HomeIcon className="h-4 w-4" />}
                    />
                    <ReservationMetric
                      label={t("reservations", "nights", "Nights")}
                      value={String(nights)}
                    />
                    <ReservationMetric
                      label={t("reservations", "subtotal", "Subtotal")}
                      value={formatSnapshotMoney({
                        amount: subtotal,
                        snapshotCurrency: currency,
                        state: currencyState,
                      })}
                    />
                    <ReservationMetric
                      label={t("listing", "cleaning_fee", "Cleaning fee")}
                      value={formatSnapshotMoney({
                        amount: cleaningFee,
                        snapshotCurrency: currency,
                        state: currencyState,
                      })}
                    />
                    <ReservationMetric
                      label={t(
                        "listing",
                        "security_deposit",
                        "Security deposit"
                      )}
                      value={formatSnapshotMoney({
                        amount: securityDeposit,
                        snapshotCurrency: currency,
                        state: currencyState,
                      })}
                    />
                    <ReservationMetric
                      label={t("reservations", "total", "Total")}
                      value={formatSnapshotMoney({
                        amount: total,
                        snapshotCurrency: currency,
                        state: currencyState,
                      })}
                    />
                    <ReservationMetric
                      label={t(
                        "reservations",
                        "listing_version",
                        "Listing version"
                      )}
                      value={
                        item.listingVersionSnapshot
                          ? `v${item.listingVersionSnapshot}`
                          : t("reservations", "legacy", "Legacy")
                      }
                    />
                  </div>

                  {hasLockedPrice ? (
                    <p className="inline-flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                      <BadgeCheck className="h-4 w-4" />
                      {t(
                        "reservations",
                        "locked_snapshot",
                        "Locked price snapshot"
                      )}
                      {item.priceLockedAt
                        ? ` ${tTemplate(
                            t,
                            "reservations",
                            "locked_snapshot_date",
                            "on {date}",
                            { date: formatDate(item.priceLockedAt) }
                          )}`
                        : ""}
                    </p>
                  ) : (
                    <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                      {t(
                        "reservations",
                        "legacy_pricing_fallback",
                        "Legacy reservation: displaying current listing pricing as a fallback."
                      )}
                    </p>
                  )}
                  {total && total > 0 && item.bookingStatus !== "cancelled" ? (
                    <Link
                      href={`/checkout/${item.id}`}
                      className="inline-flex min-h-10 items-center rounded-md border bg-background px-3 text-sm font-medium hover:border-foreground/30"
                    >
                      {t("checkout", "open_secure_checkout", "Open secure checkout")}
                    </Link>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ReservationMetric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <p className="flex items-center gap-1.5 text-xs uppercase text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}
