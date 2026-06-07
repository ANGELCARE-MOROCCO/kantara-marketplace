import { unstable_noStore as noStore } from "next/cache";

import prisma from "./db";
import { normalizeSiteBranding } from "./homepageConfig";

export async function getPublicSiteBranding() {
  noStore();

  const branding = await prisma.siteBranding.findFirst({
    orderBy: { updatedAt: "desc" },
  });

  return normalizeSiteBranding(branding);
}
