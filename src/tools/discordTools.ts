import {
  ChannelType,
  Guild,
  GuildMember,
  PermissionsBitField,
  Role,
  type GuildChannelTypes,
  type ColorResolvable
} from "discord.js";
import type { ToolContext, ToolHandler, ToolResult } from "./types.js";
import { t } from "../i18n.js";

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
  if (id) {
    return guild.channels.fetch(id);
  }
  if (name) {
    const channels = await guild.channels.fetch();
    return channels.find((channel) => channel?.name === name) ?? null;
  }
  return null;
};

const resolveRole = async (guild: Guild, id?: string, name?: string): Promise<Role | null> => {
  if (id) {
    return guild.roles.fetch(id);
  }
  if (name) {
    const roles = await guild.roles.fetch();
    return roles.find((role) => role.name === name) ?? null;
  }
  return null;
};

const resolveMemberById = async (guild: Guild, id?: string): Promise<GuildMember | null> => {
  if (!id) return null;
  try {
    return await guild.members.fetch(id);
  } catch {
    return null;
  }
};

const resolveMemberFromParams = async (
  guild: Guild,
  params: Record<string, unknown>,
  lang: string | null | undefined
): Promise<
  | { ok: true; member: GuildMember }
  | { ok: false; message: string }
> => {
  const explicitId =
    extractUserId(params.user_id) ??
    extractUserId(params.user_mention) ??
    extractUserId(params.member_id) ??
    (typeof params.user_id === "string" && /^\d+$/.test(params.user_id) ? params.user_id : null);

  if (explicitId) {
    const member = await resolveMemberById(guild, explicitId);
    if (!member) return { ok: false, message: t(lang, "Member not found.", "メンバーが見つかりませんでした。") };
    return { ok: true, member };
  }

  const query =
    (typeof params.query === "string" ? params.query : null) ??
    (typeof params.user_name === "string" ? params.user_name : null) ??
    (typeof params.user_tag === "string" ? params.user_tag : null);

  if (!query || query.trim().length === 0) {
    return { ok: false, message: t(lang, "Missing user_id/user_mention or query.", "user_id / user_mention または query が必要です。") };
  }

  const limit = Math.min(10, Math.max(1, parseNumber(params.limit, 5)));
  const results = await guild.members.search({ query: query.trim(), limit });
  const members = Array.from(results.values());

  if (members.length === 0) {
    return { ok: false, message: t(lang, "No members found for that query.", "その条件でメンバーが見つかりませんでした。") };
  }

  if (members.length === 1) {
    return { ok: true, member: members[0] };
  }

  const candidates = members
    .slice(0, 10)
    .map((m) => `${m.user.tag} (${m.id})${m.nickname ? ` nickname=${m.nickname}` : ""}`)
    .join("\n");
  return { ok: false, message: t(lang, `Multiple members matched. Provide user_id or mention:\n${candidates}`, `候補が複数あります。user_id かメンションで指定してください:\n${candidates}`) };
};

const mapChannelType = (value?: string): ChannelType => {
  switch ((value ?? "text").toLowerCase()) {
    case "voice":
      return ChannelType.GuildVoice;
    case "category":
      return ChannelType.GuildCategory;
    case "forum":
      return ChannelType.GuildForum;
    default:
      return ChannelType.GuildText;
  }
};

const ok = (message: string, ids?: string[]): ToolResult => ({ ok: true, message, discordIds: ids });
const fail = (message: string): ToolResult => ({ ok: false, message });

const parseNumber = (value: unknown, fallback: number): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const channelTypeLabel = (type: ChannelType): string => {
  switch (type) {
    case ChannelType.GuildText:
      return "text";
    case ChannelType.GuildVoice:
      return "voice";
    case ChannelType.GuildCategory:
      return "category";
    case ChannelType.GuildForum:
      return "forum";
    default:
      return String(type);
  }
};

const matchesType = (type: ChannelType, filter: string): boolean => {
  const normalized = filter.toLowerCase();
  if (normalized === "any") return true;
  if (normalized === "text") return type === ChannelType.GuildText;
  if (normalized === "voice") return type === ChannelType.GuildVoice;
  if (normalized === "category") return type === ChannelType.GuildCategory;
  if (normalized === "forum") return type === ChannelType.GuildForum;
  return true;
};

