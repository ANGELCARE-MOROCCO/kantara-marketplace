"use server";

import { revalidatePath, revalidateTag, unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";

import { requireAdmin } from "@/app/lib/auth";
import prisma from "@/app/lib/db";
import {
  assertStorageBucketExists,
  getSupabaseAdminClient,
} from "@/app/lib/supabaseAdmin";
import {
  BACKGROUND_STYLE_OPTIONS,
  BUTTON_STYLE_OPTIONS,
  CONTENT_WIDTH_OPTIONS,
  DEFAULT_HOMEPAGE_SECTIONS,
  DEFAULT_SITE_BRANDING,
  HERO_ALIGNMENT_OPTIONS,
  HERO_VISUAL_DENSITY_OPTIONS,
  HOMEPAGE_SECTION_TYPES,
  HOMEPAGE_THEME_MODES,
  LAYOUT_STYLE_OPTIONS,
  LOGO_DISPLAY_MODE_OPTIONS,
  LOGO_PLACEMENT_OPTIONS,
  LOGO_SIZE_OPTIONS,
  SECTION_ALIGNMENT_OPTIONS,
  SECTION_RADIUS_OPTIONS,
  SECTION_SPACING_OPTIONS,
  SECTION_THEME_STYLE_OPTIONS,
  buildHomepageSectionKey,
  getDefaultHomepageSections,
  getOptionValues,
  normalizeHomepageSection,
  normalizeSiteBranding,
} from "@/app/lib/homepageConfig";
import { TRANSLATIONS_CACHE_TAG } from "@/app/lib/i18n";
import { markHomepageSectionTranslationsStale } from "@/app/lib/translationMemory";

const HOMEPAGE_IMAGE_BUCKET = "images";
const MAX_LOGO_FILE_SIZE = 3 * 1024 * 1024;
const MAX_HOMEPAGE_FILE_SIZE = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);
const ALLOWED_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "avif"]);

type BuilderRedirectOptions = {
  selected?: string | null;
  notice?: string;
  error?: string;
};

function redirectToBuilder(options: BuilderRedirectOptions = {}): never {
  const params = new URLSearchParams();

  if (options.selected) params.set("section", options.selected);
  if (options.notice) params.set("notice", options.notice);
  if (options.error) params.set("error", options.error);

  const query = params.toString();
  redirect(`/admin/homepage-builder${query ? `?${query}` : ""}`);
}

function revalidateHomepageBuilder() {
  revalidateTag(TRANSLATIONS_CACHE_TAG);
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/homepage-builder");
}

function readString(formData: FormData, key: string, maxLength = 1200) {
  const value = formData.get(key);
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  return trimmed.slice(0, maxLength);
}

function readOptionalString(formData: FormData, key: string, maxLength = 1200) {
  const value = formData.get(key);
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, maxLength) : null;
}

function readBoolean(formData: FormData, key: string, defaultValue: boolean) {
  const values = formData.getAll(key);
  const value = values[values.length - 1];
  if (typeof value !== "string") return defaultValue;

  return value === "true" || value === "on" || value === "1";
}

function readInt(formData: FormData, key: string, max = 1200) {
  const value = readOptionalString(formData, key, 8);
  if (!value) return null;

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;

  const next = Math.trunc(parsed);
  return next > 0 && next <= max ? next : null;
}

function readOption<T extends readonly { value: string }[]>(
  formData: FormData,
  key: string,
  options: T,
  fallback: T[number]["value"]
) {
  const value = readOptionalString(formData, key, 80);
  const allowedValues = getOptionValues(options);

  return allowedValues.includes(value ?? "") ? value ?? fallback : fallback;
}

