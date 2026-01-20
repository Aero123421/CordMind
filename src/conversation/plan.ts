import { Ajv } from "ajv";
import { toolPlanSchema } from "./schema.js";
import type { ChatMessage, ToolPlan, LLMAdapter } from "../llm/types.js";

const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(toolPlanSchema);

export const generateToolPlan = async (adapter: LLMAdapter, messages: ChatMessage[]): Promise<ToolPlan> => {
  const raw = await adapter.generatePlan(messages, toolPlanSchema);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error("LLM did not return valid JSON");
  }

  if (!validate(parsed)) {
    const errorText = validate.errors?.map((err: { instancePath?: string; message?: string }) => `${err.instancePath ?? ""} ${err.message ?? ""}`).join("; ");
    throw new Error(`LLM output failed schema validation: ${errorText}`);
  }

  return parsed as ToolPlan;
};
