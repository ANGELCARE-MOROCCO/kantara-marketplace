import type { Metadata } from "next";
import type { LucideIcon } from "lucide-react";
import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import {
  ArrowRight,
  BadgeCheck,
  Briefcase,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Compass,
  DoorOpen,
  FileCheck2,
  Gem,
  Globe2,
  Handshake,
  HeartHandshake,
  Home as HomeIcon,
  Hotel,
  KeyRound,
  Landmark,
  Languages,
  LayoutGrid,
  LockKeyhole,
  Map,
  MapPin,
  MessageSquareText,
  Plane,
  ReceiptText,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  TentTree,
  Users,
  Waves,
} from "lucide-react";

import { addToFavorite, DeleteFromFavorite } from "./actions";
import {
  AddToFavoriteButton,
  DeleteFromFavoriteButton,
} from "./components/SubmitButtons";
import { PropertyImage } from "./components/PropertyImage";
import { getCurrentUser } from "./lib/auth";
import {
  formatPlatformMoney,
  getCurrencyDisplayState,
} from "./lib/currency";
import { getTranslator } from "./lib/i18n";
import prisma from "./lib/db";
import {
  getPropertyTypeLabel,
  getStayTypeLabel,
} from "./lib/propertyFeatures";
import { getStatusLabel } from "./lib/statusLabels";
import {
  getDefaultHomepageSections,
  normalizeHomepageSection,
  normalizeSiteBranding,
  shouldRenderSectionType,
  type HomepageSectionView,
  type SiteBrandingView,
} from "./lib/homepageConfig";
import { resolveHomeImageUrl } from "./lib/propertyImages";
import {
  BRAND_NAME,
  SUPPORTED_CURRENCIES,
  SUPPORTED_LANGUAGES,
  type CurrencyDisplayState,
  type LanguageCode,
} from "./lib/globalization";
import {
  HOMEPAGE_SECTION_TRANSLATABLE_FIELDS,
  buildEntityTranslationKey,
  getEntityTranslationMap,
} from "./lib/translationMemory";
import {
  applyApprovedListingTranslations,
  getPublicListingTitle,
  getPublicListingDescription,
} from "./lib/listingContent";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Kantara | Verified Morocco stays",
  description:
    "Kantara delivers verified Morocco stays with platform-managed communication, local intelligence, and confidence for international guests and partners.",
};

type HomePageSearchParams = {
  filter?: string;
  country?: string;
  city?: string;
  checkIn?: string;
  checkOut?: string;
  guest?: string;
  room?: string;
  bathroom?: string;
  propertyType?: string;
};

type QueryValue = string | number | null | undefined;

const APPROVED_PUBLIC_HOME_WHERE: Prisma.HomeWhereInput = {
  listingStatus: "approved",
  archivedAt: null,
  deletedAt: null,
  contentReviewStatus: { notIn: ["rejected", "suspended", "archived"] },
  OR: [
    { approvedTitle: { not: null } },
    { approvedDescription: { not: null } },
    { title: { not: null } },
    { description: { not: null } },
    { contentReviewStatus: "approved" },
  ],
  addedCategory: true,
  addedLoaction: true,
  addedDescription: true,
};

const destinationCards = [
  {
    key: "marrakech",
    city: "Marrakech",
    positioning: "Riads, villas, medina stays, and high-touch luxury escapes.",
    tags: ["Medina", "Private pools", "Design stays"],
    styles: "Riads, villas, dar homes",
    accent:
      "from-[#2b1711] via-[#7f1d1d] to-[#d97706] text-white border-white/15",
    layout: "lg:col-span-2 lg:row-span-2",
  },
  {
    key: "casablanca",
    city: "Casablanca",
    positioning: "Business stays, serviced apartments, and city access.",
    tags: ["Business", "Apartments", "Urban access"],
    styles: "Serviced apartments, studios",
    accent:
      "from-[#0f172a] via-[#075985] to-[#0f766e] text-white border-white/15",
    layout: "",
  },
  {
    key: "rabat",
    city: "Rabat",
    positioning: "Calm capital stays for families, diplomats, and remote work.",
    tags: ["Families", "Work-ready", "Capital calm"],
    styles: "Apartments, villas, guesthouses",
    accent:
      "from-[#123c2f] via-[#166534] to-[#a16207] text-white border-white/15",
    layout: "",
  },
  {
    key: "agadir",
    city: "Agadir",
    positioning: "Beach stays, family escapes, and surf-friendly properties.",
    tags: ["Beach", "Family", "Surf"],
    styles: "Beach houses, resorts, apartments",
    accent:
      "from-[#082f49] via-[#0369a1] to-[#0f766e] text-white border-white/15",
    layout: "md:col-span-2 lg:col-span-1",
  },
  {
    key: "tangier",
    city: "Tangier",
    positioning: "Northern gateway stays with sea views and old-city access.",
    tags: ["Sea views", "Gateway city", "Culture"],
    styles: "Apartments, riads, guesthouses",
    accent:
      "from-[#1f2937] via-[#155e75] to-[#065f46] text-white border-white/15",
    layout: "",
  },
  {
    key: "fes",
    city: "Fes",
    positioning: "Heritage riads, traditional houses, and deep medina stays.",
    tags: ["Heritage", "Medina", "Traditional"],
    styles: "Riads, dars, guesthouses",
    accent:
      "from-[#1c1917] via-[#854d0e] to-[#991b1b] text-white border-white/15",
    layout: "",
  },
  {
    key: "essaouira",
    city: "Essaouira",
    positioning: "Wind, art, surf, and relaxed coastal homes.",
    tags: ["Coastal", "Surf", "Creative stays"],
    styles: "Surf houses, riads, apartments",
    accent:
      "from-[#164e63] via-[#0284c7] to-[#115e59] text-white border-white/15",
    layout: "",
  },
  {
    key: "chefchaouen",
    city: "Chefchaouen",
    positioning: "Mountain calm, slow travel, and distinctive blue-city stays.",
    tags: ["Mountain", "Slow travel", "Views"],
    styles: "Guesthouses, mountain lodges",
    accent:
      "from-[#172554] via-[#1d4ed8] to-[#0891b2] text-white border-white/15",
    layout: "",
  },
  {
    key: "dakhla",
    city: "Dakhla",
    positioning: "Lagoon stays, surf houses, and long-stay retreats.",
    tags: ["Lagoon", "Kitesurf", "Retreats"],
    styles: "Surf houses, resort units",
    accent:
      "from-[#083344] via-[#0e7490] to-[#15803d] text-white border-white/15",
    layout: "md:col-span-2 lg:col-span-1",
  },
  {
    key: "merzouga",
    city: "Merzouga",
    positioning: "Desert camps, premium excursions, and unique Sahara stays.",
    tags: ["Desert", "Excursions", "Unique stays"],
    styles: "Desert camps, lodges",
    accent:
      "from-[#292524] via-[#92400e] to-[#b91c1c] text-white border-white/15",
    layout: "",
  },
  {
    key: "ifrane",
    city: "Ifrane",
    positioning: "Mountain air, family weekends, and winter-ready homes.",
    tags: ["Mountain", "Families", "Cool weather"],
    styles: "Villas, lodges, apartments",
    accent:
      "from-[#1e293b] via-[#475569] to-[#166534] text-white border-white/15",
    layout: "",
  },
  {
    key: "ouarzazate",
    city: "Ouarzazate",
    positioning: "Kasbah routes, film-country access, and desert-edge stays.",
    tags: ["Kasbahs", "Routes", "Desert edge"],
    styles: "Guesthouses, desert lodges",
    accent:
      "from-[#27150b] via-[#9a3412] to-[#ca8a04] text-white border-white/15",
    layout: "",
  },
] as const;

const intentCards: {
  key: string;
  title: string;
  copy: string;
  icon: LucideIcon;
  params: Record<string, QueryValue>;
}[] = [
  {
    key: "luxuryVillasWithPool",
    title: "Luxury villas with pool",
    copy: "Private space, larger groups, and premium outdoor living.",
    icon: Gem,
    params: { propertyType: "villa", filter: "pool" },
  },
  {
    key: "riadsInTheMedina",
    title: "Riads in the medina",
    copy: "Traditional stays with old-city access and stronger arrival clarity.",
    icon: Landmark,
    params: { propertyType: "riad", filter: "historic" },
  },
  {
    key: "beachAndSurfStays",
    title: "Beach and surf stays",
    copy: "Coastal properties for families, remote workers, and surf travel.",
    icon: Waves,
    params: { filter: "surfing" },
  },
  {
    key: "desertEscapes",
    title: "Desert escapes",
    copy: "Sahara-facing camps and lodges for distinctive Morocco itineraries.",
    icon: TentTree,
    params: { propertyType: "desert_camp" },
  },
  {
    key: "familyReadyHomes",
    title: "Family-ready homes",
    copy: "Practical stays with space, policy clarity, and arrival confidence.",
    icon: Users,
    params: { guest: 4 },
  },
  {
    key: "businessTravelReady",
    title: "Business travel ready",
    copy: "City access, work-ready stays, and cleaner operational expectations.",
    icon: Briefcase,
    params: { propertyType: "hotel_apartment" },
  },
  {
    key: "longStayFriendly",
    title: "Long-stay friendly",
    copy: "Apartments and residences suited to slower trips and repeat guests.",
    icon: CalendarDays,
    params: { propertyType: "apartment" },
  },
  {
    key: "staffedProperties",
    title: "Staffed properties",
    copy: "Premium homes where service, readiness, and handover matter.",
    icon: KeyRound,
    params: { propertyType: "luxury_residence" },
  },
  {
    key: "premiumVerifiedStays",
    title: "Premium verified stays",
    copy: "Approved inventory with stronger review and marketplace standards.",
    icon: ShieldCheck,
    params: { filter: "luxe" },
  },
  {
    key: "moroccanTraditionalStays",
    title: "Moroccan traditional stays",
    copy: "Riads, dars, and homes built around local character and detail.",
    icon: HomeIcon,
    params: { propertyType: "traditional_house" },
  },
];

const managedSteps = [
  {
    key: "discover",
    title: "Discover",
    copy: "Search Kantara stays through verified inventory and intent-led discovery.",
    icon: Compass,
  },
  {
    key: "request",
    title: "Request",
    copy: "Guests move through a platform flow instead of unmanaged back-channel ambiguity.",
    icon: MessageSquareText,
  },
  {
    key: "platformVerification",
    title: "Platform verification",
    copy: "The listing, partner, and booking context stay visible to operations.",
    icon: BadgeCheck,
  },
  {
    key: "confirmation",
    title: "Confirmation",
    copy: "Terms, prices, and stay details are structured before the guest commits.",
    icon: ReceiptText,
  },
  {
    key: "managedHandover",
    title: "Managed handover",
    copy: "The foundation is designed for controlled arrivals and property handover.",
    icon: KeyRound,
  },
  {
    key: "stayProtected",
    title: "Stay protected",
    copy: "Price snapshots and policy clarity reduce surprises after confirmation.",
    icon: LockKeyhole,
  },
] as const;

