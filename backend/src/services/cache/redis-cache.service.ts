import { config } from '../../config/env.js';
import { MemoryCacheService } from './memory-cache.service.js';

/**
 * Dual-tier Cache Service:
 * Tier 1: Upstash Redis over REST (Persistent, Distributed)
 * Tier 2: In-Memory Cache (Zero-latency fallback if Redis is down or unconfigured)
 */
export class RedisCacheService {
  private memoryFallback: MemoryCacheService;
  private isConfigured: boolean;
  private restUrl?: string;
  private restToken?: string;

  constructor() {
    this.restUrl = config.upstashRedisRestUrl?.trim();
    this.restToken = config.upstashRedisRestToken?.trim();
    this.isConfigured = Boolean(this.restUrl && this.restToken);
    this.memoryFallback = new MemoryCacheService(60 * 60 * 1000); // 1-hour in-memory fallback
  }

  /**
   * Retrieves an item from Upstash Redis, falling back to local memory cache.
   */
  public async get<T>(key: string): Promise<T | null> {
    if (this.isConfigured && this.restUrl && this.restToken) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);

        const res = await fetch(`${this.restUrl}/get/${encodeURIComponent(key)}`, {
          headers: {
            Authorization: `Bearer ${this.restToken}`,
            Accept: 'application/json',
          },
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (res.ok) {
          const json = (await res.json()) as any;
          if (json && json.result !== null && json.result !== undefined) {
            try {
              // Upstash stores objects as JSON strings or raw strings
              if (typeof json.result === 'string') {
                return JSON.parse(json.result) as T;
              }
              return json.result as T;
            } catch {
              return json.result as T;
            }
          }
          return null;
        }
      } catch (err) {
        console.warn(`[RedisCacheService] Redis GET failed for key "${key}", falling back to memory:`, (err as Error).message);
      }
    }

    // Fallback to local memory cache
    return this.memoryFallback.get<T>(key);
  }

  /**
   * Stores an item in Upstash Redis and local memory cache with TTL in seconds.
   */
  public async set<T>(key: string, value: T, ttlSeconds: number = 86400 * 30): Promise<boolean> {
    // Store in memory cache (convert seconds to milliseconds)
    this.memoryFallback.set(key, value, ttlSeconds * 1000);

    if (this.isConfigured && this.restUrl && this.restToken) {
      try {
        const payload = typeof value === 'object' ? JSON.stringify(value) : String(value);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);

        const url = ttlSeconds > 0
          ? `${this.restUrl}/set/${encodeURIComponent(key)}/${encodeURIComponent(payload)}?ex=${ttlSeconds}`
          : `${this.restUrl}/set/${encodeURIComponent(key)}/${encodeURIComponent(payload)}`;

        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${this.restToken}`,
            Accept: 'application/json',
          },
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (res.ok) {
          const json = (await res.json()) as any;
          return json?.result === 'OK';
        }
      } catch (err) {
        console.warn(`[RedisCacheService] Redis SET failed for key "${key}":`, (err as Error).message);
      }
    }

    return true;
  }

  /**
   * Deletes a key from Redis and local memory.
   */
  public async del(key: string): Promise<boolean> {
    this.memoryFallback.delete(key);

    if (this.isConfigured && this.restUrl && this.restToken) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);

        const res = await fetch(`${this.restUrl}/del/${encodeURIComponent(key)}`, {
          headers: {
            Authorization: `Bearer ${this.restToken}`,
            Accept: 'application/json',
          },
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (res.ok) {
          const json = (await res.json()) as any;
          return Boolean(json?.result && json.result > 0);
        }
      } catch (err) {
        console.warn(`[RedisCacheService] Redis DEL failed for key "${key}":`, (err as Error).message);
      }
    }

    return true;
  }

  /**
   * Checks if key exists.
   */
  public async exists(key: string): Promise<boolean> {
    const memoryHit = this.memoryFallback.has(key);
    if (memoryHit) return true;

    if (this.isConfigured && this.restUrl && this.restToken) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);

        const res = await fetch(`${this.restUrl}/exists/${encodeURIComponent(key)}`, {
          headers: {
            Authorization: `Bearer ${this.restToken}`,
            Accept: 'application/json',
          },
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (res.ok) {
          const json = (await res.json()) as any;
          return json?.result === 1;
        }
      } catch {
        return false;
      }
    }

    return false;
  }

  /**
   * Health status of cache service.
   */
  public async getHealth(): Promise<{ redis: 'connected' | 'disconnected' | 'disabled'; memoryEntries: number }> {
    if (!this.isConfigured) {
      return { redis: 'disabled', memoryEntries: this.memoryFallback.getStats().size };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${this.restUrl}/ping`, {
        headers: { Authorization: `Bearer ${this.restToken}` },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const json = (await res.json()) as any;
        const isOk = json?.result === 'PONG' || json?.result === 'OK';
        return {
          redis: isOk ? 'connected' : 'disconnected',
          memoryEntries: this.memoryFallback.getStats().size,
        };
      }
      return { redis: 'disconnected', memoryEntries: this.memoryFallback.getStats().size };
    } catch {
      return { redis: 'disconnected', memoryEntries: this.memoryFallback.getStats().size };
    }
  }
}

export const redisCache = new RedisCacheService();
