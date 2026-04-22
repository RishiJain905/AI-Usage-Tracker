export type ProviderId =
  | "openai"
  | "anthropic"
  | "ollama"
  | "glm"
  | "minimax"
  | "gemini"
  | "mistral"
  | "groq"
  | string;

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  icon: string | null;
  isActive: boolean;
}

export interface ProviderStatus {
  id: string;
  name: string;
  isConnected: boolean;
  lastRequestAt: string | null;
  totalRequests: number;
}

export interface ModelInfo {
  id: string;
  providerId: string;
  name: string;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  isLocal: boolean;
}
