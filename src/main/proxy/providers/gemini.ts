import type { Provider, TransformedRequest } from "./base";
import type { ProxyRequest, TokenUsage } from "../types";

export class GeminiProvider implements Provider {
  name = "gemini";
  baseUrl = "https://generativelanguage.googleapis.com/";

  matchRequest(path: string, _headers: Record<string, string>): boolean {
    // Gemini: /v1beta/models/{model}:generateContent or :streamGenerateContent
    // Also /v1/models/... paths
    return /\/v1(?:beta)?\/models\//.test(path);
  }

  transformRequest(request: ProxyRequest): TransformedRequest {
    // Gemini uses URL param `key=` for auth, not header auth
    // The proxy server handles key injection already, so just forward
    return {
      url: `${this.baseUrl}${request.endpoint}`,
      headers: { ...request.headers },
      body: request.body,
    };
  }

  extractUsage(requestBody: any, responseBody: any): TokenUsage | null {
    // Gemini uses usageMetadata with *TokenCount suffix
    const metadata = responseBody?.usageMetadata;
    if (!metadata) return null;

    const promptTokens = metadata.promptTokenCount ?? 0;
    const completionTokens = metadata.candidatesTokenCount ?? 0;
    const totalTokens =
      metadata.totalTokenCount ?? promptTokens + completionTokens;

    if (promptTokens === 0 && completionTokens === 0 && totalTokens === 0)
      return null;

    // Extract model from URL path or response
    const model = this.extractModel(requestBody);

    return {
      promptTokens,
      completionTokens,
      totalTokens,
      modelId: model,
      providerId: this.name,
    };
  }

  extractUsageFromChunks(chunks: string[]): TokenUsage | null {
    // Gemini streaming: each chunk may contain usageMetadata
    // The final chunk typically has the complete usage
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;
    const model = "";

    for (const chunk of chunks) {
      for (const line of chunk.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const payload = trimmed.slice("data: ".length);
        if (payload === "[DONE]") continue;

        try {
          const parsed = JSON.parse(payload);
          const metadata = parsed?.usageMetadata;
          if (!metadata) continue;

          // Take the last (most complete) usage metadata
          const pt = metadata.promptTokenCount ?? 0;
          const ct = metadata.candidatesTokenCount ?? 0;
          const tt = metadata.totalTokenCount ?? pt + ct;

          if (pt > 0 || ct > 0 || tt > 0) {
            promptTokens = pt;
            completionTokens = ct;
            totalTokens = tt;
          }
        } catch {
          // Not valid JSON — skip
        }
      }
    }

    if (promptTokens === 0 && completionTokens === 0 && totalTokens === 0)
      return null;

    return {
      promptTokens,
      completionTokens,
      totalTokens,
      modelId: model,
      providerId: this.name,
    };
  }

  extractModel(requestBody: any): string {
    // Gemini passes model in the URL path, not body
    // The request body may not have a model field
    // Fallback: try to get from body, otherwise empty string
    return requestBody?.model ?? "";
  }

  getDisplayName(): string {
    return "Google Gemini";
  }
}
