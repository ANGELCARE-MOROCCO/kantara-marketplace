import "server-only";

import type { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { cookies } from "next/headers";

import prisma from "./db";
import {
  LANGUAGE_COOKIE_NAME,
  LIBRETRANSLATE_SOURCE,
  SUPPORTED_LANGUAGES,
  buildTranslationLookup,
  getLanguageMeta,
  normalizeLanguage,
  parseLanguageList,
  resolveLanguageSelection,
  serializeLanguageList,
  translateFromLookup,
  type LanguageCode,
  type LocalizationDisplayState,
} from "./globalization";
import {
  getBuiltInDictionaryEntries,
  getBuiltInTranslation,
} from "./i18nDictionaries";
import { APP_TRANSLATION_REGISTRY } from "./i18nRegistry";
import {
  PUBLIC_TRANSLATION_STATUSES,
  collectDynamicTranslationSources,
  collectTranslationSourcesForScope,
  ensureStaticTranslationRegistry,
  ensureTranslationEntriesForScope,
  getSupportedTargetLanguages,
  getTranslationWhereForMode,
  getTranslationWhereForScope,
  isPublicTranslationStatus,
  type TranslationScope,
  type TranslationSyncMode,
} from "./translationMemory";
import {
  getTranslationProviderStatus,
  translateText,
} from "./translationService";

export { getEntityTranslation } from "./translationMemory";

export const LOCALIZATION_SETTINGS_CACHE_TAG = "localization-settings";
export const TRANSLATIONS_CACHE_TAG = "translations";

export type LocalizationSettingsView = {
  id: string | null;
  baseLanguage: LanguageCode;
  defaultLanguage: LanguageCode;
  enabledLanguages: LanguageCode[];
  autoTranslateEnabled: boolean;
  translationSource: string;
  translationEndpoint: string | null;
  lastSyncAt: Date | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type TranslationEntryView = {
  id: string;
  key: string;
  namespace: string;
  entityType: string | null;
  entityId: string | null;
  fieldName: string | null;
  baseText: string;
  language: LanguageCode;
  translatedText: string | null;
  source: string | null;
  status: string;
  sourceHash: string | null;
  lastSyncedAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type TranslationSyncResult = {
  ok: boolean;
  status: "success" | "failed";
  message: string;
  created: number;
  translated: number;
  failed: number;
  stale: number;
  remaining: number;
};

export type TranslationCoverageLanguage = {
  language: LanguageCode;
  dbEntries: number;
  active: number;
  missing: number;
  stale: number;
  failed: number;
  humanReviewed: number;
};

export type TranslationCoverageStats = {
  staticKeyCount: number;
  dynamicContentFieldCount: number;
  totalSourceFields: number;
  languageStats: TranslationCoverageLanguage[];
  entryCountByLanguageStatus: {
    language: string;
    status: string;
    count: number;
  }[];
  humanReviewedCount: number;
};

export type TranslationEditorFilters = {
  language: LanguageCode;
  namespace: string;
  entityType: string;
  status: string;
};

export type LocalizationAdminState = {
  settings: LocalizationSettingsView;
  selectedLanguage: LanguageCode;
  entries: TranslationEntryView[];
  coverage: TranslationCoverageStats;
  providerStatus: ReturnType<typeof getTranslationProviderStatus>;
  editorFilters: TranslationEditorFilters;
};

const DEFAULT_LOCALIZATION_SETTINGS: LocalizationSettingsView = {
  id: null,
  baseLanguage: "en",
  defaultLanguage: "en",
  enabledLanguages: SUPPORTED_LANGUAGES.map((language) => language.code),
  autoTranslateEnabled: false,
  translationSource: LIBRETRANSLATE_SOURCE,
  translationEndpoint: null,
  lastSyncAt: null,
  lastSyncStatus: null,
  lastSyncError: null,
  createdAt: null,
  updatedAt: null,
};

const TRANSLATION_BATCH_LIMITS = [25, 50, 100] as const;

type LocalizationSettingsRecord = {
  id: string;
  baseLanguage: string;
  defaultLanguage: string;
  enabledLanguages: string;
  autoTranslateEnabled: boolean;
  translationSource: string;
  translationEndpoint: string | null;
  lastSyncAt: Date | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type TranslationEntryRecord = {
  id: string;
  key: string;
  namespace: string;
  entityType: string | null;
  entityId: string | null;
  fieldName: string | null;
  baseText: string;
  language: string;
  translatedText: string | null;
  source: string | null;
  status: string;
  sourceHash: string | null;
  lastSyncedAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function normalizeLocalizationSettings(
  record?: LocalizationSettingsRecord | null
): LocalizationSettingsView {
  const envEndpoint = process.env.LIBRETRANSLATE_URL?.trim() || null;

  if (!record) {
    return {
      ...DEFAULT_LOCALIZATION_SETTINGS,
      translationEndpoint: envEndpoint,
    };
  }

  const baseLanguage = normalizeLanguage(record.baseLanguage, "en");
  const enabledLanguages = parseLanguageList(record.enabledLanguages);
  const defaultLanguage = normalizeLanguage(record.defaultLanguage, "en");

  return {
    id: record.id,
    baseLanguage,
    defaultLanguage: enabledLanguages.includes(defaultLanguage)
      ? defaultLanguage
      : enabledLanguages[0] ?? baseLanguage,
    enabledLanguages,
    autoTranslateEnabled: record.autoTranslateEnabled,
    translationSource: record.translationSource || LIBRETRANSLATE_SOURCE,
    translationEndpoint: envEndpoint,
    lastSyncAt: record.lastSyncAt,
    lastSyncStatus: record.lastSyncStatus,
    lastSyncError: record.lastSyncError,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function normalizeTranslationEntry(
  record: TranslationEntryRecord
): TranslationEntryView {
  return {
    id: record.id,
    key: record.key,
    namespace: record.namespace,
    entityType: record.entityType,
    entityId: record.entityId,
    fieldName: record.fieldName,
    baseText: record.baseText,
    language: normalizeLanguage(record.language, "en"),
    translatedText: record.translatedText,
    source: record.source,
    status: record.status,
    sourceHash: record.sourceHash,
    lastSyncedAt: record.lastSyncedAt,
    errorMessage: record.errorMessage,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function normalizeBatchLimit(value?: number | string | null) {
  const parsed = Number(value);
  return TRANSLATION_BATCH_LIMITS.includes(
    parsed as (typeof TRANSLATION_BATCH_LIMITS)[number]
  )
    ? parsed
    : 25;
}

function translationIdentity(namespace: string, key: string) {
  return `${namespace}:${key}`;
}

const getCachedLocalizationSettings = unstable_cache(
  async () => {
    const record = await prisma.localizationSettings.findFirst({
      orderBy: { updatedAt: "desc" },
    });

    return normalizeLocalizationSettings(record);
  },
  ["localization-settings-v2"],
  { tags: [LOCALIZATION_SETTINGS_CACHE_TAG], revalidate: 300 }
);

const getCachedTranslationsForLanguage = unstable_cache(
  async (language: LanguageCode) => {
    const rows = await prisma.translationEntry.findMany({
      where: {
        language,
        status: { in: [...PUBLIC_TRANSLATION_STATUSES] },
        translatedText: { not: null },
      },
      orderBy: [{ namespace: "asc" }, { key: "asc" }],
    });

    return rows
      .map(normalizeTranslationEntry)
      .filter((entry) => entry.translatedText?.trim());
  },
  ["translations-for-language-v2"],
  { tags: [TRANSLATIONS_CACHE_TAG], revalidate: 300 }
);

export async function getLocalizationSettings() {
  return getCachedLocalizationSettings();
}

export async function getTranslationsForLanguage(language: LanguageCode) {
  return getCachedTranslationsForLanguage(language);
}

export async function getSelectedLanguageFromCookie() {
  const settings = await getLocalizationSettings();
  const requestedLanguage = cookies().get(LANGUAGE_COOKIE_NAME)?.value;

  return resolveLanguageSelection({
    requestedLanguage,
    defaultLanguage: settings.defaultLanguage,
    enabledLanguages: settings.enabledLanguages,
  }).selectedLanguage;
}

export async function getLocalizationDisplayState(): Promise<LocalizationDisplayState> {
  const settings = await getLocalizationSettings();
  const requestedLanguage = cookies().get(LANGUAGE_COOKIE_NAME)?.value;
  const selection = resolveLanguageSelection({
    requestedLanguage,
    defaultLanguage: settings.defaultLanguage,
    enabledLanguages: settings.enabledLanguages,
  });

  return {
    baseLanguage: settings.baseLanguage,
    defaultLanguage: settings.defaultLanguage,
    enabledLanguages: settings.enabledLanguages,
    selectedLanguage: selection.selectedLanguage,
    dir: selection.dir,
    selectionFallbackReason: selection.selectionFallbackReason,
  };
}

export async function getTranslator(language?: LanguageCode) {
  const displayState = language ? null : await getLocalizationDisplayState();
  const selectedLanguage = language ?? displayState?.selectedLanguage ?? "en";
  const translatedEntries =
    selectedLanguage === "en"
      ? []
      : await getTranslationsForLanguage(selectedLanguage);
  const lookup = buildTranslationLookup([
    ...APP_TRANSLATION_REGISTRY.map((entry) => ({
      ...entry,
      translatedText: entry.baseText,
    })),
    ...getBuiltInDictionaryEntries(selectedLanguage),
    ...translatedEntries,
  ]);

  return {
    language: selectedLanguage,
    dir: getLanguageMeta(selectedLanguage).dir,
    t(namespace: string, key: string, fallback: string) {
      return translateFromLookup(lookup, namespace, key, fallback);
    },
  };
}

export async function getTranslation(
  key: string,
  namespace: string,
  fallback: string,
  language?: LanguageCode
) {
  const translator = await getTranslator(language);
  return translator.t(namespace, key, fallback);
}

export function getBuiltInFallbackTranslation(
  language: LanguageCode,
  namespace: string,
  key: string
) {
  return getBuiltInTranslation(language, namespace, key);
}

async function updateLocalizationSyncStatus({
  status,
  error,
  updatedById,
}: {
  status: "success" | "failed";
  error?: string | null;
  updatedById: string;
}) {
  const existing = await prisma.localizationSettings.findFirst({
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  const provider = getTranslationProviderStatus();

  if (existing) {
    await prisma.localizationSettings.update({
      where: { id: existing.id },
      data: {
        lastSyncAt: new Date(),
        lastSyncStatus: status,
        lastSyncError: error ?? null,
        translationSource: provider.source,
        translationEndpoint: provider.endpoint,
        updatedById,
      },
    });
    return;
  }

  await prisma.localizationSettings.create({
    data: {
      baseLanguage: "en",
      defaultLanguage: "en",
      enabledLanguages: serializeLanguageList(
        DEFAULT_LOCALIZATION_SETTINGS.enabledLanguages
      ),
      autoTranslateEnabled: false,
      translationSource: provider.source,
      translationEndpoint: provider.endpoint,
      lastSyncAt: new Date(),
      lastSyncStatus: status,
      lastSyncError: error ?? null,
      updatedById,
    },
  });
}

export async function saveLocalizationSettings({
  defaultLanguage,
  enabledLanguages,
  autoTranslateEnabled,
  translationEndpoint,
  updatedById,
}: {
  defaultLanguage: LanguageCode;
  enabledLanguages: LanguageCode[];
  autoTranslateEnabled: boolean;
  translationEndpoint?: string | null;
  updatedById: string;
}) {
  const existing = await prisma.localizationSettings.findFirst({
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  const safeEnabled = enabledLanguages.length > 0 ? enabledLanguages : ["en"];
  const safeDefault = safeEnabled.includes(defaultLanguage)
    ? defaultLanguage
    : safeEnabled[0] ?? "en";
  const provider = getTranslationProviderStatus();
  const data = {
    baseLanguage: "en",
    defaultLanguage: safeDefault,
    enabledLanguages: serializeLanguageList(safeEnabled),
    autoTranslateEnabled,
    translationSource: provider.source,
    translationEndpoint: provider.endpoint ?? translationEndpoint?.trim() ?? null,
    updatedById,
  };

  if (existing) {
    return prisma.localizationSettings.update({
      where: { id: existing.id },
      data,
    });
  }

  return prisma.localizationSettings.create({ data });
}

export async function getTranslationCoverageStats(): Promise<TranslationCoverageStats> {
  const [dynamicSources, allSources, rows, groupedCounts] = await Promise.all([
    collectDynamicTranslationSources(),
    collectTranslationSourcesForScope("all"),
    prisma.translationEntry.findMany({
      select: {
        key: true,
        namespace: true,
        language: true,
        translatedText: true,
        status: true,
      },
    }),
    prisma.translationEntry.groupBy({
      by: ["language", "status"],
      _count: { _all: true },
      orderBy: [{ language: "asc" }, { status: "asc" }],
    }),
  ]);
  const sourceIdentities = new Set(
    allSources.map((source) => translationIdentity(source.namespace, source.key))
  );
  const expected = sourceIdentities.size;
  const languageStats = SUPPORTED_LANGUAGES.map((language) => {
    const rowsForLanguage = rows.filter(
      (row) =>
        row.language === language.code &&
        sourceIdentities.has(translationIdentity(row.namespace, row.key))
    );
    const activeIdentities = new Set(
      rowsForLanguage
        .filter(
          (row) =>
            isPublicTranslationStatus(row.status) && row.translatedText?.trim()
        )
        .map((row) => translationIdentity(row.namespace, row.key))
    );
    const stale = rowsForLanguage.filter((row) => row.status === "stale").length;
    const failed = rowsForLanguage.filter((row) => row.status === "failed").length;
    const humanReviewed = rowsForLanguage.filter(
      (row) => row.status === "human_reviewed"
    ).length;
    const missing =
      language.code === "en"
        ? 0
        : Math.max(expected - activeIdentities.size - stale - failed, 0);

    return {
      language: language.code,
      dbEntries: rowsForLanguage.length,
      active: activeIdentities.size,
      missing,
      stale,
      failed,
      humanReviewed,
    };
  });

  return {
    staticKeyCount: APP_TRANSLATION_REGISTRY.length,
    dynamicContentFieldCount: dynamicSources.length,
    totalSourceFields: expected,
    languageStats,
    entryCountByLanguageStatus: groupedCounts.map((count) => ({
      language: count.language,
      status: count.status,
      count: count._count._all,
    })),
    humanReviewedCount: rows.filter((row) => row.status === "human_reviewed")
      .length,
  };
}

export async function getTranslationEditorEntries({
  language,
  namespace,
  entityType,
  status,
}: Partial<TranslationEditorFilters>) {
  const where: Prisma.TranslationEntryWhereInput = {
    language,
  };

  if (namespace && namespace !== "all") {
    where.namespace = namespace;
  }

  if (entityType && entityType !== "all") {
    where.entityType = entityType === "__static__" ? null : entityType;
  }

  if (status && status !== "all") {
    where.status = status;
  }

  const rows = await prisma.translationEntry.findMany({
    where,
    orderBy: [
      { entityType: "asc" },
      { namespace: "asc" },
      { key: "asc" },
      { updatedAt: "desc" },
    ],
    take: 100,
  });

  return rows.map(normalizeTranslationEntry);
}

export async function getLocalizationAdminState({
  language,
  namespace,
  entityType,
  status,
}: {
  language?: string | null;
  namespace?: string | null;
  entityType?: string | null;
  status?: string | null;
} = {}): Promise<LocalizationAdminState> {
  const settings = await getLocalizationSettings();
  const selectedLanguage = normalizeLanguage(language, settings.defaultLanguage);
  const editorFilters: TranslationEditorFilters = {
    language: selectedLanguage,
    namespace: namespace || "all",
    entityType: entityType || "all",
    status: status || "all",
  };
  const [entries, coverage] = await Promise.all([
    getTranslationEditorEntries(editorFilters),
    getTranslationCoverageStats(),
  ]);

  return {
    settings,
    selectedLanguage,
    entries,
    coverage,
    providerStatus: getTranslationProviderStatus(),
    editorFilters,
  };
}

async function countTranslationQueue({
  scope,
  mode,
  settings,
}: {
  scope: TranslationScope;
  mode: TranslationSyncMode;
  settings: LocalizationSettingsView;
}) {
  const targetLanguages = getSupportedTargetLanguages(settings.enabledLanguages);
  if (targetLanguages.length === 0) return 0;

  return prisma.translationEntry.count({
    where: {
      language: { in: targetLanguages },
      baseText: { not: "" },
      AND: [getTranslationWhereForScope(scope), getTranslationWhereForMode(mode)],
    },
  });
}

export async function runTranslationSyncOperation({
  updatedById,
  scope,
  mode,
  batchLimit,
}: {
  updatedById: string;
  scope: TranslationScope;
  mode: TranslationSyncMode;
  batchLimit?: number | string | null;
}): Promise<TranslationSyncResult> {
  const limit = normalizeBatchLimit(batchLimit);
  const settings = await getLocalizationSettings();
  const ensureResult =
    mode === "missing"
      ? await ensureTranslationEntriesForScope(scope)
      : await ensureTranslationEntriesForScope(scope);
  const provider = getTranslationProviderStatus();

  if (!provider.configured) {
    const message = "Translation service not configured.";
    await updateLocalizationSyncStatus({
      status: "failed",
      error: message,
      updatedById,
    });

    return {
      ok: false,
      status: "failed",
      message,
      created: ensureResult.created,
      stale: ensureResult.stale,
      translated: 0,
      failed: 0,
      remaining: await countTranslationQueue({ scope, mode, settings }),
    };
  }

  const targetLanguages = getSupportedTargetLanguages(settings.enabledLanguages);
  const entries = await prisma.translationEntry.findMany({
    where: {
      language: { in: targetLanguages },
      baseText: { not: "" },
      AND: [getTranslationWhereForScope(scope), getTranslationWhereForMode(mode)],
    },
    orderBy: [{ updatedAt: "asc" }, { namespace: "asc" }, { key: "asc" }],
    take: limit,
  });
  let translated = 0;
  let failed = 0;

  for (const entry of entries) {
    const language = normalizeLanguage(entry.language, "en");
    if (language === "en") continue;

    try {
      const translatedText = await translateText(entry.baseText, language);

      await prisma.translationEntry.update({
        where: { id: entry.id },
        data: {
          translatedText,
          source: LIBRETRANSLATE_SOURCE,
          status: "machine_translated",
          lastSyncedAt: new Date(),
          errorMessage: null,
        },
      });
      translated += 1;
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message
          : "Translation failed.";

      await prisma.translationEntry.update({
        where: { id: entry.id },
        data: {
          status: "failed",
          errorMessage: message,
          lastSyncedAt: new Date(),
        },
      });
      failed += 1;
    }
  }

  const remaining = await countTranslationQueue({ scope, mode, settings });
  const ok = failed === 0;
  const message =
    entries.length === 0
      ? "No translation entries matched this operation."
      : failed === 0
        ? `Translated ${translated} entries. ${remaining} remaining.`
        : `Translated ${translated} entries; ${failed} failed. ${remaining} remaining.`;

  await updateLocalizationSyncStatus({
    status: ok ? "success" : "failed",
    error: ok ? null : message,
    updatedById,
  });

  return {
    ok,
    status: ok ? "success" : "failed",
    message,
    created: ensureResult.created,
    stale: ensureResult.stale,
    translated,
    failed,
    remaining,
  };
}

export async function syncMissingTranslations({
  updatedById,
}: {
  updatedById: string;
}) {
  return runTranslationSyncOperation({
    updatedById,
    scope: "all",
    mode: "missing",
    batchLimit: 100,
  });
}

export async function saveTranslationEntry({
  id,
  translatedText,
}: {
  id: string;
  translatedText: string;
}) {
  return prisma.translationEntry.update({
    where: { id },
    data: {
      translatedText: translatedText.trim(),
      status: "human_reviewed",
      source: "manual",
      errorMessage: null,
      lastSyncedAt: new Date(),
    },
  });
}

export async function ensureTranslationRegistry() {
  return ensureStaticTranslationRegistry();
}
