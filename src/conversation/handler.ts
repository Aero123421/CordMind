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
import {
  ALLOWED_ACTIONS,
  BANNED_ACTIONS,
  DESTRUCTIVE_ACTIONS,
  DESTRUCTIVE_LIMIT_PER_MIN,
  MAX_ACTIONS_PER_REQUEST,
  ProviderName
} from "../constants.js";
import { toolRegistry } from "../tools/toolRegistry.js";
import { createAuditEvent, updateAuditEvent, AuditPayload } from "../audit.js";
import { checkRateLimit, getRateLimitRemaining } from "../rateLimit.js";
import { logger } from "../logger.js";
import { sendAuditLog } from "../auditLog.js";
import { getThreadState } from "./threadState.js";
import { isAuthorized } from "../permissions.js";
import { db } from "../db.js";
import { buildImpact, formatImpact, type Impact } from "../impact.js";
import type { PlannedAction } from "../llm/types.js";

const confirmationRow = (id: string) =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`confirm:${id}`).setLabel("Accept").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`reject:${id}`).setLabel("Reject").setStyle(ButtonStyle.Danger)
  );

const normalizeActions = (plan: {
  action: string;
  params: Record<string, unknown>;
  destructive: boolean;
  actions?: PlannedAction[];
}): PlannedAction[] => {
  const base = {
    action: plan.action,
    params: plan.params ?? {},
    destructive: plan.destructive
  };
  const list = Array.isArray(plan.actions) && plan.actions.length > 0 ? plan.actions : [base];
  return list
    .map((item) => ({
      action: item.action,
      params: item.params ?? {},
      destructive: item.destructive ?? false
    }))
    .filter((item) => typeof item.action === "string" && item.action.length > 0);
};

const summarizeActions = (actions: PlannedAction[]) => {
  if (actions.length === 1) {
    const paramText = JSON.stringify(actions[0].params ?? {}, null, 2);
    return `Action: ${actions[0].action}\nParams:\n${paramText}`;
  }
  return actions
    .map((action, index) => {
      const paramText = JSON.stringify(action.params ?? {}, null, 2);
      return `#${index + 1} ${action.action}\nParams:\n${paramText}`;
    })
    .join("\n\n");
};

