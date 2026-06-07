import type { HomepageSection, SiteBranding } from "@prisma/client";
import {
  BRAND_NAME,
  BRAND_POSITIONING,
  BRAND_PRECISION_LINE,
  BRAND_RULES_LINE,
} from "./globalization";

export type HomepageSectionView = {
  id: string;
  sectionKey: string;
  type: string;
  title: string | null;
  eyebrow: string | null;
  subtitle: string | null;
  body: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  secondaryCtaLabel: string | null;
  secondaryCtaHref: string | null;
  imageUrl: string | null;
  backgroundImageUrl: string | null;
  badgeText: string | null;
  layoutStyle: string | null;
  themeStyle: string | null;
  spacing: string | null;
  alignment: string | null;
  metadata: string | null;
  sortOrder: number;
  isVisible: boolean;
  isLocked: boolean;
};

export type SiteBrandingView = {
  id: string | null;
  brandName: string | null;
  logoUrl: string | null;
  logoAltText: string | null;
  logoHref: string;
  logoPlacement: string;
  logoSize: string;
  logoDisplayMode: string;
  logoWidth: number | null;
  logoHeight: number | null;
  mobileLogoWidth: number | null;
  mobileLogoHeight: number | null;
  showLogo: boolean;
  showBrandName: boolean;
  themeMode: string;
  heroAlignment: string;
  heroVisualDensity: string;
  contentWidth: string;
  buttonStyle: string;
  sectionRadius: string;
  showMetricsStrip: boolean;
  showTrustPanels: boolean;
  showFeaturedListings: boolean;
  showFooter: boolean;
};

export const HOMEPAGE_SECTION_TYPES = [
  {
    value: "hero",
    label: "Cinematic hero",
    description: "Primary public homepage opening section.",
  },
  {
    value: "search_command",
    label: "Search command bar",
    description: "Homepage search controls and primary discovery command.",
  },
  {
    value: "metrics_strip",
    label: "Marketplace intelligence",
    description: "Real approved inventory metrics computed from the database.",
  },
  {
    value: "destination_command",
    label: "Destination command center",
    description: "City-led Morocco discovery paths.",
  },
  {
    value: "intent_discovery",
    label: "Guest intent discovery",
    description: "Discovery paths based on traveler intent.",
  },
  {
    value: "featured_listings",
    label: "Featured approved listings",
    description: "Real approved listings only.",
  },
  {
    value: "managed_marketplace",
    label: "Managed marketplace",
    description: "Explanation of operational marketplace controls.",
  },
  {
    value: "trust_architecture",
    label: "Trust architecture",
    description: "Trust, verification, and operational standards.",
  },
  {
    value: "guests_partners",
    label: "Guests vs partners",
    description: "Two-sided marketplace split.",
  },
  {
    value: "morocco_standards",
    label: "Morocco standards",
    description: "Morocco-specific marketplace requirements.",
  },
  {
    value: "partner_acquisition",
    label: "Partner acquisition",
    description: "Partner growth and application prompt.",
  },
  {
    value: "guest_preview",
    label: "Premium guest preview",
    description: "Future guest membership and account readiness.",
  },
  {
    value: "final_cta",
    label: "Final CTA",
    description: "Closing guest and partner calls to action.",
  },
  {
    value: "enterprise_footer",
    label: "Enterprise footer",
    description: "Global marketplace footer and operational links.",
  },
  {
    value: "custom",
    label: "Custom content block",
    description: "Flexible editorial block for additional content.",
  },
] as const;

export const HOMEPAGE_THEME_MODES = [
  { value: "premium_dark", label: "Premium dark" },
  { value: "light_editorial", label: "Light editorial" },
  { value: "luxury_green", label: "Luxury green" },
  { value: "desert_warm", label: "Desert warm" },
  { value: "minimal_global", label: "Minimal global" },
] as const;

export const HERO_ALIGNMENT_OPTIONS = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "split", label: "Split" },
] as const;

