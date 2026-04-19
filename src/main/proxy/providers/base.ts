import type { ProxyRequest, TokenUsage } from "../types";

export interface TransformedRequest {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

export interface Provider {
  name: string;
  baseUrl: string;
  matchRequest(path: string, headers: Record<string, string>): boolean;
  transformRequest(request: ProxyRequest): TransformedRequest;
  extractUsage(requestBody: any, responseBody: any): TokenUsage | null;
  extractUsageFromChunks(chunks: string[]): TokenUsage | null;
  extractModel(requestBody: any): string;
  getDisplayName(): string;
}

export abstract class OpenAICompatibleProvider implements Provider {
  abstract name: string;
  abstract baseUrl: string;

  abstract matchRequest(path: string, headers: Record<string, string>): boolean;

  transformRequest(request: ProxyRequest): TransformedRequest {
    return {
      url: `${this.baseUrl}${request.endpoint}`,
      headers: { ...request.headers },
      body: request.body,
    };
  }

  extractUsage(_requestBody: any, responseBody: any): TokenUsage | null {
    const usage = responseBody?.usage;
    if (!usage) return null;

    const promptTokens = usage.prompt_tokens ?? 0;
    const completionTokens = usage.completion_tokens ?? 0;
    const totalTokens = usage.total_tokens ?? promptTokens + completionTokens;

    if (promptTokens === 0 && completionTokens === 0 && totalTokens === 0) {
      return null;
    }

    return {
      promptTokens,
      completionTokens,
      totalTokens,
      modelId: responseBody?.model ?? "",
      providerId: this.name,
    };
  }

  extractUsageFromChunks(chunks: string[]): TokenUsage | null {
    // Scan SSE chunks from the end — usage is typically in the last chunk
    for (let i = chunks.length - 1; i >= 0; i--) {
      const chunk = chunks[i];

      for (const line of chunk.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;

        const payload = trimmed.slice("data: ".length);
        if (payload === "[DONE]") continue;

        try {
          const parsed = JSON.parse(payload);
          const usage = parsed?.usage;
          if (!usage) continue;

          const promptTokens = usage.prompt_tokens ?? 0;
          const completionTokens = usage.completion_tokens ?? 0;
          const totalTokens =
            usage.total_tokens ?? promptTokens + completionTokens;

          if (
            promptTokens === 0 &&
            completionTokens === 0 &&
            totalTokens === 0
          ) {
            continue;
          }

          return {
            promptTokens,
            completionTokens,
            totalTokens,
            modelId: parsed?.model ?? "",
            providerId: this.name,
          };
        } catch {
          // Not valid JSON — skip
        }
      }
    }

    return null;
  }

  extractModel(requestBody: any): string {
    return requestBody?.model ?? "";
  }

  getDisplayName(): string {
    return this.name;
  }
}
