import { Ajv } from "ajv";
import { toolPlanSchema } from "./schema.js";
import type { ChatMessage, ToolPlan, LLMAdapter } from "../llm/types.js";

const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(toolPlanSchema);

const fallbackReply = "Failed to interpret the request. Please rephrase.";

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

const normalizePlan = (input: unknown) => {
  const base = {
    action: "none",
    params: {},
    destructive: false,
    reply: fallbackReply
  };

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return base;
  }

  const obj = input as Record<string, unknown>;
  const action = typeof obj.action === "string" ? obj.action : base.action;
  const params = obj.params && typeof obj.params === "object" && !Array.isArray(obj.params) ? obj.params : base.params;
  const destructive = typeof obj.destructive === "boolean" ? obj.destructive : base.destructive;
  const reply = typeof obj.reply === "string" && obj.reply.trim().length > 0 ? obj.reply : base.reply;
  const reason = typeof obj.reason === "string" ? obj.reason : undefined;

  return reason ? { action, params, destructive, reply, reason } : { action, params, destructive, reply };
};

export const generateToolPlan = async (adapter: LLMAdapter, messages: ChatMessage[]): Promise<ToolPlan> => {
  const raw = await adapter.generatePlan(messages, toolPlanSchema);
  const parsed = tryParseJson(raw);
  if (!parsed) {
    throw new Error("LLM did not return valid JSON");
  }

  const normalized = normalizePlan(parsed);
  if (!validate(normalized)) {
    const errorText = validate.errors?.map((err: { instancePath?: string; message?: string }) => `${err.instancePath ?? ""} ${err.message ?? ""}`).join("; ");
    throw new Error(`LLM output failed schema validation: ${errorText}`);
  }

  return normalized as ToolPlan;
};
