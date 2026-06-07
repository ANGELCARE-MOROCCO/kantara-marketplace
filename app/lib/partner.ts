export const PARTNER_APPLICATION_STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "needs_information",
  "approved",
  "rejected",
  "suspended",
] as const;

export const ACTIVE_PARTNER_APPLICATION_STATUSES = [
  "submitted",
  "under_review",
] as const;

export const EDITABLE_PARTNER_APPLICATION_STATUSES = [
  "draft",
  "needs_information",
  "rejected",
] as const;

export const APPLICANT_TYPES = [
  { value: "individual_owner", label: "Individual property owner" },
  { value: "agency", label: "Agency" },
  { value: "property_manager", label: "Property manager" },
  { value: "company", label: "Company-owned portfolio" },
  { value: "riad_manager", label: "Riad manager" },
  { value: "villa_manager", label: "Villa manager" },
  { value: "cohost_operator", label: "Co-host or operator" },
] as const;

export const PREFERRED_LANGUAGES = [
  { value: "fr", label: "French" },
  { value: "en", label: "English" },
  { value: "ar", label: "Arabic" },
] as const;

export const MOROCCO_CITIES = [
  "Marrakech",
  "Casablanca",
  "Rabat",
  "Agadir",
  "Tangier",
  "Fes",
  "Meknes",
  "Essaouira",
  "Chefchaouen",
  "Tetouan",
  "Ouarzazate",
  "Merzouga",
  "Dakhla",
  "Laayoune",
  "Ifrane",
  "Al Hoceima",
  "El Jadida",
  "Kenitra",
  "Nador",
  "Safi",
] as const;

export const PROPERTY_TYPE_OPTIONS = [
  { value: "apartment", label: "Apartment" },
  { value: "villa", label: "Villa" },
  { value: "riad", label: "Riad" },
  { value: "dar", label: "Dar" },
  { value: "hotel_apartment", label: "Hotel apartment" },
  { value: "guesthouse", label: "Guesthouse" },
  { value: "farm_stay", label: "Farm stay" },
  { value: "room", label: "Room" },
  { value: "luxury_residence", label: "Luxury residence" },
  { value: "surf_house", label: "Surf house" },
  { value: "desert_camp", label: "Desert camp" },
  { value: "mountain_lodge", label: "Mountain lodge" },
] as const;

export const PAYOUT_PREFERENCES = [
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "paypal", label: "PayPal" },
  { value: "cash_settlement", label: "Cash settlement" },
  { value: "manual_settlement", label: "Manual settlement" },
] as const;

export const PARTNER_RISK_LEVELS = [
  { value: "unreviewed", label: "Unreviewed" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "blocked", label: "Blocked" },
] as const;

type Option = {
  readonly value: string;
  readonly label: string;
};

type PartnerTranslate = (
  namespace: string,
  key: string,
  fallback: string
) => string;

export type PartnerApplicationReadinessInput = {
  applicantType?: string | null;
  legalName?: string | null;
  displayName?: string | null;
  primaryContactName?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  preferredLanguage?: string | null;
  country?: string | null;
  city?: string | null;
  operatingCities?: string[] | null;
  address?: string | null;
  companyName?: string | null;
  companyRegistrationNumber?: string | null;
  taxIdentifier?: string | null;
  nationalIdOrPassport?: string | null;
  propertyTypes?: string | null;
  estimatedPropertyCount?: number | null;
  currentPortfolioSize?: number | null;
  hasExclusiveRights?: boolean | null;
  canProvideInvoices?: boolean | null;
  hasPropertyDocuments?: boolean | null;
  hasTourismAuthorization?: boolean | null;
  acceptsPlatformRules?: boolean | null;
  acceptsManagedCommunication?: boolean | null;
  acceptsHandoverPolicy?: boolean | null;
  acceptsCommissionModel?: boolean | null;
  businessExperience?: string | null;
  operationalCapacity?: string | null;
  checkInProcess?: string | null;
  guestSupportCapacity?: string | null;
  cleaningProcess?: string | null;
  maintenanceProcess?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
};

