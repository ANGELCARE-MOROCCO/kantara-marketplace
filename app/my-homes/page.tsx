import {
  archiveHome,
  deleteHome,
  restoreHome,
} from "../actions";
import { submitListingForReview } from "../listing-review/actions";
import { ConfirmSubmitButton } from "./ConfirmSubmitButton";
import { PropertyImage } from "../components/PropertyImage";
import { isAdminRole, requireUser } from "../lib/auth";
import prisma from "../lib/db";
import { getPropertyTypeLabel } from "../lib/propertyFeatures";
import { resolveHomeImageUrl } from "../lib/propertyImages";
import {
  formatPlatformMoney,
  getCurrencyDisplayState,
} from "../lib/currency";
import { getTranslator } from "../lib/i18n";
import { getStatusLabel } from "../lib/statusLabels";
import {
  getApprovedListingTranslationSummary,
  getPublicListingTitle,
} from "../lib/listingContent";
import type { CurrencyDisplayState } from "../lib/globalization";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  Archive,
  Eye,
  ImageIcon,
  Lock,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

type MyHomesSearchParams = {
  notice?: string;
};

function formatMoney(
  value: number | null | undefined,
  currencyState: CurrencyDisplayState,
  emptyLabel = "Not set"
) {
  if (value === null || value === undefined) return emptyLabel;

  return formatPlatformMoney(value, currencyState, emptyLabel);
}

function formatDate(value?: Date | null, fallback = "Never") {
  if (!value) return fallback;

  return value.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "approved":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "pending_review":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "archived":
      return "border-slate-200 bg-slate-50 text-slate-700";
    case "rejected":
    case "suspended":
      return "border-red-200 bg-red-50 text-red-700";
    default:
      return "border-blue-200 bg-blue-50 text-blue-800";
  }
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

function noticeMessage(
  notice: string | undefined,
  t: (namespace: string, key: string, fallback: string) => string
) {
  switch (notice) {
    case "listing-updated":
      return t("my_homes", "notice.listing_updated", "Listing updated.");
    case "listing-submitted":
      return t(
        "my_homes",
        "notice.listing_submitted",
        "Listing submitted for Kantara review."
      );
    case "listing-archived":
      return t("my_homes", "notice.listing_archived", "Listing archived.");
    case "listing-restored":
      return t(
        "my_homes",
        "notice.listing_restored",
        "Listing restored to pending review."
      );
    case "listing-deleted":
      return t(
        "my_homes",
        "notice.listing_deleted",
        "Listing permanently deleted."
      );
    case "listing-delete-blocked":
      return t(
        "my_homes",
        "notice.listing_delete_blocked",
        "This listing has booking/review history and was archived instead of permanently deleted."
      );
    case "delete-confirmation-required":
      return t(
        "my_homes",
        "notice.delete_confirmation_required",
        "Deletion requires confirmation."
      );
    default:
      return null;
  }
}

async function getData(userId: string, admin: boolean) {
  noStore();

  return prisma.home.findMany({
    where: admin ? {} : { userId },
    select: {
      id: true,
      title: true,
      partnerSubmittedTitle: true,
      approvedTitle: true,
      internalName: true,
      city: true,
      propertyType: true,
      listingStatus: true,
      contentReviewStatus: true,
      contentNeedsChangesReason: true,
      contentRejectionReason: true,
      submittedForReviewAt: true,
      contentReviewedAt: true,
      approvedDescription: true,
      approvedNeighborhood: true,
      listingVersion: true,
      price: true,
      cleaningFee: true,
      securityDeposit: true,
      lastPriceChangedAt: true,
      archivedAt: true,
      deletionBlockedReason: true,
      createdAT: true,
      updatedAt: true,
      photo: true,
      images: {
        orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
        take: 1,
        select: {
          url: true,
          altText: true,
        },
      },
      priceHistory: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          createdAt: true,
          oldPrice: true,
          newPrice: true,
        },
      },
      _count: {
        select: {
          images: true,
          features: true,
          Reservation: true,
          reviews: true,
          priceHistory: true,
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAT: "desc" }],
  });
}

