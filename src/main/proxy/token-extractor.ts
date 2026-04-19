import { providerRegistry, UnknownProvider } from "./providers";
import type { Provider } from "./providers/base";
import { TokenEstimator } from "./token-estimator";
import { createTokenUsage, type TokenUsage } from "./types";

interface BufferedExtractionInput {
  providerId: string;
  modelId?: string;
  requestBody?: unknown;
  responseBody?: unknown;
}

interface StreamExtractionInput {
  providerId: string;
  modelId?: string;
  requestBody?: unknown;
  body: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function clampNonNegative(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

function countImages(requestBody: unknown, responseBody: unknown): number {
  if (isRecord(requestBody)) {
    const explicitCount = clampNonNegative(requestBody.n);
    if (explicitCount > 0) return explicitCount;
  }

  if (isRecord(responseBody) && Array.isArray(responseBody.data)) {
    return responseBody.data.length;
  }

  return 0;
}

export class TokenExtractor {
  private readonly estimator: TokenEstimator;
  private readonly unknownProvider: UnknownProvider;

  constructor(
    estimator: TokenEstimator = new TokenEstimator(),
    unknownProvider: UnknownProvider = new UnknownProvider(),
  ) {
    this.estimator = estimator;
    this.unknownProvider = unknownProvider;
  }

  extractBuffered(input: BufferedExtractionInput): TokenUsage | null {
    const requestBody = isRecord(input.requestBody) ? input.requestBody : {};
    const responseBody = isRecord(input.responseBody) ? input.responseBody : {};
    const provider = this.resolveProvider(input.providerId);

    const providerUsage =
      provider.extractUsage(requestBody, responseBody) ??
      (provider !== this.unknownProvider
        ? this.unknownProvider.extractUsage(requestBody, responseBody)
        : null);

    if (providerUsage) {
      return this.normalizeUsage(
        providerUsage,
        input.providerId,
        input.modelId,
        this.extractUsageDetails(responseBody),
        countImages(requestBody, responseBody),
      );
    }

    return this.estimateBufferedUsage(
      input.providerId,
      input.modelId,
      requestBody,
      responseBody,
    );
  }

  extractStream(input: StreamExtractionInput): TokenUsage | null {
    const requestBody = isRecord(input.requestBody) ? input.requestBody : {};
    const provider = this.resolveProvider(input.providerId);
    const chunks = this.parseStreamChunks(input.body);

    const providerUsage =
      provider.extractUsageFromChunks(chunks) ??
      (provider !== this.unknownProvider
        ? this.unknownProvider.extractUsageFromChunks(chunks)
        : null);

    if (providerUsage) {
      const detailEvent = this.extractLastUsageEvent(chunks);
      return this.normalizeUsage(
        providerUsage,
        input.providerId,
        input.modelId,
        this.extractUsageDetails(detailEvent),
        countImages(requestBody, undefined),
      );
    }

    const estimatedRequest = this.estimator.estimateRequestUsage(requestBody);
    const completionTokens = this.estimator.estimateStreamTokens(input.body);
    if (estimatedRequest.promptTokens === 0 && completionTokens === 0) {
      return null;
    }

    return createTokenUsage({
      promptTokens: estimatedRequest.promptTokens,
      completionTokens,
      totalTokens: estimatedRequest.promptTokens + completionTokens,
      providerId: input.providerId,
      modelId: this.resolveModelId(input.modelId, requestBody, undefined),
      imageCount: estimatedRequest.imageCount,
      imageTokens: estimatedRequest.imageTokens,
      audioTokens: estimatedRequest.audioTokens,
      isEstimated: true,
      estimationSource: "stream-text",
    });
  }

  private estimateBufferedUsage(
    providerId: string,
    modelId: string | undefined,
    requestBody: Record<string, unknown>,
    responseBody: Record<string, unknown>,
  ): TokenUsage | null {
    const estimatedRequest = this.estimator.estimateRequestUsage(requestBody);
    const completionTokens =
      this.estimator.estimateResponseTokens(responseBody);
    const imageCount = countImages(requestBody, responseBody);
    const resolvedModelId = this.resolveModelId(
      modelId,
      requestBody,
      responseBody,
    );

    if (imageCount > 0 && resolvedModelId.startsWith("dall-e")) {
      return createTokenUsage({
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        providerId,
        modelId: resolvedModelId,
        imageCount,
        isEstimated: true,
        estimationSource: "image-count",
      });
    }

    if (
      estimatedRequest.promptTokens === 0 &&
      completionTokens === 0 &&
      imageCount === 0
    ) {
      return null;
    }

    return createTokenUsage({
      promptTokens: estimatedRequest.promptTokens,
      completionTokens,
      totalTokens: estimatedRequest.promptTokens + completionTokens,
      providerId,
      modelId: resolvedModelId,
      imageCount,
      imageTokens: estimatedRequest.imageTokens,
      audioTokens: estimatedRequest.audioTokens,
      isEstimated: true,
      estimationSource:
        imageCount > 0 ? "image-count" : "request-response-text",
    });
  }

  private normalizeUsage(
    usage: TokenUsage,
    providerId: string,
    modelId: string | undefined,
    details: Partial<TokenUsage>,
    imageCount: number,
  ): TokenUsage {
    return createTokenUsage({
      promptTokens: clampNonNegative(usage.promptTokens),
      completionTokens: clampNonNegative(usage.completionTokens),
      totalTokens:
        clampNonNegative(usage.totalTokens) ||
        clampNonNegative(usage.promptTokens) +
          clampNonNegative(usage.completionTokens),
      providerId,
      modelId: usage.modelId || modelId || "",
      cachedReadTokens: clampNonNegative(details.cachedReadTokens),
      cachedWriteTokens: clampNonNegative(details.cachedWriteTokens),
      imageTokens: clampNonNegative(details.imageTokens),
      audioTokens: clampNonNegative(details.audioTokens),
      reasoningTokens: clampNonNegative(details.reasoningTokens),
      imageCount,
      isEstimated: false,
      estimationSource: null,
    });
  }

  private extractUsageDetails(body: unknown): Partial<TokenUsage> {
    if (!isRecord(body)) return {};

    const usage = isRecord(body.usage) ? body.usage : null;
    if (!usage) return {};

    const promptDetails = isRecord(usage.prompt_tokens_details)
      ? usage.prompt_tokens_details
      : null;
    const completionDetails = isRecord(usage.completion_tokens_details)
      ? usage.completion_tokens_details
      : null;

    return {
      cachedReadTokens: clampNonNegative(promptDetails?.cached_tokens),
      cachedWriteTokens: Math.max(
        clampNonNegative(promptDetails?.cached_write_tokens),
        clampNonNegative(promptDetails?.cache_write_tokens),
      ),
      imageTokens:
        clampNonNegative(promptDetails?.image_tokens) +
        clampNonNegative(completionDetails?.image_tokens),
      audioTokens:
        clampNonNegative(promptDetails?.audio_tokens) +
        clampNonNegative(completionDetails?.audio_tokens),
      reasoningTokens: clampNonNegative(completionDetails?.reasoning_tokens),
    };
  }

  private extractLastUsageEvent(chunks: string[]): unknown {
    for (let index = chunks.length - 1; index >= 0; index -= 1) {
      try {
        const parsed = JSON.parse(chunks[index]);
        if (isRecord(parsed) && parsed.usage) {
          return parsed;
        }
      } catch {
        // Ignore invalid JSON chunks.
      }
    }

    return undefined;
  }

  private parseStreamChunks(body: string): string[] {
    const chunks: string[] = [];

    for (const line of body.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(":")) continue;

      if (trimmed.startsWith("data:")) {
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        chunks.push(payload);
        continue;
      }

      chunks.push(trimmed);
    }

    return chunks;
  }

  private resolveProvider(providerId: string): Provider {
    return providerRegistry.get(providerId) ?? this.unknownProvider;
  }

  private resolveModelId(
    modelId: string | undefined,
    requestBody: Record<string, unknown>,
    responseBody: Record<string, unknown> | undefined,
  ): string {
    if (modelId) return modelId;
    if (typeof requestBody.model === "string") return requestBody.model;
    if (typeof requestBody.modelId === "string") return requestBody.modelId;
    if (responseBody && typeof responseBody.model === "string")
      return responseBody.model;
    return "";
  }
}
