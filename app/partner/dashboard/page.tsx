import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createKantaraHome } from "@/app/actions";
import { submitListingForReview } from "@/app/listing-review/actions";
import { PropertyImage } from "@/app/components/PropertyImage";
import { isHostRole, requireUser } from "@/app/lib/auth";
import prisma from "@/app/lib/db";
import {
  getApprovedListingTranslationSummary,
  getPublicListingTitle,
  isListingPubliclyVisible,
} from "@/app/lib/listingContent";
import {
  calculatePartnerReadinessScore,
  formatApplicantType,
  formatPropertyTypes,
  formatRiskLevel,
  getMinimumSubmissionIssues,
  getReadinessGaps,
} from "@/app/lib/partner";
import { getTranslator } from "@/app/lib/i18n";
import { getPropertyTypeLabel } from "@/app/lib/propertyFeatures";
import { resolveHomeImageUrl } from "@/app/lib/propertyImages";
import { getStatusLabel } from "@/app/lib/statusLabels";

type Translator = Awaited<ReturnType<typeof getTranslator>>["t"];

async function getPartnerDashboardData(userId: string) {
  noStore();

  const [application, homes] = await Promise.all([
    prisma.partnerApplication.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.home.findMany({
      where: { userId },
      select: {
        id: true,
        title: true,
        partnerSubmittedTitle: true,
        approvedTitle: true,
        approvedDescription: true,
        approvedNeighborhood: true,
        listingStatus: true,
        contentReviewStatus: true,
        contentNeedsChangesReason: true,
        contentRejectionReason: true,
        submittedForReviewAt: true,
        contentReviewedAt: true,
        city: true,
        propertyType: true,
        price: true,
        photo: true,
        addedCategory: true,
        addedDescription: true,
        addedLoaction: true,
        createdAT: true,
        images: {
          orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
          take: 1,
          select: { url: true, altText: true },
        },
        _count: {
          select: {
            images: true,
            features: true,
          },
        },
      },
      orderBy: { createdAT: "desc" },
    }),
  ]);

  return { application, homes };
}

type PartnerApplicationRecord = NonNullable<
  Awaited<ReturnType<typeof getPartnerDashboardData>>["application"]
>;

function isListingComplete(home: {
  addedCategory: boolean;
  addedDescription: boolean;
  addedLoaction: boolean;
}) {
  return home.addedCategory && home.addedDescription && home.addedLoaction;
}

function hasText(value?: string | null) {
  return Boolean(value?.trim());
}

