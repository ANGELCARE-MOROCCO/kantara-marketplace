import "server-only";

import prisma from "./db";
import {
  SUPPORTED_LANGUAGES,
  normalizeLanguage,
  type LanguageCode,
} from "./globalization";
import {
  getDefaultHomepageSections,
  HOMEPAGE_SECTION_TYPES,
} from "./homepageConfig";
import { APP_TRANSLATION_REGISTRY } from "./i18nRegistry";
import {
  PROPERTY_FEATURE_GROUPS,
  PROPERTY_TYPES,
  STAY_TYPES,
} from "./propertyFeatures";
import {
  ENTITY_TRANSLATION_NAMESPACE,
  HOMEPAGE_SECTION_TRANSLATABLE_FIELDS,
  createSourceHash,
  ensureTranslationSources,
  type TranslationSourceRecord,
} from "./translationMemory";

export const TRANSLATION_INVENTORY_TARGET_LANGUAGES = [
  "fr",
  "es",
  "zh-CN",
  "ja",
  "hi",
  "ar",
] as const satisfies readonly Exclude<LanguageCode, "en">[];

export type TranslationInventoryLanguage =
  (typeof TRANSLATION_INVENTORY_TARGET_LANGUAGES)[number];

export function normalizeTranslationInventoryLanguage(
  value?: string | null,
  fallback: TranslationInventoryLanguage = TRANSLATION_INVENTORY_TARGET_LANGUAGES[0]
) {
  return TRANSLATION_INVENTORY_TARGET_LANGUAGES.includes(
    value as TranslationInventoryLanguage
  )
    ? (value as TranslationInventoryLanguage)
    : fallback;
}

export type TranslationInventorySourceType =
  | "static_ui"
  | "navigation"
  | "homepage_section"
  | "footer"
  | "property_feature"
  | "property_type"
  | "stay_type"
  | "status"
  | "policy_rule"
  | "admin_label"
  | "partner_label"
  | "integration_label"
  | "future_addon";

export type TranslationInventoryItem = {
  key: string;
  namespace: string;
  category: string;
  sourceType: TranslationInventorySourceType;
  sourceId: string | null;
  sourceField: string | null;
  baseText: string;
  context: string;
  isSystemManaged: boolean;
  isDynamicSystemContent: boolean;
  excludeFromCsv: boolean;
  sourceHash: string;
  updatedAt: Date | null;
};

export type TranslationInventoryPreviewRow = TranslationInventoryItem & {
  translations: Partial<
    Record<
      TranslationInventoryLanguage,
      {
        translatedText: string | null;
        status: string | null;
        source: string | null;
        updatedAt: Date | null;
      }
    >
  >;
  missingLanguages: TranslationInventoryLanguage[];
  staleLanguages: TranslationInventoryLanguage[];
  humanReviewedLanguages: TranslationInventoryLanguage[];
  completionPercent: number;
};

export type TranslationInventoryAdminState = {
  filters: {
    category: string;
    namespace: string;
    sourceType: string;
    q: string;
    missingLanguage: string;
  };
  options: {
    categories: string[];
    namespaces: string[];
    sourceTypes: string[];
  };
  summary: {
    inventoryItems: number;
    csvEligibleItems: number;
    missingTranslations: number;
    staleTranslations: number;
    humanReviewedTranslations: number;
    machineTranslatedTranslations: number;
    languageStats: Record<
      TranslationInventoryLanguage,
      {
        total: number;
        translated: number;
        missing: number;
        stale: number;
        humanReviewed: number;
        completionPercent: number;
      }
    >;
  };
  rows: TranslationInventoryPreviewRow[];
};

export type TranslationCsvImportReport = {
  rowsRead: number;
  rowsMatched: number;
  rowsIgnored: number;
  rowsEmptySkipped: number;
  conflicts: number;
  created: number;
  updated: number;
  translationsCreated: number;
  translationsUpdated: number;
  languagesUpdated: TranslationInventoryLanguage[];
  parsingFailed: boolean;
  missingColumns: string[];
  targetLanguageMismatches: number;
  unknownKeysIgnored: number;
  missingIdentityRows: number;
  staleSourceHashWarnings: number;
  errors: string[];
  warnings: string[];
};

export const SINGLE_LANGUAGE_CSV_COLUMNS = [
  "key",
  "namespace",
  "category",
  "sourceType",
  "sourceId",
  "sourceField",
  "baseLanguage",
  "targetLanguage",
  "baseText",
  "context",
  "translatedText",
  "status",
  "sourceHash",
  "notes",
] as const;

