/**
 * Local proxy server for intercepting AI provider API requests.
 *
 * Routes incoming requests by provider prefix:
 *   /openai/v1/chat/completions → https://api.openai.com/v1/chat/completions
 *
 * Emits typed events (request-started, request-completed, request-error) with
 * per-request model information extracted from the request body.
 */

import * as http from "http";
import * as https from "https";
import { URL } from "url";
import { EventEmitter } from "events";
import { v4 as uuidv4 } from "uuid";

import {
  ProxyRequest,
  ProxyResponse,
  ProxyEvent,
  ProxyEventType,
  ProviderConfig,
  TokenUsage,
} from "./types";
import { extractProvider, getProviderRoute, PROVIDER_ROUTES } from "./routing";
import { sanitizeHeaders, sanitizeUrl } from "./security";
import { isSSEResponse, createStreamingHandler } from "./streaming";
import { providerRegistry, UnknownProvider } from "./providers";
import type { Provider } from "./providers/base";

/** Headers that should NOT be forwarded to the upstream provider. */
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
]);

export interface ProxyServerOptions {
  /** Port to bind to. Defaults to 8765. */
  port?: number;
  /** Upstream request timeout in milliseconds. Defaults to 120 000 (120 s). */
  timeout?: number;
  /** Per-provider configuration overrides (API keys, auth mode). */
  providers?: Partial<Record<string, Partial<ProviderConfig>>>;
}

type EventHandler = (event: ProxyEvent) => void;

export class ProxyServer {
  private server: http.Server | null = null;
  private readonly _port: number;
  private readonly timeout: number;
  private readonly emitter: EventEmitter;
  private readonly providers: Partial<Record<string, Partial<ProviderConfig>>>;
  private readonly unknownProvider: UnknownProvider;

  constructor(options: ProxyServerOptions = {}) {
    this._port = options.port ?? 8765;
    this.timeout = options.timeout ?? 120_000;
    this.emitter = new EventEmitter();
    this.providers = options.providers ?? {};
    this.unknownProvider = new UnknownProvider();
  }

  // ---------------------------------------------------------------------------
  // Public accessors
  // ---------------------------------------------------------------------------

  /** The port this server is configured to listen on. */
  get port(): number {
    return this._port;
  }

  /** Whether the server is currently listening. */
  get isRunning(): boolean {
    return this.server !== null && this.server.listening;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /** Start listening on 127.0.0.1:{port}. */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.server) {
        resolve();
        return;
      }

      this.server = http.createServer((req, res) =>
        this.handleRequest(req, res),
      );

      this.server.on("error", (err: Error) => {
        console.error("[ProxyServer] server error:", err.message);
        reject(err);
      });

