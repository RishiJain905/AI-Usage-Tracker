import type { ModelPricing, PricingStore } from "./pricing";

export class PricingUpdater {
  constructor(private readonly store: PricingStore) {}

  update(
    override: Partial<ModelPricing> &
      Pick<ModelPricing, "providerId" | "modelId">,
  ): ModelPricing {
    const pricing = this.store.setOverride(override);
    this.store.markUpdated();
    return pricing;
  }
}
