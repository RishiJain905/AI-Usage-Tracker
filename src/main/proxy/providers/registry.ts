import type { Provider } from "./base";

export class ProviderRegistry {
  private providers: Map<string, Provider> = new Map();

  register(provider: Provider): void {
    this.providers.set(provider.name, provider);
  }

  get(name: string): Provider | undefined {
    return this.providers.get(name);
  }

  getAll(): Provider[] {
    return Array.from(this.providers.values());
  }

  detectProvider(
    path: string,
    headers: Record<string, string>,
  ): Provider | null {
    for (const provider of this.providers.values()) {
      if (provider.matchRequest(path, headers)) {
        return provider;
      }
    }
    return null;
  }
}

export const providerRegistry = new ProviderRegistry();
