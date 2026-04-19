import type { Provider, TransformedRequest } from "./base";
import type { ProxyRequest, TokenUsage } from "../types";

export class UnknownProvider implements Provider {
  name = "unknown";
  baseUrl = "";

  matchRequest(_path: string, _headers: Record<string, string>): boolean {
    // Unknown provider never matches — it's a fallback only
    return false;
  }

  transformRequest(request: ProxyRequest): TransformedRequest {
    return {
      url: request.endpoint,
      headers: { ...request.headers },
      body: request.body,
    };
  }

  extractUsage(requestBody: any, responseBody: any): TokenUsage | null {
    // Try OpenAI-compatible usage format
    const usage = responseBody?.usage;
    if (usage) {
      const promptTokens = usage.prompt_tokens ?? 0;
      const completionTokens = usage.completion_tokens ?? 0;
      const totalTokens = usage.total_tokens ?? promptTokens + completionTokens;
      if (promptTokens > 0 || completionTokens > 0 || totalTokens > 0) {
        return {
          promptTokens,
          completionTokens,
          totalTokens,
          modelId: requestBody?.model ?? responseBody?.model ?? "",
          providerId: "unknown",
        };
      }
    }

    // Try Anthropic format
    const anthropicUsage = responseBody?.usage;
    if (anthropicUsage?.input_tokens || anthropicUsage?.output_tokens) {
      const input = anthropicUsage.input_tokens ?? 0;
      const output = anthropicUsage.output_tokens ?? 0;
      return {
        promptTokens: input,
        completionTokens: output,
        totalTokens: input + output,
        modelId: requestBody?.model ?? "",
        providerId: "unknown",
      };
    }

    // Try Gemini format
    const metadata = responseBody?.usageMetadata;
    if (metadata) {
      const promptTokens = metadata.promptTokenCount ?? 0;
      const completionTokens = metadata.candidatesTokenCount ?? 0;
      const totalTokens =
        metadata.totalTokenCount ?? promptTokens + completionTokens;
      if (promptTokens > 0 || completionTokens > 0) {
        return {
          promptTokens,
          completionTokens,
          totalTokens,
          modelId: requestBody?.model ?? "",
          providerId: "unknown",
        };
      }
    }

    // No recognizable usage format found — log for debugging
    console.warn(
      "[UnknownProvider] Could not extract usage from response. " +
        "Request body keys:",
      Object.keys(requestBody ?? {}),
      "Response body keys:",
      Object.keys(responseBody ?? {}),
    );

    return null;
  }

  extractUsageFromChunks(chunks: string[]): TokenUsage | null {
    // Try OpenAI-compatible streaming
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
              providerId: "unknown",
            };
          }
        } catch {
          // Not valid JSON — skip
        }
      }
    }

    // Try Anthropic streaming format
    let inputTokens = 0;
    let outputTokens = 0;
    for (const chunk of chunks) {
      for (const line of chunk.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const payload = trimmed.slice("data: ".length);
        try {
          const parsed = JSON.parse(payload);
          if (parsed.type === "message_start" && parsed.message?.usage) {
            inputTokens = parsed.message.usage.input_tokens ?? inputTokens;
          }
          if (parsed.type === "message_delta" && parsed.usage) {
            outputTokens = parsed.usage.output_tokens ?? outputTokens;
          }
        } catch {
          // Not valid JSON — skip
        }
      }
    }
    if (inputTokens > 0 || outputTokens > 0) {
      return {
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens: inputTokens + outputTokens,
        modelId: "",
        providerId: "unknown",
      };
    }

    return null;
  }

  extractModel(requestBody: any): string {
    return requestBody?.model ?? requestBody?.modelId ?? "";
  }

  getDisplayName(): string {
    return "Unknown";
  }
}