function hasText(value?: string | null) {
  return Boolean(value?.trim());
}

function hasPositiveNumber(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function hasAny(values?: string[] | null) {
  return Array.isArray(values) && values.length > 0;
}

function optionKey(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part, index) =>
      index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)
    )
    .join("");
}

function optionLabel(
  options: readonly Option[],
  value?: string | null,
  t?: PartnerTranslate,
  keyPrefix?: string
) {
  const option = options.find((item) => item.value === value);
  const fallback = option?.label ?? value ?? "";

  return t && value && keyPrefix
    ? t("partner", `${keyPrefix}.${optionKey(value)}`, fallback)
    : fallback;
}

export function normalizeStringList(values: string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean))
  );
}

export function splitCsv(value?: string | null) {
  if (!value) return [];
  return normalizeStringList(value.split(","));
}

export function formatApplicantType(value?: string | null, t?: PartnerTranslate) {
  return optionLabel(APPLICANT_TYPES, value, t, "applicantType");
}

export function formatPreferredLanguage(value?: string | null, t?: PartnerTranslate) {
  return optionLabel(PREFERRED_LANGUAGES, value, t, "preferredLanguage");
}

export function formatPayoutPreference(value?: string | null, t?: PartnerTranslate) {
  return optionLabel(PAYOUT_PREFERENCES, value, t, "payoutPreference");
}

export function formatRiskLevel(value?: string | null, t?: PartnerTranslate) {
  return optionLabel(PARTNER_RISK_LEVELS, value, t, "risk");
}

export function formatPropertyTypes(value?: string | null, t?: PartnerTranslate) {
  return splitCsv(value)
    .map((propertyType) =>
      optionLabel(PROPERTY_TYPE_OPTIONS, propertyType, t, "propertyType")
    )
    .join(", ");
}

export function formatPartnerStatus(value?: string | null) {
  const labels: Record<string, string> = {
    draft: "Draft",
    submitted: "Submitted",
    under_review: "Under review",
    needs_information: "Needs information",
    approved: "Approved",
    rejected: "Rejected",
    suspended: "Suspended",
  };

  return labels[value ?? ""] ?? value ?? "Unknown";
}

export function isActivePartnerApplicationStatus(status?: string | null) {
  return ACTIVE_PARTNER_APPLICATION_STATUSES.includes(
    status as (typeof ACTIVE_PARTNER_APPLICATION_STATUSES)[number]
  );
}

export function isEditablePartnerApplicationStatus(status?: string | null) {
  return EDITABLE_PARTNER_APPLICATION_STATUSES.includes(
    status as (typeof EDITABLE_PARTNER_APPLICATION_STATUSES)[number]
  );
}

export function getMinimumSubmissionIssues(
  application: PartnerApplicationReadinessInput
) {
  const issues: string[] = [];

  if (!hasText(application.applicantType)) issues.push("Applicant type");
  if (!hasText(application.legalName) && !hasText(application.primaryContactName)) {
    issues.push("Legal name or primary contact name");
  }
  if (!hasText(application.phone) && !hasText(application.whatsapp)) {
    issues.push("Phone or WhatsApp");
  }
  if (!hasText(application.city)) issues.push("Primary city");
  if (!hasPositiveNumber(application.estimatedPropertyCount)) {
    issues.push("Estimated property count");
  }
  if (!application.acceptsPlatformRules) issues.push("Platform rules agreement");
  if (!application.acceptsManagedCommunication) {
    issues.push("Managed communication agreement");
  }
  if (!application.acceptsHandoverPolicy) issues.push("Handover policy agreement");
  if (!application.acceptsCommissionModel) issues.push("Commission model agreement");

  return issues;
}

