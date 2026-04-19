import type { Provider, TransformedRequest } from "./base";
import type { ProxyRequest, TokenUsage } from "../types";

export class AnthropicProvider implements Provider {
  name = "anthropic";
  baseUrl = "https://api.anthropic.com/";

  matchRequest(path: string, _headers: Record<string, string>): boolean {
    // Anthropic uses /v1/messages endpoint
    return path.startsWith("/v1/messages");
  }

  transformRequest(request: ProxyRequest): TransformedRequest {
    return {
      url: `${this.baseUrl}${request.endpoint}`,
      headers: { ...request.headers },
      body: request.body,
    };
  }

  extractUsage(requestBody: any, responseBody: any): TokenUsage | null {
    // Anthropic uses input_tokens / output_tokens instead of prompt_tokens / completion_tokens
    const usage = responseBody?.usage;
    if (!usage) return null;

    const inputTokens = usage.input_tokens ?? 0;
    const outputTokens = usage.output_tokens ?? 0;

    if (inputTokens === 0 && outputTokens === 0) return null;

    return {
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      totalTokens: inputTokens + outputTokens,
      modelId: requestBody?.model ?? responseBody?.model ?? "",
      providerId: this.name,
    };
  }

  extractUsageFromChunks(chunks: string[]): TokenUsage | null {
    // Anthropic streaming: two events carry usage:
    // 1. message_start → message.usage.input_tokens
    // 2. message_delta → usage.output_tokens
    let inputTokens = 0;
    let outputTokens = 0;
    let model = "";

    for (const chunk of chunks) {
      for (const line of chunk.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const payload = trimmed.slice("data: ".length);
        if (payload === "[DONE]") continue;

        try {
          const parsed = JSON.parse(payload);

          if (parsed.type === "message_start" && parsed.message) {
            const usage = parsed.message.usage;
            if (usage?.input_tokens) inputTokens = usage.input_tokens;
            if (parsed.message.model) model = parsed.message.model;
          }

          if (parsed.type === "message_delta") {
            const usage = parsed.usage;
            if (usage?.output_tokens) outputTokens = usage.output_tokens;
          }
        } catch {
          // Not valid JSON — skip
        }
      }
    }

    if (inputTokens === 0 && outputTokens === 0) return null;

    return {
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      totalTokens: inputTokens + outputTokens,
      modelId: model,
      providerId: this.name,
    };
  }

  extractModel(requestBody: any): string {
    return requestBody?.model ?? "";
  }

  getDisplayName(): string {
    return "Anthropic";
  }
}