const mergeImpact = (base: Impact, next: Impact): Impact => {
  const merged: Impact = { ...base };
  (["channels", "roles", "members", "permissions"] as const).forEach((key) => {
    const combined = [...(base[key] ?? []), ...(next[key] ?? [])];
    if (combined.length > 0) {
      merged[key] = Array.from(new Set(combined));
    }
  });
  return merged;
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

  if (getRateLimitRemaining(guildId, settings.rate_limit_per_min) <= 0) {
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

  const actions = normalizeActions(plan).filter((action) => action.action !== "none");
  if (actions.length === 0) {
    await message.reply(plan.reply);
    return;
  }

  if (actions.length > MAX_ACTIONS_PER_REQUEST) {
    await message.reply(`Too many actions requested (${actions.length}). Please split the request (max ${MAX_ACTIONS_PER_REQUEST}).`);
    await notifyError({
      guild: message.guild,
      logChannelId: settings.log_channel_id,
      actorTag: message.author.tag,
      action: "action_limit",
      message: `Too many actions requested: ${actions.length}`
    });
    return;
  }

  const forbidden = actions.filter((action) => BANNED_ACTIONS.has(action.action));
  if (forbidden.length > 0) {
    await message.reply(`This action is forbidden: ${forbidden.map((a) => a.action).join(", ")}`);
    await notifyError({
      guild: message.guild,
      logChannelId: settings.log_channel_id,
      actorTag: message.author.tag,
      action: "action_forbidden",
      message: `Action forbidden: ${forbidden.map((a) => a.action).join(", ")}`
    });
    return;
  }

  const notAllowed = actions.filter((action) => !ALLOWED_ACTIONS.has(action.action));
  if (notAllowed.length > 0) {
    await message.reply(`Requested action is not allowed: ${notAllowed.map((a) => a.action).join(", ")}`);
    await notifyError({
      guild: message.guild,
      logChannelId: settings.log_channel_id,
      actorTag: message.author.tag,
      action: "action_not_allowed",
      message: `Action not allowed: ${notAllowed.map((a) => a.action).join(", ")}`
    });
    return;
  }

  const remaining = getRateLimitRemaining(guildId, settings.rate_limit_per_min);
  if (actions.length > remaining) {
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

  const destructiveActions = actions.filter(
    (action) => action.destructive || DESTRUCTIVE_ACTIONS.has(action.action)
  );
  if (destructiveActions.length > 0) {
    const remainingDestructive = getRateLimitRemaining(`destructive:${guildId}`, DESTRUCTIVE_LIMIT_PER_MIN);
    if (destructiveActions.length > remainingDestructive) {
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

    let impact: Impact = {};
    for (const action of destructiveActions) {
      const nextImpact = await buildImpact(message.guild, action.action, action.params);
      impact = mergeImpact(impact, nextImpact);
    }

    const auditAction = actions.length > 1 ? "batch" : actions[0].action;
    const payload: AuditPayload = {
      request: {
        action: auditAction,
        params: actions[0].params,
        actions,
        raw_text: message.content,
        thread_id: message.channel.id
      },
      impact
    };

    const audit = await createAuditEvent({
      action: auditAction,
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
        action: auditAction,
        actorTag: message.author.tag,
        status: "pending",
        confirmation: "pending",
        message: summarizeActions(actions)
      });
    }

    await message.reply({
      content: `${plan.reply}\n\n操作内容:\n${summarizeActions(actions)}\n\n影響範囲:\n${formatImpact(impact)}\n\nAccept or Reject?`,
      components: [confirmationRow(audit.id)]
    });
    return;
  }

  const results: Array<{ action: string; ok: boolean; message: string; discordIds?: string[] }> = [];

  for (const action of actions) {
    if (!checkRateLimit(guildId, settings.rate_limit_per_min)) {
      results.push({ action: action.action, ok: false, message: "Rate limit exceeded." });
      await notifyError({
        guild: message.guild,
        logChannelId: settings.log_channel_id,
        actorTag: message.author.tag,
        action: "rate_limit",
        message: "Rate limit exceeded."
      });
      break;
    }

    const handler = toolRegistry[action.action];
    if (!handler) {
      results.push({ action: action.action, ok: false, message: "Tool not implemented." });
      await notifyError({
        guild: message.guild,
        logChannelId: settings.log_channel_id,
        actorTag: message.author.tag,
        action: "tool_missing",
        message: `Tool not implemented: ${action.action}`
      });
      continue;
    }

    let result;
    try {
      result = await handler({ client: message.client, guild: message.guild, actor: message.author }, action.params);
    } catch (error) {
      logger.error({ error }, "Tool execution failed");
      result = { ok: false, message: "Tool execution failed." };
      await notifyError({
        guild: message.guild,
        logChannelId: settings.log_channel_id,
        actorTag: message.author.tag,
        action: "tool_execution_failed",
        message: `Tool execution failed: ${action.action}`
      });
    }

    results.push({ action: action.action, ok: result.ok, message: result.message, discordIds: result.discordIds });

    if (!result.ok) {
      const payload: AuditPayload = {
        request: { action: action.action, params: action.params, raw_text: message.content, thread_id: message.channel.id },
        impact: {}
      };
      await createAuditEvent({
        action: action.action,
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
        action: action.action,
        actorTag: message.author.tag,
        status: result.ok ? "success" : "failure",
        confirmation: "none",
        message: result.message
      });
    }
  }

  if (results.length === 1) {
    const result = results[0];
    if (result.ok) {
      await message.reply(`${plan.reply}\n${result.message}`);
    } else {
      await message.reply(`Failed: ${result.message}`);
    }
    return;
  }

  const intro = plan.reply.trim().length > 0 ? `${plan.reply}\n` : "";
  const lines = results.map((item) => `• ${item.action}: ${item.ok ? "OK" : "Failed"} - ${item.message}`).join("\n");
  await message.reply(`${intro}${lines}`);
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
  const plannedActions = payload.request.actions ?? [
    { action: payload.request.action ?? record.action, params: payload.request.params ?? {} }
  ];
  const actions = plannedActions
    .map((action) => ({ action: action.action, params: action.params ?? {} }))
    .filter((action) => typeof action.action === "string" && action.action.length > 0);

  if (actions.length === 0) {
    await interaction.reply({ ephemeral: true, content: "No actions to execute." });
    return;
  }

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

  const results: Array<{ action: string; ok: boolean; message: string; discordIds?: string[] }> = [];

  for (const action of actions) {
    const handler = toolRegistry[action.action];
    if (!handler) {
      results.push({ action: action.action, ok: false, message: "Tool not implemented." });
      continue;
    }

    try {
      const result = await handler({ client: interaction.client, guild: interaction.guild, actor: interaction.user }, action.params);
      results.push({ action: action.action, ok: result.ok, message: result.message, discordIds: result.discordIds });
    } catch (error) {
      logger.error({ error }, "Tool execution failed");
      results.push({ action: action.action, ok: false, message: "Tool execution failed." });
    }
  }

  const okAll = results.every((item) => item.ok);
  const summary = results.map((item) => `• ${item.action}: ${item.ok ? "OK" : "Failed"} - ${item.message}`).join("\n");
  const discordIds = results.flatMap((item) => item.discordIds ?? []);

  await updateAuditEvent(id, {
    confirmation_status: "approved",
    status: okAll ? "success" : "failure",
    error_message: okAll ? null : "One or more actions failed.",
    payload_json: { ...payload, result: { ok: okAll, message: summary, discord_ids: discordIds } }
  });

  if (settings.log_channel_id) {
    await sendAuditLog(interaction.guild, settings.log_channel_id, {
      action: record.action,
      actorTag: interaction.user.tag,
      status: okAll ? "success" : "failure",
      confirmation: "approved",
      message: summary
    });
  }

  await interaction.reply({ content: okAll ? `Done:\n${summary}` : `Failed:\n${summary}` });
};