export const listChannels: ToolHandler = async (context, params) => {
  const typeFilter = (params.type as string | undefined) ?? "any";
  const nameContains = (params.name_contains as string | undefined)?.toLowerCase() ?? "";
  const limit = Math.min(50, Math.max(1, Math.floor(parseNumber(params.limit, 20))));

  const channels = await context.guild.channels.fetch();
  const list = channels
    .filter((channel) => Boolean(channel))
    .filter((channel) => matchesType(channel!.type, typeFilter))
    .filter((channel) => (nameContains ? channel!.name.toLowerCase().includes(nameContains) : true))
    .map((channel) => {
      const typeLabel = channelTypeLabel(channel!.type);
      const parentId = "parentId" in channel! && typeof channel!.parentId === "string" ? channel!.parentId : null;
      const userLimit = "userLimit" in channel! && typeof (channel as unknown as { userLimit?: unknown }).userLimit === "number"
        ? (channel as unknown as { userLimit: number }).userLimit
        : null;
      const extra = [
        `type=${typeLabel}`,
        parentId ? `parent_id=${parentId}` : null,
        userLimit !== null ? `user_limit=${userLimit}` : null
      ].filter(Boolean).join(" ");
      return `#${channel?.name} (${channel?.id}) ${extra}`;
    })
    .slice(0, limit)
    .join("\n");
  return ok(list.length > 0 ? list : t(context.lang, "No channels found.", "チャンネルが見つかりませんでした。"));
};

export const getChannelDetails: ToolHandler = async (context, params) => {
  const channel = await resolveChannel(
    context.guild,
    params.channel_id as string | undefined,
    params.channel_name as string | undefined
  );
  if (!channel) return fail(t(context.lang, "Channel not found.", "チャンネルが見つかりませんでした。"));
  return ok(
    t(
      context.lang,
      `Channel ${channel.name} (${channel.id}) type=${channel.type}`,
      `チャンネル ${channel.name} (${channel.id}) type=${channel.type}`
    )
  );
};

export const createChannel: ToolHandler = async (context, params) => {
  const typeValue = mapChannelType(params.type as string | undefined);
  const nameParam = params.name as string | undefined;
  const defaultName = typeValue === ChannelType.GuildVoice ? "voice-room" : "text-channel";
  const name = nameParam && nameParam.trim().length > 0 ? nameParam.trim() : defaultName;
  const userLimitRaw = params.user_limit as number | string | undefined;
  const userLimitNum = typeof userLimitRaw === "string" ? Number(userLimitRaw) : userLimitRaw;
  const userLimit =
    typeof userLimitNum === "number" && Number.isFinite(userLimitNum) && userLimitNum >= 0
      ? Math.min(Math.floor(userLimitNum), 99)
      : undefined;

  const channel = await context.guild.channels.create({
    name,
    type: typeValue as GuildChannelTypes,
    parent: params.parent_id as string | undefined,
    topic: params.topic as string | undefined,
    ...(typeValue === ChannelType.GuildVoice && userLimit !== undefined ? { userLimit } : {})
  });

  const limitText = typeValue === ChannelType.GuildVoice && userLimit !== undefined ? ` user limit=${userLimit}` : "";
  return ok(
    t(context.lang, `Channel created: ${channel.name}${limitText}`, `チャンネルを作成しました: ${channel.name}${limitText}`),
    [channel.id]
  );
};

export const createThread: ToolHandler = async (context, params) => {
  const channel = await resolveChannel(
    context.guild,
    params.channel_id as string | undefined,
    params.channel_name as string | undefined
  );
  if (!channel || !channel.isTextBased()) {
    return fail(t(context.lang, "Channel not found or not text-based.", "チャンネルが見つからないか、テキストチャンネルではありません。"));
  }

  const name = (params.name as string | undefined) ?? `thread-${Date.now()}`;
  const autoArchiveDuration = params.auto_archive_minutes as number | undefined;
  const messageId = params.message_id as string | undefined;

  if ("threads" in channel) {
    if (messageId && "messages" in channel) {
      const message = await channel.messages.fetch(messageId);
      const thread = await message.startThread({ name, autoArchiveDuration });
      return ok(t(context.lang, `Thread created: ${thread.name}.`, `スレッドを作成しました: ${thread.name}`), [thread.id]);
    }
    const thread = await channel.threads.create({ name, autoArchiveDuration });
    return ok(t(context.lang, `Thread created: ${thread.name}.`, `スレッドを作成しました: ${thread.name}`), [thread.id]);
  }

  return fail(t(context.lang, "Channel does not support threads.", "このチャンネルはスレッドに対応していません。"));
};

