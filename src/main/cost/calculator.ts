import type { TokenUsage } from "../proxy/types";
import {
  resolvePricing,
  resolvePricingWithSource,
  type PricingSource,
  type PricingStore,
} from "./pricing";

export interface RequestCostBreakdown {
  providerId: string;
  modelId: string;
  inputCost: number;
  outputCost: number;
  imageCost: number;
  totalCost: number;
  cachedDiscount: number;
  currency: string;
  pricingSource: PricingSource;
}

export interface BatchCostBreakdown extends RequestCostBreakdown {
  requestCount: number;
  batchDiscount: number;
}

export interface BatchCalculationResult {
  perModel: Map<string, BatchCostBreakdown>;
  aggregate: BatchCostBreakdown;
}

function clampNonNegative(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

function perTokenCost(tokens: number, ratePerMillion: number): number {
  return (tokens / 1_000_000) * ratePerMillion;
}

export class CostCalculator {
  constructor(private readonly pricingStore: PricingStore) {}

  calculate(usage: TokenUsage): RequestCostBreakdown {
    return this.calculateRequest(usage);
  }

  calculateRequest(usage: TokenUsage): RequestCostBreakdown {
    const pricing = resolvePricingWithSource(
      this.pricingStore,
      usage.providerId,
      usage.modelId,
    );
    if (!pricing) {
      return {
        providerId: usage.providerId,
        modelId: usage.modelId,
        inputCost: 0,
        outputCost: 0,
        imageCost: 0,
        totalCost: 0,
        cachedDiscount: 0,
        currency: "USD",
        pricingSource: "missing",
      };
    }

    if (pricing.isLocal) {
      return {
        providerId: usage.providerId,
        modelId: usage.modelId,
        inputCost: 0,
        outputCost: 0,
        imageCost: 0,
        totalCost: 0,
        cachedDiscount: 0,
        currency: "USD",
        pricingSource: pricing.source,
      };
    }

    const promptTokens = clampNonNegative(usage.promptTokens);
    const completionTokens = clampNonNegative(usage.completionTokens);
    const cachedReadTokens = Math.min(
      promptTokens,
      clampNonNegative(usage.cachedReadTokens),
    );
    const cachedWriteTokens = Math.min(
      Math.max(0, promptTokens - cachedReadTokens),
      clampNonNegative(usage.cachedWriteTokens),
    );
    const uncachedPromptTokens = Math.max(
      0,
      promptTokens - cachedReadTokens - cachedWriteTokens,
    );

    const uncachedInputCost = perTokenCost(
      uncachedPromptTokens,
      pricing.inputCostPerMillion,
    );
    const cachedReadCost = perTokenCost(
      cachedReadTokens,
      pricing.inputCostPerMillion *
        clampNonNegative(pricing.cachedReadMultiplier),
    );
    const cachedWriteCost = perTokenCost(
      cachedWriteTokens,
      pricing.inputCostPerMillion *
        clampNonNegative(pricing.cachedWriteMultiplier),
    );
    const inputCost = uncachedInputCost + cachedReadCost + cachedWriteCost;
    const outputCost = perTokenCost(
      completionTokens,
      pricing.outputCostPerMillion,
    );
    const imageCost =
      clampNonNegative(usage.imageCount) *
      clampNonNegative(pricing.imageCostPerImage);
    const fullPromptCost = perTokenCost(
      promptTokens,
      pricing.inputCostPerMillion,
    );
    const cachedDiscount = Math.max(0, fullPromptCost - inputCost);
    const totalCost = Math.max(0, inputCost + outputCost + imageCost);

    return {
      providerId: usage.providerId,
      modelId: usage.modelId,
      inputCost,
      outputCost,
      imageCost,
      totalCost,
      cachedDiscount,
      currency: "USD",
      pricingSource: pricing.source,
    };
  }

  calculateBatch(usages: TokenUsage[]): BatchCalculationResult {
    const perModel = new Map<string, BatchCostBreakdown>();
    const aggregate = this.createEmptyBatchBreakdown("", "");

    for (const usage of usages) {
      const requestCost = this.calculateRequest(usage);
      const pricing = resolvePricing(
        this.pricingStore,
        usage.providerId,
        usage.modelId,
      );
      const discountRate = clampNonNegative(pricing?.batchDiscount);
      const batchDiscount = requestCost.totalCost * discountRate;
      const key = `${usage.providerId}::${usage.modelId}`;
      const existing =
        perModel.get(key) ??
        this.createEmptyBatchBreakdown(usage.providerId, usage.modelId);

      existing.inputCost += requestCost.inputCost;
      existing.outputCost += requestCost.outputCost;
      existing.imageCost += requestCost.imageCost;
      existing.cachedDiscount += requestCost.cachedDiscount;
      existing.totalCost += Math.max(0, requestCost.totalCost - batchDiscount);
      existing.batchDiscount += batchDiscount;
      existing.requestCount += 1;
      existing.currency = requestCost.currency;
      existing.pricingSource = requestCost.pricingSource;
      perModel.set(key, existing);

      aggregate.inputCost += requestCost.inputCost;
      aggregate.outputCost += requestCost.outputCost;
      aggregate.imageCost += requestCost.imageCost;
      aggregate.cachedDiscount += requestCost.cachedDiscount;
      aggregate.totalCost += Math.max(0, requestCost.totalCost - batchDiscount);
      aggregate.batchDiscount += batchDiscount;
      aggregate.requestCount += 1;
    }

    return { perModel, aggregate };
  }

  calculateAggregateCost(
    _period: "today" | "week" | "month" | "all",
    usages: TokenUsage[],
  ): BatchCostBreakdown & { totalTokens: number } {
    return this.aggregatePeriod(usages);
  }

  aggregatePeriod(
    usages: TokenUsage[],
  ): BatchCostBreakdown & { totalTokens: number } {
    const aggregate = usages.reduce(
      (summary, usage) => {
        const requestCost = this.calculateRequest(usage);
        return {
          inputCost: summary.inputCost + requestCost.inputCost,
          outputCost: summary.outputCost + requestCost.outputCost,
          imageCost: summary.imageCost + requestCost.imageCost,
          totalCost: summary.totalCost + requestCost.totalCost,
          cachedDiscount: summary.cachedDiscount + requestCost.cachedDiscount,
          totalTokens:
            summary.totalTokens + clampNonNegative(usage.totalTokens),
        };
      },
      {
        inputCost: 0,
        outputCost: 0,
        imageCost: 0,
        totalCost: 0,
        cachedDiscount: 0,
        totalTokens: 0,
      },
    );

    return {
      providerId: "",
      modelId: "",
      inputCost: aggregate.inputCost,
      outputCost: aggregate.outputCost,
      imageCost: aggregate.imageCost,
      totalCost: aggregate.totalCost,
      cachedDiscount: aggregate.cachedDiscount,
      batchDiscount: 0,
      requestCount: usages.length,
      totalTokens: aggregate.totalTokens,
      currency: "USD",
      pricingSource: "default",
    };
  }

  private createEmptyBatchBreakdown(
    providerId: string,
    modelId: string,
  ): BatchCostBreakdown {
    return {
      providerId,
      modelId,
      inputCost: 0,
      outputCost: 0,
      imageCost: 0,
      totalCost: 0,
      cachedDiscount: 0,
      requestCount: 0,
      batchDiscount: 0,
      currency: "USD",
      pricingSource: "default",
    };
  }
}
