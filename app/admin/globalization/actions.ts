"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/app/lib/auth";
import {
  CURRENCY_RATES_CACHE_TAG,
  CURRENCY_SETTINGS_CACHE_TAG,
  saveCurrencySettings,
  syncCurrencyRates as runCurrencySync,
} from "@/app/lib/currency";
import {
  LOCALIZATION_SETTINGS_CACHE_TAG,
  TRANSLATIONS_CACHE_TAG,
  runTranslationSyncOperation,
  saveLocalizationSettings,
  saveTranslationEntry,
} from "@/app/lib/i18n";
import {
  LANGUAGE_COOKIE_NAME,
  getLanguageMeta,
  normalizeCurrency,
  normalizeLanguage,
  normalizeRoundingMode,
  serializeCurrencyList,
  serializeLanguageList,
  type CurrencyCode,
  type LanguageCode,
} from "@/app/lib/globalization";
import {
  importTranslationInventoryCsv,
  scanAndUpsertTranslationInventory,
  TRANSLATION_INVENTORY_TARGET_LANGUAGES,
  normalizeTranslationInventoryLanguage,
  type TranslationCsvImportReport,
} from "@/app/lib/translationInventory";

function readString(formData: FormData, key: string, maxLength = 1200) {
  const value = formData.get(key);
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, maxLength) : null;
}

function readBoolean(formData: FormData, key: string) {
  const value = formData.get(key);
  return value === "on" || value === "true" || value === "1";
}

function readAllStrings(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
}

function redirectToGlobalization({
  tab = "currency",
  notice,
  error,
  language,
  namespace,
  entityType,
  status,
  report,
}: {
  tab?: string;
  notice?: string;
  error?: string;
  language?: string | null;
  namespace?: string | null;
  entityType?: string | null;
  status?: string | null;
  report?: Record<string, string | number | null | undefined>;
} = {}): never {
  const params = new URLSearchParams();
  params.set("tab", tab);
  if (notice) params.set("notice", notice);
  if (error) params.set("error", error);
  if (language) params.set("language", language);
  if (namespace) params.set("namespace", namespace);
  if (entityType) params.set("entityType", entityType);
  if (status) params.set("status", status);
  if (report) {
    Object.entries(report).forEach(([key, value]) => {
      if (value !== null && value !== undefined && String(value).length > 0) {
        params.set(key, String(value));
      }
    });
  }

  redirect(`/admin/globalization?${params.toString()}`);
}

function revalidateGlobalization() {
  revalidateTag(CURRENCY_SETTINGS_CACHE_TAG);
  revalidateTag(CURRENCY_RATES_CACHE_TAG);
  revalidateTag(LOCALIZATION_SETTINGS_CACHE_TAG);
  revalidateTag(TRANSLATIONS_CACHE_TAG);
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/globalization");
}

export async function updateCurrencySettings(formData: FormData) {
  const user = await requireAdmin();
  const enabledCurrencies = readAllStrings(
    formData,
    "enabledCurrencies"
  ) as CurrencyCode[];
  const defaultCurrency = normalizeCurrency(
    readString(formData, "defaultCurrency", 8),
    "USD"
  );

  await saveCurrencySettings({
    defaultCurrency,
    enabledCurrencies:
      serializeCurrencyList(enabledCurrencies).split(",") as CurrencyCode[],
    autoSyncEnabled: readBoolean(formData, "autoSyncEnabled"),
    roundingMode: normalizeRoundingMode(readString(formData, "roundingMode", 20)),
    showOriginalCurrency: readBoolean(formData, "showOriginalCurrency"),
    updatedById: user.id,
  });

  revalidateGlobalization();
  redirectToGlobalization({
    tab: "currency",
    notice: "Currency settings saved.",
  });
}

export async function syncCurrencyRates() {
  const user = await requireAdmin();
  const result = await runCurrencySync({ updatedById: user.id });

  revalidateGlobalization();
  redirectToGlobalization({
    tab: "currency",
    notice: result.ok ? result.message : undefined,
    error: result.ok ? undefined : result.message,
  });
}

export async function updateLocalizationSettings(formData: FormData) {
  const user = await requireAdmin();
  const enabledLanguages = readAllStrings(
    formData,
    "enabledLanguages"
  ) as LanguageCode[];
  const defaultLanguage = normalizeLanguage(
    readString(formData, "defaultLanguage", 16),
    "en"
  );

  await saveLocalizationSettings({
    defaultLanguage,
    enabledLanguages:
      serializeLanguageList(enabledLanguages).split(",") as LanguageCode[],
    autoTranslateEnabled: readBoolean(formData, "autoTranslateEnabled"),
    translationEndpoint: readString(formData, "translationEndpoint", 300),
    updatedById: user.id,
  });

  revalidateGlobalization();
  redirectToGlobalization({
    tab: "languages",
    notice: "Language settings saved.",
  });
}

function readBatchLimit(formData: FormData) {
  const value = readString(formData, "batchLimit", 8);
  return value ?? "25";
}