export const pinMessage: ToolHandler = async (context, params) => {
  const messageId = params.message_id as string | undefined;
  if (!messageId) return fail(t(context.lang, "Missing message_id.", "message_id が必要です。"));

  const channel = await resolveChannel(
    context.guild,
    params.channel_id as string | undefined,
    params.channel_name as string | undefined
  );
  if (!channel || !channel.isTextBased() || !("messages" in channel)) {
    return fail(t(context.lang, "Channel not found or not text-based.", "チャンネルが見つからないか、テキストチャンネルではありません。"));
  }

  const message = await channel.messages.fetch(messageId);
  await message.pin();
  return ok(t(context.lang, "Message pinned.", "メッセージをピン留めしました。"), [message.id]);
};

export const renameChannel: ToolHandler = async (context, params) => {
  const channel = await resolveChannel(
    context.guild,
    params.channel_id as string | undefined,
    params.channel_name as string | undefined
  );
  if (!channel) return fail(t(context.lang, "Channel not found.", "チャンネルが見つかりませんでした。"));
  const newName = params.new_name as string | undefined;
  if (!newName) return fail(t(context.lang, "Missing new_name.", "new_name が必要です。"));
  await channel.setName(newName);
  return ok(t(context.lang, `Channel renamed to ${newName}.`, `チャンネル名を ${newName} に変更しました。`), [channel.id]);
};

export const deleteChannel: ToolHandler = async (context, params) => {
  const channel = await resolveChannel(
    context.guild,
    params.channel_id as string | undefined,
    params.channel_name as string | undefined
  );
  if (!channel) return fail(t(context.lang, "Channel not found.", "チャンネルが見つかりませんでした。"));
  await channel.delete();
  return ok(t(context.lang, `Channel deleted: ${channel.name}.`, `チャンネルを削除しました: ${channel.name}`));
};

export const listRoles: ToolHandler = async (context) => {
  const roles = await context.guild.roles.fetch();
  const list = roles
    .map((role) => `${role.name} (${role.id})`)
    .slice(0, 20)
    .join("\n");
  return ok(list.length > 0 ? list : t(context.lang, "No roles found.", "ロールが見つかりませんでした。"));
};

export const getRoleDetails: ToolHandler = async (context, params) => {
  const role = await resolveRole(
    context.guild,
    params.role_id as string | undefined,
    params.role_name as string | undefined
  );
  if (!role) return fail(t(context.lang, "Role not found.", "ロールが見つかりませんでした。"));
  return ok(t(context.lang, `Role ${role.name} (${role.id}) color=${role.color}`, `ロール ${role.name} (${role.id}) color=${role.color}`));
};

export const createRole: ToolHandler = async (context, params) => {
  const name = params.name as string | undefined;
  if (!name) return fail(t(context.lang, "Missing role name.", "ロール名が必要です。"));
  const role = await context.guild.roles.create({
    name,
    color: (params.color as ColorResolvable | undefined) ?? undefined,
    hoist: params.hoist as boolean | undefined,
    mentionable: params.mentionable as boolean | undefined
  });
  return ok(t(context.lang, `Role created: ${role.name}.`, `ロールを作成しました: ${role.name}`), [role.id]);
};

export const deleteRole: ToolHandler = async (context, params) => {
  const role = await resolveRole(
    context.guild,
    (extractRoleId(params.role_id) ?? (params.role_id as string | undefined)) as string | undefined,
    params.role_name as string | undefined
  );
  if (!role) return fail(t(context.lang, "Role not found.", "ロールが見つかりませんでした。"));
  await role.delete();
  return ok(t(context.lang, `Role deleted: ${role.name}.`, `ロールを削除しました: ${role.name}`));
};

export const assignRole: ToolHandler = async (context, params) => {
  const resolvedMember = await resolveMemberFromParams(context.guild, params, context.lang);
  if (!resolvedMember.ok) return fail(resolvedMember.message);
  const member = resolvedMember.member;
  const role = await resolveRole(
    context.guild,
    (extractRoleId(params.role_id) ?? (params.role_id as string | undefined)) as string | undefined,
    params.role_name as string | undefined
  );
  if (!role) return fail(t(context.lang, "Role not found.", "ロールが見つかりませんでした。"));
  await member.roles.add(role);
  return ok(t(context.lang, `Role ${role.name} assigned to ${member.user.tag}.`, `${member.user.tag} にロール ${role.name} を付与しました。`));
};

