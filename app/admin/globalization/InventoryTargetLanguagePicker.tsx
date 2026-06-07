"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SUPPORTED_LANGUAGES,
  type LanguageCode,
} from "@/app/lib/globalization";

const INVENTORY_TARGET_LANGUAGE_CODES = new Set([
  "fr",
  "es",
  "zh-CN",
  "ja",
  "hi",
  "ar",
]);

const REPORT_PARAM_KEYS = [
  "notice",
  "error",
  "report",
  "reportAction",
  "reportStatus",
  "reportTargetLanguage",
  "reportTimestamp",
  "rowsRead",
  "rowsMatched",
  "rowsIgnored",
  "emptySkipped",
  "conflicts",
  "translationsCreated",
  "translationsUpdated",
  "languagesUpdated",
  "parsingFailed",
  "missingColumns",
  "targetLanguageMismatches",
  "unknownKeysIgnored",
  "missingIdentityRows",
  "staleSourceHashWarnings",
  "errorsCount",
  "warningsCount",
  "reportErrors",
  "reportWarnings",
  "fileName",
];

export function InventoryTargetLanguagePicker({
  selectedLanguage,
}: {
  selectedLanguage: LanguageCode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateLanguage(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "inventory");
    params.set("targetLanguage", value);
    REPORT_PARAM_KEYS.forEach((key) => params.delete(key));
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium" htmlFor="inventoryTargetLanguage">
        Target language
      </label>
      <Select value={selectedLanguage} onValueChange={updateLanguage}>
        <SelectTrigger id="inventoryTargetLanguage" className="h-10 w-full">
          <SelectValue placeholder="Select language" />
        </SelectTrigger>
        <SelectContent>
          {SUPPORTED_LANGUAGES.filter((language) =>
            INVENTORY_TARGET_LANGUAGE_CODES.has(language.code)
          ).map((language) => (
            <SelectItem key={language.code} value={language.code}>
              {language.nativeLabel} ({language.code})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
