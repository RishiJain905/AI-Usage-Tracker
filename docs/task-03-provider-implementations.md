# Task 3: Provider Implementations

## Objective
Implement provider-specific logic to extract token usage from each API's request/response format. Each provider has different API structures, authentication methods, and usage reporting.

## Steps

### 3.1 Create base provider interface

File: `src/main/proxy/providers/base.ts`

```typescript
interface Provider {
  name: string;
  baseUrl: string;

  // Route detection: does this request belong to this provider?
  matchRequest(path: string, headers: Record<string, string>): boolean;

  // Transform the request before forwarding
  transformRequest(request: ProxyRequest): TransformedRequest;

  // Extract token usage from the response
  extractUsage(requestBody: any, responseBody: any): TokenUsage | null;

  // Extract usage from a streaming chunk
  extractUsageFromChunk(chunk: string): Partial<TokenUsage> | null;

  // Determine model name from request
  extractModel(requestBody: any): string;

  // Get provider display name
  getDisplayName(): string;
}
```

### 3.2 OpenAI provider

File: `src/main/proxy/providers/openai.ts`

**API Format:**
- Endpoint: `/v1/chat/completions`, `/v1/completions`, `/v1/embeddings`, `/v1/images/generations`
- Auth: `Authorization: Bearer sk-...`
- Response usage field:
```json
{
  "usage": {
    "prompt_tokens": 50,
    "completion_tokens": 150,
    "total_tokens": 200
  }
}
```
- Streaming: Last chunk with `stream_options.include_usage: true` contains usage
- Model field: `requestBody.model`

**Special handling:**
- GPT-4o, GPT-4-turbo, GPT-3.5-turbo have different pricing
- Image generation (DALL-E) has per-image pricing, not token-based
- Embeddings use different token counting

### 3.3 Anthropic provider

File: `src/main/proxy/providers/anthropic.ts`

**API Format:**
- Endpoint: `/v1/messages`
- Auth: `x-api-key: sk-ant-...` + `anthropic-version: 2023-06-01`
- Response usage field:
```json
{
  "usage": {
    "input_tokens": 100,
    "output_tokens": 50
  }
}
```
- Streaming: `message_delta` event contains `usage.output_tokens`
- Model field: `requestBody.model`
- Note: Anthropic uses `input_tokens`/`output_tokens` instead of `prompt_tokens`/`completion_tokens`

### 3.4 Ollama provider

File: `src/main/proxy/providers/ollama.ts`

**Ollama has TWO distinct API modes** — local and cloud — with different response formats:

**Local Ollama API:**
- Endpoint: `/api/chat`, `/api/generate`, `/api/embeddings`
- Base URL: `http://localhost:11434` (default, configurable)
- Auth: None
- Response:
```json
{
  "prompt_eval_count": 50,
  "eval_count": 150
}
```
- Streaming: Each chunk has partial counts; final chunk has totals
- Note: May not always return token counts depending on version