async function runTranslationOperation(
  formData: FormData,
  options: Omit<
    Parameters<typeof runTranslationSyncOperation>[0],
    "updatedById" | "batchLimit"
  >
) {
  const user = await requireAdmin();
  const result = await runTranslationSyncOperation({
    ...options,
    updatedById: user.id,
    batchLimit: readBatchLimit(formData),
  });

  revalidateGlobalization();
  redirectToGlobalization({
    tab: "translations",
    notice: result.ok ? result.message : undefined,
    error: result.ok ? undefined : result.message,
    language: readString(formData, "language", 16),
    namespace: readString(formData, "namespace", 80),
    entityType: readString(formData, "entityType", 80),
    status: readString(formData, "status", 80),
  });
}

export async function syncStaticTranslations(formData: FormData) {
  await runTranslationOperation(formData, {
    scope: "static",
    mode: "missing",
  });
}

export async function syncHomepageTranslations(formData: FormData) {
  await runTranslationOperation(formData, {
    scope: "homepage",
    mode: "missing",
  });
}

export async function syncHomeTranslations(formData: FormData) {
  await requireAdmin();
  redirectToGlobalization({
    tab: "translations",
    language: readString(formData, "language", 16),
    namespace: readString(formData, "namespace", 80),
    entityType: readString(formData, "entityType", 80),
    status: readString(formData, "status", 80),
    error:
      "Listing translations are managed manually in Property Trust Center.",
  });
}

export async function syncAllMissingTranslations(formData: FormData) {
  await runTranslationOperation(formData, {
    scope: "all",
    mode: "missing",
  });
}

export async function resyncStaleTranslations(formData: FormData) {
  await runTranslationOperation(formData, {
    scope: "all",
    mode: "stale",
  });
}

export async function retryFailedTranslations(formData: FormData) {
  await runTranslationOperation(formData, {
    scope: "all",
    mode: "failed",
  });
}

export async function syncMissingTranslations(formData: FormData) {
  await syncAllMissingTranslations(formData);
}

function getCsvReportStatus(report: TranslationCsvImportReport) {
  if (report.errors.length > 0) return "failed";
  if (
    report.rowsIgnored > 0 ||
    report.rowsEmptySkipped > 0 ||
    report.conflicts > 0 ||
    report.warnings.length > 0
  ) {
    return "partial";
  }

  return "success";
}