export const HERO_VISUAL_DENSITY_OPTIONS = [
  { value: "clean", label: "Clean" },
  { value: "standard", label: "Standard" },
  { value: "rich", label: "Rich" },
] as const;

export const LOGO_PLACEMENT_OPTIONS = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
] as const;

export const LOGO_SIZE_OPTIONS = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
  { value: "custom", label: "Custom" },
] as const;

export type LogoSizeKey = (typeof LOGO_SIZE_OPTIONS)[number]["value"];

export type LogoDisplaySize = {
  sizeKey: LogoSizeKey;
  width: number;
  height: number | null;
  maxHeight: number;
  isCustom: boolean;
  usingCustomFallback: boolean;
};

export const DESKTOP_LOGO_SIZE_MAP: Record<
  LogoSizeKey,
  { width: number; maxHeight: number }
> = {
  small: { width: 84, maxHeight: 44 },
  medium: { width: 128, maxHeight: 58 },
  large: { width: 180, maxHeight: 78 },
  custom: { width: 180, maxHeight: 78 },
};

export const MOBILE_LOGO_SIZE_MAP: Record<
  LogoSizeKey,
  { width: number; maxHeight: number }
> = {
  small: { width: 56, maxHeight: 44 },
  medium: { width: 76, maxHeight: 52 },
  large: { width: 96, maxHeight: 60 },
  custom: { width: 96, maxHeight: 60 },
};

export function getLogoSizeKey(value?: string | null): LogoSizeKey {
  return LOGO_SIZE_OPTIONS.some((option) => option.value === value)
    ? (value as LogoSizeKey)
    : "medium";
}

export function getLogoDisplaySize(
  branding: SiteBrandingView,
  compact = false
): LogoDisplaySize {
  const sizeKey = getLogoSizeKey(branding.logoSize);
  const sizeMap = compact ? MOBILE_LOGO_SIZE_MAP : DESKTOP_LOGO_SIZE_MAP;
  const preset = sizeMap[sizeKey === "custom" ? "large" : sizeKey];

  if (sizeKey !== "custom") {
    return {
      sizeKey,
      width: preset.width,
      height: null,
      maxHeight: preset.maxHeight,
      isCustom: false,
      usingCustomFallback: false,
    };
  }

  const customWidth = compact ? branding.mobileLogoWidth : branding.logoWidth;
  const customHeight = compact ? branding.mobileLogoHeight : branding.logoHeight;

  return {
    sizeKey,
    width: customWidth ?? preset.width,
    height: customHeight ?? null,
    maxHeight: Math.max(customHeight ?? 0, preset.maxHeight),
    isCustom: true,
    usingCustomFallback: customWidth === null && customHeight === null,
  };
}

export const LOGO_DISPLAY_MODE_OPTIONS = [
  { value: "image", label: "Image" },
  { value: "text", label: "Text" },
  { value: "image_text", label: "Image and text" },
] as const;

export const CONTENT_WIDTH_OPTIONS = [
  { value: "compact", label: "Compact" },
  { value: "standard", label: "Standard" },
  { value: "wide", label: "Wide" },
] as const;

export const BUTTON_STYLE_OPTIONS = [
  { value: "solid", label: "Solid" },
  { value: "outline", label: "Outline" },
  { value: "premium", label: "Premium" },
] as const;

export const SECTION_RADIUS_OPTIONS = [
  { value: "soft", label: "Soft" },
  { value: "rounded", label: "Rounded" },
  { value: "editorial", label: "Editorial" },
] as const;

export const LAYOUT_STYLE_OPTIONS = [
  { value: "editorial", label: "Editorial" },
  { value: "split", label: "Split" },
  { value: "grid", label: "Grid" },
  { value: "band", label: "Band" },
  { value: "compact", label: "Compact" },
] as const;

export const SECTION_THEME_STYLE_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "green", label: "Green" },
  { value: "warm", label: "Warm" },
] as const;

export const SECTION_SPACING_OPTIONS = [
  { value: "compact", label: "Compact" },
  { value: "standard", label: "Standard" },
  { value: "spacious", label: "Spacious" },
] as const;

