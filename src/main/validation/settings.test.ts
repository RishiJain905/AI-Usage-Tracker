import { describe, expect, it } from "vitest";
import {
  validateApiKey,
  validateBudget,
  validateHttpUrl,
  validatePort,
  validateRequired,
} from "./settings";

describe("validatePort", () => {
  it("accepts valid ports in range", () => {
    expect(validatePort(1024)).toBeNull();
    expect(validatePort(65535)).toBeNull();
    expect(validatePort("8765")).toBeNull();
  });

  it("rejects invalid port values", () => {
    expect(validatePort(0)).toBe("Port must be between 1024 and 65535.");
    expect(validatePort(80)).toBe("Port must be between 1024 and 65535.");
    expect(validatePort("abc")).toBe("Port must be a number.");
  });
});

describe("validateHttpUrl", () => {
  it("accepts valid http and https urls", () => {
    expect(validateHttpUrl("http://localhost:8765")).toBeNull();
    expect(validateHttpUrl("https://api.openai.com/v1")).toBeNull();
  });

  it("rejects malformed urls or missing protocol", () => {
    expect(validateHttpUrl("https://not a url")).toBe("URL is invalid.");
    expect(validateHttpUrl("api.openai.com/v1")).toBe(
      "URL must start with http:// or https://.",
    );
  });
});

describe("validateApiKey", () => {
  it("accepts known provider key formats", () => {
    expect(validateApiKey("openai", "sk-abcdefghijklmnopqrstuvwxyz")).toBeNull();
    expect(validateApiKey("anthropic", "sk-ant-abcdefghijklmnopqrstuvwxyz")).toBeNull();
    expect(validateApiKey("gemini", "AIzaSyD-abcdefghijklmnopqrstuvwxyz")).toBeNull();
  });

  it("rejects invalid key formats by provider", () => {
    expect(validateApiKey("openai", "AIza-not-openai")).toBe(
      "API key format is invalid for openai.",
    );
    expect(validateApiKey("anthropic", "sk-openai-key")).toBe(
      "API key format is invalid for anthropic.",
    );
    expect(validateApiKey("gemini", "sk-ant-key")).toBe(
      "API key format is invalid for gemini.",
    );
  });
});

describe("validateBudget", () => {
  it("accepts positive budgets", () => {
    expect(validateBudget(1)).toBeNull();
    expect(validateBudget("200.50")).toBeNull();
  });

  it("rejects negative and non-numeric values", () => {
    expect(validateBudget(0)).toBeNull();
    expect(validateBudget(-10)).toBe("Budget must be greater than or equal to 0.");
    expect(validateBudget("NaN")).toBe("Budget must be a number.");
  });
});

describe("validateRequired", () => {
  it("rejects empty strings", () => {
    expect(validateRequired("", "Field")).toBe("Field is required.");
    expect(validateRequired("   ", "Field")).toBe("Field is required.");
  });

  it("accepts non-empty values", () => {
    expect(validateRequired("value", "Field")).toBeNull();
  });
});
