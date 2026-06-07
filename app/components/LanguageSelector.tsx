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
  LANGUAGE_COOKIE_NAME,
  SUPPORTED_LANGUAGES,
  getLanguageMeta,
  type LanguageCode,
} from "@/app/lib/globalization";

export function LanguageSelector({
  selectedLanguage,
  enabledLanguages,
  label = "Language",
}: {
  selectedLanguage: LanguageCode;
  enabledLanguages: LanguageCode[];
  label?: string;
}) {
  const router = useRouter();
  const enabledSet = new Set(enabledLanguages);
  const selected = enabledSet.has(selectedLanguage)
    ? selectedLanguage
    : enabledLanguages[0] ?? "en";

  function updateLanguage(value: string) {
    const meta = getLanguageMeta(value);
    const maxAge = 60 * 60 * 24 * 365;

    document.cookie = `${LANGUAGE_COOKIE_NAME}=${encodeURIComponent(
      meta.code
    )}; path=/; max-age=${maxAge}; samesite=lax`;
    window.localStorage.setItem(LANGUAGE_COOKIE_NAME, meta.code);
    document.documentElement.lang = meta.code;
    document.documentElement.dir = meta.dir;
    router.refresh();
  }

  return (
    <div className="min-w-[92px]">
      <label className="sr-only">{label}</label>
      <Select value={selected} onValueChange={updateLanguage}>
        <SelectTrigger className="h-9 w-[86px] rounded-md px-2 text-xs font-semibold sm:w-[128px]">
          <SelectValue aria-label={label} />
        </SelectTrigger>
        <SelectContent align="end">
          {SUPPORTED_LANGUAGES.filter((language) =>
            enabledSet.has(language.code)
          ).map((language) => (
            <SelectItem key={language.code} value={language.code}>
              {language.flag} {language.nativeLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