type InventoryItemInput = {
  key: string;
  namespace?: string;
  category: string;
  sourceType: TranslationInventorySourceType;
  sourceId?: string | null;
  sourceField?: string | null;
  baseText?: string | null;
  context?: string | null;
  isSystemManaged?: boolean;
  isDynamicSystemContent?: boolean;
  excludeFromCsv?: boolean;
  updatedAt?: Date | null;
};

const CSV_COLUMNS = [
  "key",
  "namespace",
  "category",
  "sourceType",
  "sourceId",
  "sourceField",
  "baseLanguage",
  "baseText",
  "context",
  "fr",
  "fr_status",
  "es",
  "es_status",
  "zh-CN",
  "zh-CN_status",
  "ja",
  "ja_status",
  "hi",
  "hi_status",
  "ar",
  "ar_status",
  "sourceHash",
  "lastUpdated",
  "notes",
] as const;

const HOMEPAGE_INVENTORY_FIELDS = HOMEPAGE_SECTION_TRANSLATABLE_FIELDS;
const registeredInventoryItems: TranslationInventoryItem[] = [];

const EXTRA_PLATFORM_ITEMS: InventoryItemInput[] = [
  {
    namespace: "admin",
    key: "property_trust_center",
    baseText: "Property Trust Center",
    category: "admin",
    sourceType: "admin_label",
    context: "Admin navigation and command center module label.",
  },
  {
    namespace: "admin",
    key: "property_trust_center.description",
    baseText:
      "Review partner submissions, approve public listing content, manage translations, and control publication readiness.",
    category: "admin",
    sourceType: "admin_label",
    context: "Admin command center card description.",
  },
  {
    namespace: "partner",
    key: "status.host_verified",
    baseText: "Verified partner",
    category: "partner",
    sourceType: "partner_label",
    context: "Partner role/status label.",
  },
  {
    namespace: "partner",
    key: "status.host_pending",
    baseText: "Partner review pending",
    category: "partner",
    sourceType: "partner_label",
    context: "Partner role/status label.",
  },
  {
    namespace: "listing_status",
    key: "content.draft",
    baseText: "Draft",
    category: "status",
    sourceType: "status",
    context: "Listing content review status.",
  },
  {
    namespace: "listing_status",
    key: "content.submitted",
    baseText: "Submitted",
    category: "status",
    sourceType: "status",
    context: "Listing content review status.",
  },
  {
    namespace: "listing_status",
    key: "content.pending_review",
    baseText: "Pending review",
    category: "status",
    sourceType: "status",
    context: "Listing content review status.",
  },
  {
    namespace: "listing_status",
    key: "content.under_review",
    baseText: "Under review",
    category: "status",
    sourceType: "status",
    context: "Listing content review status.",
  },
  {
    namespace: "listing_status",
    key: "content.needs_changes",
    baseText: "Needs changes",
    category: "status",
    sourceType: "status",
    context: "Listing content review status.",
  },
  {
    namespace: "listing_status",
    key: "content.approved",
    baseText: "Approved",
    category: "status",
    sourceType: "status",
    context: "Listing content review status.",
  },
  {
    namespace: "listing_status",
    key: "content.rejected",
    baseText: "Rejected",
    category: "status",
    sourceType: "status",
    context: "Listing content review status.",
  },
  {
    namespace: "listing_status",
    key: "content.suspended",
    baseText: "Suspended",
    category: "status",
    sourceType: "status",
    context: "Listing content review status.",
  },
  {
    namespace: "listing_status",
    key: "content.archived",
    baseText: "Archived",
    category: "status",
    sourceType: "status",
    context: "Listing content review status.",
  },
];

function normalizeBaseText(value?: string | null) {
  return value?.trim() ?? "";
}

function inventoryIdentity(namespace: string, key: string) {
  return `${namespace}:${key}`;
}

export function createInventoryKey(
  sourceType: TranslationInventorySourceType,
  sourceId: string,
  sourceField?: string | null
) {
  return [sourceType, sourceId, sourceField].filter(Boolean).join(".");
}

export function buildInventoryItem(input: InventoryItemInput) {
  const baseText = normalizeBaseText(input.baseText);

  return {
    key: input.key,
    namespace: input.namespace ?? "common",
    category: input.category,
    sourceType: input.sourceType,
    sourceId: input.sourceId ?? null,
    sourceField: input.sourceField ?? null,
    baseText,
    context: input.context?.trim() ?? "",
    isSystemManaged: input.isSystemManaged ?? true,
    isDynamicSystemContent: input.isDynamicSystemContent ?? false,
    excludeFromCsv: input.excludeFromCsv ?? false,
    sourceHash: createSourceHash(baseText),
    updatedAt: input.updatedAt ?? null,
  } satisfies TranslationInventoryItem;
}

