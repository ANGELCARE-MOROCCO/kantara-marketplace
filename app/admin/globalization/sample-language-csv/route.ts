import { NextResponse } from "next/server";

import { requireAdmin } from "@/app/lib/auth";
import {
  buildSingleLanguageSampleTranslationCsv,
  normalizeTranslationInventoryLanguage,
} from "@/app/lib/translationInventory";

export async function GET(request: Request) {
  await requireAdmin();

  const { searchParams } = new URL(request.url);
  const language = normalizeTranslationInventoryLanguage(searchParams.get("language"));
  const csv = await buildSingleLanguageSampleTranslationCsv(language);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="kantara-translations-sample-${language}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
