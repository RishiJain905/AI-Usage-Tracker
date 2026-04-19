import { beforeAll, describe, expect, it } from "vitest";
import { registerAllProviders } from "./providers";
import { TokenExtractor } from "./token-extractor";

describe("TokenExtractor", () => {
  beforeAll(() => {
    registerAllProviders();
  });

  it("prefers provider usage parsing for buffered responses and keeps detail fields", () => {
    const extractor = new TokenExtractor();

    const usage = extractor.extractBuffered({
      providerId: "openai",
      modelId: "gpt-4o-mini",
      requestBody: {
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Say hi" }],
      },
      responseBody: {
        model: "gpt-4o-mini",
        usage: {
          prompt_tokens: 120,
          completion_tokens: 30,
          total_tokens: 150,
          prompt_tokens_details: {
            cached_tokens: 25,
            audio_tokens: 4,
          },
          completion_tokens_details: {
            reasoning_tokens: 6,
            audio_tokens: 2,
          },
        },
      },
    });

    expect(usage).toEqual({
      promptTokens: 120,
      completionTokens: 30,
      totalTokens: 150,
      providerId: "openai",
      modelId: "gpt-4o-mini",
      cachedReadTokens: 25,
      cachedWriteTokens: 0,
      imageTokens: 0,
      audioTokens: 6,
      reasoningTokens: 6,
      imageCount: 0,
      isEstimated: false,
      estimationSource: null,
    });
  });

  it("falls back to estimated buffered usage when providers return no usage block", () => {
    const extractor = new TokenExtractor();

    const usage = extractor.extractBuffered({
      providerId: "openai",
      modelId: "gpt-4o-mini",
      requestBody: {
        model: "gpt-4o-mini",
        messages: [
          { role: "user", content: "Write a one-line poem about rain." },
        ],
      },
      responseBody: {
        id: "chatcmpl-123",
        choices: [
          {
            message: {
              role: "assistant",
              content: "Rain taps soft rhythms against the waiting glass.",
            },
          },
        ],
      },
    });

    expect(usage).toMatchObject({
      providerId: "openai",
      modelId: "gpt-4o-mini",
      isEstimated: true,
      estimationSource: "request-response-text",
    });
    expect(usage?.promptTokens).toBeGreaterThan(0);
    expect(usage?.completionTokens).toBeGreaterThan(0);
    expect(usage?.totalTokens).toBe(
      (usage?.promptTokens ?? 0) + (usage?.completionTokens ?? 0),
    );
  });

  it("extracts image request metadata when token usage is unavailable", () => {
    const extractor = new TokenExtractor();

    const usage = extractor.extractBuffered({
      providerId: "openai",
      modelId: "dall-e-3",
      requestBody: {
        model: "dall-e-3",
        prompt: "A watercolor fox in a forest",
        n: 2,
      },
      responseBody: {
        created: 123,
        data: [
          { url: "https://example.com/1.png" },
          { url: "https://example.com/2.png" },
        ],
      },
    });

    expect(usage).toMatchObject({
      providerId: "openai",
      modelId: "dall-e-3",
      imageCount: 2,
      isEstimated: true,
      estimationSource: "image-count",
    });
    expect(usage?.promptTokens).toBe(0);
    expect(usage?.totalTokens).toBe(0);
  });

  it("estimates stream usage from request data and streamed text when no usage event exists", () => {
    const extractor = new TokenExtractor();

    const usage = extractor.extractStream({
      providerId: "openai",
      modelId: "gpt-4o-mini",
      requestBody: {
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Say hello in three words." }],
      },
      body: [
        'data: {"choices":[{"delta":{"content":"Hello"}}]}',
        'data: {"choices":[{"delta":{"content":" there friend"}}]}',
        "data: [DONE]",
      ].join("\n"),
    });

    expect(usage).toMatchObject({
      providerId: "openai",
      modelId: "gpt-4o-mini",
      isEstimated: true,
      estimationSource: "stream-text",
    });
    expect(usage?.promptTokens).toBeGreaterThan(0);
    expect(usage?.completionTokens).toBeGreaterThan(0);
  });
});
