import { NextResponse } from "next/server";

import { requireAdmin } from "@/app/lib/auth";
import { buildSampleTranslationCsv } from "@/app/lib/translationInventory";

export async function GET() {
  await requireAdmin();

  const csv = await buildSampleTranslationCsv();

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="kantara-translations-sample.csv"',
      "Cache-Control": "no-store",
    },
  });
}
