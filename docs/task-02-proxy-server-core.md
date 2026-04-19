# Task 2: Proxy Server Core

## Objective
Build the local proxy server that intercepts API requests, forwards them to the real provider endpoints, and captures token usage from responses.

## Architecture

```
Client Request → Local Proxy (:8765) → Provider API
                     ↓
              Extract tokens from response
                     ↓
              Store in SQLite DB
                     ↓
              Return response to client
```

The proxy runs as part of the Electron main process (or as a child process) so it starts automatically when the app launches.

## Steps

### 2.1 Create the proxy server

File: `src/main/proxy/server.ts`

Create an HTTP server using Node.js `http` module that:
- Listens on a configurable port (default 8765)
- Handles all HTTP methods (GET, POST, PUT, DELETE, PATCH)
- Supports both regular and streaming (SSE) responses
- Adds CORS headers for local development

```typescript
interface ProxyRequest {
  id: string;
  provider: string;
  model: string;
  endpoint: string;
  method: string;
  headers: Record<string, string>;
  body: any;
  timestamp: Date;
}

interface ProxyResponse {
  requestId: string;
  statusCode: number;
  headers: Record<string, string>;
  body: any;
  usage?: TokenUsage;
  timestamp: Date;
}

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  modelId: string;       // REQUIRED: Every token event MUST be attributed to a specific model
  providerId: string;    // REQUIRED: Every token event MUST be attributed to a specific provider
}

// The proxy logs EVERY request with model-level granularity.
// This enables both:
//   1. Per-model tracking (each model's tokens counted separately)
//   2. Aggregate totals (sum across all models for daily/weekly/all-time)
// The model and provider are extracted from the request body before forwarding.
```

### 2.2 Implement request routing

The proxy must route requests to the correct provider based on the URL path prefix:

| Path Prefix | Provider | Forward To |
|-------------|----------|------------|
| `/openai/`  | OpenAI   | `https://api.openai.com/` |
| `/anthropic/` | Anthropic | `https://api.anthropic.com/` |
| `/ollama/`  | Ollama   | Configurable: Local default `http://localhost:11434/`, Cloud `https://ollama.com/v1/` |
| `/glm/`     | GLM/ZhipuAI | `https://api.z.ai/` |
| `/minimax/` | MiniMax  | `https://api.minimax.chat/` |
| `/gemini/`  | Google   | `https://generativelanguage.googleapis.com/` |
| `/mistral/` | Mistral  | `https://api.mistral.ai/` |
| `/groq/`    | Groq     | `https://api.groq.com/` |

Extract the provider from the path, strip the prefix, and forward the remainder to the provider's base URL.

### 2.3 Implement request forwarding

Use Node.js `http`/`https` modules to forward requests:
- Pipe the original request body
- Forward all relevant headers (Authorization, Content-Type, etc.)
- **API key handling** (two modes per provider, configured in settings):
  - **Pass-through mode (default)**: Forward the client's `Authorization` header unchanged — the client app already has its own key
  - **Inject mode**: Strip the client's `Authorization` header and replace it with the stored API key for that provider — useful for centralized key management
- Handle both JSON and multipart form-data
- Support request timeouts (configurable, default 120s)

### 2.3a Implement header sanitization for logging

**CRITICAL SECURITY**: The proxy logs all requests and responses for tracking. API keys MUST NEVER appear in any log, event, or IPC message.

```typescript
// Sensitive headers that must be stripped from all logging
const SENSITIVE_HEADERS = [
  'authorization',
  'x-api-key',
  'api-key',
  'cookie',
  'set-cookie',
  'proxy-authorization',
];

// Sanitize headers before logging or emitting events
function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const sanitized = { ...headers };
  for (const key of Object.keys(sanitized)) {
    if (SENSITIVE_HEADERS.includes(key.toLowerCase())) {
      const value = sanitized[key];
      // Mask: "Bearer sk-proj-abc123..." → "Bearer sk-pr...3"
      if (value.length > 8) {
        sanitized[key] = value.slice(0, 6) + '...' + value.slice(-2);
      } else {
        sanitized[key] = '****';
      }
    }
  }
  return sanitized;
}
```

Apply sanitization to:
- All `ProxyRequest` and `ProxyResponse` objects emitted via IPC
- All log entries stored in `usage_logs`
- All debug/error output to console
- The request body (for Gemini, which passes the key as a URL parameter — strip `key=` from logged URLs)