// Future modules can call this from their server-only module to contribute
// fixed/system labels without editing this collector. Do not register user text.
export function registerTranslationInventoryItems(items: InventoryItemInput[]) {
  registeredInventoryItems.push(
    ...items.map(buildInventoryItem).filter((item) => item.baseText)
  );
}

export function registerStaticInventory() {
  return APP_TRANSLATION_REGISTRY.map((entry) =>
    buildInventoryItem({
      key: entry.key,
      namespace: entry.namespace,
      baseText: entry.baseText,
      category: categoryForRegistryEntry(entry.namespace, entry.key),
      sourceType: sourceTypeForRegistryEntry(entry.namespace, entry.key),
      context: contextForRegistryEntry(entry.namespace, entry.key),
    })
  );
}

function sourceTypeForRegistryEntry(
  namespace: string,
  key: string
): TranslationInventorySourceType {
  if (namespace === "navbar") return "navigation";
  if (namespace === "footer") return "footer";
  if (namespace === "admin") return "admin_label";
  if (namespace === "partner") return "partner_label";
  if (namespace === "propertyTrust") return "admin_label";
  if (namespace === "globalization") return "admin_label";
  if (namespace === "homepageBuilder") return "admin_label";
  if (namespace === "homepage_builder") return "admin_label";
  if (namespace === "my_homes") return "partner_label";
  if (namespace === "createListing") return "partner_label";
  if (namespace === "status") return "status";
  if (namespace === "taxonomy" && key.startsWith("property_type.")) {
    return "property_type";
  }
  if (namespace === "taxonomy" && key.startsWith("stay_type.")) {
    return "stay_type";
  }
  if (namespace === "taxonomy" && key.includes("policy")) {
    return "policy_rule";
  }
  if (namespace === "taxonomy" && key.startsWith("feature.")) {
    return "property_feature";
  }
  if (namespace === "taxonomy" && key.startsWith("feature_group.")) {
    return "property_feature";
  }
  if (namespace.includes("status") || key.includes("status")) return "status";
  return "static_ui";
}

function categoryForRegistryEntry(namespace: string, key: string) {
  if (namespace === "navbar") return "navigation";
  if (namespace === "footer") return "footer";
  if (namespace === "search") return "search";
  if (namespace === "homepage") return "homepage";
  if (namespace === "admin") return "admin";
  if (namespace === "partner") return "partner";
  if (namespace === "propertyTrust") return "property_trust";
  if (namespace === "globalization") return "globalization";
  if (namespace === "homepageBuilder" || namespace === "homepage_builder") {
    return "homepage_builder";
  }
  if (namespace === "my_homes") return "my_homes";
  if (namespace === "createListing") return "create_listing";
  if (namespace === "account") return "account";
  if (namespace === "status") return "status";
  if (namespace === "listing") return "listing";
  if (namespace === "taxonomy" && key.startsWith("feature.")) {
    return "property_features";
  }
  if (namespace === "taxonomy" && key.startsWith("feature_group.")) {
    return "property_features";
  }
  if (namespace === "taxonomy" && key.startsWith("property_type.")) {
    return "property_types";
  }
  if (namespace === "taxonomy" && key.startsWith("stay_type.")) {
    return "stay_types";
  }
  return namespace;
}

function contextForRegistryEntry(namespace: string, key: string) {
  if (namespace === "taxonomy") {
    return "Public taxonomy label used by listing cards, filters, and property detail pages.";
  }
  if (namespace === "navbar") return "Primary account and admin navigation label.";
  if (namespace === "search") return "Public stay search control label.";
  if (namespace === "footer") return "Public footer label.";
  return `Static ${namespace} label: ${key}.`;
}

function collectHomepageTypeItems() {
  return HOMEPAGE_SECTION_TYPES.map((item) =>
    buildInventoryItem({
      namespace: "homepage_builder",
      key: `section_type.${item.value}`,
      baseText: item.label,
      category: "homepage_builder",
      sourceType: "admin_label",
      sourceId: item.value,
      sourceField: "label",
      context: item.description,
    })
  );
}

