/**
 * Streaming response handler for Server-Sent Events (SSE).
 *
 * Many AI providers (OpenAI, Anthropic, etc.) return streaming responses
 * using the SSE protocol. This module:
 * 1. Detects SSE responses by content-type
 * 2. Passes chunks through to the client in real-time (non-blocking)
 * 3. Buffers the stream internally to extract token usage from the final events
 * 4. Returns the aggregated usage + full buffered body when the stream ends
 */

import { TokenUsage } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StreamResult {
  /** The full buffered text of the stream (for parsing/emit) */
  body: string;
  /** Extracted token usage, if available from the stream */
  usage: TokenUsage | null;
}

export interface StreamingHandler {
  /** Call on each upstream data event. Passes chunk to client immediately. */
  processChunk: (chunk: Buffer) => void;
  /** Call when upstream ends. Returns aggregated result with usage. */
  finish: () => StreamResult;
}

// ---------------------------------------------------------------------------
// SSE Detection
// ---------------------------------------------------------------------------

/**
 * Detect if the response is a streaming SSE response.
 * Checks for content-type containing "text/event-stream".
 */
export function isSSEResponse(headers: Record<string, string>): boolean {
  const contentType = headers["content-type"] ?? "";
  return contentType.toLowerCase().includes("text/event-stream");
}

// ---------------------------------------------------------------------------
// Streaming handler factory
// ---------------------------------------------------------------------------

/**
 * Create a streaming handler that:
 * - Passes each chunk to the client immediately via `writeCallback`
 * - Accumulates chunks internally for post-stream analysis
 * - Extracts usage data from OpenAI-style and Anthropic-style streams
 *
 * @param provider - The provider ID (e.g. "openai", "anthropic") to select
 *                   the appropriate usage extraction strategy.
 * @param model    - The model name from the request, used to populate TokenUsage.
 * @param writeCallback - Called for each chunk to write data to the client in real-time.
 */
export function createStreamingHandler(
  provider: string,
  model: string,
  writeCallback: (chunk: Buffer) => void,
): StreamingHandler {
  const accumulatedChunks: Buffer[] = [];

  return {
    processChunk(chunk: Buffer): void {
      // Forward to client immediately — this is the key real-time behaviour
      writeCallback(chunk);
      // Also buffer for post-stream analysis
      accumulatedChunks.push(chunk);
    },

    finish(): StreamResult {
      const fullBody = Buffer.concat(accumulatedChunks).toString("utf-8");
      const usage = extractStreamUsage(provider, model, fullBody);
      return { body: fullBody, usage };
    },
  };
}

// ---------------------------------------------------------------------------
// Usage extraction — dispatch by provider
// ---------------------------------------------------------------------------

/**
 * Parse the full SSE body text into individual data lines.
 * Filters out comments, empty lines, and the terminal [DONE] marker.
 */
function parseSSELines(body: string): string[] {
  const lines: string[] = [];
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(":")) continue; // blank / comment
    if (trimmed.startsWith("data: ")) {
      const payload = trimmed.slice(6).trim();
      if (payload === "[DONE]") continue;
      lines.push(payload);
    } else if (trimmed.startsWith("data:")) {
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;
      lines.push(payload);
    }
  }
  return lines;
}

/**
 * Extract stream usage using the provider-appropriate strategy.
 */
function extractStreamUsage(
  provider: string,
  model: string,
  body: string,
): TokenUsage | null {
  const chunks = parseSSELines(body);
  if (chunks.length === 0) return null;

  switch (provider) {
    case "openai":
      return extractOpenAIStreamUsage(chunks, model, provider);
    case "anthropic":
      return extractAnthropicStreamUsage(chunks, model, provider);
    default:
      // For unknown providers, try OpenAI-style first, then Anthropic-style
      return (
        extractOpenAIStreamUsage(chunks, model, provider) ??
        extractAnthropicStreamUsage(chunks, model, provider)
      );
  }
}

// ---------------------------------------------------------------------------
// OpenAI usage extraction
// ---------------------------------------------------------------------------

/**
 * Extract token usage from OpenAI streaming chunks.
 *
 * OpenAI includes usage in the last chunk before [DONE] when
 * `stream_options: { include_usage: true }` is set.
 *
 * The usage object appears at the top level:
 * `{ "usage": { "prompt_tokens": X, "completion_tokens": Y, "total_tokens": Z } }`
 *
 * Falls back to accumulating token counts from individual chunks if the
 * final usage block is not present (older API versions / some compatible APIs).
 */
export function extractOpenAIStreamUsage(
  chunks: string[],
  model: string,
  provider: string,
): TokenUsage | null {
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let foundUsage = false;

  // Iterate from end to start — the final usage block is most reliable
  for (let i = chunks.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(chunks[i]) as Record<string, unknown>;
      const usage = parsed.usage as Record<string, unknown> | undefined;

      if (usage && typeof usage === "object") {
        const pt =
          typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : 0;
        const ct =
          typeof usage.completion_tokens === "number"
            ? usage.completion_tokens
            : 0;
        const tt =
          typeof usage.total_tokens === "number" ? usage.total_tokens : 0;

        // Only take the first (last in stream) usage block with non-zero values
        if (!foundUsage && (pt > 0 || ct > 0 || tt > 0)) {
          promptTokens = pt;
          completionTokens = ct;
          totalTokens = tt;
          foundUsage = true;
          break;
        }
      }
    } catch {
      // Not valid JSON — skip
    }
  }

  if (!foundUsage) {
    // Fallback: no usage block found in the stream
    return null;
  }

  // If totalTokens is 0 but we have prompt + completion, compute it
  if (totalTokens === 0 && (promptTokens > 0 || completionTokens > 0)) {
    totalTokens = promptTokens + completionTokens;
  }

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    modelId: model,
    providerId: provider,
  };
}

// ---------------------------------------------------------------------------
// Anthropic usage extraction
// ---------------------------------------------------------------------------

/**
 * Extract token usage from Anthropic streaming chunks.
 *
 * Anthropic sends usage in two events:
 * 1. `message_start` — contains `message.usage.input_tokens`
 * 2. `message_delta` — contains `usage.output_tokens`
 *
 * Example `message_start`:
 *   data: {"type":"message_start","message":{"usage":{"input_tokens":25}}}
 *
 * Example `message_delta`:
 *   data: {"type":"message_delta","usage":{"output_tokens":48}}
 */
export function extractAnthropicStreamUsage(
  chunks: string[],
  model: string,
  provider: string,
): TokenUsage | null {
  let inputTokens = 0;
  let outputTokens = 0;

  for (const chunk of chunks) {
    try {
      const parsed = JSON.parse(chunk) as Record<string, unknown>;

      if (parsed.type === "message_start" && parsed.message) {
        const message = parsed.message as Record<string, unknown>;
        const usage = message.usage as Record<string, unknown> | undefined;
        if (usage && typeof usage.input_tokens === "number") {
          inputTokens = usage.input_tokens;
        }
      }

      if (parsed.type === "message_delta") {
        const usage = parsed.usage as Record<string, unknown> | undefined;
        if (usage && typeof usage.output_tokens === "number") {
          outputTokens = usage.output_tokens;
        }
      }
    } catch {
      // Not valid JSON — skip
    }
  }

  if (inputTokens === 0 && outputTokens === 0) {
    return null;
  }

  return {
    promptTokens: inputTokens,
    completionTokens: outputTokens,
    totalTokens: inputTokens + outputTokens,
    modelId: model,
    providerId: provider,
  };
}
