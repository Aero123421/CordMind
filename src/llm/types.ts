export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ToolPlan = {
  action: string;
  params: Record<string, unknown>;
  destructive: boolean;
  reply: string;
  reason?: string;
};

export interface LLMAdapter {
  generatePlan(messages: ChatMessage[], schema: Record<string, unknown>): Promise<string>;
}
