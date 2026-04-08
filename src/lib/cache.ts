interface CacheEntry<T> {
  data: T
  expiresAt: number
}

// Module-level cache — shared across requests within the same serverless instance
const store = new Map<string, CacheEntry<unknown>>()

/**
 * Returns a cached value by key, or null if missing or expired.
 * Cache is in-memory per serverless instance — not shared across multiple Vercel instances.
 */
export function cacheGet<T>(key: string): T | null {
  const entry = store.get(key) as CacheEntry<T> | undefined
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    store.delete(key)
    return null
  }
  return entry.data
}

/** Stores a value under key with a TTL in milliseconds. */
export function cacheSet<T>(key: string, data: T, ttlMs: number): void {
  store.set(key, { data, expiresAt: Date.now() + ttlMs })
}
