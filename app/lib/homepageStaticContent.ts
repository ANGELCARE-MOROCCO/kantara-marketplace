export type HomepageQueryValue = string | number | null | undefined;

export const HOMEPAGE_DESTINATION_CARDS = [
  {
    key: "marrakech",
    city: "Marrakech",
    positioning: "Riads, villas, medina stays, and high-touch luxury escapes.",
    tags: [
      { key: "medina", label: "Medina" },
      { key: "privatePools", label: "Private pools" },
      { key: "designStays", label: "Design stays" },
    ],
    styles: "Riads, villas, dar homes",
    accent:
      "from-[#2b1711] via-[#7f1d1d] to-[#d97706] text-white border-white/15",
    layout: "lg:col-span-2 lg:row-span-2",
  },
  {
    key: "casablanca",
    city: "Casablanca",
    positioning: "Business stays, serviced apartments, and city access.",
    tags: [
      { key: "business", label: "Business" },
      { key: "apartments", label: "Apartments" },
      { key: "urbanAccess", label: "Urban access" },
    ],
    styles: "Serviced apartments, studios",
    accent:
      "from-[#0f172a] via-[#075985] to-[#0f766e] text-white border-white/15",
    layout: "",
  },
  {
    key: "rabat",
    city: "Rabat",
    positioning: "Calm capital stays for families, diplomats, and remote work.",
    tags: [
      { key: "families", label: "Families" },
      { key: "workReady", label: "Work-ready" },
      { key: "capitalCalm", label: "Capital calm" },
    ],
    styles: "Apartments, villas, guesthouses",
    accent:
      "from-[#123c2f] via-[#166534] to-[#a16207] text-white border-white/15",
    layout: "",
  },
  {
    key: "agadir",
    city: "Agadir",
    positioning: "Beach stays, family escapes, and surf-friendly properties.",
    tags: [
      { key: "beach", label: "Beach" },
      { key: "family", label: "Family" },
      { key: "surf", label: "Surf" },
    ],
    styles: "Beach houses, resorts, apartments",
    accent:
      "from-[#082f49] via-[#0369a1] to-[#0f766e] text-white border-white/15",
    layout: "md:col-span-2 lg:col-span-1",
  },
  {
    key: "tangier",
    city: "Tangier",
    positioning: "Northern gateway stays with sea views and old-city access.",
    tags: [
      { key: "seaViews", label: "Sea views" },
      { key: "gatewayCity", label: "Gateway city" },
      { key: "culture", label: "Culture" },
    ],
    styles: "Apartments, riads, guesthouses",
    accent:
      "from-[#1f2937] via-[#155e75] to-[#065f46] text-white border-white/15",
    layout: "",
  },
  {
    key: "fes",
    city: "Fes",
    positioning: "Heritage riads, traditional houses, and deep medina stays.",
    tags: [
      { key: "heritage", label: "Heritage" },
      { key: "medina", label: "Medina" },
      { key: "traditional", label: "Traditional" },
    ],
    styles: "Riads, dars, guesthouses",
    accent:
      "from-[#1c1917] via-[#854d0e] to-[#991b1b] text-white border-white/15",
    layout: "",
  },
  {
    key: "essaouira",
    city: "Essaouira",
    positioning: "Wind, art, surf, and relaxed coastal homes.",
    tags: [
      { key: "coastal", label: "Coastal" },
      { key: "surf", label: "Surf" },
      { key: "creativeStays", label: "Creative stays" },
    ],
    styles: "Surf houses, riads, apartments",
    accent:
      "from-[#164e63] via-[#0284c7] to-[#115e59] text-white border-white/15",
    layout: "",
  },
  {
    key: "chefchaouen",
    city: "Chefchaouen",
    positioning: "Mountain calm, slow travel, and distinctive blue-city stays.",
    tags: [
      { key: "mountain", label: "Mountain" },
      { key: "slowTravel", label: "Slow travel" },
      { key: "views", label: "Views" },
    ],
    styles: "Guesthouses, mountain lodges",
    accent:
      "from-[#172554] via-[#1d4ed8] to-[#0891b2] text-white border-white/15",
    layout: "",
  },
  {
    key: "dakhla",
    city: "Dakhla",
    positioning: "Lagoon stays, surf houses, and long-stay retreats.",
    tags: [
      { key: "lagoon", label: "Lagoon" },
      { key: "kitesurf", label: "Kitesurf" },
      { key: "retreats", label: "Retreats" },
    ],
    styles: "Surf houses, resort units",
    accent:
      "from-[#083344] via-[#0e7490] to-[#15803d] text-white border-white/15",
    layout: "md:col-span-2 lg:col-span-1",
  },
  {
    key: "merzouga",
    city: "Merzouga",
    positioning: "Desert camps, premium excursions, and unique Sahara stays.",
    tags: [
      { key: "desert", label: "Desert" },
      { key: "excursions", label: "Excursions" },
      { key: "uniqueStays", label: "Unique stays" },
    ],
    styles: "Desert camps, lodges",
    accent:
      "from-[#292524] via-[#92400e] to-[#b91c1c] text-white border-white/15",
    layout: "",
  },
  {
    key: "ifrane",
    city: "Ifrane",
    positioning: "Mountain air, family weekends, and winter-ready homes.",
    tags: [
      { key: "mountain", label: "Mountain" },
      { key: "families", label: "Families" },
      { key: "coolWeather", label: "Cool weather" },
    ],
    styles: "Villas, lodges, apartments",
    accent:
      "from-[#1e293b] via-[#475569] to-[#166534] text-white border-white/15",
    layout: "",
  },
  {
    key: "ouarzazate",
    city: "Ouarzazate",
    positioning: "Kasbah routes, film-country access, and desert-edge stays.",
    tags: [
      { key: "kasbahs", label: "Kasbahs" },
      { key: "routes", label: "Routes" },
      { key: "desertEdge", label: "Desert edge" },
    ],
    styles: "Guesthouses, desert lodges",
    accent:
      "from-[#27150b] via-[#9a3412] to-[#ca8a04] text-white border-white/15",
    layout: "",
  },
] as const;

