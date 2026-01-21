import { Ajv } from "ajv";
import { toolPlanSchema, agentStepSchema } from "./schema.js";
import type { ChatMessage, ToolPlan, LLMAdapter, PlannedAction } from "../llm/types.js";

const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(toolPlanSchema);
const validateAgentStep = ajv.compile(agentStepSchema);

const defaultFallbackReply = "Failed to interpret the request. Please rephrase.";

const tryParseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
};

const normalizePlan = (input: unknown, fallbackReply: string) => {
  const emptyParams: Record<string, unknown> = {};
  const base = {
    action: "none",
    params: emptyParams,
    destructive: false,
    reply: fallbackReply
  };

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ...base, actions: [base] };
  }

  const obj = input as Record<string, unknown>;
  const reply = typeof obj.reply === "string" && obj.reply.trim().length > 0 ? obj.reply : base.reply;
  const reason = typeof obj.reason === "string" ? obj.reason : undefined;

  const normalizeAction = (raw: unknown) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const item = raw as Record<string, unknown>;
    const action = typeof item.action === "string" ? item.action : undefined;
    if (!action) return null;
    const params =
      item.params && typeof item.params === "object" && !Array.isArray(item.params)
        ? (item.params as Record<string, unknown>)
        : emptyParams;
    const destructive = typeof item.destructive === "boolean" ? item.destructive : false;
    return { action, params, destructive };
  };

  const actionsRaw = Array.isArray(obj.actions) ? obj.actions : [];
  const actions = actionsRaw.map(normalizeAction).filter((item): item is { action: string; params: Record<string, unknown>; destructive: boolean } => Boolean(item));

  const primary = normalizeAction(obj) ?? actions[0] ?? base;
  if (actions.length === 0) {
    actions.push(primary);
  }

  const normalized = {
    action: primary.action,
    params: primary.params,
    destructive: primary.destructive,
    reply,
    actions
  };

  return reason ? { ...normalized, reason } : normalized;
};

export const generateToolPlan = async (
  adapter: LLMAdapter,
  messages: ChatMessage[],
  options?: { fallbackReply?: string; allowTextFallback?: boolean }
): Promise<ToolPlan> => {
  const raw = await adapter.generatePlan(messages, toolPlanSchema);
  const parsed = tryParseJson(raw);
  if (!parsed) {
    if (options?.allowTextFallback) {
      const trimmed = raw.trim();
      const looksStructured =
        trimmed.startsWith("```") ||
        trimmed.includes("{") ||
        trimmed.includes("}") ||
        trimmed.includes("[") ||
        trimmed.includes("]");

      const replyCandidate = !looksStructured && trimmed.length > 0 ? trimmed.slice(0, 1200) : "";
      const fallbackReply = options?.fallbackReply ?? defaultFallbackReply;
      const reply = replyCandidate.length > 0 ? replyCandidate : fallbackReply;

      const normalized = normalizePlan({ action: "none", params: {}, destructive: false, reply }, fallbackReply);
      if (!validate(normalized)) {
        return normalizePlan({ action: "none", params: {}, destructive: false, reply: fallbackReply }, fallbackReply) as ToolPlan;
      }
      return normalized as ToolPlan;
    }

    throw new Error("LLM did not return valid JSON");
  }

  const normalized = normalizePlan(parsed, options?.fallbackReply ?? defaultFallbackReply);
  if (!validate(normalized)) {
    const errorText = validate.errors?.map((err: { instancePath?: string; message?: string }) => `${err.instancePath ?? ""} ${err.message ?? ""}`).join("; ");
    throw new Error(`LLM output failed schema validation: ${errorText}`);
  }

  return normalized as ToolPlan;
};

export type AgentStep =
  | { type: "observe"; action: string; params?: Record<string, unknown> }
  | { type: "act"; actions: PlannedAction[]; reply?: string }
  | { type: "ask"; question: string }
  | { type: "finish"; reply: string };

const normalizeAgentStep = (input: unknown, fallbackReply: string): AgentStep => {
  const fallback: AgentStep = { type: "finish", reply: fallbackReply };
  if (!input || typeof input !== "object" || Array.isArray(input)) return fallback;
  const obj = input as Record<string, unknown>;
  const type = typeof obj.type === "string" ? obj.type : "";

  if (type === "ask") {
    const question = typeof obj.question === "string" && obj.question.trim().length > 0 ? obj.question : fallbackReply;
    return { type: "ask", question };
  }

  if (type === "observe") {
    const action = typeof obj.action === "string" && obj.action.length > 0 ? obj.action : "none";
    const params =
      obj.params && typeof obj.params === "object" && !Array.isArray(obj.params)
        ? (obj.params as Record<string, unknown>)
        : {};
    return { type: "observe", action, params };
  }

  if (type === "act") {
    const actionsRaw = Array.isArray(obj.actions) ? obj.actions : [];
    const actions = actionsRaw
      .map((raw) => {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
        const item = raw as Record<string, unknown>;
        const action = typeof item.action === "string" ? item.action : undefined;
        if (!action) return null;
        const params =
          item.params && typeof item.params === "object" && !Array.isArray(item.params)
            ? (item.params as Record<string, unknown>)
            : {};
        const destructive = typeof item.destructive === "boolean" ? item.destructive : undefined;
        return destructive === undefined ? { action, params } : { action, params, destructive };
      })
      .filter((item): item is PlannedAction => item !== null);

    const fallbackAction =
      typeof obj.action === "string"
        ? {
            action: obj.action,
            params: (obj.params as Record<string, unknown>) ?? {},
            ...(typeof obj.destructive === "boolean" ? { destructive: obj.destructive } : {})
          }
        : null;

    const normalized = actions.length > 0 ? actions : fallbackAction ? [fallbackAction] : [];
    const reply = typeof obj.reply === "string" ? obj.reply : undefined;
    return { type: "act", actions: normalized, reply };
  }

  if (type === "finish") {
    const reply = typeof obj.reply === "string" && obj.reply.trim().length > 0 ? obj.reply : fallbackReply;
    return { type: "finish", reply };
  }

  return fallback;
};

export const generateAgentStep = async (
  adapter: LLMAdapter,
  messages: ChatMessage[],
  options?: { fallbackReply?: string; allowTextFallback?: boolean }
): Promise<AgentStep> => {
  const raw = await adapter.generatePlan(messages, agentStepSchema);
  const parsed = tryParseJson(raw);
  if (!parsed) {
    if (options?.allowTextFallback) {
      const trimmed = raw.trim();
      const looksStructured =
        trimmed.startsWith("```") ||
        trimmed.includes("{") ||
        trimmed.includes("}") ||
        trimmed.includes("[") ||
        trimmed.includes("]");

      const replyCandidate = !looksStructured && trimmed.length > 0 ? trimmed.slice(0, 1200) : "";
      const fallbackReply = options?.fallbackReply ?? defaultFallbackReply;
      const reply = replyCandidate.length > 0 ? replyCandidate : fallbackReply;
      return { type: "finish", reply };
    }
    throw new Error("LLM did not return valid JSON");
  }

  const normalized = normalizeAgentStep(parsed, options?.fallbackReply ?? defaultFallbackReply);
  if (!validateAgentStep(normalized)) {
    const fallbackReply = options?.fallbackReply ?? defaultFallbackReply;
    return { type: "finish", reply: fallbackReply };
  }
  return normalized;
};