export const removeRole: ToolHandler = async (context, params) => {
  const resolvedMember = await resolveMemberFromParams(context.guild, params, context.lang);
  if (!resolvedMember.ok) return fail(resolvedMember.message);
  const member = resolvedMember.member;
  const role = await resolveRole(
    context.guild,
    (extractRoleId(params.role_id) ?? (params.role_id as string | undefined)) as string | undefined,
    params.role_name as string | undefined
  );
  if (!role) return fail(t(context.lang, "Role not found.", "ロールが見つかりませんでした。"));
  await member.roles.remove(role);
  return ok(t(context.lang, `Role ${role.name} removed from ${member.user.tag}.`, `${member.user.tag} からロール ${role.name} を剥奪しました。`));
};

export const updatePermissionOverwrites: ToolHandler = async (context, params) => {
  const channel = await resolveChannel(
    context.guild,
    params.channel_id as string | undefined,
    params.channel_name as string | undefined
  );
  if (!channel || !("permissionOverwrites" in channel)) {
    return fail(t(context.lang, "Channel not found or not editable.", "チャンネルが見つからないか、権限の編集ができません。"));
  }

  const targetRole = await resolveRole(
    context.guild,
    extractRoleId(params.role_id) ?? (params.role_id as string | undefined),
    params.role_name as string | undefined
  );
  const targetUserId = extractUserId(params.user_id) ?? extractUserId(params.user_mention) ?? (params.user_id as string | undefined);
  const targetUser = targetUserId ? await resolveMemberById(context.guild, targetUserId) : null;

  const target = targetRole ?? targetUser;
  if (!target) return fail(t(context.lang, "Missing target role_id/role_name or user_id/user_mention.", "対象の role_id/role_name または user_id/user_mention が必要です。"));

  const allow = Array.isArray(params.allow) ? (params.allow as string[]) : [];
  const deny = Array.isArray(params.deny) ? (params.deny as string[]) : [];
  const overwrites: Record<string, boolean | null> = {};
  allow.forEach((perm) => {
    overwrites[perm] = true;
  });
  deny.forEach((perm) => {
    overwrites[perm] = false;
  });

  await channel.permissionOverwrites.edit(target, overwrites);

  return ok(
    t(
      context.lang,
      `Permissions updated for ${targetRole ? targetRole.name : targetUser?.user.tag}.`,
      `権限を更新しました: ${targetRole ? targetRole.name : targetUser?.user.tag}`
    )
  );
};

export const getGuildPermissions: ToolHandler = async (context) => {
  const member = await context.guild.members.fetch(context.actor.id);
  const perms = member.permissions.toArray().join(", ");
  return ok(t(context.lang, `Your permissions: ${perms}`, `あなたの権限: ${perms}`));
};

export const getBotPermissions: ToolHandler = async (context) => {
  const botMember = await context.guild.members.fetch(context.client.user?.id ?? "");
  const perms = botMember.permissions.toArray().join(", ");
  return ok(t(context.lang, `Bot permissions: ${perms}`, `Bot の権限: ${perms}`));
};

export const findMembers: ToolHandler = async (context, params) => {
  const query =
    (typeof params.query === "string" ? params.query : null) ??
    (typeof params.user_name === "string" ? params.user_name : null) ??
    (typeof params.user_tag === "string" ? params.user_tag : null);
  if (!query || query.trim().length === 0) return fail(t(context.lang, "Missing query.", "query が必要です。"));

  const limit = Math.min(10, Math.max(1, parseNumber(params.limit, 5)));
  const results = await context.guild.members.search({ query: query.trim(), limit });
  const members = Array.from(results.values());
  if (members.length === 0) return ok(t(context.lang, "No members found.", "メンバーが見つかりませんでした。"));

  const list = members
    .slice(0, limit)
    .map((m) => `${m.user.tag} (${m.id})${m.nickname ? ` nickname=${m.nickname}` : ""}`)
    .join("\n");
  return ok(list, members.map((m) => m.id));
};

