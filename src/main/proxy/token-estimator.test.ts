import { describe, expect, it } from "vitest";
import { TokenEstimator } from "./token-estimator";

describe("TokenEstimator", () => {
  it("estimates text tokens from character length", () => {
    const estimator = new TokenEstimator();

    expect(estimator.estimateText("1234567890")).toBe(3);
    expect(estimator.estimateText("")).toBe(0);
  });

  it("adds message framing overhead and counts multimodal inputs", () => {
    const estimator = new TokenEstimator();

    const plainTextEstimate = estimator.estimateText(
      "Be concise Describe this image",
    );

    const usage = estimator.estimateRequestUsage({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Be concise" },
        {
          role: "user",
          content: [
            { type: "text", text: "Describe this image" },
            {
              type: "image_url",
              image_url: { url: "https://example.com/cat.png" },
            },
          ],
        },
      ],
    });

    expect(usage.promptTokens).toBeGreaterThan(plainTextEstimate);
    expect(usage.imageCount).toBe(1);
    expect(usage.estimationSource).toBe("chat-messages");
    expect(usage.isEstimated).toBe(true);
  });
});
