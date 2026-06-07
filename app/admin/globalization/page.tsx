import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { cookies } from "next/headers";
import { promises as fs } from "fs";
import path from "path";
import {
  ArrowLeft,
  AlertCircle,
  BadgeCheck,
  Download,
  Globe2,
  RefreshCw,
  Search,
  Upload,
} from "lucide-react";

import { requireAdmin } from "@/app/lib/auth";
import prisma from "@/app/lib/db";
import {
  getCurrencyAdminState,
  type LatestCurrencyRate,
} from "@/app/lib/currency";
import {
  getLocalizationAdminState,
  type LocalizationAdminState,
} from "@/app/lib/i18n";
import { APP_TRANSLATION_REGISTRY } from "@/app/lib/i18nRegistry";
import {
  TRANSLATION_INVENTORY_TARGET_LANGUAGES,
  getTranslationInventoryAdminState,
  normalizeTranslationInventoryLanguage,
  type TranslationInventoryAdminState,
  type TranslationInventoryLanguage,
} from "@/app/lib/translationInventory";
import {
  BRAND_NAME,
  BRAND_POSITIONING,
  CURRENCY_COOKIE_NAME,
  FRANKFURTER_LATEST_URL,
  LANGUAGE_COOKIE_NAME,
  SUPPORTED_CURRENCIES,
  SUPPORTED_LANGUAGES,
  convertAmount,
  formatMoney,
  getCurrencyMeta,
  getLanguageMeta,
  normalizeCurrency,
  type CurrencyCode,
  type LanguageCode,
} from "@/app/lib/globalization";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CopyableTextBlock } from "./CopyableTextBlock";
import { InventoryTargetLanguagePicker } from "./InventoryTargetLanguagePicker";
import {
  syncCurrencyRates,
  resyncStaleTranslations,
  retryFailedTranslations,
  importTranslationCsv,
  scanTranslationInventoryAction,
  syncAllMissingTranslations,
  syncHomepageTranslations,
  syncStaticTranslations,
  validateTranslationCsv,
  viewImportedLanguage,
  updateCurrencySettings,
  updateLocalizationSettings,
  updateTranslationEntry,
} from "./actions";

type SearchParams = {
  tab?: string | string[];
  notice?: string | string[];
  error?: string | string[];
  language?: string | string[];
  namespace?: string | string[];
  entityType?: string | string[];
  status?: string | string[];
  category?: string | string[];
  sourceType?: string | string[];
  q?: string | string[];
  missingLanguage?: string | string[];
  amount?: string | string[];
  from?: string | string[];
  to?: string | string[];
  report?: string | string[];
  reportAction?: string | string[];
  reportStatus?: string | string[];
  reportTargetLanguage?: string | string[];
  reportTimestamp?: string | string[];
  fileName?: string | string[];
  rowsRead?: string | string[];
  rowsMatched?: string | string[];
  rowsIgnored?: string | string[];
  emptySkipped?: string | string[];
  conflicts?: string | string[];
  translationsCreated?: string | string[];
  translationsUpdated?: string | string[];
  languagesUpdated?: string | string[];
  parsingFailed?: string | string[];
  missingColumns?: string | string[];
  targetLanguageMismatches?: string | string[];
  unknownKeysIgnored?: string | string[];
  missingIdentityRows?: string | string[];
  staleSourceHashWarnings?: string | string[];
  errorsCount?: string | string[];
  warningsCount?: string | string[];
  reportErrors?: string | string[];
  reportWarnings?: string | string[];
  targetLanguage?: string | string[];
};

const tabs = [
  { key: "brand", label: "Branding audit" },
  { key: "currency", label: "Currency" },
  { key: "languages", label: "Languages" },
  { key: "translations", label: "Translation sync" },
  { key: "inventory", label: "Translation inventory" },
  { key: "logs", label: "Exchange sync logs/settings" },
  { key: "diagnostics", label: "Diagnostics" },
];

const oldBrandPatterns = [
  ["Air", "bnb"].join(""),
  ["air", "bnb"].join(""),
  ["cl", "one"].join(""),
  ["Air", "bnb Cl", "one"].join(""),
  ["vacation rental cl", "one"].join(""),
  ["Morocco ", "Stays"].join(""),
  ["Morocco ", "stays"].join(""),
];

const scannedRoots = [
  "app",
  "prisma",
  "public",
  "README.md",
  "docker-compose.yml",
  "package.json",
  "package-lock.json",
];

function readParam(searchParams: SearchParams | undefined, key: keyof SearchParams) {
  const value = searchParams?.[key];
  return Array.isArray(value) ? value[0] : value;
}

type DateLike = Date | string | number | null | undefined;

function safeFormatDateTime(
  value: DateLike,
  fallback = "Not synced yet"
) {
  if (!value) return fallback;

  const date =
    value instanceof Date
      ? value
      : typeof value === "number"
        ? new Date(value)
        : new Date(String(value));

  if (Number.isNaN(date.getTime())) return fallback;

  try {
    return new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  } catch {
    return fallback;
  }
}

function safeFormatDate(value: DateLike, fallback = "Date unavailable") {
  if (!value) return fallback;

  const date =
    value instanceof Date
      ? value
      : typeof value === "number"
        ? new Date(value)
        : new Date(String(value));

  if (Number.isNaN(date.getTime())) return fallback;

  try {
    return new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
    }).format(date);
  } catch {
    return fallback;
  }
}

function statusClass(status?: string | null) {
  if (status === "success") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "failed") return "border-red-200 bg-red-50 text-red-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

async function collectFiles(target: string): Promise<string[]> {
  const fullPath = path.join(process.cwd(), target);

  try {
    const stat = await fs.stat(fullPath);
    if (stat.isFile()) return [fullPath];
    if (!stat.isDirectory()) return [];

    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    const nested = await Promise.all(
      entries
        .filter((entry) => !["node_modules", ".next", ".git"].includes(entry.name))
        .map((entry) => collectFiles(path.join(target, entry.name)))
    );

    return nested.flat();
  } catch {
    return [];
  }
}

async function runBrandAudit() {
  const files = (await Promise.all(scannedRoots.map(collectFiles))).flat();
  const findings: { file: string; line: number; pattern: string; text: string }[] = [];
  const readableExtensions = new Set([
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".json",
    ".md",
    ".yml",
    ".yaml",
    ".prisma",
  ]);

  for (const file of files) {
    const extension = path.extname(file);
    if (!readableExtensions.has(extension)) continue;

    let content = "";
    try {
      content = await fs.readFile(file, "utf8");
    } catch {
      continue;
    }

    content.split(/\r?\n/).forEach((line, index) => {
      oldBrandPatterns.forEach((pattern) => {
        if (line.includes(pattern)) {
          findings.push({
            file: path.relative(process.cwd(), file),
            line: index + 1,
            pattern,
            text: line.trim().slice(0, 180),
          });
        }
      });
    });
  }

  return findings;
}

async function getDiagnostics() {
  const cookieStore = cookies();
  const [
    activeCurrencyRates,
    latestCurrencyRate,
    translationEntries,
    translationCounts,
  ] =
    await Promise.all([
      prisma.currencyRate.count({ where: { isActive: true } }),
      prisma.currencyRate.findFirst({
        where: { isActive: true },
        orderBy: [{ fetchedAt: "desc" }, { createdAt: "desc" }],
        select: { sourceDate: true, fetchedAt: true },
      }),
      prisma.translationEntry.count(),
      prisma.translationEntry.groupBy({
        by: ["language", "status"],
        _count: { _all: true },
        orderBy: [{ language: "asc" }, { status: "asc" }],
      }),
    ]);

  return {
    selectedCurrencyCookie:
      cookieStore.get(CURRENCY_COOKIE_NAME)?.value ?? "Not set",
    selectedLanguageCookie:
      cookieStore.get(LANGUAGE_COOKIE_NAME)?.value ?? "Not set",
    activeCurrencyRates,
    latestCurrencyRateSourceDate: latestCurrencyRate?.sourceDate ?? null,
    latestCurrencyRateFetchedAt: latestCurrencyRate?.fetchedAt ?? null,
    translationEntries,
    translationCounts,
    libreTranslateConfigured: Boolean(process.env.LIBRETRANSLATE_URL),
  };
}

function OverviewCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
        {detail ? <CardDescription>{detail}</CardDescription> : null}
      </CardHeader>
    </Card>
  );
}

function HiddenTab({ tab }: { tab: string }) {
  return <input type="hidden" name="tab" value={tab} />;
}

function CurrencyControls({
  settings,
}: {
  settings: Awaited<ReturnType<typeof getCurrencyAdminState>>["settings"];
}) {
  const enabledSet = new Set(settings.enabledCurrencies);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Currency controls</CardTitle>
        <CardDescription>
          Listing and reservation values remain immutable. These controls affect
          display conversion only.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={updateCurrencySettings} className="space-y-5">
          <HiddenTab tab="currency" />
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="defaultCurrency">Default public currency</Label>
              <select
                id="defaultCurrency"
                name="defaultCurrency"
                defaultValue={settings.defaultCurrency}
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {SUPPORTED_CURRENCIES.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.symbol} {currency.code}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="roundingMode">Rounding mode</Label>
              <select
                id="roundingMode"
                name="roundingMode"
                defaultValue={settings.roundingMode}
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="standard">Standard</option>
                <option value="whole">Whole amounts</option>
                <option value="cents">Always show cents</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Base currency</Label>
              <div className="flex h-10 items-center rounded-md border bg-muted/30 px-3 text-sm font-medium">
                {settings.baseCurrency}
              </div>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium">Enabled currencies</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {SUPPORTED_CURRENCIES.map((currency) => (
                <label
                  key={currency.code}
                  className="flex items-center justify-between rounded-md border p-3 text-sm"
                >
                  <span>
                    {currency.symbol} {currency.code}
                  </span>
                  <input
                    type="checkbox"
                    name="enabledCurrencies"
                    value={currency.code}
                    defaultChecked={enabledSet.has(currency.code)}
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex items-center justify-between rounded-md border p-3 text-sm">
              <span>Show original currency after conversion</span>
              <input
                type="checkbox"
                name="showOriginalCurrency"
                defaultChecked={settings.showOriginalCurrency}
              />
            </label>
            <label className="flex items-center justify-between rounded-md border p-3 text-sm">
              <span>Auto-sync enabled</span>
              <input
                type="checkbox"
                name="autoSyncEnabled"
                defaultChecked={settings.autoSyncEnabled}
              />
            </label>
          </div>

          <Button type="submit">Save currency settings</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function RatesTable({
  settings,
  rows,
}: {
  settings: Awaited<ReturnType<typeof getCurrencyAdminState>>["settings"];
  rows: LatestCurrencyRate[];
}) {
  const rowByCurrency = new Map<CurrencyCode, LatestCurrencyRate>();
  rows
    .filter((row) => row.baseCurrency === settings.baseCurrency)
    .forEach((row) => rowByCurrency.set(row.quoteCurrency, row));

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Latest exchange rates</CardTitle>
            <CardDescription>
              Source: Frankfurter. Endpoint constant: {FRANKFURTER_LATEST_URL}
            </CardDescription>
          </div>
          <form action={syncCurrencyRates}>
            <Button type="submit" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Sync latest exchange rates
            </Button>
          </form>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-3 pr-4 font-medium">Currency</th>
              <th className="py-3 pr-4 font-medium">Symbol</th>
              <th className="py-3 pr-4 font-medium">Latest rate</th>
              <th className="py-3 pr-4 font-medium">Source date</th>
              <th className="py-3 pr-4 font-medium">Fetched at</th>
              <th className="py-3 pr-4 font-medium">Active</th>
            </tr>
          </thead>
          <tbody>
            {SUPPORTED_CURRENCIES.map((currency) => {
              const row = rowByCurrency.get(currency.code);
              const isBase = currency.code === settings.baseCurrency;

              return (
                <tr key={currency.code} className="border-b last:border-0">
                  <td className="py-3 pr-4 font-medium">{currency.code}</td>
                  <td className="py-3 pr-4">{currency.symbol}</td>
                  <td className="py-3 pr-4">
                    {isBase ? "1.000000" : row ? row.rate.toFixed(6) : "Missing"}
                  </td>
                  <td className="py-3 pr-4">
                    {isBase ? "Identity" : safeFormatDate(row?.sourceDate)}
                  </td>
                  <td className="py-3 pr-4">
                    {isBase
                      ? "Always"
                      : safeFormatDateTime(row?.fetchedAt, "Date unavailable")}
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className={`rounded-md border px-2 py-1 text-xs ${
                        isBase || row?.isActive
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : "border-amber-200 bg-amber-50 text-amber-800"
                      }`}
                    >
                      {isBase || row?.isActive ? "Active" : "Missing"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function ConversionTestCard({
  amount,
  fromCurrency,
  toCurrency,
  baseCurrency,
  rates,
  roundingMode,
}: {
  amount: number;
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  baseCurrency: CurrencyCode;
  rates: Awaited<ReturnType<typeof getCurrencyAdminState>>["rates"];
  roundingMode: Awaited<ReturnType<typeof getCurrencyAdminState>>["settings"]["roundingMode"];
}) {
  const normalizedRates = { ...rates, [baseCurrency]: 1 };
  const converted = Number.isFinite(amount)
    ? convertAmount(amount, fromCurrency, toCurrency, normalizedRates)
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Test conversion</CardTitle>
        <CardDescription>
          Uses saved active rates only. Missing rates fall back without affecting
          public data.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]" method="GET">
          <input type="hidden" name="tab" value="currency" />
          <div className="space-y-2">
            <Label htmlFor="amount">Amount</Label>
            <Input
              id="amount"
              name="amount"
              type="number"
              step="0.01"
              min="0"
              defaultValue={String(amount)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="from">From</Label>
            <select
              id="from"
              name="from"
              defaultValue={fromCurrency}
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {SUPPORTED_CURRENCIES.map((currency) => (
                <option key={currency.code} value={currency.code}>
                  {currency.symbol} {currency.code}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="to">To</Label>
            <select
              id="to"
              name="to"
              defaultValue={toCurrency}
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {SUPPORTED_CURRENCIES.map((currency) => (
                <option key={currency.code} value={currency.code}>
                  {currency.symbol} {currency.code}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button type="submit" variant="outline" className="w-full">
              Test
            </Button>
          </div>
        </form>

        <div className="rounded-md border bg-muted/30 p-4 text-sm">
          {converted === null ? (
            <p className="font-medium text-amber-800">
              Missing active rates for this conversion.
            </p>
          ) : (
            <p className="font-medium">
              {formatMoney(amount, fromCurrency, roundingMode)} ={" "}
              {formatMoney(converted, toCurrency, roundingMode)}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function LanguageControls({
  settings,
}: {
  settings: Awaited<ReturnType<typeof getLocalizationAdminState>>["settings"];
}) {
  const enabledSet = new Set(settings.enabledLanguages);
  const serviceConfigured = Boolean(settings.translationEndpoint);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Language settings</CardTitle>
        <CardDescription>
          English is the source language. UI translations are cached in the
          database and fall back safely to English.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!serviceConfigured ? (
          <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Translation service not configured.
          </div>
        ) : null}

        <form action={updateLocalizationSettings} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="defaultLanguage">Default language</Label>
              <select
                id="defaultLanguage"
                name="defaultLanguage"
                defaultValue={settings.defaultLanguage}
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {SUPPORTED_LANGUAGES.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.flag} {language.nativeLabel}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="translationEndpoint">LibreTranslate endpoint</Label>
              <Input
                id="translationEndpoint"
                defaultValue={
                  settings.translationEndpoint ??
                  "Set LIBRETRANSLATE_URL on the server"
                }
                readOnly
                aria-readonly="true"
              />
            </div>
          </div>

          <div>
            <p className="text-sm font-medium">Enabled languages</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {SUPPORTED_LANGUAGES.map((language) => (
                <label
                  key={language.code}
                  className="flex items-center justify-between rounded-md border p-3 text-sm"
                >
                  <span>
                    {language.flag} {language.nativeLabel}
                  </span>
                  <input
                    type="checkbox"
                    name="enabledLanguages"
                    value={language.code}
                    defaultChecked={enabledSet.has(language.code)}
                  />
                </label>
              ))}
            </div>
          </div>

          <label className="flex items-center justify-between rounded-md border p-3 text-sm">
            <span>Auto-translate enabled</span>
            <input
              type="checkbox"
              name="autoTranslateEnabled"
              defaultChecked={settings.autoTranslateEnabled}
            />
          </label>

          <Button type="submit">Save language settings</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function HiddenTranslationFilters({
  filters,
}: {
  filters: LocalizationAdminState["editorFilters"];
}) {
  return (
    <>
      <input type="hidden" name="language" value={filters.language} />
      <input type="hidden" name="namespace" value={filters.namespace} />
      <input type="hidden" name="entityType" value={filters.entityType} />
      <input type="hidden" name="status" value={filters.status} />
    </>
  );
}

function BatchLimitSelect() {
  return (
    <select
      name="batchLimit"
      defaultValue="25"
      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
      aria-label="Batch limit"
    >
      <option value="25">25</option>
      <option value="50">50</option>
      <option value="100">100</option>
    </select>
  );
}

function TranslationActionForm({
  action,
  label,
  filters,
}: {
  action: (formData: FormData) => Promise<void>;
  label: string;
  filters: LocalizationAdminState["editorFilters"];
}) {
  return (
    <form action={action} className="flex items-center gap-2">
      <HiddenTranslationFilters filters={filters} />
      <BatchLimitSelect />
      <Button type="submit" variant="outline" size="sm" className="gap-2">
        <RefreshCw className="h-4 w-4" />
        {label}
      </Button>
    </form>
  );
}

function TranslationOperationsSection({
  state,
}: {
  state: LocalizationAdminState;
}) {
  const { providerStatus, settings, coverage, editorFilters } = state;
  const totalMissing = coverage.languageStats.reduce(
    (total, item) => total + item.missing,
    0
  );
  const totalStale = coverage.languageStats.reduce(
    (total, item) => total + item.stale,
    0
  );
  const totalFailed = coverage.languageStats.reduce(
    (total, item) => total + item.failed,
    0
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Provider status</CardTitle>
          <CardDescription>
            LibreTranslate calls run server-side only during admin sync actions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            <span className="text-muted-foreground">Configured:</span>{" "}
            {providerStatus.configured ? "Yes" : "No"}
          </p>
          <p>
            <span className="text-muted-foreground">Endpoint:</span>{" "}
            {providerStatus.endpoint ?? "Translation service not configured"}
          </p>
          <p>
            <span className="text-muted-foreground">Last sync:</span>{" "}
            {safeFormatDateTime(settings.lastSyncAt)}
          </p>
          <p>
            <span className="text-muted-foreground">Last status:</span>{" "}
            {settings.lastSyncStatus ?? "Not synced"}
          </p>
          {settings.lastSyncError ? (
            <p className="rounded-md border border-red-200 bg-red-50 p-3 text-red-900">
              {settings.lastSyncError}
            </p>
          ) : null}
          <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
            Built-in dictionary fallback is active for core UI only. It is not
            synced translation memory.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Translation operations</CardTitle>
          <CardDescription>
            Batch-limited machine sync. Click again to continue remaining work.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!providerStatus.configured ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Translation service not configured. Sync actions will register
              pending rows when needed and return a safe error.
            </div>
          ) : null}
          <div className="grid gap-3 md:grid-cols-2">
            <TranslationActionForm
              action={syncStaticTranslations}
              label="Sync static UI"
              filters={editorFilters}
            />
            <TranslationActionForm
              action={syncHomepageTranslations}
              label="Sync Homepage Builder"
              filters={editorFilters}
            />
            <TranslationActionForm
              action={syncAllMissingTranslations}
              label="Sync all missing"
              filters={editorFilters}
            />
            <TranslationActionForm
              action={resyncStaleTranslations}
              label="Resync stale"
              filters={editorFilters}
            />
            <TranslationActionForm
              action={retryFailedTranslations}
              label="Retry failed"
              filters={editorFilters}
            />
          </div>
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-muted-foreground">Missing remaining</p>
              <p className="mt-1 text-xl font-semibold">{totalMissing}</p>
            </div>
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-muted-foreground">Stale remaining</p>
              <p className="mt-1 text-xl font-semibold">{totalStale}</p>
            </div>
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-muted-foreground">Failed remaining</p>
              <p className="mt-1 text-xl font-semibold">{totalFailed}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TranslationCoverageSection({
  coverage,
}: {
  coverage: LocalizationAdminState["coverage"];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Translation coverage</CardTitle>
        <CardDescription>
          Source fields are English canonical text; fallback dictionary entries
          are not counted as synced translations.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-4">
          {[
            ["Registered static UI keys", coverage.staticKeyCount],
            ["Dynamic content fields", coverage.dynamicContentFieldCount],
            ["Total source fields", coverage.totalSourceFields],
            ["Human reviewed rows", coverage.humanReviewedCount],
          ].map(([label, value]) => (
            <div key={label} className="rounded-md border bg-muted/30 p-4">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-1 text-2xl font-semibold">{value}</p>
            </div>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-3 pr-4 font-medium">Language</th>
                <th className="py-3 pr-4 font-medium">TranslationEntry rows</th>
                <th className="py-3 pr-4 font-medium">Active cached</th>
                <th className="py-3 pr-4 font-medium">Missing</th>
                <th className="py-3 pr-4 font-medium">Stale</th>
                <th className="py-3 pr-4 font-medium">Failed</th>
                <th className="py-3 pr-4 font-medium">Human reviewed</th>
              </tr>
            </thead>
            <tbody>
              {coverage.languageStats.map((row) => (
                <tr key={row.language} className="border-b last:border-0">
                  <td className="py-3 pr-4">
                    {getLanguageMeta(row.language).flag}{" "}
                    {getLanguageMeta(row.language).nativeLabel}
                  </td>
                  <td className="py-3 pr-4">{row.dbEntries}</td>
                  <td className="py-3 pr-4">{row.active}</td>
                  <td className="py-3 pr-4">{row.missing}</td>
                  <td className="py-3 pr-4">{row.stale}</td>
                  <td className="py-3 pr-4">{row.failed}</td>
                  <td className="py-3 pr-4">{row.humanReviewed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function ManualTranslationEditor({
  state,
}: {
  state: LocalizationAdminState;
}) {
  const { entries, editorFilters, selectedLanguage } = state;
  const namespaces = Array.from(
    new Set([
      ...APP_TRANSLATION_REGISTRY.map((entry) => entry.namespace),
      "entity",
    ])
  ).sort();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Manual translation editor</CardTitle>
        <CardDescription>
          Selected language: {getLanguageMeta(selectedLanguage).flag}{" "}
          {getLanguageMeta(selectedLanguage).nativeLabel}. Saving marks a row as
          human reviewed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form className="grid gap-3 md:grid-cols-5" method="GET">
          <input type="hidden" name="tab" value="translations" />
          <div className="space-y-2">
            <Label htmlFor="translationLanguage">Language</Label>
            <select
              id="translationLanguage"
              name="language"
              defaultValue={editorFilters.language}
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {SUPPORTED_LANGUAGES.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.flag} {language.nativeLabel}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="translationNamespace">Namespace</Label>
            <select
              id="translationNamespace"
              name="namespace"
              defaultValue={editorFilters.namespace}
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="all">All namespaces</option>
              {namespaces.map((namespace) => (
                <option key={namespace} value={namespace}>
                  {namespace}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="translationEntityType">Entity type</Label>
            <select
              id="translationEntityType"
              name="entityType"
              defaultValue={editorFilters.entityType}
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="all">All entries</option>
              <option value="__static__">Static UI</option>
              <option value="homepageSection">HomepageSection</option>
              <option value="home">Home/listing</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="translationStatus">Status</Label>
            <select
              id="translationStatus"
              name="status"
              defaultValue={editorFilters.status}
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="all">All statuses</option>
              <option value="queued">queued</option>
              <option value="draft">draft</option>
              <option value="machine_translated">machine_translated</option>
              <option value="human_reviewed">human_reviewed</option>
              <option value="stale">stale</option>
              <option value="failed">failed</option>
            </select>
          </div>
          <div className="flex items-end">
            <Button type="submit" variant="outline" className="w-full">
              Filter
            </Button>
          </div>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-3 pr-4 font-medium">Key</th>
                <th className="py-3 pr-4 font-medium">Scope</th>
                <th className="py-3 pr-4 font-medium">Base English text</th>
                <th className="py-3 pr-4 font-medium">Translation</th>
                <th className="py-3 pr-4 font-medium">Status</th>
                <th className="py-3 pr-4 font-medium">Last synced/error</th>
              </tr>
            </thead>
            <tbody>
              {entries.length > 0 ? (
                entries.map((entry) => (
                  <tr key={entry.id} className="border-b align-top last:border-0">
                    <td className="max-w-[220px] py-3 pr-4 font-medium">
                      <span className="break-words">{entry.key}</span>
                      <span className="mt-1 block text-xs font-normal text-muted-foreground">
                        {entry.namespace}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      {entry.entityType ? (
                        <span>
                          {entry.entityType}
                          <span className="block text-xs text-muted-foreground">
                            {entry.fieldName} · {entry.entityId}
                          </span>
                        </span>
                      ) : (
                        "Static UI"
                      )}
                    </td>
                    <td className="max-w-xs whitespace-pre-line py-3 pr-4 text-muted-foreground">
                      {entry.baseText}
                    </td>
                    <td className="min-w-[320px] py-3 pr-4">
                      <form action={updateTranslationEntry} className="space-y-2">
                        <input type="hidden" name="id" value={entry.id} />
                        <HiddenTranslationFilters filters={editorFilters} />
                        <Textarea
                          name="translatedText"
                          defaultValue={entry.translatedText ?? ""}
                          className="min-h-24"
                        />
                        <Button type="submit" variant="outline" size="sm">
                          Save as human reviewed
                        </Button>
                      </form>
                    </td>
                    <td className="py-3 pr-4">
                      <span className="rounded-md border bg-muted px-2 py-1 text-xs">
                        {entry.status}
                      </span>
                      {entry.source ? (
                        <span className="mt-2 block text-xs text-muted-foreground">
                          {entry.source}
                        </span>
                      ) : null}
                    </td>
                    <td className="max-w-xs py-3 pr-4">
                      <span>{safeFormatDateTime(entry.lastSyncedAt)}</span>
                      {entry.errorMessage ? (
                        <span className="mt-2 block rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-900">
                          {entry.errorMessage}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="py-4 text-muted-foreground" colSpan={6}>
                    No TranslationEntry rows match these filters. Run a sync
                    operation to register queued rows, or change filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function TranslationTable({ state }: { state: LocalizationAdminState }) {
  return (
    <div className="space-y-6">
      <TranslationOperationsSection state={state} />
      <TranslationCoverageSection coverage={state.coverage} />
      <ManualTranslationEditor state={state} />
    </div>
  );
}

function readReportNumber(
  searchParams: SearchParams | undefined,
  key: keyof SearchParams
) {
  const value = Number(readParam(searchParams, key) ?? "0");
  return Number.isFinite(value) ? value : 0;
}

type InventoryCsvReportStatus = "success" | "partial" | "failed";
type InventoryCsvReportAction = "validate" | "apply";

type InventoryCsvUrlReport = {
  action: InventoryCsvReportAction;
  status: InventoryCsvReportStatus;
  targetLanguage: TranslationInventoryLanguage;
  rowsRead: number;
  rowsMatched: number;
  rowsIgnored: number;
  rowsEmptySkipped: number;
  conflicts: number;
  translationsCreated: number;
  translationsUpdated: number;
  languagesUpdated: string | null | undefined;
  parsingFailed: boolean;
  missingColumns: string[];
  targetLanguageMismatches: number;
  unknownKeysIgnored: number;
  missingIdentityRows: number;
  staleSourceHashWarnings: number;
  errorsCount: number;
  warningsCount: number;
  errors: string[];
  warnings: string[];
  timestamp: string | null | undefined;
  fileName: string | null | undefined;
};

function normalizeCsvReportAction(
  value?: string | null
): InventoryCsvReportAction {
  return value === "validate" ? "validate" : "apply";
}

function normalizeCsvReportStatus(
  value: string | null | undefined,
  searchParams: SearchParams | undefined
): InventoryCsvReportStatus {
  if (value === "success" || value === "partial" || value === "failed") {
    return value;
  }

  const errors = readParam(searchParams, "reportErrors");
  const warnings = readParam(searchParams, "reportWarnings");
  const hasWarnings =
    Boolean(warnings) ||
    readReportNumber(searchParams, "rowsIgnored") > 0 ||
    readReportNumber(searchParams, "emptySkipped") > 0 ||
    readReportNumber(searchParams, "conflicts") > 0;

  if (errors) return "failed";
  return hasWarnings ? "partial" : "success";
}

function readReportList(
  searchParams: SearchParams | undefined,
  key: keyof SearchParams,
  delimiter: string
) {
  const value = readParam(searchParams, key);
  return value
    ? value
        .split(delimiter)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function getInventoryCsvUrlReport(
  searchParams: SearchParams | undefined
): InventoryCsvUrlReport | null {
  if (readParam(searchParams, "report") !== "csv") return null;

  const errors = readReportList(searchParams, "reportErrors", " | ");
  const warnings = readReportList(searchParams, "reportWarnings", " | ");
  const status = normalizeCsvReportStatus(
    readParam(searchParams, "reportStatus"),
    searchParams
  );

  return {
    action: normalizeCsvReportAction(readParam(searchParams, "reportAction")),
    status,
    targetLanguage: normalizeTranslationInventoryLanguage(
      readParam(searchParams, "reportTargetLanguage") ??
        readParam(searchParams, "targetLanguage")
    ),
    rowsRead: readReportNumber(searchParams, "rowsRead"),
    rowsMatched: readReportNumber(searchParams, "rowsMatched"),
    rowsIgnored: readReportNumber(searchParams, "rowsIgnored"),
    rowsEmptySkipped: readReportNumber(searchParams, "emptySkipped"),
    conflicts: readReportNumber(searchParams, "conflicts"),
    translationsCreated: readReportNumber(searchParams, "translationsCreated"),
    translationsUpdated: readReportNumber(searchParams, "translationsUpdated"),
    languagesUpdated: readParam(searchParams, "languagesUpdated"),
    parsingFailed: readParam(searchParams, "parsingFailed") === "true",
    missingColumns: readReportList(searchParams, "missingColumns", ","),
    targetLanguageMismatches: readReportNumber(
      searchParams,
      "targetLanguageMismatches"
    ),
    unknownKeysIgnored: readReportNumber(searchParams, "unknownKeysIgnored"),
    missingIdentityRows: readReportNumber(searchParams, "missingIdentityRows"),
    staleSourceHashWarnings: readReportNumber(
      searchParams,
      "staleSourceHashWarnings"
    ),
    errorsCount: Math.max(readReportNumber(searchParams, "errorsCount"), errors.length),
    warningsCount: Math.max(
      readReportNumber(searchParams, "warningsCount"),
      warnings.length
    ),
    errors,
    warnings,
    timestamp: readParam(searchParams, "reportTimestamp"),
    fileName: readParam(searchParams, "fileName"),
  };
}

function getCsvReportWarningDetails(report: InventoryCsvUrlReport) {
  return [
    report.unknownKeysIgnored > 0
      ? `Unknown keys ignored: ${report.unknownKeysIgnored}`
      : null,
    report.rowsEmptySkipped > 0
      ? `Empty translatedText skipped: ${report.rowsEmptySkipped}`
      : null,
    report.targetLanguageMismatches > 0
      ? `TargetLanguage mismatches: ${report.targetLanguageMismatches}`
      : null,
    report.staleSourceHashWarnings > 0
      ? `Stale sourceHash warnings: ${report.staleSourceHashWarnings}`
      : null,
    report.missingIdentityRows > 0
      ? `Rows missing key or namespace: ${report.missingIdentityRows}`
      : null,
  ].filter((item): item is string => Boolean(item));
}

function InventoryReportMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-lg font-semibold">{value}</p>
    </div>
  );
}

function InventoryCsvReportPanel({
  report,
  state,
}: {
  report: InventoryCsvUrlReport;
  state: TranslationInventoryAdminState;
}) {
  const languageMeta = getLanguageMeta(report.targetLanguage);
  const languageName = getChatGptWorkflowLanguageName(report.targetLanguage);
  const actionLabel =
    report.action === "validate" ? "Validate CSV only" : "Apply CSV translations";
  const timestamp = safeFormatDateTime(report.timestamp, "Time unavailable");
  const languageStats = state.summary.languageStats[report.targetLanguage];
  const selectedLanguageReady =
    languageStats.missing === 0 && languageStats.stale === 0;
  const warningDetails = getCsvReportWarningDetails(report);
  const createLabel =
    report.action === "validate" ? "Would create" : "Translations created";
  const updateLabel =
    report.action === "validate" ? "Would update" : "Translations updated";
  const exportHref = `/admin/globalization/export-language-csv?language=${encodeURIComponent(
    report.targetLanguage
  )}`;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>
              {report.action === "validate"
                ? "CSV validation report"
                : "CSV import report"}
            </CardTitle>
            <CardDescription>
              {actionLabel}.{" "}
              {report.action === "validate"
                ? "No database rows were modified."
                : "TranslationEntry rows were written only when blocking errors were absent."}
            </CardDescription>
          </div>
          <span
            className={`w-fit rounded-md border px-3 py-1 text-sm font-semibold ${statusClass(
              report.status
            )}`}
          >
            {report.status}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {report.status === "success" && report.action === "apply" ? (
          <div className="flex items-start gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <BadgeCheck className="mt-0.5 h-4 w-4 flex-none" />
            <div>
              <p className="font-semibold">
                {languageName} translations imported successfully.
              </p>
              <p className="mt-1">
                Imported translations are now available through the public
                language selector.
              </p>
            </div>
          </div>
        ) : null}

        {report.status === "success" && report.action === "validate" ? (
          <div className="flex items-start gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <BadgeCheck className="mt-0.5 h-4 w-4 flex-none" />
            <div>
              <p className="font-semibold">CSV validation completed successfully.</p>
              <p className="mt-1">
                This was a dry run. No TranslationEntry rows were modified.
              </p>
            </div>
          </div>
        ) : null}

        {report.status === "partial" ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">
              {report.action === "validate"
                ? "Validation completed with warnings."
                : "Import completed with warnings."}
            </p>
            {warningDetails.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {warningDetails.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
            {report.warnings.length > 0 ? (
              <p className="mt-2 break-words">
                Warnings: {report.warnings.join(" | ")}
              </p>
            ) : null}
          </div>
        ) : null}

        {report.status === "failed" ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <p className="font-semibold">
              {report.action === "validate"
                ? "CSV validation failed."
                : "CSV import failed."}
            </p>
            <p className="mt-2 break-words">
              {report.errors[0] ??
                "The CSV could not be processed. No database changes were applied."}
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <span>CSV columns missing: {report.missingColumns.length ? "yes" : "no"}</span>
              <span>
                Target language conflicted:{" "}
                {report.targetLanguageMismatches > 0 ? "yes" : "no"}
              </span>
              <span>Parsing failed: {report.parsingFailed ? "yes" : "no"}</span>
            </div>
            {report.missingColumns.length > 0 ? (
              <p className="mt-2 break-words">
                Missing columns: {report.missingColumns.join(", ")}
              </p>
            ) : null}
            {report.errors.length > 1 ? (
              <p className="mt-2 break-words">
                Additional errors: {report.errors.slice(1).join(" | ")}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <InventoryReportMetric label="Action" value={actionLabel} />
          <InventoryReportMetric
            label="Selected target language"
            value={`${languageMeta.flag} ${languageMeta.label} (${report.targetLanguage})`}
          />
          <InventoryReportMetric label="Status" value={report.status} />
          <InventoryReportMetric label="Timestamp" value={timestamp} />
          <InventoryReportMetric label="File name" value={report.fileName ?? "Unavailable"} />
          <InventoryReportMetric label="Rows read" value={report.rowsRead} />
          <InventoryReportMetric label="Rows matched" value={report.rowsMatched} />
          <InventoryReportMetric label="Rows ignored" value={report.rowsIgnored} />
          <InventoryReportMetric label={createLabel} value={report.translationsCreated} />
          <InventoryReportMetric label={updateLabel} value={report.translationsUpdated} />
          <InventoryReportMetric
            label="Empty cells skipped"
            value={report.rowsEmptySkipped}
          />
          <InventoryReportMetric label="Conflicts" value={report.conflicts} />
          <InventoryReportMetric label="Errors" value={report.errorsCount} />
          <InventoryReportMetric label="Warnings" value={report.warningsCount} />
          <InventoryReportMetric
            label="Selected language completion"
            value={`${languageStats.completionPercent}%`}
          />
          <InventoryReportMetric
            label="Selected language ready"
            value={selectedLanguageReady ? "Ready" : "Not ready"}
          />
        </div>

        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          <p className="font-medium">
            {languageMeta.label}: {languageStats.humanReviewed} human reviewed,{" "}
            {languageStats.missing} missing, {languageStats.stale} stale.
          </p>
          <p className="mt-1 text-muted-foreground">
            Counts are refreshed from TranslationEntry after the redirect.
          </p>
        </div>

        {report.action === "apply" && report.status !== "failed" ? (
          <div className="rounded-md border p-4">
            <p className="font-medium">View imported language</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Open the public homepage with the selected language cookie set, or
              export the same language again to verify saved translations.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <form action={viewImportedLanguage}>
                <input
                  type="hidden"
                  name="targetLanguage"
                  value={report.targetLanguage}
                />
                <Button type="submit" variant="outline" className="gap-2">
                  <Globe2 className="h-4 w-4" />
                  View imported language
                </Button>
              </form>
              <Button asChild variant="outline" className="gap-2">
                <Link href={exportHref}>
                  <Download className="h-4 w-4" />
                  Export same language CSV
                </Link>
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function InventoryScanReportPanel({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const metrics = [
    ["Rows read", readReportNumber(searchParams, "rowsRead")],
    ["Created", readReportNumber(searchParams, "translationsCreated")],
    ["Updated/stale", readReportNumber(searchParams, "translationsUpdated")],
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Inventory scan report</CardTitle>
        <CardDescription>
          Current fixed labels, homepage sections, taxonomy, statuses, and
          system labels were registered in TranslationEntry.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-3">
          {metrics.map(([label, value]) => (
            <InventoryReportMetric key={label} label={String(label)} value={value} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function InventoryReportPanel({
  searchParams,
  state,
}: {
  searchParams?: SearchParams;
  state: TranslationInventoryAdminState;
}) {
  const report = readParam(searchParams, "report");
  if (!report) return null;

  const csvReport = getInventoryCsvUrlReport(searchParams);
  if (csvReport) {
    return <InventoryCsvReportPanel report={csvReport} state={state} />;
  }

  if (report === "scan") {
    return <InventoryScanReportPanel searchParams={searchParams} />;
  }

  return null;
}

function getChatGptWorkflowLanguageName(language: LanguageCode) {
  switch (language) {
    case "zh-CN":
      return "Simplified Chinese";
    case "ar":
      return "Arabic";
    case "ja":
      return "Japanese";
    case "hi":
      return "Hindi";
    case "fr":
      return "French";
    case "es":
      return "Spanish";
    default:
      return getLanguageMeta(language).label;
  }
}

function getChatGptWorkflowPrompt(language: LanguageCode) {
  const languageName = getChatGptWorkflowLanguageName(language);
  const extraRules = [
    language === "ar"
      ? "Use Modern Standard Arabic and keep the brand name Kantara unchanged."
      : null,
    language === "ja"
      ? "Use natural Japanese suitable for a premium travel marketplace."
      : null,
    language === "zh-CN" ? "Use Simplified Chinese." : null,
    language === "hi"
      ? "Use natural standard Hindi suitable for a premium travel marketplace."
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  return [
    `Translate this CSV into ${languageName}.`,
    "",
    "Rules:",
    "- Keep the exact CSV structure.",
    "- Keep the same columns and row order.",
    "- Only fill or update the translatedText column.",
    "- Do not edit key, namespace, category, sourceType, sourceId, sourceField, baseLanguage, targetLanguage, baseText, context, status, sourceHash, or notes.",
    "- Keep the brand name Kantara unchanged.",
    "- Preserve valid CSV formatting.",
    "- Preserve commas, quotes, line breaks, and UTF-8 characters.",
    "- Return a valid CSV file only.",
    extraRules ? "" : null,
    extraRules || null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

function InventoryFilterSelect({
  id,
  name,
  label,
  value,
  options,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  options: string[];
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        name={name}
        defaultValue={value}
        className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        <option value="all">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option.replaceAll("_", " ")}
          </option>
        ))}
      </select>
    </div>
  );
}

function InventoryMissingLanguageSelect({
  value,
}: {
  value: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="inventoryMissingLanguage">Missing language</Label>
      <select
        id="inventoryMissingLanguage"
        name="missingLanguage"
        defaultValue={value}
        className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        <option value="all">All</option>
        {TRANSLATION_INVENTORY_TARGET_LANGUAGES.map((language) => (
          <option key={language} value={language}>
            {getLanguageMeta(language).flag} {getLanguageMeta(language).label}
          </option>
        ))}
      </select>
    </div>
  );
}

function LastCsvImportSummary({
  report,
}: {
  report: InventoryCsvUrlReport | null;
}) {
  if (!report || report.action !== "apply") return null;

  const languageMeta = getLanguageMeta(report.targetLanguage);
  const appliedRows =
    report.status === "failed"
      ? 0
      : report.translationsCreated + report.translationsUpdated;

  return (
    <div className={`rounded-md border p-4 text-sm ${statusClass(report.status)}`}>
      <p className="font-semibold">Last CSV import</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-4">
        <span>
          Language: {languageMeta.flag} {languageMeta.label}
        </span>
        <span>Created/updated: {appliedRows}</span>
        <span>Timestamp: {safeFormatDateTime(report.timestamp, "Unavailable")}</span>
        <span>Status: {report.status}</span>
      </div>
    </div>
  );
}

function TranslationInventorySection({
  state,
  searchParams,
  targetLanguage,
}: {
  state: TranslationInventoryAdminState;
  searchParams?: SearchParams;
  targetLanguage: TranslationInventoryLanguage;
}) {
  const csvReport = getInventoryCsvUrlReport(searchParams);
  const targetLanguageStats = state.summary.languageStats[targetLanguage];
  const summaryCards = [
    ["Inventory items detected", state.summary.inventoryItems],
    ["CSV eligible items", state.summary.csvEligibleItems],
    ["Missing translations", state.summary.missingTranslations],
    ["Stale translations", state.summary.staleTranslations],
    ["Human reviewed", state.summary.humanReviewedTranslations],
    ["Machine translated", state.summary.machineTranslatedTranslations],
  ];
  const exportHref = `/admin/globalization/export-language-csv?language=${encodeURIComponent(
    targetLanguage
  )}`;
  const sampleHref = `/admin/globalization/sample-language-csv?language=${encodeURIComponent(
    targetLanguage
  )}`;
  const prompt = getChatGptWorkflowPrompt(targetLanguage);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Translation Inventory + CSV Localization</CardTitle>
          <CardDescription>
            Fixed/system/platform content only. Partner property descriptions,
            reviews, messages, and private notes are intentionally excluded.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            {summaryCards.map(([label, value]) => (
              <div key={label} className="rounded-md border bg-muted/30 p-4">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-1 text-2xl font-semibold">{value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-md border bg-muted/30 p-4 text-sm">
            <p className="font-medium">
              Selected language completion:{" "}
              {getLanguageMeta(targetLanguage).flag}{" "}
              {getLanguageMeta(targetLanguage).label}{" "}
              {targetLanguageStats.completionPercent}%
            </p>
            <p className="mt-1 text-muted-foreground">
              Human reviewed {targetLanguageStats.humanReviewed} · missing{" "}
              {targetLanguageStats.missing} · stale {targetLanguageStats.stale}
            </p>
          </div>

          <LastCsvImportSummary report={csvReport} />

          <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <InventoryTargetLanguagePicker selectedLanguage={targetLanguage} />
            <div className="space-y-2">
              <p className="text-sm font-medium">Export for selected language</p>
              <p className="text-sm text-muted-foreground">
                English inventory rows are exported with the selected target
                language. Existing translations are prefilled when available.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <a
                  href={exportHref}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90"
                >
                  <Download className="h-4 w-4" />
                  Export CSV for selected language
                </a>
                <a
                  href={sampleHref}
                  className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium transition hover:bg-muted"
                >
                  Download sample CSV
                </a>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-md border p-4">
              <p className="text-sm font-medium">Workflow steps</p>
              <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>1. Select a target language.</li>
                <li>2. Export CSV for that language.</li>
                <li>3. Upload the CSV to ChatGPT.</li>
                <li>4. Ask ChatGPT to translate only the translatedText column.</li>
                <li>5. Import the completed CSV here.</li>
                <li>6. Public language selector uses the imported translations instantly.</li>
              </ol>
            </div>
            <div className="rounded-md border p-4">
              <p className="text-sm font-medium">ChatGPT prompt</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Copy this prompt into ChatGPT with the exported CSV attached.
              </p>
              <div className="mt-3">
                <CopyableTextBlock text={prompt} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Single-language import and validation</CardTitle>
          <CardDescription>
            The target language must match the uploaded CSV. Empty translated
            cells are skipped, unknown keys are ignored, and saved rows are
            marked human_reviewed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <form
              action={validateTranslationCsv}
              encType="multipart/form-data"
              className="space-y-3 rounded-md border p-4"
            >
              <input type="hidden" name="targetLanguage" value={targetLanguage} />
              <Label htmlFor="validateCsv">Validate translated CSV</Label>
              <Input
                id="validateCsv"
                type="file"
                name="csvFile"
                accept=".csv,text/csv"
              />
              <Button type="submit" variant="outline" className="gap-2">
                <Upload className="h-4 w-4" />
                Validate CSV without importing
              </Button>
            </form>
            <form
              action={importTranslationCsv}
              encType="multipart/form-data"
              className="space-y-3 rounded-md border p-4"
            >
              <input type="hidden" name="targetLanguage" value={targetLanguage} />
              <Label htmlFor="importCsv">Apply translated CSV</Label>
              <Input
                id="importCsv"
                type="file"
                name="csvFile"
                accept=".csv,text/csv"
              />
              <Button type="submit" className="gap-2">
                <Upload className="h-4 w-4" />
                Apply CSV translations
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>

      <InventoryReportPanel searchParams={searchParams} state={state} />

      <Card>
        <CardHeader>
          <CardTitle>Advanced multi-language export</CardTitle>
          <CardDescription>
            Secondary technical export for the legacy multi-language CSV format.
            Keep this path for internal diagnostics, not the primary translator
            workflow.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <details className="rounded-md border p-4">
            <summary className="cursor-pointer text-sm font-medium">
              Open advanced export options
            </summary>
            <div className="mt-4 space-y-3">
              <div className="rounded-md border p-4">
                <p className="font-medium">CSV safety</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Empty cells leave existing translations untouched. Imports
                  never overwrite English source text.
                </p>
              </div>
              <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr_0.8fr]">
                <form
                  action={scanTranslationInventoryAction}
                  className="rounded-md border p-4"
                >
                  <p className="font-medium">Scan current inventory</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Registers current fixed labels, homepage sections, taxonomy,
                    statuses, and system labels in TranslationEntry.
                  </p>
                  <Button type="submit" className="mt-4 gap-2">
                    <RefreshCw className="h-4 w-4" />
                    Scan inventory
                  </Button>
                </form>

                <div className="rounded-md border p-4">
                  <p className="font-medium">Legacy CSV export</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    UTF-8 CSV with all language columns for technical review.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button asChild variant="outline" className="gap-2">
                      <Link href="/admin/globalization/export-csv">
                        <Download className="h-4 w-4" />
                        Export multi-language CSV
                      </Link>
                    </Button>
                    <Button asChild variant="outline">
                      <Link href="/admin/globalization/sample-csv">
                        Download multi-language sample
                      </Link>
                    </Button>
                  </div>
                </div>

                <div className="rounded-md border p-4">
                  <p className="font-medium">Technical notes</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The old multi-language export remains available for
                    back-office use, but the single-language flow is the
                    primary path.
                  </p>
                </div>
              </div>
            </div>
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Inventory filters</CardTitle>
          <CardDescription>
            Preview rows are read from the scanner, then joined to cached
            TranslationEntry status.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-6" method="GET">
            <input type="hidden" name="tab" value="inventory" />
            <input type="hidden" name="targetLanguage" value={targetLanguage} />
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="inventorySearch">Search key or base text</Label>
              <Input
                id="inventorySearch"
                name="q"
                defaultValue={state.filters.q}
                placeholder="Approved public listings, Browse filter, Casablanca"
              />
            </div>
            <InventoryFilterSelect
              id="inventoryCategory"
              name="category"
              label="Category"
              value={state.filters.category}
              options={state.options.categories}
            />
            <InventoryFilterSelect
              id="inventoryNamespace"
              name="namespace"
              label="Namespace"
              value={state.filters.namespace}
              options={state.options.namespaces}
            />
            <InventoryFilterSelect
              id="inventorySourceType"
              name="sourceType"
              label="Source type"
              value={state.filters.sourceType}
              options={state.options.sourceTypes}
            />
            <InventoryMissingLanguageSelect value={state.filters.missingLanguage} />
            <div className="flex items-end">
              <Button type="submit" variant="outline" className="w-full gap-2">
                <Search className="h-4 w-4" />
                Filter
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Inventory preview</CardTitle>
          <CardDescription>
            Showing up to 200 rows. Public rendering uses DB translation, then
            built-in fallback, then English.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-3 pr-4 font-medium">Key</th>
                <th className="py-3 pr-4 font-medium">Base English</th>
                <th className="py-3 pr-4 font-medium">Category/source</th>
                <th className="py-3 pr-4 font-medium">Completion</th>
                <th className="py-3 pr-4 font-medium">Language status</th>
              </tr>
            </thead>
            <tbody>
              {state.rows.length > 0 ? (
                state.rows.map((row) => (
                  <tr
                    key={`${row.namespace}:${row.key}`}
                    className="border-b align-top last:border-0"
                  >
                    <td className="max-w-[260px] py-3 pr-4">
                      <span className="break-words font-medium">{row.key}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {row.namespace}
                      </span>
                    </td>
                    <td className="max-w-sm whitespace-pre-line py-3 pr-4 text-muted-foreground">
                      {row.baseText}
                      {row.context ? (
                        <span className="mt-2 block text-xs">{row.context}</span>
                      ) : null}
                    </td>
                    <td className="py-3 pr-4">
                      <span className="rounded-md border bg-muted px-2 py-1 text-xs">
                        {row.category}
                      </span>
                      <span className="mt-2 block text-xs text-muted-foreground">
                        {row.sourceType}
                      </span>
                      {row.sourceId ? (
                        <span className="mt-1 block max-w-[220px] break-words text-xs text-muted-foreground">
                          {row.sourceId}
                          {row.sourceField ? ` · ${row.sourceField}` : ""}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-3 pr-4">
                      <span className="text-lg font-semibold">
                        {row.completionPercent}%
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        Missing {row.missingLanguages.length} · stale{" "}
                        {row.staleLanguages.length}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-wrap gap-2">
                        {TRANSLATION_INVENTORY_TARGET_LANGUAGES.map((language) => {
                          const status =
                            row.translations[language]?.status ?? "missing";
                          return (
                            <span
                              key={language}
                              className={`rounded-md border px-2 py-1 text-xs ${statusClass(status)}`}
                            >
                              {language}: {status}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="py-4 text-muted-foreground" colSpan={5}>
                    No inventory rows match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function DiagnosticsSection({
  diagnostics,
  currencySettings,
  localizationSettings,
}: {
  diagnostics: Awaited<ReturnType<typeof getDiagnostics>>;
  currencySettings: Awaited<ReturnType<typeof getCurrencyAdminState>>["settings"];
  localizationSettings: Awaited<ReturnType<typeof getLocalizationAdminState>>["settings"];
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Runtime diagnostics</CardTitle>
          <CardDescription>
            Server-side values read during this admin request.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            <span className="text-muted-foreground">Currency cookie:</span>{" "}
            {diagnostics.selectedCurrencyCookie}
          </p>
          <p>
            <span className="text-muted-foreground">Language cookie:</span>{" "}
            {diagnostics.selectedLanguageCookie}
          </p>
          <p>
            <span className="text-muted-foreground">Active currency rates:</span>{" "}
            {diagnostics.activeCurrencyRates}
          </p>
          <p>
            <span className="text-muted-foreground">Latest rate source date:</span>{" "}
            {safeFormatDate(diagnostics.latestCurrencyRateSourceDate)}
          </p>
          <p>
            <span className="text-muted-foreground">Latest rate fetched at:</span>{" "}
            {safeFormatDateTime(
              diagnostics.latestCurrencyRateFetchedAt,
              "Date unavailable"
            )}
          </p>
          <p>
            <span className="text-muted-foreground">Translation entries:</span>{" "}
            {diagnostics.translationEntries}
          </p>
          <p>
            <span className="text-muted-foreground">LIBRETRANSLATE_URL:</span>{" "}
            {diagnostics.libreTranslateConfigured ? "configured" : "not configured"}
          </p>
          <p>
            <span className="text-muted-foreground">Last currency sync:</span>{" "}
            {currencySettings.lastSyncStatus ?? "Not synced"}
          </p>
          <p>
            <span className="text-muted-foreground">Last translation sync:</span>{" "}
            {localizationSettings.lastSyncStatus ?? "Not synced"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Translations by language/status</CardTitle>
          <CardDescription>
            Counts from TranslationEntry, grouped by selected sync status.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-3 pr-4 font-medium">Language</th>
                <th className="py-3 pr-4 font-medium">Status</th>
                <th className="py-3 pr-4 font-medium">Count</th>
              </tr>
            </thead>
            <tbody>
              {diagnostics.translationCounts.length > 0 ? (
                diagnostics.translationCounts.map((count) => (
                  <tr
                    key={`${count.language}:${count.status}`}
                    className="border-b last:border-0"
                  >
                    <td className="py-3 pr-4">{count.language}</td>
                    <td className="py-3 pr-4">{count.status}</td>
                    <td className="py-3 pr-4">{count._count._all}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="py-3 pr-4 text-muted-foreground" colSpan={3}>
                    No TranslationEntry rows yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

export default async function GlobalizationPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  await requireAdmin();
  noStore();

  const activeTab = readParam(searchParams, "tab") ?? "currency";
  const notice = readParam(searchParams, "notice");
  const error = readParam(searchParams, "error");
  const languageParam = readParam(searchParams, "language");
  const namespaceParam = readParam(searchParams, "namespace");
  const entityTypeParam = readParam(searchParams, "entityType");
  const statusParam = readParam(searchParams, "status");
  const categoryParam = readParam(searchParams, "category");
  const sourceTypeParam = readParam(searchParams, "sourceType");
  const inventoryQueryParam = readParam(searchParams, "q");
  const missingLanguageParam = readParam(searchParams, "missingLanguage");
  const targetLanguage = normalizeTranslationInventoryLanguage(
    readParam(searchParams, "targetLanguage")
  );
  const [
    currencyState,
    localizationState,
    inventoryState,
    auditFindings,
    diagnostics,
  ] =
    await Promise.all([
      getCurrencyAdminState(),
      getLocalizationAdminState({
        language: languageParam,
        namespace: namespaceParam,
        entityType: entityTypeParam,
        status: statusParam,
      }),
      getTranslationInventoryAdminState({
        category: categoryParam,
        namespace: namespaceParam,
        sourceType: sourceTypeParam,
        q: inventoryQueryParam,
        missingLanguage: missingLanguageParam,
      }),
      runBrandAudit(),
      getDiagnostics(),
    ]);
  const { settings: currencySettings, rows: rateRows } = currencyState;
  const { settings: localizationSettings } = localizationState;
  const latestRateCount = rateRows.filter(
    (row) => row.baseCurrency === currencySettings.baseCurrency
  ).length;
  const testAmountRaw = Number(readParam(searchParams, "amount") ?? "100");
  const testAmount =
    Number.isFinite(testAmountRaw) && testAmountRaw >= 0 ? testAmountRaw : 100;
  const testFrom = normalizeCurrency(
    readParam(searchParams, "from"),
    currencySettings.baseCurrency
  );
  const testTo = normalizeCurrency(
    readParam(searchParams, "to"),
    currencySettings.defaultCurrency
  );

  return (
    <section className="mb-16 mt-10 w-full max-w-none px-5 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-4xl">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Kantara Command Center
          </Link>
          <p className="mt-5 text-sm font-semibold text-emerald-700">
            Marketplace Operations
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight lg:text-4xl">
            Currency & Localization Control
          </h1>
          <p className="mt-3 text-muted-foreground">
            Global display currency, cached translations, exchange sync, and
            brand audit controls for {BRAND_NAME}.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/admin/homepage-builder">Homepage Builder</Link>
        </Button>
      </div>

      {notice ? (
        <div className="mb-5 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-900">
          {error}
        </div>
      ) : null}

      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <Button
            key={tab.key}
            asChild
            variant={activeTab === tab.key ? "default" : "outline"}
            size="sm"
          >
            <Link href={`/admin/globalization?tab=${tab.key}`}>{tab.label}</Link>
          </Button>
        ))}
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
        <OverviewCard
          label="Base currency"
          value={currencySettings.baseCurrency}
          detail="Stored listing values remain stable."
        />
        <OverviewCard
          label="Default public currency"
          value={currencySettings.defaultCurrency}
          detail={getCurrencyMeta(currencySettings.defaultCurrency).label}
        />
        <OverviewCard
          label="Enabled currencies"
          value={String(currencySettings.enabledCurrencies.length)}
          detail={`${latestRateCount} live rate rows`}
        />
        <OverviewCard
          label="Last currency sync"
          value={safeFormatDateTime(currencySettings.lastSyncAt)}
          detail={currencySettings.lastSyncStatus ?? "Not synced"}
        />
        <OverviewCard
          label="Translation source"
          value={localizationSettings.translationSource}
          detail={
            localizationSettings.translationEndpoint
              ? "Endpoint configured"
              : "Translation service not configured"
          }
        />
      </div>

      <div className="mt-8 space-y-6">
        {activeTab === "brand" ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Branding audit</CardTitle>
                <CardDescription>{BRAND_POSITIONING}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-md border bg-muted/20 p-4">
                    <p className="text-sm text-muted-foreground">Active brand</p>
                    <p className="mt-1 text-xl font-semibold">{BRAND_NAME}</p>
                  </div>
                  <div className="rounded-md border bg-muted/20 p-4">
                    <p className="text-sm text-muted-foreground">Scan roots</p>
                    <p className="mt-1 text-xl font-semibold">
                      {scannedRoots.length}
                    </p>
                  </div>
                  <div className="rounded-md border bg-muted/20 p-4">
                    <p className="text-sm text-muted-foreground">Findings</p>
                    <p className="mt-1 text-xl font-semibold">
                      {auditFindings.length}
                    </p>
                  </div>
                </div>
                {auditFindings.length === 0 ? (
                  <div className="flex items-start gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                    <BadgeCheck className="mt-0.5 h-4 w-4 flex-none" />
                    No old visible brand strings were found in scanned app files.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="py-3 pr-4 font-medium">File</th>
                          <th className="py-3 pr-4 font-medium">Line</th>
                          <th className="py-3 pr-4 font-medium">Pattern</th>
                          <th className="py-3 pr-4 font-medium">Text</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditFindings.slice(0, 80).map((finding) => (
                          <tr
                            key={`${finding.file}:${finding.line}:${finding.pattern}`}
                            className="border-b last:border-0"
                          >
                            <td className="py-3 pr-4">{finding.file}</td>
                            <td className="py-3 pr-4">{finding.line}</td>
                            <td className="py-3 pr-4">{finding.pattern}</td>
                            <td className="py-3 pr-4 text-muted-foreground">
                              {finding.text}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        ) : null}

        {activeTab === "currency" ? (
          <>
            {currencySettings.lastSyncStatus === "failed" ? (
              <div className="flex items-start gap-3 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-none" />
                {currencySettings.lastSyncError ??
                  "Latest exchange sync failed. Previous active rates remain in use."}
              </div>
            ) : null}
            <CurrencyControls settings={currencySettings} />
            <RatesTable settings={currencySettings} rows={rateRows} />
            <ConversionTestCard
              amount={testAmount}
              fromCurrency={testFrom}
              toCurrency={testTo}
              baseCurrency={currencySettings.baseCurrency}
              rates={currencyState.rates}
              roundingMode={currencySettings.roundingMode}
            />
          </>
        ) : null}

        {activeTab === "languages" ? (
          <LanguageControls settings={localizationSettings} />
        ) : null}

        {activeTab === "translations" ? (
          <TranslationTable state={localizationState} />
        ) : null}

        {activeTab === "inventory" ? (
          <TranslationInventorySection
            state={inventoryState}
            searchParams={searchParams}
            targetLanguage={targetLanguage}
          />
        ) : null}

        {activeTab === "logs" ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe2 className="h-5 w-5" />
                  Exchange sync status
                </CardTitle>
                <CardDescription>
                  Manual sync records status and preserves previous rates on
                  source failure.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>
                  <span className="text-muted-foreground">Source:</span>{" "}
                  {currencySettings.syncSource}
                </p>
                <p>
                  <span className="text-muted-foreground">Last sync:</span>{" "}
                  {safeFormatDateTime(currencySettings.lastSyncAt)}
                </p>
                <p>
                  <span className="text-muted-foreground">Status:</span>{" "}
                  <span
                    className={`rounded-md border px-2 py-1 text-xs ${statusClass(
                      currencySettings.lastSyncStatus
                    )}`}
                  >
                    {currencySettings.lastSyncStatus ?? "Not synced"}
                  </span>
                </p>
                {currencySettings.lastSyncError ? (
                  <p className="rounded-md border border-red-200 bg-red-50 p-3 text-red-900">
                    {currencySettings.lastSyncError}
                  </p>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="h-5 w-5" />
                  Translation sync status
                </CardTitle>
                <CardDescription>
                  Missing UI translations are synced into TranslationEntry rows.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>
                  <span className="text-muted-foreground">Source:</span>{" "}
                  {localizationSettings.translationSource}
                </p>
                <p>
                  <span className="text-muted-foreground">Endpoint:</span>{" "}
                  {localizationSettings.translationEndpoint ??
                    "Translation service not configured."}
                </p>
                <p>
                  <span className="text-muted-foreground">Last sync:</span>{" "}
                  {safeFormatDateTime(localizationSettings.lastSyncAt)}
                </p>
                <p>
                  <span className="text-muted-foreground">Status:</span>{" "}
                  <span
                    className={`rounded-md border px-2 py-1 text-xs ${statusClass(
                      localizationSettings.lastSyncStatus
                    )}`}
                  >
                    {localizationSettings.lastSyncStatus ?? "Not synced"}
                  </span>
                </p>
                {localizationSettings.lastSyncError ? (
                  <p className="rounded-md border border-red-200 bg-red-50 p-3 text-red-900">
                    {localizationSettings.lastSyncError}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </div>
        ) : null}

        {activeTab === "diagnostics" ? (
          <DiagnosticsSection
            diagnostics={diagnostics}
            currencySettings={currencySettings}
            localizationSettings={localizationSettings}
          />
        ) : null}
      </div>
    </section>
  );
}