export const getMemberDetails: ToolHandler = async (context, params) => {
  const resolved = await resolveMemberFromParams(context.guild, params, context.lang);
  if (!resolved.ok) return fail(resolved.message);

  const member = resolved.member;
  const roles = member.roles.cache
    .filter((role) => role.id !== context.guild.id)
    .map((role) => `${role.name} (${role.id})`)
    .slice(0, 20);

  return ok(
    [
      t(context.lang, `Member: ${member.user.tag} (${member.id})`, `メンバー: ${member.user.tag} (${member.id})`),
      member.nickname ? t(context.lang, `Nickname: ${member.nickname}`, `ニックネーム: ${member.nickname}`) : null,
      t(context.lang, `Roles: ${roles.length > 0 ? roles.join(", ") : "(none)"}`, `ロール: ${roles.length > 0 ? roles.join(", ") : "(なし)"}`),
      member.joinedAt ? t(context.lang, `Joined: ${member.joinedAt.toISOString()}`, `参加日時: ${member.joinedAt.toISOString()}`) : null
    ].filter(Boolean).join("\n"),
    [member.id]
  );
};

const ensureNotSelfOrBot = (context: ToolContext, targetId: string): string | null => {
  const botId = context.client.user?.id ?? "";
  if (targetId === context.actor.id) return t(context.lang, "Refusing to target yourself.", "自分自身は対象にできません。");
  if (botId && targetId === botId) return t(context.lang, "Refusing to target the bot.", "Bot 自身は対象にできません。");
  return null;
};

export const kickMember: ToolHandler = async (context, params) => {
  const resolved = await resolveMemberFromParams(context.guild, params, context.lang);
  if (!resolved.ok) return fail(resolved.message);
  const member = resolved.member;

  const forbidden = ensureNotSelfOrBot(context, member.id);
  if (forbidden) return fail(forbidden);

  const reason = typeof params.reason === "string" ? params.reason : undefined;
  await member.kick(reason);
  return ok(t(context.lang, `Kicked ${member.user.tag}.`, `${member.user.tag} をキックしました。`), [member.id]);
};

export const banMember: ToolHandler = async (context, params) => {
  const resolved = await resolveMemberFromParams(context.guild, params, context.lang);
  if (!resolved.ok) return fail(resolved.message);
  const member = resolved.member;

  const forbidden = ensureNotSelfOrBot(context, member.id);
  if (forbidden) return fail(forbidden);

  const reason = typeof params.reason === "string" ? params.reason : undefined;
  const deleteMessageSeconds = parseNumber(params.delete_message_seconds, 0);
  await member.ban({ reason, deleteMessageSeconds: deleteMessageSeconds > 0 ? deleteMessageSeconds : undefined });
  return ok(t(context.lang, `Banned ${member.user.tag}.`, `${member.user.tag} をBANしました。`), [member.id]);
};

export const timeoutMember: ToolHandler = async (context, params) => {
  const resolved = await resolveMemberFromParams(context.guild, params, context.lang);
  if (!resolved.ok) return fail(resolved.message);
  const member = resolved.member;

  const forbidden = ensureNotSelfOrBot(context, member.id);
  if (forbidden) return fail(forbidden);

  const minutes = parseNumber(params.duration_minutes ?? params.minutes, 10);
  const clampedMinutes = Math.min(Math.max(1, Math.floor(minutes)), 60 * 24 * 28);
  const reason = typeof params.reason === "string" ? params.reason : undefined;
  await member.timeout(clampedMinutes * 60_000, reason);
  return ok(
    t(
      context.lang,
      `Timed out ${member.user.tag} for ${clampedMinutes} minutes.`,
      `${member.user.tag} を ${clampedMinutes} 分タイムアウトしました。`
    ),
    [member.id]
  );
};

export const untimeoutMember: ToolHandler = async (context, params) => {
  const resolved = await resolveMemberFromParams(context.guild, params, context.lang);
  if (!resolved.ok) return fail(resolved.message);
  const member = resolved.member;

  const forbidden = ensureNotSelfOrBot(context, member.id);
  if (forbidden) return fail(forbidden);

  const reason = typeof params.reason === "string" ? params.reason : undefined;
  await member.timeout(null, reason);
  return ok(t(context.lang, `Timeout cleared for ${member.user.tag}.`, `${member.user.tag} のタイムアウトを解除しました。`), [member.id]);
};
