import { db } from "./db.js";
import { config } from "./config.js";
import { decrypt, encrypt } from "./encryption.js";
import { DEFAULT_THREAD_ARCHIVE_MINUTES, DEFAULT_RATE_LIMIT_PER_MIN, ProviderName } from "./constants.js";

export type GuildSettings = Awaited<ReturnType<typeof getGuildSettings>>;

export const getGuildSettings = async (guildId: string) => {
  const existing = await db.guildSettings.findUnique({ where: { guild_id: guildId } });
  if (existing) return existing;

  return db.guildSettings.create({
    data: {
      guild_id: guildId,
      provider: config.defaultProvider,
      model: config.defaultModel,
      language: "en",
      confirmation_mode: "confirm",
      log_channel_id: null,
      manager_role_id: null,
      thread_policy: "auto-create",
      thread_archive_minutes: DEFAULT_THREAD_ARCHIVE_MINUTES,
      rate_limit_per_min: DEFAULT_RATE_LIMIT_PER_MIN
    }
  });
};

export const updateGuildSettings = async (guildId: string, data: Partial<Parameters<typeof db.guildSettings.update>[0]["data"]>) => {
  return db.guildSettings.update({
    where: { guild_id: guildId },
    data
  });
};

export const getProviderCredentials = async (guildId: string, provider: ProviderName) => {
  return db.providerCredentials.findUnique({
    where: { guild_id_provider: { guild_id: guildId, provider } }
  });
};

export const hasProviderCredentials = async (guildId: string, provider: ProviderName): Promise<boolean> => {
  const creds = await getProviderCredentials(guildId, provider);
  return Boolean(creds?.encrypted_api_key);
};

export const setProviderCredentials = async (guildId: string, provider: ProviderName, apiKey: string) => {
  const encrypted = encrypt(apiKey);
  return db.providerCredentials.upsert({
    where: { guild_id_provider: { guild_id: guildId, provider } },
    create: {
      guild_id: guildId,
      provider,
      encrypted_api_key: encrypted,
      scope: "guild"
    },
    update: {
      encrypted_api_key: encrypted
    }
  });
};

export const clearProviderCredentials = async (guildId: string, provider: ProviderName) => {
  return db.providerCredentials.deleteMany({
    where: { guild_id: guildId, provider }
  });
};

export const getDecryptedApiKey = async (guildId: string, provider: ProviderName): Promise<string | null> => {
  const creds = await getProviderCredentials(guildId, provider);
  if (!creds) return null;
  return decrypt(creds.encrypted_api_key);
};