function collectPropertyTaxonomyItems() {
  const propertyTypes = PROPERTY_TYPES.map((item) =>
    buildInventoryItem({
      namespace: "taxonomy",
      key: `property_type.${item.value}`,
      baseText: item.label,
      category: "property_types",
      sourceType: "property_type",
      sourceId: item.value,
      sourceField: "label",
      context: "Public property type taxonomy label.",
    })
  );
  const stayTypes = STAY_TYPES.map((item) =>
    buildInventoryItem({
      namespace: "taxonomy",
      key: `stay_type.${item.value}`,
      baseText: item.label,
      category: "stay_types",
      sourceType: "stay_type",
      sourceId: item.value,
      sourceField: "label",
      context: "Public stay type taxonomy label.",
    })
  );
  const featureGroups = PROPERTY_FEATURE_GROUPS.flatMap((group) => [
    buildInventoryItem({
      namespace: "taxonomy",
      key: `feature_group.${group.group}.title`,
      baseText: group.title,
      category: "property_features",
      sourceType: "property_feature",
      sourceId: group.group,
      sourceField: "title",
      context: "Amenity group heading used in property setup and details.",
    }),
    buildInventoryItem({
      namespace: "taxonomy",
      key: `feature_group.${group.group}.description`,
      baseText: group.description,
      category:
        group.group === "rules_policies" ? "policy_rules" : "property_features",
      sourceType:
        group.group === "rules_policies" ? "policy_rule" : "property_feature",
      sourceId: group.group,
      sourceField: "description",
      context: "Amenity group helper text used in property setup.",
    }),
    ...group.features.map((feature) =>
      buildInventoryItem({
        namespace: "taxonomy",
        key: `feature.${feature.key}`,
        baseText: feature.label,
        category:
          group.group === "rules_policies" ? "policy_rules" : "property_features",
        sourceType:
          group.group === "rules_policies" ? "policy_rule" : "property_feature",
        sourceId: feature.key,
        sourceField: "label",
        context:
          group.group === "rules_policies"
            ? "Public rule or policy taxonomy label."
            : "Public amenity taxonomy label.",
      })
    ),
  ]);

  return [...propertyTypes, ...stayTypes, ...featureGroups];
}

function collectDefaultHomepageItems() {
  return getDefaultHomepageSections().flatMap((section) =>
    HOMEPAGE_INVENTORY_FIELDS.map((fieldName) => {
      const baseText = normalizeBaseText(section[fieldName]);
      if (!baseText) return null;

      return buildInventoryItem({
        namespace: ENTITY_TRANSLATION_NAMESPACE,
        key: `homepageSection.${section.id}.${fieldName}`,
        baseText,
        category: "homepage",
        sourceType: "homepage_section",
        sourceId: section.id,
        sourceField: fieldName,
        context: `Default homepage section "${section.sectionKey}" ${fieldName}.`,
        isDynamicSystemContent: true,
      });
    }).filter((item): item is TranslationInventoryItem => Boolean(item))
  );
}

async function collectDatabaseHomepageItems() {
  const sections = await prisma.homepageSection.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      sectionKey: true,
      eyebrow: true,
      badgeText: true,
      title: true,
      subtitle: true,
      body: true,
      ctaLabel: true,
      secondaryCtaLabel: true,
      updatedAt: true,
    },
  });

  return sections.flatMap((section) =>
    HOMEPAGE_INVENTORY_FIELDS.map((fieldName) => {
      const baseText = normalizeBaseText(section[fieldName]);
      if (!baseText) return null;

      return buildInventoryItem({
        namespace: ENTITY_TRANSLATION_NAMESPACE,
        key: `homepageSection.${section.id}.${fieldName}`,
        baseText,
        category: "homepage",
        sourceType: "homepage_section",
        sourceId: section.id,
        sourceField: fieldName,
        context: `Admin-controlled homepage section "${section.sectionKey}" ${fieldName}.`,
        isDynamicSystemContent: true,
        updatedAt: section.updatedAt,
      });
    }).filter((item): item is TranslationInventoryItem => Boolean(item))
  );
}

function collectExtraPlatformItems() {
  return EXTRA_PLATFORM_ITEMS.map(buildInventoryItem);
}

function dedupeInventoryItems(items: TranslationInventoryItem[]) {
  const byIdentity = new Map<string, TranslationInventoryItem>();

  for (const item of items) {
    if (!item.baseText) continue;
    byIdentity.set(inventoryIdentity(item.namespace, item.key), item);
  }

  return Array.from(byIdentity.values()).sort((a, b) => {
    const categoryCompare = a.category.localeCompare(b.category);
    if (categoryCompare !== 0) return categoryCompare;
    const namespaceCompare = a.namespace.localeCompare(b.namespace);
    if (namespaceCompare !== 0) return namespaceCompare;
    return a.key.localeCompare(b.key);
  });
}

