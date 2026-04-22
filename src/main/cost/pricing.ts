import { SEED_MODELS } from "../database/seed";

export type PricingSource = "default" | "override" | "missing";

export interface ModelPricing {
  providerId: string;
  modelId: string;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
  cachedReadMultiplier?: number;
  cachedWriteMultiplier?: number;
  imageCostPerImage?: number;
  batchDiscount?: number;
  isLocal?: boolean;
}

export interface ResolvedPricing extends ModelPricing {
  source: PricingSource;
}

export interface PricingStore {
  get(providerId: string, modelId: string): ModelPricing | undefined;
  getPricing(providerId: string, modelId: string): ModelPricing | undefined;
  getSource(providerId: string, modelId: string): PricingSource;
  list(): ModelPricing[];
  getAllPricing(): ModelPricing[];
  setOverride(
    override: Partial<ModelPricing> &
      Pick<ModelPricing, "providerId" | "modelId">,
  ): ModelPricing;
  updatePricing(
    override: Partial<ModelPricing> &
      Pick<ModelPricing, "providerId" | "modelId">,
  ): ModelPricing;
  isStale(maxAgeMs?: number): boolean;
  markUpdated(at?: Date): void;
}

const EXTRA_DEFAULTS: ModelPricing[] = [
  {
    providerId: "openai",
    modelId: "dall-e-3",
    inputCostPerMillion: 0,
    outputCostPerMillion: 0,
    cachedReadMultiplier: 1,
    cachedWriteMultiplier: 1,
    imageCostPerImage: 0.04,
  },
  {
    providerId: "openai",
    modelId: "dall-e-2",
    inputCostPerMillion: 0,
    outputCostPerMillion: 0,
    cachedReadMultiplier: 1,
    cachedWriteMultiplier: 1,
    imageCostPerImage: 0.02,
  },
];

function pricingKey(providerId: string, modelId: string): string {
  return `${providerId.toLowerCase()}::${modelId.toLowerCase()}`;
}

function clonePricing(pricing: ModelPricing): ModelPricing {
  return { ...pricing };
}

function mergePricing(
  base: ModelPricing | undefined,
  override: Partial<ModelPricing> &
    Pick<ModelPricing, "providerId" | "modelId">,
): ModelPricing {
  return {
    providerId: override.providerId,
    modelId: override.modelId,
    inputCostPerMillion:
      override.inputCostPerMillion ?? base?.inputCostPerMillion ?? 0,
    outputCostPerMillion:
      override.outputCostPerMillion ?? base?.outputCostPerMillion ?? 0,
    cachedReadMultiplier:
      override.cachedReadMultiplier ?? base?.cachedReadMultiplier ?? 1,
    cachedWriteMultiplier:
      override.cachedWriteMultiplier ?? base?.cachedWriteMultiplier ?? 1,
    imageCostPerImage:
      override.imageCostPerImage ?? base?.imageCostPerImage ?? 0,
    batchDiscount: override.batchDiscount ?? base?.batchDiscount ?? 0,
    isLocal: override.isLocal ?? base?.isLocal ?? false,
  };
}

export function getDefaultPricingCatalog(): ModelPricing[] {
  const seeded = SEED_MODELS.map((model) => ({
    providerId: model.providerId,
    modelId: model.id,
    inputCostPerMillion: model.inputPrice,
    outputCostPerMillion: model.outputPrice,
    isLocal: model.isLocal ?? false,
    cachedReadMultiplier: 1,
    cachedWriteMultiplier: 1,
    imageCostPerImage: 0,
    batchDiscount: 0,
  }));

  return [...seeded, ...EXTRA_DEFAULTS].map(clonePricing);
}

export class InMemoryPricingStore implements PricingStore {
  private readonly defaults = new Map<string, ModelPricing>();
  private readonly overrides = new Map<string, ModelPricing>();
  private lastUpdatedAt: number | null = null;

  constructor(defaults: ModelPricing[] = getDefaultPricingCatalog()) {
    for (const pricing of defaults) {
      this.defaults.set(
        pricingKey(pricing.providerId, pricing.modelId),
        clonePricing(pricing),
      );
    }
    this.markUpdated();
  }

  get(providerId: string, modelId: string): ModelPricing | undefined {
    const exactKey = pricingKey(providerId, modelId);
    const override = this.overrides.get(exactKey);
    const base = this.defaults.get(exactKey);

    if (override) {
      return clonePricing(mergePricing(base, override));
    }
    if (base) {
      return clonePricing(base);
    }

    return undefined;
  }

  getPricing(providerId: string, modelId: string): ModelPricing | undefined {
    return this.get(providerId, modelId);
  }

  getSource(providerId: string, modelId: string): PricingSource {
    const key = pricingKey(providerId, modelId);
    if (this.overrides.has(key)) return "override";
    if (this.defaults.has(key)) return "default";
    return "missing";
  }

  list(): ModelPricing[] {
    const keys = new Set([...this.defaults.keys(), ...this.overrides.keys()]);

    return Array.from(keys)
      .map((key) => {
        const override = this.overrides.get(key);
        const base = this.defaults.get(key);
        if (override) return clonePricing(mergePricing(base, override));
        return base ? clonePricing(base) : undefined;
      })
      .filter((pricing): pricing is ModelPricing => pricing !== undefined);
  }

  getAllPricing(): ModelPricing[] {
    return this.list();
  }

  setOverride(
    override: Partial<ModelPricing> &
      Pick<ModelPricing, "providerId" | "modelId">,
  ): ModelPricing {
    const key = pricingKey(override.providerId, override.modelId);
    const merged = mergePricing(this.defaults.get(key), override);
    this.overrides.set(key, merged);
    this.markUpdated();
    return clonePricing(merged);
  }

  updatePricing(
    override: Partial<ModelPricing> &
      Pick<ModelPricing, "providerId" | "modelId">,
  ): ModelPricing {
    return this.setOverride(override);
  }

  isStale(maxAgeMs = 1000 * 60 * 60 * 24 * 7): boolean {
    if (this.lastUpdatedAt === null) return true;
    return Date.now() - this.lastUpdatedAt > maxAgeMs;
  }

  markUpdated(at: Date = new Date()): void {
    this.lastUpdatedAt = at.getTime();
  }
}

export function resolvePricing(
  store: PricingStore,
  providerId: string,
  modelId: string,
): ModelPricing | undefined {
  return store.get(providerId, modelId);
}

export function resolvePricingWithSource(
  store: PricingStore,
  providerId: string,
  modelId: string,
): ResolvedPricing | undefined {
  const direct = store.get(providerId, modelId);
  if (!direct) return undefined;

  return {
    ...direct,
    source: store.getSource(providerId, modelId),
  };
}
