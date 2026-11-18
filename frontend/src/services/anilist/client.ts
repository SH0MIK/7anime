import type { AniListGraphQLResponse } from './types';

export class AniListError extends Error {
  public status?: number;
  public retryable: boolean;
  public details?: any;

  constructor(message: string, status?: number, retryable = false, details?: any) {
    super(message);
    this.name = 'AniListError';
    this.status = status;
    this.retryable = retryable;
    this.details = details;
  }
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export class AniListClient {
  private static instance: AniListClient;
  private readonly endpoint = 'https://graphql.anilist.co';
  private readonly inFlight = new Map<string, Promise<any>>();
  private readonly cache = new Map<string, CacheEntry<any>>();

  // Cache TTLs
  private readonly defaultTtlMs = 15 * 60 * 1000; // 15 minutes default

  private constructor() {
    // Periodic cache sweep every 5 minutes
    if (typeof window !== 'undefined') {
      window.setInterval(() => this.sweepExpiredCache(), 5 * 60 * 1000);
    }
  }

  public static getInstance(): AniListClient {
    if (!AniListClient.instance) {
      AniListClient.instance = new AniListClient();
    }
    return AniListClient.instance;
  }

  /**
   * Executes a typed GraphQL query against AniList with caching, deduplication, and retry.
   */
  public async query<T>(
    query: string,
    variables: Record<string, any> = {},
    options: {
      ttlMs?: number;
      skipCache?: boolean;
      timeoutMs?: number;
      maxRetries?: number;
    } = {}
  ): Promise<T> {
    const cacheKey = `${query.trim()}::${JSON.stringify(variables)}`;

    // 1. Check in-memory cache
    if (!options.skipCache) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() < cached.expiresAt) {
        return cached.data as T;
      }
    }

    // 2. Check in-flight requests for deduplication
    if (this.inFlight.has(cacheKey)) {
      return this.inFlight.get(cacheKey)! as Promise<T>;
    }

    // 3. Initiate request with retry & timeout
    const executionPromise = this.executeWithRetry<T>(
      query,
      variables,
      options.timeoutMs ?? 15000,
      options.maxRetries ?? 2
    )
      .then((data) => {
        // Cache successful response
        const ttl = options.ttlMs ?? this.defaultTtlMs;
        this.cache.set(cacheKey, {
          data,
          expiresAt: Date.now() + ttl,
        });
        return data;
      })
      .finally(() => {
        this.inFlight.delete(cacheKey);
      });

    this.inFlight.set(cacheKey, executionPromise);
    return executionPromise;
  }

  private async executeWithRetry<T>(
    query: string,
    variables: Record<string, any>,
    timeoutMs: number,
    retriesLeft: number
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle 429 Rate Limiting
      if (response.status === 429) {
        const retryAfterHeader = response.headers.get('retry-after');
        const retryDelaySec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 3;
        const delayMs = Math.min(Math.max(retryDelaySec * 1000, 1500), 10000);

        if (retriesLeft > 0) {
          console.warn(`[AniListClient] Rate limited (429). Retrying after ${delayMs}ms...`);
          await new Promise((r) => setTimeout(r, delayMs));
          return this.executeWithRetry<T>(query, variables, timeoutMs, retriesLeft - 1);
        }

        throw new AniListError(
          'AniList API rate limit reached. Please wait a moment and try again.',
          429,
          true
        );
      }

      // Handle other HTTP errors
      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new AniListError(
          `AniList HTTP Error [${response.status}]: ${errorText.slice(0, 200)}`,
          response.status,
          response.status >= 500
        );
      }

      const json: AniListGraphQLResponse<T> = await response.json();

      if (json.errors && json.errors.length > 0) {
        const firstError = json.errors[0];
        throw new AniListError(firstError.message, firstError.status || 400, false, json.errors);
      }

      if (!json.data) {
        throw new AniListError('No data returned in AniList GraphQL response.', 500, true);
      }

      return json.data;
    } catch (err: any) {
      clearTimeout(timeoutId);

      if (err.name === 'AbortError') {
        throw new AniListError(
          `AniList request timed out after ${timeoutMs}ms.`,
          408,
          true
        );
      }

      if (err instanceof AniListError) {
        throw err;
      }

      // Network / Fetch error
      if (retriesLeft > 0) {
        console.warn(`[AniListClient] Network error: ${err.message}. Retrying in 1s...`);
        await new Promise((r) => setTimeout(r, 1000));
        return this.executeWithRetry<T>(query, variables, timeoutMs, retriesLeft - 1);
      }

      throw new AniListError(
        `Unable to reach AniList: ${err.message}`,
        0,
        true,
        err
      );
    }
  }

  private sweepExpiredCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now >= entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  public clearCache(): void {
    this.cache.clear();
  }
}

export const anilistClient = AniListClient.getInstance();