function safeHref(value?: string | null, fallback = "/") {
  if (!value) return fallback;
  if (value.startsWith("/") || value.startsWith("#")) return value;

  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

function safeImageUrl(value?: string | null) {
  if (!value) return null;
  if (value.startsWith("/")) return value;

  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function sanitizeFileName(fileName: string) {
  const cleaned = fileName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return cleaned || "homepage-image";
}

function getFileExtension(fileName: string) {
  const extension = fileName.toLowerCase().split(".").pop();
  return extension && extension !== fileName.toLowerCase() ? extension : "";
}

function getUploadedImage(formData: FormData) {
  const file = formData.get("image");
  if (!(file instanceof File) || file.size <= 0 || !file.name.trim()) {
    throw new Error("Choose an image file before uploading.");
  }

  return file;
}

function assertUploadAllowed(file: File, maxSize: number) {
  if (
    !ALLOWED_IMAGE_TYPES.has(file.type) ||
    !ALLOWED_IMAGE_EXTENSIONS.has(getFileExtension(file.name))
  ) {
    throw new Error("Upload a JPG, PNG, WebP, or AVIF image.");
  }

  if (file.size > maxSize) {
    throw new Error(
      `Image is too large. Maximum size is ${Math.round(maxSize / 1024 / 1024)}MB.`
    );
  }
}

async function uploadPublicImage({
  file,
  pathPrefix,
}: {
  file: File;
  pathPrefix: string;
}) {
  const supabaseAdmin = getSupabaseAdminClient();
  await assertStorageBucketExists(supabaseAdmin, HOMEPAGE_IMAGE_BUCKET);

  const storagePath = `${pathPrefix}/${Date.now()}-${sanitizeFileName(
    file.name
  )}`;

  const { data, error } = await supabaseAdmin.storage
    .from(HOMEPAGE_IMAGE_BUCKET)
    .upload(storagePath, file, {
      cacheControl: "2592000",
      contentType: file.type,
      upsert: false,
    });

  if (error || !data?.path) {
    throw new Error(error?.message ?? "Image upload failed.");
  }

  const {
    data: { publicUrl },
  } = supabaseAdmin.storage
    .from(HOMEPAGE_IMAGE_BUCKET)
    .getPublicUrl(data.path);

  if (!publicUrl) {
    throw new Error("Image uploaded, but a public URL could not be created.");
  }

  return publicUrl;
}

function getUploadErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}

function parseMetadata(value?: string | null) {
  if (!value) return {};

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function buildSectionMetadata(formData: FormData, previous?: string | null) {
  const nextMetadata = parseMetadata(previous);
  const backgroundStyle = readOption(
    formData,
    "backgroundStyle",
    BACKGROUND_STYLE_OPTIONS,
    "clean"
  );
  const defaultDestinationFocus = readOptionalString(
    formData,
    "defaultDestinationFocus",
    80
  );
  const notes = readOptionalString(formData, "metadataNotes", 1200);

  nextMetadata.backgroundStyle = backgroundStyle;
  nextMetadata.defaultDestinationFocus = defaultDestinationFocus;
  nextMetadata.notes = notes;

  return JSON.stringify(nextMetadata);
}

export async function getHomepageBuilderState() {
  await requireAdmin();
  noStore();

  const [sections, branding, assets] = await Promise.all([
    prisma.homepageSection.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.siteBranding.findFirst({
      orderBy: { updatedAt: "desc" },
    }),
    prisma.homepageAsset.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      take: 200,
    }),
  ]);

  return {
    sections: sections.map(normalizeHomepageSection),
    defaultSections: getDefaultHomepageSections(),
    branding: normalizeSiteBranding(branding),
    assets: assets.map((asset) => ({
      id: asset.id,
      sectionId: asset.sectionId,
      url: asset.url,
      altText: asset.altText,
      type: asset.type,
      sortOrder: asset.sortOrder,
    })),
  };
}

export async function createHomepageSection(formData: FormData) {
  await requireAdmin();

  const type = readOption(
    formData,
    "type",
    HOMEPAGE_SECTION_TYPES,
    "custom"
  );
  const template = DEFAULT_HOMEPAGE_SECTIONS.find(
    (section) => section.type === type
  );
  const maxSort = await prisma.homepageSection.aggregate({
    _max: { sortOrder: true },
  });
  const title =
    readOptionalString(formData, "title", 180) ??
    template?.title ??
    "New homepage section";

  const section = await prisma.homepageSection.create({
    data: {
      sectionKey: buildHomepageSectionKey(type),
      type,
      title,
      eyebrow:
        readOptionalString(formData, "eyebrow", 120) ??
        template?.eyebrow ??
        null,
      subtitle: template?.subtitle ?? null,
      body: template?.body ?? null,
      ctaLabel: template?.ctaLabel ?? null,
      ctaHref: template?.ctaHref ?? null,
      secondaryCtaLabel: template?.secondaryCtaLabel ?? null,
      secondaryCtaHref: template?.secondaryCtaHref ?? null,
      badgeText: template?.badgeText ?? null,
      layoutStyle: template?.layoutStyle ?? "editorial",
      themeStyle: template?.themeStyle ?? "default",
      spacing: template?.spacing ?? "standard",
      alignment: template?.alignment ?? "left",
      sortOrder: (maxSort._max.sortOrder ?? 0) + 10,
    },
  });
  await markHomepageSectionTranslationsStale({
    sectionId: section.id,
    values: {
      eyebrow: section.eyebrow,
      badgeText: section.badgeText,
      title: section.title,
      subtitle: section.subtitle,
      body: section.body,
      ctaLabel: section.ctaLabel,
      secondaryCtaLabel: section.secondaryCtaLabel,
    },
  });

  revalidateHomepageBuilder();
  redirectToBuilder({
    selected: section.id,
    notice: "Section created.",
  });
}