export const SECTION_ALIGNMENT_OPTIONS = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "split", label: "Split" },
] as const;

export const BACKGROUND_STYLE_OPTIONS = [
  { value: "clean", label: "Clean" },
  { value: "soft_gradient", label: "Soft gradient" },
  { value: "dark_gradient", label: "Dark gradient" },
  { value: "image", label: "Image" },
] as const;

export const DEFAULT_SITE_BRANDING: SiteBrandingView = {
  id: null,
  brandName: BRAND_NAME,
  logoUrl: null,
  logoAltText: `${BRAND_NAME} logo`,
  logoHref: "/",
  logoPlacement: "left",
  logoSize: "medium",
  logoDisplayMode: "image_text",
  logoWidth: null,
  logoHeight: null,
  mobileLogoWidth: null,
  mobileLogoHeight: null,
  showLogo: true,
  showBrandName: true,
  themeMode: "premium_dark",
  heroAlignment: "split",
  heroVisualDensity: "clean",
  contentWidth: "standard",
  buttonStyle: "premium",
  sectionRadius: "rounded",
  showMetricsStrip: true,
  showTrustPanels: true,
  showFeaturedListings: true,
  showFooter: true,
};

export const DEFAULT_HOMEPAGE_SECTIONS: HomepageSectionView[] = [
  {
    sectionKey: "default-hero",
    type: "hero",
    eyebrow: "Premium managed Morocco marketplace",
    badgeText: BRAND_RULES_LINE,
    title: BRAND_POSITIONING,
    subtitle: "Premium stays. Reviewed partners. Managed journeys.",
    body: "Built for travelers who need more than a listing.",
    ctaLabel: "Explore stays",
    ctaHref: "/?country=MA#featured-stays",
    secondaryCtaLabel: "Become a partner",
    secondaryCtaHref: "/partner/apply",
    imageUrl: null,
    backgroundImageUrl: null,
    layoutStyle: "split",
    themeStyle: "dark",
    spacing: "spacious",
    alignment: "split",
    metadata: null,
    sortOrder: 10,
    isVisible: true,
    isLocked: false,
    id: "default-hero",
  },
  {
    sectionKey: "default-search-command",
    type: "search_command",
    eyebrow: "Search command",
    title: "Search Morocco with operational clarity.",
    subtitle: "Destination, dates, guests, and stay style in one readable command.",
    body: "No inflated inventory. No vague marketplace promises.",
    ctaLabel: "Explore stays",
    ctaHref: "/?country=MA#featured-stays",
    secondaryCtaLabel: null,
    secondaryCtaHref: null,
    imageUrl: null,
    backgroundImageUrl: null,
    badgeText: null,
    layoutStyle: "band",
    themeStyle: "dark",
    spacing: "standard",
    alignment: "left",
    metadata: null,
    sortOrder: 20,
    isVisible: true,
    isLocked: false,
    id: "default-search-command",
  },
  {
    sectionKey: "default-metrics-strip",
    type: "metrics_strip",
    eyebrow: "Marketplace intelligence",
    title: "Real numbers from approved inventory.",
    subtitle: "Only reviewed public stays are counted.",
    body: "Coverage, pricing, styles, and managed communication are computed from live listings.",
    ctaLabel: null,
    ctaHref: null,
    secondaryCtaLabel: null,
    secondaryCtaHref: null,
    imageUrl: null,
    backgroundImageUrl: null,
    badgeText: null,
    layoutStyle: "grid",
    themeStyle: "light",
    spacing: "compact",
    alignment: "left",
    metadata: null,
    sortOrder: 30,
    isVisible: true,
    isLocked: false,
    id: "default-metrics-strip",
  },
  {
    sectionKey: "default-destination-command",
    type: "destination_command",
    eyebrow: "Destination command center",
    title: "Morocco discovery built around real trip behavior.",
    subtitle: "From riads to villas, every stay deserves operational clarity.",
    body: "Browse cities by stay style, arrival reality, and local context.",
    ctaLabel: null,
    ctaHref: null,
    secondaryCtaLabel: null,
    secondaryCtaHref: null,
    imageUrl: null,
    backgroundImageUrl: null,
    badgeText: null,
    layoutStyle: "grid",
    themeStyle: "default",
    spacing: "spacious",
    alignment: "left",
    metadata: null,
    sortOrder: 40,
    isVisible: true,
    isLocked: false,
    id: "default-destination-command",
  },
  {
    sectionKey: "default-intent-discovery",
    type: "intent_discovery",
    eyebrow: "Guest intent discovery",
    title: "Find the trip behind the search.",
    subtitle: "Luxury, family, surf, desert, business, and long-stay paths.",
    body: "Short routes into verified Morocco inventory without fake result counts.",
    ctaLabel: null,
    ctaHref: null,
    secondaryCtaLabel: null,
    secondaryCtaHref: null,
    imageUrl: null,
    backgroundImageUrl: null,
    badgeText: null,
    layoutStyle: "grid",
    themeStyle: "dark",
    spacing: "spacious",
    alignment: "left",
    metadata: null,
    sortOrder: 50,
    isVisible: true,
    isLocked: false,
    id: "default-intent-discovery",
  },
  {
    sectionKey: "default-featured-listings",
    type: "featured_listings",
    eyebrow: "Featured approved listings",
    title: "Real approved properties. Never fabricated inventory.",
    subtitle: "Premium stays appear only after approval.",
    body: "Cards are sourced from reviewed public listings and use safe media fallbacks.",
    ctaLabel: "Explore all stays",
    ctaHref: "/?country=MA#featured-stays",
    secondaryCtaLabel: null,
    secondaryCtaHref: null,
    imageUrl: null,
    backgroundImageUrl: null,
    badgeText: null,
    layoutStyle: "grid",
    themeStyle: "light",
    spacing: "spacious",
    alignment: "left",
    metadata: null,
    sortOrder: 60,
    isVisible: true,
    isLocked: false,
    id: "default-featured-listings",
  },
  {
    sectionKey: "default-managed-marketplace",
    type: "managed_marketplace",
    eyebrow: "Managed marketplace",
    title: "A marketplace built for trust before handover.",
    subtitle: "Reviewed partners, structured data, price snapshots, and platform-led journeys.",
    body: "The product is designed to reduce ambiguity before guests commit.",
    ctaLabel: null,
    ctaHref: null,
    secondaryCtaLabel: null,
    secondaryCtaHref: null,
    imageUrl: null,
    backgroundImageUrl: null,
    badgeText: null,
    layoutStyle: "grid",
    themeStyle: "light",
    spacing: "spacious",
    alignment: "left",
    metadata: null,
    sortOrder: 70,
    isVisible: true,
    isLocked: false,
    id: "default-managed-marketplace",
  },
  {
    sectionKey: "default-trust-architecture",
    type: "trust_architecture",
    eyebrow: "Trust architecture",
    title: "Enterprise-grade controls, translated into stays.",
    subtitle: "Verification, communication, policies, price safety, and local operations.",
    body: "Confidence is designed into the journey before arrival.",
    ctaLabel: null,
    ctaHref: null,
    secondaryCtaLabel: null,
    secondaryCtaHref: null,
    imageUrl: null,
    backgroundImageUrl: null,
    badgeText: null,
    layoutStyle: "grid",
    themeStyle: "light",
    spacing: "spacious",
    alignment: "left",
    metadata: null,
    sortOrder: 80,
    isVisible: true,
    isLocked: false,
    id: "default-trust-architecture",
  },
  {
    sectionKey: "default-guests-partners",
    type: "guests_partners",
    eyebrow: "Guests and partners",
    title: "Built for travelers who need confidence and partners ready for serious demand.",
    subtitle: "One managed marketplace, two clear operating paths.",
    body: "Guests get clarity. Partners get standards, review, and qualified global demand.",
    ctaLabel: "Explore stays",
    ctaHref: "/?country=MA#featured-stays",
    secondaryCtaLabel: "Apply as partner",
    secondaryCtaHref: "/partner/apply",
    imageUrl: null,
    backgroundImageUrl: null,
    badgeText: null,
    layoutStyle: "split",
    themeStyle: "dark",
    spacing: "spacious",
    alignment: "split",
    metadata: null,
    sortOrder: 90,
    isVisible: true,
    isLocked: false,
    id: "default-guests-partners",
  },
  {
    sectionKey: "default-morocco-standards",
    type: "morocco_standards",
    eyebrow: "Morocco-specific standards",
    title: BRAND_PRECISION_LINE,
    subtitle: "City access, local expectations, property type, and handover quality matter.",
    body: "Morocco is not treated like a generic destination template.",
    ctaLabel: null,
    ctaHref: null,
    secondaryCtaLabel: null,
    secondaryCtaHref: null,
    imageUrl: null,
    backgroundImageUrl: null,
    badgeText: null,
    layoutStyle: "split",
    themeStyle: "default",
    spacing: "spacious",
    alignment: "left",
    metadata: null,
    sortOrder: 100,
    isVisible: true,
    isLocked: false,
    id: "default-morocco-standards",
  },
  {
    sectionKey: "default-partner-acquisition",
    type: "partner_acquisition",
    eyebrow: "Partner acquisition",
    title: "For partners ready for serious global demand.",
    subtitle: "Owners, riads, villa operators, agencies, and portfolios can apply.",
    body: "Listing quality, documents, policies, and operational readiness shape approval.",
    ctaLabel: "Apply as partner",
    ctaHref: "/partner/apply",
    secondaryCtaLabel: null,
    secondaryCtaHref: null,
    imageUrl: null,
    backgroundImageUrl: null,
    badgeText: "Partner operations",
    layoutStyle: "band",
    themeStyle: "green",
    spacing: "spacious",
    alignment: "left",
    metadata: null,
    sortOrder: 110,
    isVisible: true,
    isLocked: false,
    id: "default-partner-acquisition",
  },
  {
    sectionKey: "default-guest-preview",
    type: "guest_preview",
    eyebrow: "Premium guest preview",
    title: "Built for repeat travelers, not one-off clicks.",
    subtitle: "Verified profiles and future premium privileges are planned carefully.",
    body: "The account layer can mature without overstating products that are not live yet.",
    ctaLabel: "View account",
    ctaHref: "/account",
    secondaryCtaLabel: null,
    secondaryCtaHref: null,
    imageUrl: null,
    backgroundImageUrl: null,
    badgeText: "Coming soon",
    layoutStyle: "split",
    themeStyle: "light",
    spacing: "spacious",
    alignment: "left",
    metadata: null,
    sortOrder: 120,
    isVisible: true,
    isLocked: false,
    id: "default-guest-preview",
  },
  {
    sectionKey: "default-final-cta",
    type: "final_cta",
    eyebrow: "Managed journeys",
    title: "Premium stays. Reviewed partners. Managed journeys.",
    subtitle: "Kantara stays should feel clear before the trip begins.",
    body: "Start with approved homes or apply to bring serious inventory onto the marketplace.",
    ctaLabel: "Explore verified Kantara stays",
    ctaHref: "/?country=MA#featured-stays",
    secondaryCtaLabel: "Become a verified partner",
    secondaryCtaHref: "/partner/apply",
    imageUrl: null,
    backgroundImageUrl: null,
    badgeText: null,
    layoutStyle: "band",
    themeStyle: "dark",
    spacing: "spacious",
    alignment: "split",
    metadata: null,
    sortOrder: 130,
    isVisible: true,
    isLocked: false,
    id: "default-final-cta",
  },
  {
    sectionKey: "default-enterprise-footer",
    type: "enterprise_footer",
    eyebrow: BRAND_NAME,
    title: BRAND_POSITIONING,
    subtitle: BRAND_RULES_LINE,
    body: "A premium managed marketplace for guests and partners across Morocco.",
    ctaLabel: "Partner help",
    ctaHref: "/partner/apply",
    secondaryCtaLabel: "Guest account",
    secondaryCtaHref: "/account",
    imageUrl: null,
    backgroundImageUrl: null,
    badgeText: "Trust before handover",
    layoutStyle: "footer",
    themeStyle: "dark",
    spacing: "standard",
    alignment: "left",
    metadata: null,
    sortOrder: 140,
    isVisible: true,
    isLocked: false,
    id: "default-enterprise-footer",
  },
];

