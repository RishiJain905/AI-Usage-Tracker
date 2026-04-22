import { OpenAICompatibleProvider } from "./base";

export class MistralProvider extends OpenAICompatibleProvider {
  name = "mistral";
  baseUrl = "https://api.mistral.ai/";

  matchRequest(path: string, _headers: Record<string, string>): boolean {
    return path.startsWith("/v1/chat/completions");
  }

  getDisplayName(): string {
    return "Mistral";
  }
}
