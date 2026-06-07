export const BRAND_NAME = "Kantara";
export const BRAND_POSITIONING = "Morocco stays, managed with confidence.";
export const BRAND_TRUST_LINE = "The trusted bridge to Morocco.";
export const BRAND_RULES_LINE = "Verified homes. Clear rules. Local intelligence.";
export const BRAND_PRECISION_LINE = "International confidence, Moroccan precision.";

export const CURRENCY_COOKIE_NAME = "kantara_currency";
export const LANGUAGE_COOKIE_NAME = "kantara_language";

export const FRANKFURTER_LATEST_URL = "https://api.frankfurter.dev/v2/rates";
export const LIBRETRANSLATE_SOURCE = "libretranslate";

export const SUPPORTED_CURRENCIES = [
  { code: "USD", symbol: "$", label: "US Dollar" },
  { code: "EUR", symbol: "€", label: "Euro" },
  { code: "GBP", symbol: "£", label: "British Pound" },
  { code: "CHF", symbol: "Fr", label: "Swiss Franc" },
  { code: "JPY", symbol: "¥", label: "Japanese Yen" },
  { code: "AUD", symbol: "A$", label: "Australian Dollar" },
  { code: "CAD", symbol: "C$", label: "Canadian Dollar" },
  { code: "CNY", symbol: "CN¥", label: "Chinese Yuan" },
] as const;

export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English", nativeLabel: "English", flag: "🇬🇧", dir: "ltr" },
  { code: "fr", label: "French", nativeLabel: "Français", flag: "🇫🇷", dir: "ltr" },
  { code: "zh-CN", label: "Chinese Simplified", nativeLabel: "中文", flag: "🇨🇳", dir: "ltr" },
  { code: "ja", label: "Japanese", nativeLabel: "日本語", flag: "🇯🇵", dir: "ltr" },
  { code: "es", label: "Spanish", nativeLabel: "Español", flag: "🇪🇸", dir: "ltr" },
  { code: "hi", label: "Hindi", nativeLabel: "हिन्दी", flag: "🇮🇳", dir: "ltr" },
  { code: "ar", label: "Arabic", nativeLabel: "العربية", flag: "🇲🇦", dir: "rtl" },
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number]["code"];
export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];
export type CurrencyRateMap = Partial<Record<CurrencyCode, number>>;
export type RoundingMode = "standard" | "whole" | "cents";

export type CurrencyDisplayState = {
  baseCurrency: CurrencyCode;
  defaultCurrency: CurrencyCode;
  selectedCurrency: CurrencyCode;
  enabledCurrencies: CurrencyCode[];
  rates: CurrencyRateMap;
  roundingMode: RoundingMode;
  showOriginalCurrency: boolean;
  hasRateForSelection: boolean;
  selectionFallbackReason?: string | null;
};

export type LocalizationDisplayState = {
  baseLanguage: LanguageCode;
  defaultLanguage: LanguageCode;
  selectedLanguage: LanguageCode;
  enabledLanguages: LanguageCode[];
  dir: "ltr" | "rtl";
  selectionFallbackReason?: string | null;
};

const CURRENCY_CODE_SET = new Set<string>(
  SUPPORTED_CURRENCIES.map((currency) => currency.code)
);
const LANGUAGE_CODE_SET = new Set<string>(
  SUPPORTED_LANGUAGES.map((language) => language.code)
);
const RATES_REQUIRED_CURRENCIES = new Set<CurrencyCode>(
  SUPPORTED_CURRENCIES.map((currency) => currency.code)
);

export function isCurrencyCode(value?: string | null): value is CurrencyCode {
  return CURRENCY_CODE_SET.has(value ?? "");
}

export function isLanguageCode(value?: string | null): value is LanguageCode {
  return LANGUAGE_CODE_SET.has(value ?? "");
}

export function getCurrencyMeta(currency: string) {
  return (
    SUPPORTED_CURRENCIES.find((item) => item.code === currency) ??
    SUPPORTED_CURRENCIES[0]
  );
}

export function getLanguageMeta(language: string) {
  return (
    SUPPORTED_LANGUAGES.find((item) => item.code === language) ??
    SUPPORTED_LANGUAGES[0]
  );
}

export function parseCurrencyList(value?: string | null): CurrencyCode[] {
  const parsed = (value ?? "")
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(isCurrencyCode);

  return parsed.length > 0 ? Array.from(new Set(parsed)) : ["USD"];
}

