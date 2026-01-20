import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  REST,
  Routes
} from "discord.js";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { buildCommands } from "./interactions/commands.js";
import { handleCommand, handleComponent, handleModal } from "./interactions/handlers.js";
import { handleThreadMessage, handleConfirmation } from "./conversation/handler.js";
import { getGuildSettings } from "./settings.js";
import { isAuthorized } from "./permissions.js";
import { upsertThreadState } from "./conversation/threadState.js";
import { cleanupAuditEvents } from "./audit.js";
import { sendAuditLog } from "./auditLog.js";
import { t } from "./i18n.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

const registerCommands = async () => {
  const rest = new REST({ version: "10" }).setToken(config.discordToken);
  const body = buildCommands();
  if (config.discordGuildId) {
    await rest.put(Routes.applicationGuildCommands(config.discordClientId, config.discordGuildId), { body });
    logger.info("Registered guild commands");
  } else {
    await rest.put(Routes.applicationCommands(config.discordClientId), { body });
    logger.info("Registered global commands");
  }
};

client.once(Events.ClientReady, async () => {
  logger.info(`Logged in as ${client.user?.tag}`);
  try {
    await registerCommands();
  } catch (error) {
    logger.error({ error }, "Failed to register commands");
  }

  try {
    const result = await cleanupAuditEvents(config.auditRetentionDays);
    logger.info({ deleted: result.count }, "Audit log cleanup complete");
    setInterval(async () => {
      const cleanupResult = await cleanupAuditEvents(config.auditRetentionDays);
      logger.info({ deleted: cleanupResult.count }, "Audit log cleanup complete");
    }, 24 * 60 * 60 * 1000);
  } catch (error) {
    logger.error({ error }, "Audit log cleanup failed");
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleCommand(interaction);
      return;
    }

    if (interaction.isModalSubmit()) {
      await handleModal(interaction);
      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId.startsWith("confirm:") || interaction.customId.startsWith("reject:")) {
        await handleConfirmation(interaction);
        return;
      }
      await handleComponent(interaction);
      return;
    }

    if (interaction.isStringSelectMenu() || interaction.isChannelSelectMenu() || interaction.isRoleSelectMenu()) {
      await handleComponent(interaction);
      return;
    }
  } catch (error) {
    logger.error({ error }, "Interaction handling failed");
    if (interaction.isRepliable()) {
      let lang: string | null | undefined = "en";
      try {
        if (interaction.guildId) {
          lang = (await getGuildSettings(interaction.guildId)).language;
        }
      } catch {
        // ignore
      }
      await interaction.reply({ ephemeral: true, content: t(lang, "An error occurred.", "エラーが発生しました。") });
    }
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (!message.inGuild()) return;
  if (message.author.bot) return;

  if (message.channel.isThread()) {
    await handleThreadMessage(message);
    return;
  }

  const botId = client.user?.id;
  if (!botId) return;
  if (!message.mentions.has(botId)) return;

  const member = await message.guild.members.fetch(message.author.id);
  const settings = await getGuildSettings(message.guild.id);
  if (!isAuthorized(member, settings.manager_role_id)) {
    await message.reply(t(settings.language, "Not authorized to use this bot.", "このBotを使用する権限がありません。"));
    return;
  }

  try {
    const cleaned = message.content.replace(new RegExp(`<@!?${botId}>`, "g"), "").trim();
    const date = new Date();
    const topic = cleaned.length > 0 ? cleaned.replace(/\s+/g, " ").slice(0, 30) : "request";
    const threadName = `discord-ai | ${message.author.username} | ${topic} | ${date.toISOString().slice(0, 10)}`.slice(0, 100);
    const thread = await message.startThread({
      name: threadName,
      autoArchiveDuration: settings.thread_archive_minutes
    });

    await upsertThreadState({
      threadId: thread.id,
      guildId: message.guild.id,
      ownerUserId: message.author.id,
      summary: cleaned.length > 0 ? cleaned : null
    });

    await thread.send(t(settings.language, "Thread created. You can continue here without mentioning me.", "スレッドを作成しました。このスレッド内ではメンション不要で続けられます。"));
  } catch (error) {
    logger.error({ error }, "Failed to create thread");
    await message.reply(t(settings.language, "Failed to create a thread. Please check permissions.", "スレッドの作成に失敗しました。Botの権限を確認してください。"));
    if (settings.log_channel_id) {
      await sendAuditLog(message.guild, settings.log_channel_id, {
        action: "thread_create_failed",
        actorTag: message.author.tag,
        status: "failure",
        confirmation: "none",
        message: "Thread creation failed."
      });
    }
  }
});

client.login(config.discordToken).catch((error) => {
  logger.error({ error }, "Failed to login");
  process.exit(1);
});
