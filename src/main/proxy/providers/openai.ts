import { OpenAICompatibleProvider } from "./base";

export class OpenAIProvider extends OpenAICompatibleProvider {
  name = "openai";
  baseUrl = "https://api.openai.com/";

  matchRequest(path: string, _headers: Record<string, string>): boolean {
    return (
      path.startsWith("/v1/chat/completions") ||
      path.startsWith("/v1/completions") ||
      path.startsWith("/v1/embeddings") ||
      path.startsWith("/v1/images/generations")
    );
  }

  getDisplayName(): string {
    return "OpenAI";
  }

  extractUsage(
    requestBody: any,
    responseBody: any,
  ): import("../types").TokenUsage | null {
    // Detect endpoint from the response context — embeddings and images have
    // different usage shapes than chat/completions.

    const model = responseBody?.model ?? requestBody?.model ?? "";

    // DALL-E image generation uses per-image pricing, not token-based billing.
    // Return null so the caller knows this wasn't a token-based request.
    if (model.startsWith("dall-e")) {
      // Image generation — not token-based, no TokenUsage to report.
      return null;
    }

    // Embeddings responses only include prompt_tokens (no completion_tokens).
    // The base class already handles this correctly because completion_tokens
    // will be absent (defaults to 0) and total_tokens may equal prompt_tokens.
    return super.extractUsage(requestBody, responseBody);
  }
}
