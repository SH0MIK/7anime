/**
 * 7Anime Intelligent Multi-Layer Cache System — Shared Cache Types
 */

export interface CacheEntry<T> {
  value: T;
  cachedAt: number;
  expiresAt: number;
  staleUntil?: number;
  tags?: string[];
  version: number;
  sizeBytes?: number;
}

export interface CacheSetOptions {
  /** Time to live in milliseconds (default: 30 minutes) */
  ttlMs?: number;
  /** Stale-while-revalidate window in milliseconds after expiration */
  staleTtlMs?: number;
  /** Invalidation tags (e.g. ['anime:154587', 'category:action']) */
  tags?: string[];
  /** Negative cache duration in milliseconds for null/empty values */
  negativeTtlMs?: number;
  /** Skip saving to L2 persistent cache */
  skipL2?: boolean;
}

export interface CacheFetchOptions extends CacheSetOptions {
  /** Bypass cache and force network fetch */
  forceRefresh?: boolean;
  /** Callback invoked when stale data is served while background revalidation occurs */
  onStaleHit?: (staleValue: any) => void;
}

export interface CacheMetrics {
  totalReads: number;
  hitsL1: number;
  hitsL2: number;
  misses: number;
  revalidations: number;
  deduplications: number;
  evictions: number;
  failedWrites: number;
  hitRatio: number;
  bytesEstimate: number;
  entryCountL1: number;
  entryCountL2: number;
}