function truncateParam(value: string | null | undefined, maxLength = 180) {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

function importReportToParamsForAction(
  report: TranslationCsvImportReport,
  {
    action,
    targetLanguage,
    fileName,
  }: {
    action: "validate" | "apply";
    targetLanguage: string | null;
    fileName?: string | null;
  }
) {
  return {
    report: "csv",
    reportAction: action,
    reportStatus: getCsvReportStatus(report),
    reportTargetLanguage: targetLanguage,
    targetLanguage,
    reportTimestamp: new Date().toISOString(),
    fileName: truncateParam(fileName),
    rowsRead: report.rowsRead,
    rowsMatched: report.rowsMatched,
    rowsIgnored: report.rowsIgnored,
    emptySkipped: report.rowsEmptySkipped,
    conflicts: report.conflicts,
    translationsCreated: report.created,
    translationsUpdated: report.updated,
    languagesUpdated: report.languagesUpdated.join(", "),
    parsingFailed: report.parsingFailed ? "true" : "false",
    missingColumns: report.missingColumns.join(", "),
    targetLanguageMismatches: report.targetLanguageMismatches,
    unknownKeysIgnored: report.unknownKeysIgnored,
    missingIdentityRows: report.missingIdentityRows,
    staleSourceHashWarnings: report.staleSourceHashWarnings,
    errorsCount: report.errors.length,
    warningsCount: report.warnings.length,
    reportErrors: report.errors.slice(0, 4).join(" | "),
    reportWarnings: report.warnings.slice(0, 4).join(" | "),
  };
}

function buildCsvFormErrorReport(message: string): TranslationCsvImportReport {
  return {
    rowsRead: 0,
    rowsMatched: 0,
    rowsIgnored: 0,
    rowsEmptySkipped: 0,
    conflicts: 0,
    created: 0,
    updated: 0,
    translationsCreated: 0,
    translationsUpdated: 0,
    languagesUpdated: [],
    parsingFailed: false,
    missingColumns: [],
    targetLanguageMismatches: 0,
    unknownKeysIgnored: 0,
    missingIdentityRows: 0,
    staleSourceHashWarnings: 0,
    errors: [message],
    warnings: [],
  };
}

export async function scanTranslationInventoryAction(_formData: FormData) {
  await requireAdmin();
  const result = await scanAndUpsertTranslationInventory();

  revalidateGlobalization();
  redirectToGlobalization({
    tab: "inventory",
    notice: `Scanned ${result.inventoryItems} inventory items. Created ${result.created} rows; marked ${result.stale} stale.`,
    report: {
      report: "scan",
      rowsRead: result.inventoryItems,
      translationsCreated: result.created,
      translationsUpdated: result.stale,
    },
  });
}

export async function validateTranslationCsv(formData: FormData) {
  await requireAdmin();
  const file = formData.get("csvFile");
  const targetLanguageValue = readString(formData, "targetLanguage", 16);
  const targetLanguage =
    targetLanguageValue &&
    TRANSLATION_INVENTORY_TARGET_LANGUAGES.includes(
      targetLanguageValue as (typeof TRANSLATION_INVENTORY_TARGET_LANGUAGES)[number]
    )
      ? normalizeTranslationInventoryLanguage(targetLanguageValue)
      : null;

  if (!file || typeof file === "string") {
    const message = "Choose a CSV file to validate.";
    redirectToGlobalization({
      tab: "inventory",
      error: message,
      report: importReportToParamsForAction(buildCsvFormErrorReport(message), {
        action: "validate",
        targetLanguage: targetLanguageValue,
      }),
    });
  }

  if (!targetLanguage) {
    const message = "Select a target language before validating a CSV.";
    redirectToGlobalization({
      tab: "inventory",
      error: message,
      report: importReportToParamsForAction(buildCsvFormErrorReport(message), {
        action: "validate",
        targetLanguage: targetLanguageValue,
        fileName: file.name,
      }),
    });
  }

  const report = await importTranslationInventoryCsv(await file.text(), {
    validateOnly: true,
    targetLanguage,
  });
  const reportStatus = getCsvReportStatus(report);

  redirectToGlobalization({
    tab: "inventory",
    notice:
      reportStatus === "success"
        ? `CSV validation completed. ${report.rowsMatched} rows match the current inventory.`
        : undefined,
    error:
      reportStatus === "failed"
        ? report.errors[0] ?? "CSV validation failed."
        : undefined,
    report: importReportToParamsForAction(report, {
      action: "validate",
      targetLanguage,
      fileName: file.name,
    }),
  });
}

export async function importTranslationCsv(formData: FormData) {
  await requireAdmin();
  const file = formData.get("csvFile");
  const targetLanguageValue = readString(formData, "targetLanguage", 16);
  const targetLanguage =
    targetLanguageValue &&
    TRANSLATION_INVENTORY_TARGET_LANGUAGES.includes(
      targetLanguageValue as (typeof TRANSLATION_INVENTORY_TARGET_LANGUAGES)[number]
    )
      ? normalizeTranslationInventoryLanguage(targetLanguageValue)
      : null;

  if (!file || typeof file === "string") {
    const message = "Choose a CSV file to import.";
    redirectToGlobalization({
      tab: "inventory",
      error: message,
      report: importReportToParamsForAction(buildCsvFormErrorReport(message), {
        action: "apply",
        targetLanguage: targetLanguageValue,
      }),
    });
  }

  if (!targetLanguage) {
    const message = "Select a target language before importing a CSV.";
    redirectToGlobalization({
      tab: "inventory",
      error: message,
      report: importReportToParamsForAction(buildCsvFormErrorReport(message), {
        action: "apply",
        targetLanguage: targetLanguageValue,
        fileName: file.name,
      }),
    });
  }

  const report = await importTranslationInventoryCsv(await file.text(), {
    targetLanguage,
  });
  const reportStatus = getCsvReportStatus(report);
  const languageName = getLanguageMeta(targetLanguage).label;

  revalidateGlobalization();
  redirectToGlobalization({
    tab: "inventory",
    notice:
      reportStatus === "success"
        ? `${languageName} translations imported successfully.`
        : undefined,
    error:
      reportStatus === "failed"
        ? report.errors[0] ?? "CSV import failed."
        : undefined,
    report: importReportToParamsForAction(report, {
      action: "apply",
      targetLanguage,
      fileName: file.name,
    }),
  });
}

export async function viewImportedLanguage(formData: FormData) {
  await requireAdmin();
  const targetLanguage = normalizeTranslationInventoryLanguage(
    readString(formData, "targetLanguage", 16)
  );

  cookies().set(LANGUAGE_COOKIE_NAME, targetLanguage, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  redirect("/");
}

export async function updateTranslationEntry(formData: FormData) {
  await requireAdmin();
  const id = readString(formData, "id", 80);
  const translatedText = readString(formData, "translatedText", 4000);
  const language = readString(formData, "language", 16);
  const namespace = readString(formData, "namespace", 80);
  const entityType = readString(formData, "entityType", 80);
  const status = readString(formData, "status", 80);

  if (!id || !translatedText) {
    redirectToGlobalization({
      tab: "translations",
      language,
      namespace,
      entityType,
      status,
      error: "Translation text is required.",
    });
  }

  await saveTranslationEntry({ id, translatedText });

  revalidateGlobalization();
  redirectToGlobalization({
    tab: "translations",
    language,
    namespace,
    entityType,
    status,
    notice: "Translation override saved.",
  });
}
