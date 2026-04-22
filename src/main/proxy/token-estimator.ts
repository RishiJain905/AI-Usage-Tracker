import { createTokenUsage, type TokenUsage } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function clampCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

export class TokenEstimator {
  estimateText(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  estimateRequestUsage(body: unknown): TokenUsage {
    const requestBody = isRecord(body) ? body : {};
    const modelId = this.extractModelId(requestBody);
    const promptEstimate = this.estimateRequestTokens(requestBody);

    return createTokenUsage({
      promptTokens: promptEstimate.promptTokens,
      completionTokens: 0,
      totalTokens: promptEstimate.promptTokens,
      providerId: "",
      modelId,
      imageCount: promptEstimate.imageCount,
      imageTokens: promptEstimate.imageTokens,
      audioTokens: promptEstimate.audioTokens,
      isEstimated: true,
      estimationSource: promptEstimate.source,
    });
  }

  estimateResponseTokens(body: unknown): number {
    return this.estimateText(this.extractResponseText(body));
  }

  estimateStreamTokens(body: string): number {
    return this.estimateText(this.extractStreamText(body));
  }

  extractResponseText(body: unknown): string {
    if (typeof body === "string") return body;
    if (!isRecord(body)) return "";

    const choices = Array.isArray(body.choices) ? body.choices : [];
    const choiceTexts = choices
      .map((choice) => {
        if (!isRecord(choice)) return "";
        const message = isRecord(choice.message) ? choice.message : null;
        const delta = isRecord(choice.delta) ? choice.delta : null;
        return [
          this.readContent(message?.content),
          this.readContent(delta?.content),
          typeof choice.text === "string" ? choice.text : "",
        ]
          .filter(Boolean)
          .join(" ");
      })
      .filter(Boolean);

    if (choiceTexts.length > 0) {
      return choiceTexts.join(" ");
    }

    const candidates = Array.isArray(body.candidates) ? body.candidates : [];
    const candidateText = candidates
      .map((candidate) => {
        if (!isRecord(candidate)) return "";
        const content = isRecord(candidate.content) ? candidate.content : null;
        const parts = Array.isArray(content?.parts) ? content?.parts : [];
        return parts
          .map((part) =>
            isRecord(part) && typeof part.text === "string" ? part.text : "",
          )
          .filter(Boolean)
          .join(" ");
      })
      .filter(Boolean)
      .join(" ");

    if (candidateText) return candidateText;

    const output = body.output;
    if (typeof output === "string") return output;

    const content = body.content;
    if (Array.isArray(content)) {
      return content
        .map((part) =>
          isRecord(part) && typeof part.text === "string" ? part.text : "",
        )
        .filter(Boolean)
        .join(" ");
    }

    return "";
  }

  extractStreamText(body: string): string {
    const fragments: string[] = [];

    for (const line of body.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(":")) continue;

      const payload = trimmed.startsWith("data:")
        ? trimmed.slice(5).trim()
        : trimmed;

      if (!payload || payload === "[DONE]") continue;

      try {
        const parsed = JSON.parse(payload);
        const responseText = this.extractResponseText(parsed);
        if (responseText) {
          fragments.push(responseText);
          continue;
        }

        if (isRecord(parsed)) {
          if (typeof parsed.response === "string") {
            fragments.push(parsed.response);
            continue;
          }

          const message = isRecord(parsed.message) ? parsed.message : null;
          const messageText = this.readContent(message?.content);
          if (messageText) {
            fragments.push(messageText);
            continue;
          }
        }
      } catch {
        // Ignore non-JSON payloads.
      }
    }

    return fragments.join(" ").trim();
  }

  private estimateRequestTokens(body: Record<string, unknown>): {
    promptTokens: number;
    imageCount: number;
    imageTokens: number;
    audioTokens: number;
    source: TokenUsage["estimationSource"];
  } {
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (messages.length > 0) {
      let promptTokens = 0;
      let imageCount = 0;
      let audioTokens = 0;

      for (const message of messages) {
        if (!isRecord(message)) continue;
        promptTokens += 4;

        const content = message.content;
        if (typeof content === "string") {
          promptTokens += this.estimateText(content);
          continue;
        }

        if (!Array.isArray(content)) continue;

        for (const part of content) {
          if (!isRecord(part)) continue;
          const type = typeof part.type === "string" ? part.type : "";
          if (type === "text" && typeof part.text === "string") {
            promptTokens += this.estimateText(part.text);
          } else if (type === "image_url" || type === "input_image") {
            imageCount += 1;
          } else if (type === "input_audio" || type === "audio") {
            audioTokens += 50;
          }
        }
      }

      return {
        promptTokens,
        imageCount,
        imageTokens: 0,
        audioTokens,
        source: "chat-messages",
      };
    }

    const promptText = this.extractRequestText(body);
    const imageCount = this.extractImageCount(body);

    return {
      promptTokens: this.estimateText(promptText),
      imageCount,
      imageTokens: 0,
      audioTokens: 0,
      source: imageCount > 0 ? "image-count" : "request-text",
    };
  }

  private extractRequestText(body: Record<string, unknown>): string {
    const prompt = body.prompt;
    if (typeof prompt === "string") return prompt;

    const input = body.input;
    if (typeof input === "string") return input;

    if (Array.isArray(input)) {
      return input
        .map((entry) => {
          if (typeof entry === "string") return entry;
          if (!isRecord(entry)) return "";
          return this.readContent(entry.content);
        })
        .filter(Boolean)
        .join(" ");
    }

    const contents = Array.isArray(body.contents) ? body.contents : [];
    if (contents.length > 0) {
      return contents
        .map((entry) => {
          if (!isRecord(entry)) return "";
          const parts = Array.isArray(entry.parts) ? entry.parts : [];
          return parts
            .map((part) =>
              isRecord(part) && typeof part.text === "string" ? part.text : "",
            )
            .filter(Boolean)
            .join(" ");
        })
        .filter(Boolean)
        .join(" ");
    }

    return "";
  }

  private extractImageCount(body: Record<string, unknown>): number {
    const dataCount = Array.isArray(body.images) ? body.images.length : 0;
    const explicitCount = clampCount(body.n);
    return Math.max(dataCount, explicitCount);
  }

  private extractModelId(body: Record<string, unknown>): string {
    return typeof body.model === "string"
      ? body.model
      : typeof body.modelId === "string"
        ? body.modelId
        : "";
  }

  private readContent(content: unknown): string {
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) return "";

    return content
      .map((part) =>
        isRecord(part) && typeof part.text === "string" ? part.text : "",
      )
      .filter(Boolean)
      .join(" ");
  }
}
