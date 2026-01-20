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
export const DESTRUCTIVE_LIMIT_PER_MIN = 3;
export const DEFAULT_AUDIT_RETENTION_DAYS = 7;
export const MAX_ACTIONS_PER_REQUEST = 12;

export const DEFAULT_MODEL_LISTS: Record<ProviderName, string[]> = {
  gemini: [
    "gemini-3-pro-preview",
    "gemini-3-flash-preview",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite"
  ],
  xai: [
    "grok-4-0709",
    "grok-4",
    "grok-4-latest",
    "grok-4-1-fast-reasoning",
    "grok-4-1-fast-non-reasoning",
    "grok-4-fast-reasoning",
    "grok-4-fast-non-reasoning",
    "grok-code-fast-1",
    "grok-3",
    "grok-3-mini"
  ],
  groq: [
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "openai/gpt-oss-safeguard-20b",
    "meta-llama/llama-4-maverick-17b-128e-instruct",
    "meta-llama/llama-4-scout-17b-16e-instruct",
    "moonshotai/kimi-k2-instruct-0905",
    "qwen/qwen3-32b",
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant"
  ],
  cerebras: [
    "llama3.1-8b",
    "llama-3.3-70b",
    "gpt-oss-120b",
    "qwen-3-32b",
    "qwen-3-235b-a22b-instruct-2507",
    "zai-glm-4.7"
  ],
  zai: [
    "glm-4.7",
    "glm-4.6",
    "glm-4.5",
    "glm-4.5-air",
    "glm-4.5-x",
    "glm-4.5-airx",
    "glm-4.5-flash",
    "glm-4-32b-0414-128k"
  ]
};

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
  "get_bot_permissions",
  "find_members",
  "get_member_details",
  "kick_member",
  "ban_member",
  "timeout_member",
  "untimeout_member"
]);

export const DESTRUCTIVE_ACTIONS = new Set([
  "delete_channel",
  "delete_role",
  "update_permission_overwrites",
  "remove_role",
  "kick_member",
  "ban_member",
  "timeout_member",
  "untimeout_member"
]);

export const BANNED_ACTIONS = new Set([
  "delete_guild"
]);
