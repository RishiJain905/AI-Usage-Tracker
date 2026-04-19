import { OpenAICompatibleProvider } from "./base";

export class MiniMaxProvider extends OpenAICompatibleProvider {
  name = "minimax";
  baseUrl = "https://api.minimax.chat/";

  matchRequest(path: string, _headers: Record<string, string>): boolean {
    return (
      path.startsWith("/v1/text/chatcompletion_v2") ||
      path.startsWith("/v1/chat/completions")
    );
  }

  getDisplayName(): string {
    return "MiniMax";
  }
}