export async function collectTranslationInventory() {
  const databaseHomepageItems = await collectDatabaseHomepageItems();

  return dedupeInventoryItems([
    ...registerStaticInventory(),
    ...collectPropertyTaxonomyItems(),
    ...collectHomepageTypeItems(),
    ...collectDefaultHomepageItems(),
    ...databaseHomepageItems,
    ...collectExtraPlatformItems(),
    ...registeredInventoryItems,
  ]);
}

export async function scanTranslationInventory() {
  return collectTranslationInventory();
}

function inventoryItemToSource(item: TranslationInventoryItem): TranslationSourceRecord {
  const entityType =
    item.sourceType === "homepage_section" ? "homepageSection" : null;

  return {
    key: item.key,
    namespace: item.namespace,
    entityType,
    entityId: entityType ? item.sourceId : null,
    fieldName: entityType ? item.sourceField : null,
    baseText: item.baseText,
    sourceHash: item.sourceHash,
  };
}

export async function scanAndUpsertTranslationInventory() {
  const inventory = await collectTranslationInventory();
  const result = await ensureTranslationSources(
    inventory.map(inventoryItemToSource)
  );

  return {
    ...result,
    inventoryItems: inventory.length,
  };
}

async function getRowsForInventory(items: TranslationInventoryItem[]) {
  if (items.length === 0) return [];

  const identities = items.map((item) => ({
    key: item.key,
    namespace: item.namespace,
  }));

  return prisma.translationEntry.findMany({
    where: {
      OR: identities,
      language: { in: [...SUPPORTED_LANGUAGES.map((item) => item.code)] },
    },
    select: {
      key: true,
      namespace: true,
      language: true,
      translatedText: true,
      status: true,
      source: true,
      updatedAt: true,
    },
  });
}

export async function getTranslationInventoryAdminState({
  category,
  namespace,
  sourceType,
  q,
  missingLanguage,
}: {
  category?: string | null;
  namespace?: string | null;
  sourceType?: string | null;
  q?: string | null;
  missingLanguage?: string | null;
} = {}): Promise<TranslationInventoryAdminState> {
  const inventory = await collectTranslationInventory();
  const rows = await getRowsForInventory(inventory);
  const rowMap = new Map(
    rows.map((row) => [
      `${row.namespace}:${row.key}:${row.language}`,
      {
        translatedText: row.translatedText,
        status: row.status,
        source: row.source,
        updatedAt: row.updatedAt,
      },
    ])
  );
  const previewRows = inventory.map((item) => {
    const translations: TranslationInventoryPreviewRow["translations"] = {};

    for (const language of TRANSLATION_INVENTORY_TARGET_LANGUAGES) {
      const row = rowMap.get(`${item.namespace}:${item.key}:${language}`);
      translations[language] = row ?? {
        translatedText: null,
        status: null,
        source: null,
        updatedAt: null,
      };
    }

    const missingLanguages = TRANSLATION_INVENTORY_TARGET_LANGUAGES.filter(
      (language) => !translations[language]?.translatedText?.trim()
    );
    const staleLanguages = TRANSLATION_INVENTORY_TARGET_LANGUAGES.filter(
      (language) => translations[language]?.status === "stale"
    );
    const humanReviewedLanguages = TRANSLATION_INVENTORY_TARGET_LANGUAGES.filter(
      (language) => translations[language]?.status === "human_reviewed"
    );
    const completed =
      TRANSLATION_INVENTORY_TARGET_LANGUAGES.length - missingLanguages.length;

    return {
      ...item,
      translations,
      missingLanguages,
      staleLanguages,
      humanReviewedLanguages,
      completionPercent: Math.round(
        (completed / TRANSLATION_INVENTORY_TARGET_LANGUAGES.length) * 100
      ),
    };
  });

  const normalizedQuery = q?.trim().toLowerCase() ?? "";
  const normalizedMissingLanguage =
    missingLanguage && missingLanguage !== "all"
      ? normalizeTranslationInventoryLanguage(missingLanguage)
      : null;

  const filteredRows = previewRows
    .filter((row) => !category || category === "all" || row.category === category)
    .filter(
      (row) => !namespace || namespace === "all" || row.namespace === namespace
    )
    .filter(
      (row) => !sourceType || sourceType === "all" || row.sourceType === sourceType
    )
    .filter(
      (row) =>
        !normalizedMissingLanguage ||
        row.missingLanguages.includes(normalizedMissingLanguage)
    )
    .filter((row) => {
      if (!normalizedQuery) return true;

      return [
        row.key,
        row.namespace,
        row.category,
        row.sourceType,
        row.sourceId,
        row.sourceField,
        row.baseText,
        row.context,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery));
    })
    .slice(0, 200);
  const csvEligibleRows = previewRows.filter((row) => !row.excludeFromCsv);
  const languageStats = Object.fromEntries(
    TRANSLATION_INVENTORY_TARGET_LANGUAGES.map((language) => {
      const translated = csvEligibleRows.filter((row) =>
        row.translations[language]?.translatedText?.trim()
      ).length;
      const stale = csvEligibleRows.filter(
        (row) => row.translations[language]?.status === "stale"
      ).length;
      const humanReviewed = csvEligibleRows.filter(
        (row) => row.translations[language]?.status === "human_reviewed"
      ).length;
      const missing = csvEligibleRows.length - translated;

      return [
        language,
        {
          total: csvEligibleRows.length,
          translated,
          missing,
          stale,
          humanReviewed,
          completionPercent:
            csvEligibleRows.length > 0
              ? Math.round((translated / csvEligibleRows.length) * 100)
              : 0,
        },
      ];
    })
  ) as TranslationInventoryAdminState["summary"]["languageStats"];

  return {
    filters: {
      category: category || "all",
      namespace: namespace || "all",
      sourceType: sourceType || "all",
      q: q?.trim() ?? "",
      missingLanguage: normalizedMissingLanguage ?? "all",
    },
    options: {
      categories: Array.from(new Set(previewRows.map((row) => row.category))).sort(),
      namespaces: Array.from(new Set(previewRows.map((row) => row.namespace))).sort(),
      sourceTypes: Array.from(new Set(previewRows.map((row) => row.sourceType))).sort(),
    },
    summary: {
      inventoryItems: inventory.length,
      csvEligibleItems: inventory.filter((item) => !item.excludeFromCsv).length,
      missingTranslations: previewRows.reduce(
        (sum, row) => sum + row.missingLanguages.length,
        0
      ),
      staleTranslations: previewRows.reduce(
        (sum, row) => sum + row.staleLanguages.length,
        0
      ),
      humanReviewedTranslations: rows.filter(
        (row) => row.status === "human_reviewed" && row.language !== "en"
      ).length,
      machineTranslatedTranslations: rows.filter(
        (row) => row.status === "machine_translated"
      ).length,
      languageStats,
    },
    rows: filteredRows,
  };
}

