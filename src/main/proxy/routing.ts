import { ProviderConfig } from "./types";

export const PROVIDER_ROUTES: Record<
  string,
  Omit<ProviderConfig, "id" | "authMode" | "apiKey">
> = {
  openai: { name: "OpenAI", baseUrl: "https://api.openai.com/" },
  anthropic: { name: "Anthropic", baseUrl: "https://api.anthropic.com/" },
  ollama: { name: "Ollama", baseUrl: "http://localhost:11434/" },
  glm: { name: "GLM", baseUrl: "https://api.z.ai/" },
  minimax: { name: "MiniMax", baseUrl: "https://api.minimax.chat/" },
  gemini: {
    name: "Google",
    baseUrl: "https://generativelanguage.googleapis.com/",
  },
  mistral: { name: "Mistral", baseUrl: "https://api.mistral.ai/" },
  groq: { name: "Groq", baseUrl: "https://api.groq.com/" },
};

/**
 * Extract the provider ID and target path from an incoming request URL.
 *
 * Convention:  /{providerId}/...rest  →  { provider, targetPath }
 *
 * Examples:
 *   /openai/v1/chat/completions       → { provider: 'openai',    targetPath: '/v1/chat/completions' }
 *   /anthropic/v1/messages            → { provider: 'anthropic', targetPath: '/v1/messages' }
 *   /gemini/v1/models/gemini-pro      → { provider: 'gemini',    targetPath: '/v1/models/gemini-pro' }
 *
 * Returns `null` when the path is too short or the first segment is not a known provider.
 */
export function extractProvider(
  path: string,
): { provider: string; targetPath: string } | null {
  // Strip leading slash, then split
  const segments = path.replace(/^\//, "").split("/");

  if (segments.length < 2) {
    return null;
  }

  const provider = segments[0].toLowerCase();

  if (!(provider in PROVIDER_ROUTES)) {
    return null;
  }

  const targetPath = "/" + segments.slice(1).join("/");

  return { provider, targetPath };
}

/**
 * Look up the ProviderConfig-style route data for a given provider ID.
 * Returns `undefined` when the provider is unknown.
 */
export function getProviderRoute(
  providerId: string,
): Omit<ProviderConfig, "id" | "authMode" | "apiKey"> | undefined {
  return PROVIDER_ROUTES[providerId];
}