export const HOMEPAGE_INTENT_CARDS = [
  {
    key: "luxuryVillasWithPool",
    title: "Luxury villas with pool",
    copy: "Private space, larger groups, and premium outdoor living.",
    params: { propertyType: "villa", filter: "pool" },
  },
  {
    key: "riadsInTheMedina",
    title: "Riads in the medina",
    copy: "Traditional stays with old-city access and stronger arrival clarity.",
    params: { propertyType: "riad", filter: "historic" },
  },
  {
    key: "beachAndSurfStays",
    title: "Beach and surf stays",
    copy: "Coastal properties for families, remote workers, and surf travel.",
    params: { filter: "surfing" },
  },
  {
    key: "desertEscapes",
    title: "Desert escapes",
    copy: "Sahara-facing camps and lodges for distinctive Morocco itineraries.",
    params: { propertyType: "desert_camp" },
  },
  {
    key: "familyReadyHomes",
    title: "Family-ready homes",
    copy: "Practical stays with space, policy clarity, and arrival confidence.",
    params: { guest: 4 },
  },
  {
    key: "businessTravelReady",
    title: "Business travel ready",
    copy: "City access, work-ready stays, and cleaner operational expectations.",
    params: { propertyType: "hotel_apartment" },
  },
  {
    key: "longStayFriendly",
    title: "Long-stay friendly",
    copy: "Apartments and residences suited to slower trips and repeat guests.",
    params: { propertyType: "apartment" },
  },
  {
    key: "staffedProperties",
    title: "Staffed properties",
    copy: "Premium homes where service, readiness, and handover matter.",
    params: { propertyType: "luxury_residence" },
  },
  {
    key: "premiumVerifiedStays",
    title: "Premium verified stays",
    copy: "Approved inventory with stronger review and marketplace standards.",
    params: { filter: "luxe" },
  },
  {
    key: "moroccanTraditionalStays",
    title: "Moroccan traditional stays",
    copy: "Riads, dars, and homes built around local character and detail.",
    params: { propertyType: "traditional_house" },
  },
] as const satisfies readonly {
  key: string;
  title: string;
  copy: string;
  params: Record<string, HomepageQueryValue>;
}[];

export const HOMEPAGE_MANAGED_STEPS = [
  {
    key: "discover",
    title: "Discover",
    copy: "Search Kantara stays through verified inventory and intent-led discovery.",
  },
  {
    key: "request",
    title: "Request",
    copy: "Guests move through a platform flow instead of unmanaged back-channel ambiguity.",
  },
  {
    key: "platformVerification",
    title: "Platform verification",
    copy: "The listing, partner, and booking context stay visible to operations.",
  },
  {
    key: "confirmation",
    title: "Confirmation",
    copy: "Terms, prices, and stay details are structured before the guest commits.",
  },
  {
    key: "managedHandover",
    title: "Managed handover",
    copy: "The foundation is designed for controlled arrivals and property handover.",
  },
  {
    key: "stayProtected",
    title: "Stay protected",
    copy: "Price snapshots and policy clarity reduce surprises after confirmation.",
  },
] as const;