export async function updateHomepageSection(formData: FormData) {
  await requireAdmin();

  const sectionId = readString(formData, "sectionId", 80);
  if (!sectionId) {
    redirectToBuilder({ error: "Missing section id." });
  }

  const existing = await prisma.homepageSection.findUnique({
    where: { id: sectionId },
    select: { id: true, metadata: true },
  });

  if (!existing) {
    redirectToBuilder({ error: "Section not found." });
  }

  const type = readOption(
    formData,
    "type",
    HOMEPAGE_SECTION_TYPES,
    "custom"
  );

  const nextContent = {
    title: readOptionalString(formData, "title", 180),
    eyebrow: readOptionalString(formData, "eyebrow", 140),
    subtitle: readOptionalString(formData, "subtitle", 260),
    body: readOptionalString(formData, "body", 1400),
    ctaLabel: readOptionalString(formData, "ctaLabel", 80),
    secondaryCtaLabel: readOptionalString(formData, "secondaryCtaLabel", 80),
    badgeText: readOptionalString(formData, "badgeText", 120),
  };

  await prisma.$transaction(async (tx) => {
    await tx.homepageSection.update({
      where: { id: sectionId },
      data: {
        type,
        title: nextContent.title,
        eyebrow: nextContent.eyebrow,
        subtitle: nextContent.subtitle,
        body: nextContent.body,
        ctaLabel: nextContent.ctaLabel,
        ctaHref: safeHref(readOptionalString(formData, "ctaHref", 260), ""),
        secondaryCtaLabel: nextContent.secondaryCtaLabel,
        secondaryCtaHref: safeHref(
          readOptionalString(formData, "secondaryCtaHref", 260),
          ""
        ),
        imageUrl: safeImageUrl(readOptionalString(formData, "imageUrl", 1200)),
        backgroundImageUrl: safeImageUrl(
          readOptionalString(formData, "backgroundImageUrl", 1200)
        ),
        badgeText: nextContent.badgeText,
        layoutStyle: readOption(
          formData,
          "layoutStyle",
          LAYOUT_STYLE_OPTIONS,
          "editorial"
        ),
        themeStyle: readOption(
          formData,
          "themeStyle",
          SECTION_THEME_STYLE_OPTIONS,
          "default"
        ),
        spacing: readOption(
          formData,
          "spacing",
          SECTION_SPACING_OPTIONS,
          "standard"
        ),
        alignment: readOption(
          formData,
          "alignment",
          SECTION_ALIGNMENT_OPTIONS,
          "left"
        ),
        metadata: buildSectionMetadata(formData, existing.metadata),
        isVisible: readBoolean(formData, "isVisible", true),
      },
    });

    await markHomepageSectionTranslationsStale({
      sectionId,
      values: nextContent,
      tx,
    });
  });

  revalidateHomepageBuilder();
  redirectToBuilder({
    selected: sectionId,
    notice: "Section saved.",
  });
}

