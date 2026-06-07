import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  Eye,
  ImageIcon,
  Languages,
  ShieldCheck,
} from "lucide-react";

import { requireAdmin } from "@/app/lib/auth";
import prisma from "@/app/lib/db";
import {
  APPROVED_LISTING_TRANSLATION_LANGUAGES,
  HOME_TRANSLATABLE_FIELDS,
  approvedListingFieldHash,
  approvedListingFieldLabel,
  approvedListingFieldSource,
  buildApprovedListingTranslationKey,
  getApprovedListingTranslationSummary,
  getPublicListingTitle,
  isListingPubliclyVisible,
  listingApprovalReadiness,
} from "@/app/lib/listingContent";
import { ENTITY_TRANSLATION_NAMESPACE } from "@/app/lib/translationMemory";
import { getTranslator } from "@/app/lib/i18n";
import { getLanguageMeta } from "@/app/lib/globalization";
import { getPropertyTypeLabel } from "@/app/lib/propertyFeatures";
import { resolveHomeImageUrl } from "@/app/lib/propertyImages";
import { getStatusLabel } from "@/app/lib/statusLabels";
import { PropertyImage } from "@/app/components/PropertyImage";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  approveListingForPublic,
  markListingUnderReview,
  rejectListing,
  requestListingChanges,
  restoreListingToReview,
  saveApprovedListingContent,
  saveApprovedListingTranslations,
  suspendListing,
} from "@/app/listing-review/actions";

type SearchParams = {
  homeId?: string | string[];
  status?: string | string[];
  city?: string | string[];
  propertyType?: string | string[];
  q?: string | string[];
  issue?: string | string[];
  notice?: string | string[];
  error?: string | string[];
};

function readParam(searchParams: SearchParams | undefined, key: keyof SearchParams) {
  const value = searchParams?.[key];
  return Array.isArray(value) ? value[0] : value;
}

function statusClass(status?: string | null) {
  switch (status) {
    case "approved":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "pending_review":
    case "submitted":
    case "under_review":
      return "border-blue-200 bg-blue-50 text-blue-800";
    case "needs_changes":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "rejected":
    case "suspended":
      return "border-red-200 bg-red-50 text-red-800";
    case "archived":
      return "border-slate-200 bg-slate-50 text-slate-700";
    default:
      return "border-muted bg-muted/50 text-muted-foreground";
  }
}

