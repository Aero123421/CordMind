import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ChatInputCommandInteraction,
  ModalBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle
} from "discord.js";
import {
  clearProviderCredentials,
  getGuildSettings,
  hasProviderCredentials,
  setProviderCredentials,
  updateGuildSettings
} from "../settings.js";
import { PROVIDERS, ProviderName } from "../constants.js";
import { createAuditEvent } from "../audit.js";
import { sendAuditLog } from "../auditLog.js";
import { getProviderModels } from "../llm/modelCatalog.js";

const API_MODAL_ID = "modal:api";
const API_INPUT_ID = "modal:api:key";
const MODEL_MODAL_ID = "modal:model";
const MODEL_INPUT_ID = "modal:model:name";
const RATE_MODAL_ID = "modal:rate";
const RATE_INPUT_ID = "modal:rate:value";

const t = (lang: string | null | undefined, en: string, ja: string) => (lang === "ja" ? ja : en);

const buildLanguageRow = (scope: "setup" | "setting", current?: string | null) => {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`${scope}:language`)
    .setPlaceholder("Select language / 言語を選択")
    .addOptions(
      { label: "English", value: "en", default: current === "en" },
      { label: "日本語", value: "ja", default: current === "ja" }
    );
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
};

const buildProviderRow = (scope: "setup" | "setting", current?: string | null) => {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`${scope}:provider`)
    .setPlaceholder("Select provider")
    .addOptions(
      PROVIDERS.map((provider) => ({
        label: provider,
        value: provider,
        default: current === provider
      }))
    );
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
};

const buildModelRow = async (
  guildId: string,
  scope: "setup" | "setting",
  provider: ProviderName,
  current?: string | null
) => {
  const models = await getProviderModels(guildId, provider);
  const ordered = [...models];
  if (current && !ordered.includes(current)) {
    ordered.unshift(current);
  }
  const trimmed = ordered.filter((model) => model.length > 0 && model.length <= 100);
  const limited = trimmed.slice(0, 24);
  const options = limited.map((model) => ({
    label: model,
    value: model,
    default: current === model
  }));

  options.push({ label: "Custom model…", value: "custom", default: false });

  const select = new StringSelectMenuBuilder()
    .setCustomId(`${scope}:model`)
    .setPlaceholder("Select model")
    .addOptions(options);
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
};

const buildSettingsMenu = (lang: string | null | undefined) => {
  const select = new StringSelectMenuBuilder()
    .setCustomId("setting:menu")
    .setPlaceholder(t(lang, "What do you want to change?", "何を変更しますか？"))
    .addOptions(
      { label: t(lang, "Language", "言語"), value: "language" },
      { label: t(lang, "Provider", "プロバイダー"), value: "provider" },
      { label: t(lang, "API Key", "APIキー"), value: "api_key" },
      { label: t(lang, "Model", "モデル"), value: "model" },
      { label: t(lang, "Log Channel", "ログチャンネル"), value: "log_channel" },
      { label: t(lang, "Manager Role", "管理ロール"), value: "manager_role" },
      { label: t(lang, "Thread Archive", "スレッド自動アーカイブ"), value: "thread_archive" },
      { label: t(lang, "Rate Limit", "レート制限"), value: "rate_limit" },
      { label: t(lang, "Show Current Settings", "現在の設定を表示"), value: "show" }
    );
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
};

const buildBackRow = (lang: string | null | undefined) => {
  const back = new ButtonBuilder()
    .setCustomId("setting:back")
    .setLabel(t(lang, "Back to menu", "メニューに戻る"))
    .setStyle(ButtonStyle.Secondary);
  return new ActionRowBuilder<ButtonBuilder>().addComponents(back);
};

const buildApiKeyRow = (scope: "setup" | "setting", lang: string | null | undefined) => {
  const setButton = new ButtonBuilder()
    .setCustomId(`${scope}:apikey:set`)
    .setLabel(t(lang, "Set / Reset API Key", "APIキーを設定/再設定"))
    .setStyle(ButtonStyle.Primary);

  const clearButton = new ButtonBuilder()
    .setCustomId(`${scope}:apikey:clear`)
    .setLabel(t(lang, "Clear API Key", "APIキーを削除"))
    .setStyle(ButtonStyle.Secondary);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(setButton, clearButton);
};

const buildThreadArchiveRow = (lang: string | null | undefined, current?: number | null) => {
  const select = new StringSelectMenuBuilder()
    .setCustomId("setting:thread")
    .setPlaceholder(t(lang, "Select archive minutes", "アーカイブ時間を選択"))
    .addOptions(
      { label: "60", value: "60", default: current === 60 },
      { label: "1440", value: "1440", default: current === 1440 },
      { label: "4320", value: "4320", default: current === 4320 },
      { label: "10080", value: "10080", default: current === 10080 }
    );
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
};

