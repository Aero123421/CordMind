import type { Client, Guild, User } from "discord.js";

export type ToolContext = {
  client: Client;
  guild: Guild;
  actor: User;
};

export type ToolResult = {
  ok: boolean;
  message: string;
  discordIds?: string[];
};

export type ToolHandler = (context: ToolContext, params: Record<string, unknown>) => Promise<ToolResult>;
