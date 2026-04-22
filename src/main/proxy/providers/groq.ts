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
}