      // Bind to localhost only — no remote access
      this.server.listen(this._port, "127.0.0.1", () => {
        console.info(`[ProxyServer] listening on 127.0.0.1:${this._port}`);
        resolve();
      });
    });
  }

  /** Gracefully stop the server. */
  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((err) => {
        if (err) {
          console.error("[ProxyServer] error during shutdown:", err.message);
          reject(err);
        } else {
          console.info("[ProxyServer] stopped");
          this.server = null;
          resolve();
        }
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Event subscription
  // ---------------------------------------------------------------------------

  on(eventType: ProxyEventType | "*", handler: EventHandler): void {
    this.emitter.on(eventType, handler);
  }

  off(eventType: ProxyEventType | "*", handler: EventHandler): void {
    this.emitter.off(eventType, handler);
  }

  private emitEvent(event: ProxyEvent): void {
    this.emitter.emit(event.type, event);
    this.emitter.emit("*", event);
  }

  // ---------------------------------------------------------------------------
  // Request handling
  // ---------------------------------------------------------------------------

  private handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): void {
    // --- CORS preflight -------------------------------------------------------
    if (req.method === "OPTIONS") {
      this.setCorsHeaders(res);
      res.writeHead(204);
      res.end();
      return;
    }

    // --- CORS on every response -----------------------------------------------
    this.setCorsHeaders(res);

    // --- Health check endpoint (must be before provider routing) ---------------
    if (req.method === "GET" && req.url === "/health") {
      this.handleHealthCheck(res);
      return;
    }

    // --- Root endpoint --------------------------------------------------------
    if (req.url === "/") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    const parsedUrl = new URL(req.url ?? "/", `http://127.0.0.1:${this._port}`);
    const routeResult = extractProvider(parsedUrl.pathname);

    if (!routeResult) {
      this.sendError(
        res,
        404,
        `Unknown provider or invalid path: ${parsedUrl.pathname}`,
      );
      return;
    }

    const { provider, targetPath } = routeResult;
    const route = getProviderRoute(provider);

    if (!route) {
      this.sendError(res, 404, `No route configured for provider: ${provider}`);
      return;
    }

    const requestId = uuidv4();
    const requestTimestamp = new Date();

    // Collect request body
    const bodyChunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => bodyChunks.push(chunk));
    req.on("end", () => {
      const rawBody = Buffer.concat(bodyChunks);
      let parsedBody: Record<string, unknown> | undefined = undefined;

      if (rawBody.length > 0) {
        try {
          parsedBody = JSON.parse(rawBody.toString("utf-8")) as Record<
            string,
            unknown
          >;
        } catch {
          parsedBody = undefined; // not JSON — forward as-is
        }
      }

      const providerImpl = providerRegistry.get(provider) ?? this.unknownProvider;
      const model =
        providerImpl.extractModel(parsedBody, targetPath) ||
        (typeof parsedBody?.model === "string"
          ? parsedBody.model
          : typeof parsedBody?.modelId === "string"
            ? parsedBody.modelId
            : "");

      // Build sanitized headers for event emission (NEVER emit raw headers)
      const incomingHeaders = this.headersToRecord(req.headers);
      const sanitizedHeaders = sanitizeHeaders(incomingHeaders);

      const proxyRequest: ProxyRequest = {
        id: requestId,
        provider,
        model,
        endpoint: targetPath,
        method: req.method ?? "GET",
        headers: sanitizedHeaders,
        body: parsedBody,
        timestamp: requestTimestamp,
      };

      this.emitEvent({ type: "request-started", data: proxyRequest });

      console.info(
        `[ProxyServer] → ${req.method} /${provider}${targetPath} (model=${model || "unknown"})`,
      );

      this.forwardRequest(
        req,
        res,
        provider,
        targetPath,
        rawBody,
        proxyRequest,
      );
    });

    req.on("error", (err: Error) => {
      console.error("[ProxyServer] request stream error:", err.message);
      const fallbackRequest: ProxyRequest = {
        id: requestId,
        provider,
        model: "",
        endpoint: "",
        method: req.method ?? "GET",
        headers: {},
        body: undefined,
        timestamp: requestTimestamp,
      };
      this.emitEvent({
        type: "request-error",
        data: {
          ...fallbackRequest,
          error: err.message,
        } as ProxyRequest & { error: string },
      });
      this.sendError(res, 400, `Request error: ${err.message}`);
    });
  }

  // ---------------------------------------------------------------------------
  // Health check
  // ---------------------------------------------------------------------------

  private handleHealthCheck(res: http.ServerResponse): void {
    const knownProviders = Object.keys(PROVIDER_ROUTES);
    const providerStatuses: Record<string, string> = {};

    for (const id of knownProviders) {
      // Mark Ollama as offline (local service) and cloud providers as connected
      providerStatuses[id] = id === "ollama" ? "offline" : "connected";
    }

    const health = {
      status: "ok" as const,
      port: this._port,
      providers: providerStatuses,
    };

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(health));
  }

  // ---------------------------------------------------------------------------
  // Forwarding
  // ---------------------------------------------------------------------------

  private forwardRequest(
    incomingReq: http.IncomingMessage,
    clientRes: http.ServerResponse,
    provider: string,
    targetPath: string,
    rawBody: Buffer,
    proxyRequest: ProxyRequest,
  ): void {
    const route = getProviderRoute(provider)!;
    const providerConfig = this.providers[provider];

    // Build target URL
    const targetUrl = new URL(targetPath, route.baseUrl);
    // Preserve query string from the original request
    const originalUrl = new URL(
      incomingReq.url ?? "/",
      `http://127.0.0.1:${this._port}`,
    );
    for (const [key, value] of originalUrl.searchParams) {
      targetUrl.searchParams.set(key, value);
    }

    console.info(`[ProxyServer]   ↑ ${sanitizeUrl(targetUrl.toString())}`);

    // Build forwarding headers
    const forwardHeaders: Record<string, string> = {};
    const authMode = providerConfig?.authMode ?? "passthrough";

    for (const [key, value] of Object.entries(
      this.headersToRecord(incomingReq.headers),
    )) {
      const lower = key.toLowerCase();

      // Skip hop-by-hop headers
      if (HOP_BY_HOP_HEADERS.has(lower)) continue;

      // Handle auth headers based on mode
      if (
        lower === "authorization" ||
        lower === "x-api-key" ||
        lower === "api-key"
      ) {
        if (authMode === "inject" && providerConfig?.apiKey) {
          // Strip client's header — will be replaced below
          continue;
        }
        // passthrough: forward client's header as-is
        forwardHeaders[key] = value;
        continue;
      }

      forwardHeaders[key] = value;
    }

    // Inject stored API key when configured
    if (authMode === "inject" && providerConfig?.apiKey) {
      if (provider === "gemini") {
        // Gemini uses query param
        targetUrl.searchParams.set("key", providerConfig.apiKey);
      } else if (provider === "anthropic") {
        forwardHeaders["x-api-key"] = providerConfig.apiKey;
      } else {
        forwardHeaders["authorization"] = `Bearer ${providerConfig.apiKey}`;
      }
    }

    // Ensure content-length is set correctly for the forwarded body
    forwardHeaders["content-length"] = String(rawBody.length);

    // Determine http or https
    const isSecure = targetUrl.protocol === "https:";
    const transport = isSecure ? https : http;

    const proxyReq = transport.request(
      {
        hostname: targetUrl.hostname,
        port: targetUrl.port || (isSecure ? 443 : 80),
        path: targetUrl.pathname + targetUrl.search,
        method: incomingReq.method,
        headers: forwardHeaders,
        timeout: this.timeout,
      },
      (upstreamRes) => {
        this.handleUpstreamResponse(upstreamRes, clientRes, proxyRequest);
      },
    );

    // --- Timeout ---------------------------------------------------------------
    proxyReq.on("timeout", () => {
      console.error(
        `[ProxyServer]   ✗ upstream timeout after ${this.timeout}ms for ${provider}${targetPath}`,
      );
      proxyReq.destroy();
      this.emitEvent({
        type: "request-error",
        data: {
          ...proxyRequest,
          error: `Upstream timeout after ${this.timeout}ms`,
        } as ProxyRequest & { error: string },
      });
      this.sendError(clientRes, 504, "Gateway timeout");
    });

    // --- Network errors --------------------------------------------------------
    proxyReq.on("error", (err: Error) => {
      console.error(`[ProxyServer]   ✗ upstream error: ${err.message}`);
      this.emitEvent({
        type: "request-error",
        data: {
          ...proxyRequest,
          error: err.message,
        } as ProxyRequest & { error: string },
      });

      // Map common connection errors to appropriate status codes
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ECONNREFUSED") {
        this.sendError(clientRes, 502, `Upstream unreachable: ${err.message}`);
      } else if (code === "ENOTFOUND") {
        this.sendError(clientRes, 502, `DNS resolution failed: ${err.message}`);
      } else {
        this.sendError(clientRes, 502, `Upstream error: ${err.message}`);
      }
    });

    // Send the body
    if (rawBody.length > 0) {
      proxyReq.write(rawBody);
    }
    proxyReq.end();
  }

  // ---------------------------------------------------------------------------
  // Upstream response
  // ---------------------------------------------------------------------------

  private handleUpstreamResponse(
    upstreamRes: http.IncomingMessage,
    clientRes: http.ServerResponse,
    proxyRequest: ProxyRequest,
  ): void {
    const statusCode = upstreamRes.statusCode ?? 502;
    const responseHeaders = this.headersToRecord(upstreamRes.headers);
    const sanitizedResponseHeaders = sanitizeHeaders(responseHeaders);

    console.info(
      `[ProxyServer]   ← ${statusCode} for ${proxyRequest.provider}${proxyRequest.endpoint}`,
    );

    // Build forwarded headers (strip hop-by-hop)
    const forwardedHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(responseHeaders)) {
      const lower = key.toLowerCase();
      if (HOP_BY_HOP_HEADERS.has(lower)) continue;
      forwardedHeaders[key] = value;
    }

    // ------------------------------------------------------------------
    // Detect streaming (SSE) vs. non-streaming response
    // ------------------------------------------------------------------
    const isStreaming = isSSEResponse(responseHeaders);

    if (isStreaming) {
      this.handleStreamingResponse(
        upstreamRes,
        clientRes,
        proxyRequest,
        statusCode,
        forwardedHeaders,
        sanitizedResponseHeaders,
      );
    } else {
      this.handleBufferedResponse(
        upstreamRes,
        clientRes,
        proxyRequest,
        statusCode,
        forwardedHeaders,
        sanitizedResponseHeaders,
      );
    }

    // Shared error handler for the upstream response stream
    upstreamRes.on("error", (err: Error) => {
      console.error(
        `[ProxyServer]   ✗ upstream response stream error: ${err.message}`,
      );
      this.emitEvent({
        type: "request-error",
        data: {
          ...proxyRequest,
          error: `Upstream response error: ${err.message}`,
        } as ProxyRequest & { error: string },
      });
      this.sendError(clientRes, 502, `Upstream response error: ${err.message}`);
    });
  }

  // ---------------------------------------------------------------------------
  // Streaming (SSE) response handling
  // ---------------------------------------------------------------------------

  private handleStreamingResponse(
    upstreamRes: http.IncomingMessage,
    clientRes: http.ServerResponse,
    proxyRequest: ProxyRequest,
    statusCode: number,
    forwardedHeaders: Record<string, string>,
    sanitizedResponseHeaders: Record<string, string>,
  ): void {
    console.info(
      `[ProxyServer]   ⚡ streaming SSE response for ${proxyRequest.id}`,
    );

    // Send headers to client immediately so the client can start processing
    clientRes.writeHead(statusCode, forwardedHeaders);

    // Create streaming handler that forwards chunks in real-time and buffers internally
    const handler = createStreamingHandler(
      proxyRequest.provider,
      proxyRequest.model,
      (chunk: Buffer) => {
        // Write each chunk to the client as it arrives — real-time streaming
        clientRes.write(chunk);
      },
      proxyRequest.body,
    );

    upstreamRes.on("data", (chunk: Buffer) => {
      handler.processChunk(chunk);
    });

    upstreamRes.on("end", () => {
      // Get the buffered result with extracted usage
      const result = handler.finish();

      // Build and emit the completion event with streaming usage
      const proxyResponse: ProxyResponse & { request: ProxyRequest } = {
        requestId: proxyRequest.id,
        statusCode,
        headers: sanitizedResponseHeaders,
        body: result.body,
        usage: result.usage ?? undefined,
        timestamp: new Date(),
        request: proxyRequest,
      };

      if (statusCode >= 400) {
        console.warn(
          `[ProxyServer]   ✗ upstream returned ${statusCode} for ${proxyRequest.id}`,
        );
      }

      if (result.usage) {
        console.info(
          `[ProxyServer]   ✓ stream usage: prompt=${result.usage.promptTokens} completion=${result.usage.completionTokens} total=${result.usage.totalTokens}`,
        );
      }

      this.emitEvent({
        type: "request-completed",
        data: { ...proxyRequest, ...proxyResponse },
      });

      // End the client response
      clientRes.end();
    });
  }

  // ---------------------------------------------------------------------------
  // Buffered (non-streaming) response handling
  // ---------------------------------------------------------------------------

  private handleBufferedResponse(
    upstreamRes: http.IncomingMessage,
    clientRes: http.ServerResponse,
    proxyRequest: ProxyRequest,
    statusCode: number,
    forwardedHeaders: Record<string, string>,
    sanitizedResponseHeaders: Record<string, string>,
  ): void {
    // Collect response body — original buffered behaviour
    const bodyChunks: Buffer[] = [];

    upstreamRes.on("data", (chunk: Buffer) => bodyChunks.push(chunk));

    upstreamRes.on("end", () => {
      const rawBody = Buffer.concat(bodyChunks);
      let parsedBody: Record<string, unknown> | undefined = undefined;

      if (rawBody.length > 0) {
        try {
          parsedBody = JSON.parse(rawBody.toString("utf-8")) as Record<
            string,
            unknown
          >;
        } catch {
          parsedBody = undefined;
        }
      }

      // Try to extract usage from non-streaming response body
      let usage: TokenUsage | undefined;
      if (parsedBody) {
        usage = this.extractNonStreamingUsage(
          parsedBody,
          proxyRequest.provider,
          proxyRequest.model,
          proxyRequest.body as Record<string, unknown> | undefined,
        );
      }

      const proxyResponse: ProxyResponse & { request: ProxyRequest } = {
        requestId: proxyRequest.id,
        statusCode,
        headers: sanitizedResponseHeaders,
        body: parsedBody,
        usage,
        timestamp: new Date(),
        request: proxyRequest,
      };

      // Emit completion event
      if (statusCode >= 400) {
        console.warn(
          `[ProxyServer]   ✗ upstream returned ${statusCode} for ${proxyRequest.id}`,
        );
      }
      // Always emit request-completed — consumers can inspect statusCode
      this.emitEvent({
        type: "request-completed",
        data: { ...proxyRequest, ...proxyResponse },
      });

      // Forward complete response to client
      clientRes.writeHead(statusCode, forwardedHeaders);
      clientRes.end(rawBody);
    });
  }

  // ---------------------------------------------------------------------------
  // Non-streaming usage extraction — provider-based dispatch
  // ---------------------------------------------------------------------------

  /**
   * Extract TokenUsage from a standard (non-streaming) API response body
   * using the provider registry.
   *
   * Looks up the registered provider by ID. If found, delegates extraction
   * to that provider's extractUsage() method. Falls back to UnknownProvider
   * which tries OpenAI, Anthropic, and Gemini formats.
   */
  private extractNonStreamingUsage(
    body: Record<string, unknown>,
    provider: string,
    _model: string,
    requestBody: Record<string, unknown> | undefined,
  ): TokenUsage | undefined {
    const providerImpl: Provider =
      providerRegistry.get(provider) ?? this.unknownProvider;

    const usage = providerImpl.extractUsage(requestBody, body);
    if (usage) return usage;

    // Fallback: try unknown provider for unrecognized formats
    if (providerImpl !== this.unknownProvider) {
      const fallbackUsage = this.unknownProvider.extractUsage(
        requestBody,
        body,
      );
      if (fallbackUsage) {
        // Override providerId with the actual provider from the route
        return { ...fallbackUsage, providerId: provider };
      }
    }

    return undefined;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Convert Node.js IncomingHttpHeaders to a flat Record<string, string>. */
  private headersToRecord(
    headers: http.IncomingHttpHeaders,
  ): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        result[key] = value.join(", ");
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  /** Set CORS headers for local development. */
  private setCorsHeaders(res: http.ServerResponse): void {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, PATCH, OPTIONS",
    );
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Expose-Headers", "*");
    res.setHeader("Access-Control-Max-Age", "86400");
  }

  /** Send a JSON error response to the client. */
  private sendError(
    res: http.ServerResponse,
    statusCode: number,
    message: string,
  ): void {
    const body = JSON.stringify({ error: message, statusCode });
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(body);
  }
}

// Export as both named and default
export default ProxyServer;

// Convenience factory — matches the original stub signature
export function createProxyServer(options?: ProxyServerOptions): ProxyServer {
  return new ProxyServer(options);
}
