import { describe, expect, it, vi } from "vitest";
import { registerAllProviders } from "./providers";
import { createStreamingHandler, isSSEResponse } from "./streaming";

registerAllProviders();

describe("streaming", () => {
  it("detects SSE responses case-insensitively", () => {
    expect(
      isSSEResponse({ "content-type": "Text/Event-Stream; charset=utf-8" }),
    ).toBe(true);
    expect(isSSEResponse({ "content-type": "application/json" })).toBe(false);
  });

  it("forwards chunks immediately and returns extracted usage on finish", () => {
    const writeCallback = vi.fn();
    const handler = createStreamingHandler(
      "openai",
      "gpt-4o-mini",
      writeCallback,
      {
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Say hello." }],
      },
    );

    const firstChunk = Buffer.from(
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
    );
    const secondChunk = Buffer.from(
      'data: {"choices":[{"delta":{"content":" there"}}]}\n\ndata: [DONE]\n\n',
    );

    handler.processChunk(firstChunk);
    handler.processChunk(secondChunk);

    const result = handler.finish();

    expect(writeCallback).toHaveBeenNthCalledWith(1, firstChunk);
    expect(writeCallback).toHaveBeenNthCalledWith(2, secondChunk);
    expect(result.body).toContain('"content":"Hello"');
    expect(result.usage).toMatchObject({
      providerId: "openai",
      modelId: "gpt-4o-mini",
      isEstimated: true,
    });
  });
});
