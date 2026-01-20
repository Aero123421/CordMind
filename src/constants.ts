export const PROVIDERS = ["gemini", "xai", "groq", "cerebras", "zai"] as const;
export type ProviderName = (typeof PROVIDERS)[number];

export const DEFAULT_BASE_URLS: Record<ProviderName, string> = {
  gemini: "https://generativelanguage.googleapis.com/v1beta",
  xai: "https://api.x.ai/v1",
  groq: "https://api.groq.com/openai/v1",
  cerebras: "https://api.cerebras.ai/v1",
  zai: "https://api.z.ai/v1"
};

export const DEFAULT_THREAD_ARCHIVE_MINUTES = 4320;
export const DEFAULT_RATE_LIMIT_PER_MIN = 10;
export const DESTRUCTIVE_LIMIT_PER_MIN = 2;
export const DEFAULT_AUDIT_RETENTION_DAYS = 7;

export const ALLOWED_ACTIONS = new Set([
  "none",
  "list_channels",
  "get_channel_details",
  "create_channel",
  "rename_channel",
  "delete_channel",
  "create_thread",
  "pin_message",
  "list_roles",
  "get_role_details",
  "create_role",
  "delete_role",
  "assign_role",
  "remove_role",
  "update_permission_overwrites",
  "get_guild_permissions",
  "get_bot_permissions"
]);

export const DESTRUCTIVE_ACTIONS = new Set([
  "delete_channel",
  "delete_role",
  "update_permission_overwrites",
  "remove_role",
  "rename_channel"
]);

export const BANNED_ACTIONS = new Set([
  "delete_guild",
  "ban_member",
  "kick_member",
  "timeout_member"
]);