function formatDate(value?: Date | null, fallback = "Not set") {
  if (!value) return fallback;
  return value.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

async function getTrustData(searchParams?: SearchParams) {
  noStore();

  const status = readParam(searchParams, "status");
  const city = readParam(searchParams, "city");
  const propertyType = readParam(searchParams, "propertyType");
  const q = readParam(searchParams, "q");
  const issue = readParam(searchParams, "issue");
  const where = {
    ...(status ? { contentReviewStatus: status } : {}),
    ...(city ? { city: { contains: city, mode: "insensitive" as const } } : {}),
    ...(propertyType ? { propertyType } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" as const } },
            {
              partnerSubmittedTitle: {
                contains: q,
                mode: "insensitive" as const,
              },
            },
            { approvedTitle: { contains: q, mode: "insensitive" as const } },
            { User: { email: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const homes = await prisma.home.findMany({
    where,
    orderBy: [{ submittedForReviewAt: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      userId: true,
      title: true,
      description: true,
      neighborhood: true,
      partnerSubmittedTitle: true,
      partnerSubmittedDescription: true,
      partnerSubmittedNeighborhood: true,
      approvedTitle: true,
      approvedDescription: true,
      approvedNeighborhood: true,
      contentReviewStatus: true,
      listingStatus: true,
      contentReviewNotes: true,
      contentNeedsChangesReason: true,
      contentRejectionReason: true,
      submittedForReviewAt: true,
      contentReviewedAt: true,
      approvedContentVersion: true,
      lastApprovedContentChangedAt: true,
      city: true,
      propertyType: true,
      price: true,
      photo: true,
      archivedAt: true,
      deletedAt: true,
      createdAT: true,
      updatedAt: true,
      User: {
        select: {
          email: true,
          firstName: true,
          lastName: true,
          role: true,
        },
      },
      images: {
        orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
        take: 8,
        select: { id: true, url: true, altText: true, isCover: true },
      },
      features: {
        orderBy: [{ group: "asc" }, { label: "asc" }],
        select: { id: true, group: true, key: true, label: true },
      },
      auditEvents: {
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          eventType: true,
          message: true,
          metadata: true,
          createdAt: true,
        },
      },
      _count: {
        select: {
          images: true,
          features: true,
          Reservation: true,
          reviews: true,
        },
      },
    },
  });
  const translationSummary = await getApprovedListingTranslationSummary(homes);
  const filteredHomes = homes.filter((home) => {
    const summary = translationSummary.get(home.id);
    if (issue === "missing_approved_content") {
      return !home.approvedTitle || !home.approvedDescription;
    }
    if (issue === "missing_translations") {
      return (summary?.missingLanguages.length ?? 0) > 0;
    }
    if (issue === "stale_translations") {
      return (summary?.staleLanguages.length ?? 0) > 0;
    }
    if (issue === "missing_images") return home._count.images === 0;
    if (issue === "missing_price") return !home.price;
    if (issue === "needs_admin_action") {
      return ["pending_review", "submitted", "under_review"].includes(
        home.contentReviewStatus
      );
    }
    if (issue === "approved_public") return isListingPubliclyVisible(home);
    return true;
  });
  const selectedId = readParam(searchParams, "homeId") ?? filteredHomes[0]?.id;
  const selectedHome =
    filteredHomes.find((home) => home.id === selectedId) ?? filteredHomes[0] ?? null;
  const translationRows = selectedHome
    ? await prisma.translationEntry.findMany({
        where: {
          namespace: ENTITY_TRANSLATION_NAMESPACE,
          entityType: "home",
          entityId: selectedHome.id,
          language: { in: APPROVED_LISTING_TRANSLATION_LANGUAGES },
        },
      })
    : [];

  return {
    homes: filteredHomes,
    selectedHome,
    translationRows,
    translationSummary,
  };
}

function OverviewCard({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-md border bg-background p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function TranslationMatrix({
  home,
  rows,
  t,
}: {
  home: NonNullable<Awaited<ReturnType<typeof getTrustData>>["selectedHome"]>;
  rows: Awaited<ReturnType<typeof getTrustData>>["translationRows"];
  t: Awaited<ReturnType<typeof getTranslator>>["t"];
}) {
  return (
    <form action={saveApprovedListingTranslations} className="space-y-4">
      <input type="hidden" name="homeId" value={home.id} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-3 pr-4 font-medium">
                {t("navbar", "selector.language", "Language")}
              </th>
              {HOME_TRANSLATABLE_FIELDS.map((fieldName) => (
                <th key={fieldName} className="py-3 pr-4 font-medium">
                  {approvedListingFieldLabel(fieldName)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {APPROVED_LISTING_TRANSLATION_LANGUAGES.map((language) => (
              <tr key={language} className="border-b align-top last:border-0">
                <td className="py-3 pr-4 font-medium">
                  {getLanguageMeta(language).flag}{" "}
                  {getLanguageMeta(language).nativeLabel}
                </td>
                {HOME_TRANSLATABLE_FIELDS.map((fieldName) => {
                  const key = buildApprovedListingTranslationKey(home.id, fieldName);
                  const sourceHash = approvedListingFieldHash(home, fieldName);
                  const row = rows.find(
                    (item) => item.language === language && item.key === key
                  );
                  const stale =
                    row?.translatedText &&
                    (row.sourceHash !== sourceHash || row.status === "stale");

                  return (
                    <td key={fieldName} className="min-w-[260px] py-3 pr-4">
                      <Textarea
                        name={`${language}_${fieldName}`}
                        defaultValue={row?.translatedText ?? ""}
                        placeholder={
                          approvedListingFieldSource(home, fieldName)
                            ? t(
                                "propertyTrust",
                                "pasteFieldTranslation",
                                "Paste {field} translation"
                              ).replaceAll(
                                "{field}",
                                approvedListingFieldLabel(fieldName).toLowerCase()
                              )
                            : t(
                                "propertyTrust",
                                "noApprovedEnglishSource",
                                "No approved English source"
                              )
                        }
                        className="min-h-24"
                      />
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <span className={`rounded-md border px-2 py-1 ${statusClass(row?.status)}`}>
                          {getStatusLabel(row?.status ?? "missing", t)}
                        </span>
                        {stale ? (
                          <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-amber-900">
                            {t("propertyTrust", "staleSource", "stale source")}
                          </span>
                        ) : null}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button type="submit" className="gap-2">
        <Languages className="h-4 w-4" />
        {t(
          "propertyTrust",
          "saveTranslationsHumanReviewed",
          "Save translations as human reviewed"
        )}
      </Button>
    </form>
  );
}

export default async function PropertyTrustPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  await requireAdmin();
  noStore();

  const notice = readParam(searchParams, "notice");
  const error = readParam(searchParams, "error");
  const [{ homes, selectedHome, translationRows, translationSummary }, translator] =
    await Promise.all([getTrustData(searchParams), getTranslator()]);
  const t = translator.t;
  const counts = {
    total: homes.length,
    draft: homes.filter((home) => home.contentReviewStatus === "draft").length,
    submitted: homes.filter((home) =>
      ["submitted", "pending_review"].includes(home.contentReviewStatus)
    ).length,
    underReview: homes.filter((home) => home.contentReviewStatus === "under_review")
      .length,
    needsChanges: homes.filter((home) => home.contentReviewStatus === "needs_changes")
      .length,
    approved: homes.filter((home) => home.contentReviewStatus === "approved").length,
    rejected: homes.filter((home) => home.contentReviewStatus === "rejected").length,
    suspended: homes.filter((home) => home.contentReviewStatus === "suspended").length,
    archived: homes.filter((home) => home.contentReviewStatus === "archived").length,
    missingApproved: homes.filter((home) => !home.approvedTitle || !home.approvedDescription)
      .length,
    missingImages: homes.filter((home) => home._count.images === 0).length,
    missingPrice: homes.filter((home) => !home.price).length,
    missingFeatures: homes.filter((home) => home._count.features === 0).length,
    missingTranslations: homes.filter(
      (home) => (translationSummary.get(home.id)?.missingLanguages.length ?? 0) > 0
    ).length,
    staleTranslations: homes.filter(
      (home) => (translationSummary.get(home.id)?.staleLanguages.length ?? 0) > 0
    ).length,
  };

  return (
    <section className="mb-16 mt-10 w-full max-w-none px-5 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("admin", "command_center", "Kantara Command Center")}
          </Link>
          <p className="mt-5 text-sm font-semibold text-emerald-700">
            {t("propertyTrust", "eyebrow", "Property Trust Center")}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {t(
              "propertyTrust",
              "title",
              "Listing approval and editorial translation control"
            )}
          </h1>
          <p className="mt-3 max-w-3xl text-muted-foreground">
            {t(
              "propertyTrust",
              "description",
              "Review partner submissions, approve public English content, manage per-listing manual translations, and control publication readiness."
            )}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/admin/globalization">
            {t("propertyTrust", "globalization", "Globalization")}
          </Link>
        </Button>
      </div>

      {notice ? (
        <div className="mb-5 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-900">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <OverviewCard label={t("propertyTrust", "totalListings", "Total listings")} value={counts.total} />
        <OverviewCard label={t("status", "draft", "Draft")} value={counts.draft} />
        <OverviewCard label={t("propertyTrust", "submittedPending", "Submitted/pending")} value={counts.submitted} />
        <OverviewCard label={t("status", "underReview", "Under review")} value={counts.underReview} />
        <OverviewCard label={t("status", "needsChanges", "Needs changes")} value={counts.needsChanges} />
        <OverviewCard label={t("status", "approved", "Approved")} value={counts.approved} />
        <OverviewCard label={t("status", "rejected", "Rejected")} value={counts.rejected} />
        <OverviewCard label={t("status", "suspended", "Suspended")} value={counts.suspended} />
        <OverviewCard label={t("status", "archived", "Archived")} value={counts.archived} />
        <OverviewCard label={t("propertyTrust", "missingApprovedEnglish", "Missing approved English")} value={counts.missingApproved} />
        <OverviewCard label={t("propertyTrust", "missingTranslations", "Missing translations")} value={counts.missingTranslations} />
        <OverviewCard label={t("propertyTrust", "staleTranslations", "Stale translations")} value={counts.staleTranslations} />
        <OverviewCard label={t("propertyTrust", "missingImages", "Missing images")} value={counts.missingImages} />
        <OverviewCard label={t("propertyTrust", "missingPriceFeatures", "Missing price/features")} value={`${counts.missingPrice}/${counts.missingFeatures}`} />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t("propertyTrust", "filters", "Filters")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-6" method="GET">
            <Input name="q" placeholder={t("propertyTrust", "searchPlaceholder", "Partner, title, email")} defaultValue={readParam(searchParams, "q") ?? ""} />
            <Input name="city" placeholder={t("propertyTrust", "cityPlaceholder", "City")} defaultValue={readParam(searchParams, "city") ?? ""} />
            <Input name="propertyType" placeholder={t("propertyTrust", "propertyTypePlaceholder", "Property type")} defaultValue={readParam(searchParams, "propertyType") ?? ""} />
            <select
              name="status"
              defaultValue={readParam(searchParams, "status") ?? ""}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">{t("propertyTrust", "allStatuses", "All statuses")}</option>
              {["draft", "submitted", "pending_review", "under_review", "needs_changes", "approved", "rejected", "suspended", "archived"].map((status) => (
                <option key={status} value={status}>{getStatusLabel(status, t)}</option>
              ))}
            </select>
            <select
              name="issue"
              defaultValue={readParam(searchParams, "issue") ?? ""}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">{t("propertyTrust", "allReadinessStates", "All readiness states")}</option>
              <option value="missing_approved_content">{t("propertyTrust", "issue.missingApprovedContent", "Missing approved content")}</option>
              <option value="missing_translations">{t("propertyTrust", "missingTranslations", "Missing translations")}</option>
              <option value="stale_translations">{t("propertyTrust", "staleTranslations", "Stale translations")}</option>
              <option value="missing_images">{t("propertyTrust", "missingImages", "Missing images")}</option>
              <option value="missing_price">{t("propertyTrust", "issue.missingPrice", "Missing price")}</option>
              <option value="approved_public">{t("propertyTrust", "issue.approvedPublicOnly", "Approved/public only")}</option>
              <option value="needs_admin_action">{t("propertyTrust", "issue.needsAdminAction", "Needs admin action")}</option>
            </select>
            <Button type="submit" variant="outline">
              {t("propertyTrust", "apply", "Apply")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(520px,1.08fr)]">
        <div className="space-y-4">
          {homes.length > 0 ? (
            homes.map((home) => {
              const imagePath = home.images[0]?.url ?? home.photo;
              const partnerName =
                [home.User?.firstName, home.User?.lastName].filter(Boolean).join(" ") ||
                home.User?.email ||
                "Unknown partner";
              const summary = translationSummary.get(home.id);
              const propertyType = getPropertyTypeLabel(home.propertyType, t) ??
                home.propertyType?.replaceAll("_", " ") ??
                t("listing", "property", "Property");

              return (
                <Link
                  key={home.id}
                  href={`/admin/property-trust?homeId=${home.id}`}
                  className="block"
                >
                  <article className={`grid gap-4 rounded-md border p-3 transition hover:border-foreground/40 ${selectedHome?.id === home.id ? "border-foreground/50" : ""} md:grid-cols-[150px_minmax(0,1fr)]`}>
                    <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-muted">
                      {imagePath ? (
                        <PropertyImage
                          src={resolveHomeImageUrl(imagePath)}
                          alt={home.images[0]?.altText ?? home.title ?? t("listing", "property", "Property")}
                          fill
                          className="object-cover"
                          sizes="150px"
                        />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                          <ImageIcon className="h-7 w-7" />
                          <span className="mt-2 text-xs">
                            {t("partner", "noImage", "No image")}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap gap-2">
                        <span className={`rounded-md border px-2 py-1 text-xs ${statusClass(home.contentReviewStatus)}`}>
                          {getStatusLabel(home.contentReviewStatus, t)}
                        </span>
                        <span className={`rounded-md border px-2 py-1 text-xs ${statusClass(home.listingStatus)}`}>
                          {getStatusLabel(home.listingStatus, t)}
                        </span>
                        <span className="rounded-md border bg-muted/40 px-2 py-1 text-xs">
                          {t("partner", "translatedPercent", "{percent}% translated").replaceAll(
                            "{percent}",
                            String(summary?.completionPercent ?? 0)
                          )}
                        </span>
                      </div>
                      <h2 className="mt-3 truncate text-lg font-semibold">
                        {home.partnerSubmittedTitle ??
                          home.title ??
                          t("propertyTrust", "untitledSubmission", "Untitled submission")}
                      </h2>
                      {home.approvedTitle ? (
                        <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                          {t("status", "approved", "Approved")}:{" "}
                          {getPublicListingTitle(home)}
                        </p>
                      ) : null}
                      <p className="mt-2 text-sm text-muted-foreground">
                        {partnerName} · {[home.city, propertyType].filter(Boolean).join(" · ")}
                      </p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {t("partner", "imageCount", "{count} images").replaceAll(
                          "{count}",
                          String(home._count.images)
                        )}{" "}
                        ·{" "}
                        {t("partner", "featureCount", "{count} features").replaceAll(
                          "{count}",
                          String(home._count.features)
                        )}{" "}
                        ·{" "}
                        {home.price
                          ? t("partner", "nightlyPriceValue", "{price} nightly").replaceAll(
                              "{price}",
                              String(home.price)
                            )
                          : t("propertyTrust", "issue.missingPrice", "Missing price")}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {t("propertyTrust", "submittedLabel", "Submitted")}{" "}
                        {formatDate(
                          home.submittedForReviewAt,
                          t("common", "not_set", "Not set")
                        )}{" "}
                        · {t("my_homes", "reviewed", "Reviewed")}{" "}
                        {formatDate(
                          home.contentReviewedAt,
                          t("common", "not_set", "Not set")
                        )}
                      </p>
                    </div>
                  </article>
                </Link>
              );
            })
          ) : (
            <Card>
              <CardContent className="p-8 text-sm text-muted-foreground">
                {t(
                  "propertyTrust",
                  "emptyNoListings",
                  "No listings match the current filters."
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {selectedHome ? (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <CardTitle>
                      {t("propertyTrust", "reviewDetail", "Review detail")}
                    </CardTitle>
                    <CardDescription>
                      {selectedHome.User?.email} · v{selectedHome.approvedContentVersion}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <form action={markListingUnderReview.bind(null, selectedHome.id)}>
                      <Button type="submit" variant="outline" size="sm">
                        {t(
                          "propertyTrust",
                          "markUnderReview",
                          "Mark under review"
                        )}
                      </Button>
                    </form>
                    <form action={approveListingForPublic.bind(null, selectedHome.id)}>
                      <Button type="submit" size="sm" className="gap-2">
                        <BadgeCheck className="h-4 w-4" />
                        {t("propertyTrust", "approvePublic", "Approve public")}
                      </Button>
                    </form>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/home/${selectedHome.id}`} className="gap-2">
                        <Eye className="h-4 w-4" />
                        {t("propertyTrust", "viewPage", "View page")}
                      </Link>
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-4">
                  {selectedHome.images.length > 0 ? (
                    selectedHome.images.slice(0, 4).map((image) => (
                      <div
                        key={image.id}
                        className="relative aspect-[4/3] overflow-hidden rounded-md bg-muted"
                      >
                        <PropertyImage
                          src={resolveHomeImageUrl(image.url)}
                          alt={
                            image.altText ??
                            t("propertyTrust", "listingImage", "Listing image")
                          }
                          fill
                          className="object-cover"
                          sizes="200px"
                        />
                      </div>
                    ))
                  ) : (
                    <div className="flex aspect-[4/3] items-center justify-center rounded-md border border-dashed text-muted-foreground sm:col-span-4">
                      {t(
                        "propertyTrust",
                        "noGalleryImages",
                        "No gallery images"
                      )}
                    </div>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-md border bg-muted/20 p-4">
                    <h3 className="font-semibold">
                      {t(
                        "propertyTrust",
                        "partnerSubmission",
                        "Partner submission"
                      )}
                    </h3>
                    <p className="mt-3 text-sm font-medium">
                      {selectedHome.partnerSubmittedTitle ??
                        selectedHome.title ??
                        t("propertyTrust", "noTitle", "No title")}
                    </p>
                    <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
                      {selectedHome.partnerSubmittedDescription ??
                        selectedHome.description ??
                        t("propertyTrust", "noDescription", "No description")}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {selectedHome.partnerSubmittedNeighborhood ??
                        t("propertyTrust", "noNeighborhood", "No neighborhood")}
                    </p>
                  </div>
                  <div className="rounded-md border bg-muted/20 p-4">
                    <h3 className="font-semibold">
                      {t(
                        "propertyTrust",
                        "readinessChecklist",
                        "Readiness checklist"
                      )}
                    </h3>
                    {(() => {
                      const readiness = listingApprovalReadiness(selectedHome);
                      return (
                        <div className="mt-3 space-y-2 text-sm">
                          {readiness.ok ? (
                            <p className="text-emerald-700">
                              {t(
                                "propertyTrust",
                                "approvalBlockersCleared",
                                "Approval blockers cleared."
                              )}
                            </p>
                          ) : (
                            readiness.errors.map((item) => (
                              <p key={item} className="text-red-700">{item}</p>
                            ))
                          )}
                          {readiness.warnings.map((item) => (
                            <p key={item} className="text-amber-800">{item}</p>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  {t(
                    "propertyTrust",
                    "approvedEnglishPublicContent",
                    "Approved English public content"
                  )}
                </CardTitle>
                <CardDescription>
                  {t(
                    "propertyTrust",
                    "approvedEnglishPublicContentDescription",
                    "English is the public source. Changing it marks existing manual translations stale until reviewed."
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form action={saveApprovedListingContent} className="space-y-4">
                  <input type="hidden" name="homeId" value={selectedHome.id} />
                  <div className="space-y-2">
                    <Label>{t("createListing", "approved_title", "Approved title")}</Label>
                    <Input
                      name="approvedTitle"
                      defaultValue={selectedHome.approvedTitle ?? selectedHome.partnerSubmittedTitle ?? selectedHome.title ?? ""}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>
                      {t("createListing", "approved_description", "Approved description")}
                    </Label>
                    <Textarea
                      name="approvedDescription"
                      defaultValue={selectedHome.approvedDescription ?? selectedHome.partnerSubmittedDescription ?? selectedHome.description ?? ""}
                      className="min-h-40"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>
                      {t("createListing", "approved_neighborhood", "Approved neighborhood")}
                    </Label>
                    <Input
                      name="approvedNeighborhood"
                      defaultValue={selectedHome.approvedNeighborhood ?? selectedHome.partnerSubmittedNeighborhood ?? selectedHome.neighborhood ?? ""}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("propertyTrust", "adminNotes", "Admin notes")}</Label>
                    <Textarea
                      name="contentReviewNotes"
                      defaultValue={selectedHome.contentReviewNotes ?? ""}
                      className="min-h-24"
                    />
                  </div>
                  <Button type="submit" className="gap-2">
                    <ShieldCheck className="h-4 w-4" />
                    {t(
                      "propertyTrust",
                      "saveApprovedEnglishContent",
                      "Save approved English content"
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  {t(
                    "propertyTrust",
                    "manualTranslationMatrix",
                    "Manual translation matrix"
                  )}
                </CardTitle>
                <CardDescription>
                  {t(
                    "propertyTrust",
                    "manualTranslationMatrixDescription",
                    "Paste approved title, description, and neighborhood translations. Empty cells leave existing translations as-is."
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TranslationMatrix
                  home={selectedHome}
                  rows={translationRows}
                  t={t}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  {t("propertyTrust", "reviewDecisions", "Review decisions")}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-3">
                <form action={requestListingChanges} className="space-y-3">
                  <input type="hidden" name="homeId" value={selectedHome.id} />
                  <Textarea
                    name="reason"
                    placeholder={t(
                      "propertyTrust",
                      "changeRequestReason",
                      "Change request reason"
                    )}
                    className="min-h-24"
                  />
                  <Button type="submit" variant="outline" className="w-full">
                    {t("propertyTrust", "requestChanges", "Request changes")}
                  </Button>
                </form>
                <form action={rejectListing} className="space-y-3">
                  <input type="hidden" name="homeId" value={selectedHome.id} />
                  <Textarea
                    name="reason"
                    placeholder={t(
                      "propertyTrust",
                      "rejectionReason",
                      "Rejection reason"
                    )}
                    className="min-h-24"
                  />
                  <Button type="submit" variant="outline" className="w-full">
                    {t("propertyTrust", "reject", "Reject")}
                  </Button>
                </form>
                <form action={suspendListing} className="space-y-3">
                  <input type="hidden" name="homeId" value={selectedHome.id} />
                  <Textarea
                    name="reason"
                    placeholder={t(
                      "propertyTrust",
                      "suspensionReason",
                      "Suspension reason"
                    )}
                    className="min-h-24"
                  />
                  <Button type="submit" variant="destructive" className="w-full">
                    {t("propertyTrust", "suspend", "Suspend")}
                  </Button>
                </form>
                <form action={restoreListingToReview.bind(null, selectedHome.id)}>
                  <Button type="submit" variant="outline">
                    {t("propertyTrust", "restoreToReview", "Restore to review")}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  {t("propertyTrust", "auditTimeline", "Audit timeline")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {selectedHome.auditEvents.length > 0 ? (
                  selectedHome.auditEvents.map((event) => (
                    <div key={event.id} className="rounded-md border p-3">
                      <p className="font-medium">{event.eventType}</p>
                      <p className="mt-1 text-muted-foreground">{event.message}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDate(event.createdAt)}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground">
                    {t(
                      "propertyTrust",
                      "noAuditEvents",
                      "No audit events yet."
                    )}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </section>
  );
}