export async function duplicateHomepageSection(formData: FormData) {
  await requireAdmin();

  const sectionId = readString(formData, "sectionId", 80);
  if (!sectionId) {
    redirectToBuilder({ error: "Missing section id." });
  }

  const [section, maxSort] = await Promise.all([
    prisma.homepageSection.findUnique({
      where: { id: sectionId },
      include: { assets: true },
    }),
    prisma.homepageSection.aggregate({
      _max: { sortOrder: true },
    }),
  ]);

  if (!section) {
    redirectToBuilder({ error: "Section not found." });
  }

  const copy = await prisma.homepageSection.create({
    data: {
      sectionKey: buildHomepageSectionKey(section.type),
      type: section.type,
      title: section.title ? `${section.title} copy` : "Copied section",
      eyebrow: section.eyebrow,
      subtitle: section.subtitle,
      body: section.body,
      ctaLabel: section.ctaLabel,
      ctaHref: section.ctaHref,
      secondaryCtaLabel: section.secondaryCtaLabel,
      secondaryCtaHref: section.secondaryCtaHref,
      imageUrl: section.imageUrl,
      backgroundImageUrl: section.backgroundImageUrl,
      badgeText: section.badgeText,
      layoutStyle: section.layoutStyle,
      themeStyle: section.themeStyle,
      spacing: section.spacing,
      alignment: section.alignment,
      metadata: section.metadata,
      sortOrder: (maxSort._max.sortOrder ?? section.sortOrder) + 10,
      isVisible: section.isVisible,
      assets:
        section.assets.length > 0
          ? {
              create: section.assets.map((asset, index) => ({
                url: asset.url,
                altText: asset.altText,
                type: asset.type,
                sortOrder: index,
              })),
            }
          : undefined,
    },
  });

  revalidateHomepageBuilder();
  redirectToBuilder({
    selected: copy.id,
    notice: "Section duplicated.",
  });
}

export async function deleteHomepageSection(formData: FormData) {
  await requireAdmin();

  const sectionId = readString(formData, "sectionId", 80);
  const selected = readOptionalString(formData, "selectedId", 80);
  const requestedNextSelected = readOptionalString(
    formData,
    "nextSelectedId",
    80
  );

  if (!sectionId) {
    redirectToBuilder({ selected, error: "Missing section id." });
  }

  const sections = await prisma.homepageSection.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, isLocked: true },
  });
  const sectionIndex = sections.findIndex((section) => section.id === sectionId);
  const section = sections[sectionIndex];

  if (!section) {
    redirectToBuilder({ selected, error: "Section not found." });
  }

  if (section.isLocked) {
    redirectToBuilder({
      selected: sectionId,
      error: "Locked sections cannot be deleted.",
    });
  }

  const fallbackSelected =
    sections[sectionIndex + 1]?.id ?? sections[sectionIndex - 1]?.id ?? null;
  const selectedAfterDelete =
    selected && selected !== sectionId
      ? selected
      : sections.some(
            (section) =>
              section.id === requestedNextSelected && section.id !== sectionId
          )
        ? requestedNextSelected
        : fallbackSelected;

  await prisma.homepageSection.delete({ where: { id: sectionId } });

  revalidateHomepageBuilder();
  redirectToBuilder({
    selected: selectedAfterDelete,
    notice: "Section deleted.",
  });
}

export async function toggleHomepageSectionVisibility(formData: FormData) {
  await requireAdmin();

  const sectionId = readString(formData, "sectionId", 80);
  const selected = readOptionalString(formData, "selectedId", 80);

  if (!sectionId) {
    redirectToBuilder({ selected, error: "Missing section id." });
  }

  const section = await prisma.homepageSection.findUnique({
    where: { id: sectionId },
    select: { isVisible: true },
  });

  if (!section) {
    redirectToBuilder({ selected, error: "Section not found." });
  }

  await prisma.homepageSection.update({
    where: { id: sectionId },
    data: { isVisible: !section.isVisible },
  });

  revalidateHomepageBuilder();
  redirectToBuilder({
    selected: selected ?? sectionId,
    notice: section.isVisible ? "Section hidden." : "Section shown.",
  });
}

async function moveHomepageSection(formData: FormData, direction: "up" | "down") {
  await requireAdmin();

  const sectionId = readString(formData, "sectionId", 80);
  if (!sectionId) {
    redirectToBuilder({ error: "Missing section id." });
  }

  const sections = await prisma.homepageSection.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, sortOrder: true },
  });
  const index = sections.findIndex((section) => section.id === sectionId);
  const swapIndex = direction === "up" ? index - 1 : index + 1;

  if (index < 0 || !sections[swapIndex]) {
    redirectToBuilder({
      selected: sectionId,
      error:
        direction === "up"
          ? "Section is already first."
          : "Section is already last.",
    });
  }

  const current = sections[index];
  const swap = sections[swapIndex];

  await prisma.$transaction([
    prisma.homepageSection.update({
      where: { id: current.id },
      data: { sortOrder: swap.sortOrder },
    }),
    prisma.homepageSection.update({
      where: { id: swap.id },
      data: { sortOrder: current.sortOrder },
    }),
  ]);

  revalidateHomepageBuilder();
  redirectToBuilder({
    selected: sectionId,
    notice: direction === "up" ? "Section moved up." : "Section moved down.",
  });
}