function MetricCard({
  title,
  value,
  description,
}: {
  title: string;
  value: string | number;
  description: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function ReadinessCard({
  application,
  t,
}: {
  application: PartnerApplicationRecord | null;
  t: Translator;
}) {
  const score = application ? calculatePartnerReadinessScore(application) : 0;
  const gaps = application ? getReadinessGaps(application) : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">
          {t("partner", "readiness.title", "Partner readiness")}
        </CardTitle>
        <CardDescription>
          {t(
            "partner",
            "readiness.description",
            "Calculated from completed onboarding and compliance fields."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex items-end justify-between">
            <p className="text-sm text-muted-foreground">
              {t("partner", "readiness.score", "Readiness score")}
            </p>
            <p className="text-2xl font-semibold">{score}/100</p>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${score}%` }} />
          </div>
        </div>
        {gaps.length > 0 ? (
          <ul className="space-y-2 text-sm text-muted-foreground">
            {gaps.slice(0, 4).map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t(
              "partner",
              "readiness.complete",
              "Core readiness areas are complete for current partner operations."
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ApplicationSummary({
  application,
  t,
}: {
  application: PartnerApplicationRecord | null;
  t: Translator;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">
          {t("partner", "application.summaryTitle", "Application status")}
        </CardTitle>
        <CardDescription>
          {t(
            "partner",
            "application.summaryDescription",
            "Latest partner application linked to this account."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 sm:grid-cols-2">
        <div>
          <p className="text-sm text-muted-foreground">
            {t("partner", "application.status", "Status")}
          </p>
          <p className="mt-1 font-medium">
            {application
              ? getStatusLabel(application.status, t)
              : t("partner", "application.noApplication", "No application")}
          </p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">
            {t("partner", "application.applicantType", "Applicant type")}
          </p>
          <p className="mt-1 font-medium">
            {application?.applicantType
              ? formatApplicantType(application.applicantType, t)
              : t("partner", "notProvided", "Not provided")}
          </p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">
            {t("partner", "application.primaryCity", "Primary city")}
          </p>
          <p className="mt-1 font-medium">
            {application?.city ?? t("partner", "notProvided", "Not provided")}
          </p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">
            {t("partner", "application.propertyCount", "Property count")}
          </p>
          <p className="mt-1 font-medium">
            {application?.estimatedPropertyCount ??
              t("partner", "notProvided", "Not provided")}
          </p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">
            {t("partner", "application.riskLevel", "Risk level")}
          </p>
          <p className="mt-1 font-medium">
            {formatRiskLevel(application?.internalRiskLevel, t) ||
              t("partner", "notProvided", "Not provided")}
          </p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">
            {t("partner", "application.propertyTypes", "Property types")}
          </p>
          <p className="mt-1 font-medium">
            {application?.propertyTypes
              ? formatPropertyTypes(application.propertyTypes, t)
              : t("partner", "notProvided", "Not provided")}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function CompliancePanel({
  application,
  t,
}: {
  application: PartnerApplicationRecord | null;
  t: Translator;
}) {
  const items = [
    {
      label: t("partner", "compliance.propertyDocuments", "Property documents"),
      complete: Boolean(application?.hasPropertyDocuments),
    },
    {
      label: t("partner", "compliance.tourismAuthorization", "Tourism authorization"),
      complete: Boolean(application?.hasTourismAuthorization),
    },
    {
      label: t("partner", "compliance.invoices", "Invoices"),
      complete: Boolean(application?.canProvideInvoices),
    },
    {
      label: t("partner", "compliance.ownerAuthorization", "Owner authorization"),
      complete: Boolean(application?.hasExclusiveRights),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">
          {t(
            "partner",
            "compliance.title",
            "Verification and compliance"
          )}
        </CardTitle>
        <CardDescription>
          {t(
            "partner",
            "compliance.description",
            "Operational flags captured during onboarding."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between gap-4 rounded-md border p-3 text-sm"
          >
            <span>{item.label}</span>
            <span
              className={
                item.complete
                  ? "font-medium text-emerald-700"
                  : "font-medium text-muted-foreground"
              }
            >
              {item.complete
                ? t("status", "confirmed", "Confirmed")
                : t("status", "pending", "Pending")}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function OperationsChecklist({
  application,
  t,
}: {
  application: PartnerApplicationRecord | null;
  t: Translator;
}) {
  const checklist = [
    {
      label: t(
        "partner",
        "operationsChecklist.primaryContact",
        "Primary contact and language"
      ),
      complete:
        hasText(application?.primaryContactName) &&
        (hasText(application?.phone) || hasText(application?.whatsapp)) &&
        hasText(application?.preferredLanguage),
    },
    {
      label: t(
        "partner",
        "operationsChecklist.cityCoverage",
        "Operating city coverage"
      ),
      complete: hasText(application?.city) && (application?.operatingCities.length ?? 0) > 0,
    },
    {
      label: t(
        "partner",
        "operationsChecklist.checkIn",
        "Check-in process"
      ),
      complete: hasText(application?.checkInProcess),
    },
    {
      label: t(
        "partner",
        "operationsChecklist.cleaningMaintenance",
        "Cleaning and maintenance"
      ),
      complete:
        hasText(application?.cleaningProcess) &&
        hasText(application?.maintenanceProcess),
    },
    {
      label: t(
        "partner",
        "operationsChecklist.guestSupport",
        "Guest support and emergency contact"
      ),
      complete:
        hasText(application?.guestSupportCapacity) &&
        hasText(application?.emergencyContactName) &&
        hasText(application?.emergencyContactPhone),
    },
    {
      label: t(
        "partner",
        "operationsChecklist.agreements",
        "Managed marketplace agreements"
      ),
      complete:
        Boolean(application?.acceptsPlatformRules) &&
        Boolean(application?.acceptsManagedCommunication) &&
        Boolean(application?.acceptsHandoverPolicy) &&
        Boolean(application?.acceptsCommissionModel),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">
          {t("partner", "operationsChecklist.title", "Operations checklist")}
        </CardTitle>
        <CardDescription>
          {t(
            "partner",
            "operationsChecklist.description",
            "Readiness checks required before mature portfolio operations."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {checklist.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between gap-4 rounded-md border p-3 text-sm"
          >
            <span>{item.label}</span>
            <span
              className={
                item.complete
                  ? "font-medium text-emerald-700"
                  : "font-medium text-muted-foreground"
              }
            >
              {item.complete
                ? t("status", "complete", "Complete")
                : t("status", "open", "Open")}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function statusBadgeClass(status: string) {
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
      return "border-muted bg-muted/40 text-muted-foreground";
  }
}

async function VerifiedDashboard({
  userId,
  application,
  homes,
  t,
}: {
  userId: string;
  application: PartnerApplicationRecord | null;
  homes: Awaited<ReturnType<typeof getPartnerDashboardData>>["homes"];
  t: Translator;
}) {
  const createHomeWithId = createKantaraHome.bind(null, { userId });
  const completeListings = homes.filter(isListingComplete).length;
  const draftListings = homes.length - completeListings;
  const submittedListings = homes.filter((home) =>
    ["submitted", "pending_review", "under_review"].includes(
      home.contentReviewStatus
    )
  ).length;
  const needsChanges = homes.filter(
    (home) => home.contentReviewStatus === "needs_changes"
  ).length;
  const approvedLive = homes.filter(isListingPubliclyVisible).length;
  const missingImages = homes.filter((home) => home._count.images === 0).length;
  const missingFeatures = homes.filter((home) => home._count.features === 0).length;
  const missingPricing = homes.filter((home) => !home.price).length;
  const translationSummary = await getApprovedListingTranslationSummary(homes);
  const actionRequired = homes.filter(
    (home) =>
      home.contentReviewStatus === "needs_changes" ||
      home._count.images === 0 ||
      home._count.features === 0 ||
      !home.price ||
      !home.city ||
      !home.propertyType
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-5 md:grid-cols-3">
        <MetricCard
          title={t("partner", "metric.publishedListings", "Published listing records")}
          value={approvedLive}
          description={t(
            "partner",
            "metric.publishedListings.description",
            "Approved listings currently visible to guests."
          )}
        />
        <MetricCard
          title={t("partner", "metric.underReview", "Under review")}
          value={submittedListings}
          description={t(
            "partner",
            "metric.underReview.description",
            "Listings waiting for Kantara content review."
          )}
        />
        <MetricCard
          title={t("partner", "metric.actionRequired", "Action required")}
          value={needsChanges + missingImages + missingFeatures + missingPricing}
          description={t(
            "partner",
            "metric.actionRequired.description",
            "Change requests or readiness gaps that need partner action."
          )}
        />
        <MetricCard
          title={t("partner", "metric.applicationStatus", "Application status")}
          value={
            application
              ? getStatusLabel(application.status, t)
              : t("partner", "status.host_verified", "Verified partner")
          }
          description={t(
            "partner",
            "metric.applicationStatus.description",
            "Current operations status for this partner account."
          )}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">
                {t("partner", "portfolioHealth", "Portfolio health")}
              </CardTitle>
              <CardDescription>
                {t(
                  "partner",
                  "portfolioHealth.description",
                  "Review readiness, publication state, and operational gaps across your property records."
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                [t("partner", "portfolio.totalProperties", "Total properties"), homes.length],
                [t("status", "draft", "Draft"), draftListings],
                [t("partner", "portfolio.submittedReview", "Submitted/review"), submittedListings],
                [t("status", "needsChanges", "Needs changes"), needsChanges],
                [t("partner", "portfolio.approvedLive", "Approved/live"), approvedLive],
                [t("partner", "portfolio.missingImages", "Missing images"), missingImages],
                [t("partner", "portfolio.missingFeatures", "Missing features"), missingFeatures],
                [t("partner", "portfolio.missingPricing", "Missing pricing"), missingPricing],
              ].map(([label, value]) => (
                <div key={label} className="rounded-md border bg-muted/20 p-3">
                  <p className="text-xs uppercase text-muted-foreground">{label}</p>
                  <p className="mt-1 text-xl font-semibold">{value}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xl">
                {t("partner", "actionCenter", "Action center")}
              </CardTitle>
              <CardDescription>
                {t(
                  "partner",
                  "actionCenter.description",
                  "Listings with review feedback or missing readiness inputs."
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {actionRequired.length > 0 ? (
                actionRequired.slice(0, 5).map((home) => (
                  <div
                    key={home.id}
                    className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium">
                        {home.partnerSubmittedTitle ??
                          home.title ??
                          t("partner", "untitledProperty", "Untitled property")}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {home.contentNeedsChangesReason ??
                          [
                            home._count.images === 0
                              ? t("partner", "issue.missingPhotos", "Missing photos")
                              : null,
                            home._count.features === 0
                              ? t("partner", "portfolio.missingFeatures", "Missing features")
                              : null,
                            !home.price
                              ? t("partner", "issue.missingPrice", "Missing price")
                              : null,
                            !home.city
                              ? t("partner", "issue.missingCity", "Missing city")
                              : null,
                            !home.propertyType
                              ? t("partner", "issue.missingPropertyType", "Missing property type")
                              : null,
                          ]
                            .filter(Boolean)
                            .join(", ")}
                      </p>
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/create/${home.id}/description`}>
                        {t("partner", "respond", "Respond")}
                      </Link>
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t(
                    "partner",
                    "actionCenter.empty",
                    "No immediate partner actions are open."
                  )}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-xl">
                    {t("partner", "propertyPortfolio", "Property portfolio")}
                  </CardTitle>
                  <CardDescription>
                    {t(
                      "partner",
                      "propertyPortfolio.description",
                      "Proposed content is reviewed before public publication."
                    )}
                  </CardDescription>
                </div>
                <div className="flex gap-3">
                  <Button asChild variant="outline">
                    <Link href="/my-homes">
                      {t("navbar", "menu.my_homes", "My homes")}
                    </Link>
                  </Button>
                  <form action={createHomeWithId}>
                    <Button type="submit">
                      {t("partner", "addProperty", "Add property")}
                    </Button>
                  </form>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4">
              {homes.length > 0 ? (
                homes.map((home) => {
                  const imagePath = home.images[0]?.url ?? home.photo;
                  const summary = translationSummary.get(home.id);
                  const publicVisible = isListingPubliclyVisible(home);
                  const propertyLabel =
                    getPropertyTypeLabel(home.propertyType, t) ??
                    home.propertyType?.replaceAll("_", " ") ??
                    t("listing", "property", "Property");

                  return (
                    <article
                      key={home.id}
                      className="grid gap-4 rounded-md border p-3 md:grid-cols-[160px_minmax(0,1fr)]"
                    >
                      <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-muted">
                        {imagePath ? (
                          <PropertyImage
                            src={resolveHomeImageUrl(imagePath)}
                            alt={home.images[0]?.altText ?? home.title ?? t("listing", "property", "Property")}
                            fill
                            className="object-cover"
                            sizes="160px"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                            {t("partner", "noImage", "No image")}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 space-y-3">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <h3 className="font-semibold">
                              {home.partnerSubmittedTitle ??
                                home.title ??
                                t("partner", "untitledProperty", "Untitled property")}
                            </h3>
                            {home.approvedTitle ? (
                              <p className="mt-1 text-sm text-muted-foreground">
                                {t("my_homes", "approved_public", "Approved public")}:{" "}
                                {getPublicListingTitle(home)}
                              </p>
                            ) : null}
                            <p className="mt-1 text-sm text-muted-foreground">
                              {[home.city, propertyLabel].filter(Boolean).join(" - ")}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <span className={`rounded-md border px-2 py-1 text-xs ${statusBadgeClass(home.contentReviewStatus)}`}>
                                {getStatusLabel(home.contentReviewStatus, t)}
                              </span>
                              <span className={`rounded-md border px-2 py-1 text-xs ${statusBadgeClass(home.listingStatus)}`}>
                                {publicVisible
                                  ? t("status", "publicLive", "Public live")
                                  : getStatusLabel(home.listingStatus, t)}
                              </span>
                              <span className="rounded-md border bg-muted/40 px-2 py-1 text-xs">
                                {summary?.label ?? t("my_homes", "english_only", "English only")}
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button asChild variant="outline" size="sm">
                              <Link href={`/create/${home.id}/description`}>
                                {t("partner", "editProposal", "Edit proposal")}
                              </Link>
                            </Button>
                            {["draft", "needs_changes", "submitted"].includes(home.contentReviewStatus) ? (
                              <form action={submitListingForReview.bind(null, home.id)}>
                                <Button type="submit" size="sm" variant="outline">
                                  {t("my_homes", "submit_for_review", "Submit for review")}
                                </Button>
                              </form>
                            ) : null}
                            {publicVisible ? (
                              <Button asChild size="sm">
                                <Link href={`/home/${home.id}`}>
                                  {t("partner", "viewApprovedListing", "View approved listing")}
                                </Link>
                              </Button>
                            ) : null}
                          </div>
                        </div>
                        <div className="grid gap-2 text-sm sm:grid-cols-4">
                          <span>
                            {home.price
                              ? t("partner", "nightlyPriceValue", "{price} nightly").replaceAll(
                                  "{price}",
                                  String(home.price)
                                )
                              : t("partner", "issue.missingPrice", "Missing price")}
                          </span>
                          <span>
                            {t("partner", "imageCount", "{count} images").replaceAll(
                              "{count}",
                              String(home._count.images)
                            )}
                          </span>
                          <span>
                            {t("partner", "featureCount", "{count} features").replaceAll(
                              "{count}",
                              String(home._count.features)
                            )}
                          </span>
                          <span>
                            {t("partner", "translatedPercent", "{percent}% translated").replaceAll(
                              "{percent}",
                              String(summary?.completionPercent ?? 0)
                            )}
                          </span>
                        </div>
                      </div>
                    </article>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t(
                    "partner",
                    "propertyPortfolio.empty",
                    "No property records yet. Add your first property to begin review."
                  )}
                </p>
              )}
            </CardContent>
          </Card>

          <ApplicationSummary application={application} t={t} />
          <CompliancePanel application={application} t={t} />
          <OperationsChecklist application={application} t={t} />
        </div>

        <aside className="space-y-6">
          <ReadinessCard application={application} t={t} />
          {[
            [
              "guidance.photoStandards",
              "Kantara photo standards",
              "Clear room, exterior, bathroom, kitchen, entrance, and view images speed review.",
            ],
            [
              "guidance.descriptionStandards",
              "Description standards",
              "Proposed descriptions should explain access, guest experience, local context, and rules clearly.",
            ],
            [
              "guidance.pricingClarity",
              "Pricing clarity",
              "Nightly price, cleaning fee, deposits, and stay limits should be review-ready before submission.",
            ],
            [
              "guidance.guestPolicyClarity",
              "Guest policy clarity",
              "Feature and rule selections should match what guests can rely on during the stay.",
            ],
            [
              "guidance.platformManagedCommunication",
              "Platform-managed communication",
              "Keep guest communication expectations aligned with Kantara operations.",
            ],
            [
              "guidance.internationalExpectations",
              "International guest expectations",
              "Accurate location, arrival, family, and handover context helps guests book confidently.",
            ],
          ].map(([key, title, copy]) => (
            <Card key={key}>
              <CardHeader>
                <CardTitle className="text-xl">
                  {t("partner", `${key}.title`, title)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {t("partner", `${key}.copy`, copy)}
                </p>
              </CardContent>
            </Card>
          ))}
        </aside>
      </div>
    </div>
  );
}

function PendingDashboard({
  application,
  t,
}: {
  application: PartnerApplicationRecord | null;
  t: Translator;
}) {
  const minimumIssues = application ? getMinimumSubmissionIssues(application) : [];
  const readinessGaps = application ? getReadinessGaps(application) : [];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">
              {application
                ? getStatusLabel(application.status, t)
                : t("partner", "application.pending", "Application pending")}
            </CardTitle>
            <CardDescription>
              {t(
                "partner",
                "pending.lockedDescription",
                "Listing creation is locked until admin approval moves this account to host_verified."
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {application?.status === "needs_information" &&
            application.needsInformationReason ? (
              <div className="rounded-md border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">
                <p className="font-medium">
                  {t(
                    "partner",
                    "pending.adminRequestedInformation",
                    "Admin requested more information"
                  )}
                </p>
                <p className="mt-2">{application.needsInformationReason}</p>
                <Button asChild className="mt-4" variant="outline">
                  <Link href="/partner/apply">
                    {t("partner", "pending.updateApplication", "Update application")}
                  </Link>
                </Button>
              </div>
            ) : null}
            {application?.status === "suspended" ? (
              <div className="rounded-md border bg-muted p-4 text-sm">
                {t(
                  "partner",
                  "pending.suspended",
                  "Partner operations suspended this application. Listing creation and publishing remain locked."
                )}
              </div>
            ) : null}
            <p className="text-sm text-muted-foreground">
              {t(
                "partner",
                "pending.reviewScope",
                "Admin review covers identity, authorization, compliance, operating capacity, risk, and readiness before property publishing."
              )}
            </p>
          </CardContent>
        </Card>

        <ApplicationSummary application={application} t={t} />

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">
              {t("partner", "pending.missingInformation", "Missing information")}
            </CardTitle>
            <CardDescription>
              {t(
                "partner",
                "pending.missingInformationDescription",
                "Open items detected from the latest application."
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {minimumIssues.length > 0 || readinessGaps.length > 0 ? (
              <ul className="space-y-2 text-sm text-muted-foreground">
                {[...minimumIssues.map((issue) =>
                  t("partner", "pending.missingItem", "Missing: {issue}").replaceAll(
                    "{issue}",
                    issue
                  )
                ), ...readinessGaps].map(
                  (item) => (
                    <li key={item}>{item}</li>
                  )
                )}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t(
                  "partner",
                  "pending.noRequiredFieldsMissing",
                  "No required submission fields are currently missing. Operations still needs to approve the application."
                )}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <aside className="space-y-6">
        <ReadinessCard application={application} t={t} />
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">
              {t("partner", "pending.listingAccessLocked", "Listing access locked")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t(
                "partner",
                "pending.listingAccessLockedCopy",
                "My homes and listing creation unlock only after this partner is approved by an admin."
              )}
            </p>
            <Button asChild variant="outline">
              <Link href="/partner/apply">
                {t("partner", "application.summaryTitle", "Application status")}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

export default async function PartnerDashboardPage() {
  const user = await requireUser();

  if (user.role === "guest_basic") redirect("/partner/apply");
  if (!isHostRole(user.role)) redirect("/");

  const [{ application, homes }, translator] = await Promise.all([
    getPartnerDashboardData(user.id),
    getTranslator(),
  ]);
  const t = translator.t;

  return (
    <section className="container mx-auto px-5 lg:px-10 mt-10 mb-12">
      <div className="mb-8 max-w-4xl">
        <p className="text-sm font-medium text-muted-foreground">
          {t(
            "partner",
            "dashboard.eyebrow",
            "Managed Morocco partner operations"
          )}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          {t("partner", "dashboard.title", "Partner dashboard")}
        </h1>
        <p className="mt-3 text-muted-foreground">
          {t(
            "partner",
            "dashboard.copy",
            "Operational readiness, portfolio access, compliance status, and future partner workflows in one place."
          )}
        </p>
      </div>

      {user.role === "host_verified" ? (
        <VerifiedDashboard
          userId={user.id}
          application={application}
          homes={homes}
          t={t}
        />
      ) : (
        <PendingDashboard application={application} t={t} />
      )}
    </section>
  );
}
