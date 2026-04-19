/**
 * Security utilities for sanitizing sensitive data before logging or event emission.
 *
 * CRITICAL: Every log entry, event, and debug output MUST pass through these helpers
 * to avoid leaking API keys, tokens, or cookies.
 */

export const SENSITIVE_HEADERS = [
  "authorization",
  "x-api-key",
  "api-key",
  "cookie",
  "set-cookie",
  "proxy-authorization",
];

/**
 * Mask sensitive header values for safe logging.
 *
 * Example:
 *   "Bearer sk-proj-abc123456789" → "Bearer sk-pr...789"
 *   "key-12345"                    → "key-1...789"  (shows first 5 / last 3)
 *   ""                             → "(empty)"
 */
export function sanitizeHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  const sanitized: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();

    if (SENSITIVE_HEADERS.includes(lowerKey)) {
      sanitized[key] = maskValue(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Strip API key from URL query parameters.
 *
 * Google Gemini uses ?key=... which would leak keys into logs.
 *
 * Example:
 *   "https://generativelanguage.googleapis.com/v1/models?key=AIza...xyz"
 *     → "https://generativelanguage.googleapis.com/v1/models?key=[REDACTED]"
 */
export function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);

    // Redact known sensitive query params
    const sensitiveParams = [
      "key",
      "api_key",
      "apikey",
      "token",
      "access_token",
    ];
    for (const param of sensitiveParams) {
      if (parsed.searchParams.has(param)) {
        parsed.searchParams.set(param, "[REDACTED]");
      }
    }

    return parsed.toString();
  } catch {
    // If URL parsing fails, do a regex-based fallback
    return url.replace(
      /([?&])(key|api_key|apikey|token|access_token)=([^&]*)/gi,
      "$1$2=[REDACTED]",
    );
  }
}

/**
 * Mask a single sensitive value, keeping a short prefix and suffix visible
 * so the entry is still useful for debugging without exposing the full secret.
 */
function maskValue(value: string): string {
  if (!value || value.length === 0) {
    return "(empty)";
  }

  // For "Bearer sk-proj-abc123..." keep the scheme prefix visible
  const spaceIdx = value.indexOf(" ");
  if (spaceIdx > 0 && spaceIdx < 20) {
    const scheme = value.substring(0, spaceIdx + 1);
    const secret = value.substring(spaceIdx + 1);
    return scheme + maskSecret(secret);
  }

  return maskSecret(value);
}

function maskSecret(secret: string): string {
  if (secret.length <= 8) {
    return "*".repeat(secret.length);
  }

  const prefixLen = 5;
  const suffixLen = 3;
  const prefix = secret.substring(0, prefixLen);
  const suffix = secret.substring(secret.length - suffixLen);

  return `${prefix}...${suffix}`;
}
