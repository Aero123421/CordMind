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
import { appendThreadSummary, getThreadState } from "./threadState.js";
import { isAuthorized } from "../permissions.js";
import { db } from "../db.js";
import { buildImpact, formatImpact, type Impact } from "../impact.js";
import type { PlannedAction } from "../llm/types.js";
import { detectDiagnosticsTopic } from "../diagnostics.js";

const t = (lang: string | null | undefined, en: string, ja: string) => (lang === "ja" ? ja : en);
const MAX_AGENT_STEPS = 6;

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

const mention = {
  channel: (id?: string) => (id ? `<#${id}>` : null),
  role: (id?: string) => (id ? `<@&${id}>` : null),
  user: (id?: string) => (id ? `<@${id}>` : null)
};

const extractMentionId = (value: unknown, pattern: RegExp): string | null => {
  if (typeof value !== "string") return null;
  const match = value.match(pattern);
  if (match?.[1]) return match[1];
  if (/^\d+$/.test(value)) return value;
  return null;
};

const channelRefFromParams = (params: Record<string, unknown>) => {
  const channelId = typeof params.channel_id === "string" ? params.channel_id : undefined;
  const channelName = typeof params.channel_name === "string" ? params.channel_name : undefined;
  return mention.channel(channelId) ?? (channelName ? `#${channelName}` : "(channel)");
};

const roleRefFromParams = (params: Record<string, unknown>) => {
  const roleId = extractMentionId(params.role_id, /<@&(\d+)>/) ?? (typeof params.role_id === "string" ? params.role_id : undefined);
  const roleName = typeof params.role_name === "string" ? params.role_name : undefined;
  return mention.role(roleId) ?? (roleName ? `@${roleName}` : "(role)");
};

const userRefFromParams = (params: Record<string, unknown>) => {
  const userId = extractMentionId(params.user_id, /<@!?(\d+)>/) ??
    extractMentionId(params.user_mention, /<@!?(\d+)>/) ??
    (typeof params.user_id === "string" ? params.user_id : undefined);
  const mentionRaw = typeof params.user_mention === "string" ? params.user_mention : undefined;
  return mentionRaw ?? mention.user(userId) ?? "(user)";
};

