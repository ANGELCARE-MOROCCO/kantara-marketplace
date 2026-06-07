import "server-only";

import { createHash } from "crypto";
import type { Prisma } from "@prisma/client";

import prisma from "./db";
import {
  LIBRETRANSLATE_SOURCE,
  SUPPORTED_LANGUAGES,
  type LanguageCode,
} from "./globalization";
import { APP_TRANSLATION_REGISTRY } from "./i18nRegistry";

export const ENTITY_TRANSLATION_NAMESPACE = "entity";

export const PUBLIC_TRANSLATION_STATUSES = [
  "machine_translated",
  "human_reviewed",
] as const;

export const TRANSLATION_STATUSES = [
  "draft",
  "queued",
  "machine_translated",
  "human_reviewed",
  "stale",
  "failed",
] as const;

export const HOMEPAGE_SECTION_TRANSLATABLE_FIELDS = [
  "eyebrow",
  "badgeText",
  "title",
  "subtitle",
  "body",
  "ctaLabel",
  "secondaryCtaLabel",
] as const;

export const HOME_TRANSLATABLE_FIELDS = [
  "approvedTitle",
  "approvedDescription",
  "approvedNeighborhood",
] as const;

export type TranslationStatus = (typeof TRANSLATION_STATUSES)[number];
export type TranslationScope = "static" | "homepage" | "home" | "all";
export type TranslationSyncMode = "missing" | "stale" | "failed";
export type HomepageSectionTranslationField =
  (typeof HOMEPAGE_SECTION_TRANSLATABLE_FIELDS)[number];
export type HomeTranslationField = (typeof HOME_TRANSLATABLE_FIELDS)[number];

type PrismaExecutor = typeof prisma | Prisma.TransactionClient;

export type TranslationSourceRecord = {
  key: string;
  namespace: string;
  entityType: string | null;
  entityId: string | null;
  fieldName: string | null;
  baseText: string;
  sourceHash: string;
};

export type EntityTranslationTarget = {
  entityType: string;
  entityId: string;
  fieldName: string;
  sourceHash?: string | null;
};

function normalizeSourceText(value?: string | null) {
  return value?.trim() ?? "";
}

export function createSourceHash(baseText: string) {
  return createHash("sha256").update(baseText).digest("hex");
}

export function buildEntityTranslationKey(
  entityType: string,
  entityId: string,
  fieldName: string
) {
  return `${entityType}.${entityId}.${fieldName}`;
}

export function isPublicTranslationStatus(status?: string | null) {
  return PUBLIC_TRANSLATION_STATUSES.includes(
    status as (typeof PUBLIC_TRANSLATION_STATUSES)[number]
  );
}

function toStaticSource(entry: {
  key: string;
  namespace: string;
  baseText: string;
}): TranslationSourceRecord {
  const baseText = normalizeSourceText(entry.baseText);

  return {
    key: entry.key,
    namespace: entry.namespace,
    entityType: null,
    entityId: null,
    fieldName: null,
    baseText,
    sourceHash: createSourceHash(baseText),
  };
}

function toEntitySource({
  entityType,
  entityId,
  fieldName,
  baseText,
}: {
  entityType: string;
  entityId: string;
  fieldName: string;
  baseText?: string | null;
}): TranslationSourceRecord | null {
  const normalizedBaseText = normalizeSourceText(baseText);
  if (!normalizedBaseText) return null;

  return {
    key: buildEntityTranslationKey(entityType, entityId, fieldName),
    namespace: ENTITY_TRANSLATION_NAMESPACE,
    entityType,
    entityId,
    fieldName,
    baseText: normalizedBaseText,
    sourceHash: createSourceHash(normalizedBaseText),
  };
}

function shouldMarkStale(existing: {
  baseText: string;
  sourceHash: string | null;
}) {
  return (source: TranslationSourceRecord) =>
    existing.baseText !== source.baseText ||
    existing.sourceHash !== source.sourceHash;
}

