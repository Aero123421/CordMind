import {
  ChannelType,
  Guild,
  PermissionsBitField,
  Role,
  type GuildChannelTypes,
  type ColorResolvable
} from "discord.js";
import type { ToolContext, ToolHandler, ToolResult } from "./types.js";

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

const resolveMember = async (guild: Guild, id?: string) => {
  if (!id) return null;
  return guild.members.fetch(id);
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

export const listChannels: ToolHandler = async (context) => {
  const channels = await context.guild.channels.fetch();
  const list = channels
    .filter((channel) => channel?.isTextBased())
    .map((channel) => `#${channel?.name} (${channel?.id})`)
    .slice(0, 20)
    .join("\n");
  return ok(list.length > 0 ? list : "No channels found.");
};

export const getChannelDetails: ToolHandler = async (context, params) => {
  const channel = await resolveChannel(
    context.guild,
    params.channel_id as string | undefined,
    params.channel_name as string | undefined
  );
  if (!channel) return fail("Channel not found.");
  return ok(`Channel ${channel.name} (${channel.id}) type=${channel.type}`);
};

export const createChannel: ToolHandler = async (context, params) => {
  const name = params.name as string | undefined;
  if (!name) return fail("Missing channel name.");

  const channel = await context.guild.channels.create({
    name,
    type: mapChannelType(params.type as string | undefined) as GuildChannelTypes,
    parent: params.parent_id as string | undefined,
    topic: params.topic as string | undefined
  });

  return ok(`Channel created: ${channel.name}`, [channel.id]);
};

export const createThread: ToolHandler = async (context, params) => {
  const channel = await resolveChannel(
    context.guild,
    params.channel_id as string | undefined,
    params.channel_name as string | undefined
  );
  if (!channel || !channel.isTextBased()) return fail("Channel not found or not text-based.");

  const name = (params.name as string | undefined) ?? `thread-${Date.now()}`;
  const autoArchiveDuration = params.auto_archive_minutes as number | undefined;
  const messageId = params.message_id as string | undefined;

  if ("threads" in channel) {
    if (messageId && "messages" in channel) {
      const message = await channel.messages.fetch(messageId);
      const thread = await message.startThread({ name, autoArchiveDuration });
      return ok(`Thread created: ${thread.name}.`, [thread.id]);
    }
    const thread = await channel.threads.create({ name, autoArchiveDuration });
    return ok(`Thread created: ${thread.name}.`, [thread.id]);
  }

  return fail("Channel does not support threads.");
};

export const pinMessage: ToolHandler = async (context, params) => {
  const messageId = params.message_id as string | undefined;
  if (!messageId) return fail("Missing message_id.");

  const channel = await resolveChannel(
    context.guild,
    params.channel_id as string | undefined,
    params.channel_name as string | undefined
  );
  if (!channel || !channel.isTextBased() || !("messages" in channel)) {
    return fail("Channel not found or not text-based.");
  }

  const message = await channel.messages.fetch(messageId);
  await message.pin();
  return ok("Message pinned.", [message.id]);
};

export const renameChannel: ToolHandler = async (context, params) => {
  const channel = await resolveChannel(
    context.guild,
    params.channel_id as string | undefined,
    params.channel_name as string | undefined
  );
  if (!channel) return fail("Channel not found.");
  const newName = params.new_name as string | undefined;
  if (!newName) return fail("Missing new_name.");
  await channel.setName(newName);
  return ok(`Channel renamed to ${newName}.`, [channel.id]);
};

export const deleteChannel: ToolHandler = async (context, params) => {
  const channel = await resolveChannel(
    context.guild,
    params.channel_id as string | undefined,
    params.channel_name as string | undefined
  );
  if (!channel) return fail("Channel not found.");
  await channel.delete();
  return ok(`Channel deleted: ${channel.name}.`);
};

export const listRoles: ToolHandler = async (context) => {
  const roles = await context.guild.roles.fetch();
  const list = roles
    .map((role) => `${role.name} (${role.id})`)
    .slice(0, 20)
    .join("\n");
  return ok(list.length > 0 ? list : "No roles found.");
};

export const getRoleDetails: ToolHandler = async (context, params) => {
  const role = await resolveRole(
    context.guild,
    params.role_id as string | undefined,
    params.role_name as string | undefined
  );
  if (!role) return fail("Role not found.");
  return ok(`Role ${role.name} (${role.id}) color=${role.color}`);
};

export const createRole: ToolHandler = async (context, params) => {
  const name = params.name as string | undefined;
  if (!name) return fail("Missing role name.");
  const role = await context.guild.roles.create({
    name,
    color: (params.color as ColorResolvable | undefined) ?? undefined,
    hoist: params.hoist as boolean | undefined,
    mentionable: params.mentionable as boolean | undefined
  });
  return ok(`Role created: ${role.name}.`, [role.id]);
};

export const deleteRole: ToolHandler = async (context, params) => {
  const role = await resolveRole(
    context.guild,
    params.role_id as string | undefined,
    params.role_name as string | undefined
  );
  if (!role) return fail("Role not found.");
  await role.delete();
  return ok(`Role deleted: ${role.name}.`);
};

export const assignRole: ToolHandler = async (context, params) => {
  const member = await resolveMember(context.guild, params.user_id as string | undefined);
  if (!member) return fail("Member not found. Provide user_id.");
  const role = await resolveRole(
    context.guild,
    params.role_id as string | undefined,
    params.role_name as string | undefined
  );
  if (!role) return fail("Role not found.");
  await member.roles.add(role);
  return ok(`Role ${role.name} assigned to ${member.user.tag}.`);
};

export const removeRole: ToolHandler = async (context, params) => {
  const member = await resolveMember(context.guild, params.user_id as string | undefined);
  if (!member) return fail("Member not found. Provide user_id.");
  const role = await resolveRole(
    context.guild,
    params.role_id as string | undefined,
    params.role_name as string | undefined
  );
  if (!role) return fail("Role not found.");
  await member.roles.remove(role);
  return ok(`Role ${role.name} removed from ${member.user.tag}.`);
};

export const updatePermissionOverwrites: ToolHandler = async (context, params) => {
  const channel = await resolveChannel(
    context.guild,
    params.channel_id as string | undefined,
    params.channel_name as string | undefined
  );
  if (!channel || !("permissionOverwrites" in channel)) {
    return fail("Channel not found or not editable.");
  }

  const targetRole = params.role_id
    ? await resolveRole(context.guild, params.role_id as string, undefined)
    : null;
  const targetUser = params.user_id ? await resolveMember(context.guild, params.user_id as string) : null;

  const target = targetRole ?? targetUser;
  if (!target) return fail("Missing target role_id or user_id.");

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

  return ok(`Permissions updated for ${targetRole ? targetRole.name : targetUser?.user.tag}.`);
};

export const getGuildPermissions: ToolHandler = async (context) => {
  const member = await context.guild.members.fetch(context.actor.id);
  const perms = member.permissions.toArray().join(", ");
  return ok(`Your permissions: ${perms}`);
};

export const getBotPermissions: ToolHandler = async (context) => {
  const botMember = await context.guild.members.fetch(context.client.user?.id ?? "");
  const perms = botMember.permissions.toArray().join(", ");
  return ok(`Bot permissions: ${perms}`);
};