export const HOMEPAGE_TRUST_CARDS = [
  {
    key: "partnerVerification",
    title: "Partner verification",
    copy: "Partners move through review before public demand is exposed.",
    state: "Foundation active",
  },
  {
    key: "propertyReadinessReview",
    title: "Property readiness review",
    copy: "Listings are structured around standards, media, capacity, and operating details.",
    state: "Approval based",
  },
  {
    key: "communicationControl",
    title: "Communication control",
    copy: "Designed so guest and partner communication can remain platform managed.",
    state: "Platform-led",
  },
  {
    key: "priceSnapshotProtection",
    title: "Price snapshot protection",
    copy: "Reservation snapshots preserve agreed pricing after listing changes.",
    state: "In place",
  },
  {
    key: "policyClarity",
    title: "Policy clarity",
    copy: "The product is built to make house rules and Morocco-specific expectations explicit.",
    state: "Structured",
  },
  {
    key: "moroccoLocalOperations",
    title: "Morocco-local operations",
    copy: "City, arrival, medina, family, and handover realities are treated as product concerns.",
    state: "Specialized",
  },
  {
    key: "premiumGuestVerification",
    title: "Premium guest verification",
    copy: "Prepared for richer traveler profiles and future premium guest privileges.",
    state: "Prepared for",
  },
  {
    key: "disputeReadinessLater",
    title: "Dispute readiness later",
    copy: "Designed to support clearer evidence, terms, and operational history over time.",
    state: "Coming later",
  },
] as const;

export const HOMEPAGE_MOROCCO_STANDARDS = [
  {
    key: "medinaAccess",
    label: "Medina access and luggage handoff realities",
  },
  {
    key: "policyExpectations",
    label: "Couple, family, and local guest policy expectations",
  },
  {
    key: "operatingDifferences",
    label: "Riad, villa, apartment, and staffed-home operating differences",
  },
  {
    key: "cityArrivalPatterns",
    label: "City-specific arrival patterns from airports, stations, and old towns",
  },
  {
    key: "multilingualReadiness",
    label: "Multilingual readiness for international and Moroccan diaspora guests",
  },
  {
    key: "documentationReview",
    label: "Property documentation, listing quality, and readiness review",
  },
  {
    key: "hostedVsManaged",
    label: "Hosted versus managed expectations made clearer before booking",
  },
  {
    key: "futureControls",
    label: "Prepared for later transfer, direct-settlement, and premium privilege controls",
  },
] as const;

export const HOMEPAGE_READINESS_BADGES = [
  { key: "documents", label: "Documents" },
  { key: "operations", label: "Operations" },
  { key: "guestStandards", label: "Guest standards" },
  { key: "platformHandover", label: "Platform handover" },
  { key: "listingQuality", label: "Listing quality" },
  { key: "complianceReadiness", label: "Compliance readiness" },
] as const;

export const HOMEPAGE_GUEST_PANEL = {
  key: "guests",
  title: "For guests",
  copy:
    "Travelers get a clearer path into Kantara stays: verified inventory, structured policies, platform-managed communication, and stronger expectations before arrival.",
  bullets: [
    { key: "verifiedStays", label: "Verified stays" },
    { key: "clearPolicies", label: "Clear policies" },
    { key: "internationalSupport", label: "International support" },
    { key: "familyAndCoupleClarity", label: "Family and couple clarity" },
    { key: "futurePremiumConcierge", label: "Future premium concierge" },
  ],
} as const;

export const HOMEPAGE_PARTNER_PANEL = {
  key: "partners",
  title: "For partners",
  copy:
    "Owners, agencies, riad operators, villa operators, and portfolios get a managed channel with approval, listing standards, and operational support.",
  bullets: [
    { key: "propertyOnboarding", label: "Property onboarding" },
    { key: "adminApproval", label: "Admin approval" },
    { key: "managedDemand", label: "Managed demand" },
    { key: "listingStandards", label: "Listing standards" },
    { key: "operationalSupport", label: "Operational support" },
  ],
} as const;

export const HOMEPAGE_GUEST_PREVIEW_ITEMS = [
  { key: "verifiedTravelerProfile", label: "Verified traveler profile" },
  { key: "prioritySupportFoundation", label: "Priority support foundation" },
  { key: "futureConciergeEligibility", label: "Future concierge eligibility" },
  { key: "curatedStayDiscovery", label: "Curated stay discovery" },
  { key: "smootherRepeatBookings", label: "Smoother repeat bookings later" },
  {
    key: "futurePrivilegeControls",
    label: "Prepared for future direct or cash-to-host privilege controls",
  },
] as const;

export const HOMEPAGE_FEATURED_EMPTY_REVIEW_ITEMS = [
  { key: "partnerReview", label: "Partner review" },
  { key: "propertyReadiness", label: "Property readiness" },
  { key: "mediaQuality", label: "Media quality" },
] as const;

export const HOMEPAGE_FOOTER_BADGES = [
  { key: "verifiedInventory", label: "Verified inventory" },
  { key: "partnerReview", label: "Partner review" },
  { key: "priceSnapshots", label: "Price snapshots" },
] as const;
