import type { Client, Guild, User } from "discord.js";

export type ToolContext = {
  client: Client;
  guild: Guild;
  actor: User;
  lang: string | null | undefined;
};

export type ToolResult = {
  ok: boolean;
  message: string;
  discordIds?: string[];
  data?: unknown;
};

export type ToolHandler = (context: ToolContext, params: Record<string, unknown>) => Promise<ToolResult>;

export type ToolRisk = "read" | "low" | "high" | "destructive";

export type ToolMeta = {
  risk: ToolRisk;
  requiredBotPerms?: string[];
  requiredUserPerms?: string[];
};
