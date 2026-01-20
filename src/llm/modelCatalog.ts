import { db } from "../db.js";
import { config } from "../config.js";
import { ProviderName } from "../constants.js";
import { getDecryptedApiKey } from "../settings.js";
import { logger } from "../logger.js";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 2500;

const toUniqueList = (items: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
};

const parseCachedModels = (modelsJson: unknown): string[] => {
  if (!Array.isArray(modelsJson)) return [];
  return toUniqueList(modelsJson.filter((item): item is string => typeof item === "string"));
};

const fetchWithTimeout = async (url: string, options: RequestInit = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const fetchOpenAICompatModels = async (provider: ProviderName, baseUrl: string, apiKey: string): Promise<string[]> => {
  const url = `${baseUrl.replace(/\/$/, "")}/models`;
  const response = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  if (!response.ok) {
    logger.warn({ provider, status: response.status }, "Model list fetch failed");
    return [];
  }
  const data = (await response.json()) as { data?: Array<{ id?: string }> };
  const models = (data.data ?? [])
    .map((item) => item.id)
    .filter((id): id is string => typeof id === "string");
  return toUniqueList(models);
};

const fetchGeminiModels = async (apiKey: string): Promise<string[]> => {
  const url = `${config.providerBaseUrls.gemini}/models?key=${encodeURIComponent(apiKey)}`;
  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    logger.warn({ provider: "gemini", status: response.status }, "Model list fetch failed");
    return [];
  }
  const data = (await response.json()) as {
    models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
  };
  const models = (data.models ?? [])
    .filter((model) => typeof model.name === "string")
    .filter((model) =>
      !model.supportedGenerationMethods || model.supportedGenerationMethods.includes("generateContent")
    )
    .map((model) => model.name!.replace(/^models\//, ""));
  return toUniqueList(models);
};

const fetchCerebrasPublicModels = async (): Promise<string[]> => {
  const response = await fetchWithTimeout("https://api.cerebras.ai/public/v1/models");
  if (!response.ok) {
    logger.warn({ provider: "cerebras", status: response.status }, "Public model list fetch failed");
    return [];
  }
  const data = (await response.json()) as { data?: Array<{ id?: string }> };
  const models = (data.data ?? [])
    .map((item) => item.id)
    .filter((id): id is string => typeof id === "string");
  return toUniqueList(models);
};

const fetchProviderModels = async (provider: ProviderName, apiKey?: string | null): Promise<string[]> => {
  switch (provider) {
    case "gemini":
      return apiKey ? fetchGeminiModels(apiKey) : [];
    case "cerebras":
      if (apiKey) {
        return fetchOpenAICompatModels(provider, config.providerBaseUrls.cerebras, apiKey);
      }
      return fetchCerebrasPublicModels();
    default:
      return apiKey ? fetchOpenAICompatModels(provider, config.providerBaseUrls[provider], apiKey) : [];
  }
};

export const getProviderModels = async (guildId: string, provider: ProviderName): Promise<string[]> => {
  const fallback = config.providerModelLists[provider] ?? [];
  const now = new Date();
  const cached = await db.providerModelCache.findUnique({
    where: { guild_id_provider: { guild_id: guildId, provider } }
  });

  const cachedModels = cached ? parseCachedModels(cached.models_json) : [];
  if (cached && cached.expires_at > now && cachedModels.length > 0) {
    return cachedModels;
  }

  const apiKey = await getDecryptedApiKey(guildId, provider);
  const fetched = await fetchProviderModels(provider, apiKey);
  if (fetched.length > 0) {
    const expiresAt = new Date(Date.now() + CACHE_TTL_MS);
    await db.providerModelCache.upsert({
      where: { guild_id_provider: { guild_id: guildId, provider } },
      update: { models_json: fetched, fetched_at: now, expires_at: expiresAt },
      create: {
        guild_id: guildId,
        provider,
        models_json: fetched,
        fetched_at: now,
        expires_at: expiresAt
      }
    });
    return fetched;
  }

  if (cachedModels.length > 0) {
    return cachedModels;
  }

  return fallback;
};