const buildSummary = async (guildId: string, lang: string | null | undefined) => {
  const settings = await getGuildSettings(guildId);
  const hasKey = await hasProviderCredentials(guildId, settings.provider as ProviderName);
  return [
    t(lang, "Current settings", "現在の設定"),
    `• ${t(lang, "Language", "言語")}: ${settings.language}`,
    `• ${t(lang, "Provider", "プロバイダー")}: ${settings.provider}`,
    `• ${t(lang, "Model", "モデル")}: ${settings.model ?? t(lang, "(not set)", "(未設定)")}`,
    `• ${t(lang, "API key", "APIキー")}: ${hasKey ? t(lang, "set", "設定済み") : t(lang, "not set", "未設定")}`,
    `• ${t(lang, "Manager role", "管理ロール")}: ${settings.manager_role_id ?? t(lang, "(none)", "(なし)")}`,
    `• ${t(lang, "Log channel", "ログチャンネル")}: ${settings.log_channel_id ?? t(lang, "(none)", "(なし)")}`,
    `• ${t(lang, "Thread archive", "スレッドアーカイブ")}: ${settings.thread_archive_minutes}`,
    `• ${t(lang, "Rate limit", "レート制限")}: ${settings.rate_limit_per_min}/min`
  ].join("\n");
};

export const handleCommand = async (interaction: ChatInputCommandInteraction) => {
  if (!interaction.guildId) return;
  const subcommand = interaction.options.getSubcommand();
  const settings = await getGuildSettings(interaction.guildId);

  if (subcommand === "setup") {
    await interaction.reply({
      ephemeral: true,
      content: "Choose your language / 言語を選択してください (Step 1/3)",
      components: [buildLanguageRow("setup", settings.language)]
    });
    return;
  }

  if (subcommand === "setting") {
    const summary = await buildSummary(interaction.guildId, settings.language);
    await interaction.reply({
      ephemeral: true,
      content: summary,
      components: [buildSettingsMenu(settings.language)]
    });
  }
};

const showModelModal = async (interaction: import("discord.js").StringSelectMenuInteraction | import("discord.js").ButtonInteraction, lang: string | null | undefined) => {
  const modal = new ModalBuilder().setCustomId(MODEL_MODAL_ID).setTitle(t(lang, "Set model", "モデル設定"));
  const input = new TextInputBuilder()
    .setCustomId(MODEL_INPUT_ID)
    .setLabel(t(lang, "Model name", "モデル名"))
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  await interaction.showModal(modal);
};

const showRateModal = async (interaction: import("discord.js").StringSelectMenuInteraction | import("discord.js").ButtonInteraction, lang: string | null | undefined) => {
  const modal = new ModalBuilder().setCustomId(RATE_MODAL_ID).setTitle(t(lang, "Rate limit", "レート制限"));
  const input = new TextInputBuilder()
    .setCustomId(RATE_INPUT_ID)
    .setLabel(t(lang, "Operations per minute", "1分あたりの操作数"))
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  await interaction.showModal(modal);
};

const showApiModal = async (interaction: import("discord.js").ButtonInteraction, lang: string | null | undefined) => {
  const modal = new ModalBuilder().setCustomId(API_MODAL_ID).setTitle(t(lang, "Set API Key", "APIキー設定"));
  const input = new TextInputBuilder()
    .setCustomId(API_INPUT_ID)
    .setLabel(t(lang, "API Key", "APIキー"))
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  await interaction.showModal(modal);
};