export async function upsertTranslationEntry({
  key,
  namespace,
  entityType,
  entityId,
  fieldName,
  baseText,
  language,
  translatedText,
  source,
  status,
  sourceHash,
  lastSyncedAt,
  errorMessage,
  tx,
}: TranslationSourceRecord & {
  language: LanguageCode;
  translatedText?: string | null;
  source?: string | null;
  status: TranslationStatus;
  lastSyncedAt?: Date | null;
  errorMessage?: string | null;
  tx?: PrismaExecutor;
}) {
  const client = tx ?? prisma;

  return client.translationEntry.upsert({
    where: {
      key_namespace_language: {
        key,
        namespace,
        language,
      },
    },
    create: {
      key,
      namespace,
      entityType,
      entityId,
      fieldName,
      baseText,
      language,
      translatedText: translatedText ?? null,
      source: source ?? null,
      status,
      sourceHash,
      lastSyncedAt: lastSyncedAt ?? null,
      errorMessage: errorMessage ?? null,
    },
    update: {
      entityType,
      entityId,
      fieldName,
      baseText,
      translatedText: translatedText ?? null,
      source: source ?? null,
      status,
      sourceHash,
      lastSyncedAt: lastSyncedAt ?? null,
      errorMessage: errorMessage ?? null,
    },
  });
}

export async function ensureTranslationSources(
  sources: TranslationSourceRecord[],
  tx?: PrismaExecutor
) {
  const client = tx ?? prisma;
  let created = 0;
  let stale = 0;

  for (const source of sources) {
    for (const language of SUPPORTED_LANGUAGES.map((item) => item.code)) {
      const existing = await client.translationEntry.findUnique({
        where: {
          key_namespace_language: {
            key: source.key,
            namespace: source.namespace,
            language,
          },
        },
      });

      if (!existing) {
        await client.translationEntry.create({
          data: {
            key: source.key,
            namespace: source.namespace,
            entityType: source.entityType,
            entityId: source.entityId,
            fieldName: source.fieldName,
            baseText: source.baseText,
            language,
            translatedText: language === "en" ? source.baseText : null,
            source: language === "en" ? "base" : null,
            status: language === "en" ? "human_reviewed" : "queued",
            sourceHash: source.sourceHash,
            lastSyncedAt: language === "en" ? new Date() : null,
          },
        });
        created += 1;
        continue;
      }

      if (shouldMarkStale(existing)(source)) {
        await client.translationEntry.update({
          where: { id: existing.id },
          data: {
            entityType: source.entityType,
            entityId: source.entityId,
            fieldName: source.fieldName,
            baseText: source.baseText,
            sourceHash: source.sourceHash,
            status:
              language === "en"
                ? "human_reviewed"
                : existing.translatedText
                  ? "stale"
                  : "queued",
            translatedText: language === "en" ? source.baseText : existing.translatedText,
            source: language === "en" ? "base" : existing.source,
            errorMessage: null,
            lastSyncedAt: language === "en" ? new Date() : existing.lastSyncedAt,
          },
        });
        stale += 1;
      }
    }
  }

  return { created, stale };
}

export async function ensureStaticTranslationRegistry() {
  return ensureTranslationSources(APP_TRANSLATION_REGISTRY.map(toStaticSource));
}

