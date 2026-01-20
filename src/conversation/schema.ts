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
    },
    actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          action: { type: "string" },
          params: { type: "object" },
          destructive: { type: "boolean" }
        },
        required: ["action", "params"]
      }
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
    "- Voice channels only support a maximum user limit. If user gives a range for a single channel, set user_limit to the max and mention that minimum isn't supported.",
    "- For multi-step requests, include an actions array of tool calls (and set top-level action/params to the first action).",
    "- Keep total actions reasonable; if more than 12 actions are needed, ask the user to narrow or split the request.",
    "- If a request explicitly asks for multiple channels across a range (e.g., \"2-10のVCをそれぞれ作って\"), expand into multiple actions with unique names like voice-room-2...voice-room-10."
  ].join("\n");
};
