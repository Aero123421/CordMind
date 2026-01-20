import type { ToolHandler } from "./types.js";
import {
  listChannels,
  getChannelDetails,
  createChannel,
  createThread,
  pinMessage,
  renameChannel,
  deleteChannel,
  listRoles,
  getRoleDetails,
  createRole,
  deleteRole,
  assignRole,
  removeRole,
  updatePermissionOverwrites,
  getGuildPermissions,
  getBotPermissions
} from "./discordTools.js";

export const toolRegistry: Record<string, ToolHandler> = {
  list_channels: listChannels,
  get_channel_details: getChannelDetails,
  create_channel: createChannel,
  create_thread: createThread,
  pin_message: pinMessage,
  rename_channel: renameChannel,
  delete_channel: deleteChannel,
  list_roles: listRoles,
  get_role_details: getRoleDetails,
  create_role: createRole,
  delete_role: deleteRole,
  assign_role: assignRole,
  remove_role: removeRole,
  update_permission_overwrites: updatePermissionOverwrites,
  get_guild_permissions: getGuildPermissions,
  get_bot_permissions: getBotPermissions
};
