import "server-only";

export type AdminModuleId =
  | "marketplace_operations"
  | "bookings"
  | "guests"
  | "partner_operations"
  | "property_trust"
  | "homepage_builder"
  | "globalization"
  | "premium_guests"
  | "handover"
  | "payments"
  | "disputes"
  | "verifications"
  | "settings";

export type AdminModuleMeta = {
  id: AdminModuleId;
  title: string;
  description: string;
  href: string;
  icon: string;
  requiresProvider?: "paypal";
};

export const ADMIN_MODULES: AdminModuleMeta[] = [
  {
    id: "marketplace_operations",
    title: "Marketplace Operations",
    description: "Live operating picture across supply, demand, trust, payments, and handover.",
    href: "/admin/marketplace-operations",
    icon: "activity",
  },
  {
    id: "bookings",
    title: "Bookings",
    description: "Reservation lifecycle, protected price snapshots, and linked operations.",
    href: "/admin/bookings",
    icon: "calendar",
  },
  {
    id: "guests",
    title: "Guests",
    description: "Guest accounts, reservation history, favorites, verification, and premium readiness.",
    href: "/admin/guests",
    icon: "users",
  },
  {
    id: "partner_operations",
    title: "Partner Operations",
    description: "Partner onboarding, readiness, compliance flags, and lifecycle actions.",
    href: "/admin/partner-operations",
    icon: "handshake",
  },
  {
    id: "property_trust",
    title: "Property Trust Center",
    description: "Listing content review, public approval readiness, media, pricing, and translations.",
    href: "/admin/property-trust",
    icon: "home",
  },
  {
    id: "homepage_builder",
    title: "Homepage Builder",
    description: "Control homepage sections, brand visuals, media, CTAs, and public presentation.",
    href: "/admin/homepage-builder",
    icon: "gallery",
  },
  {
    id: "globalization",
    title: "Currency & Localization Control",
    description: "Currencies, exchange sync, language coverage, translation inventory, and CSV workflow.",
    href: "/admin/globalization",
    icon: "globe",
  },
  {
    id: "premium_guests",
    title: "Premium Guests",
    description: "Verified traveler pipeline and eligibility operations without paid-plan claims.",
    href: "/admin/premium-guests",
    icon: "sparkles",
  },
  {
    id: "handover",
    title: "Handover",
    description: "Managed arrivals, departures, readiness checklists, and handover issue control.",
    href: "/admin/handover",
    icon: "key",
  },
  {
    id: "payments",
    title: "Payments",
    description: "PayPal-backed payment records, terminal readiness, capture, and settlement control.",
    href: "/admin/payments",
    icon: "credit-card",
    requiresProvider: "paypal",
  },
  {
    id: "disputes",
    title: "Disputes",
    description: "Operational incidents, linked cases, priority triage, and resolution workflows.",
    href: "/admin/disputes",
    icon: "shield-alert",
  },
  {
    id: "verifications",
    title: "Verifications",
    description: "Trust, compliance, property quality, payment risk, and readiness verification queue.",
    href: "/admin/verifications",
    icon: "badge-check",
  },
  {
    id: "settings",
    title: "Settings",
    description: "System readiness, provider configuration, and shortcuts to operating controls.",
    href: "/admin/settings",
    icon: "settings",
  },
];

export function getAdminModule(id: AdminModuleId) {
  return ADMIN_MODULES.find((module) => module.id === id);
}
