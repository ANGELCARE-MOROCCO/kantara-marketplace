import { NextResponse } from "next/server";

import { requireAdmin } from "@/app/lib/auth";
import { exportTranslationInventoryCsv } from "@/app/lib/translationInventory";

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

export async function GET() {
  await requireAdmin();

  const csv = await exportTranslationInventoryCsv();

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="kantara-translations-${todayStamp()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
