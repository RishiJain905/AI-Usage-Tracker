export * from "./base";
export * from "./registry";

export { OpenAIProvider } from "./openai";
export { AnthropicProvider } from "./anthropic";
export { OllamaProvider } from "./ollama";
export { GLMProvider } from "./glm";
export { MiniMaxProvider } from "./minimax";
export { GeminiProvider } from "./gemini";
export { MistralProvider } from "./mistral";
export { GroqProvider } from "./groq";
export { UnknownProvider } from "./unknown";

import { providerRegistry } from "./registry";
import { OpenAIProvider } from "./openai";
import { AnthropicProvider } from "./anthropic";
import { OllamaProvider } from "./ollama";
import { GLMProvider } from "./glm";
import { MiniMaxProvider } from "./minimax";
import { GeminiProvider } from "./gemini";
import { MistralProvider } from "./mistral";
import { GroqProvider } from "./groq";

export function registerAllProviders(): void {
  providerRegistry.register(new OpenAIProvider());
  providerRegistry.register(new AnthropicProvider());
  providerRegistry.register(new OllamaProvider());
  providerRegistry.register(new GLMProvider());
  providerRegistry.register(new MiniMaxProvider());
  providerRegistry.register(new GeminiProvider());
  providerRegistry.register(new MistralProvider());
  providerRegistry.register(new GroqProvider());
}