export const handleComponent = async (interaction: import("discord.js").Interaction) => {
  if (!interaction.isRepliable() || !interaction.guildId) return;
  const settings = await getGuildSettings(interaction.guildId);
  const lang = settings.language;

  if (interaction.isStringSelectMenu()) {
    const [scope, action] = interaction.customId.split(":");
    const value = interaction.values[0];

    if (scope === "setup" && action === "language") {
      await updateGuildSettings(interaction.guildId, { language: value });
      await interaction.update({
        content: t(value, "Step 2/3: Choose your provider", "ステップ2/3: プロバイダーを選択してください"),
        components: [buildProviderRow("setup", settings.provider)]
      });
      return;
    }

    if (scope === "setup" && action === "provider") {
      const provider = value as ProviderName;
      await updateGuildSettings(interaction.guildId, { provider });
      const hasKey = await hasProviderCredentials(interaction.guildId, provider);
      const nextText = t(lang, "Step 3/3: Set API key and choose model", "ステップ3/3: APIキーとモデルを設定してください");
      const apiStatus = hasKey ? t(lang, "API key set", "APIキー設定済み") : t(lang, "API key not set", "APIキー未設定");
      const modelRow = await buildModelRow(interaction.guildId, "setup", provider, settings.model);
      await interaction.update({
        content: `${nextText}\n${apiStatus}`,
        components: [buildApiKeyRow("setup", lang), modelRow]
      });
      return;
    }

    if (scope === "setup" && action === "model") {
      if (value === "custom") {
        await showModelModal(interaction, lang);
        return;
      }
      await updateGuildSettings(interaction.guildId, { model: value });
      await interaction.update({
        content: t(lang, "Setup complete. Use /discordaimanage setting to adjust anytime.", "セットアップ完了。いつでも /discordaimanage setting から変更できます。"),
        components: []
      });
      return;
    }

    if (scope === "setting" && action === "menu") {
      switch (value) {
        case "language":
          await interaction.update({
            content: t(lang, "Choose language", "言語を選択してください"),
            components: [buildLanguageRow("setting", lang), buildBackRow(lang)]
          });
          return;
        case "provider":
          await interaction.update({
            content: t(lang, "Choose provider", "プロバイダーを選択してください"),
            components: [buildProviderRow("setting", settings.provider), buildBackRow(lang)]
          });
          return;
        case "api_key":
          await interaction.update({
            content: t(lang, "Manage API Key", "APIキーを管理"),
            components: [buildApiKeyRow("setting", lang), buildBackRow(lang)]
          });
          return;
        case "model":
          const modelRow = await buildModelRow(interaction.guildId, "setting", settings.provider as ProviderName, settings.model);
          await interaction.update({
            content: t(lang, "Choose model", "モデルを選択してください"),
            components: [modelRow, buildBackRow(lang)]
          });
          return;
        case "log_channel":
          await interaction.update({
            content: t(lang, "Select log channel", "ログチャンネルを選択"),
            components: [
              new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
                new ChannelSelectMenuBuilder()
                  .setCustomId("setting:log")
                  .setPlaceholder(t(lang, "Select channel", "チャンネルを選択"))
                  .setChannelTypes(ChannelType.GuildText)
              ),
              buildBackRow(lang)
            ]
          });
          return;
        case "manager_role":
          await interaction.update({
            content: t(lang, "Select manager role", "管理ロールを選択"),
            components: [
              new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
                new RoleSelectMenuBuilder()
                  .setCustomId("setting:role")
                  .setPlaceholder(t(lang, "Select role", "ロールを選択"))
              ),
              buildBackRow(lang)
            ]
          });
          return;
        case "thread_archive":
          await interaction.update({
            content: t(lang, "Select thread archive minutes", "スレッドのアーカイブ時間を選択"),
            components: [buildThreadArchiveRow(lang, settings.thread_archive_minutes), buildBackRow(lang)]
          });
          return;
        case "rate_limit":
          await showRateModal(interaction, lang);
          return;
        case "show": {
          const summary = await buildSummary(interaction.guildId, lang);
          await interaction.update({
            content: summary,
            components: [buildSettingsMenu(lang)]
          });
          return;
        }
      }
    }

    if (scope === "setting" && action === "language") {
      await updateGuildSettings(interaction.guildId, { language: value });
      const summary = await buildSummary(interaction.guildId, value);
      await interaction.update({
        content: summary,
        components: [buildSettingsMenu(value)]
      });
      return;
    }

    if (scope === "setting" && action === "provider") {
      await updateGuildSettings(interaction.guildId, { provider: value });
      const summary = await buildSummary(interaction.guildId, lang);
      await interaction.update({
        content: summary,
        components: [buildSettingsMenu(lang)]
      });
      return;
    }

    if (scope === "setting" && action === "model") {
      if (value === "custom") {
        await showModelModal(interaction, lang);
        return;
      }
      await updateGuildSettings(interaction.guildId, { model: value });
      const summary = await buildSummary(interaction.guildId, lang);
      await interaction.update({
        content: summary,
        components: [buildSettingsMenu(lang)]
      });
      return;
    }

    if (scope === "setting" && action === "thread") {
      const minutes = Number(value);
      await updateGuildSettings(interaction.guildId, { thread_archive_minutes: minutes });
      const summary = await buildSummary(interaction.guildId, lang);
      await interaction.update({
        content: summary,
        components: [buildSettingsMenu(lang)]
      });
      return;
    }
  }

  if (interaction.isButton()) {
    const [scope, action, subAction] = interaction.customId.split(":");

    if (interaction.customId === "setting:back") {
      const summary = await buildSummary(interaction.guildId, lang);
      await interaction.update({
        content: summary,
        components: [buildSettingsMenu(lang)]
      });
      return;
    }

    if (action === "apikey" && subAction === "set") {
      await showApiModal(interaction, lang);
      return;
    }

    if (action === "apikey" && subAction === "clear") {
      await clearProviderCredentials(interaction.guildId, settings.provider as ProviderName);
      await createAuditEvent({
        action: "api_key_cleared",
        actor_user_id: interaction.user.id,
        guild_id: interaction.guildId,
        target_id: null,
        payload: {
          request: { action: "api_key_cleared", params: { provider: settings.provider } },
          impact: {}
        },
        confirmation_required: false,
        confirmation_status: "none",
        status: "success",
        error_message: null
      });

      if (settings.log_channel_id && interaction.guild) {
        await sendAuditLog(interaction.guild, settings.log_channel_id, {
          action: "api_key_cleared",
          actorTag: interaction.user.tag,
          status: "success",
          confirmation: "none",
          message: `API key cleared for provider ${settings.provider}.`
        });
      }

      if (scope === "setup") {
        const modelRow = await buildModelRow(interaction.guildId, "setup", settings.provider as ProviderName, settings.model);
        await interaction.update({
          content: t(lang, "Step 3/3: Set API key and choose model", "ステップ3/3: APIキーとモデルを設定してください"),
          components: [buildApiKeyRow("setup", lang), modelRow]
        });
      } else {
        const summary = await buildSummary(interaction.guildId, lang);
        await interaction.update({
          content: summary,
          components: [buildSettingsMenu(lang)]
        });
      }
      return;
    }
  }

  if (interaction.isChannelSelectMenu()) {
    if (interaction.customId === "setting:log") {
      const channelId = interaction.values[0];
      await updateGuildSettings(interaction.guildId, { log_channel_id: channelId ?? null });
      const summary = await buildSummary(interaction.guildId, lang);
      await interaction.update({
        content: summary,
        components: [buildSettingsMenu(lang)]
      });
      return;
    }
  }

  if (interaction.isRoleSelectMenu()) {
    if (interaction.customId === "setting:role") {
      const roleId = interaction.values[0];
      await updateGuildSettings(interaction.guildId, { manager_role_id: roleId ?? null });
      const summary = await buildSummary(interaction.guildId, lang);
      await interaction.update({
        content: summary,
        components: [buildSettingsMenu(lang)]
      });
      return;
    }
  }
};