export function parseLanguageList(value?: string | null): LanguageCode[] {
  const parsed = (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(isLanguageCode);

  return parsed.length > 0 ? Array.from(new Set(parsed)) : ["en"];
}

export function serializeCurrencyList(values: string[]) {
  const valid = values.filter(isCurrencyCode);
  return Array.from(new Set(valid.length > 0 ? valid : ["USD"])).join(",");
}

export function serializeLanguageList(values: string[]) {
  const valid = values.filter(isLanguageCode);
  return Array.from(new Set(valid.length > 0 ? valid : ["en"])).join(",");
}

export function normalizeCurrency(value?: string | null, fallback: CurrencyCode = "USD") {
  return isCurrencyCode(value) ? value : fallback;
}

export function normalizeLanguage(value?: string | null, fallback: LanguageCode = "en") {
  return isLanguageCode(value) ? value : fallback;
}

export function normalizeRoundingMode(value?: string | null): RoundingMode {
  return value === "whole" || value === "cents" || value === "standard"
    ? value
    : "standard";
}

export function resolveCurrencySelection({
  requestedCurrency,
  defaultCurrency,
  enabledCurrencies,
  baseCurrency,
  rates,
}: {
  requestedCurrency?: string | null;
  defaultCurrency: CurrencyCode;
  enabledCurrencies: CurrencyCode[];
  baseCurrency: CurrencyCode;
  rates: CurrencyRateMap;
}) {
  const enabledSet = new Set(enabledCurrencies);
  const requested = normalizeCurrency(requestedCurrency, defaultCurrency);
  let selected = requested;
  let selectionFallbackReason: string | null = null;

  if (!enabledSet.has(selected)) {
    selected = enabledSet.has(defaultCurrency) ? defaultCurrency : enabledCurrencies[0] ?? baseCurrency;
    selectionFallbackReason = `${requested} is disabled.`;
  }

  const hasRateForSelection =
    selected === baseCurrency ||
    (RATES_REQUIRED_CURRENCIES.has(selected) && typeof rates[selected] === "number");

  if (!hasRateForSelection) {
    selected = baseCurrency;
    selectionFallbackReason = "Latest exchange rate is unavailable.";
  }

  return {
    selectedCurrency: selected,
    selectionFallbackReason,
    hasRateForSelection,
  };
}

export function resolveLanguageSelection({
  requestedLanguage,
  defaultLanguage,
  enabledLanguages,
}: {
  requestedLanguage?: string | null;
  defaultLanguage: LanguageCode;
  enabledLanguages: LanguageCode[];
}) {
  const enabledSet = new Set(enabledLanguages);
  const requested = normalizeLanguage(requestedLanguage, defaultLanguage);
  let selected = requested;
  let selectionFallbackReason: string | null = null;

  if (!enabledSet.has(selected)) {
    selected = enabledSet.has(defaultLanguage) ? defaultLanguage : enabledLanguages[0] ?? "en";
    selectionFallbackReason = `${requested} is disabled.`;
  }

  return {
    selectedLanguage: selected,
    dir: getLanguageMeta(selected).dir,
    selectionFallbackReason,
  };
}

export function convertAmount(
  amount: number,
  fromCurrency: CurrencyCode,
  toCurrency: CurrencyCode,
  rates: CurrencyRateMap
) {
  if (fromCurrency === toCurrency) return amount;

  const fromRate = rates[fromCurrency];
  const toRate = rates[toCurrency];
  if (typeof fromRate !== "number" || typeof toRate !== "number") return null;
  if (fromRate <= 0 || toRate <= 0) return null;

  return (amount / fromRate) * toRate;
}

export function formatMoney(
  amount: number,
  currency: CurrencyCode,
  roundingMode: RoundingMode = "standard",
  locale = "en-US"
) {
  const meta = getCurrencyMeta(currency);
  const decimals =
    roundingMode === "whole" || currency === "JPY"
      ? 0
      : roundingMode === "cents"
        ? 2
        : Math.abs(amount) >= 1000
          ? 0
          : 2;
  const rounded =
    roundingMode === "whole" || currency === "JPY"
      ? Math.round(amount)
      : roundingMode === "cents"
        ? Math.round(amount * 100) / 100
        : amount;
  const formattedNumber = new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(rounded);
  const separator = meta.symbol === "Fr" ? " " : "";

  return `${meta.symbol}${separator}${formattedNumber}`;
}

export function formatDisplayMoney({
  amount,
  fromCurrency,
  state,
  emptyLabel = "Price on request",
}: {
  amount?: number | null;
  fromCurrency: CurrencyCode;
  state: CurrencyDisplayState;
  emptyLabel?: string;
}) {
  if (amount === null || amount === undefined) return emptyLabel;

  const rates = {
    ...state.rates,
    [state.baseCurrency]: 1,
  };
  const converted = convertAmount(
    amount,
    fromCurrency,
    state.selectedCurrency,
    rates
  );

  if (converted === null) {
    return formatMoney(amount, fromCurrency, state.roundingMode);
  }

  const display = formatMoney(converted, state.selectedCurrency, state.roundingMode);

  if (state.showOriginalCurrency && state.selectedCurrency !== fromCurrency) {
    return `${display} (${formatMoney(amount, fromCurrency, state.roundingMode)})`;
  }

  return display;
}

export function buildTranslationLookup(
  entries: { key: string; namespace: string; baseText: string; translatedText?: string | null }[]
) {
  const lookup = new Map<string, string>();

  entries.forEach((entry) => {
    const text = entry.translatedText?.trim() || entry.baseText;
    lookup.set(`${entry.namespace}:${entry.key}`, text);
  });

  return lookup;
}

export function translateFromLookup(
  lookup: Map<string, string>,
  namespace: string,
  key: string,
  fallback: string
) {
  return lookup.get(`${namespace}:${key}`) ?? fallback;
}
