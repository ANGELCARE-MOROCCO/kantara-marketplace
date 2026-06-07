import { createReservation } from "@/app/actions";
import { HomeMap } from "@/app/components/HomeMap";
import { PropertyImage } from "@/app/components/PropertyImage";
import { SelectCalender } from "@/app/components/SelectCalender";
import { ReservationSubmitButton } from "@/app/components/SubmitButtons";
import prisma from "@/app/lib/db";
import { getCountryByValue } from "@/app/lib/getCountries";
import {
  getPropertyFeatureGroupTitle,
  getPropertyFeatureLabel,
  getPropertyTypeLabel,
  getStayTypeLabel,
  PROPERTY_FEATURE_GROUPS,
} from "@/app/lib/propertyFeatures";
import { buildHomeGallery, type GalleryImage } from "@/app/lib/propertyImages";
import { getCurrentUser, isAdminRole } from "@/app/lib/auth";
import {
  formatPlatformMoney,
  getCurrencyDisplayState,
} from "@/app/lib/currency";
import { getTranslator } from "@/app/lib/i18n";
import { getStatusLabel } from "@/app/lib/statusLabels";
import type { CurrencyDisplayState } from "@/app/lib/globalization";
import {
  approvedListingTranslationTargets,
  getPublicListingDescription,
  getPublicListingNeighborhood,
  getPublicListingTitle,
  isListingPubliclyVisible,
} from "@/app/lib/listingContent";
import {
  buildEntityTranslationKey,
  getEntityTranslationMap,
} from "@/app/lib/translationMemory";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle,
  BadgeCheck,
  BedDouble,
  Building2,
  CalendarCheck,
  CheckCircle2,
  DoorOpen,
  Heart,
  Home,
  ImageIcon,
  MapPin,
  MessageCircle,
  Share2,
  ShieldCheck,
  ShowerHead,
  Star,
  Users,
} from "lucide-react";
import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

type RatingKey =
  | "cleanlinessRating"
  | "accuracyRating"
  | "checkInRating"
  | "communicationRating"
  | "locationRating"
  | "valueRating";

const ratingCategories: { key: RatingKey; label: string }[] = [
  { key: "cleanlinessRating", label: "Cleanliness" },
  { key: "accuracyRating", label: "Accuracy" },
  { key: "checkInRating", label: "Check-in" },
  { key: "communicationRating", label: "Communication" },
  { key: "locationRating", label: "Location" },
  { key: "valueRating", label: "Value" },
];

const ratingCategoryTranslationKeys: Record<RatingKey, string> = {
  cleanlinessRating: "rating.cleanliness",
  accuracyRating: "rating.accuracy",
  checkInRating: "rating.checkIn",
  communicationRating: "rating.communication",
  locationRating: "rating.location",
  valueRating: "rating.value",
};

function formatCount(value?: number | string | null, singular = "", plural = `${singular}s`) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;

  return `${parsed} ${parsed === 1 ? singular : plural}`;
}

