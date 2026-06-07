import "server-only";

import {
  LIBRETRANSLATE_SOURCE,
  type LanguageCode,
} from "./globalization";

export type TranslationProviderStatus = {
  configured: boolean;
  endpoint: string | null;
  source: typeof LIBRETRANSLATE_SOURCE;
  message: string;
};

export type TranslationBatchItem = {
  id: string;
  text: string;
};

export type TranslationBatchResult = {
  id: string;
  ok: boolean;
  translatedText: string | null;
  errorMessage: string | null;
};

type LibreTranslateResponse = {
  translatedText?: string;
};

function getEndpoint() {
  const endpoint = process.env.LIBRETRANSLATE_URL?.trim();
  return endpoint ? endpoint.replace(/\/$/, "") : null;
}

function libreTarget(language: LanguageCode) {
  return language === "zh-CN" ? "zh" : language;
}

export function getTranslationProviderStatus(): TranslationProviderStatus {
  const endpoint = getEndpoint();

  return {
    configured: Boolean(endpoint),
    endpoint,
    source: LIBRETRANSLATE_SOURCE,
    message: endpoint
      ? "Translation service configured."
      : "Translation service not configured.",
  };
}

export async function translateText(text: string, targetLanguage: LanguageCode) {
  const trimmed = text.trim();
  if (!trimmed || targetLanguage === "en") return trimmed;

  const endpoint = getEndpoint();
  if (!endpoint) {
    throw new Error("Translation service not configured.");
  }

  const response = await fetch(`${endpoint}/translate`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: trimmed,
      source: "en",
      target: libreTarget(targetLanguage),
      format: "text",
      ...(process.env.LIBRETRANSLATE_API_KEY
        ? { api_key: process.env.LIBRETRANSLATE_API_KEY }
        : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`LibreTranslate responded with HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as LibreTranslateResponse;
  if (!payload.translatedText?.trim()) {
    throw new Error("LibreTranslate response did not include translated text.");
  }

  return payload.translatedText.trim();
}

export async function translateBatch(
  items: TranslationBatchItem[],
  targetLanguage: LanguageCode
): Promise<TranslationBatchResult[]> {
  const results: TranslationBatchResult[] = [];

  for (const item of items) {
    try {
      results.push({
        id: item.id,
        ok: true,
        translatedText: await translateText(item.text, targetLanguage),
        errorMessage: null,
      });
    } catch (error) {
      results.push({
        id: item.id,
        ok: false,
        translatedText: null,
        errorMessage:
          error instanceof Error && error.message.trim()
            ? error.message
            : "Translation failed.",
      });
    }
  }

  return results;
}