function escapeCsv(value: unknown) {
  const text =
    value === null || value === undefined
      ? ""
      : value instanceof Date
        ? value.toISOString()
        : String(value);
  const escaped = text.replaceAll('"', '""');

  return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
}

function buildCsv(rows: string[][]) {
  return rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
}

function getInventoryEntityShape(item: TranslationInventoryItem) {
  const entityType =
    item.sourceType === "homepage_section" ? "homepageSection" : null;

  return {
    entityType,
    entityId: entityType ? item.sourceId : null,
    fieldName: entityType ? item.sourceField : null,
  };
}

async function getTranslationRowsForLanguage(
  inventory: TranslationInventoryItem[],
  language: TranslationInventoryLanguage
) {
  if (inventory.length === 0) return [];

  return prisma.translationEntry.findMany({
    where: {
      language,
      OR: inventory.map((item) => ({
        key: item.key,
        namespace: item.namespace,
      })),
    },
    select: {
      id: true,
      key: true,
      namespace: true,
      language: true,
      translatedText: true,
      status: true,
      source: true,
      sourceHash: true,
      updatedAt: true,
    },
  });
}

function buildTranslationRowMap(
  rows: Awaited<ReturnType<typeof getTranslationRowsForLanguage>>
) {
  return new Map(
    rows.map((row) => [
      `${row.namespace}:${row.key}:${row.language}`,
      row,
    ])
  );
}

export async function exportSingleLanguageTranslationInventoryCsv(
  language: TranslationInventoryLanguage
) {
  const inventory = (await collectTranslationInventory()).filter(
    (item) => !item.excludeFromCsv
  );
  const rows = await getTranslationRowsForLanguage(inventory, language);
  const rowMap = buildTranslationRowMap(rows);
  const csvRows = [
    [...SINGLE_LANGUAGE_CSV_COLUMNS],
    ...inventory.map((item) => {
      const row = rowMap.get(`${item.namespace}:${item.key}:${language}`);

      return [
        item.key,
        item.namespace,
        item.category,
        item.sourceType,
        item.sourceId ?? "",
        item.sourceField ?? "",
        "en",
        language,
        item.baseText,
        item.context,
        row?.translatedText ?? "",
        row?.status ?? "",
        item.sourceHash,
        "",
      ];
    }),
  ];

  return `\uFEFF${buildCsv(csvRows)}\n`;
}

