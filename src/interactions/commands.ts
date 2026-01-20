import { SlashCommandBuilder } from "discord.js";

export const buildCommands = () => {
  const command = new SlashCommandBuilder()
    .setName("discordaimanage")
    .setDescription("Configure Discord AI Manager")
    .addSubcommand((sub) => sub.setName("setup").setDescription("Interactive first-time setup"))
    .addSubcommand((sub) => sub.setName("setting").setDescription("Interactive settings menu"));

  return [command.toJSON()];
};
