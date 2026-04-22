// Proxy server types — shared between proxy, IPC, and renderer layers

export interface ProxyRequest {
  id: string;
  provider: string;
  model: string;
  endpoint: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
  timestamp: Date;
}

export interface ProxyResponse {
  requestId: string;
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  usage?: TokenUsage;
  timestamp: Date;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  modelId: string;
  providerId: string;
  cachedReadTokens?: number;
  cachedWriteTokens?: number;
  imageTokens?: number;
  audioTokens?: number;
  reasoningTokens?: number;
  imageCount?: number;
  isEstimated?: boolean;
  estimationSource?: TokenEstimationSource | null;
}

export type TokenEstimationSource =
  | "chat-messages"
  | "request-text"
  | "response-text"
  | "request-response-text"
  | "stream-text"
  | "image-count";

export function createTokenUsage(
  usage: Pick<
    TokenUsage,
    | "promptTokens"
    | "completionTokens"
    | "totalTokens"
    | "modelId"
    | "providerId"
  > &
    Partial<
      Omit<
        TokenUsage,
        | "promptTokens"
        | "completionTokens"
        | "totalTokens"
        | "modelId"
        | "providerId"
      >
    >,
): TokenUsage {
  return {
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    totalTokens: usage.totalTokens,
    modelId: usage.modelId,
    providerId: usage.providerId,
    cachedReadTokens: usage.cachedReadTokens ?? 0,
    cachedWriteTokens: usage.cachedWriteTokens ?? 0,
    imageTokens: usage.imageTokens ?? 0,
    audioTokens: usage.audioTokens ?? 0,
    reasoningTokens: usage.reasoningTokens ?? 0,
    imageCount: usage.imageCount ?? 0,
    isEstimated: usage.isEstimated ?? false,
    estimationSource: usage.estimationSource ?? null,
  };
}

export type ProxyEventType =
  | "request-started"
  | "request-completed"
  | "request-error";

export interface ProxyEvent {
  type: ProxyEventType;
  data: ProxyRequest | (ProxyRequest & ProxyResponse);
}

export interface ProxyStatus {
  isRunning: boolean;
  port: number | null;
}

export type ProviderAuthMode = "passthrough" | "inject";

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  authMode: ProviderAuthMode;
  apiKey?: string;
}

export interface ProviderInfo {
  id: string;
  name: string;
  baseUrl: string;
}