function formatMoney(
  value: number | null | undefined,
  currencyState: CurrencyDisplayState,
  emptyLabel = "Price on request"
) {
  if (value === null || value === undefined) return emptyLabel;
  return formatPlatformMoney(value, currencyState);
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

function average(values: (number | null | undefined)[]) {
  const realValues = values.filter(
    (value): value is number => typeof value === "number"
  );
  if (realValues.length === 0) return null;

  return realValues.reduce((sum, value) => sum + value, 0) / realValues.length;
}

function labelOrFallback(value?: string | null, fallback = "Not specified") {
  return value && value.trim().length > 0 ? value : fallback;
}

async function getData(homeId: string) {
  noStore();
  const data = await prisma.home.findUnique({
    where: {
      id: homeId,
    },
    select: {
      id: true,
      userId: true,
      photo: true,
      title: true,
      description: true,
      partnerSubmittedTitle: true,
      partnerSubmittedDescription: true,
      partnerSubmittedNeighborhood: true,
      approvedTitle: true,
      approvedDescription: true,
      approvedNeighborhood: true,
      listingStatus: true,
      contentReviewStatus: true,
      contentNeedsChangesReason: true,
      contentRejectionReason: true,
      archivedAt: true,
      deletedAt: true,
      deletionBlockedReason: true,
      propertyType: true,
      stayType: true,
      city: true,
      neighborhood: true,
      address: true,
      country: true,
      guests: true,
      bedrooms: true,
      beds: true,
      bathrooms: true,
      guestCount: true,
      bedroomCount: true,
      bathroomCount: true,
      price: true,
      cleaningFee: true,
      securityDeposit: true,
      minimumNights: true,
      maximumNights: true,
      checkInTime: true,
      checkOutTime: true,
      platformManagedCommunication: true,
      requiresAdminApproval: true,
      approvedAt: true,
      images: {
        orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
        take: 10,
        select: {
          id: true,
          url: true,
          altText: true,
          sortOrder: true,
          isCover: true,
        },
      },
      features: {
        orderBy: [{ group: "asc" }, { label: "asc" }],
        select: {
          id: true,
          group: true,
          key: true,
          label: true,
        },
      },
      reviews: {
        where: { status: "published" },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          rating: true,
          cleanlinessRating: true,
          accuracyRating: true,
          checkInRating: true,
          communicationRating: true,
          locationRating: true,
          valueRating: true,
          title: true,
          comment: true,
          createdAt: true,
          User: {
            select: {
              firstName: true,
              lastName: true,
              profileImage: true,
            },
          },
        },
      },
      Reservation: {
        where: {
          homeId,
          bookingStatus: { in: ["requested", "reserved", "confirmed"] },
        },
        select: {
          startDate: true,
          endDate: true,
        },
      },
      User: {
        select: {
          firstName: true,
          lastName: true,
          role: true,
        },
      },
    },
  });

  return data;
}

function PhotoTile({
  image,
  title,
  className,
  fallbackTitle,
  fallbackDescription,
}: {
  image?: GalleryImage | null;
  title: string;
  className?: string;
  fallbackTitle: string;
  fallbackDescription: string;
}) {
  return (
    <a
      href="#property-gallery"
      className={`group relative block h-full min-h-52 overflow-hidden rounded-md bg-muted ${className ?? ""}`}
    >
      <PropertyImage
        src={image?.url}
        alt={image?.altText ?? title}
        fill
        className="object-cover transition duration-300 group-hover:scale-[1.02]"
        fallbackTitle={fallbackTitle}
        fallbackDescription={fallbackDescription}
        sizes="(min-width: 1024px) 50vw, 100vw"
      />
    </a>
  );
}

function SmartImageCollage({
  gallery,
  title,
  labels,
}: {
  gallery: GalleryImage[];
  title: string;
  labels: {
    noImagesTitle: string;
    noImagesDescription: string;
    viewAllPhotos: string;
  };
}) {
  if (gallery.length === 0) {
    return (
      <a
        href="#property-gallery"
        className="flex min-h-[420px] flex-col items-center justify-center rounded-md border border-dashed bg-muted/50 p-8 text-center text-muted-foreground"
      >
        <ImageIcon className="mb-4 h-10 w-10" />
        <p className="text-base font-medium text-foreground">
          {labels.noImagesTitle}
        </p>
        <p className="mt-2 max-w-md text-sm">
          {labels.noImagesDescription}
        </p>
      </a>
    );
  }

  if (gallery.length === 1) {
    return (
      <div className="relative min-h-[460px]">
        <PhotoTile
          image={gallery[0]}
          title={title}
          className="min-h-[460px]"
          fallbackTitle={labels.noImagesTitle}
          fallbackDescription={labels.noImagesDescription}
        />
        <GalleryButton label={labels.viewAllPhotos} />
      </div>
    );
  }

  if (gallery.length === 2) {
    return (
      <div className="relative grid min-h-[420px] gap-2 md:grid-cols-2">
        <PhotoTile
          image={gallery[0]}
          title={title}
          className="min-h-[420px]"
          fallbackTitle={labels.noImagesTitle}
          fallbackDescription={labels.noImagesDescription}
        />
        <PhotoTile
          image={gallery[1]}
          title={title}
          className="min-h-[420px]"
          fallbackTitle={labels.noImagesTitle}
          fallbackDescription={labels.noImagesDescription}
        />
        <GalleryButton label={labels.viewAllPhotos} />
      </div>
    );
  }

  return (
    <div className="relative grid min-h-[460px] gap-2 lg:grid-cols-[2fr_1fr]">
      <PhotoTile
        image={gallery[0]}
        title={title}
        className="min-h-[460px]"
        fallbackTitle={labels.noImagesTitle}
        fallbackDescription={labels.noImagesDescription}
      />
      <div className="grid gap-2">
        <PhotoTile
          image={gallery[1]}
          title={title}
          className="min-h-[226px]"
          fallbackTitle={labels.noImagesTitle}
          fallbackDescription={labels.noImagesDescription}
        />
        <PhotoTile
          image={gallery[2]}
          title={title}
          className="min-h-[226px]"
          fallbackTitle={labels.noImagesTitle}
          fallbackDescription={labels.noImagesDescription}
        />
      </div>
      <GalleryButton label={labels.viewAllPhotos} />
    </div>
  );
}

