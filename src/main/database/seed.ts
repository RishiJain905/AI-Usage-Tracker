/**
 * Seed data — reference providers and models inserted on first run.
 *
 * Uses INSERT OR IGNORE so the operation is idempotent and can safely
 * be called on every startup without duplicating existing rows.
 */

import type Database from "better-sqlite3";
import type { SeedProvider, SeedModel } from "./types";

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

const SEED_PROVIDERS: SeedProvider[] = [
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com",
    icon: "openai",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    baseUrl: "https://api.anthropic.com",
    icon: "anthropic",
  },
  {
    id: "ollama",
    name: "Ollama",
    baseUrl: "http://localhost:11434",
    icon: "ollama",
  },
  {
    id: "glm",
    name: "ZhipuAI (GLM)",
    baseUrl: "https://api.z.ai",
    icon: "glm",
  },
  {
    id: "minimax",
    name: "MiniMax",
    baseUrl: "https://api.minimax.chat",
    icon: "minimax",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com",
    icon: "gemini",
  },
  {
    id: "mistral",
    name: "Mistral",
    baseUrl: "https://api.mistral.ai",
    icon: "mistral",
  },
  { id: "groq", name: "Groq", baseUrl: "https://api.groq.com", icon: "groq" },
];

const SEED_MODELS: SeedModel[] = [
  // OpenAI
  {
    id: "gpt-4o",
    providerId: "openai",
    name: "GPT-4o",
    inputPrice: 2.5,
    outputPrice: 10.0,
  },
  {
    id: "gpt-4o-mini",
    providerId: "openai",
    name: "GPT-4o Mini",
    inputPrice: 0.15,
    outputPrice: 0.6,
  },
  {
    id: "gpt-4-turbo",
    providerId: "openai",
    name: "GPT-4 Turbo",
    inputPrice: 10.0,
    outputPrice: 30.0,
  },
  {
    id: "gpt-3.5-turbo",
    providerId: "openai",
    name: "GPT-3.5 Turbo",
    inputPrice: 0.5,
    outputPrice: 1.5,
  },
  {
    id: "o1-preview",
    providerId: "openai",
    name: "o1-preview",
    inputPrice: 15.0,
    outputPrice: 60.0,
  },
  {
    id: "o1-mini",
    providerId: "openai",
    name: "o1-mini",
    inputPrice: 3.0,
    outputPrice: 12.0,
  },
  {
    id: "text-embedding-3-small",
    providerId: "openai",
    name: "Embedding 3 Small",
    inputPrice: 0.02,
    outputPrice: 0,
  },
  {
    id: "text-embedding-3-large",
    providerId: "openai",
    name: "Embedding 3 Large",
    inputPrice: 0.13,
    outputPrice: 0,
  },

  // Anthropic
  {
    id: "claude-3.5-sonnet",
    providerId: "anthropic",
    name: "Claude 3.5 Sonnet",
    inputPrice: 3.0,
    outputPrice: 15.0,
  },
  {
    id: "claude-3-opus",
    providerId: "anthropic",
    name: "Claude 3 Opus",
    inputPrice: 15.0,
    outputPrice: 75.0,
  },
  {
    id: "claude-3-haiku",
    providerId: "anthropic",
    name: "Claude 3 Haiku",
    inputPrice: 0.25,
    outputPrice: 1.25,
  },

  // GLM
  {
    id: "glm-4",
    providerId: "glm",
    name: "GLM-4",
    inputPrice: 0.14,
    outputPrice: 0.14,
  },
  {
    id: "glm-4-plus",
    providerId: "glm",
    name: "GLM-4 Plus",
    inputPrice: 0.5,
    outputPrice: 0.5,
  },
  {
    id: "glm-4-flash",
    providerId: "glm",
    name: "GLM-4 Flash",
    inputPrice: 0.01,
    outputPrice: 0.01,
  },

  // MiniMax
  {
    id: "abab6.5-chat",
    providerId: "minimax",
    name: "ABAB 6.5 Chat",
    inputPrice: 0.3,
    outputPrice: 0.3,
  },
  {
    id: "abab6.5s-chat",
    providerId: "minimax",
    name: "ABAB 6.5S Chat",
    inputPrice: 0.1,
    outputPrice: 0.1,
  },

  // Gemini
  {
    id: "gemini-1.5-pro",
    providerId: "gemini",
    name: "Gemini 1.5 Pro",
    inputPrice: 1.25,
    outputPrice: 5.0,
  },
  {
    id: "gemini-1.5-flash",
    providerId: "gemini",
    name: "Gemini 1.5 Flash",
    inputPrice: 0.075,
    outputPrice: 0.3,
  },

  // Mistral
  {
    id: "mistral-large",
    providerId: "mistral",
    name: "Mistral Large",
    inputPrice: 2.0,
    outputPrice: 6.0,
  },
  {
    id: "mistral-medium",
    providerId: "mistral",
    name: "Mistral Medium",
    inputPrice: 0.7,
    outputPrice: 2.1,
  },
  {
    id: "mistral-small",
    providerId: "mistral",
    name: "Mistral Small",
    inputPrice: 0.2,
    outputPrice: 0.6,
  },

  // Groq
  {
    id: "llama-3.1-70b-versatile",
    providerId: "groq",
    name: "Llama 3.1 70B",
    inputPrice: 0.59,
    outputPrice: 0.79,
  },
  {
    id: "llama-3.1-8b-instant",
    providerId: "groq",
    name: "Llama 3.1 8B",
    inputPrice: 0.05,
    outputPrice: 0.08,
  },
  {
    id: "mixtral-8x7b-32768",
    providerId: "groq",
    name: "Mixtral 8x7B",
    inputPrice: 0.24,
    outputPrice: 0.24,
  },

  // Ollama local
  {
    id: "llama3.1",
    providerId: "ollama",
    name: "Llama 3.1",
    inputPrice: 0,
    outputPrice: 0,
    isLocal: true,
  },
  {
    id: "mistral-nemo",
    providerId: "ollama",
    name: "Mistral Nemo",
    inputPrice: 0,
    outputPrice: 0,
    isLocal: true,
  },
  {
    id: "codellama",
    providerId: "ollama",
    name: "Code Llama",
    inputPrice: 0,
    outputPrice: 0,
    isLocal: true,
  },

  // Ollama cloud
  {
    id: "ollama-cloud-llama3.1",
    providerId: "ollama",
    name: "Llama 3.1 (Ollama Cloud)",
    inputPrice: 0,
    outputPrice: 0,
    isLocal: false,
  },
  {
    id: "ollama-cloud-qwen2.5",
    providerId: "ollama",
    name: "Qwen 2.5 (Ollama Cloud)",
    inputPrice: 0,
    outputPrice: 0,
    isLocal: false,
  },
  {
    id: "ollama-cloud-gemma3",
    providerId: "ollama",
    name: "Gemma 3 (Ollama Cloud)",
    inputPrice: 0,
    outputPrice: 0,
    isLocal: false,
  },
];

// ---------------------------------------------------------------------------
// Seed function
// ---------------------------------------------------------------------------

/**
 * Insert reference providers and models into the database.
 * Uses INSERT OR IGNORE so it is safe to call on every startup.
 */
export function seedDatabase(db: Database.Database): void {
  const insertProvider = db.prepare(`
    INSERT OR IGNORE INTO providers (id, name, base_url, icon)
    VALUES (?, ?, ?, ?)
  `);

  const insertModel = db.prepare(`
    INSERT OR IGNORE INTO models (id, provider_id, name, input_price_per_million, output_price_per_million, is_local)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    for (const provider of SEED_PROVIDERS) {
      insertProvider.run(
        provider.id,
        provider.name,
        provider.baseUrl,
        provider.icon,
      );
    }

    for (const model of SEED_MODELS) {
      insertModel.run(
        model.id,
        model.providerId,
        model.name,
        model.inputPrice,
        model.outputPrice,
        model.isLocal ? 1 : 0,
      );
    }
  });

  transaction();
  console.info(
    `[Seed] Inserted ${SEED_PROVIDERS.length} providers and ${SEED_MODELS.length} models`,
  );
}

export { SEED_PROVIDERS, SEED_MODELS };