export async function buildSingleLanguageSampleTranslationCsv(
  language: TranslationInventoryLanguage
) {
  const inventory = (await collectTranslationInventory())
    .filter((item) => !item.excludeFromCsv)
    .slice(0, 12);
  const csvRows = [
    [...SINGLE_LANGUAGE_CSV_COLUMNS],
    ...inventory.map((item) => [
      item.key,
      item.namespace,
      item.category,
      item.sourceType,
      item.sourceId ?? "",
      item.sourceField ?? "",
      "en",
      language,
      item.baseText,
      item.context,
      "",
      "",
      item.sourceHash,
      "Fill translatedText only; leave the rest untouched.",
    ]),
  ];

  return `\uFEFF${buildCsv(csvRows)}\n`;
}

export async function exportTranslationInventoryCsv() {
  const inventory = (await collectTranslationInventory()).filter(
    (item) => !item.excludeFromCsv
  );
  const rows = await getRowsForInventory(inventory);
  const rowMap = new Map(
    rows.map((row) => [`${row.namespace}:${row.key}:${row.language}`, row])
  );
  const csvRows = [
    [...CSV_COLUMNS],
    ...inventory.map((item) => {
      const languageCells = TRANSLATION_INVENTORY_TARGET_LANGUAGES.flatMap(
        (language) => {
          const row = rowMap.get(`${item.namespace}:${item.key}:${language}`);
          return [row?.translatedText ?? "", row?.status ?? ""];
        }
      );

      return [
        item.key,
        item.namespace,
        item.category,
        item.sourceType,
        item.sourceId ?? "",
        item.sourceField ?? "",
        "en",
        item.baseText,
        item.context,
        ...languageCells,
        item.sourceHash,
        item.updatedAt?.toISOString() ?? "",
        "",
      ];
    }),
  ];

  return `\uFEFF${buildCsv(csvRows)}\n`;
}

export async function buildSampleTranslationCsv() {
  const inventory = (await collectTranslationInventory())
    .filter((item) => !item.excludeFromCsv)
    .slice(0, 12);
  const csvRows = [
    [...CSV_COLUMNS],
    ...inventory.map((item) => [
      item.key,
      item.namespace,
      item.category,
      item.sourceType,
      item.sourceId ?? "",
      item.sourceField ?? "",
      "en",
      item.baseText,
      item.context,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      item.sourceHash,
      item.updatedAt?.toISOString() ?? "",
      "Fill language cells; leave empty cells unchanged on import.",
    ]),
  ];

  return `\uFEFF${buildCsv(csvRows)}\n`;
}

