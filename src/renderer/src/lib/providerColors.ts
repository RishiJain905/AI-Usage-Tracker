export const PROVIDER_COLORS: Record<string, string> = {
  openai: "#10a37f",
  anthropic: "#d4a574",
  ollama: "#6366f1",
  glm: "#3b82f6",
  minimax: "#f59e0b",
  gemini: "#8b5cf6",
  mistral: "#ef4444",
  groq: "#06b6d4",
};

export const FALLBACK_COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#6366f1",
  "#14b8a6",
  "#f97316",
  "#ef4444",
  "#84cc16",
];

/** Get color for a provider, falling back to blue then sequential colors. */
export function getProviderColor(providerId: string): string {
  if (PROVIDER_COLORS[providerId]) return PROVIDER_COLORS[providerId];
  return FALLBACK_COLORS[0] ?? "#3b82f6";
}

/** Get color for a model based on its provider. */
export function getModelColor(providerId: string, modelIndex: number): string {
  const providerColor = PROVIDER_COLORS[providerId];
  if (providerColor) return providerColor;
  return FALLBACK_COLORS[modelIndex % FALLBACK_COLORS.length] ?? "#3b82f6";
}
