import { NextResponse } from "next/server";

import { requireAdmin } from "@/app/lib/auth";
import {
  exportSingleLanguageTranslationInventoryCsv,
  normalizeTranslationInventoryLanguage,
} from "@/app/lib/translationInventory";

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  await requireAdmin();

  const { searchParams } = new URL(request.url);
  const language = normalizeTranslationInventoryLanguage(searchParams.get("language"));
  const csv = await exportSingleLanguageTranslationInventoryCsv(language);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="kantara-translations-${language}-${todayStamp()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