### 2.3b Local proxy security boundary

The proxy listens on `localhost:8765` (or configured port). Security implications:

- **Same-machine access**: Any application on the user's machine can connect to the proxy and send requests. This is by design — client apps (Cursor, custom scripts, etc.) need to reach it.
- **Inject mode risk**: When "Proxy Injects Key" mode is enabled for a provider, ANY local app can make requests to `http://localhost:8765/openai/v1/...` and the proxy will inject the stored API key. This means the key is accessible to any local process. **Mitigate by:**
  - Clearly warning the user when they enable inject mode
  - Logging which app/IP made each request (the `app_name` field)
  - Recommending pass-through mode for most users
- **No external access**: The proxy binds to `127.0.0.1` only (not `0.0.0.0`). No remote machine can connect.
- **HTTPS**: All forwarded requests to provider APIs use HTTPS. Tokens between proxy and provider are encrypted in transit.
- **Database file permissions**: The SQLite DB is stored in `app.getPath('userData')` which uses the OS's default per-user directory permissions. Other users on the same machine cannot read it (assuming standard OS multi-user isolation).

### 2.4 Handle streaming responses

Many providers return Server-Sent Events (SSE) for streaming. The proxy must:
- Detect SSE responses (`text/event-stream` content type)
- Buffer the stream to extract the final usage data
- Stream data to the client in real-time (don't block)
- Parse the final `[DONE]` event or aggregate usage from stream chunks

For OpenAI streaming, the last chunk before `[DONE]` often contains usage data if `stream_options: { include_usage: true }` is set.

For Anthropic streaming, `message_stop` or `message_delta` events contain usage.

### 2.5 Integrate with Electron main process

File: `src/main/index.ts`

- Start the proxy server when the app launches
- Stop it when the app quits
- Expose the proxy port via IPC so the renderer can display it
- Handle port conflicts gracefully (try next available port)

```typescript
// In main process
let proxyServer: ProxyServer | null = null;

app.whenReady().then(async () => {
  proxyServer = new ProxyServer({ port: 8765 });
  await proxyServer.start();
  createWindow();
});

app.on('window-all-closed', () => {
  proxyServer?.stop();
  app.quit();
});
```

### 2.6 Add request/response logging hooks

Create an event emitter pattern so the proxy can notify listeners when a request completes:

```typescript
interface ProxyEvent {
  type: 'request-started' | 'request-completed' | 'request-error';
  data: ProxyRequest | (ProxyRequest & ProxyResponse);
}

// Emitter pattern — each event MUST include model-level data
// so that both per-model and aggregate (all-models-total) tracking work
proxyServer.on('request-completed', (event) => {
  // event.data includes: provider, model, promptTokens, completionTokens, totalTokens
  // Will be consumed by the database layer (Task 4) for per-model AND aggregate storage
  // and the IPC layer for real-time UI updates (per-model + total)
});
```

### 2.7 Error handling

Handle common failure scenarios:
- Provider unreachable → return 502 Bad Gateway with error details
- Invalid API key → forward the 401/403 from provider
- Request timeout → return 504 Gateway Timeout
- Malformed request → return 400 Bad Request
- Rate limiting → forward 429 with retry-after header

### 2.8 Health check endpoint

Add a `/health` endpoint that returns:
```json
{
  "status": "ok",
  "port": 8765,
  "providers": {
    "openai": "connected",
    "anthropic": "connected",
    "ollama": "offline"     // Status depends on configured base URL (local or cloud)
  }
}
```

## Verification
- Proxy starts on app launch
- Can forward a test request to OpenAI API and return the response
- Streaming responses are passed through without blocking
- Token usage is extracted from the response **and attributed to the correct model**
- Every logged event includes `modelId` and `providerId` (required for per-model + aggregate tracking)
- `/health` endpoint returns correct status
- Proxy stops cleanly on app quit
- Port conflicts are handled gracefully

## Core Tracking Requirements
This task establishes the foundation for two critical tracking features:
1. **Per-model tracking**: Every request MUST be tagged with the model that handled it. Users use multiple models throughout the day and need to see each one separately.
2. **Aggregate totals**: The proxy emits events that can be summed across all models to produce daily/weekly/all-time totals. The database layer (Task 4) and UI layer (Tasks 7-9) consume these events to power both views.

## Dependencies
- Task 1 (Project Scaffolding)

## Estimated Time
4-5 hours