const trustCards: {
  key: string;
  title: string;
  copy: string;
  icon: LucideIcon;
  state: string;
}[] = [
  {
    key: "partnerVerification",
    title: "Partner verification",
    copy: "Partners move through review before public demand is exposed.",
    icon: BadgeCheck,
    state: "Foundation active",
  },
  {
    key: "propertyReadinessReview",
    title: "Property readiness review",
    copy: "Listings are structured around standards, media, capacity, and operating details.",
    icon: FileCheck2,
    state: "Approval based",
  },
  {
    key: "communicationControl",
    title: "Communication control",
    copy: "Designed so guest and partner communication can remain platform managed.",
    icon: MessageSquareText,
    state: "Platform-led",
  },
  {
    key: "priceSnapshotProtection",
    title: "Price snapshot protection",
    copy: "Reservation snapshots preserve agreed pricing after listing changes.",
    icon: CircleDollarSign,
    state: "In place",
  },
  {
    key: "policyClarity",
    title: "Policy clarity",
    copy: "The product is built to make house rules and Morocco-specific expectations explicit.",
    icon: ReceiptText,
    state: "Structured",
  },
  {
    key: "moroccoLocalOperations",
    title: "Morocco-local operations",
    copy: "City, arrival, medina, family, and handover realities are treated as product concerns.",
    icon: Map,
    state: "Specialized",
  },
  {
    key: "premiumGuestVerification",
    title: "Premium guest verification",
    copy: "Prepared for richer traveler profiles and future premium guest privileges.",
    icon: Star,
    state: "Prepared for",
  },
  {
    key: "disputeReadinessLater",
    title: "Dispute readiness later",
    copy: "Designed to support clearer evidence, terms, and operational history over time.",
    icon: ShieldCheck,
    state: "Coming later",
  },
];

const moroccoStandards = [
  "Medina access and luggage handoff realities",
  "Couple, family, and local guest policy expectations",
  "Riad, villa, apartment, and staffed-home operating differences",
  "City-specific arrival patterns from airports, stations, and old towns",
  "Multilingual readiness for international and Moroccan diaspora guests",
  "Property documentation, listing quality, and readiness review",
  "Hosted versus managed expectations made clearer before booking",
  "Prepared for later transfer, direct-settlement, and premium privilege controls",
] as const;

const readinessBadges = [
  "Documents",
  "Operations",
  "Guest standards",
  "Platform handover",
  "Listing quality",
  "Compliance readiness",
] as const;

async function getHomepageData({
  searchParams,
  userId,
}: {
  searchParams?: HomePageSearchParams;
  userId?: string;
}) {
  noStore();

  const listingWhere = buildListingWhere(searchParams);

  const [featuredListings, metricHomes] = await Promise.all([
    prisma.home.findMany({
      where: listingWhere,
      select: {
        id: true,
        title: true,
        description: true,
        approvedTitle: true,
        approvedDescription: true,
        approvedNeighborhood: true,
        photo: true,
        price: true,
        country: true,
        city: true,
        propertyType: true,
        stayType: true,
        guests: true,
        bedrooms: true,
        bathrooms: true,
        guestCount: true,
        bedroomCount: true,
        bathroomCount: true,
        platformManagedCommunication: true,
        approvedAt: true,
        images: {
          orderBy: [
            { isCover: "desc" },
            { sortOrder: "asc" },
            { createdAt: "asc" },
          ],
          take: 1,
          select: {
            url: true,
            altText: true,
          },
        },
        Favorite: {
          where: {
            userId: userId ?? "__anonymous__",
          },
          take: 1,
          select: {
            id: true,
          },
        },
      },
      orderBy: [{ approvedAt: "desc" }, { createdAT: "desc" }],
      take: 6,
    }),
    prisma.home.findMany({
      where: APPROVED_PUBLIC_HOME_WHERE,
      select: {
        id: true,
        city: true,
        price: true,
        propertyType: true,
        platformManagedCommunication: true,
      },
    }),
  ]);

  return {
    featuredListings,
    metrics: computeMarketplaceMetrics(metricHomes),
  };
}

