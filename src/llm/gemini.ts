import { ChatMessage, LLMAdapter } from "./types.js";

export type GeminiConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

const formatPrompt = (messages: ChatMessage[]): string => {
  return messages
    .map((message) => {
      const label = message.role.toUpperCase();
      return `${label}: ${message.content}`;
    })
    .join("\n");
};

export class GeminiAdapter implements LLMAdapter {
  private baseUrl: string;
  private apiKey: string;
  private model: string;

  constructor(config: GeminiConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.apiKey = config.apiKey;
    this.model = config.model;
  }

  async generatePlan(messages: ChatMessage[], schema: Record<string, unknown>): Promise<string> {
    const prompt = formatPrompt(messages);
    const response = await fetch(
      `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            response_mime_type: "application/json",
            response_schema: schema
          }
        })
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Gemini request failed (${response.status}): ${text}`);
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const content =
      data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("") ?? "";

    return content;
  }
}