export function getDefaultHomepageSections() {
  return DEFAULT_HOMEPAGE_SECTIONS.map((section) => ({ ...section }));
}

export function getSectionTypeLabel(type?: string | null) {
  return (
    HOMEPAGE_SECTION_TYPES.find((item) => item.value === type)?.label ??
    "Custom content block"
  );
}

export function getOptionValues<T extends readonly { value: string }[]>(
  options: T
) {
  return options.map((option) => option.value);
}

export function normalizeSiteBranding(
  branding?: SiteBranding | null
): SiteBrandingView {
  if (!branding) return { ...DEFAULT_SITE_BRANDING };

  return {
    id: branding.id,
    brandName: branding.brandName ?? DEFAULT_SITE_BRANDING.brandName,
    logoUrl: branding.logoUrl ?? null,
    logoAltText:
      branding.logoAltText ?? branding.brandName ?? `${BRAND_NAME} logo`,
    logoHref: branding.logoHref || "/",
    logoPlacement: branding.logoPlacement || "left",
    logoSize: branding.logoSize || "medium",
    logoDisplayMode: branding.logoDisplayMode || "image_text",
    logoWidth: branding.logoWidth,
    logoHeight: branding.logoHeight,
    mobileLogoWidth: branding.mobileLogoWidth,
    mobileLogoHeight: branding.mobileLogoHeight,
    showLogo: branding.showLogo,
    showBrandName: branding.showBrandName,
    themeMode: branding.themeMode || "premium_dark",
    heroAlignment: branding.heroAlignment || "split",
    heroVisualDensity: branding.heroVisualDensity || "clean",
    contentWidth: branding.contentWidth || "standard",
    buttonStyle: branding.buttonStyle || "premium",
    sectionRadius: branding.sectionRadius || "rounded",
    showMetricsStrip: branding.showMetricsStrip,
    showTrustPanels: branding.showTrustPanels,
    showFeaturedListings: branding.showFeaturedListings,
    showFooter: branding.showFooter,
  };
}

