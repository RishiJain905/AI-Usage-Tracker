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
