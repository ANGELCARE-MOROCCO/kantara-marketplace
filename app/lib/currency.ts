import "server-only";

import { unstable_cache } from "next/cache";
import { cookies } from "next/headers";

import prisma from "./db";
import {
  CURRENCY_COOKIE_NAME,
  FRANKFURTER_LATEST_URL,
  SUPPORTED_CURRENCIES,
  formatDisplayMoney,
  formatMoney,
  normalizeCurrency,
  normalizeRoundingMode,
  parseCurrencyList,
  resolveCurrencySelection,
  serializeCurrencyList,
  type CurrencyCode,
  type CurrencyDisplayState,
  type CurrencyRateMap,
  type RoundingMode,
} from "./globalization";

export const CURRENCY_SETTINGS_CACHE_TAG = "currency-settings";
export const CURRENCY_RATES_CACHE_TAG = "currency-rates";

export type CurrencySettingsView = {
  id: string | null;
  baseCurrency: CurrencyCode;
  defaultCurrency: CurrencyCode;
  enabledCurrencies: CurrencyCode[];
  autoSyncEnabled: boolean;
  syncSource: string;
  lastSyncAt: Date | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  roundingMode: RoundingMode;
  showOriginalCurrency: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type LatestCurrencyRate = {
  id: string;
  baseCurrency: CurrencyCode;
  quoteCurrency: CurrencyCode;
  rate: number;
  source: string | null;
  sourceDate: Date | null;
  fetchedAt: Date | null;
  isActive: boolean;
};

export type CurrencySyncResult = {
  ok: boolean;
  status: "success" | "failed";
  message: string;
  savedRates: number;
  sourceDate?: string | null;
};

const DEFAULT_CURRENCY_SETTINGS: CurrencySettingsView = {
  id: null,
  baseCurrency: "USD",
  defaultCurrency: "USD",
  enabledCurrencies: SUPPORTED_CURRENCIES.map((currency) => currency.code),
  autoSyncEnabled: false,
  syncSource: "frankfurter",
  lastSyncAt: null,
  lastSyncStatus: null,
  lastSyncError: null,
  roundingMode: "standard",
  showOriginalCurrency: false,
  createdAt: null,
  updatedAt: null,
};

type CurrencySettingsRecord = {
  id: string;
  baseCurrency: string;
  defaultCurrency: string;
  enabledCurrencies: string;
  autoSyncEnabled: boolean;
  syncSource: string;
  lastSyncAt: Date | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  roundingMode: string;
  showOriginalCurrency: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type CurrencyRateRecord = {
  id: string;
  baseCurrency: string;
  quoteCurrency: string;
  rate: number;
  source: string | null;
  sourceDate: Date | null;
  fetchedAt: Date | null;
  isActive: boolean;
};

type DateLike = Date | string | number | null | undefined;

function toValidDate(value: DateLike): Date | null {
  if (!value) return null;

  const date =
    value instanceof Date
      ? value
      : typeof value === "number"
        ? new Date(value)
        : new Date(String(value));

  return Number.isNaN(date.getTime()) ? null : date;
}

function parseFrankfurterSourceDate(value?: string | null) {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const dateValue = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? `${trimmed}T00:00:00.000Z`
    : trimmed;

  return toValidDate(dateValue);
}

function normalizeCurrencySettings(
  record?: CurrencySettingsRecord | null
): CurrencySettingsView {
  if (!record) return { ...DEFAULT_CURRENCY_SETTINGS };

  const baseCurrency = normalizeCurrency(record.baseCurrency, "USD");
  const enabledCurrencies = parseCurrencyList(record.enabledCurrencies);
  const defaultCurrency = normalizeCurrency(
    record.defaultCurrency,
    enabledCurrencies.includes(baseCurrency) ? baseCurrency : "USD"
  );

  return {
    id: record.id,
    baseCurrency,
    defaultCurrency: enabledCurrencies.includes(defaultCurrency)
      ? defaultCurrency
      : enabledCurrencies[0] ?? baseCurrency,
    enabledCurrencies,
    autoSyncEnabled: record.autoSyncEnabled,
    syncSource: record.syncSource || "frankfurter",
    lastSyncAt: record.lastSyncAt,
    lastSyncStatus: record.lastSyncStatus,
    lastSyncError: record.lastSyncError,
    roundingMode: normalizeRoundingMode(record.roundingMode),
    showOriginalCurrency: record.showOriginalCurrency,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function normalizeRateRecord(record: CurrencyRateRecord): LatestCurrencyRate | null {
  const baseCurrency = normalizeCurrency(record.baseCurrency, "USD");
  const quoteCurrency = normalizeCurrency(record.quoteCurrency, "USD");

  if (!Number.isFinite(record.rate) || record.rate <= 0) return null;

  return {
    id: record.id,
    baseCurrency,
    quoteCurrency,
    rate: record.rate,
    source: record.source,
    sourceDate: toValidDate(record.sourceDate),
    fetchedAt: toValidDate(record.fetchedAt),
    isActive: record.isActive,
  };
}

const getCachedCurrencySettings = unstable_cache(
  async () => {
    const record = await prisma.currencySettings.findFirst({
      orderBy: { updatedAt: "desc" },
    });

    return normalizeCurrencySettings(record);
  },
  ["currency-settings-v1"],
  { tags: [CURRENCY_SETTINGS_CACHE_TAG], revalidate: 300 }
);

const getCachedLatestRateRows = unstable_cache(
  async () => {
    const rows = await prisma.currencyRate.findMany({
      where: { isActive: true },
      orderBy: [{ fetchedAt: "desc" }, { createdAt: "desc" }],
      take: 300,
    });
    const seen = new Set<string>();
    const latest: LatestCurrencyRate[] = [];

    for (const row of rows) {
      const normalized = normalizeRateRecord(row);
      if (!normalized) continue;

      const key = `${normalized.baseCurrency}:${normalized.quoteCurrency}`;
      if (seen.has(key)) continue;

      seen.add(key);
      latest.push(normalized);
    }

    return latest;
  },
  ["currency-latest-rates-v1"],
  { tags: [CURRENCY_RATES_CACHE_TAG], revalidate: 300 }
);

export async function getCurrencySettings() {
  return getCachedCurrencySettings();
}

export async function getLatestRates(baseCurrency?: CurrencyCode) {
  const rows = await getCachedLatestRateRows();
  const settings = baseCurrency ? null : await getCurrencySettings();
  const base = baseCurrency ?? settings?.baseCurrency ?? "USD";
  const rates: CurrencyRateMap = { [base]: 1 };

  rows
    .filter((row) => row.baseCurrency === base)
    .forEach((row) => {
      rates[row.quoteCurrency] = row.rate;
    });

  return { rows, rates };
}

export async function getCurrencyDisplayState(): Promise<CurrencyDisplayState> {
  const settings = await getCurrencySettings();
  const { rates } = await getLatestRates(settings.baseCurrency);
  const requestedCurrency = cookies().get(CURRENCY_COOKIE_NAME)?.value;
  const selection = resolveCurrencySelection({
    requestedCurrency,
    defaultCurrency: settings.defaultCurrency,
    enabledCurrencies: settings.enabledCurrencies,
    baseCurrency: settings.baseCurrency,
    rates,
  });

  return {
    baseCurrency: settings.baseCurrency,
    defaultCurrency: settings.defaultCurrency,
    enabledCurrencies: settings.enabledCurrencies,
    selectedCurrency: selection.selectedCurrency,
    rates: {
      ...rates,
      [settings.baseCurrency]: 1,
    },
    roundingMode: settings.roundingMode,
    showOriginalCurrency: settings.showOriginalCurrency,
    hasRateForSelection: selection.hasRateForSelection,
    selectionFallbackReason: selection.selectionFallbackReason,
  };
}

export async function getCurrencyAdminState() {
  const settings = await getCurrencySettings();
  const { rows, rates } = await getLatestRates(settings.baseCurrency);

  return { settings, rows, rates };
}

export async function saveCurrencySettings({
  defaultCurrency,
  enabledCurrencies,
  autoSyncEnabled,
  roundingMode,
  showOriginalCurrency,
  updatedById,
}: {
  defaultCurrency: CurrencyCode;
  enabledCurrencies: CurrencyCode[];
  autoSyncEnabled: boolean;
  roundingMode: RoundingMode;
  showOriginalCurrency: boolean;
  updatedById: string;
}) {
  const existing = await prisma.currencySettings.findFirst({
    orderBy: { updatedAt: "desc" },
    select: { id: true, baseCurrency: true },
  });
  const safeEnabled = enabledCurrencies.length > 0 ? enabledCurrencies : ["USD"];
  const safeDefault = safeEnabled.includes(defaultCurrency)
    ? defaultCurrency
    : safeEnabled[0] ?? "USD";
  const data = {
    baseCurrency: normalizeCurrency(existing?.baseCurrency, "USD"),
    defaultCurrency: safeDefault,
    enabledCurrencies: serializeCurrencyList(safeEnabled),
    autoSyncEnabled,
    syncSource: "frankfurter",
    roundingMode,
    showOriginalCurrency,
    updatedById,
  };

  if (existing) {
    return prisma.currencySettings.update({
      where: { id: existing.id },
      data,
    });
  }

  return prisma.currencySettings.create({ data });
}

async function updateCurrencySyncStatus({
  status,
  error,
  updatedById,
}: {
  status: "success" | "failed";
  error?: string | null;
  updatedById: string;
}) {
  const existing = await prisma.currencySettings.findFirst({
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  const data = {
    enabledCurrencies: serializeCurrencyList(
      DEFAULT_CURRENCY_SETTINGS.enabledCurrencies
    ),
    lastSyncAt: new Date(),
    lastSyncStatus: status,
    lastSyncError: error ?? null,
    syncSource: "frankfurter",
    updatedById,
  };

  if (existing) {
    await prisma.currencySettings.update({
      where: { id: existing.id },
      data: {
        lastSyncAt: data.lastSyncAt,
        lastSyncStatus: data.lastSyncStatus,
        lastSyncError: data.lastSyncError,
        syncSource: data.syncSource,
        updatedById,
      },
    });
    return;
  }

  await prisma.currencySettings.create({
    data: {
      ...data,
      baseCurrency: "USD",
      defaultCurrency: "USD",
      autoSyncEnabled: false,
      roundingMode: "standard",
      showOriginalCurrency: false,
    },
  });
}

type FrankfurterResponse = {
  date?: string | null;
  base?: string | null;
  quote?: string | null;
  rate?: number | null;
}[];

export async function syncCurrencyRates({
  updatedById,
}: {
  updatedById: string;
}): Promise<CurrencySyncResult> {
  const settings = await getCurrencySettings();
  const quoteCurrencies = settings.enabledCurrencies.filter(
    (currency) => currency !== settings.baseCurrency
  );

  if (quoteCurrencies.length === 0) {
    await updateCurrencySyncStatus({
      status: "success",
      updatedById,
      error: null,
    });

    return {
      ok: true,
      status: "success",
      message: "Only the base currency is enabled; no external rates were needed.",
      savedRates: 0,
      sourceDate: null,
    };
  }

  const url = new URL(FRANKFURTER_LATEST_URL);
  url.searchParams.set("base", settings.baseCurrency);
  url.searchParams.set("quotes", quoteCurrencies.join(","));

  try {
    const response = await fetch(url.toString(), {
      cache: "no-store",
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      throw new Error(`Frankfurter responded with HTTP ${response.status}.`);
    }

    const payload = (await response.json()) as FrankfurterResponse;
    if (!Array.isArray(payload)) {
      throw new Error("Frankfurter response did not include exchange rates.");
    }

    const fetchedAt = new Date();
    const requestedQuotes = new Set(quoteCurrencies);
    const rows = payload.flatMap((item) => {
      const quoteCurrency = normalizeCurrency(item.quote, "USD");
      const rate = item.rate;
      const sourceDate = parseFrankfurterSourceDate(item.date);

      if (!requestedQuotes.has(quoteCurrency)) return [];
      if (normalizeCurrency(item.base, settings.baseCurrency) !== settings.baseCurrency) {
        return [];
      }
      if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
        return [];
      }

      return [
        {
          baseCurrency: settings.baseCurrency,
          quoteCurrency,
          rate,
          source: "frankfurter",
          sourceDate,
          fetchedAt,
          isActive: true,
        },
      ];
    });

    if (rows.length === 0) {
      throw new Error("No usable exchange rates were returned.");
    }

    const missingQuotes = quoteCurrencies.filter(
      (currency) => !rows.some((row) => row.quoteCurrency === currency)
    );
    if (missingQuotes.length > 0) {
      throw new Error(
        `Frankfurter did not return rates for: ${missingQuotes.join(", ")}.`
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.currencyRate.updateMany({
        where: {
          baseCurrency: settings.baseCurrency,
          quoteCurrency: { in: rows.map((row) => row.quoteCurrency) },
          isActive: true,
        },
        data: { isActive: false },
      });

      await tx.currencyRate.createMany({ data: rows });
    });

    await updateCurrencySyncStatus({
      status: "success",
      updatedById,
      error: null,
    });

    return {
      ok: true,
      status: "success",
      message: `Saved ${rows.length} live exchange rates from Frankfurter.`,
      savedRates: rows.length,
      sourceDate: rows[0]?.sourceDate?.toISOString().slice(0, 10) ?? null,
    };
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim()
        ? error.message
        : "Exchange rate sync failed.";

    await updateCurrencySyncStatus({
      status: "failed",
      updatedById,
      error: message,
    });

    return {
      ok: false,
      status: "failed",
      message,
      savedRates: 0,
      sourceDate: null,
    };
  }
}

export function formatPlatformMoney(
  amount: number | null | undefined,
  state: CurrencyDisplayState,
  emptyLabel = "Price on request"
) {
  return formatDisplayMoney({
    amount,
    fromCurrency: state.baseCurrency,
    state,
    emptyLabel,
  });
}

export function formatSnapshotMoney({
  amount,
  snapshotCurrency,
  state,
  emptyLabel = "Not set",
}: {
  amount?: number | null;
  snapshotCurrency?: string | null;
  state: CurrencyDisplayState;
  emptyLabel?: string;
}) {
  return formatDisplayMoney({
    amount,
    fromCurrency: normalizeCurrency(snapshotCurrency, state.baseCurrency),
    state,
    emptyLabel,
  });
}

export function formatBaseMoney(amount?: number | null, currency: CurrencyCode = "USD") {
  if (amount === null || amount === undefined) return "Not set";
  return formatMoney(amount, currency);
}
