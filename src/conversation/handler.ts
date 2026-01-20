import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Message,
  ThreadChannel
} from "discord.js";
import { buildSystemPrompt } from "./schema.js";
import { generateToolPlan } from "./plan.js";
import { getGuildSettings, getDecryptedApiKey } from "../settings.js";
import { createAdapter } from "../llm/providerFactory.js";
import { ALLOWED_ACTIONS, BANNED_ACTIONS, DESTRUCTIVE_ACTIONS, ProviderName } from "../constants.js";
import { toolRegistry } from "../tools/toolRegistry.js";
import { createAuditEvent, updateAuditEvent, AuditPayload } from "../audit.js";
import { checkRateLimit } from "../rateLimit.js";
import { logger } from "../logger.js";
import { sendAuditLog } from "../auditLog.js";
import { getThreadState } from "./threadState.js";
import { isAuthorized } from "../permissions.js";
import { db } from "../db.js";
import { DESTRUCTIVE_LIMIT_PER_MIN } from "../constants.js";
import { buildImpact, formatImpact } from "../impact.js";

const confirmationRow = (id: string) =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`confirm:${id}`).setLabel("Accept").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`reject:${id}`).setLabel("Reject").setStyle(ButtonStyle.Danger)
  );

const summarizePlan = (plan: { action: string; params: Record<string, unknown> }) => {
  const paramText = JSON.stringify(plan.params, null, 2);
  return `Action: ${plan.action}\nParams:\n${paramText}`;
};

const notifyError = async (input: {
  guild: import("discord.js").Guild;
  logChannelId?: string | null;
  actorTag: string;
  action: string;
  message: string;
}) => {
  if (!input.logChannelId) return;
  await sendAuditLog(input.guild, input.logChannelId, {
    action: input.action,
    actorTag: input.actorTag,
    status: "failure",
    confirmation: "none",
    message: input.message
  });
};

