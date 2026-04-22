import type { ModelPricing, PricingStore } from "./pricing";

export class PricingUpdater {
  constructor(private readonly store: PricingStore) {}

  update(
    override: Partial<ModelPricing> &
      Pick<ModelPricing, "providerId" | "modelId">,
  ): ModelPricing {
    return this.store.setOverride(override);
  }
}
