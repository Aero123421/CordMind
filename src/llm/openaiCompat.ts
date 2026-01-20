import { ChatMessage, LLMAdapter } from "./types.js";

export type OpenAICompatConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  supportsJsonSchema: boolean;
};

export class OpenAICompatAdapter implements LLMAdapter {
  private baseUrl: string;
  private apiKey: string;
  private model: string;
  private supportsJsonSchema: boolean;

  constructor(config: OpenAICompatConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.supportsJsonSchema = config.supportsJsonSchema;
  }

  async generatePlan(messages: ChatMessage[], schema: Record<string, unknown>): Promise<string> {
    const responseFormat = this.supportsJsonSchema
      ? {
          type: "json_schema",
          json_schema: {
            name: "tool_plan",
            schema,
            strict: true
          }
        }
      : { type: "json_object" };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0,
        response_format: responseFormat
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`LLM request failed (${response.status}): ${text}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    return content;
  }
}