const buildMessages = async (message: Message, initialSummary?: string | null) => {
  const thread = message.channel as ThreadChannel;
  const fetched = await thread.messages.fetch({ limit: 12 });
  const sorted = Array.from(fetched.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  const systemContent = initialSummary
    ? `${buildSystemPrompt()}\nInitial request: ${initialSummary}`
    : buildSystemPrompt();
  const system = { role: "system" as const, content: systemContent };
  const history = sorted.map((msg) => ({
    role: msg.author.bot ? ("assistant" as const) : ("user" as const),
    content: msg.content
  }));

  return [system, ...history];
};

export const handleThreadMessage = async (message: Message) => {
  if (!message.guild || !(message.channel instanceof ThreadChannel)) return;
  if (message.author.bot) return;

  if (message.content.trim().length === 0) {
    await message.reply("Message content is empty. Ensure Message Content Intent is enabled.");
    await notifyError({
      guild: message.guild,
      logChannelId: (await getGuildSettings(message.guild.id)).log_channel_id,
      actorTag: message.author.tag,
      action: "message_content_empty",
      message: "Message content empty; Message Content Intent may be disabled."
    });
    return;
  }

  const settings = await getGuildSettings(message.guild.id);
  const guildId = message.guild.id;
  const threadState = await getThreadState(message.channel.id);
  const member = await message.guild.members.fetch(message.author.id);
  const authorized = isAuthorized(member, settings.manager_role_id);
  if (threadState && threadState.owner_user_id !== message.author.id && !authorized) {
    return;
  }
  if (!threadState && !authorized) {
    return;
  }

  if (!checkRateLimit(guildId, settings.rate_limit_per_min)) {
    await message.reply("Rate limit exceeded. Try again later.");
    await notifyError({
      guild: message.guild,
      logChannelId: settings.log_channel_id,
      actorTag: message.author.tag,
      action: "rate_limit",
      message: "Rate limit exceeded."
    });
    return;
  }

  const apiKey = await getDecryptedApiKey(guildId, settings.provider as ProviderName);
  if (!apiKey) {
    await message.reply("API key not set. Use /discordaimanage setting to configure.");
    await notifyError({
      guild: message.guild,
      logChannelId: settings.log_channel_id,
      actorTag: message.author.tag,
      action: "api_key_missing",
      message: `API key missing for provider ${settings.provider}.`
    });
    return;
  }

  const model = settings.model ?? "";
  if (!model) {
    await message.reply("Model not set. Use /discordaimanage setting to configure.");
    await notifyError({
      guild: message.guild,
      logChannelId: settings.log_channel_id,
      actorTag: message.author.tag,
      action: "model_missing",
      message: "Model not set."
    });
    return;
  }

  const adapter = createAdapter({
    provider: settings.provider as ProviderName,
    apiKey,
    model
  });

  const messages = await buildMessages(message, threadState?.summary ?? null);
  let plan;
  try {
    plan = await generateToolPlan(adapter, messages);
  } catch (error) {
    logger.warn({ err: error }, "LLM planning failed, retrying once");
    try {
      const retryMessages = [...messages];
      retryMessages.splice(1, 0, {
        role: "system" as const,
        content: "Return only valid JSON that matches the schema. No markdown or extra text."
      });
      plan = await generateToolPlan(adapter, retryMessages);
    } catch (retryError) {
      logger.error({ err: retryError }, "LLM planning failed");
      await message.reply("Failed to interpret the request. Please rephrase.");
      await notifyError({
        guild: message.guild,
        logChannelId: settings.log_channel_id,
        actorTag: message.author.tag,
        action: "llm_plan_failed",
        message: "LLM failed to produce a valid plan."
      });
      return;
    }
  }

  if (!ALLOWED_ACTIONS.has(plan.action)) {
    await message.reply("Requested action is not allowed.");
    await notifyError({
      guild: message.guild,
      logChannelId: settings.log_channel_id,
      actorTag: message.author.tag,
      action: "action_not_allowed",
      message: `Action not allowed: ${plan.action}`
    });
    return;
  }

  if (BANNED_ACTIONS.has(plan.action)) {
    await message.reply("This action is forbidden.");
    await notifyError({
      guild: message.guild,
      logChannelId: settings.log_channel_id,
      actorTag: message.author.tag,
      action: "action_forbidden",
      message: `Action forbidden: ${plan.action}`
    });
    return;
  }

  if (plan.action === "none") {
    await message.reply(plan.reply);
    return;
  }

  const destructive = plan.destructive || DESTRUCTIVE_ACTIONS.has(plan.action);
  const impact = destructive ? await buildImpact(message.guild, plan.action, plan.params) : {};
  const payload: AuditPayload = {
    request: { action: plan.action, params: plan.params, raw_text: message.content, thread_id: message.channel.id },
    impact
  };

  if (destructive) {
    if (!checkRateLimit(`destructive:${guildId}`, DESTRUCTIVE_LIMIT_PER_MIN)) {
      await message.reply("Destructive action rate limit exceeded. Try again later.");
      await notifyError({
        guild: message.guild,
        logChannelId: settings.log_channel_id,
        actorTag: message.author.tag,
        action: "rate_limit_destructive",
        message: "Destructive action rate limit exceeded."
      });
      return;
    }

    const audit = await createAuditEvent({
      action: plan.action,
      actor_user_id: message.author.id,
      guild_id: guildId,
      target_id: null,
      payload,
      confirmation_required: true,
      confirmation_status: "pending",
      status: "pending"
    });

    if (settings.log_channel_id) {
      await sendAuditLog(message.guild, settings.log_channel_id, {
        action: plan.action,
        actorTag: message.author.tag,
        status: "pending",
        confirmation: "pending",
        message: summarizePlan(plan)
      });
    }

    await message.reply({
      content: `${plan.reply}\n\n操作内容:\n${summarizePlan(plan)}\n\n影響範囲:\n${formatImpact(impact)}\n\nAccept or Reject?`,
      components: [confirmationRow(audit.id)]
    });
    return;
  }

  const handler = toolRegistry[plan.action];
  if (!handler) {
    await message.reply("Tool not implemented.");
    await notifyError({
      guild: message.guild,
      logChannelId: settings.log_channel_id,
      actorTag: message.author.tag,
      action: "tool_missing",
      message: `Tool not implemented: ${plan.action}`
    });
    return;
  }

  let result;
  try {
    result = await handler({ client: message.client, guild: message.guild, actor: message.author }, plan.params);
  } catch (error) {
    logger.error({ error }, "Tool execution failed");
    result = { ok: false, message: "Tool execution failed." };
    await notifyError({
      guild: message.guild,
      logChannelId: settings.log_channel_id,
      actorTag: message.author.tag,
      action: "tool_execution_failed",
      message: `Tool execution failed: ${plan.action}`
    });
  }

  if (result.ok) {
    await message.reply(`${plan.reply}\n${result.message}`);
  } else {
    await message.reply(`Failed: ${result.message}`);
  }

  if (!result.ok) {
    await createAuditEvent({
      action: plan.action,
      actor_user_id: message.author.id,
      guild_id: guildId,
      target_id: null,
      payload: { ...payload, result: { ok: result.ok, message: result.message, discord_ids: result.discordIds } },
      confirmation_required: false,
      confirmation_status: "none",
      status: "failure",
      error_message: result.message
    });
  }

  if (settings.log_channel_id) {
    await sendAuditLog(message.guild, settings.log_channel_id, {
      action: plan.action,
      actorTag: message.author.tag,
      status: result.ok ? "success" : "failure",
      confirmation: "none",
      message: result.message
    });
  }
};

export const handleConfirmation = async (interaction: import("discord.js").ButtonInteraction) => {
  if (!interaction.guild || !interaction.channel) return;
  const [action, id] = interaction.customId.split(":");
  if (!id) return;
  const record = await db.auditEvent.findUnique({ where: { id } });
  if (!record) {
    await interaction.reply({ ephemeral: true, content: "Audit record not found." });
    return;
  }

  if (record.confirmation_status !== "pending") {
    await interaction.reply({ ephemeral: true, content: "This request is already resolved." });
    return;
  }

  const payload = record.payload_json as AuditPayload;
  const plan = { action: record.action, params: payload.request.params };

  const member = await interaction.guild.members.fetch(interaction.user.id);
  const settings = await getGuildSettings(interaction.guild.id);
  const authorized = isAuthorized(member, settings.manager_role_id);
  const isOwner = payload.request.thread_id === interaction.channelId && record.actor_user_id === interaction.user.id;
  if (!authorized && !isOwner) {
    await interaction.reply({ ephemeral: true, content: "Not authorized to confirm this action." });
    return;
  }

  if (action === "reject") {
    await updateAuditEvent(id, { confirmation_status: "rejected", status: "failure", error_message: "Rejected" });
    if (settings.log_channel_id) {
      await sendAuditLog(interaction.guild, settings.log_channel_id, {
        action: record.action,
        actorTag: interaction.user.tag,
        status: "failure",
        confirmation: "rejected",
        message: "Rejected by user"
      });
    }
    await interaction.reply({ content: "Rejected." });
    return;
  }

  if (action !== "confirm") {
    await interaction.reply({ ephemeral: true, content: "Unknown action." });
    return;
  }

  const handler = toolRegistry[record.action];
  if (!handler) {
    await interaction.reply({ content: "Tool not implemented." });
    await updateAuditEvent(id, { confirmation_status: "approved", status: "failure", error_message: "Tool not implemented" });
    return;
  }

  let result;
  try {
    result = await handler({ client: interaction.client, guild: interaction.guild, actor: interaction.user }, plan.params);
  } catch (error) {
    logger.error({ error }, "Tool execution failed");
    result = { ok: false, message: "Tool execution failed." };
  }

  await updateAuditEvent(id, {
    confirmation_status: "approved",
    status: result.ok ? "success" : "failure",
    error_message: result.ok ? null : result.message,
    payload_json: { ...payload, result: { ok: result.ok, message: result.message, discord_ids: result.discordIds } }
  });

  if (settings.log_channel_id) {
    await sendAuditLog(interaction.guild, settings.log_channel_id, {
      action: record.action,
      actorTag: interaction.user.tag,
      status: result.ok ? "success" : "failure",
      confirmation: "approved",
      message: result.message
    });
  }

  await interaction.reply({ content: result.ok ? `Done: ${result.message}` : `Failed: ${result.message}` });
};
