"use client";

import { useRouter } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CURRENCY_COOKIE_NAME,
  SUPPORTED_CURRENCIES,
  getCurrencyMeta,
  type CurrencyCode,
} from "@/app/lib/globalization";

export function CurrencySelector({
  selectedCurrency,
  enabledCurrencies,
  label = "Currency",
}: {
  selectedCurrency: CurrencyCode;
  enabledCurrencies: CurrencyCode[];
  label?: string;
}) {
  const router = useRouter();
  const enabledSet = new Set(enabledCurrencies);
  const selected = enabledSet.has(selectedCurrency)
    ? selectedCurrency
    : enabledCurrencies[0] ?? "USD";

  function updateCurrency(value: string) {
    const next = getCurrencyMeta(value).code;
    const maxAge = 60 * 60 * 24 * 365;

    document.cookie = `${CURRENCY_COOKIE_NAME}=${encodeURIComponent(
      next
    )}; path=/; max-age=${maxAge}; samesite=lax`;
    window.localStorage.setItem(CURRENCY_COOKIE_NAME, next);
    router.refresh();
  }

  return (
    <div className="min-w-[86px]">
      <label className="sr-only">{label}</label>
      <Select value={selected} onValueChange={updateCurrency}>
        <SelectTrigger className="h-9 w-[78px] rounded-md px-2 text-xs font-semibold sm:w-[108px]">
          <SelectValue aria-label={label} />
        </SelectTrigger>
        <SelectContent align="end">
          {SUPPORTED_CURRENCIES.filter((currency) =>
            enabledSet.has(currency.code)
          ).map((currency) => (
            <SelectItem key={currency.code} value={currency.code}>
              {currency.symbol} {currency.code}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