const summarizeActionForDisplay = (action: PlannedAction, lang: string | null | undefined) => {
  const params = action.params ?? {};

  switch (action.action) {
    case "create_channel": {
      const type = typeof params.type === "string" ? params.type : "text";
      const name = typeof params.name === "string" ? params.name : type === "voice" ? "voice-room" : "text-channel";
      const limit = params.user_limit;
      const limitText = typeof limit === "number" || typeof limit === "string" ? ` (limit=${limit})` : "";
      return t(lang, `Create ${type} channel: #${name}${limitText}`, `${type}チャンネルを作成: #${name}${limitText}`);
    }
    case "rename_channel": {
      const newName = typeof params.new_name === "string" ? params.new_name : "(missing new_name)";
      return t(lang, `Rename channel ${channelRefFromParams(params)} → ${newName}`, `チャンネル名変更 ${channelRefFromParams(params)} → ${newName}`);
    }
    case "delete_channel":
      return t(lang, `Delete channel ${channelRefFromParams(params)}`, `チャンネル削除 ${channelRefFromParams(params)}`);
    case "create_role": {
      const name = typeof params.name === "string" ? params.name : "(missing name)";
      return t(lang, `Create role: ${name}`, `ロール作成: ${name}`);
    }
    case "delete_role":
      return t(lang, `Delete role ${roleRefFromParams(params)}`, `ロール削除 ${roleRefFromParams(params)}`);
    case "assign_role":
      return t(lang, `Assign role ${roleRefFromParams(params)} to ${userRefFromParams(params)}`, `${userRefFromParams(params)} に ${roleRefFromParams(params)} を付与`);
    case "remove_role":
      return t(lang, `Remove role ${roleRefFromParams(params)} from ${userRefFromParams(params)}`, `${userRefFromParams(params)} から ${roleRefFromParams(params)} を剥奪`);
    case "update_permission_overwrites": {
      const allow = Array.isArray(params.allow) ? (params.allow as string[]) : [];
      const deny = Array.isArray(params.deny) ? (params.deny as string[]) : [];
      const allowText = allow.length > 0 ? ` allow=[${allow.join(", ")}]` : "";
      const denyText = deny.length > 0 ? ` deny=[${deny.join(", ")}]` : "";
      const target = params.role_id || params.role_name ? roleRefFromParams(params) : userRefFromParams(params);
      return t(
        lang,
        `Update permissions on ${channelRefFromParams(params)} for ${target}${allowText}${denyText}`,
        `権限更新 ${channelRefFromParams(params)} / 対象 ${target}${allowText}${denyText}`
      );
    }
    case "kick_member":
      return t(lang, `Kick ${userRefFromParams(params)}`, `キック ${userRefFromParams(params)}`);
    case "ban_member":
      return t(lang, `Ban ${userRefFromParams(params)}`, `BAN ${userRefFromParams(params)}`);
    case "timeout_member": {
      const minutes = typeof params.duration_minutes === "number" || typeof params.duration_minutes === "string" ? params.duration_minutes : params.minutes;
      const durationText = minutes ? ` (${minutes}m)` : "";
      return t(lang, `Timeout ${userRefFromParams(params)}${durationText}`, `タイムアウト ${userRefFromParams(params)}${durationText}`);
    }
    case "untimeout_member":
      return t(lang, `Remove timeout from ${userRefFromParams(params)}`, `タイムアウト解除 ${userRefFromParams(params)}`);
    case "pin_message": {
      const messageId = typeof params.message_id === "string" ? params.message_id : "(message_id)";
      return t(lang, `Pin message ${messageId} in ${channelRefFromParams(params)}`, `ピン留め ${channelRefFromParams(params)} / ${messageId}`);
    }
    case "create_thread": {
      const name = typeof params.name === "string" ? params.name : "(thread)";
      return t(lang, `Create thread: ${name} in ${channelRefFromParams(params)}`, `スレッド作成: ${name} / ${channelRefFromParams(params)}`);
    }
    default:
      return t(lang, `Run ${action.action}`, `${action.action} を実行`);
  }
};

const summarizeActionsForDisplay = (actions: PlannedAction[], lang: string | null | undefined) =>
  actions.map((action) => `• ${summarizeActionForDisplay(action, lang)}`).join("\n");

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

