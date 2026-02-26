// In-memory cache with TTL for wiki scan results

interface CacheEntry<T> {
  data: T;
  validatorData?: unknown;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class WikiCache<T> {
  private store = new Map<string, CacheEntry<T>>();
  private ttlMs: number;

  constructor(ttlMs = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
  }

  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data;
  }

  set(key: string, data: T, validatorData?: unknown): void {
    this.store.set(key, { data, validatorData, expiresAt: Date.now() + this.ttlMs });
  }

  getValidatorData(key: string): unknown | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.validatorData ?? null;
  }

  has(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }

  invalidateAll(): void {
    this.store.clear();
  }
}

// Singleton cache for project scan results
// Typed as `any` to avoid circular import with scanner.ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const scanCache = new WikiCache<any>();