export async function markStaleWhenSourceChanges({
  entityType,
  entityId,
  fieldName,
  baseText,
  tx,
}: {
  entityType: string;
  entityId: string;
  fieldName: string;
  baseText?: string | null;
  tx?: PrismaExecutor;
}) {
  const client = tx ?? prisma;
  const normalizedBaseText = normalizeSourceText(baseText);
  const sourceHash = createSourceHash(normalizedBaseText);
  const key = buildEntityTranslationKey(entityType, entityId, fieldName);
  const existingEntries = await client.translationEntry.findMany({
    where: {
      key,
      namespace: ENTITY_TRANSLATION_NAMESPACE,
    },
  });

  if (!normalizedBaseText) {
    if (existingEntries.length > 0) {
      await client.translationEntry.updateMany({
        where: {
          key,
          namespace: ENTITY_TRANSLATION_NAMESPACE,
          language: { not: "en" },
        },
        data: {
          baseText: "",
          translatedText: null,
          sourceHash,
          status: "stale",
          errorMessage: null,
        },
      });
      await client.translationEntry.upsert({
        where: {
          key_namespace_language: {
            key,
            namespace: ENTITY_TRANSLATION_NAMESPACE,
            language: "en",
          },
        },
        create: {
          key,
          namespace: ENTITY_TRANSLATION_NAMESPACE,
          entityType,
          entityId,
          fieldName,
          baseText: "",
          language: "en",
          translatedText: "",
          source: "base",
          status: "human_reviewed",
          sourceHash,
          lastSyncedAt: new Date(),
        },
        update: {
          baseText: "",
          translatedText: "",
          sourceHash,
          status: "human_reviewed",
          source: "base",
          lastSyncedAt: new Date(),
          errorMessage: null,
        },
      });
    }

    return { created: 0, stale: existingEntries.length };
  }

  return ensureTranslationSources(
    [
      {
        key,
        namespace: ENTITY_TRANSLATION_NAMESPACE,
        entityType,
        entityId,
        fieldName,
        baseText: normalizedBaseText,
        sourceHash,
      },
    ],
    client
  );
}

export async function markHomepageSectionTranslationsStale({
  sectionId,
  values,
  tx,
}: {
  sectionId: string;
  values: Partial<Record<HomepageSectionTranslationField, string | null>>;
  tx?: PrismaExecutor;
}) {
  let created = 0;
  let stale = 0;

  for (const fieldName of HOMEPAGE_SECTION_TRANSLATABLE_FIELDS) {
    if (!(fieldName in values)) continue;

    const result = await markStaleWhenSourceChanges({
      entityType: "homepageSection",
      entityId: sectionId,
      fieldName,
      baseText: values[fieldName],
      tx,
    });
    created += result.created;
    stale += result.stale;
  }

  return { created, stale };
}

export async function markHomeTranslationsStale({
  homeId,
  values,
  tx,
}: {
  homeId: string;
  values: Partial<Record<HomeTranslationField, string | null>>;
  tx?: PrismaExecutor;
}) {
  let created = 0;
  let stale = 0;

  for (const fieldName of HOME_TRANSLATABLE_FIELDS) {
    if (!(fieldName in values)) continue;

    const result = await markStaleWhenSourceChanges({
      entityType: "home",
      entityId: homeId,
      fieldName,
      baseText: values[fieldName],
      tx,
    });
    created += result.created;
    stale += result.stale;
  }

  return { created, stale };
}

