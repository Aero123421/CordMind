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
    const schemaFormat = {
      type: "json_schema",
      json_schema: {
        name: "tool_plan",
        schema,
        strict: true
      }
    };
    const jsonObjectFormat = { type: "json_object" };

    const attempt = async (responseFormat?: Record<string, unknown>) => {
      const body: Record<string, unknown> = {
        model: this.model,
        messages,
        temperature: 0
      };
      if (responseFormat) {
        body.response_format = responseFormat;
      }

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(body)
      });

      const text = await response.text();
      if (!response.ok) {
        return { ok: false as const, status: response.status, text };
      }

      let data: { choices?: Array<{ message?: { content?: string } }> };
      try {
        data = JSON.parse(text) as { choices?: Array<{ message?: { content?: string } }> };
      } catch (error) {
        throw new Error(`LLM response JSON parse failed: ${text.slice(0, 200)}`);
      }

      return { ok: true as const, content: data.choices?.[0]?.message?.content ?? "" };
    };

    let result = await attempt(this.supportsJsonSchema ? schemaFormat : jsonObjectFormat);
    if (!result.ok && this.supportsJsonSchema) {
      result = await attempt(jsonObjectFormat);
    }
    if (!result.ok) {
      result = await attempt();
    }

    if (!result.ok) {
      throw new Error(`LLM request failed (${result.status}): ${result.text}`);
    }

    return result.content;
  }
}
