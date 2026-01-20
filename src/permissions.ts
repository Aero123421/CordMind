import { GuildMember, PermissionsBitField } from "discord.js";

export const isAdmin = (member: GuildMember): boolean => {
  return member.permissions.has(PermissionsBitField.Flags.Administrator);
};

export const hasManagerRole = (member: GuildMember, roleId?: string | null): boolean => {
  if (!roleId) return false;
  return member.roles.cache.has(roleId);
};

export const isAuthorized = (member: GuildMember, managerRoleId?: string | null): boolean => {
  return isAdmin(member) || hasManagerRole(member, managerRoleId);
};
