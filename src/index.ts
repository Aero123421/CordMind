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
import { handleCommand, handleApiModal, getApiModalId } from "./interactions/handlers.js";
import { handleThreadMessage, handleConfirmation } from "./conversation/handler.js";
import { getGuildSettings } from "./settings.js";
import { isAuthorized } from "./permissions.js";
import { upsertThreadState } from "./conversation/threadState.js";
import { cleanupAuditEvents } from "./audit.js";

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

    if (interaction.isModalSubmit() && interaction.customId === getApiModalId()) {
      await handleApiModal(interaction);
      return;
    }

    if (interaction.isButton()) {
      await handleConfirmation(interaction);
    }
  } catch (error) {
    logger.error({ error }, "Interaction handling failed");
    if (interaction.isRepliable()) {
      await interaction.reply({ ephemeral: true, content: "An error occurred." });
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
    await message.reply("Not authorized to use this bot.");
    return;
  }

  try {
    const cleaned = message.content.replace(new RegExp(`<@!?${botId}>`, "g"), "").trim();
    const date = new Date();
    const threadName = `discord-ai | ${message.author.username} | ${date.toISOString().slice(0, 10)}`;
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

    await thread.send(
      "Thread created. You can continue here without mentioning me."
    );
  } catch (error) {
    logger.error({ error }, "Failed to create thread");
    await message.reply("Failed to create a thread. Please check permissions.");
  }
});

client.login(config.discordToken).catch((error) => {
  logger.error({ error }, "Failed to login");
  process.exit(1);
});
