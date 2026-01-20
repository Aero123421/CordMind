export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type PlannedAction = {
  action: string;
  params: Record<string, unknown>;
  destructive?: boolean;
};

export type ToolPlan = {
  action: string;
  params: Record<string, unknown>;
  destructive: boolean;
  reply: string;
  reason?: string;
  actions?: PlannedAction[];
};

export interface LLMAdapter {
  generatePlan(messages: ChatMessage[], schema: Record<string, unknown>): Promise<string>;
}
