import { ProviderName } from "../constants.js";
import { config } from "../config.js";
import { OpenAICompatAdapter } from "./openaiCompat.js";
import { GeminiAdapter } from "./gemini.js";
import type { LLMAdapter } from "./types.js";

const supportsJsonSchemaProviders = new Set<ProviderName>(["xai", "groq", "cerebras"]);

export const createAdapter = (input: {
  provider: ProviderName;
  apiKey: string;
  model: string;
}): LLMAdapter => {
  const { provider, apiKey, model } = input;
  if (provider === "gemini") {
    return new GeminiAdapter({
      baseUrl: config.providerBaseUrls.gemini,
      apiKey,
      model
    });
  }

  return new OpenAICompatAdapter({
    baseUrl: config.providerBaseUrls[provider],
    apiKey,
    model,
    supportsJsonSchema: supportsJsonSchemaProviders.has(provider)
  });
};