async function getHomepagePresentation() {
  noStore();

  const [sections, branding] = await Promise.all([
    prisma.homepageSection.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.siteBranding.findFirst({
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  const normalizedBranding = normalizeSiteBranding(branding);
  const databaseSections = sections.map(normalizeHomepageSection);
  const visibleDatabaseSections = databaseSections.filter(
    (section) =>
      section.isVisible &&
      shouldRenderSectionType(section.type, normalizedBranding)
  );
  const fallbackSections = getDefaultHomepageSections().filter(
    (section) =>
      section.isVisible &&
      shouldRenderSectionType(section.type, normalizedBranding)
  );

  return {
    branding: normalizedBranding,
    sections:
      databaseSections.length > 0 && visibleDatabaseSections.length > 0
        ? visibleDatabaseSections
        : fallbackSections,
  };
}

function parseSearchNumber(value?: string) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function buildListingWhere(
  searchParams?: HomePageSearchParams
): Prisma.HomeWhereInput {
  const guests = parseSearchNumber(searchParams?.guest);
  const bedrooms = parseSearchNumber(searchParams?.room);
  const bathrooms = parseSearchNumber(searchParams?.bathroom);
  const and: Prisma.HomeWhereInput[] = [];

  if (guests !== null) {
    and.push({
      OR: [{ guestCount: guests }, { guests: String(guests) }],
    });
  }

  if (bedrooms !== null) {
    and.push({
      OR: [{ bedroomCount: bedrooms }, { bedrooms: String(bedrooms) }],
    });
  }

  if (bathrooms !== null) {
    and.push({
      OR: [{ bathroomCount: bathrooms }, { bathrooms: String(bathrooms) }],
    });
  }

  return {
    ...APPROVED_PUBLIC_HOME_WHERE,
    categoryName: searchParams?.filter ?? undefined,
    country: searchParams?.country ?? undefined,
    propertyType: searchParams?.propertyType ?? undefined,
    city: searchParams?.city
      ? { equals: searchParams.city, mode: "insensitive" }
      : undefined,
    AND: and.length > 0 ? and : undefined,
  };
}

function computeMarketplaceMetrics(
  homes: {
    id: string;
    city: string | null;
    price: number | null;
    propertyType: string | null;
    platformManagedCommunication: boolean;
  }[]
) {
  const cities = new Set(
    homes
      .map((home) => home.city?.trim())
      .filter((city): city is string => Boolean(city))
      .map((city) => city.toLowerCase())
  );
  const propertyTypes = new Set(
    homes
      .map((home) => home.propertyType?.trim())
      .filter((propertyType): propertyType is string => Boolean(propertyType))
  );
  const prices = homes
    .map((home) => home.price)
    .filter((price): price is number => typeof price === "number" && price > 0);

  return {
    approvedListings: homes.length,
    citiesRepresented: cities.size,
    propertyStyles: propertyTypes.size,
    platformManaged: homes.filter((home) => home.platformManagedCommunication)
      .length,
    minPrice: prices.length > 0 ? Math.min(...prices) : null,
    maxPrice: prices.length > 0 ? Math.max(...prices) : null,
    averagePrice:
      prices.length > 0
        ? Math.round(
            prices.reduce((total, price) => total + price, 0) / prices.length
          )
        : null,
  };
}

function buildSearchHref(
  current: HomePageSearchParams | undefined,
  updates: Record<string, QueryValue>,
  hash = "featured-stays"
) {
  const params = new URLSearchParams();

  Object.entries(current ?? {}).forEach(([key, value]) => {
    if (typeof value === "string" && value.trim().length > 0) {
      params.set(key, value);
    }
  });

  Object.entries(updates).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") {
      params.delete(key);
      return;
    }

    params.set(key, String(value));
  });

  const query = params.toString();
  const suffix = hash ? `#${hash}` : "";

  return `/${query ? `?${query}` : ""}${suffix}`;
}

function formatPrice(
  value: number | null | undefined,
  currencyState: CurrencyDisplayState,
  emptyLabel = "Price on request"
) {
  if (!value || value <= 0) return emptyLabel;
  return formatPlatformMoney(value, currencyState);
}

function formatMetric(value: number, t: Translate) {
  return value > 0
    ? value.toLocaleString()
    : t("homepage", "metrics.value.onboarding", "Onboarding");
}

function formatCount(
  numberValue?: number | null,
  legacyValue?: string | null,
  singular = "item",
  plural = `${singular}s`
) {
  const value =
    typeof numberValue === "number" && numberValue > 0
      ? numberValue
      : Number(legacyValue);

  if (!Number.isFinite(value) || value <= 0) return null;

  return `${value} ${value === 1 ? singular : plural}`;
}

function hasActiveSearch(searchParams?: HomePageSearchParams) {
  return Boolean(
    searchParams?.filter ||
      searchParams?.country ||
      searchParams?.city ||
      searchParams?.guest ||
      searchParams?.room ||
      searchParams?.bathroom ||
      searchParams?.propertyType
  );
}

type HomepageListing = Awaited<
  ReturnType<typeof getHomepageData>
>["featuredListings"][number];

type Translate = (namespace: string, key: string, fallback: string) => string;

async function applyHomepageSectionTranslations(
  sections: HomepageSectionView[],
  language: LanguageCode
) {
  if (language === "en" || sections.length === 0) return sections;

  const targets = sections.flatMap((section) =>
    HOMEPAGE_SECTION_TRANSLATABLE_FIELDS.map((fieldName) => ({
      entityType: "homepageSection",
      entityId: section.id,
      fieldName,
    }))
  );
  const translations = await getEntityTranslationMap(language, targets);

  return sections.map((section) => {
    const next = { ...section };

    for (const fieldName of HOMEPAGE_SECTION_TRANSLATABLE_FIELDS) {
      const translatedText = translations.get(
        buildEntityTranslationKey("homepageSection", section.id, fieldName)
      );
      if (translatedText) {
        next[fieldName] = translatedText;
      }
    }

    return next;
  });
}

async function applyHomepageListingTranslations(
  listings: HomepageListing[],
  language: LanguageCode
) {
  return applyApprovedListingTranslations(listings, language);
}

type HomepageRenderContext = {
  branding: SiteBrandingView;
  featuredListings: HomepageListing[];
  metrics: ReturnType<typeof computeMarketplaceMetrics>;
  searchParams?: HomePageSearchParams;
  userId?: string;
  currencyState: CurrencyDisplayState;
  t: Translate;
};

function homepageThemeClass(themeMode: string) {
  if (themeMode === "light_editorial") return "bg-slate-50";
  if (themeMode === "luxury_green") return "bg-[linear-gradient(180deg,#ffffff,#ecfdf5_32%,#ffffff)]";
  if (themeMode === "desert_warm") return "bg-[linear-gradient(180deg,#ffffff,#fff7ed_34%,#ffffff)]";
  if (themeMode === "minimal_global") return "bg-white";

  return "bg-white";
}

function sectionValue(
  section: HomepageSectionView | undefined,
  key: keyof Pick<
    HomepageSectionView,
    | "title"
    | "eyebrow"
    | "subtitle"
    | "body"
    | "ctaLabel"
    | "ctaHref"
    | "secondaryCtaLabel"
    | "secondaryCtaHref"
    | "badgeText"
  >,
  fallback: string
) {
  const value = section?.[key];
  return typeof value === "string" && value.trim().length > 0
    ? value
    : fallback;
}

function sectionCopy(section: HomepageSectionView | undefined, fallback: string) {
  return sectionValue(section, "body", section?.subtitle ?? fallback);
}

function tTemplate(
  t: Translate,
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

function toRegistrySegment(label: string) {
  return label
    .replace(/[^A-Za-z0-9]+(.)/g, (_match: string, char: string) =>
      char.toUpperCase()
    )
    .replace(/[^A-Za-z0-9]/g, "")
    .replace(/^./, (char) => char.toLowerCase());
}

function primaryButtonClass(branding: SiteBrandingView, dark = false) {
  if (branding.buttonStyle === "outline") {
    return dark
      ? "border border-white/25 bg-transparent text-white hover:bg-white/10"
      : "border border-stone-300 bg-white text-stone-950 hover:bg-stone-50";
  }

  if (branding.buttonStyle === "solid") {
    return dark
      ? "bg-white text-stone-950 hover:bg-stone-100"
      : "bg-stone-950 text-white hover:bg-stone-800";
  }

  return dark
    ? "bg-emerald-300 text-emerald-950 shadow-xl shadow-black/20 hover:bg-emerald-200"
    : "bg-emerald-700 text-white shadow-lg shadow-emerald-950/10 hover:bg-emerald-800";
}

function secondaryButtonClass(dark = false) {
  return dark
    ? "border border-white/20 bg-white/10 text-white hover:bg-white/15"
    : "border border-stone-300 bg-white text-stone-950 hover:bg-stone-50";
}

function getHomepageSectionMediaUrl(section?: HomepageSectionView | null) {
  const backgroundImageUrl = section?.backgroundImageUrl?.trim();
  if (backgroundImageUrl) return backgroundImageUrl;

  const imageUrl = section?.imageUrl?.trim();
  if (imageUrl) return imageUrl;

  return null;
}

function HomepageSectionMedia({
  section,
  dark = false,
  className,
  heightClass = "h-72 sm:h-96",
  priority = false,
  t,
}: {
  section?: HomepageSectionView | null;
  dark?: boolean;
  className?: string;
  heightClass?: string;
  priority?: boolean;
  t: Translate;
}) {
  const imageUrl = getHomepageSectionMediaUrl(section);
  if (!imageUrl) return null;

  return (
    <figure
      className={cn(
        "overflow-hidden rounded-md border shadow-lg",
        heightClass,
        dark ? "border-white/10 bg-white/[0.06]" : "border-stone-200 bg-white",
        className
      )}
    >
      <img
        src={imageUrl}
        alt={
          section?.title?.trim() ||
          section?.eyebrow?.trim() ||
          t("homepage", "generic.image", "Homepage section image")
        }
        className="h-full w-full object-cover"
        loading={priority ? "eager" : "lazy"}
      />
    </figure>
  );
}

function renderHomepageSection(
  section: HomepageSectionView,
  context: HomepageRenderContext
) {
  switch (section.type) {
    case "hero":
      return (
        <HeroSection
          key={section.id}
          section={section}
          branding={context.branding}
          searchParams={context.searchParams}
          metrics={context.metrics}
          heroListing={context.featuredListings[0]}
          currencyState={context.currencyState}
          t={context.t}
        />
      );
    case "search_command":
      return (
        <SearchCommandSection
          key={section.id}
          section={section}
          branding={context.branding}
          searchParams={context.searchParams}
          t={context.t}
        />
      );
    case "metrics_strip":
      return (
        <MarketplaceIntelligence
          key={section.id}
          section={section}
          metrics={context.metrics}
          currencyState={context.currencyState}
          t={context.t}
        />
      );
    case "destination_command":
      return (
        <DestinationCommandCenter
          key={section.id}
          section={section}
          searchParams={context.searchParams}
          t={context.t}
        />
      );
    case "intent_discovery":
      return (
        <SearchIntentSections
          key={section.id}
          section={section}
          searchParams={context.searchParams}
          t={context.t}
        />
      );
    case "featured_listings":
      return (
        <FeaturedVerifiedStays
          key={section.id}
          section={section}
          listings={context.featuredListings}
          userId={context.userId}
          searchParams={context.searchParams}
          branding={context.branding}
          currencyState={context.currencyState}
          t={context.t}
        />
      );
    case "managed_marketplace":
      return (
        <ManagedMarketplaceExplanation
          key={section.id}
          section={section}
          t={context.t}
        />
      );
    case "trust_architecture":
      return (
        <TrustArchitecture key={section.id} section={section} t={context.t} />
      );
    case "guests_partners":
      return (
        <GuestPartnerSplit
          key={section.id}
          section={section}
          searchParams={context.searchParams}
          branding={context.branding}
          t={context.t}
        />
      );
    case "morocco_standards":
      return (
        <MoroccoStandards key={section.id} section={section} t={context.t} />
      );
    case "partner_acquisition":
      return (
        <PartnerAcquisitionBand
          key={section.id}
          section={section}
          branding={context.branding}
          t={context.t}
        />
      );
    case "guest_preview":
      return (
        <GuestMembershipPreview
          key={section.id}
          section={section}
          branding={context.branding}
          t={context.t}
        />
      );
    case "final_cta":
      return (
        <FinalCta
          key={section.id}
          section={section}
          searchParams={context.searchParams}
          branding={context.branding}
          t={context.t}
        />
      );
    case "enterprise_footer":
      return (
        <EnterpriseFooter
          key={section.id}
          section={section}
          branding={context.branding}
          t={context.t}
        />
      );
    default:
      return (
        <GenericHomepageSection
          key={section.id}
          section={section}
          branding={context.branding}
          t={context.t}
        />
      );
  }
}

export default async function Home({
  searchParams,
}: {
  searchParams?: HomePageSearchParams;
}) {
  const [user, presentation, currencyState, translator] = await Promise.all([
    getCurrentUser(),
    getHomepagePresentation(),
    getCurrencyDisplayState(),
    getTranslator(),
  ]);
  const { featuredListings, metrics } = await getHomepageData({
    searchParams,
    userId: user?.id,
  });
  const [translatedSections, translatedListings] = await Promise.all([
    applyHomepageSectionTranslations(presentation.sections, translator.language),
    applyHomepageListingTranslations(featuredListings, translator.language),
  ]);

  return (
    <main
      className={cn(
        "homepage-shell min-h-screen overflow-hidden bg-white text-stone-950",
        homepageThemeClass(presentation.branding.themeMode)
      )}
      data-content-width={presentation.branding.contentWidth}
      data-section-radius={presentation.branding.sectionRadius}
    >
      {translatedSections.map((section) =>
        renderHomepageSection(section, {
          branding: presentation.branding,
          featuredListings: translatedListings,
          metrics,
          searchParams,
          userId: user?.id,
          currencyState,
          t: translator.t,
        })
      )}
    </main>
  );
}

function HeroSection({
  section,
  branding,
  searchParams,
  metrics,
  heroListing,
  currencyState,
  t,
}: {
  section?: HomepageSectionView;
  branding: SiteBrandingView;
  searchParams?: HomePageSearchParams;
  metrics: ReturnType<typeof computeMarketplaceMetrics>;
  heroListing?: HomepageListing;
  currencyState: CurrencyDisplayState;
  t: Translate;
}) {
  const isCentered = branding.heroAlignment === "center";
  const heroMediaUrl = getHomepageSectionMediaUrl(section);
  const showVisual = branding.heroAlignment !== "center" && !heroMediaUrl;

  return (
    <section
      className={cn(
        "relative text-white",
        heroThemeClass(branding.themeMode)
      )}
    >
      {heroMediaUrl ? (
        <img
          src={heroMediaUrl}
          alt={
            section?.title?.trim() ||
            t("homepage", "hero.image_alt", "Kantara homepage hero image")
          }
          className="absolute inset-0 h-full w-full object-cover"
          loading="eager"
        />
      ) : null}
      {heroMediaUrl ? <div className="absolute inset-0 bg-stone-950/62" /> : null}
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(180deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:88px_88px] opacity-30" />
      <div className="absolute inset-x-0 bottom-0 h-28 bg-[linear-gradient(180deg,transparent,rgba(255,255,255,1))]" />

      <div
        className={cn(
          "homepage-content relative mx-auto grid min-h-[calc(100vh-88px)] w-full grid-cols-1 gap-8 px-4 py-10 sm:px-6 sm:py-14 lg:items-center lg:px-10 lg:py-16 xl:gap-14",
          showVisual
            ? "lg:grid-cols-[minmax(0,1.02fr)_minmax(360px,0.82fr)]"
            : "place-items-center",
          isCentered ? "text-center" : ""
        )}
      >
        <div className={cn("max-w-3xl", isCentered ? "mx-auto" : "")}>
          <div className="inline-flex max-w-full items-center gap-2 rounded-md border border-white/15 bg-white/10 px-3 py-2 text-xs font-medium text-white/85 backdrop-blur">
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-200" />
            <span>
              {sectionValue(
                section,
                "badgeText",
                t(
                  "common",
                  "brand.rules",
                  "Verified homes. Clear rules. Local intelligence."
                )
              )}
            </span>
          </div>

          <p className="mt-6 text-sm font-semibold text-emerald-200">
            {sectionValue(
              section,
              "eyebrow",
              t(
                "homepage",
                "hero.eyebrow",
                "Kantara managed Morocco marketplace"
              )
            )}
          </p>

          <h1 className="mt-3 max-w-4xl text-4xl font-semibold leading-[1.02] sm:text-5xl lg:text-6xl xl:text-7xl">
            {sectionValue(
              section,
              "title",
              t(
                "homepage",
                "hero.title",
                "Morocco stays, managed with confidence."
              )
            )}
          </h1>

          <p
            className={cn(
              "mt-5 max-w-2xl text-base font-semibold leading-7 text-white/86 sm:text-lg lg:text-xl lg:leading-8",
              isCentered ? "mx-auto" : ""
            )}
          >
            {sectionValue(
              section,
              "subtitle",
              t(
                "homepage",
                "hero.subtitle",
                "Premium stays. Reviewed partners. Managed journeys."
              )
            )}
          </p>

          <p
            className={cn(
              "mt-3 max-w-xl text-sm leading-6 text-white/66 sm:text-base",
              isCentered ? "mx-auto" : ""
            )}
          >
            {sectionCopy(
              section,
              t(
                "homepage",
                "hero.body",
                "Built for travelers who need more than a listing."
              )
            )}
          </p>

          <div
            className={cn(
              "mt-7 flex flex-col gap-3 sm:flex-row sm:items-center",
              isCentered ? "sm:justify-center" : ""
            )}
          >
            <Link
              href={
                sectionValue(
                  section,
                  "ctaHref",
                  buildSearchHref(searchParams, { country: "MA" })
                ) || buildSearchHref(searchParams, { country: "MA" })
              }
              className={cn(
                "inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-5 py-3 text-sm font-semibold transition",
                primaryButtonClass(branding, true)
              )}
            >
              {sectionValue(
                section,
                "ctaLabel",
                t("homepage", "hero.primary_cta", "Explore stays")
              )}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href={sectionValue(section, "secondaryCtaHref", "/partner/apply")}
              className={cn(
                "inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-5 py-3 text-sm font-semibold backdrop-blur transition",
                secondaryButtonClass(true)
              )}
            >
              {sectionValue(
                section,
                "secondaryCtaLabel",
                t("homepage", "hero.secondary_cta", "Become a partner")
              )}
              <Handshake className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {showVisual ? (
          <HeroVisual
            metrics={metrics}
            listing={heroListing}
            branding={branding}
            currencyState={currencyState}
            t={t}
          />
        ) : null}
      </div>
    </section>
  );
}

function heroThemeClass(themeMode: string) {
  if (themeMode === "light_editorial") {
    return "bg-[linear-gradient(135deg,#172033_0%,#334155_42%,#047857_100%)]";
  }
  if (themeMode === "luxury_green") {
    return "bg-[linear-gradient(135deg,#051f1a_0%,#064e3b_46%,#172033_100%)]";
  }
  if (themeMode === "desert_warm") {
    return "bg-[linear-gradient(135deg,#1c1917_0%,#7c2d12_45%,#14532d_100%)]";
  }
  if (themeMode === "minimal_global") {
    return "bg-[linear-gradient(135deg,#0f172a_0%,#1f2937_42%,#0f766e_100%)]";
  }

  return "bg-[linear-gradient(135deg,#120f0c_0%,#172033_36%,#064e3b_68%,#2b170f_100%)]";
}

function SearchCommandSection({
  section,
  branding,
  searchParams,
  t,
}: {
  section?: HomepageSectionView;
  branding: SiteBrandingView;
  searchParams?: HomePageSearchParams;
  t: Translate;
}) {
  return (
    <section className="relative z-20 -mt-10 px-4 sm:px-6 lg:px-10">
      <div className="homepage-content mx-auto rounded-md border border-stone-200 bg-white p-4 shadow-2xl shadow-stone-950/12 sm:p-5">
        <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-emerald-700">
              {sectionValue(
                section,
                "eyebrow",
                t("homepage", "search.eyebrow", "Search command")
              )}
            </p>
            <h2 className="mt-1 text-xl font-semibold text-stone-950 sm:text-2xl">
              {sectionValue(
                section,
                "title",
                t(
                  "homepage",
                  "search.title",
                  "Search Morocco with operational clarity."
                )
              )}
            </h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-stone-600">
            {sectionCopy(
              section,
              t(
                "homepage",
                "search.copy",
                "Destination, dates, guests, and stay style in one readable command."
              )
            )}
          </p>
        </div>
        <HomepageSectionMedia
          section={section}
          t={t}
          heightClass="h-56 sm:h-72"
          className="mb-4"
        />
        <HeroSearchCommand
          searchParams={searchParams}
          variant="light"
          branding={branding}
          t={t}
        />
      </div>
    </section>
  );
}

function HeroSearchCommand({
  searchParams,
  variant = "dark",
  branding,
  t,
}: {
  searchParams?: HomePageSearchParams;
  variant?: "dark" | "light";
  branding: SiteBrandingView;
  t: Translate;
}) {
  const isDark = variant === "dark";

  return (
    <form
      action="/"
      method="get"
      className={cn(
        "rounded-md p-2",
        isDark
          ? "mt-7 border border-white/18 bg-white/12 shadow-2xl shadow-black/25 backdrop-blur-xl"
          : "border border-stone-200 bg-stone-50 shadow-inner"
      )}
    >
      <input type="hidden" name="country" value="MA" />
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-[1.25fr_1fr_0.78fr_1fr_auto]">
        <label className="min-w-0 rounded-md bg-white px-4 py-3 text-stone-950 shadow-sm">
          <span className="flex items-center gap-2 text-xs font-semibold text-stone-500">
            <MapPin className="h-4 w-4 text-emerald-700" />
            {t("search", "destination", "Destination")}
          </span>
          <input
            name="city"
            defaultValue={searchParams?.city ?? ""}
            placeholder={t(
              "search",
              "destination_placeholder",
              "Marrakech, Dakhla, Rabat"
            )}
            className="mt-1 h-7 w-full min-w-0 bg-transparent text-sm font-semibold outline-none placeholder:text-stone-400"
          />
        </label>

        <div className="grid min-w-0 grid-cols-2 gap-2 rounded-md bg-white px-3 py-3 text-stone-950 shadow-sm">
          <label className="min-w-0">
            <span className="flex items-center gap-2 text-xs font-semibold text-stone-500">
              <CalendarDays className="h-4 w-4 text-emerald-700" />
              {t("search", "arrive", "Arrive")}
            </span>
            <input
              name="checkIn"
              type="date"
              defaultValue={searchParams?.checkIn ?? ""}
              className="mt-1 h-7 w-full min-w-0 bg-transparent text-xs font-semibold outline-none"
            />
          </label>
          <label className="min-w-0">
            <span className="text-xs font-semibold text-stone-500">
              {t("search", "leave", "Leave")}
            </span>
            <input
              name="checkOut"
              type="date"
              defaultValue={searchParams?.checkOut ?? ""}
              className="mt-1 h-7 w-full min-w-0 bg-transparent text-xs font-semibold outline-none"
            />
          </label>
        </div>

        <label className="min-w-0 rounded-md bg-white px-4 py-3 text-stone-950 shadow-sm">
          <span className="flex items-center gap-2 text-xs font-semibold text-stone-500">
            <Users className="h-4 w-4 text-emerald-700" />
            {t("common", "guests", "Guests")}
          </span>
          <select
            name="guest"
            defaultValue={searchParams?.guest ?? ""}
            className="mt-1 h-7 w-full min-w-0 bg-transparent text-sm font-semibold outline-none"
          >
            <option value="">{t("common", "any", "Any")}</option>
            <option value="1">1 {t("common", "guest", "guest")}</option>
            <option value="2">2 {t("common", "guests_lower", "guests")}</option>
            <option value="4">4 {t("common", "guests_lower", "guests")}</option>
            <option value="6">6 {t("common", "guests_lower", "guests")}</option>
            <option value="8">8 {t("common", "guests_lower", "guests")}</option>
          </select>
        </label>

        <label className="min-w-0 rounded-md bg-white px-4 py-3 text-stone-950 shadow-sm">
          <span className="flex items-center gap-2 text-xs font-semibold text-stone-500">
            <SlidersHorizontal className="h-4 w-4 text-emerald-700" />
            {t("search", "property_style", "Property style")}
          </span>
          <select
            name="propertyType"
            defaultValue={searchParams?.propertyType ?? ""}
            className="mt-1 h-7 w-full min-w-0 bg-transparent text-sm font-semibold outline-none"
          >
            <option value="">{t("search", "any_style", "Any style")}</option>
            <option value="riad">{t("taxonomy", "property_type.riad", "Riad")}</option>
            <option value="villa">{t("taxonomy", "property_type.villa", "Villa")}</option>
            <option value="apartment">
              {t("taxonomy", "property_type.apartment", "Apartment")}
            </option>
            <option value="surf_house">
              {t("taxonomy", "property_type.surf_house", "Surf house")}
            </option>
            <option value="desert_camp">
              {t("taxonomy", "property_type.desert_camp", "Desert camp")}
            </option>
            <option value="luxury_residence">
              {t(
                "taxonomy",
                "property_type.luxury_residence",
                "Luxury residence"
              )}
            </option>
          </select>
        </label>

        <button
          type="submit"
          className={cn(
            "inline-flex min-h-14 items-center justify-center gap-2 rounded-md px-5 py-3 text-sm font-bold transition lg:min-h-full",
            primaryButtonClass(branding, isDark)
          )}
        >
          <Search className="h-4 w-4" />
          <span className="lg:hidden xl:inline">
            {t("common", "explore_stays", "Explore stays")}
          </span>
        </button>
      </div>
    </form>
  );
}

function HeroVisual({
  metrics,
  listing,
  branding,
  currencyState,
  t,
}: {
  metrics: ReturnType<typeof computeMarketplaceMetrics>;
  listing?: HomepageListing;
  branding: SiteBrandingView;
  currencyState: CurrencyDisplayState;
  t: Translate;
}) {
  const imagePath = listing?.images[0]?.url ?? listing?.photo;
  const imageUrl = resolveHomeImageUrl(imagePath);
  const propertyTypeLabel = getPropertyTypeLabel(listing?.propertyType, t);
  const panelCount =
    !branding.showTrustPanels
      ? 0
      : branding.heroVisualDensity === "rich"
        ? 4
        : branding.heroVisualDensity === "standard"
          ? 3
          : 2;
  const trustPanels = [
    {
      icon: BadgeCheck,
      title: t(
        "homepage",
        "hero.trust.verifiedPartnerNetwork.title",
        "Verified partner network"
      ),
      copy:
        metrics.approvedListings > 0
          ? tTemplate(
              t,
              "homepage",
              metrics.approvedListings === 1
                ? "hero.trust.verifiedPartnerNetwork.approvedPublicStay"
                : "hero.trust.verifiedPartnerNetwork.approvedPublicStays",
              metrics.approvedListings === 1
                ? "{count} approved public stay"
                : "{count} approved public stays",
              { count: metrics.approvedListings.toLocaleString() }
            )
          : t(
              "homepage",
              "hero.trust.verifiedPartnerNetwork.partnerReview",
              "Partner review is underway"
            ),
    },
    {
      icon: ReceiptText,
      title: t(
        "homepage",
        "hero.trust.priceSnapshotProtection.title",
        "Price snapshot protection"
      ),
      copy: t(
        "homepage",
        "hero.trust.priceSnapshotProtection.copy",
        "Booking terms keep agreed price context"
      ),
    },
    {
      icon: KeyRound,
      title: t(
        "homepage",
        "hero.trust.managedHandoverDesign.title",
        "Managed handover design"
      ),
      copy: t(
        "homepage",
        "hero.trust.managedHandoverDesign.copy",
        "Built for cleaner arrivals and stay transitions"
      ),
    },
    {
      icon: Globe2,
      title: t(
        "homepage",
        "hero.trust.moroccoLocalPrecision.title",
        "Morocco-local precision"
      ),
      copy:
        metrics.citiesRepresented > 0
          ? tTemplate(
              t,
              "homepage",
              "hero.trust.moroccoLocalPrecision.citiesRepresented",
              "{count} cities represented",
              { count: metrics.citiesRepresented }
            )
          : t(
              "homepage",
              "hero.trust.moroccoLocalPrecision.cityReview",
              "City inventory review in progress"
            ),
    },
  ].slice(0, panelCount);

  return (
    <div className="relative w-full overflow-hidden rounded-md border border-white/15 bg-white/10 p-4 shadow-2xl shadow-black/25 backdrop-blur-md sm:p-5 lg:min-h-[560px] lg:p-6">
      <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(255,255,255,0.16),rgba(255,255,255,0.035))]" />
      <div className="relative z-10">
        <div className="flex items-center justify-between gap-4 rounded-md border border-white/12 bg-black/18 px-4 py-3 text-xs font-semibold text-white/75">
          <span>
            {t(
              "homepage",
              "hero.marketplace_view",
              "Marketplace operations view"
            )}
          </span>
          <span className="text-emerald-200">
            {t("homepage", "hero.live_approvals", "Live approvals")}
          </span>
        </div>

        {listing ? (
          <Link
            href={`/home/${listing.id}`}
            className="group mt-5 block overflow-hidden rounded-md border border-white/15 bg-white text-stone-950 shadow-2xl shadow-black/30"
          >
            <div className="relative h-64 bg-stone-200 lg:h-72">
              <PropertyImage
                src={imageUrl}
                alt={listing.images[0]?.altText ?? listing.title ?? t("listing", "property", "Property")}
                fill
                className="object-cover transition duration-500 group-hover:scale-[1.03]"
                fallbackTitle={t(
                  "listing",
                  "fallback.verified_stay_preview",
                  "Verified stay preview"
                )}
                fallbackDescription={t(
                  "listing",
                  "fallback.approved_media_pending",
                  "Approved property media will appear here when available."
                )}
                sizes="(min-width: 1024px) 38vw, 92vw"
              />
              <div className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-md bg-white/92 px-3 py-2 text-xs font-semibold text-emerald-800 shadow">
                <BadgeCheck className="h-4 w-4" />
                {t("homepage", "hero.approved_stay", "Approved stay")}
              </div>
            </div>
            <div className="space-y-3 p-4">
              <div>
                <p className="text-xs font-semibold text-stone-500">
                  {listing.city ?? "Morocco"}{" "}
                  {propertyTypeLabel ? `- ${propertyTypeLabel}` : ""}
                </p>
                <h3 className="mt-1 line-clamp-2 text-lg font-semibold leading-6">
                  {listing.title ??
                    t(
                      "homepage",
                      "hero.visual.fallbackListingTitle",
                      "Verified Morocco stay"
                    )}
                </h3>
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-stone-600">
                  {formatPrice(
                    listing.price,
                    currencyState,
                    t("common", "price_on_request", "Price on request")
                  )}{" "}
                  / {t("common", "night", "night")}
                </p>
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
                  <KeyRound className="h-3.5 w-3.5" />
                  {t("homepage", "hero.managed", "Managed")}
                </span>
              </div>
            </div>
          </Link>
        ) : (
          <div className="mt-5 rounded-md border border-white/15 bg-white p-5 text-stone-950 shadow-2xl shadow-black/30">
            <div className="flex h-64 items-center justify-center rounded-md border border-dashed border-stone-300 bg-[linear-gradient(135deg,#f8fafc,#ecfdf5,#fff7ed)] p-6 text-center">
              <div>
                <ShieldCheck className="mx-auto h-10 w-10 text-emerald-700" />
                <h3 className="mt-4 text-xl font-semibold">
                  {t(
                    "homepage",
                    "hero.visual.emptyTitle",
                    "Verified inventory onboarding"
                  )}
                </h3>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  {t(
                    "homepage",
                    "hero.visual.emptyCopy",
                    "Approved stays will appear here as partners complete review."
                  )}
                </p>
              </div>
            </div>
          </div>
        )}

        {trustPanels.length > 0 ? (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {trustPanels.map((panel) => (
              <FloatingTrustPanel
                key={panel.title}
                icon={panel.icon}
                title={panel.title}
                copy={panel.copy}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FloatingTrustPanel({
  icon: Icon,
  title,
  copy,
}: {
  icon: LucideIcon;
  title: string;
  copy: string;
}) {
  return (
    <div className="rounded-md border border-white/15 bg-black/28 p-3 text-white shadow-lg shadow-black/20 backdrop-blur">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white/12">
          <Icon className="h-4 w-4 text-emerald-200" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-1 text-xs leading-5 text-white/70">{copy}</p>
        </div>
      </div>
    </div>
  );
}

function MarketplaceIntelligence({
  section,
  metrics,
  currencyState,
  t,
}: {
  section?: HomepageSectionView;
  metrics: ReturnType<typeof computeMarketplaceMetrics>;
  currencyState: CurrencyDisplayState;
  t: Translate;
}) {
  const priceRange =
    metrics.minPrice && metrics.maxPrice
      ? metrics.minPrice === metrics.maxPrice
        ? formatPlatformMoney(metrics.minPrice, currencyState)
        : `${formatPlatformMoney(
            metrics.minPrice,
            currencyState
          )}-${formatPlatformMoney(metrics.maxPrice, currencyState)}`
      : t("homepage", "metrics.priceReviewPending", "Price review pending");

  const metricCards = [
    {
      label: t(
        "homepage",
        "metrics.approvedPublicListings.label",
        "Approved public listings"
      ),
      value: formatMetric(metrics.approvedListings, t),
      detail:
        metrics.approvedListings > 0
          ? t(
              "homepage",
              "metrics.approvedPublicListings.detail.active",
              "Only reviewed public inventory is counted."
            )
          : t(
              "homepage",
              "metrics.approvedPublicListings.detail.empty",
              "Verified inventory is being reviewed."
            ),
      icon: ShieldCheck,
    },
    {
      label: t("homepage", "metrics.citiesRepresented.label", "Cities represented"),
      value: formatMetric(metrics.citiesRepresented, t),
      detail:
        metrics.citiesRepresented > 0
          ? t(
              "homepage",
              "metrics.citiesRepresented.detail.active",
              "Computed from approved property cities."
            )
          : t(
              "homepage",
              "metrics.citiesRepresented.detail.empty",
              "City coverage appears after approvals."
            ),
      icon: MapPin,
    },
    {
      label: t(
        "homepage",
        "metrics.managedCommunication.label",
        "Managed communication"
      ),
      value: formatMetric(metrics.platformManaged, t),
      detail:
        metrics.platformManaged > 0
          ? t(
              "homepage",
              "metrics.managedCommunication.detail.active",
              "Properties flagged for platform-led communication."
            )
          : t(
              "homepage",
              "metrics.managedCommunication.detail.empty",
              "Communication controls are ready for approved stays."
            ),
      icon: MessageSquareText,
    },
    {
      label: t("homepage", "metrics.livePriceRange.label", "Live price range"),
      value: priceRange,
      detail:
        metrics.averagePrice !== null
          ? tTemplate(
              t,
              "homepage",
              "metrics.livePriceRange.detail.average",
              "Average approved nightly price: {price}.",
              {
                price: formatPlatformMoney(metrics.averagePrice, currencyState),
              }
            )
          : t(
              "homepage",
              "metrics.livePriceRange.detail.empty",
              "Shown only when approved listings include pricing."
            ),
      icon: ReceiptText,
    },
    {
      label: t("homepage", "metrics.propertyStyles.label", "Property styles"),
      value: formatMetric(metrics.propertyStyles, t),
      detail:
        metrics.propertyStyles > 0
          ? t(
              "homepage",
              "metrics.propertyStyles.detail.active",
              "Computed from approved public property types."
            )
          : t(
              "homepage",
              "metrics.propertyStyles.detail.empty",
              "Style diversity appears as partners finish onboarding."
            ),
      icon: LayoutGrid,
    },
  ];

  return (
    <section className="relative z-10 px-4 py-8 sm:px-6 lg:px-10">
      <div className="homepage-content mx-auto rounded-md border border-stone-200 bg-white p-3 shadow-2xl shadow-stone-950/10">
        <div className="grid gap-4 p-2 pb-5 lg:grid-cols-[0.8fr_1fr] lg:items-end">
          <div>
            <p className="text-sm font-semibold text-emerald-700">
              {sectionValue(
                section,
                "eyebrow",
                t("homepage", "metrics.eyebrow", "Marketplace intelligence")
              )}
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-stone-950 sm:text-3xl">
              {sectionValue(
                section,
                "title",
                t(
                  "homepage",
                  "metrics.title",
                  "Real numbers from approved inventory."
                )
              )}
            </h2>
          </div>
          <p className="text-sm leading-6 text-stone-600">
            {sectionCopy(
              section,
              t(
                "homepage",
                "metrics.copy",
                "Metrics are computed from approved public supply, not placeholder inventory."
              )
            )}
          </p>
        </div>
        <HomepageSectionMedia
          section={section}
          t={t}
          heightClass="h-56 sm:h-72"
          className="mb-4"
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {metricCards.map((card) => {
            const Icon = card.icon;

            return (
              <div
                key={card.label}
                className="rounded-md border border-stone-200 bg-[linear-gradient(180deg,#ffffff,#f8fafc)] p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-stone-500">
                    {card.label}
                  </p>
                  <Icon className="h-4 w-4 shrink-0 text-emerald-700" />
                </div>
                <p className="mt-3 text-2xl font-semibold text-stone-950">
                  {card.value}
                </p>
                <p className="mt-2 text-xs leading-5 text-stone-500">
                  {card.detail}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function DestinationCommandCenter({
  section,
  searchParams,
  t,
}: {
  section?: HomepageSectionView;
  searchParams?: HomePageSearchParams;
  t: Translate;
}) {
  return (
    <SectionShell
      eyebrow={sectionValue(
        section,
        "eyebrow",
        t("homepage", "destinations.eyebrow", "Destination command center")
      )}
      title={sectionValue(
        section,
        "title",
        t(
          "homepage",
          "destinations.title",
          "Morocco discovery built around real trip behavior."
        )
      )}
      copy={sectionCopy(
        section,
        t(
          "homepage",
          "destinations.copy",
          "Browse by city intent, stay style, and operational context without relying on inflated destination counts."
        )
      )}
    mediaSection={section}
    mediaT={t}
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:auto-rows-fr lg:grid-cols-4">
        {destinationCards.map((destination) => (
          <Link
            key={destination.city}
            href={buildSearchHref(searchParams, {
              city: destination.city,
              country: "MA",
            })}
            className={cn(
              "group flex min-h-64 flex-col justify-between rounded-md border bg-[linear-gradient(135deg,var(--tw-gradient-stops))] p-5 shadow-lg shadow-stone-950/10 transition duration-300 hover:-translate-y-1 hover:shadow-xl",
              destination.accent,
              destination.layout
            )}
          >
            <div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white/70">
                    {t("homepage", "destinations.countryLabel", "Morocco")}
                  </p>
                  <h3 className="mt-2 text-3xl font-semibold leading-9">
                    {t(
                      "homepage",
                      `destinations.${destination.key}.title`,
                      destination.city
                    )}
                  </h3>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-white/70 transition group-hover:translate-x-1" />
              </div>
              <p className="mt-4 max-w-md text-sm leading-6 text-white/78">
                {t(
                  "homepage",
                  `destinations.${destination.key}.description`,
                  destination.positioning
                )}
              </p>
            </div>

            <div className="mt-8">
              <div className="flex flex-wrap gap-2">
                {destination.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-md border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white/82"
                  >
                    {t(
                      "homepage",
                      `destinations.${destination.key}.tag.${toRegistrySegment(
                        tag
                      )}`,
                      tag
                    )}
                  </span>
                ))}
              </div>
              <p className="mt-4 text-xs leading-5 text-white/65">
                {t(
                  "homepage",
                  "destinations.suggestedStylesLabel",
                  "Suggested styles"
                )}
                :{" "}
                {t(
                  "homepage",
                  `destinations.${destination.key}.suggestedStyles`,
                  destination.styles
                )}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </SectionShell>
  );
}

function SearchIntentSections({
  section,
  searchParams,
  t,
}: {
  section?: HomepageSectionView;
  searchParams?: HomePageSearchParams;
  t: Translate;
}) {
  return (
    <SectionShell
      className="bg-stone-950 text-white"
      eyebrow={sectionValue(
        section,
        "eyebrow",
        t("homepage", "intent.eyebrow", "Guest intent discovery")
      )}
      title={sectionValue(
        section,
        "title",
        t("homepage", "intent.title", "Find the trip behind the search.")
      )}
      copy={sectionCopy(
        section,
        t(
          "homepage",
          "intent.copy",
          "Each path opens a focused discovery view with clear stay intent and no inflated result counts."
        )
      )}
      dark
    mediaSection={section}
    mediaT={t}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {intentCards.map((intent) => {
          const Icon = intent.icon;

          return (
            <Link
              key={intent.title}
              href={buildSearchHref(searchParams, {
                ...intent.params,
                country: "MA",
              })}
              className="group rounded-md border border-white/10 bg-white/[0.055] p-4 transition duration-300 hover:-translate-y-1 hover:border-emerald-300/40 hover:bg-white/[0.09]"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-md bg-emerald-300/14 text-emerald-200">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold leading-6">
                {t(
                  "homepage",
                  `intent.${intent.key}.title`,
                  intent.title
                )}
              </h3>
              <p className="mt-2 text-sm leading-6 text-white/62">
                {t(
                  "homepage",
                  `intent.${intent.key}.description`,
                  intent.copy
                )}
              </p>
              <span className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-emerald-200">
                {t("homepage", "intent.cta", "Browse filter")}
                <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" />
              </span>
            </Link>
          );
        })}
      </div>
    </SectionShell>
  );
}

function FeaturedVerifiedStays({
  section,
  listings,
  userId,
  searchParams,
  branding,
  currencyState,
  t,
}: {
  section?: HomepageSectionView;
  listings: HomepageListing[];
  userId?: string;
  searchParams?: HomePageSearchParams;
  branding: SiteBrandingView;
  currencyState: CurrencyDisplayState;
  t: Translate;
}) {
  const filtered = hasActiveSearch(searchParams);

  return (
    <SectionShell
      id="featured-stays"
      eyebrow={sectionValue(
        section,
        "eyebrow",
        t("homepage", "featured.eyebrow", "Featured approved listings")
      )}
      title={
        filtered
          ? t(
              "homepage",
              "featured.filtered_title",
              "Approved stays matching your current search."
            )
          : sectionValue(
              section,
              "title",
              t(
                "homepage",
                "featured.title",
                "Real approved properties. Never fabricated inventory."
              )
            )
      }
      copy={sectionCopy(
        section,
        t(
          "homepage",
          "featured.copy",
          "Every card comes from reviewed public inventory, with graceful media handling when a property is still completing its photo review."
        )
      )}
    mediaSection={section}
    mediaT={t}
    >
      {listings.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {listings.map((listing) => (
            <PremiumListingCard
              key={listing.id}
              listing={listing}
              userId={userId}
              currencyState={currencyState}
              t={t}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-stone-200 bg-[linear-gradient(135deg,#ffffff,#f8fafc,#ecfdf5)] p-6 shadow-lg shadow-stone-950/5 sm:p-8 lg:p-10">
          <div className="grid gap-8 lg:grid-cols-[1fr_0.85fr] lg:items-center">
            <div>
              <div className="flex h-12 w-12 items-center justify-center rounded-md bg-emerald-100 text-emerald-800">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h3 className="mt-5 text-2xl font-semibold text-stone-950">
                {t(
                  "homepage",
                  "featured.empty_title",
                  "Verified stays are being reviewed."
                )}
              </h3>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-600 sm:text-base">
                {t(
                  "homepage",
                  "featured.empty_copy",
                  "Our team is onboarding the best properties in Morocco. Until approval is complete, the experience stays clean, clear, and trust-led for guests and partners."
                )}
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/partner/apply"
                  className={cn(
                    "inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-5 py-3 text-sm font-semibold transition",
                    primaryButtonClass(branding)
                  )}
                >
                  {t("homepage", "featured.apply_partner", "Apply as partner")}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/"
                  className="inline-flex min-h-12 items-center justify-center rounded-md border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-950 transition hover:bg-stone-50"
                >
                  {t("homepage", "featured.check_back", "Check back soon")}
                </Link>
              </div>
            </div>

            <div className="grid gap-3">
              {[
                {
                  key: "partnerReview",
                  label: "Partner review",
                },
                {
                  key: "propertyReadiness",
                  label: "Property readiness",
                },
                {
                  key: "mediaQuality",
                  label: "Media quality",
                },
              ].map((item) => (
                  <div
                    key={item.key}
                    className="rounded-md border border-stone-200 bg-white p-4"
                  >
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="h-5 w-5 text-emerald-700" />
                      <span className="font-semibold text-stone-900">
                        {t(
                          "homepage",
                          `featured.empty.review.${item.key}`,
                          item.label
                        )}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </SectionShell>
  );
}

function PremiumListingCard({
  listing,
  userId,
  currencyState,
  t,
}: {
  listing: HomepageListing;
  userId?: string;
  currencyState: CurrencyDisplayState;
  t: Translate;
}) {
  const imagePath = listing.images[0]?.url ?? listing.photo;
  const imageUrl = resolveHomeImageUrl(imagePath);
  const propertyTypeLabel =
    getPropertyTypeLabel(listing.propertyType, t) ??
    listing.propertyType?.replaceAll("_", " ");
  const stayTypeLabel = getStayTypeLabel(listing.stayType, t);
  const detailItems = [
    formatCount(
      listing.guestCount,
      listing.guests,
      t("common", "guest", "guest"),
      t("common", "guests_lower", "guests")
    ),
    formatCount(
      listing.bedroomCount,
      listing.bedrooms,
      t("common", "bedroom", "bedroom"),
      t("common", "bedrooms_lower", "bedrooms")
    ),
    formatCount(
      listing.bathroomCount,
      listing.bathrooms,
      t("common", "bathroom", "bathroom"),
      t("common", "bathrooms_lower", "bathrooms")
    ),
  ].filter((item): item is string => Boolean(item));
  const favoriteId = listing.Favorite[0]?.id;

  return (
    <article className="group overflow-hidden rounded-md border border-stone-200 bg-white shadow-lg shadow-stone-950/5 transition duration-300 hover:-translate-y-1 hover:shadow-xl">
      <div className="relative aspect-[4/3] overflow-hidden bg-stone-100">
        <Link
          href={`/home/${listing.id}`}
          aria-label={listing.title ?? t("listing", "open_listing", "Open listing")}
        >
          <PropertyImage
            src={imageUrl}
            alt={
              listing.images[0]?.altText ??
              listing.title ??
              t("listing", "property_photo", "Property photo")
            }
            fill
            className="object-cover transition duration-500 group-hover:scale-[1.03]"
            fallbackTitle={t(
              "listing",
              "fallback.photos_under_review",
              "Photos under review"
            )}
            fallbackDescription={t(
              "listing",
              "fallback.approved_media_review",
              "Approved media will appear here when available."
            )}
            sizes="(min-width: 1280px) 31vw, (min-width: 768px) 48vw, 92vw"
          />
        </Link>

        <div className="absolute left-3 top-3 flex max-w-[calc(100%-72px)] flex-wrap gap-2">
          <span className="inline-flex items-center gap-1 rounded-md bg-white/92 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 shadow">
            <BadgeCheck className="h-3.5 w-3.5" />
            {t("listing", "verified", "Verified")}
          </span>
          {listing.platformManagedCommunication ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-stone-950/78 px-2.5 py-1.5 text-xs font-semibold text-white shadow">
              <MessageSquareText className="h-3.5 w-3.5" />
              {t("listing", "managed", "Managed")}
            </span>
          ) : null}
        </div>

        {userId ? (
          <div className="absolute right-3 top-3 z-10">
            {favoriteId ? (
              <form action={DeleteFromFavorite}>
                <input type="hidden" name="favoriteId" value={favoriteId} />
                <input type="hidden" name="userId" value={userId} />
                <input type="hidden" name="pathName" value="/" />
                <DeleteFromFavoriteButton />
              </form>
            ) : (
              <form action={addToFavorite}>
                <input type="hidden" name="homeId" value={listing.id} />
                <input type="hidden" name="userId" value={userId} />
                <input type="hidden" name="pathName" value="/" />
                <AddToFavoriteButton />
              </form>
            )}
          </div>
        ) : null}
      </div>

      <Link href={`/home/${listing.id}`} className="block p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-stone-500">
              {listing.city ?? "Morocco"}
              {propertyTypeLabel ? ` - ${propertyTypeLabel}` : ""}
            </p>
            <h3 className="mt-1 line-clamp-2 text-lg font-semibold leading-6 text-stone-950">
              {getPublicListingTitle({
                ...listing,
                propertyTypeLabel,
              })}
            </h3>
          </div>
          <p className="shrink-0 text-right text-sm font-semibold text-stone-950">
            {formatPrice(
              listing.price,
              currencyState,
              t("common", "price_on_request", "Price on request")
            )}
          </p>
        </div>

        {detailItems.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-stone-600">
            {detailItems.map((item) => (
              <span
                key={item}
                className="rounded-md border border-stone-200 bg-stone-50 px-2 py-1"
              >
                {item}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-stone-100 pt-4">
          <p className="line-clamp-1 text-sm text-stone-500">
            {getPublicListingDescription(listing) ??
              stayTypeLabel ??
              t(
                "listing",
                "stay_details_reviewed",
                "Stay details reviewed"
              )}
          </p>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
            {t("listing", "view_stay", "View stay")}
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </Link>
    </article>
  );
}

function ManagedMarketplaceExplanation({
  section,
  t,
}: {
  section?: HomepageSectionView;
  t: Translate;
}) {
  return (
    <SectionShell
      className="bg-[linear-gradient(180deg,#f8fafc,#ffffff)]"
      eyebrow={sectionValue(
        section,
        "eyebrow",
        t("homepage", "managed.eyebrow", "Managed marketplace")
      )}
      title={sectionValue(
        section,
        "title",
        t(
          "homepage",
          "managed.title",
          "A marketplace built for trust before handover."
        )
      )}
      copy={sectionCopy(
        section,
        t(
          "homepage",
          "managed.copy",
          "The product foundation is built around reviewed partners, structured property data, protected booking terms, and platform-controlled handover paths."
        )
      )}
    mediaSection={section}
    mediaT={t}
    >
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-6">
        {managedSteps.map((step, index) => {
          const Icon = step.icon;

          return (
            <div
              key={step.title}
              className="relative rounded-md border border-stone-200 bg-white p-4 shadow-sm"
            >
              {index < managedSteps.length - 1 ? (
                <div className="absolute left-9 top-full hidden h-3 w-px bg-stone-200 lg:left-auto lg:right-[-7px] lg:top-8 lg:block lg:h-px lg:w-3" />
              ) : null}
              <div className="flex items-start gap-3 lg:block">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-stone-950 text-white">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 lg:mt-5">
                  <p className="text-xs font-semibold text-emerald-700">
                    {tTemplate(
                      t,
                      "homepage",
                      "managed.stepLabel",
                      "Step {number}",
                      { number: index + 1 }
                    )}
                  </p>
                  <h3 className="mt-1 text-base font-semibold text-stone-950">
                    {t(
                      "homepage",
                      `managed.steps.${step.key}.title`,
                      step.title
                    )}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    {t(
                      "homepage",
                      `managed.steps.${step.key}.description`,
                      step.copy
                    )}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </SectionShell>
  );
}

function TrustArchitecture({
  section,
  t,
}: {
  section?: HomepageSectionView;
  t: Translate;
}) {
  return (
    <SectionShell
      eyebrow={sectionValue(
        section,
        "eyebrow",
        t("homepage", "trust.eyebrow", "Trust architecture")
      )}
      title={sectionValue(
        section,
        "title",
        t(
          "homepage",
          "trust.title",
          "Enterprise-grade controls, translated into stays."
        )
      )}
      copy={sectionCopy(
        section,
        t(
          "homepage",
          "trust.copy",
          "Verification, communication, policies, price safety, and local operations are designed into the journey."
        )
      )}
    mediaSection={section}
    mediaT={t}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {trustCards.map((card) => {
          const Icon = card.icon;

          return (
            <div
              key={card.title}
              className="rounded-md border border-stone-200 bg-white p-5 shadow-sm transition hover:border-emerald-200 hover:shadow-lg"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-md bg-emerald-50 text-emerald-800">
                  <Icon className="h-5 w-5" />
                </div>
                <span className="rounded-md border border-stone-200 px-2.5 py-1 text-xs font-semibold text-stone-500">
                  {t(
                    "homepage",
                    `trust.cards.${card.key}.state`,
                    card.state
                  )}
                </span>
              </div>
              <h3 className="mt-5 text-base font-semibold text-stone-950">
                {t("homepage", `trust.cards.${card.key}.title`, card.title)}
              </h3>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                {t(
                  "homepage",
                  `trust.cards.${card.key}.description`,
                  card.copy
                )}
              </p>
            </div>
          );
        })}
      </div>
    </SectionShell>
  );
}

function GuestPartnerSplit({
  section,
  searchParams,
  branding,
  t,
}: {
  section?: HomepageSectionView;
  searchParams?: HomePageSearchParams;
  branding: SiteBrandingView;
  t: Translate;
}) {
  return (
    <SectionShell
      className="bg-stone-950 text-white"
      eyebrow={sectionValue(
        section,
        "eyebrow",
        t("homepage", "guestsPartners.eyebrow", "Guests and partners")
      )}
      title={sectionValue(
        section,
        "title",
        t(
          "homepage",
          "guestsPartners.title",
          "Built for travelers who need confidence and partners ready for serious demand."
        )
      )}
      copy={sectionCopy(
        section,
        t(
          "homepage",
          "guestsPartners.copy",
          "Guests get clarity. Partners get standards, review, and qualified global demand."
        )
      )}
      dark
    mediaSection={section}
    mediaT={t}
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AudiencePanel
          title={t("homepage", "guests.title", "For guests")}
          copy={t(
            "homepage",
            "guests.description",
            "Travelers get a clearer path into Kantara stays: verified inventory, structured policies, platform-managed communication, and stronger expectations before arrival."
          )}
          cta={sectionValue(
            section,
            "ctaLabel",
            t("homepage", "hero.primary_cta", "Explore stays")
          )}
          href={sectionValue(
            section,
            "ctaHref",
            buildSearchHref(searchParams, { country: "MA" })
          )}
          icon={Plane}
          items={[
            t("homepage", "guests.bullet.verifiedStays", "Verified stays"),
            t("homepage", "guests.bullet.clearPolicies", "Clear policies"),
            t(
              "homepage",
              "guests.bullet.internationalSupport",
              "International support"
            ),
            t(
              "homepage",
              "guests.bullet.familyAndCoupleClarity",
              "Family and couple clarity"
            ),
            t(
              "homepage",
              "guests.bullet.futurePremiumConcierge",
              "Future premium concierge"
            ),
          ]}
          tone="bg-white text-stone-950"
          branding={branding}
        />
        <AudiencePanel
          title={t("homepage", "partners.title", "For partners")}
          copy={t(
            "homepage",
            "partners.description",
            "Owners, agencies, riad operators, villa operators, and portfolios get a managed channel with approval, listing standards, and operational support."
          )}
          cta={sectionValue(
            section,
            "secondaryCtaLabel",
            t("homepage", "featured.apply_partner", "Apply as partner")
          )}
          href={sectionValue(
            section,
            "secondaryCtaHref",
            "/partner/apply"
          )}
          icon={Building2}
          items={[
            t(
              "homepage",
              "partners.bullet.propertyOnboarding",
              "Property onboarding"
            ),
            t("homepage", "partners.bullet.adminApproval", "Admin approval"),
            t("homepage", "partners.bullet.managedDemand", "Managed demand"),
            t(
              "homepage",
              "partners.bullet.listingStandards",
              "Listing standards"
            ),
            t(
              "homepage",
              "partners.bullet.operationalSupport",
              "Operational support"
            ),
          ]}
          tone="bg-emerald-300 text-emerald-950"
          branding={branding}
        />
      </div>
    </SectionShell>
  );
}

function AudiencePanel({
  title,
  copy,
  cta,
  href,
  icon: Icon,
  items,
  tone,
  branding,
}: {
  title: string;
  copy: string;
  cta: string;
  href: string;
  icon: LucideIcon;
  items: string[];
  tone: string;
  branding: SiteBrandingView;
}) {
  return (
    <div className={cn("rounded-md p-6 shadow-2xl shadow-black/20", tone)}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-black/10">
          <Icon className="h-6 w-6" />
        </div>
        <Link
          href={href}
          className={cn(
            "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition",
            primaryButtonClass(branding)
          )}
        >
          {cta}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <h3 className="mt-8 text-3xl font-semibold">{title}</h3>
      <p className="mt-3 max-w-2xl text-sm leading-7 opacity-75 sm:text-base">
        {copy}
      </p>

      <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <div
            key={item}
            className="flex items-center gap-2 rounded-md border border-current/15 bg-white/10 px-3 py-2 text-sm font-semibold"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const moroccoStandardKeys = [
  "medinaAccess",
  "policyExpectations",
  "operatingDifferences",
  "cityArrivalPatterns",
  "multilingualReadiness",
  "documentationReview",
  "hostedVsManaged",
  "futureControls",
] as const;

function MoroccoStandards({
  section,
  t,
}: {
  section?: HomepageSectionView;
  t: Translate;
}) {
  return (
    <SectionShell
      eyebrow={sectionValue(
        section,
        "eyebrow",
        t("homepage", "moroccoStandards.eyebrow", "Morocco-specific standards")
      )}
      title={sectionValue(
        section,
        "title",
        t(
          "common",
          "brand.precision",
          "International confidence, Moroccan precision."
        )
      )}
      copy={sectionCopy(
        section,
        t(
          "homepage",
          "moroccoStandards.copy",
          "Morocco trips depend on city access, cultural context, property type, handover quality, and clear expectations."
        )
      )}
    mediaSection={section}
    mediaT={t}
    >
      <div className="grid gap-6 lg:grid-cols-[0.88fr_1.12fr] lg:items-start">
        <div className="rounded-md border border-stone-200 bg-[linear-gradient(135deg,#111827,#064e3b,#78350f)] p-6 text-white shadow-xl">
          <Map className="h-10 w-10 text-emerald-200" />
          <h3 className="mt-6 text-3xl font-semibold leading-10">
            {t(
              "homepage",
              "moroccoStandards.cardTitle",
              "Morocco-specific operating intelligence for guests and partners."
            )}
          </h3>
          <p className="mt-4 text-sm leading-7 text-white/72">
            {t(
              "homepage",
              "moroccoStandards.cardCopy",
              "The marketplace treats medina access, family policy clarity, staffed-property expectations, city behavior, and local handover as real product requirements rather than generic travel copy."
            )}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {moroccoStandards.map((standard, index) => {
            const icons = [
              DoorOpen,
              Users,
              Hotel,
              Plane,
              Languages,
              FileCheck2,
              Handshake,
              LockKeyhole,
            ];
            const Icon = icons[index] ?? CheckCircle2;

            return (
              <div
                key={standard}
                className="rounded-md border border-stone-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-stone-100 text-stone-900">
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-semibold leading-6 text-stone-800">
                    {t(
                      "homepage",
                      `moroccoStandards.${moroccoStandardKeys[index]}`,
                      standard
                    )}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </SectionShell>
  );
}

function PartnerAcquisitionBand({
  section,
  branding,
  t,
}: {
  section?: HomepageSectionView;
  branding: SiteBrandingView;
  t: Translate;
}) {
  return (
    <section className="px-4 py-10 sm:px-6 sm:py-14 lg:px-10">
      <div className="homepage-content mx-auto overflow-hidden rounded-md border border-stone-200 bg-[linear-gradient(135deg,#f8fafc,#ffffff,#ecfdf5)] shadow-2xl shadow-stone-950/10">
        <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_0.8fr] lg:p-10">
          <div>
            <div className="inline-flex items-center gap-2 rounded-md bg-stone-950 px-3 py-2 text-xs font-semibold text-white">
              <Building2 className="h-4 w-4" />
              {sectionValue(
                section,
                "badgeText",
                t("homepage", "partnerAcquisition.eyebrow", "Partner acquisition")
              )}
            </div>
            <h2 className="mt-5 max-w-3xl text-3xl font-semibold leading-10 text-stone-950 sm:text-4xl lg:text-5xl lg:leading-[1.08]">
              {sectionValue(
                section,
                "title",
                t(
                  "homepage",
                  "partnerAcquisition.title",
                  "For partners ready for serious global demand."
                )
              )}
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-stone-600 sm:text-base">
              {sectionCopy(
                section,
                t(
                  "homepage",
                  "partnerAcquisition.copy",
                  "We support individual owners, agencies, property managers, riad operators, villa operators, company portfolios, and co-hosts ready for a more managed marketplace channel."
                )
              )}
            </p>
            <Link
              href={sectionValue(section, "ctaHref", "/partner/apply")}
              className={cn(
                "mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-5 py-3 text-sm font-semibold transition",
                primaryButtonClass(branding)
              )}
            >
              {sectionValue(
                section,
                "ctaLabel",
                t("homepage", "featured.apply_partner", "Apply as partner")
              )}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {getHomepageSectionMediaUrl(section) ? (
            <HomepageSectionMedia
              section={section}
              t={t}
              heightClass="h-full min-h-[280px]"
            />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {readinessBadges.map((badge) => {
                const key = toRegistrySegment(badge);

                return (
                  <div
                    key={badge}
                    className="rounded-md border border-stone-200 bg-white p-4 shadow-sm"
                  >
                    <CheckCircle2 className="h-5 w-5 text-emerald-700" />
                    <p className="mt-3 text-sm font-semibold text-stone-900">
                      {t(
                        "homepage",
                        `partnerAcquisition.readiness.${key}`,
                        badge
                      )}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function GuestMembershipPreview({
  section,
  branding,
  t,
}: {
  section?: HomepageSectionView;
  branding: SiteBrandingView;
  t: Translate;
}) {
  const previewItems = [
    { key: "verifiedTravelerProfile", label: "Verified traveler profile" },
    { key: "prioritySupportFoundation", label: "Priority support foundation" },
    { key: "futureConciergeEligibility", label: "Future concierge eligibility" },
    { key: "curatedStayDiscovery", label: "Curated stay discovery" },
    { key: "smootherRepeatBookings", label: "Smoother repeat bookings later" },
    {
      key: "futurePrivilegeControls",
      label: "Prepared for future direct or cash-to-host privilege controls",
    },
  ];

  return (
    <SectionShell
      className="bg-[linear-gradient(180deg,#ffffff,#f8fafc)]"
      eyebrow={sectionValue(
        section,
        "eyebrow",
        t("homepage", "guestPreview.eyebrow", "Premium guest preview")
      )}
      title={sectionValue(
        section,
        "title",
        t(
          "homepage",
          "guestPreview.title",
          "Built for repeat travelers, not one-off clicks."
        )
      )}
      copy={sectionCopy(
        section,
        t(
          "homepage",
          "guestPreview.copy",
          "A preview of future traveler verification and premium privileges, presented without introducing a paid plan."
        )
      )}
    mediaSection={section}
    mediaT={t}
    >
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div className="rounded-md border border-stone-200 bg-white p-6 shadow-lg">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-md bg-stone-950 text-white">
              <Star className="h-7 w-7" />
            </div>
            <div>
              <p className="text-sm font-semibold text-stone-500">
                {sectionValue(
                  section,
                  "badgeText",
                  t("homepage", "guestPreview.comingSoon", "Coming soon")
                )}
              </p>
              <h3 className="text-2xl font-semibold text-stone-950">
                {t(
                  "homepage",
                  "guestPreview.profileTitle",
                  "Premium guest profile"
                )}
              </h3>
            </div>
          </div>
          <p className="mt-5 text-sm leading-7 text-stone-600">
            {t(
              "homepage",
              "guestPreview.profileCopy",
              "Designed to support verified travelers, curated stay access, and smoother repeat bookings as the marketplace matures."
            )}
          </p>
          <Link
            href={sectionValue(section, "ctaHref", "/account")}
            className={cn(
              "mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-5 py-3 text-sm font-semibold transition",
              primaryButtonClass(branding)
            )}
          >
            {sectionValue(
              section,
              "ctaLabel",
              t("homepage", "guestPreview.viewAccount", "View account")
            )}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {previewItems.map((item) => (
            <div
              key={item.key}
              className="rounded-md border border-stone-200 bg-white p-4 shadow-sm"
            >
              <HeartHandshake className="h-5 w-5 text-emerald-700" />
              <p className="mt-3 text-sm font-semibold leading-6 text-stone-800">
                {t(
                  "homepage",
                  `guestPreview.items.${item.key}`,
                  item.label
                )}
              </p>
            </div>
          ))}
        </div>
      </div>
    </SectionShell>
  );
}

function FinalCta({
  section,
  searchParams,
  branding,
  t,
}: {
  section?: HomepageSectionView;
  searchParams?: HomePageSearchParams;
  branding: SiteBrandingView;
  t: Translate;
}) {
  return (
    <section className="px-4 pb-12 pt-6 sm:px-6 sm:pb-16 lg:px-10">
      <div className="homepage-content mx-auto rounded-md bg-[linear-gradient(135deg,#111827,#064e3b,#7c2d12)] p-6 text-white shadow-2xl shadow-stone-950/20 sm:p-8 lg:p-12">
        <HomepageSectionMedia
          section={section}
          dark
          t={t}
          heightClass="h-56 sm:h-80"
          className="mb-8"
        />
        <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-sm font-semibold text-emerald-200">
              {sectionValue(
                section,
                "eyebrow",
                t(
                  "homepage",
                  "finalCta.eyebrow",
                  "Built for international confidence, local precision, and managed stays."
                )
              )}
            </p>
            <h2 className="mt-4 max-w-4xl text-3xl font-semibold leading-10 sm:text-4xl lg:text-6xl lg:leading-[1.06]">
              {sectionValue(
                section,
                "title",
                t(
                  "homepage",
                  "hero.subtitle",
                  "Premium stays. Reviewed partners. Managed journeys."
                )
              )}
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/70 sm:text-base">
              {sectionCopy(
                section,
                t(
                  "homepage",
                  "finalCta.copy",
                  "Kantara stays should feel clear before the trip begins."
                )
              )}
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
            <Link
              href={sectionValue(
                section,
                "ctaHref",
                buildSearchHref(searchParams, { country: "MA" })
              )}
              className={cn(
                "inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-5 py-3 text-sm font-semibold transition",
                primaryButtonClass(branding, true)
              )}
            >
              {sectionValue(
                section,
                "ctaLabel",
                t(
                  "homepage",
                  "finalCta.primaryCta",
                  "Explore verified Kantara stays"
                )
              )}
              <Search className="h-4 w-4" />
            </Link>
            <Link
              href={sectionValue(
                section,
                "secondaryCtaHref",
                "/partner/apply"
              )}
              className={cn(
                "inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-5 py-3 text-sm font-semibold transition",
                secondaryButtonClass(true)
              )}
            >
              {sectionValue(
                section,
                "secondaryCtaLabel",
                t(
                  "homepage",
                  "finalCta.secondaryCta",
                  "Become a verified partner"
                )
              )}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function EnterpriseFooter({
  section,
  branding,
  t,
}: {
  section?: HomepageSectionView;
  branding: SiteBrandingView;
  t: (namespace: string, key: string, fallback: string) => string;
}) {
  const brandName = branding.brandName ?? BRAND_NAME;
  const footerColumns = [
    {
      title: t("footer", "guests", "Guests"),
      links: [
        { label: t("common", "explore_stays", "Explore stays"), href: "/" },
        { label: t("common", "favorites", "Favorites"), href: "/favorites" },
        { label: t("common", "reservations", "Reservations"), href: "/reservations" },
        { label: t("common", "account", "Account"), href: "/account" },
      ],
    },
    {
      title: t("footer", "partners", "Partners"),
      links: [
        { label: t("common", "become_partner", "Become a partner"), href: "/partner/apply" },
        { label: t("navbar", "menu.partner_dashboard", "Partner dashboard"), href: "/partner/dashboard" },
        { label: t("navbar", "menu.my_homes", "My homes"), href: "/my-homes" },
        { label: t("footer", "listing_standards", "Listing standards") },
      ],
    },
    {
      title: t("footer", "company", "Company"),
      links: [
        { label: t("footer", "managed_marketplace", "Managed marketplace") },
        { label: t("footer", "trust_architecture", "Trust architecture") },
        { label: t("footer", "morocco_operations", "Morocco operations") },
        { label: t("footer", "help_center", "Help center") },
      ],
    },
    {
      title: t("footer", "legal", "Legal"),
      links: [
        { label: t("footer", "terms_placeholder", "Terms placeholder") },
        { label: t("footer", "privacy_placeholder", "Privacy placeholder") },
        { label: t("footer", "guest_rules_placeholder", "Guest rules placeholder") },
        { label: t("footer", "partner_rules_placeholder", "Partner rules placeholder") },
      ],
    },
  ];

  return (
    <footer className="bg-stone-950 px-4 py-12 text-white sm:px-6 lg:px-10">
      <div className="homepage-content mx-auto">
        <div className="grid gap-8 border-b border-white/10 pb-10 lg:grid-cols-[1.08fr_1.4fr]">
          <div>
            <p className="text-sm font-semibold text-emerald-200">
              {sectionValue(section, "eyebrow", brandName)}
            </p>
            <h2 className="mt-3 max-w-xl text-3xl font-semibold leading-10 sm:text-4xl">
              {sectionValue(
                section,
                "title",
                t(
                  "homepage",
                  "hero.title",
                  "Morocco stays, managed with confidence."
                )
              )}
            </h2>
            <p className="mt-4 max-w-lg text-sm leading-7 text-white/62">
              {sectionCopy(
                section,
                t(
                  "homepage",
                  "footer.copy",
                  "A premium managed marketplace for guests and partners across Morocco."
                )
              )}
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {[
                sectionValue(
                  section,
                  "badgeText",
                  t("footer", "trust_before_handover", "Trust before handover")
                ),
                t("footer", "badge.verifiedInventory", "Verified inventory"),
                t("footer", "badge.partnerReview", "Partner review"),
                t("footer", "badge.priceSnapshots", "Price snapshots"),
              ].map((badge) => (
                <span
                  key={badge}
                  className="rounded-md border border-white/12 bg-white/[0.06] px-3 py-2 text-xs font-semibold text-white/78"
                >
                  {badge}
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {footerColumns.map((column) => (
              <FooterColumn
                key={column.title}
                title={column.title}
                links={column.links}
              />
            ))}
          </div>
        </div>

        <div className="grid gap-6 py-8 lg:grid-cols-[1fr_auto_auto] lg:items-center">
          <div className="flex flex-wrap gap-2">
            {SUPPORTED_LANGUAGES.map((language) => (
              <span
                key={language.code}
                className="rounded-md border border-white/12 px-3 py-2 text-xs font-semibold text-white/72"
              >
                {language.flag} {language.code}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {SUPPORTED_CURRENCIES.map((currency) => (
              <span
                key={currency.code}
                className="rounded-md border border-white/12 px-3 py-2 text-xs font-semibold text-white/72"
              >
                {currency.symbol} {currency.code}
              </span>
            ))}
          </div>
          <div className="text-sm leading-6 text-white/62">
            {t(
              "footer",
              "help_contact_placeholder",
              "Help: support placeholder - Contact: operations placeholder"
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-white/10 pt-6 text-xs text-white/48 sm:flex-row sm:items-center sm:justify-between">
          <p>
            {tTemplate(
              t,
              "footer",
              "copyright",
              "Copyright {year} {brand}. Premium managed Kantara marketplace.",
              { year: new Date().getFullYear(), brand: brandName }
            )}
          </p>
          <p>
            {t(
              "common",
              "brand.precision",
              "International confidence, Moroccan precision."
            )}
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { label: string; href?: string }[];
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <div className="mt-4 space-y-3">
        {links.map((link) =>
          link.href ? (
            <Link
              key={link.label}
              href={link.href}
              className="block text-sm text-white/58 transition hover:text-white"
            >
              {link.label}
            </Link>
          ) : (
            <span key={link.label} className="block text-sm text-white/40">
              {link.label}
            </span>
          )
        )}
      </div>
    </div>
  );
}

function GenericHomepageSection({
  section,
  branding,
  t,
}: {
  section: HomepageSectionView;
  branding: SiteBrandingView;
  t: Translate;
}) {
  const isDark = section.themeStyle === "dark";

  return (
    <SectionShell
      className={cn(
        isDark
          ? "bg-stone-950 text-white"
          : section.themeStyle === "green"
            ? "bg-emerald-50"
            : section.themeStyle === "warm"
              ? "bg-orange-50"
              : ""
      )}
      eyebrow={sectionValue(
        section,
        "eyebrow",
        t("homepage", "generic.eyebrow", "Homepage section")
      )}
      title={sectionValue(
        section,
        "title",
        t("homepage", "generic.title", "Managed Morocco marketplace")
      )}
      copy={sectionCopy(
        section,
        t(
          "homepage",
          "generic.copy",
          "This section is controlled by the homepage builder."
        )
      )}
      dark={isDark}
      mediaSection={section}
      mediaT={t}
    >
      <div
        className={cn(
          "overflow-hidden rounded-md border shadow-lg",
          isDark ? "border-white/10 bg-white/[0.06]" : "border-stone-200 bg-white"
        )}
      >

        <div className="grid gap-6 p-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            {section.badgeText ? (
              <p
                className={cn(
                  "text-sm font-semibold",
                  isDark ? "text-emerald-200" : "text-emerald-700"
                )}
              >
                {section.badgeText}
              </p>
            ) : null}
            <h3
              className={cn(
                "mt-2 text-2xl font-semibold",
                isDark ? "text-white" : "text-stone-950"
              )}
            >
              {section.title ?? t("homepage", "generic.content", "Homepage content")}
            </h3>
            {section.subtitle ? (
              <p
                className={cn(
                  "mt-2 text-sm font-semibold",
                  isDark ? "text-white/70" : "text-stone-700"
                )}
              >
                {section.subtitle}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            {section.ctaLabel && section.ctaHref ? (
              <Link
                href={section.ctaHref}
                className={cn(
                  "inline-flex min-h-12 items-center justify-center rounded-md px-5 py-3 text-sm font-semibold transition",
                  primaryButtonClass(branding, isDark)
                )}
              >
                {section.ctaLabel}
              </Link>
            ) : null}
            {section.secondaryCtaLabel && section.secondaryCtaHref ? (
              <Link
                href={section.secondaryCtaHref}
                className={cn(
                  "inline-flex min-h-12 items-center justify-center rounded-md px-5 py-3 text-sm font-semibold transition",
                  secondaryButtonClass(isDark)
                )}
              >
                {section.secondaryCtaLabel}
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </SectionShell>
  );
}

function SectionShell({
  id,
  eyebrow,
  title,
  copy,
  children,
  className,
  dark = false,
  mediaSection,
  mediaT,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  copy: string;
  children: React.ReactNode;
  className?: string;
  dark?: boolean;
  mediaSection?: HomepageSectionView;
  mediaT?: Translate;
}) {
  return (
    <section
      id={id}
      className={cn("px-4 py-12 sm:px-6 sm:py-16 lg:px-10 lg:py-20", className)}
    >
      <div className="homepage-content mx-auto">
        <div className="mb-8 max-w-3xl sm:mb-10">
          <p
            className={cn(
              "text-sm font-semibold",
              dark ? "text-emerald-200" : "text-emerald-700"
            )}
          >
            {eyebrow}
          </p>
          <h2
            className={cn(
              "mt-3 text-3xl font-semibold leading-10 sm:text-4xl lg:text-5xl lg:leading-[1.08]",
              dark ? "text-white" : "text-stone-950"
            )}
          >
            {title}
          </h2>
          <p
            className={cn(
              "mt-4 text-sm leading-7 sm:text-base",
              dark ? "text-white/64" : "text-stone-600"
            )}
          >
            {copy}
          </p>
        </div>
        {mediaSection && mediaT ? (
          <HomepageSectionMedia
            section={mediaSection}
            dark={dark}
            t={mediaT}
            className="mb-8 sm:mb-10"
          />
        ) : null}
        {children}
      </div>
    </section>
  );
}