const buildMessages = async (message: Message, lang: string | null | undefined, initialSummary?: string | null) => {
  const thread = message.channel as ThreadChannel;
  const fetched = await thread.messages.fetch({ limit: 12 });
  const sorted = Array.from(fetched.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  const systemContent = initialSummary
    ? `${buildSystemPrompt(lang)}\n${t(lang, "Initial request", "初期依頼")}: ${initialSummary}`
    : buildSystemPrompt(lang);
  const system = { role: "system" as const, content: systemContent };
  const history = sorted.map((msg) => ({
    role: msg.author.bot ? ("assistant" as const) : ("user" as const),
    content: msg.content
  }));

  return [system, ...history];
};

const OBSERVATION_ACTIONS = new Set([
  "diagnose_guild",
  "list_channels",
  "get_channel_details",
  "list_roles",
  "get_role_details",
  "get_guild_permissions",
  "get_bot_permissions",
  "find_members",
  "get_member_details"
]);

const isObservationAction = (action: string) => OBSERVATION_ACTIONS.has(action);

const MEMORY_SKIP_ACTIONS = new Set([
  "none",
  ...Array.from(OBSERVATION_ACTIONS.values())
]);

const shouldRememberAction = (action: string) => !MEMORY_SKIP_ACTIONS.has(action);

const buildMemoryAppend = (
  lang: string | null | undefined,
  results: Array<{ action: string; ok: boolean; message: string; discordIds?: string[] }>
) => {
  const remembered = results.filter((item) => shouldRememberAction(item.action));
  if (remembered.length === 0) return null;

  const now = new Date();
  const stamp = `${now.toISOString().slice(0, 19).replace("T", " ")}`;
  const okText = t(lang, "OK", "成功");
  const failText = t(lang, "Failed", "失敗");

  const lines = remembered.map((item) => {
    const ids = (item.discordIds ?? []).slice(0, 6).join(",");
    const idText = ids.length > 0 ? ` ids=${ids}` : "";
    const msg = item.message.replace(/\s+/g, " ").slice(0, 180);
    return `- [${stamp}] ${item.action}: ${item.ok ? okText : failText}${idText} ${msg}`.trim();
  });

  return lines.join("\n");
};

const truncateForLLM = (input: string, maxChars: number) => {
  if (input.length <= maxChars) return input;
  return input.slice(0, Math.max(0, maxChars - 30)) + "\n...(truncated)";
};

const buildToolResultMessage = (action: PlannedAction, result: { ok: boolean; message: string }) => {
  const params = action.params ?? {};
  const paramText = truncateForLLM(JSON.stringify(params), 600);
  const messageText = truncateForLLM(String(result.message ?? ""), 2200);
  return [
    "[TOOL_RESULT]",
    `action=${action.action}`,
    `params=${paramText}`,
    `ok=${result.ok}`,
    "message:",
    messageText
  ].join("\n");
};

const inferObservationFallback = (action: PlannedAction, userText: string): PlannedAction | null => {
  const text = userText.toLowerCase();
  const wantsVoice = text.includes("ボイス") || text.includes("voice") || /\bvc\b/.test(text) || /vc\d+/.test(text);

  if (["rename_channel", "delete_channel", "get_channel_details"].includes(action.action)) {
    const channelId = (action.params as Record<string, unknown> | undefined)?.channel_id;
    const channelName = (action.params as Record<string, unknown> | undefined)?.channel_name;
    if (!channelId && !channelName) {
      return {
        action: "list_channels",
        params: { type: wantsVoice ? "voice" : "any", limit: 25 },
        destructive: false
      };
    }
  }

  if (["assign_role", "remove_role", "get_role_details", "delete_role"].includes(action.action)) {
    const roleId = (action.params as Record<string, unknown> | undefined)?.role_id;
    const roleName = (action.params as Record<string, unknown> | undefined)?.role_name;
    if (!roleId && !roleName) {
      return { action: "list_roles", params: {}, destructive: false };
    }
  }

  if (action.action === "update_permission_overwrites") {
    const channelId = (action.params as Record<string, unknown> | undefined)?.channel_id;
    const channelName = (action.params as Record<string, unknown> | undefined)?.channel_name;
    if (!channelId && !channelName) {
      return { action: "list_channels", params: { type: "any", limit: 25 }, destructive: false };
    }
  }

  return null;
};

export const handleThreadMessage = async (message: Message) => {
  if (!message.guild || !(message.channel instanceof ThreadChannel)) return;
  if (message.author.bot) return;

  const settings = await getGuildSettings(message.guild.id);
  const guildId = message.guild.id;

  if (message.content.trim().length === 0) {
    await message.reply(
      t(
        settings.language,
        "Message content is empty. Ensure Message Content Intent is enabled.",
        "メッセージ内容が空です。Message Content Intent が有効か確認してください。"
      )
    );
    await notifyError({
      guild: message.guild,
      logChannelId: settings.log_channel_id,
      actorTag: message.author.tag,
      action: "message_content_empty",
      message: "Message content empty; Message Content Intent may be disabled."
    });
    return;
  }

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
    await message.reply(t(settings.language, "Rate limit exceeded. Try again later.", "レート制限を超えました。少し待ってから再試行してください。"));
    await notifyError({
      guild: message.guild,
      logChannelId: settings.log_channel_id,
      actorTag: message.author.tag,
      action: "rate_limit",
      message: "Rate limit exceeded."
    });
    return;
  }

  const diagnosticsTopic = detectDiagnosticsTopic(message.content, settings.language);

  const apiKey = await getDecryptedApiKey(guildId, settings.provider as ProviderName);
  if (!apiKey) {
    if (diagnosticsTopic) {
      if (!checkRateLimit(guildId, settings.rate_limit_per_min)) {
        await message.reply(t(settings.language, "Rate limit exceeded. Try again later.", "レート制限を超えました。少し待ってから再試行してください。"));
        await notifyError({
          guild: message.guild,
          logChannelId: settings.log_channel_id,
          actorTag: message.author.tag,
          action: "rate_limit",
          message: "Rate limit exceeded."
        });
        return;
      }

      try {
        const diagnosticsHandler = toolRegistry.diagnose_guild;
        const report = await diagnosticsHandler(
          { client: message.client, guild: message.guild, actor: message.author, lang: settings.language },
          { topic: diagnosticsTopic }
        );
        await message.reply(report.message);
      } catch (error) {
        logger.error({ err: error }, "Diagnostics failed");
        await message.reply(t(settings.language, "Failed to run diagnostics.", "診断に失敗しました。Botの権限/ログを確認してください。"));
      }
      return;
    }

    await message.reply(
      t(
        settings.language,
        `API key not set for provider ${settings.provider}. Use /discordaimanage setting to configure.`,
        `APIキーが未設定です（プロバイダー: ${settings.provider}）。/discordaimanage setting から設定してください。`
      )
    );
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
    await message.reply(t(settings.language, "Model not set. Use /discordaimanage setting to configure.", "モデルが未設定です。/discordaimanage setting から設定してください。"));
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

  const agentMessages = await buildMessages(message, settings.language, threadState?.summary ?? null);
  const planFallbackReply = t(
    settings.language,
    "Failed to interpret the request. Please rephrase.",
    "解釈に失敗しました。もう少し具体的に言い換えてください。"
  );

  if (diagnosticsTopic) {
    if (!checkRateLimit(guildId, settings.rate_limit_per_min)) {
      await message.reply(t(settings.language, "Rate limit exceeded. Try again later.", "レート制限を超えました。少し待ってから再試行してください。"));
      await notifyError({
        guild: message.guild,
        logChannelId: settings.log_channel_id,
        actorTag: message.author.tag,
        action: "rate_limit",
        message: "Rate limit exceeded."
      });
      return;
    }

    const action: PlannedAction = { action: "diagnose_guild", params: { topic: diagnosticsTopic }, destructive: false };
    const handler = toolRegistry[action.action];
    if (handler) {
      try {
        const result = await handler({ client: message.client, guild: message.guild, actor: message.author, lang: settings.language }, action.params);
        agentMessages.push({ role: "assistant" as const, content: buildToolResultMessage(action, result) });
      } catch (error) {
        logger.error({ err: error }, "Diagnostics tool failed");
        agentMessages.push({
          role: "assistant" as const,
          content: buildToolResultMessage(action, { ok: false, message: "diagnose_guild failed" })
        });
      }

      agentMessages.splice(1, 0, {
        role: "system" as const,
        content: t(
          settings.language,
          "The user asked for an overview/diagnosis. Use the diagnostics result to give a helpful report and next question. Prefer action='none' unless the user explicitly asked to change something.",
          "ユーザーは概要/診断を求めています。診断結果を使って、分かりやすい所見と次の確認質問を返してください。明示的な変更依頼がない限り action='none' を優先してください。"
        )
      });
    }
  }

  for (let step = 0; step < MAX_AGENT_STEPS; step += 1) {
    let plan;
    try {
      plan = await generateToolPlan(adapter, agentMessages, { fallbackReply: planFallbackReply, allowTextFallback: true });
    } catch (error) {
      logger.warn({ err: error }, "LLM planning failed, retrying once");
      try {
        const retryMessages = [...agentMessages];
        retryMessages.splice(1, 0, {
          role: "system" as const,
          content: "Return only valid JSON that matches the schema. No markdown or extra text."
        });
        plan = await generateToolPlan(adapter, retryMessages, { fallbackReply: planFallbackReply, allowTextFallback: true });
      } catch (retryError) {
        logger.error({ err: retryError }, "LLM planning failed");
        await message.reply(t(settings.language, "Failed to interpret the request. Please rephrase.", "解釈に失敗しました。もう少し具体的に言い換えてください。"));
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
      await message.reply(
        t(
          settings.language,
          `Too many actions requested (${actions.length}). Please split the request (max ${MAX_ACTIONS_PER_REQUEST}).`,
          `操作数が多すぎます（${actions.length}）。最大 ${MAX_ACTIONS_PER_REQUEST} なので分割してください。`
        )
      );
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
      await message.reply(t(settings.language, `This action is forbidden: ${forbidden.map((a) => a.action).join(", ")}`, `この操作は禁止されています: ${forbidden.map((a) => a.action).join(", ")}`));
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
      await message.reply(t(settings.language, `Requested action is not allowed: ${notAllowed.map((a) => a.action).join(", ")}`, `許可されていない操作です: ${notAllowed.map((a) => a.action).join(", ")}`));
      await notifyError({
        guild: message.guild,
        logChannelId: settings.log_channel_id,
        actorTag: message.author.tag,
        action: "action_not_allowed",
        message: `Action not allowed: ${notAllowed.map((a) => a.action).join(", ")}`
      });
      return;
    }

    const destructiveActions = actions.filter((action) => DESTRUCTIVE_ACTIONS.has(action.action));
    const explicitObservation = actions.find((action) => isObservationAction(action.action));
    const fallbackObservation = inferObservationFallback(actions[0], message.content);
    const observationAction = isObservationAction(actions[0].action)
      ? actions[0]
      : fallbackObservation ?? (destructiveActions.length > 0 ? explicitObservation ?? null : null);

    if (observationAction) {
      if (!checkRateLimit(guildId, settings.rate_limit_per_min)) {
        await message.reply(t(settings.language, "Rate limit exceeded. Try again later.", "レート制限を超えました。少し待ってから再試行してください。"));
        await notifyError({
          guild: message.guild,
          logChannelId: settings.log_channel_id,
          actorTag: message.author.tag,
          action: "rate_limit",
          message: "Rate limit exceeded."
        });
        return;
      }

      const handler = toolRegistry[observationAction.action];
      if (!handler) {
        await message.reply(t(settings.language, `Tool not implemented: ${observationAction.action}`, `未実装のツールです: ${observationAction.action}`));
        await notifyError({
          guild: message.guild,
          logChannelId: settings.log_channel_id,
          actorTag: message.author.tag,
          action: "tool_missing",
          message: `Tool not implemented: ${observationAction.action}`
        });
        return;
      }

      let result;
      try {
        result = await handler(
          { client: message.client, guild: message.guild, actor: message.author, lang: settings.language },
          observationAction.params
        );
      } catch (error) {
        logger.error({ error }, "Tool execution failed");
        result = { ok: false, message: "Tool execution failed." };
      }

      agentMessages.push({ role: "assistant" as const, content: buildToolResultMessage(observationAction, result) });
      continue;
    }

    const remaining = getRateLimitRemaining(guildId, settings.rate_limit_per_min);
    if (actions.length > remaining) {
      await message.reply(t(settings.language, "Rate limit exceeded. Try again later.", "レート制限を超えました。少し待ってから再試行してください。"));
      await notifyError({
        guild: message.guild,
        logChannelId: settings.log_channel_id,
        actorTag: message.author.tag,
        action: "rate_limit",
        message: "Rate limit exceeded."
      });
      return;
    }

    if (destructiveActions.length > 0) {
      const remainingDestructive = getRateLimitRemaining(`destructive:${guildId}`, DESTRUCTIVE_LIMIT_PER_MIN);
      if (destructiveActions.length > remainingDestructive) {
        await message.reply(t(settings.language, "Destructive action rate limit exceeded. Try again later.", "破壊的操作のレート制限を超えました。少し待ってから再試行してください。"));
        await notifyError({
          guild: message.guild,
          logChannelId: settings.log_channel_id,
          actorTag: message.author.tag,
          action: "destructive_rate_limit",
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
          message: summarizeActionsForDisplay(actions, settings.language)
        });
      }

      await message.reply({
        content: `${plan.reply}\n\n${t(settings.language, "Planned actions", "操作内容")}:\n${summarizeActionsForDisplay(actions, settings.language)}\n\n${t(settings.language, "Impact", "影響範囲")}:\n${formatImpact(impact, settings.language)}\n\n${t(settings.language, "Accept or Reject?", "Accept / Reject を選んでください")}`,
        components: [confirmationRow(audit.id)]
      });
      return;
    }

    const results: Array<{ action: string; ok: boolean; message: string; discordIds?: string[] }> = [];

    for (const action of actions) {
      if (!checkRateLimit(guildId, settings.rate_limit_per_min)) {
        results.push({
          action: action.action,
          ok: false,
          message: t(settings.language, "Rate limit exceeded.", "レート制限を超えました。")
        });
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
        results.push({ action: action.action, ok: false, message: t(settings.language, "Tool not implemented.", "未実装のツールです。") });
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
        result = await handler({ client: message.client, guild: message.guild, actor: message.author, lang: settings.language }, action.params);
      } catch (error) {
        logger.error({ error }, "Tool execution failed");
        result = { ok: false, message: t(settings.language, "Tool execution failed.", "ツールの実行に失敗しました。") };
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
      const memoryAppend = buildMemoryAppend(settings.language, results);
      if (memoryAppend) {
        appendThreadSummary({
          threadId: message.channel.id,
          guildId,
          ownerUserId: threadState?.owner_user_id ?? message.author.id,
          append: memoryAppend
        }).catch(() => {
          // ignore
        });
      }
      if (result.ok) {
        await message.reply(`${plan.reply}\n${result.message}`);
      } else {
        await message.reply(t(settings.language, `Failed: ${result.message}`, `失敗: ${result.message}`));
      }
      return;
    }

    const intro = plan.reply.trim().length > 0 ? `${plan.reply}\n` : "";
    const okText = t(settings.language, "OK", "成功");
    const failText = t(settings.language, "Failed", "失敗");
    const lines = results.map((item) => `• ${item.action}: ${item.ok ? okText : failText} - ${item.message}`).join("\n");
    const memoryAppend = buildMemoryAppend(settings.language, results);
    if (memoryAppend) {
      appendThreadSummary({
        threadId: message.channel.id,
        guildId,
        ownerUserId: threadState?.owner_user_id ?? message.author.id,
        append: memoryAppend
      }).catch(() => {
        // ignore
      });
    }
    await message.reply(`${intro}${lines}`);
    return;
  }

  await message.reply(t(settings.language, "I couldn't complete the request. Please rephrase.", "うまく処理できませんでした。もう少し具体的に言い換えてください。"));
};

export const handleConfirmation = async (interaction: import("discord.js").ButtonInteraction) => {
  if (!interaction.guild || !interaction.channel) return;
  const settings = await getGuildSettings(interaction.guild.id);
  const lang = settings.language;
  const [action, id] = interaction.customId.split(":");
  if (!id) return;
  const record = await db.auditEvent.findUnique({ where: { id } });
  if (!record) {
    await interaction.reply({ ephemeral: true, content: t(lang, "Audit record not found.", "監査レコードが見つかりませんでした。") });
    return;
  }

  if (record.confirmation_status !== "pending") {
    await interaction.reply({ ephemeral: true, content: t(lang, "This request is already resolved.", "このリクエストはすでに処理済みです。") });
    return;
  }

  const payload = record.payload_json as AuditPayload;
  const plannedActions = payload.request.actions ?? [
    { action: payload.request.action ?? record.action, params: payload.request.params ?? {} }
  ];
  const actions: PlannedAction[] = plannedActions
    .map((item) => ({
      action: item.action,
      params: item.params ?? {},
      destructive: Boolean((item as Partial<PlannedAction>).destructive)
    }))
    .filter((item) => typeof item.action === "string" && item.action.length > 0);

  if (actions.length === 0) {
    await interaction.reply({ ephemeral: true, content: t(lang, "No actions to execute.", "実行する操作がありません。") });
    return;
  }

  const isOwner = payload.request.thread_id === interaction.channelId && record.actor_user_id === interaction.user.id;
  if (!isOwner) {
    await interaction.reply({ ephemeral: true, content: t(lang, "Not authorized to confirm this action.", "この操作を承認できません（依頼者のみ承認可能です）。") });
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
    await interaction.reply({ content: t(lang, "Rejected.", "却下しました。") });
    return;
  }

  if (action !== "confirm") {
    await interaction.reply({ ephemeral: true, content: t(lang, "Unknown action.", "不明な操作です。") });
    return;
  }

  const results: Array<{ action: string; ok: boolean; message: string; discordIds?: string[] }> = [];

  for (const action of actions) {
    if (!checkRateLimit(interaction.guild.id, settings.rate_limit_per_min)) {
      results.push({
        action: action.action,
        ok: false,
        message: t(lang, "Rate limit exceeded.", "レート制限を超えました。")
      });
      break;
    }

    const isDestructive = DESTRUCTIVE_ACTIONS.has(action.action);
    if (isDestructive && !checkRateLimit(`destructive:${interaction.guild.id}`, DESTRUCTIVE_LIMIT_PER_MIN)) {
      results.push({
        action: action.action,
        ok: false,
        message: t(lang, "Destructive action rate limit exceeded.", "破壊的操作のレート制限を超えました。")
      });
      break;
    }

    const handler = toolRegistry[action.action];
    if (!handler) {
      results.push({ action: action.action, ok: false, message: t(lang, "Tool not implemented.", "未実装のツールです。") });
      continue;
    }

    try {
      const result = await handler(
        { client: interaction.client, guild: interaction.guild, actor: interaction.user, lang: settings.language },
        action.params
      );
      results.push({ action: action.action, ok: result.ok, message: result.message, discordIds: result.discordIds });
    } catch (error) {
      logger.error({ error }, "Tool execution failed");
      results.push({ action: action.action, ok: false, message: t(lang, "Tool execution failed.", "ツールの実行に失敗しました。") });
    }
  }

  const okAll = results.every((item) => item.ok);
  const okText = t(lang, "OK", "成功");
  const failText = t(lang, "Failed", "失敗");
  const summary = results.map((item) => `• ${item.action}: ${item.ok ? okText : failText} - ${item.message}`).join("\n");
  const discordIds = results.flatMap((item) => item.discordIds ?? []);
  const memoryAppend = buildMemoryAppend(lang, results);
  if (memoryAppend) {
    appendThreadSummary({
      threadId: payload.request.thread_id ?? interaction.channelId,
      guildId: interaction.guild.id,
      ownerUserId: record.actor_user_id,
      append: memoryAppend
    }).catch(() => {
      // ignore
    });
  }

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

  await interaction.reply({ content: okAll ? t(lang, `Done:\n${summary}`, `完了:\n${summary}`) : t(lang, `Failed:\n${summary}`, `失敗:\n${summary}`) });
};