export async function moveHomepageSectionUp(formData: FormData) {
  await moveHomepageSection(formData, "up");
}

export async function moveHomepageSectionDown(formData: FormData) {
  await moveHomepageSection(formData, "down");
}

export async function loadDefaultHomepageSections() {
  await requireAdmin();

  const existingSections = await prisma.homepageSection.findMany({
    select: { sectionKey: true },
  });
  const existingKeys = new Set(
    existingSections.map((section) => section.sectionKey)
  );
  const defaultsToCreate = getDefaultHomepageSections().filter(
    (section) => !existingKeys.has(section.sectionKey)
  );

  if (defaultsToCreate.length > 0) {
    await prisma.homepageSection.createMany({
      data: defaultsToCreate.map((section) => ({
        sectionKey: section.sectionKey,
        type: section.type,
        title: section.title,
        eyebrow: section.eyebrow,
        subtitle: section.subtitle,
        body: section.body,
        ctaLabel: section.ctaLabel,
        ctaHref: section.ctaHref,
        secondaryCtaLabel: section.secondaryCtaLabel,
        secondaryCtaHref: section.secondaryCtaHref,
        imageUrl: section.imageUrl,
        backgroundImageUrl: section.backgroundImageUrl,
        badgeText: section.badgeText,
        layoutStyle: section.layoutStyle,
        themeStyle: section.themeStyle,
        spacing: section.spacing,
        alignment: section.alignment,
        metadata: section.metadata,
        sortOrder: section.sortOrder,
        isVisible: section.isVisible,
        isLocked: section.isLocked,
      })),
    });
  }

  const firstSection = await prisma.homepageSection.findFirst({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });

  revalidateHomepageBuilder();
  redirectToBuilder({
    selected: firstSection?.id ?? null,
    notice:
      defaultsToCreate.length > 0
        ? "Default homepage sections loaded."
        : "Default homepage sections are already loaded.",
  });
}

export async function updateSiteBranding(formData: FormData) {
  const user = await requireAdmin();
  const selected = readOptionalString(formData, "selectedId", 80);

  const existing = await prisma.siteBranding.findFirst({
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });

  const data: Prisma.SiteBrandingUncheckedCreateInput = {
    brandName: readOptionalString(formData, "brandName", 90),
    logoAltText: readOptionalString(formData, "logoAltText", 140),
    logoHref: safeHref(readOptionalString(formData, "logoHref", 260), "/"),
    logoPlacement: readOption(
      formData,
      "logoPlacement",
      LOGO_PLACEMENT_OPTIONS,
      "left"
    ),
    logoSize: readOption(
      formData,
      "logoSize",
      LOGO_SIZE_OPTIONS,
      "medium"
    ),
    logoDisplayMode: readOption(
      formData,
      "logoDisplayMode",
      LOGO_DISPLAY_MODE_OPTIONS,
      "image_text"
    ),
    logoWidth: readInt(formData, "logoWidth", 800),
    logoHeight: readInt(formData, "logoHeight", 400),
    mobileLogoWidth: readInt(formData, "mobileLogoWidth", 400),
    mobileLogoHeight: readInt(formData, "mobileLogoHeight", 240),
    showLogo: readBoolean(formData, "showLogo", true),
    showBrandName: readBoolean(formData, "showBrandName", true),
    themeMode: readOption(
      formData,
      "themeMode",
      HOMEPAGE_THEME_MODES,
      "premium_dark"
    ),
    heroAlignment: readOption(
      formData,
      "heroAlignment",
      HERO_ALIGNMENT_OPTIONS,
      "split"
    ),
    heroVisualDensity: readOption(
      formData,
      "heroVisualDensity",
      HERO_VISUAL_DENSITY_OPTIONS,
      "clean"
    ),
    contentWidth: readOption(
      formData,
      "contentWidth",
      CONTENT_WIDTH_OPTIONS,
      "standard"
    ),
    buttonStyle: readOption(
      formData,
      "buttonStyle",
      BUTTON_STYLE_OPTIONS,
      "premium"
    ),
    sectionRadius: readOption(
      formData,
      "sectionRadius",
      SECTION_RADIUS_OPTIONS,
      "rounded"
    ),
    showMetricsStrip: readBoolean(formData, "showMetricsStrip", true),
    showTrustPanels: readBoolean(formData, "showTrustPanels", true),
    showFeaturedListings: readBoolean(formData, "showFeaturedListings", true),
    showFooter: readBoolean(formData, "showFooter", true),
    updatedById: user.id,
  };

  if (existing) {
    await prisma.siteBranding.update({
      where: { id: existing.id },
      data,
    });
  } else {
    await prisma.siteBranding.create({
      data,
    });
  }

  revalidateHomepageBuilder();
  redirectToBuilder({
    selected,
    notice: "Branding and theme controls saved.",
  });
}

