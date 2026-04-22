const API_KEY_PATTERNS: Record<string, RegExp> = {
  openai: /^sk-[A-Za-z0-9_-]{8,}$/i,
  anthropic: /^sk-ant-[A-Za-z0-9_-]{8,}$/i,
  gemini: /^AIza[A-Za-z0-9_-]{10,}$/i,
  groq: /^gsk_[A-Za-z0-9_-]{8,}$/i,
};

function parseFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) return numeric;
  }

  return null;
}

export function validateRequired(
  value: unknown,
  fieldName = "Value",
): string | null {
  if (value === null || value === undefined) {
    return `${fieldName} is required.`;
  }

  if (typeof value === "string" && value.trim().length === 0) {
    return `${fieldName} is required.`;
  }

  return null;
}

export function validatePort(value: unknown): string | null {
  const parsed = parseFiniteNumber(value);
  if (parsed === null) {
    return "Port must be a number.";
  }

  if (!Number.isInteger(parsed)) {
    return "Port must be a whole number.";
  }

  if (parsed < 1024 || parsed > 65535) {
    return "Port must be between 1024 and 65535.";
  }

  return null;
}

export function validateHttpUrl(value: unknown): string | null {
  const requiredError = validateRequired(value, "URL");
  if (requiredError) return requiredError;

  if (typeof value !== "string") {
    return "URL must be a string.";
  }

  if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(value)) {
    return "URL must start with http:// or https://.";
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return "URL is invalid.";
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "URL must start with http:// or https://.";
  }

  return null;
}

export function validateApiKey(
  providerId: string,
  apiKey: unknown,
): string | null {
  const requiredError = validateRequired(apiKey, "API key");
  if (requiredError) return requiredError;

  if (typeof apiKey !== "string") {
    return "API key must be a string.";
  }

  const pattern = API_KEY_PATTERNS[providerId.toLowerCase()];
  if (!pattern) {
    return null;
  }

  if (!pattern.test(apiKey.trim())) {
    return `API key format is invalid for ${providerId}.`;
  }

  return null;
}

export function validateBudget(value: unknown): string | null {
  const parsed = parseFiniteNumber(value);
  if (parsed === null) {
    return "Budget must be a number.";
  }

  if (parsed < 0) {
    return "Budget must be greater than or equal to 0.";
  }

  return null;
}
