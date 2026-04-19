import { OpenAICompatibleProvider } from "./base";

export class GroqProvider extends OpenAICompatibleProvider {
  name = "groq";
  baseUrl = "https://api.groq.com/";

  matchRequest(path: string, _headers: Record<string, string>): boolean {
    return path.startsWith("/openai/v1/chat/completions");
  }

  getDisplayName(): string {
    return "Groq";
  }

  extractUsage(
    requestBody: any,
    responseBody: any,
  ): import("../types").TokenUsage | null {
    const result = super.extractUsage(requestBody, responseBody);

    if (result) {
      // Groq responses include prompt_tokens_details.cached_tokens which
      // indicates how many prompt tokens were served from cache.
      // The standard TokenUsage interface doesn't carry this field yet, but
      // the cost engine can later use it to apply cache-discount pricing.
      // Example response shape:
      //   usage.prompt_tokens_details.cached_tokens
      void responseBody?.usage?.prompt_tokens_details?.cached_tokens;
    }

    return result;
  }
}
