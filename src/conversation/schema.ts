import { ALLOWED_ACTIONS, BANNED_ACTIONS } from "../constants.js";

export const toolPlanSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: {
      type: "string"
    },
    params: {
      type: "object"
    },
    destructive: {
      type: "boolean"
    },
    reply: {
      type: "string"
    },
    reason: {
      type: "string"
    }
  },
  required: ["action", "params", "destructive", "reply"]
} as const;

export const buildSystemPrompt = (): string => {
  const allowed = Array.from(ALLOWED_ACTIONS.values()).join(", ");
  const banned = Array.from(BANNED_ACTIONS.values()).join(", ");

  return [
    "You are a Discord server management assistant.",
    "Return ONLY JSON that matches the provided schema.",
    "Allowed actions: " + allowed + ".",
    "Never output banned actions: " + banned + ".",
    "If the request should not run, set action to 'none' and explain in reply.",
    "Set destructive=true if the action deletes, revokes access, or could cause irreversible change.",
    "Always keep reply concise and user-facing."
  ].join("\n");
};
