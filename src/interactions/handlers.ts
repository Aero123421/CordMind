import {
  ChatInputCommandInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder
} from "discord.js";
import { config } from "../config.js";
import { getGuildSettings, updateGuildSettings, setProviderCredentials, hasProviderCredentials } from "../settings.js";
import { ProviderName } from "../constants.js";

const API_MODAL_ID = "discordai-api-modal";
const API_INPUT_ID = "discordai-api-input";

export const getApiModalId = () => API_MODAL_ID;

export const handleCommand = async (interaction: ChatInputCommandInteraction) => {
  if (!interaction.guildId) return;
  const subcommand = interaction.options.getSubcommand();
  const settings = await getGuildSettings(interaction.guildId);

  if (subcommand === "setup") {
    const hasKey = await hasProviderCredentials(interaction.guildId, settings.provider as ProviderName);
    const model = settings.model ?? "(not set)";
    const provider = settings.provider;
    const apiStatus = hasKey ? "set" : "not set";
    await interaction.reply({
      ephemeral: true,
      content: [
        "Setup steps:",
        `1) Provider: /discordaimanage provider (current: ${provider})`,
        `2) API key: /discordaimanage api (current: ${apiStatus})`,
        `3) Model: /discordaimanage model (current: ${model})`
      ].join("\n")
    });
    return;
  }

  if (subcommand === "provider") {
    const provider = interaction.options.getString("name", true) as ProviderName;
    await updateGuildSettings(interaction.guildId, { provider });
    const hasKey = await hasProviderCredentials(interaction.guildId, provider);
    const note = hasKey ? "API key already set. You can proceed to /discordaimanage model." : "API key not set. Run /discordaimanage api.";
    await interaction.reply({ ephemeral: true, content: `Provider set to ${provider}. ${note}` });
    return;
  }

  if (subcommand === "api") {
    const modal = new ModalBuilder().setCustomId(API_MODAL_ID).setTitle("Set API Key");
    const input = new TextInputBuilder()
      .setCustomId(API_INPUT_ID)
      .setLabel("API Key")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);
    modal.addComponents(row);
    await interaction.showModal(modal);
    return;
  }

  if (subcommand === "model") {
    const model = interaction.options.getString("name", true);
    await updateGuildSettings(interaction.guildId, { model });
    await interaction.reply({ ephemeral: true, content: `Model set to ${model}.` });
    return;
  }

  if (subcommand === "role") {
    const role = interaction.options.getRole("role");
    await updateGuildSettings(interaction.guildId, { manager_role_id: role?.id ?? null });
    await interaction.reply({ ephemeral: true, content: role ? `Manager role set to ${role.name}.` : "Manager role cleared." });
    return;
  }

  if (subcommand === "log") {
    const channel = interaction.options.getChannel("channel");
    await updateGuildSettings(interaction.guildId, { log_channel_id: channel?.id ?? null });
    await interaction.reply({ ephemeral: true, content: channel ? `Log channel set to ${channel.name}.` : "Log channel disabled." });
    return;
  }

  if (subcommand === "thread") {
    const minutes = interaction.options.getInteger("minutes", true);
    await updateGuildSettings(interaction.guildId, { thread_archive_minutes: minutes });
    await interaction.reply({ ephemeral: true, content: `Thread archive minutes set to ${minutes}.` });
    return;
  }

  if (subcommand === "show") {
    const hasKey = await hasProviderCredentials(interaction.guildId, settings.provider as ProviderName);
    await interaction.reply({
      ephemeral: true,
      content: [
        `Provider: ${settings.provider}`,
        `Model: ${settings.model ?? "(not set)"}`,
        `API key: ${hasKey ? "set" : "not set"}`,
        `Manager role: ${settings.manager_role_id ?? "(none)"}`,
        `Log channel: ${settings.log_channel_id ?? "(none)"}`,
        `Thread archive minutes: ${settings.thread_archive_minutes}`,
        `Rate limit per min: ${settings.rate_limit_per_min}`
      ].join("\n")
    });
    return;
  }
};

export const handleApiModal = async (interaction: import("discord.js").ModalSubmitInteraction) => {
  if (!interaction.guildId) return;
  const apiKey = interaction.fields.getTextInputValue(API_INPUT_ID).trim();
  const settings = await getGuildSettings(interaction.guildId);
  const provider = settings.provider as ProviderName;
  await setProviderCredentials(interaction.guildId, provider, apiKey);
  await interaction.reply({ ephemeral: true, content: `API key saved for provider ${provider}.` });
};