export async function collectHomepageSectionTranslationSources() {
  const sections = await prisma.homepageSection.findMany({
    select: {
      id: true,
      eyebrow: true,
      badgeText: true,
      title: true,
      subtitle: true,
      body: true,
      ctaLabel: true,
      secondaryCtaLabel: true,
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return sections.flatMap((section) =>
    HOMEPAGE_SECTION_TRANSLATABLE_FIELDS.map((fieldName) =>
      toEntitySource({
        entityType: "homepageSection",
        entityId: section.id,
        fieldName,
        baseText: section[fieldName],
      })
    ).filter((source): source is TranslationSourceRecord => Boolean(source))
  );
}

export async function collectHomeTranslationSources() {
  return [];
}

export async function collectDynamicTranslationSources() {
  const [homepageSources, homeSources] = await Promise.all([
    collectHomepageSectionTranslationSources(),
    collectHomeTranslationSources(),
  ]);

  return [...homepageSources, ...homeSources];
}

export async function collectTranslationSourcesForScope(scope: TranslationScope) {
  if (scope === "static") {
    return APP_TRANSLATION_REGISTRY.map(toStaticSource);
  }

  if (scope === "homepage") {
    return collectHomepageSectionTranslationSources();
  }

  if (scope === "home") {
    return collectHomeTranslationSources();
  }

  const [homepageSources, homeSources] = await Promise.all([
    collectHomepageSectionTranslationSources(),
    collectHomeTranslationSources(),
  ]);

  return [
    ...APP_TRANSLATION_REGISTRY.map(toStaticSource),
    ...homepageSources,
    ...homeSources,
  ];
}

export async function ensureTranslationEntriesForScope(scope: TranslationScope) {
  return ensureTranslationSources(await collectTranslationSourcesForScope(scope));
}

export async function getEntityTranslationMap(
  language: LanguageCode,
  targets: EntityTranslationTarget[]
) {
  if (language === "en" || targets.length === 0) {
    return new Map<string, string>();
  }

  const keys = Array.from(
    new Set(
      targets.map((target) =>
        buildEntityTranslationKey(
          target.entityType,
          target.entityId,
          target.fieldName
        )
      )
    )
  );
  const expectedHashByKey = new Map(
    targets
      .filter((target) => target.sourceHash)
      .map((target) => [
        buildEntityTranslationKey(
          target.entityType,
          target.entityId,
          target.fieldName
        ),
        target.sourceHash,
      ])
  );
  const rows = await prisma.translationEntry.findMany({
    where: {
      namespace: ENTITY_TRANSLATION_NAMESPACE,
      language,
      key: { in: keys },
      status: { in: [...PUBLIC_TRANSLATION_STATUSES] },
      translatedText: { not: null },
    },
    select: {
      key: true,
      translatedText: true,
      sourceHash: true,
    },
  });

  return new Map(
    rows
      .filter((row) => {
        if (!row.translatedText?.trim()) return false;
        const expectedHash = expectedHashByKey.get(row.key);
        return !expectedHash || row.sourceHash === expectedHash;
      })
      .map((row) => [row.key, row.translatedText!.trim()])
  );
}

export async function getEntityTranslation(
  entityType: string,
  entityId: string,
  fieldName: string,
  language: LanguageCode,
  fallback: string
) {
  if (language === "en") return fallback;

  const key = buildEntityTranslationKey(entityType, entityId, fieldName);
  const entry = await prisma.translationEntry.findUnique({
    where: {
      key_namespace_language: {
        key,
        namespace: ENTITY_TRANSLATION_NAMESPACE,
        language,
      },
    },
    select: {
      translatedText: true,
      status: true,
    },
  });

  return isPublicTranslationStatus(entry?.status) && entry?.translatedText?.trim()
    ? entry.translatedText.trim()
    : fallback;
}

export function getTranslationWhereForScope(
  scope: TranslationScope
): Prisma.TranslationEntryWhereInput {
  if (scope === "static") {
    return {
      entityType: null,
    };
  }

  if (scope === "homepage") {
    return {
      entityType: "homepageSection",
    };
  }

  if (scope === "home") {
    return {
      entityType: "home",
    };
  }

  return {
    OR: [{ entityType: null }, { entityType: { not: "home" } }],
  };
}

export function getTranslationWhereForMode(
  mode: TranslationSyncMode
): Prisma.TranslationEntryWhereInput {
  if (mode === "stale") {
    return { status: "stale" };
  }

  if (mode === "failed") {
    return { status: "failed" };
  }

  return {
    OR: [
      { status: { in: ["draft", "queued"] } },
      { translatedText: null },
      { translatedText: "" },
    ],
  };
}

export function getSupportedTargetLanguages(enabledLanguages: LanguageCode[]) {
  const enabledSet = new Set(enabledLanguages);

  return SUPPORTED_LANGUAGES.map((language) => language.code).filter(
    (language) => language !== "en" && enabledSet.has(language)
  );
}

export function translationSourceLabel(source?: string | null) {
  if (source === LIBRETRANSLATE_SOURCE) return "machine";
  if (source === "manual") return "manual";
  if (source === "base") return "English source";
  return "pending";
}
