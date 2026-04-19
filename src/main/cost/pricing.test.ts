import { describe, expect, it } from "vitest";
import {
  InMemoryPricingStore,
  getDefaultPricingCatalog,
  resolvePricing,
} from "./pricing";
import { PricingUpdater } from "./pricing-updater";

describe("pricing", () => {
  it("builds defaults from the seeded model catalog", () => {
    const pricing = getDefaultPricingCatalog();
    const gpt4o = pricing.find(
      (entry) => entry.providerId === "openai" && entry.modelId === "gpt-4o",
    );

    expect(gpt4o).toMatchObject({
      providerId: "openai",
      modelId: "gpt-4o",
      inputCostPerMillion: 2.5,
      outputCostPerMillion: 10,
      isLocal: false,
    });
  });

  it("supports override updates through the pricing store abstraction", () => {
    const store = new InMemoryPricingStore();
    const updater = new PricingUpdater(store);

    updater.update({
      providerId: "openai",
      modelId: "gpt-4o",
      outputCostPerMillion: 12,
      cachedReadMultiplier: 0.1,
      imageCostPerImage: 0.04,
    });

    expect(resolvePricing(store, "openai", "gpt-4o")).toMatchObject({
      providerId: "openai",
      modelId: "gpt-4o",
      inputCostPerMillion: 2.5,
      outputCostPerMillion: 12,
      cachedReadMultiplier: 0.1,
      imageCostPerImage: 0.04,
    });
  });

  it("tracks staleness from the last update timestamp", () => {
    const store = new InMemoryPricingStore();

    expect(store.isStale(1000)).toBe(false);

    store.markUpdated(new Date(Date.now() - 10_000));

    expect(store.isStale(1000)).toBe(true);
  });
});
