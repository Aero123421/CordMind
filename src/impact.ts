import { Guild, type AnyThreadChannel } from "discord.js";

export type Impact = {
  channels?: string[];
  roles?: string[];
  members?: string[];
  permissions?: string[];
};

const formatChannel = (name: string | null | undefined, id?: string | null) => {
  if (name && id) return `#${name} (${id})`;
  if (name) return `#${name}`;
  if (id) return `#unknown (${id})`;
  return undefined;
};

const formatRole = (name: string | null | undefined, id?: string | null) => {
  if (name && id) return `${name} (${id})`;
  if (name) return name;
  if (id) return `unknown-role (${id})`;
  return undefined;
};

const formatMember = (tag: string | null | undefined, id?: string | null) => {
  if (tag && id) return `${tag} (${id})`;
  if (tag) return tag;
  if (id) return `unknown-member (${id})`;
  return undefined;
};

const extractId = (value: unknown, pattern: RegExp): string | null => {
  if (typeof value !== "string") return null;
  const match = value.match(pattern);
  if (match?.[1]) return match[1];
  if (/^\d+$/.test(value)) return value;
  return null;
};

const extractUserId = (value: unknown): string | null => extractId(value, /<@!?(\d+)>/);
const extractRoleId = (value: unknown): string | null => extractId(value, /<@&(\d+)>/);
const extractChannelId = (value: unknown): string | null => extractId(value, /<#(\d+)>/);

const parseNumber = (value: unknown, fallback: number): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const resolveChannel = async (guild: Guild, id?: string, name?: string) => {
  if (id) return guild.channels.fetch(id);
  if (name) {
    const channels = await guild.channels.fetch();
    return channels.find((channel) => channel?.name === name) ?? null;
  }
  return null;
};

const resolveRole = async (guild: Guild, id?: string, name?: string) => {
  if (id) return guild.roles.fetch(id);
  if (name) {
    const roles = await guild.roles.fetch();
    return roles.find((role) => role.name === name) ?? null;
  }
  return null;
};

const resolveMember = async (guild: Guild, id?: string) => {
  if (!id) return null;
  return guild.members.fetch(id);
};

const resolveThreadById = async (guild: Guild, rawId?: unknown): Promise<AnyThreadChannel | null> => {
  const id =
    extractChannelId(rawId) ??
    (typeof rawId === "string" && /^\d+$/.test(rawId) ? rawId : null);
  if (!id) return null;

  const channel = await guild.client.channels.fetch(id).catch(() => null);
  if (!channel || !("isThread" in channel) || !channel.isThread()) return null;
  if (channel.guildId !== guild.id) return null;
  return channel;
};

const resolveActiveThreads = async (guild: Guild) => {
  const fetched = await guild.channels.fetchActiveThreads();
  return Array.from(fetched.threads.values());
};

export const buildImpact = async (guild: Guild, action: string, params: Record<string, unknown>): Promise<Impact> => {
  const impact: Impact = {};

  const channelId = params.channel_id as string | undefined;
  const channelName = params.channel_name as string | undefined;
  const threadId =
    extractChannelId(params.thread_id) ??
    extractChannelId(params.thread_mention) ??
    extractChannelId(params.id) ??
    (params.thread_id as string | undefined) ??
    (params.id as string | undefined);
  const threadName = params.thread_name as string | undefined;
  const excludeThreadId = typeof params.exclude_thread_id === "string" ? params.exclude_thread_id : null;
  const roleId = extractRoleId(params.role_id) ?? (params.role_id as string | undefined);
  const roleName = params.role_name as string | undefined;
  const userId = extractUserId(params.user_id) ?? extractUserId(params.user_mention) ?? (params.user_id as string | undefined);

  if (["delete_channel", "rename_channel", "update_permission_overwrites", "move_channel"].includes(action)) {
    const channel = await resolveChannel(guild, channelId, channelName);
    const formatted = formatChannel(channel?.name ?? null, channel?.id ?? channelId);
    if (formatted) impact.channels = [formatted];
  }

  if (action === "delete_thread") {
    const thread = await resolveThreadById(guild, threadId);
    const formatted = formatChannel(thread?.name ?? threadName ?? null, thread?.id ?? (typeof threadId === "string" ? threadId : undefined));
    if (formatted) impact.channels = [formatted];
  }

  if (action === "delete_threads") {
    const limit = Math.min(25, Math.max(1, parseNumber(params.limit, 10)));
    const nameContains = typeof params.name_contains === "string" ? params.name_contains.trim().toLowerCase() : null;
    const prefix = typeof params.prefix === "string" ? params.prefix.trim().toLowerCase() : null;
    const olderThanMinutes = parseNumber(params.older_than_minutes, 0);

    const idsParam = Array.isArray(params.thread_ids) ? params.thread_ids : Array.isArray(params.ids) ? params.ids : null;
    const threads: AnyThreadChannel[] = [];

    if (idsParam) {
      const ids = idsParam
        .filter((value): value is string => typeof value === "string")
        .map((value) => extractChannelId(value) ?? value)
        .filter((value): value is string => typeof value === "string" && /^\d+$/.test(value));

      for (const id of ids) {
        const thread = await resolveThreadById(guild, id);
        if (thread) threads.push(thread);
        if (threads.length >= limit) break;
      }
    } else {
      const active = await resolveActiveThreads(guild);
      const filtered = active
        .filter((thread) => (nameContains ? thread.name.toLowerCase().includes(nameContains) : true))
        .filter((thread) => (prefix ? thread.name.toLowerCase().startsWith(prefix) : true))
        .filter((thread) => (olderThanMinutes > 0 ? (Date.now() - (thread.createdTimestamp ?? Date.now())) / 60_000 >= olderThanMinutes : true))
        .sort((a, b) => (b.createdTimestamp ?? 0) - (a.createdTimestamp ?? 0))
        .slice(0, limit);
      threads.push(...filtered);
    }

    const final = excludeThreadId ? threads.filter((thread) => thread.id !== excludeThreadId) : threads;
    const formatted = final
      .map((thread) => formatChannel(thread.name, thread.id))
      .filter((item): item is string => Boolean(item));
    if (formatted.length > 0) impact.channels = formatted;
  }

  if (["delete_role", "assign_role", "remove_role"].includes(action)) {
    const role = await resolveRole(guild, roleId, roleName);
    const formatted = formatRole(role?.name ?? null, role?.id ?? roleId);
    if (formatted) impact.roles = [formatted];
  }

  if (["assign_role", "remove_role", "kick_member", "ban_member", "timeout_member", "untimeout_member"].includes(action)) {
    const member = await resolveMember(guild, userId);
    const formatted = formatMember(member?.user.tag ?? null, member?.id ?? userId);
    if (formatted) impact.members = [formatted];
  }

  if (action === "rename_channel") {
    const newName = params.new_name as string | undefined;
    if (newName) {
      impact.channels = impact.channels ?? [];
      impact.channels.push(`rename-to: #${newName}`);
    }
  }

  if (action === "move_channel") {
    const parentId =
      extractChannelId(params.parent_id) ??
      extractChannelId(params.category_id) ??
      (params.parent_id as string | undefined) ??
      (params.category_id as string | undefined);
    const parentName = (params.parent_name as string | undefined) ?? (params.category_name as string | undefined);
    const parent = await resolveChannel(guild, parentId, parentName);
    const label = parent
      ? formatChannel(parent.name, parent.id)
      : parentName
        ? `#${parentName}`
        : parentId
          ? `#unknown (${parentId})`
          : "(no category)";
    impact.channels = impact.channels ?? [];
    impact.channels.push(`move-to: ${label}`);
  }

  if (action === "update_permission_overwrites") {
    const allow = Array.isArray(params.allow) ? (params.allow as string[]) : [];
    const deny = Array.isArray(params.deny) ? (params.deny as string[]) : [];
    const perms = [
      ...allow.map((perm) => `allow:${perm}`),
      ...deny.map((perm) => `deny:${perm}`)
    ];
    if (perms.length > 0) impact.permissions = perms;

    const role = await resolveRole(guild, roleId, roleName);
    const member = await resolveMember(guild, userId);
    const target = role
      ? formatRole(role.name, role.id)
      : member
        ? formatMember(member.user.tag, member.id)
        : undefined;
    if (target) impact.roles = role ? [target] : impact.roles;
    if (target) impact.members = member ? [target] : impact.members;
  }

  return impact;
};

export const formatImpact = (impact: Impact, lang?: string | null): string => {
  const lines: string[] = [];
  if (impact.channels && impact.channels.length > 0) {
    lines.push(`${lang === "ja" ? "チャンネル" : "channels"}: ${impact.channels.join(", ")}`);
  }
  if (impact.roles && impact.roles.length > 0) {
    lines.push(`${lang === "ja" ? "ロール" : "roles"}: ${impact.roles.join(", ")}`);
  }
  if (impact.members && impact.members.length > 0) {
    lines.push(`${lang === "ja" ? "メンバー" : "members"}: ${impact.members.join(", ")}`);
  }
  if (impact.permissions && impact.permissions.length > 0) {
    lines.push(`${lang === "ja" ? "権限" : "permissions"}: ${impact.permissions.join(", ")}`);
  }

  return lines.length > 0 ? lines.join("\n") : lang === "ja" ? "(影響範囲なし)" : "(no impact details)";
};