export function getReadinessGaps(application: PartnerApplicationReadinessInput) {
  const gaps: string[] = [];

  if (
    !hasText(application.email) ||
    (!hasText(application.phone) && !hasText(application.whatsapp)) ||
    !hasText(application.preferredLanguage)
  ) {
    gaps.push("Complete contact details and preferred language.");
  }

  if (
    !hasText(application.applicantType) ||
    (!hasText(application.legalName) && !hasText(application.companyName)) ||
    (!hasText(application.nationalIdOrPassport) &&
      !hasText(application.companyRegistrationNumber) &&
      !hasText(application.taxIdentifier))
  ) {
    gaps.push("Complete identity, company, tax, or national document references.");
  }

  if (
    !hasPositiveNumber(application.estimatedPropertyCount) ||
    !hasText(application.propertyTypes) ||
    (!hasText(application.city) && !hasAny(application.operatingCities))
  ) {
    gaps.push("Define the property portfolio, primary city, and property types.");
  }

  if (
    !hasText(application.businessExperience) ||
    !hasText(application.operationalCapacity) ||
    !hasText(application.checkInProcess) ||
    !hasText(application.cleaningProcess) ||
    !hasText(application.maintenanceProcess)
  ) {
    gaps.push("Document operating capacity, check-in, cleaning, and maintenance.");
  }

  if (
    !application.acceptsPlatformRules ||
    !application.acceptsManagedCommunication ||
    !application.acceptsHandoverPolicy ||
    !application.acceptsCommissionModel
  ) {
    gaps.push("Accept all managed marketplace agreements.");
  }

  if (
    !application.hasPropertyDocuments ||
    !application.hasTourismAuthorization ||
    !application.canProvideInvoices
  ) {
    gaps.push("Confirm document, tourism authorization, and invoice readiness.");
  }

  if (
    !hasText(application.guestSupportCapacity) ||
    !hasText(application.emergencyContactName) ||
    !hasText(application.emergencyContactPhone)
  ) {
    gaps.push("Add guest support and emergency escalation coverage.");
  }

  return gaps;
}

export function calculatePartnerReadinessScore(
  application: PartnerApplicationReadinessInput
) {
  let score = 0;

  if (hasText(application.email)) score += 3;
  if (hasText(application.phone) || hasText(application.whatsapp)) score += 4;
  if (hasText(application.primaryContactName) || hasText(application.legalName)) {
    score += 3;
  }
  if (hasText(application.preferredLanguage)) score += 2;
  if (hasText(application.city) || hasAny(application.operatingCities)) score += 3;

  if (hasText(application.applicantType)) score += 4;
  if (
    hasText(application.legalName) ||
    hasText(application.displayName) ||
    hasText(application.companyName)
  ) {
    score += 4;
  }
  if (
    hasText(application.country) ||
    hasText(application.address) ||
    hasText(application.city)
  ) {
    score += 3;
  }
  if (
    hasText(application.companyRegistrationNumber) ||
    hasText(application.taxIdentifier) ||
    hasText(application.nationalIdOrPassport)
  ) {
    score += 4;
  }

  if (hasPositiveNumber(application.estimatedPropertyCount)) score += 5;
  if (hasText(application.propertyTypes)) score += 5;
  if (hasText(application.city) || hasAny(application.operatingCities)) score += 3;
  if (hasPositiveNumber(application.currentPortfolioSize) || application.hasExclusiveRights) {
    score += 2;
  }

  if (hasText(application.businessExperience)) score += 4;
  if (hasText(application.operationalCapacity)) score += 4;
  if (hasText(application.checkInProcess)) score += 3;
  if (hasText(application.cleaningProcess)) score += 3;
  if (hasText(application.maintenanceProcess)) score += 3;
  if (hasText(application.emergencyContactName) && hasText(application.emergencyContactPhone)) {
    score += 3;
  }

  if (application.acceptsPlatformRules) score += 4;
  if (application.acceptsManagedCommunication) score += 4;
  if (application.acceptsHandoverPolicy) score += 3;
  if (application.acceptsCommissionModel) score += 4;

  if (application.hasPropertyDocuments) score += 3;
  if (application.hasTourismAuthorization) score += 3;
  if (application.canProvideInvoices) score += 2;
  if (application.hasExclusiveRights) score += 2;

  if (hasText(application.guestSupportCapacity)) score += 6;
  if (hasText(application.phone) || hasText(application.emergencyContactPhone)) {
    score += 4;
  }

  return Math.min(100, Math.max(0, score));
}