export const handleModal = async (interaction: import("discord.js").ModalSubmitInteraction) => {
  if (!interaction.guildId) return;
  const settings = await getGuildSettings(interaction.guildId);
  const lang = settings.language;

  if (interaction.customId === API_MODAL_ID) {
    const apiKey = interaction.fields.getTextInputValue(API_INPUT_ID).trim();
    const provider = settings.provider as ProviderName;
    await setProviderCredentials(interaction.guildId, provider, apiKey);
    await createAuditEvent({
      action: "api_key_set",
      actor_user_id: interaction.user.id,
      guild_id: interaction.guildId,
      target_id: null,
      payload: {
        request: { action: "api_key_set", params: { provider } },
        impact: {}
      },
      confirmation_required: false,
      confirmation_status: "none",
      status: "success",
      error_message: null
    });

    if (settings.log_channel_id && interaction.guild) {
      await sendAuditLog(interaction.guild, settings.log_channel_id, {
        action: "api_key_set",
        actorTag: interaction.user.tag,
        status: "success",
        confirmation: "none",
        message: `API key saved for provider ${provider}.`
      });
    }

    const summary = await buildSummary(interaction.guildId, lang);
    const modelRow = await buildModelRow(interaction.guildId, "setting", provider, settings.model);
    await interaction.reply({
      ephemeral: true,
      content: t(lang, "API key saved.", "APIキーを保存しました。"),
      components: [modelRow]
    });
    await interaction.followUp({
      ephemeral: true,
      content: summary,
      components: [buildSettingsMenu(lang)]
    });
    return;
  }

  if (interaction.customId === MODEL_MODAL_ID) {
    const model = interaction.fields.getTextInputValue(MODEL_INPUT_ID).trim();
    await updateGuildSettings(interaction.guildId, { model });
    const summary = await buildSummary(interaction.guildId, lang);
    await interaction.reply({
      ephemeral: true,
      content: t(lang, `Model set to ${model}.`, `モデルを ${model} に設定しました。`),
      components: [buildSettingsMenu(lang)]
    });
    return;
  }

  if (interaction.customId === RATE_MODAL_ID) {
    const raw = interaction.fields.getTextInputValue(RATE_INPUT_ID).trim();
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
      await interaction.reply({
        ephemeral: true,
        content: t(lang, "Please enter a valid number.", "有効な数値を入力してください。")
      });
      return;
    }
    await updateGuildSettings(interaction.guildId, { rate_limit_per_min: value });
    const summary = await buildSummary(interaction.guildId, lang);
    await interaction.reply({
      ephemeral: true,
      content: summary,
      components: [buildSettingsMenu(lang)]
    });
  }
};