export async function uploadHomepageImage(formData: FormData) {
  await requireAdmin();

  const sectionId = readString(formData, "sectionId", 80);
  const selected = sectionId;

  if (!sectionId) {
    redirectToBuilder({ error: "Choose a section before uploading media." });
  }

  const section = await prisma.homepageSection.findUnique({
    where: { id: sectionId },
    select: { id: true, title: true },
  });

  if (!section) {
    redirectToBuilder({ error: "Section not found." });
  }

  const imageKind = readOption(
    formData,
    "imageKind",
    [
      { value: "section_image" },
      { value: "background_image" },
      { value: "footer_brand_image" },
    ] as const,
    "section_image"
  );

  let publicUrl: string;
  let altText: string;

  try {
    const file = getUploadedImage(formData);
    assertUploadAllowed(file, MAX_HOMEPAGE_FILE_SIZE);

    publicUrl = await uploadPublicImage({
      file,
      pathPrefix: `homepage/sections/${section.id}`,
    });
    altText =
      readOptionalString(formData, "altText", 160) ??
      section.title ??
      "Homepage image";
  } catch (error) {
    redirectToBuilder({
      selected,
      error: getUploadErrorMessage(error, "Homepage image upload failed."),
    });
  }

  const assetCount = await prisma.homepageAsset.count({
    where: { sectionId: section.id },
  });

  await prisma.$transaction([
    prisma.homepageAsset.create({
      data: {
        sectionId: section.id,
        url: publicUrl,
        altText,
        type: imageKind,
        sortOrder: assetCount,
      },
    }),
    prisma.homepageSection.update({
      where: { id: section.id },
      data:
        imageKind === "background_image"
          ? { backgroundImageUrl: publicUrl }
          : { imageUrl: publicUrl },
    }),
  ]);

  revalidateHomepageBuilder();
  redirectToBuilder({
    selected,
    notice: "Homepage image uploaded.",
  });
}

export async function uploadLogoImage(formData: FormData) {
  const user = await requireAdmin();
  const selected = readOptionalString(formData, "selectedId", 80);

  let publicUrl: string;
  let altText: string;

  try {
    const file = getUploadedImage(formData);
    assertUploadAllowed(file, MAX_LOGO_FILE_SIZE);

    publicUrl = await uploadPublicImage({
      file,
      pathPrefix: "homepage/logo",
    });
    altText =
      readOptionalString(formData, "logoAltText", 160) ??
      readOptionalString(formData, "brandName", 90) ??
      "Kantara logo";
  } catch (error) {
    redirectToBuilder({
      selected,
      error: getUploadErrorMessage(error, "Logo image upload failed."),
    });
  }

  const existing = await prisma.siteBranding.findFirst({
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });

  if (existing) {
    await prisma.siteBranding.update({
      where: { id: existing.id },
      data: {
        logoUrl: publicUrl,
        logoAltText: altText,
        updatedById: user.id,
      },
    });
  } else {
    await prisma.siteBranding.create({
      data: {
        ...DEFAULT_SITE_BRANDING,
        id: undefined,
        logoUrl: publicUrl,
        logoAltText: altText,
        updatedById: user.id,
      },
    });
  }

  revalidateHomepageBuilder();
  redirectToBuilder({ selected, notice: "Logo image uploaded." });
}
