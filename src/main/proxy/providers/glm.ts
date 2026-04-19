import { OpenAICompatibleProvider } from "./base";

export class GLMProvider extends OpenAICompatibleProvider {
  name = "glm";
  baseUrl = "https://api.z.ai/";

  matchRequest(path: string, _headers: Record<string, string>): boolean {
    return path.startsWith("/api/paas/v4/") || path.startsWith("/v4/");
  }

  getDisplayName(): string {
    return "GLM (ZhipuAI)";
  }

  // ── ZhipuAI monitoring API (for catch-up / reconciliation sync) ──────────
  //
  // These endpoints are NOT proxied — they are documented here for future use
  // by a scheduled sync job that can backfill usage data the proxy may have
  // missed (e.g. requests made outside the proxy).
  //
  // Quota limits:
  //   GET https://api.z.ai/api/monitor/usage/quota/limit
  //
  // Model usage stats (24-hour rolling window):
  //   GET https://api.z.ai/api/monitor/usage/model-usage?startTime=...&endTime=...
  //
  // Auth header format (note: NO "Bearer" prefix):
  //   Authorization: {token}
}
