# Task 5: Token Extraction & Cost Engine

## Objective
Implement robust token extraction from all provider response formats and a cost calculation engine that applies per-model pricing.

## Steps

### 5.1 Create the token extraction pipeline

File: `src/main/proxy/token-extractor.ts`

The token extractor takes a raw HTTP response (or stream of chunks) and returns normalized token usage:

```typescript
interface ExtractedUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  // Optional provider-specific extras
  details?: {
    cachedTokens?: number;       // Groq prompt caching
    imageTokens?: number;        // Vision model image tokens
    audioTokens?: number;        // Audio input tokens
    reasoningTokens?: number;    // o1 reasoning tokens
  };
}

class TokenExtractor {
  extract(provider: string, requestBody: any, responseBody: any): ExtractedUsage | null;
  extractFromStream(provider: string, chunks: string[]): ExtractedUsage | null;
}
```

### 5.2 Handle edge cases in token extraction

**Missing usage data:**
- Some providers or endpoints don't return usage (e.g., Ollama older versions)
- Estimate tokens using tiktoken-compatible counting as fallback
- Mark estimated entries with `is_estimated: true` in the database

**Vision/multimodal requests:**
- Image tokens are counted differently by each provider
- OpenAI: ~768 tokens per image (low detail), ~85 tokens per tile (high detail)
- Anthropic: Image tokens calculated from pixel dimensions
- Store these separately for accurate per-modality cost

**Streaming accumulation:**
- For streaming, accumulate partial usage across chunks
- OpenAI: Usage in last chunk (if `stream_options.include_usage: true`)
- Anthropic: `message_start` has input tokens, `message_delta` has output tokens
- Ollama: Final chunk has `prompt_eval_count` and `eval_count`

### 5.3 Implement fallback token estimation

File: `src/main/proxy/token-estimator.ts`

When actual usage data isn't available:

```typescript
class TokenEstimator {
  // Rough estimate: ~4 characters per token for English
  estimateFromText(text: string): number;

  // Estimate from message array (chat format)
  estimateFromMessages(messages: { role: string; content: string }[]): number;

  // Provider-specific adjustments
  // Claude tends to have ~3.5 chars/token
  // GPT-4 tokenizer is slightly different from GPT-3.5
}
```

### 5.4 Build the cost calculation engine

File: `src/main/cost/calculator.ts`

```typescript
interface CostBreakdown {
  inputCost: number;       // prompt_tokens * input_price / 1_000_000
  outputCost: number;      // completion_tokens * output_price / 1_000_000
  totalCost: number;
  currency: string;        // "USD"
  pricingSource: string;  // "configured" | "default"
}

class CostCalculator {
  // Calculate cost for a single model's usage (per-model tracking)
  calculate(usage: ExtractedUsage, modelId: string): CostBreakdown;

  // Batch calculation — returns per-model AND aggregate totals
  calculateBatch(entries: Array<{ usage: ExtractedUsage; modelId: string }>): {
    perModel: Map<string, CostBreakdown>;   // Cost per individual model
    aggregate: CostBreakdown;                // Total cost across ALL models
  };

  // Period-aware aggregate cost calculation
  calculateAggregateCost(period: 'today' | 'week' | 'month' | 'all'): AggregateCostBreakdown;

  // Currency conversion (future)
  convertToCurrency(amount: number, fromCurrency: string, toCurrency: string): number;
}
```

### 5.5 Implement pricing data module

File: `src/main/cost/pricing.ts`

Centralized pricing data with update mechanism:

```typescript
interface ModelPricing {
  modelId: string;
  inputPricePerMillion: number;   // USD per 1M input tokens
  outputPricePerMillion: number;  // USD per 1M output tokens
  effectiveDate: string;          // When this pricing took effect
}

class PricingStore {
  // Get pricing for a model
  getPricing(modelId: string): ModelPricing | null;

  // Update pricing (from settings or future API)
  updatePricing(modelId: string, pricing: ModelPricing): void;

  // Get all pricing
  getAllPricing(): ModelPricing[];

  // Check if pricing is stale (prices change frequently)
  isStale(): boolean;
}
```

### 5.6 Handle special pricing cases

**Prompt caching:**
- OpenAI: Cached input at 50% discount
- Anthropic: Cached reads at 90% discount, cache writes at 25% premium
- Groq: Reports `cached_tokens` in usage details

```typescript
// Cost calculation with caching
calculateWithCache(usage: ExtractedUsage, modelId: string): CostBreakdown {
  const pricing = this.getPricing(modelId);
  const cachedTokens = usage.details?.cachedTokens ?? 0;
  const uncachedTokens = usage.promptTokens - cachedTokens;

  const inputCost = (uncachedTokens * pricing.inputPricePerMillion / 1_000_000) +
                     (cachedTokens * pricing.inputPricePerMillion * 0.5 / 1_000_000);
  // ...
}
```

**Per-image pricing (DALL-E):**
- DALL-E 3: $0.040-$0.080 per image (depends on resolution)
- Not token-based — handle as a fixed cost per request

**Batch API:**
- OpenAI Batch API: 50% discount on all tokens
- Detect via request headers or endpoint

### 5.7 Build pricing update mechanism

File: `src/main/cost/pricing-updater.ts`

Since model pricing changes frequently:
- Store a `last_pricing_update` timestamp
- Provide a manual "Refresh Pricing" button in settings
- Future: auto-fetch from a pricing JSON endpoint or scraping
- For now, hardcode defaults and allow user overrides in settings

### 5.8 Connect cost engine to proxy pipeline

Wire it all together in the proxy event handler. Every token extraction and cost calculation MUST be model-attributed:

```
Provider Response
    → TokenExtractor.extract() → returns usage with model attribution
    → CostCalculator.calculate(usage, modelId) → per-model cost
    → Repository.insertUsageLog({ ...usage, ...cost, modelId }) → per-model log
    → Repository.upsertDailySummary(date, providerId, modelId, ...) → per-model daily
    → Repository.upsertWeeklySummary(weekStart, providerId, modelId, ...) → per-model weekly
    → IPC emit to renderer: { perModelData, aggregateTotal }
```

The IPC event payload must include BOTH the per-model breakdown and the aggregate total so the UI can update both views in real-time.

## Verification
- Token extraction works correctly for all provider response formats
- Fallback estimation gives reasonable approximations
- Cost calculation matches expected values for all supported models
- **Per-model cost calculation**: Each model's cost is calculated independently given its own pricing
- **Aggregate cost calculation**: `calculateBatch()` returns both per-model AND total-across-all-models costs
- **Period-aware aggregates**: `calculateAggregateCost()` works for today/week/month/all
- Prompt caching discounts are applied correctly
- Edge cases handled: zero tokens, null usage, negative tokens (clamp to 0)
- Unit tests with real API response samples

## Dependencies
- Task 3 (Provider Implementations)
- Task 4 (SQLite Schema & Data Layer)

## Estimated Time
3-4 hours
