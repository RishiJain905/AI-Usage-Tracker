import type { Provider, TransformedRequest } from "./base";
import type { ProxyRequest, TokenUsage } from "../types";

export class OllamaProvider implements Provider {
  name = "ollama";
  private _baseUrl: string;

  constructor(baseUrl: string = "http://localhost:11434/") {
    this._baseUrl = baseUrl;
  }

  get baseUrl(): string {
    return this._baseUrl;
  }

  private isCloudMode(): boolean {
    return (
      !this._baseUrl.includes("localhost") &&
      !this._baseUrl.includes("127.0.0.1")
    );
  }

  matchRequest(path: string, _headers: Record<string, string>): boolean {
    if (this.isCloudMode()) {
      // Cloud mode: OpenAI-compatible endpoints
      return (
        path.startsWith("/v1/chat/completions") ||
        path.startsWith("/v1/completions")
      );
    }
    // Local mode
    return (
      path.startsWith("/api/chat") ||
      path.startsWith("/api/generate") ||
      path.startsWith("/api/embeddings")
    );
  }

  transformRequest(request: ProxyRequest): TransformedRequest {
    return {
      url: new URL(request.endpoint, this._baseUrl).toString(),
      headers: { ...request.headers },
      body: request.body,
    };
  }

  extractUsage(requestBody: any, responseBody: any): TokenUsage | null {
    if (this.isCloudMode()) {
      // Cloud: OpenAI-compatible format
      const usage = responseBody?.usage;
      if (!usage) return null;
      const promptTokens = usage.prompt_tokens ?? 0;
      const completionTokens = usage.completion_tokens ?? 0;
      const totalTokens = usage.total_tokens ?? promptTokens + completionTokens;
      if (promptTokens === 0 && completionTokens === 0) return null;
      return {
        promptTokens,
        completionTokens,
        totalTokens,
        modelId: requestBody?.model ?? "",
        providerId: this.name,
      };
    } else {
      // Local: prompt_eval_count / eval_count format
      const promptTokens = responseBody?.prompt_eval_count ?? 0;
      const completionTokens = responseBody?.eval_count ?? 0;
      if (promptTokens === 0 && completionTokens === 0) return null;
      return {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        modelId: requestBody?.model ?? "",
        providerId: this.name,
      };
    }
  }

  extractUsageFromChunks(chunks: string[]): TokenUsage | null {
    if (this.isCloudMode()) {
      return this.extractCloudStreamUsage(chunks);
    } else {
      return this.extractLocalStreamUsage(chunks);
    }
  }

  private extractCloudStreamUsage(chunks: string[]): TokenUsage | null {
    // OpenAI-compatible SSE: scan from end for usage block
    for (let i = chunks.length - 1; i >= 0; i--) {
      for (const line of chunks[i].split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const payload = trimmed.slice("data: ".length);
        if (payload === "[DONE]") continue;
        try {
          const parsed = JSON.parse(payload);
          const usage = parsed?.usage;
          if (!usage) continue;
          const pt = usage.prompt_tokens ?? 0;
          const ct = usage.completion_tokens ?? 0;
          const tt = usage.total_tokens ?? pt + ct;
          if (pt > 0 || ct > 0 || tt > 0) {
            return {
              promptTokens: pt,
              completionTokens: ct,
              totalTokens: tt,
              modelId: parsed?.model ?? "",
              providerId: this.name,
            };
          }
        } catch {
          // Not valid JSON — skip
        }
      }
    }
    return null;
  }

  private extractLocalStreamUsage(chunks: string[]): TokenUsage | null {
    // Local Ollama streaming: each line is a JSON object
    // The final chunk has the complete token counts
    let promptTokens = 0;
    let completionTokens = 0;
    let model = "";

    for (const chunk of chunks) {
      for (const line of chunk.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);
          // Take the latest non-zero values — final chunk has totals
          if (parsed.prompt_eval_count) promptTokens = parsed.prompt_eval_count;
          if (parsed.eval_count) completionTokens = parsed.eval_count;
          if (parsed.model) model = parsed.model;
        } catch {
          // Not valid JSON — skip
        }
      }
    }

    if (promptTokens === 0 && completionTokens === 0) return null;

    return {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      modelId: model,
      providerId: this.name,
    };
  }

  extractModel(requestBody: any, _requestPath?: string): string {
    return requestBody?.model ?? "";
  }

  getDisplayName(): string {
    return "Ollama";
  }
}