**Cloud Ollama API (https://ollama.com/v1):**
- Endpoint: `/v1/chat/completions` (OpenAI-compatible!)
- Base URL: `https://ollama.com/v1` (default cloud URL, configurable)
- Auth: Bearer token (API key required)
- Response:
```json
{
  "usage": {
    "prompt_tokens": 50,
    "completion_tokens": 150,
    "total_tokens": 200
  }
}
```
- Streaming: OpenAI-compatible SSE with `stream_options.include_usage: true`
- Pricing: Per-token pricing applied based on model (user-configurable)

**Provider implementation must handle both modes:**
```typescript
class OllamaProvider implements Provider {
  // Detect mode from base URL
  isCloudMode(baseUrl: string): boolean {
    return !baseUrl.includes('localhost') && !baseUrl.includes('127.0.0.1');
  }

  // Use different extraction logic based on mode
  extractUsage(requestBody: any, responseBody: any): TokenUsage | null {
    if (this.isCloudMode(this.baseUrl)) {
      // OpenAI-compatible format: usage.prompt_tokens / completion_tokens
      return {
        promptTokens: responseBody.usage?.prompt_tokens ?? 0,
        completionTokens: responseBody.usage?.completion_tokens ?? 0,
        totalTokens: responseBody.usage?.total_tokens ?? 0,
        modelId: requestBody.model,
        providerId: 'ollama',
      };
    } else {
      // Local Ollama format: prompt_eval_count / eval_count
      return {
        promptTokens: responseBody.prompt_eval_count ?? 0,
        completionTokens: responseBody.eval_count ?? 0,
        totalTokens: (responseBody.prompt_eval_count ?? 0) + (responseBody.eval_count ?? 0),
        modelId: requestBody.model,
        providerId: 'ollama',
      };
    }
  }
}
```

**Settings integration:**
- When user switches Ollama mode to "Cloud" in settings, base URL changes to `https://ollama.com/v1`
- API key becomes required
- Models under cloud Ollama are registered with `isLocal: false`
- Cloud Ollama models can have user-defined pricing for cost tracking

### 3.5 GLM (ZhipuAI) provider

File: `src/main/proxy/providers/glm.ts`

**API Format:**
- Endpoint: `/api/paas/v4/chat/completions`
- Auth: `Authorization: Bearer <token>` (JWT-based)
- Response usage:
```json
{
  "usage": {
    "prompt_tokens": 50,
    "completion_tokens": 150,
    "total_tokens": 200
  }
}
```
- Compatible with OpenAI format
- Models: `glm-4`, `glm-4-plus`, `glm-4-flash`, `glm-4v`

**ZhipuAI Usage API (for catch-up sync):**
ZhipuAI provides monitoring endpoints that can backfill missed tracking data if the proxy was down:

| Endpoint | Purpose |
|----------|---------|
| `https://api.z.ai/api/monitor/usage/quota/limit` | Current quota limits and percentages |
| `https://api.z.ai/api/monitor/usage/model-usage?startTime=...&endTime=...` | Model usage stats (24h rolling window) |
| `https://api.z.ai/api/monitor/usage/tool-usage?startTime=...&endTime=...` | MCP tool usage stats |

Authentication: `Authorization: {token}` (NO "Bearer" prefix — token is passed directly)

These endpoints enable a **catch-up sync** feature (see Task 12) that can import usage data retroactively when the proxy was offline.

### 3.6 MiniMax provider

File: `src/main/proxy/providers/minimax.ts`

**API Format:**
- Endpoint: `/v1/text/chatcompletion_v2`
- Auth: `Authorization: Bearer <token>`
- Response usage:
```json
{
  "usage": {
    "prompt_tokens": 50,
    "completion_tokens": 150,
    "total_tokens": 200
  }
}
```
- Note: MiniMax API v2 is OpenAI-compatible

### 3.7 Google Gemini provider

File: `src/main/proxy/providers/gemini.ts`

**API Format:**
- Endpoint: `/v1beta/models/{model}:generateContent`, `/v1beta/models/{model}:streamGenerateContent`
- Auth: URL parameter `key=<API_KEY>`
- Response usage:
```json
{
  "usageMetadata": {
    "promptTokenCount": 50,
    "candidatesTokenCount": 150,
    "totalTokenCount": 200
  }
}
```
- Note: Different field names (`TokenCount` suffix), auth via URL param

### 3.8 Mistral provider

File: `src/main/proxy/providers/mistral.ts`

**API Format:**
- Endpoint: `/v1/chat/completions`
- Auth: `Authorization: Bearer <token>`
- Response usage:
```json
{
  "usage": {
    "prompt_tokens": 50,
    "completion_tokens": 150,
    "total_tokens": 200
  }
}
```
- OpenAI-compatible format

### 3.9 Groq provider

File: `src/main/proxy/providers/groq.ts`

**API Format:**
- Endpoint: `/openai/v1/chat/completions`
- Auth: `Authorization: Bearer gsk_...`
- Response usage:
```json
{
  "usage": {
    "prompt_tokens": 50,
    "completion_tokens": 150,
    "total_tokens": 200
  },
  "usage_prompt_tokens_details": {
    "cached_tokens": 40
  }
}
```
- Note: Returns cached token details for prompt caching

### 3.10 Provider registry

File: `src/main/proxy/providers/registry.ts`

Create a registry that maps provider names to implementations:

```typescript
class ProviderRegistry {
  private providers: Map<string, Provider> = new Map();

  register(provider: Provider): void;
  get(name: string): Provider;
  getAll(): Provider[];
  detectProvider(path: string, headers: Record<string, string>): Provider | null;
}
```

### 3.11 Add unknown provider fallback

For providers not yet implemented, create a generic handler that:
- Attempts to find a `usage` field in the response (OpenAI-compatible)
- Logs the full request/response for debugging
- Marks the provider as "unknown" in the database

## Verification
- Each provider correctly extracts token usage from sample responses
- Streaming responses are parsed correctly
- Provider detection works based on request path
- Unknown providers fall back gracefully
- Unit tests pass for each provider with mock data

## Dependencies
- Task 2 (Proxy Server Core)

## Estimated Time
5-6 hours