async function LockedPendingState() {
  const { t } = await getTranslator();

  return (
    <section className="container mx-auto mt-10 px-5 lg:px-10">
      <div className="flex min-h-[420px] flex-col items-center justify-center rounded-md border border-dashed p-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <Lock className="h-8 w-8 text-muted-foreground" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">
          {t(
            "my_homes",
            "locked_title",
            "Listing creation locked until partner approval"
          )}
        </h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          {t(
            "my_homes",
            "locked_copy",
            "Your partner application must be approved before you can create or edit marketplace listings."
          )}
        </p>
        <Button asChild className="mt-6">
          <Link href="/partner/dashboard">
            {t(
              "my_homes",
              "view_partner_dashboard",
              "View partner dashboard"
            )}
          </Link>
        </Button>
      </div>
    </section>
  );
}

export default async function MyHomes({
  searchParams,
}: {
  searchParams?: MyHomesSearchParams;
}) {
  const user = await requireUser();

  if (user.role === "guest_basic") redirect("/partner/apply");
  if (user.role === "host_pending") return <LockedPendingState />;
  if (user.role !== "host_verified" && !isAdminRole(user.role)) redirect("/");

  const admin = isAdminRole(user.role);
  const [data, currencyState, translator] = await Promise.all([
    getData(user.id, admin),
    getCurrencyDisplayState(),
    getTranslator(),
  ]);
  const t = translator.t;
  const message = noticeMessage(searchParams?.notice, t);
  const translationSummary = await getApprovedListingTranslationSummary(data);

  return (
    <section className="container mx-auto mb-16 mt-10 px-5 lg:px-10">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {t("my_homes", "title", "Listing management")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t(
              "my_homes",
              "description",
              "Manage listing content, status, history, and operational readiness."
            )}
          </p>
        </div>
        <Button asChild>
          <Link href="/create" className="gap-2">
            <Plus className="h-4 w-4" />
            {t("my_homes", "list_new_property", "List new property")}
          </Link>
        </Button>
      </div>

      {message ? (
        <div className="mt-6 rounded-md border bg-muted/40 px-4 py-3 text-sm">
          {message}
        </div>
      ) : null}

      {data.length === 0 ? (
        <div className="mt-10 flex min-h-[420px] flex-col items-center justify-center rounded-md border border-dashed p-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Archive className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="mt-5 text-2xl font-semibold tracking-tight">
            {t(
              "my_homes",
              "empty_title",
              "No properties yet - start by listing your first approved property."
            )}
          </h2>
          <Button asChild className="mt-6">
            <Link href="/create">
              {t("my_homes", "list_new_property", "List new property")}
            </Link>
          </Button>
        </div>
      ) : (
        <div className="mt-8 grid gap-5">
          {data.map((item) => {
            const title =
              item.partnerSubmittedTitle ??
              item.title ??
              item.internalName ??
              t(
                "my_homes",
                "untitled_property_listing",
                "Untitled property listing"
              );
            const approvedTitle = getPublicListingTitle(item);
            const reviewSummary = translationSummary.get(item.id);
            const propertyTypeLabel =
              getPropertyTypeLabel(item.propertyType, t) ??
              item.propertyType?.replaceAll("_", " ") ??
              t("listing", "property", "Property");
            const imagePath = item.images[0]?.url ?? item.photo;
            const latestPriceChange = item.priceHistory[0];

            return (
              <article
                key={item.id}
                className="grid gap-5 rounded-md border bg-background p-4 md:grid-cols-[220px_minmax(0,1fr)]"
              >
                <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-muted">
                  {imagePath ? (
                    <PropertyImage
                      src={resolveHomeImageUrl(imagePath)}
                      alt={item.images[0]?.altText ?? title}
                      fill
                      className="object-cover"
                      sizes="220px"
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                      <ImageIcon className="h-8 w-8" />
                      <span className="mt-2 text-sm">
                        {t("listing", "gallery.no_images_title", "No images available yet")}
                      </span>
                    </div>
                  )}
                </div>

                <div className="min-w-0 space-y-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-xl font-semibold">
                          {title}
                        </h2>
                        <span
                          className={`rounded-md border px-2 py-1 text-xs font-medium ${statusBadgeClass(
                            item.listingStatus
                          )}`}
                        >
                          {getStatusLabel(item.listingStatus, t)}
                        </span>
                        <span className="rounded-md border bg-muted px-2 py-1 text-xs font-medium">
                          {getStatusLabel(item.contentReviewStatus, t)}
                        </span>
                      </div>
                      {item.approvedTitle ? (
                        <p className="mt-1 text-sm">
                          <span className="text-muted-foreground">
                            {t("my_homes", "approved_public", "Approved public")}:
                          </span>{" "}
                          {approvedTitle}
                        </p>
                      ) : null}
                      <p className="mt-1 text-sm text-muted-foreground">
                        {[item.city, propertyTypeLabel].filter(Boolean).join(" - ")}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/home/${item.id}`} className="gap-2">
                          <Eye className="h-4 w-4" />
                          {t("common", "view", "View")}
                        </Link>
                      </Button>
                      <Button asChild variant="outline" size="sm">
                        <Link
                          href={`/create/${item.id}/description`}
                          className="gap-2"
                        >
                          <Pencil className="h-4 w-4" />
                          {t("common", "edit", "Edit")}
                        </Link>
                      </Button>
                      {["draft", "needs_changes", "submitted"].includes(
                        item.contentReviewStatus
                      ) ? (
                        <form action={submitListingForReview.bind(null, item.id)}>
                          <ConfirmSubmitButton
                            message={`Submit "${title}" for Kantara review?`}
                          >
                            {t("my_homes", "submit_for_review", "Submit for review")}
                          </ConfirmSubmitButton>
                        </form>
                      ) : null}
                      {item.listingStatus === "approved" ? (
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/home/${item.id}`}>
                            {t("my_homes", "view_public_page", "View public page")}
                          </Link>
                        </Button>
                      ) : null}
                      {item.listingStatus === "archived" ? (
                        <form action={restoreHome.bind(null, item.id)}>
                          <ConfirmSubmitButton
                            message={`Restore "${title}" to pending review?`}
                          >
                            <RotateCcw className="mr-2 h-4 w-4" />
                            {t("my_homes", "restore", "Restore")}
                          </ConfirmSubmitButton>
                        </form>
                      ) : (
                        <form action={archiveHome.bind(null, item.id)}>
                          <ConfirmSubmitButton message={`Archive "${title}"?`}>
                            <Archive className="mr-2 h-4 w-4" />
                            {t("my_homes", "archive", "Archive")}
                          </ConfirmSubmitButton>
                        </form>
                      )}
                      <form action={deleteHome.bind(null, item.id)}>
                        <input
                          type="hidden"
                          name="deleteConfirmed"
                          value="true"
                        />
                        <ConfirmSubmitButton
                          variant="destructive"
                          message={`Delete "${title}"? Listings with booking, review, or favorite history will be archived instead.`}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {t("my_homes", "delete", "Delete")}
                        </ConfirmSubmitButton>
                      </form>
                    </div>
                  </div>

                  <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <Metric
                      label={t("my_homes", "nightly_price", "Nightly price")}
                      value={formatMoney(
                        item.price,
                        currencyState,
                        t("common", "not_set", "Not set")
                      )}
                    />
                    <Metric
                      label={t("my_homes", "cleaning_fee", "Cleaning fee")}
                      value={formatMoney(
                        item.cleaningFee,
                        currencyState,
                        t("common", "not_set", "Not set")
                      )}
                    />
                    <Metric
                      label={t(
                        "my_homes",
                        "security_deposit",
                        "Security deposit"
                      )}
                      value={formatMoney(
                        item.securityDeposit,
                        currencyState,
                        t("common", "not_set", "Not set")
                      )}
                    />
                    <Metric
                      label={t("my_homes", "listing_version", "Listing version")}
                      value={`v${item.listingVersion}`}
                    />
                    <Metric
                      label={t(
                        "my_homes",
                        "last_price_change",
                        "Last price change"
                      )}
                      value={formatDate(
                        item.lastPriceChangedAt,
                        t("common", "never", "Never")
                      )}
                    />
                    <Metric
                      label={t("my_homes", "images", "Images")}
                      value={String(item._count.images)}
                    />
                    <Metric
                      label={t("my_homes", "features", "Features")}
                      value={String(item._count.features)}
                    />
                    <Metric
                      label={t("common", "reservations", "Reservations")}
                      value={String(item._count.Reservation)}
                    />
                    <Metric label={t("my_homes", "reviews", "Reviews")} value={String(item._count.reviews)} />
                    <Metric label={t("my_homes", "created", "Created")} value={formatDate(item.createdAT, t("common", "never", "Never"))} />
                    <Metric label={t("my_homes", "updated", "Updated")} value={formatDate(item.updatedAt, t("common", "never", "Never"))} />
                    <Metric
                      label={t("my_homes", "price_history", "Price history")}
                      value={`${item._count.priceHistory} ${
                        item._count.priceHistory === 1
                          ? t("my_homes", "change", "change")
                          : t("my_homes", "changes", "changes")
                      }`}
                    />
                    <Metric
                      label={t("my_homes", "translations", "Translations")}
                      value={
                        reviewSummary
                          ? `${reviewSummary.completionPercent}%`
                          : t("my_homes", "english_only", "English only")
                      }
                    />
                    <Metric
                      label={t("my_homes", "submitted", "Submitted")}
                      value={formatDate(
                        item.submittedForReviewAt,
                        t("common", "never", "Never")
                      )}
                    />
                    <Metric
                      label={t("my_homes", "reviewed", "Reviewed")}
                      value={formatDate(
                        item.contentReviewedAt,
                        t("common", "never", "Never")
                      )}
                    />
                  </div>

                  {reviewSummary ? (
                    <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                      {tTemplate(
                        t,
                        "my_homes",
                        "translation_readiness",
                        "Translation readiness: {label}",
                        { label: reviewSummary.label }
                      )}
                      {reviewSummary.missingLanguages.length > 0
                        ? ` · ${tTemplate(
                            t,
                            "my_homes",
                            "missing_languages",
                            "Missing {languages}",
                            { languages: reviewSummary.missingLanguages.join(", ") }
                          )}`
                        : ""}
                      {reviewSummary.staleLanguages.length > 0
                        ? ` · ${tTemplate(
                            t,
                            "my_homes",
                            "stale_languages",
                            "Stale {languages}",
                            { languages: reviewSummary.staleLanguages.join(", ") }
                          )}`
                        : ""}
                    </p>
                  ) : null}

                  {item.contentNeedsChangesReason ? (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                      <p className="font-medium">
                        {t("my_homes", "action_required", "Action required")}
                      </p>
                      <p className="mt-1">{item.contentNeedsChangesReason}</p>
                    </div>
                  ) : null}
                  {item.contentRejectionReason ? (
                    <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-950">
                      <p className="font-medium">
                        {t("my_homes", "review_decision", "Review decision")}
                      </p>
                      <p className="mt-1">{item.contentRejectionReason}</p>
                    </div>
                  ) : null}

                  {latestPriceChange ? (
                    <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                      {tTemplate(
                        t,
                        "my_homes",
                        "latest_price_history",
                        "Latest price history: {date}, {oldPrice} to {newPrice}",
                        {
                          date: formatDate(
                            latestPriceChange.createdAt,
                            t("common", "never", "Never")
                          ),
                          oldPrice: formatMoney(
                            latestPriceChange.oldPrice,
                            currencyState,
                            t("common", "not_set", "Not set")
                          ),
                          newPrice: formatMoney(
                            latestPriceChange.newPrice,
                            currencyState,
                            t("common", "not_set", "Not set")
                          ),
                        }
                      )}
                    </p>
                  ) : null}

                  {(item.archivedAt || item.deletionBlockedReason) ? (
                    <div className="flex gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                      <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
                      <div>
                        {item.archivedAt ? (
                          <p>
                            {tTemplate(
                              t,
                              "my_homes",
                              "archived_on",
                              "Archived on {date}.",
                              {
                                date: formatDate(
                                  item.archivedAt,
                                  t("common", "never", "Never")
                                ),
                              }
                            )}
                          </p>
                        ) : null}
                        {item.deletionBlockedReason ? (
                          <p>{item.deletionBlockedReason}</p>
                        ) : null}
                      </div>
                    </div>
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}