function GalleryButton({ label }: { label: string }) {
  return (
    <Button
      asChild
      variant="secondary"
      className="absolute bottom-4 right-4 gap-2 bg-background/95 shadow-sm"
    >
      <a href="#property-gallery">
        <ImageIcon className="h-4 w-4" />
        {label}
      </a>
    </Button>
  );
}

function QuickFact({
  icon: Icon,
  label,
}: {
  icon: typeof Users;
  label: string;
}) {
  return (
    <div className="flex min-h-20 items-center gap-3 rounded-md border bg-background p-4">
      <Icon className="h-5 w-5 flex-none text-primary" />
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

export default async function HomeRoute({
  params,
}: {
  params: { id: string };
}) {
  const data = await getData(params.id);
  if (!data) redirect("/");

  const [user, currencyState, translator] = await Promise.all([
    getCurrentUser(),
    getCurrencyDisplayState(),
    getTranslator(),
  ]);
  const t = translator.t;
  const isPublicListing = isListingPubliclyVisible(data);
  const isOwner = Boolean(user?.id && user.id === data.userId);
  const isAdmin = isAdminRole(user?.role);
  const canViewPrivateListing = Boolean(user && (isOwner || isAdmin));
  const canEditListing = Boolean(
    user && ((isOwner && user.role === "host_verified") || isAdmin)
  );

  if (!isPublicListing && !canViewPrivateListing) redirect("/");

  const entityTranslations = await getEntityTranslationMap(
    translator.language,
    approvedListingTranslationTargets(data.id, data)
  );
  const displayData = {
    ...data,
    approvedTitle:
      entityTranslations.get(
        buildEntityTranslationKey("home", data.id, "approvedTitle")
      ) ??
      data.approvedTitle,
    approvedDescription:
      entityTranslations.get(
        buildEntityTranslationKey("home", data.id, "approvedDescription")
      ) ?? data.approvedDescription,
    approvedNeighborhood:
      entityTranslations.get(
        buildEntityTranslationKey("home", data.id, "approvedNeighborhood")
      ) ?? data.approvedNeighborhood,
  };

  const country = data.country ? getCountryByValue(data.country) : null;
  const countryLabel =
    country?.label ??
    (data.country === "MA" ? "Morocco" : data.country) ??
    "Morocco";
  const locationParts = [
    getPublicListingNeighborhood(displayData),
    data.city,
    countryLabel,
  ].filter(
    Boolean
  );
  const locationLine =
    locationParts.length > 0 ? locationParts.join(", ") : "Morocco";
  const propertyTypeLabel =
    getPropertyTypeLabel(data.propertyType, t) ??
    data.propertyType?.replaceAll("_", " ") ??
    "Property";
  const stayTypeLabel =
    getStayTypeLabel(data.stayType, t) ??
    data.stayType?.replaceAll("_", " ") ??
    "Stay";
  const title = getPublicListingTitle({
    ...displayData,
    propertyTypeLabel,
  });
  const gallery = buildHomeGallery({
    images: data.images,
    legacyPhoto: data.photo,
    title,
  });
  const reviewCount = data.reviews.length;
  const averageRating = average(data.reviews.map((review) => review.rating));
  const categoryRatings = ratingCategories.map((category) => ({
    ...category,
    label: t("listing", ratingCategoryTranslationKeys[category.key], category.label),
    value: average(data.reviews.map((review) => review[category.key])),
  }));
  const groupedFeatureSections = PROPERTY_FEATURE_GROUPS.map((group) => ({
    ...group,
    title: getPropertyFeatureGroupTitle(group.group, group.title, t),
    selected: data.features
      .filter((feature) => feature.group === group.group)
      .map((feature) => ({
        ...feature,
        label: getPropertyFeatureLabel(feature.key, feature.label, t),
      })),
  })).filter((group) => group.selected.length > 0);
  const hostName = [data.User?.firstName, data.User?.lastName]
    .filter(Boolean)
    .join(" ");
  const hostLabel =
    hostName ||
    (data.approvedAt
      ? t("listing", "verified_marketplace_partner", "Verified marketplace partner")
      : t("listing", "marketplace_partner", "Marketplace partner"));
  const quickFacts = [
    {
      label: formatCount(
        data.guestCount ?? data.guests,
        t("common", "guest", "guest"),
        t("common", "guests_lower", "guests")
      ),
      icon: Users,
    },
    {
      label: formatCount(
        data.bedroomCount ?? data.bedrooms,
        t("common", "bedroom", "bedroom"),
        t("common", "bedrooms_lower", "bedrooms")
      ),
      icon: Home,
    },
    {
      label: formatCount(
        data.beds,
        t("common", "bed", "bed"),
        t("common", "beds", "beds")
      ),
      icon: BedDouble,
    },
    {
      label: formatCount(
        data.bathroomCount ?? data.bathrooms,
        t("common", "bathroom", "bathroom"),
        t("common", "bathrooms_lower", "bathrooms")
      ),
      icon: ShowerHead,
    },
  ].filter(
    (fact): fact is { label: string; icon: typeof Users } => Boolean(fact.label)
  );
  const listingStatusLabel = getStatusLabel(data.listingStatus, t);
  const galleryLabels = {
    noImagesTitle: t(
      "listing",
      "gallery.no_images_title",
      "No images available yet"
    ),
    noImagesDescription: t(
      "listing",
      "gallery.no_images_copy",
      "Photos are pending for this property. The gallery area is reserved so the page remains ready for media review."
    ),
    viewAllPhotos: t(
      "listing",
      "gallery.view_all_photos",
      "View all photos"
    ),
  };

  return (
    <div className="mx-auto mb-16 mt-8 w-full max-w-7xl px-5 lg:px-10">
      <header className="space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <h1 className="max-w-4xl text-3xl font-semibold tracking-tight">
              {title}
            </h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4" />
                {locationLine}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="h-4 w-4" />
                {propertyTypeLabel}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <DoorOpen className="h-4 w-4" />
                {stayTypeLabel}
              </span>
              {reviewCount > 0 ? (
                <span className="inline-flex items-center gap-1.5 text-foreground">
                  <Star className="h-4 w-4 fill-primary text-primary" />
                  {averageRating?.toFixed(1)} · {reviewCount}{" "}
                  {reviewCount === 1
                    ? t("common", "review", "review")
                    : t("common", "reviews", "Reviews").toLowerCase()}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-2">
              <Share2 className="h-4 w-4" />
              {t("listing", "share", "Share")}
            </Button>
            <Button variant="outline" size="sm" className="gap-2">
              <Heart className="h-4 w-4" />
              {t("listing", "save", "Save")}
            </Button>
          </div>
        </div>

        {!isPublicListing ? (
          <div className="flex flex-col gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 text-amber-950 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-none" />
              <div>
                <p className="font-medium">
                  {tTemplate(
                    t,
                    "listing",
                    "internal_not_public",
                    "This listing is {status} and is not publicly available.",
                    { status: listingStatusLabel }
                  )}
                </p>
                <p className="mt-1 text-sm">
                  {t(
                    "listing",
                    "internal_guest_visibility",
                    "You are viewing internal/admin content. Guests see approved public content only."
                  )}
                </p>
                {data.contentNeedsChangesReason ? (
                  <p className="mt-2 text-sm">
                    {t("listing", "change_request", "Change request")}:{" "}
                    {data.contentNeedsChangesReason}
                  </p>
                ) : null}
                {data.contentRejectionReason ? (
                  <p className="mt-2 text-sm">
                    {t("listing", "review_reason", "Review reason")}:{" "}
                    {data.contentRejectionReason}
                  </p>
                ) : null}
                {data.deletionBlockedReason ? (
                  <p className="mt-1 text-sm">{data.deletionBlockedReason}</p>
                ) : null}
              </div>
            </div>
            {canEditListing ? (
              <Button asChild variant="outline" size="sm" className="bg-background">
                <Link href={`/create/${data.id}/description`}>
                  {t("common", "edit", "Edit")}
                </Link>
              </Button>
            ) : null}
          </div>
        ) : null}

        <SmartImageCollage gallery={gallery} title={title} labels={galleryLabels} />
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
        <main className="min-w-0 space-y-10">
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {quickFacts.map((fact) => (
              <QuickFact key={fact.label} icon={fact.icon} label={fact.label} />
            ))}
            <QuickFact icon={Building2} label={propertyTypeLabel} />
            <QuickFact icon={MapPin} label={data.city ?? countryLabel} />
            {data.platformManagedCommunication ? (
              <QuickFact
                icon={BadgeCheck}
                label={t("listing", "platform_managed", "Platform-managed")}
              />
            ) : null}
          </section>

          <Separator />

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold tracking-tight">
              {t("listing", "about", "About this stay")}
            </h2>
            <p className="whitespace-pre-line leading-7 text-muted-foreground">
              {getPublicListingDescription(displayData) ??
                t(
                  "listing",
                  "description_pending",
                  "This property is being prepared for marketplace publication. A full description will be added once the partner completes onboarding."
                )}
            </p>
          </section>

          <Separator />

          <section className="space-y-5">
            <h2 className="text-2xl font-semibold tracking-tight">
              {t("listing", "amenities", "Amenities and features")}
            </h2>
            {groupedFeatureSections.length > 0 ? (
              <div className="space-y-6">
                {groupedFeatureSections.map((group) => (
                  <div key={group.group} className="space-y-3">
                    <h3 className="font-medium">{group.title}</h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {group.selected.map((feature) => (
                        <div
                          key={feature.id}
                          className="flex items-center gap-3 rounded-md border p-3 text-sm"
                        >
                          <CheckCircle2 className="h-4 w-4 flex-none text-primary" />
                          {feature.label}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed bg-muted/40 p-6 text-muted-foreground">
                {t(
                  "listing",
                  "amenities_finalizing",
                  "Amenities are being finalized for this property."
                )}
              </div>
            )}
          </section>

          <Separator />

          <section id="property-gallery" className="space-y-5 scroll-mt-24">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-2xl font-semibold tracking-tight">
                {t("listing", "property_gallery", "Property gallery")}
              </h2>
              <span className="text-sm text-muted-foreground">
                {tTemplate(
                  t,
                  "listing",
                  "gallery.photo_count",
                  "{count} of 10 photos",
                  { count: gallery.length }
                )}
              </span>
            </div>
            {gallery.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {gallery.map((image) => (
                  <div
                    key={image.id}
                    className="relative aspect-[4/3] overflow-hidden rounded-md bg-muted"
                  >
                    <PropertyImage
                      src={image.url}
                      alt={image.altText}
                      fill
                      className="object-cover"
                      sizes="(min-width: 768px) 50vw, 100vw"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <a
                href="#property-gallery"
                className="flex min-h-64 flex-col items-center justify-center rounded-md border border-dashed bg-muted/50 p-6 text-center text-muted-foreground"
              >
                <ImageIcon className="mb-3 h-8 w-8" />
                <p className="font-medium text-foreground">
                  {galleryLabels.noImagesTitle}
                </p>
                <p className="mt-1 text-sm">
                  {t(
                    "listing",
                    "gallery.no_images_short",
                    "Photos are pending partner upload or marketplace review."
                  )}
                </p>
              </a>
            )}
          </section>

          <Separator />

          <section className="space-y-5">
            <h2 className="text-2xl font-semibold tracking-tight">
              {t("listing", "location", "Location")}
            </h2>
            <div className="space-y-2">
              <p className="font-medium">{data.city ?? "Morocco"}</p>
              <p className="text-muted-foreground">
                {[getPublicListingNeighborhood(displayData), data.address, countryLabel]
                  .filter(Boolean)
                  .join(", ") ||
                  t(
                    "listing",
                    "location_pending",
                    "Location details are being finalized. The map falls back to Morocco-level context."
                  )}
              </p>
            </div>
            <HomeMap locationValue={country?.value ?? "MA"} />
          </section>

          <Separator />

          <section className="space-y-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">
                  {t("listing", "reviews", "Reviews")}
                </h2>
                {reviewCount > 0 ? (
                  <p className="text-muted-foreground">
                    {tTemplate(
                      t,
                      "listing",
                      "review.average",
                      "{rating} average rating from {count} {label}.",
                      {
                        rating: averageRating?.toFixed(1) ?? "0",
                        count: reviewCount,
                        label:
                          reviewCount === 1
                            ? t("common", "review", "review")
                            : t("common", "reviews", "Reviews").toLowerCase(),
                      }
                    )}
                  </p>
                ) : null}
              </div>
              {reviewCount > 0 ? (
                <div className="inline-flex items-center gap-2 text-lg font-semibold">
                  <Star className="h-5 w-5 fill-primary text-primary" />
                  {averageRating?.toFixed(1)}
                </div>
              ) : null}
            </div>

            {reviewCount > 0 ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {categoryRatings.map((category) => (
                    <div key={category.key} className="rounded-md border p-4">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{category.label}</span>
                        <span>
                          {category.value ? category.value.toFixed(1) : "N/A"}
                        </span>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{
                            width: `${Math.min(
                              ((category.value ?? 0) / 5) * 100,
                              100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {data.reviews.slice(0, 6).map((review) => {
                    const reviewerName =
                      [review.User?.firstName, review.User?.lastName]
                        .filter(Boolean)
                        .join(" ") ||
                      t("listing", "review.verified_guest", "Verified guest");

                    return (
                      <article key={review.id} className="rounded-md border p-5">
                        <div className="mb-4 flex items-center justify-between gap-4">
                          <div>
                            <p className="font-medium">{reviewerName}</p>
                            <p className="text-sm text-muted-foreground">
                              {review.createdAt.toLocaleDateString("en-US", {
                                month: "long",
                                year: "numeric",
                              })}
                            </p>
                          </div>
                          <span className="inline-flex items-center gap-1 text-sm font-medium">
                            <Star className="h-4 w-4 fill-primary text-primary" />
                            {review.rating}
                          </span>
                        </div>
                        {review.title ? (
                          <h3 className="mb-2 font-medium">{review.title}</h3>
                        ) : null}
                        <p className="line-clamp-5 text-sm leading-6 text-muted-foreground">
                          {review.comment ??
                            t(
                              "listing",
                              "review.no_comment",
                              "No written comment was provided."
                            )}
                        </p>
                      </article>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="rounded-md border border-dashed bg-muted/40 p-6">
                <div className="flex items-start gap-3">
                  <Star className="mt-1 h-5 w-5 text-primary" />
                  <div>
                    <p className="font-medium">
                      {t(
                        "listing",
                        "review.no_reviews_title",
                        "No reviews yet - this property is newly listed or waiting for verified guest feedback."
                      )}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t(
                        "listing",
                        "review.no_reviews_copy",
                        "Review summaries will appear here after published guest reviews are available."
                      )}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </section>

          <Separator />

          <section className="grid gap-5 md:grid-cols-2">
            <div className="rounded-md border p-5">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                  {hostLabel
                    .split(" ")
                    .map((part) => part[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div>
                  <h2 className="font-semibold">
                    {tTemplate(
                      t,
                      "listing",
                      "hosted_by",
                      "Hosted by {host}",
                      { host: hostLabel }
                    )}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {data.approvedAt
                      ? t(
                          "listing",
                          "verified_marketplace_partner",
                          "Verified marketplace partner"
                        )
                      : t(
                          "listing",
                          "marketplace_partner",
                          "Marketplace partner"
                        )}
                  </p>
                </div>
              </div>
              {data.platformManagedCommunication ? (
                <p className="flex items-start gap-2 text-sm text-muted-foreground">
                  <MessageCircle className="mt-0.5 h-4 w-4 flex-none text-primary" />
                  {t(
                    "listing",
                    "host_communication_managed",
                    "Direct host communication is managed by the platform for this listing."
                  )}
                </p>
              ) : null}
            </div>

            <div className="rounded-md border p-5">
              <h2 className="mb-4 font-semibold">
                {t("listing", "safety_policy", "Safety and policy")}
              </h2>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 flex-none text-primary" />
                  {t(
                    "listing",
                    "marketplace_review_required",
                    "Marketplace review is required before final publication where applicable."
                  )}
                </p>
                <p className="flex items-start gap-2">
                  <CalendarCheck className="mt-0.5 h-4 w-4 flex-none text-primary" />
                  {t("listing", "check_in", "Check-in")}{" "}
                  {labelOrFallback(
                    data.checkInTime,
                    t("listing", "time_pending", "time pending")
                  )}{" "}
                  - {t("listing", "check_out", "Check-out")}{" "}
                  {labelOrFallback(
                    data.checkOutTime,
                    t("listing", "time_pending", "time pending")
                  )}
                </p>
                <p>
                  {t("listing", "minimum_stay", "Minimum stay")}:{" "}
                  {data.minimumNights
                    ? `${data.minimumNights} ${t("common", "nights", "nights")}`
                    : t("common", "not_set", "Not set")}
                  . {t("listing", "maximum_stay", "Maximum stay")}:{" "}
                  {data.maximumNights
                    ? `${data.maximumNights} ${t("common", "nights", "nights")}`
                    : t("common", "not_set", "Not set")}
                  .
                </p>
              </div>
            </div>
          </section>
        </main>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          {isPublicListing ? (
            <form action={createReservation} className="rounded-md border p-5 shadow-sm">
              <input type="hidden" name="homeId" value={params.id} />

              <div className="mb-4 flex items-end justify-between gap-4">
                <div>
                  <p className="text-2xl font-semibold">
                    {formatMoney(
                      data.price,
                      currencyState,
                      t("common", "price_on_request", "Price on request")
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("common", "per_night", "per night")}
                  </p>
                </div>
                {reviewCount > 0 ? (
                  <p className="inline-flex items-center gap-1 text-sm">
                    <Star className="h-4 w-4 fill-primary text-primary" />
                    {averageRating?.toFixed(1)}
                  </p>
                ) : null}
              </div>

              <SelectCalender reservation={data.Reservation} />

              {user?.id ? (
                <ReservationSubmitButton
                  label={t(
                    "listing",
                    "make_reservation_signed_in",
                    "Make a Reservation!"
                  )}
                  pendingLabel={t("common", "please_wait", "Please wait")}
                />
              ) : (
                <Button className="w-full" asChild>
                  <Link href="/auth/login">
                    {t("listing", "make_reservation", "Make a reservation")}
                  </Link>
                </Button>
              )}

              <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                {data.cleaningFee ? (
                  <div className="flex justify-between">
                    <span>{t("listing", "cleaning_fee", "Cleaning fee")}</span>
                    <span>
                      {formatMoney(
                        data.cleaningFee,
                        currencyState,
                        t("common", "price_on_request", "Price on request")
                      )}
                    </span>
                  </div>
                ) : null}
                {data.securityDeposit ? (
                  <div className="flex justify-between">
                    <span>
                      {t("listing", "security_deposit", "Security deposit")}
                    </span>
                    <span>
                      {formatMoney(
                        data.securityDeposit,
                        currencyState,
                        t("common", "price_on_request", "Price on request")
                      )}
                    </span>
                  </div>
                ) : null}
                <p>{t("listing", "no_payment", "No payment is collected on this page.")}</p>
              </div>
            </form>
          ) : (
            <div className="rounded-md border border-dashed bg-muted/40 p-5">
              <p className="font-medium">
                {t(
                  "listing",
                  "reservations_unavailable",
                  "Reservations are unavailable."
                )}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {t(
                  "listing",
                  "reservations_unavailable_copy",
                  "This listing must be approved before guests can reserve it."
                )}
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
