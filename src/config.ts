import dotenv from "dotenv";
import {
  DEFAULT_BASE_URLS,
  DEFAULT_AUDIT_RETENTION_DAYS,
  DEFAULT_MODEL_LISTS,
  ProviderName
} from "./constants.js";

dotenv.config();

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
};

const optional = (name: string): string | undefined => {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
};

const parseList = (value?: string): string[] => {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

const parseBaseUrl = (provider: ProviderName, envName: string): string => {
  return optional(envName) ?? DEFAULT_BASE_URLS[provider];
};

const withDefaultModels = (provider: ProviderName, envName: string): string[] => {
  const fromEnv = parseList(optional(envName));
  return fromEnv.length > 0 ? fromEnv : DEFAULT_MODEL_LISTS[provider];
};

const parseNumber = (value?: string, fallback?: number): number => {
  if (!value) return fallback ?? 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback ?? 0;
};

const encryptionKeyBase64 = required("DISCORDAI_ENCRYPTION_KEY");

export const config = {
  discordToken: required("DISCORD_TOKEN"),
  discordClientId: required("DISCORD_CLIENT_ID"),
  discordGuildId: optional("DISCORD_GUILD_ID"),
  databaseUrl: required("DATABASE_URL"),
  encryptionKeyBase64,
  defaultProvider: (optional("DEFAULT_PROVIDER") as ProviderName) ?? "gemini",
  defaultModel: optional("DEFAULT_MODEL"),
  providerBaseUrls: {
    gemini: parseBaseUrl("gemini", "GEMINI_BASE_URL"),
    xai: parseBaseUrl("xai", "XAI_BASE_URL"),
    groq: parseBaseUrl("groq", "GROQ_BASE_URL"),
    cerebras: parseBaseUrl("cerebras", "CEREBRAS_BASE_URL"),
    zai: parseBaseUrl("zai", "ZAI_BASE_URL")
  },
  providerModelLists: {
    gemini: withDefaultModels("gemini", "GEMINI_MODELS"),
    xai: withDefaultModels("xai", "XAI_MODELS"),
    groq: withDefaultModels("groq", "GROQ_MODELS"),
    cerebras: withDefaultModels("cerebras", "CEREBRAS_MODELS"),
    zai: withDefaultModels("zai", "ZAI_MODELS")
  },
  auditRetentionDays: parseNumber(optional("AUDIT_RETENTION_DAYS"), DEFAULT_AUDIT_RETENTION_DAYS)
};
