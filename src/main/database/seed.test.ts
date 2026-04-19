import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "./migrations/index";
import { seedDatabase, SEED_PROVIDERS, SEED_MODELS } from "./seed";

describe("seedDatabase", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        version INTEGER PRIMARY KEY,
        description TEXT,
        applied_at TEXT DEFAULT (datetime('now'))
      );
    `);
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it("should insert all 8 providers", () => {
    seedDatabase(db);

    const count = db
      .prepare("SELECT COUNT(*) AS cnt FROM providers")
      .get() as { cnt: number };
    expect(count.cnt).toBe(8);
  });

  it("should insert all seed models", () => {
    seedDatabase(db);

    const count = db
      .prepare("SELECT COUNT(*) AS cnt FROM models")
      .get() as { cnt: number };
    expect(count.cnt).toBe(SEED_MODELS.length);
  });

  it("should be idempotent — running twice does not duplicate data", () => {
    seedDatabase(db);
    seedDatabase(db);

    const providers = db
      .prepare("SELECT COUNT(*) AS cnt FROM providers")
      .get() as { cnt: number };
    const models = db
      .prepare("SELECT COUNT(*) AS cnt FROM models")
      .get() as { cnt: number };

    expect(providers.cnt).toBe(8);
    expect(models.cnt).toBe(SEED_MODELS.length);
  });

  it("should insert OpenAI provider with correct data", () => {
    seedDatabase(db);

    const openai = db
      .prepare("SELECT * FROM providers WHERE id = 'openai'")
      .get() as { id: string; name: string; base_url: string; icon: string };

    expect(openai).toBeDefined();
    expect(openai.name).toBe("OpenAI");
    expect(openai.base_url).toBe("https://api.openai.com");
    expect(openai.icon).toBe("openai");
  });

  it("should insert Anthropic provider with correct data", () => {
    seedDatabase(db);

    const anthropic = db
      .prepare("SELECT * FROM providers WHERE id = 'anthropic'")
      .get() as { id: string; name: string; base_url: string; icon: string };

    expect(anthropic).toBeDefined();
    expect(anthropic.name).toBe("Anthropic");
    expect(anthropic.base_url).toBe("https://api.anthropic.com");
  });

  it("should insert GPT-4o model with correct data", () => {
    seedDatabase(db);

    const gpt4o = db
      .prepare("SELECT * FROM models WHERE id = 'gpt-4o'")
      .get() as {
        id: string;
        provider_id: string;
        name: string;
        input_price_per_million: number;
        output_price_per_million: number;
      };

    expect(gpt4o).toBeDefined();
    expect(gpt4o.provider_id).toBe("openai");
    expect(gpt4o.name).toBe("GPT-4o");
    expect(gpt4o.input_price_per_million).toBe(2.5);
    expect(gpt4o.output_price_per_million).toBe(10.0);
  });

  it("should insert Claude 3.5 Sonnet model with correct data", () => {
    seedDatabase(db);

    const claude = db
      .prepare("SELECT * FROM models WHERE id = 'claude-3.5-sonnet'")
      .get() as {
        provider_id: string;
        name: string;
        input_price_per_million: number;
        output_price_per_million: number;
      };

    expect(claude).toBeDefined();
    expect(claude.provider_id).toBe("anthropic");
    expect(claude.input_price_per_million).toBe(3.0);
    expect(claude.output_price_per_million).toBe(15.0);
  });

  it("should mark local Ollama models as is_local = 1", () => {
    seedDatabase(db);

    const localModel = db
      .prepare("SELECT * FROM models WHERE id = 'llama3.1'")
      .get() as { is_local: number };

    expect(localModel).toBeDefined();
    expect(localModel.is_local).toBe(1);
  });

  it("should mark non-local models as is_local = 0", () => {
    seedDatabase(db);

    const cloudModel = db
      .prepare("SELECT * FROM models WHERE id = 'gpt-4o'")
      .get() as { is_local: number };

    expect(cloudModel).toBeDefined();
    expect(cloudModel.is_local).toBe(0);
  });

  it("should have SEED_PROVIDERS matching the inserted data", () => {
    seedDatabase(db);

    expect(SEED_PROVIDERS).toHaveLength(8);
    const ids = SEED_PROVIDERS.map((p) => p.id);
    expect(ids).toContain("openai");
    expect(ids).toContain("anthropic");
    expect(ids).toContain("ollama");
    expect(ids).toContain("glm");
    expect(ids).toContain("minimax");
    expect(ids).toContain("gemini");
    expect(ids).toContain("mistral");
    expect(ids).toContain("groq");
  });

  it("should have SEED_MODELS matching the inserted data", () => {
    seedDatabase(db);

    expect(SEED_MODELS.length).toBeGreaterThan(0);
    const ids = SEED_MODELS.map((m) => m.id);
    expect(ids).toContain("gpt-4o");
    expect(ids).toContain("claude-3.5-sonnet");
    expect(ids).toContain("glm-4");
    expect(ids).toContain("llama3.1");
  });
});
