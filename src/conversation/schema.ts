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
    "Always keep reply concise and user-facing.",
    "Output example: {\"action\":\"none\",\"params\":{},\"destructive\":false,\"reply\":\"I can help if you rephrase.\"}",
    "Tool hints:",
    "- create_channel params: name (string, optional), type (text|voice|category|forum), parent_id, topic, user_limit (number, voice only).",
    "- If channel name is missing, choose a sensible default (e.g., voice-room, text-channel) and mention it in reply.",
    "- Voice channels only support a maximum user limit. If user gives a range like 2-10, set user_limit=10 and mention that minimum isn't supported."
  ].join("\n");
};
