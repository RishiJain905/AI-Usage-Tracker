# Task 5: Token Extraction & Cost Engine - Completion Summary

## Status: COMPLETE

## Summary

Implemented the Task 5 backend slice end to end:

- centralized token extraction for buffered and streaming responses
- fallback token estimation when providers do not return usage
- pricing and cost calculation modules
- normalized persistence for estimated usage and modality/cache metadata
- main-process wiring from proxy completion events into repository writes

This replaces the Task 4 inline pricing placeholder in `src/main/index.ts`.

## Files Created

| File | Description |
|------|-------------|
| `src/main/proxy/token-estimator.ts` | Heuristics for request, response, and stream token estimation |
| `src/main/proxy/token-estimator.test.ts` | Unit tests for estimator behavior |
| `src/main/proxy/token-extractor.test.ts` | Unit tests for buffered and streaming extraction |
| `src/main/proxy/streaming.test.ts` | Unit tests for SSE detection and streaming handler extraction |
| `src/main/cost/pricing-updater.ts` | Small pricing override/update helper |
| `src/main/cost/pricing.test.ts` | Unit tests for pricing catalog, overrides, and staleness |
| `src/main/cost/calculator.test.ts` | Unit tests for request, batch, and aggregate cost calculation |
| `src/main/database/migrations/002-task-5-usage-metadata.ts` | Forward migration adding Task 5 metadata columns to logs and summaries |

## Files Modified

| File | Changes |
|------|---------|
| `src/main/proxy/types.ts` | Extended `TokenUsage` with estimate/cache/modality metadata and added `createTokenUsage()` helper |
| `src/main/proxy/token-extractor.ts` | Implemented centralized buffered/stream extraction with provider delegation, normalization, and estimation fallback |
| `src/main/proxy/streaming.ts` | Reworked streaming handler to use `TokenExtractor` and accept `requestBody` context |
| `src/main/proxy/server.ts` | Passed request body into the streaming handler for estimation-aware stream extraction |
| `src/main/cost/pricing.ts` | Added seeded pricing catalog, in-memory pricing store, override support, source tracking, and staleness checks |
| `src/main/cost/calculator.ts` | Added request, batch, and aggregate cost calculation with cache discounts, fixed image pricing, and pricing source metadata |
| `src/main/database/types.ts` | Added Task 5 metadata fields to log, summary, aggregate, and write-input types |
| `src/main/database/repository.ts` | Persisted and accumulated Task 5 metadata through log inserts and summary upserts |
| `src/main/database/repository.test.ts` | Added coverage for Task 5 persistence and aggregate counters |
| `src/main/database/migrations/index.ts` | Registered migration v2 |
| `src/main/database/migrations.test.ts` | Added migration v2 coverage |
| `src/main/database/init.test.ts` | Updated migration-count expectation for v2 |
| `src/main/index.ts` | Integrated `TokenExtractor`, pricing store loading, `CostCalculator`, and normalized repository writes |
| `src/preload/index.d.ts` | Synced renderer-facing DB type declarations with new aggregate/log/summary fields |

## Key Design Decisions

1. **Provider parsers were preserved, not replaced**
   Task 3 provider-specific extraction remains the first parse path. Task 5 wraps those parsers behind `TokenExtractor` and only falls back to estimation when provider usage is absent.

2. **Normalized metadata uses explicit DB columns**
   The implementation stores `is_estimated`, `estimation_source`, cache token counters, modality counters, and `pricing_source` as first-class columns rather than JSON blobs.

3. **DALL-E style image requests are fixed-cost**
   Image generation requests are tracked with `image_count` and priced per image rather than by token totals.

4. **Pricing defaults come from seeded models**
   The cost engine uses a code-side pricing catalog built from `SEED_MODELS`, then applies in-memory overrides loaded from settings.

5. **Migration v2 is forward-only**
   `down()` is intentionally a no-op because SQLite column removal would require table rebuilds; runtime app migrations only move forward.

## Verification

- `npm test` - PASSED (`9` files, `108` tests)
- `npm run typecheck` - PASSED
- `npm run lint` - FAILED due pre-existing repo issues outside Task 5 scope

### Current lint blockers

- `src/renderer/src/components/ui/button.tsx`
  - `@typescript-eslint/explicit-function-return-type`
  - `react-refresh/only-export-components`

Lint still reports additional warning-only formatting and `no-explicit-any` items in existing repo files. Task 5-specific files were formatted after implementation.

## Spec Notes

- `CostCalculator` now supports per-request cost calculation, per-model batch breakdown, and aggregate cost calculation, but the period-aware aggregate helper takes usage entries directly rather than querying the repository itself. The main process currently uses per-request calculation and repository-backed aggregation.
- Pricing refresh persistence is scaffolded through settings-backed overrides and a timestamp key; the UI for editing or refreshing pricing remains for Task 10.

## Next Task Impact

- Task 7 and Task 9 can now rely on repository aggregate totals that include estimated-request counts and modality/cache counters.
- Task 10 can build pricing override UI on top of `pricing_overrides` / `last_pricing_update` settings without needing more backend cost-engine work.
