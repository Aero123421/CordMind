import { Guild } from "discord.js";

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

export const buildImpact = async (guild: Guild, action: string, params: Record<string, unknown>): Promise<Impact> => {
  const impact: Impact = {};

  const channelId = params.channel_id as string | undefined;
  const channelName = params.channel_name as string | undefined;
  const roleId = extractRoleId(params.role_id) ?? (params.role_id as string | undefined);
  const roleName = params.role_name as string | undefined;
  const userId = extractUserId(params.user_id) ?? extractUserId(params.user_mention) ?? (params.user_id as string | undefined);

  if (["delete_channel", "rename_channel", "update_permission_overwrites"].includes(action)) {
    const channel = await resolveChannel(guild, channelId, channelName);
    const formatted = formatChannel(channel?.name ?? null, channel?.id ?? channelId);
    if (formatted) impact.channels = [formatted];
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