export function normalizeHomepageSection(
  section: HomepageSection
): HomepageSectionView {
  return {
    id: section.id,
    sectionKey: section.sectionKey,
    type: section.type,
    title: section.title,
    eyebrow: section.eyebrow,
    subtitle: section.subtitle,
    body: section.body,
    ctaLabel: section.ctaLabel,
    ctaHref: section.ctaHref,
    secondaryCtaLabel: section.secondaryCtaLabel,
    secondaryCtaHref: section.secondaryCtaHref,
    imageUrl: section.imageUrl,
    backgroundImageUrl: section.backgroundImageUrl,
    badgeText: section.badgeText,
    layoutStyle: section.layoutStyle,
    themeStyle: section.themeStyle,
    spacing: section.spacing,
    alignment: section.alignment,
    metadata: section.metadata,
    sortOrder: section.sortOrder,
    isVisible: section.isVisible,
    isLocked: section.isLocked,
  };
}

export function shouldRenderSectionType(
  type: string,
  branding: SiteBrandingView
) {
  if (type === "metrics_strip") return branding.showMetricsStrip;
  if (type === "featured_listings") return branding.showFeaturedListings;
  if (type === "trust_architecture") return branding.showTrustPanels;
  if (type === "enterprise_footer") return branding.showFooter;

  return true;
}

export function buildHomepageSectionKey(type: string) {
  return `${type}-${Date.now().toString(36)}`;
}
