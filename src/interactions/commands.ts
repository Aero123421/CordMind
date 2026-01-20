import { SlashCommandBuilder } from "discord.js";
import { PROVIDERS } from "../constants.js";

export const buildCommands = () => {
  const providerChoices = PROVIDERS.map((provider) => ({ name: provider, value: provider }));

  const command = new SlashCommandBuilder()
    .setName("discordaimanage")
    .setDescription("Configure Discord AI Manager")
    .addSubcommand((sub) => sub.setName("setup").setDescription("Show setup steps"))
    .addSubcommand((sub) =>
      sub
        .setName("provider")
        .setDescription("Set LLM provider")
        .addStringOption((opt) =>
          opt.setName("name").setDescription("Provider name").setRequired(true).addChoices(...providerChoices)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("api")
        .setDescription("Set, reset, or clear API key")
        .addBooleanOption((opt) =>
          opt.setName("clear").setDescription("Clear API key for current provider").setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("model")
        .setDescription("Set model name")
        .addStringOption((opt) =>
          opt.setName("name").setDescription("Model name").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("role")
        .setDescription("Set manager role (optional)")
        .addRoleOption((opt) =>
          opt.setName("role").setDescription("Manager role (omit to clear)").setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("log")
        .setDescription("Set audit log channel (optional)")
        .addChannelOption((opt) =>
          opt.setName("channel").setDescription("Log channel (omit to disable)").setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("thread")
        .setDescription("Set thread archive minutes")
        .addIntegerOption((opt) =>
          opt
            .setName("minutes")
            .setDescription("Archive minutes (60/1440/4320/10080)")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("rate")
        .setDescription("Set rate limit per minute")
        .addIntegerOption((opt) =>
          opt
            .setName("limit")
            .setDescription("Operations per minute")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) => sub.setName("show").setDescription("Show current settings"));

  return [command.toJSON()];
};