function parseCsv(text: string): {
  headers: string[];
  rows: Record<string, string>[];
  errors: string[];
} {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (inQuotes) {
    return { headers: [], rows: [], errors: ["CSV has an unterminated quote."] };
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const nonEmptyRows = rows.filter((item) =>
    item.some((cell) => cell.trim().length > 0)
  );
  const [headerRow, ...dataRows] = nonEmptyRows;

  if (!headerRow) {
    return { headers: [], rows: [], errors: ["CSV is empty."] };
  }

  const headers = headerRow.map((header, index) =>
    (index === 0 ? header.replace(/^\uFEFF/, "") : header).trim()
  );
  const mappedRows = dataRows.map((cells) => {
    const mapped: Record<string, string> = {};
    headers.forEach((header, index) => {
      mapped[header] = cells[index] ?? "";
    });
    return mapped;
  });

  return { headers, rows: mappedRows, errors: [] };
}

export async function importTranslationInventoryCsv(
  csv: string,
  {
    validateOnly = false,
    targetLanguage,
  }: {
    validateOnly?: boolean;
    targetLanguage?: TranslationInventoryLanguage;
  } = {}
): Promise<TranslationCsvImportReport> {
  const parsed = parseCsv(csv);
  const report: TranslationCsvImportReport = {
    rowsRead: parsed.rows.length,
    rowsMatched: 0,
    rowsIgnored: 0,
    rowsEmptySkipped: 0,
    conflicts: 0,
    created: 0,
    updated: 0,
    translationsCreated: 0,
    translationsUpdated: 0,
    languagesUpdated: [],
    parsingFailed: parsed.errors.length > 0,
    missingColumns: [],
    targetLanguageMismatches: 0,
    unknownKeysIgnored: 0,
    missingIdentityRows: 0,
    staleSourceHashWarnings: 0,
    errors: [...parsed.errors],
    warnings: [],
  };

  if (parsed.errors.length > 0) return report;

  if (parsed.rows.length === 0) {
    report.warnings.push("CSV contains no data rows.");
  }

  const requiredHeaders = [...SINGLE_LANGUAGE_CSV_COLUMNS];
  const missingHeaders = requiredHeaders.filter(
    (header) => !parsed.headers.includes(header)
  );
  if (missingHeaders.length > 0) {
    report.missingColumns = missingHeaders;
    report.errors.push(`Missing required columns: ${missingHeaders.join(", ")}.`);
    return report;
  }

  const selectedLanguage = targetLanguage
    ? normalizeTranslationInventoryLanguage(targetLanguage)
    : null;
  if (!selectedLanguage) {
    report.errors.push("Choose a target language before validating or importing.");
    return report;
  }

  const inventory = await collectTranslationInventory();
  const inventoryByIdentity = new Map(
    inventory.map((item) => [inventoryIdentity(item.namespace, item.key), item])
  );
  const relevantInventory = inventory.filter((item) => !item.excludeFromCsv);
  const existingRows = await getTranslationRowsForLanguage(
    relevantInventory,
    selectedLanguage
  );
  const existingByIdentity = new Map(
    existingRows.map((row) => [
      inventoryIdentity(row.namespace, row.key),
      row,
    ])
  );
  const plannedRows: Array<{
    item: TranslationInventoryItem;
    translatedText: string;
    existing: (typeof existingRows)[number] | undefined;
  }> = [];
  const languagesUpdated = new Set<TranslationInventoryLanguage>();

  for (let rowIndex = 0; rowIndex < parsed.rows.length; rowIndex += 1) {
    const row = parsed.rows[rowIndex];
    const key = row.key?.trim();
    const namespace = row.namespace?.trim();
    const rowTargetLanguage = row.targetLanguage?.trim() ?? "";

    if (rowTargetLanguage && rowTargetLanguage !== selectedLanguage) {
      report.targetLanguageMismatches += 1;
      report.errors.push(
        `Row ${rowIndex + 2}: targetLanguage ${rowTargetLanguage} does not match selected ${selectedLanguage}.`
      );
    }

    if (!key || !namespace) {
      report.rowsIgnored += 1;
      report.missingIdentityRows += 1;
      report.warnings.push(`Row ${rowIndex + 2}: missing key or namespace.`);
      continue;
    }

    const item = inventoryByIdentity.get(inventoryIdentity(namespace, key));
    if (!item) {
      report.rowsIgnored += 1;
      report.unknownKeysIgnored += 1;
      report.warnings.push(`Row ${rowIndex + 2}: unknown key ${namespace}:${key}.`);
      continue;
    }

    report.rowsMatched += 1;

    const translatedText = row.translatedText?.trim() ?? "";
    if (!translatedText) {
      report.rowsEmptySkipped += 1;
      continue;
    }

    const existing = existingByIdentity.get(
      inventoryIdentity(item.namespace, item.key)
    );

    if (row.sourceHash?.trim() && row.sourceHash.trim() !== item.sourceHash) {
      report.conflicts += 1;
      report.staleSourceHashWarnings += 1;
      report.warnings.push(
        `Row ${rowIndex + 2}: sourceHash does not match current inventory for ${namespace}:${key}.`
      );
    }

    languagesUpdated.add(selectedLanguage);
    plannedRows.push({
      item,
      translatedText,
      existing,
    });
  }

  report.created = plannedRows.filter((row) => !row.existing).length;
  report.updated = plannedRows.filter((row) => Boolean(row.existing)).length;
  report.translationsCreated = report.created;
  report.translationsUpdated = report.updated;
  report.languagesUpdated = Array.from(languagesUpdated);

  if (validateOnly) {
    return report;
  }

  if (report.errors.length > 0) {
    report.created = 0;
    report.updated = 0;
    report.translationsCreated = 0;
    report.translationsUpdated = 0;
    report.languagesUpdated = [];
    return report;
  }

  const now = new Date();
  for (const planned of plannedRows) {
    const shape = getInventoryEntityShape(planned.item);
    const entryData = {
      entityType: shape.entityType,
      entityId: shape.entityId,
      fieldName: shape.fieldName,
      baseText: planned.item.baseText,
      translatedText: planned.translatedText,
      source: "chatgpt_csv_import",
      status: "human_reviewed" as const,
      sourceHash: planned.item.sourceHash,
      lastSyncedAt: now,
      errorMessage: null,
    };

    await prisma.translationEntry.upsert({
      where: {
        key_namespace_language: {
          key: planned.item.key,
          namespace: planned.item.namespace,
          language: selectedLanguage,
        },
      },
      create: {
        key: planned.item.key,
        namespace: planned.item.namespace,
        language: selectedLanguage,
        ...entryData,
      },
      update: entryData,
    });
  }

  return report;
}
