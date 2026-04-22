import { describe, expect, it } from "vitest";
import { CostCalculator } from "./calculator";
import { InMemoryPricingStore } from "./pricing";

describe("CostCalculator", () => {
  it("calculates per-request costs with cache discounts and clamps negative values", () => {
    const store = new InMemoryPricingStore([
      {
        providerId: "test-provider",
        modelId: "test-model",
        inputCostPerMillion: 1000,
        outputCostPerMillion: 2000,
        cachedReadMultiplier: 0.1,
        cachedWriteMultiplier: 0.2,
      },
    ]);
    const calculator = new CostCalculator(store);

    const result = calculator.calculateRequest({
      providerId: "test-provider",
      modelId: "test-model",
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500,
      cachedReadTokens: 200,
      cachedWriteTokens: -100,
      imageTokens: 0,
      audioTokens: 0,
      reasoningTokens: 0,
      imageCount: 0,
      isEstimated: false,
      estimationSource: null,
    });

    expect(result.inputCost).toBeCloseTo(0.82);
    expect(result.outputCost).toBeCloseTo(1);
    expect(result.totalCost).toBeCloseTo(1.82);
    expect(result.cachedDiscount).toBeCloseTo(0.18);
  });

  it("returns zero cost for local models and fixed image pricing for image requests", () => {
    const store = new InMemoryPricingStore([
      {
        providerId: "ollama",
        modelId: "llama3.1",
        inputCostPerMillion: 1000,
        outputCostPerMillion: 1000,
        isLocal: true,
      },
      {
        providerId: "openai",
        modelId: "dall-e-3",
        inputCostPerMillion: 0,
        outputCostPerMillion: 0,
        imageCostPerImage: 0.04,
      },
    ]);
    const calculator = new CostCalculator(store);

    const localResult = calculator.calculateRequest({
      providerId: "ollama",
      modelId: "llama3.1",
      promptTokens: 2000,
      completionTokens: 1500,
      totalTokens: 3500,
      cachedReadTokens: 0,
      cachedWriteTokens: 0,
      imageTokens: 0,
      audioTokens: 0,
      reasoningTokens: 0,
      imageCount: 0,
      isEstimated: false,
      estimationSource: null,
    });

    const imageResult = calculator.calculateRequest({
      providerId: "openai",
      modelId: "dall-e-3",
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cachedReadTokens: 0,
      cachedWriteTokens: 0,
      imageTokens: 0,
      audioTokens: 0,
      reasoningTokens: 0,
      imageCount: 3,
      isEstimated: true,
      estimationSource: "image-count",
    });

    expect(localResult.totalCost).toBe(0);
    expect(imageResult.imageCost).toBeCloseTo(0.12);
    expect(imageResult.totalCost).toBeCloseTo(0.12);
  });

  it("applies batch discounts and aggregates period totals", () => {
    const store = new InMemoryPricingStore([
      {
        providerId: "batch-provider",
        modelId: "batch-model",
        inputCostPerMillion: 1000,
        outputCostPerMillion: 1000,
        batchDiscount: 0.5,
      },
    ]);
    const calculator = new CostCalculator(store);

    const requests = [
      {
        providerId: "batch-provider",
        modelId: "batch-model",
        promptTokens: 1000,
        completionTokens: 1000,
        totalTokens: 2000,
        cachedReadTokens: 0,
        cachedWriteTokens: 0,
        imageTokens: 0,
        audioTokens: 0,
        reasoningTokens: 0,
        imageCount: 0,
        isEstimated: false,
        estimationSource: null,
      },
      {
        providerId: "batch-provider",
        modelId: "batch-model",
        promptTokens: 1000,
        completionTokens: 0,
        totalTokens: 1000,
        cachedReadTokens: 0,
        cachedWriteTokens: 0,
        imageTokens: 0,
        audioTokens: 0,
        reasoningTokens: 0,
        imageCount: 0,
        isEstimated: false,
        estimationSource: null,
      },
    ];

    const batch = calculator.calculateBatch(requests);
    const period = calculator.aggregatePeriod(requests);

    expect(batch.aggregate.totalCost).toBeCloseTo(1.5);
    expect(batch.aggregate.batchDiscount).toBeCloseTo(1.5);
    expect(batch.aggregate.requestCount).toBe(2);

    const perModel = batch.perModel.get("batch-provider::batch-model");
    expect(perModel).toBeDefined();
    expect(perModel?.totalCost).toBeCloseTo(1.5);
    expect(perModel?.batchDiscount).toBeCloseTo(1.5);
    expect(perModel?.requestCount).toBe(2);

    expect(period.totalCost).toBeCloseTo(3);
    expect(period.totalTokens).toBe(3000);
    expect(period.requestCount).toBe(2);
  });
});
