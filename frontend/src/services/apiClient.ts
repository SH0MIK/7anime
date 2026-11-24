import type {
  ResolvedAnime,
  ArtworkResolution,
  AnimeSearchResult,
  AnimeLogoResult,
  AnimeExternalIds,
  AnimeEpisodeCatalogue,
  RecentAiredEpisodeItem,
  AiringScheduleItem,
  WeeklyScheduleResponse,
} from '@7anime/shared';
import { cacheManager } from './cache';

export interface BackendHealthResponse {
  status: string;
  service: string;
  version: string;
  timestamp: string;
  uptimeSeconds: number;
  memoryUsageMb: number;
  environment: {
    port: number;
    nodeEnv: string;
    corsOrigins: string[];
    providersConfigured: {
      tmdbApiKey: boolean;
      tmdbReadAccessToken: boolean;
      upstashRedis: boolean;
      anilist: boolean;
      mal?: boolean;
    };
  };
}

export interface ClientAuthConfig {
  googleOAuthEnabled: boolean;
  supabaseUrl: string | null;
  supabasePublishableKey: string | null;
  publicLogoUrl?: string;
}

export interface UserProfileResponse {
  user: {
    id: string;
    email: string;
    createdAt?: string;
    app_metadata?: {
      provider?: string;
      providers?: string[];
      [key: string]: any;
    };
    user_metadata?: Record<string, any>;
  };
  profile: {
    id: string;
    email: string;
    username?: string;
    displayName?: string;
    avatarUrl?: string;
    bannerUrl?: string;
    banner?: string;
    avatarDecoration?: string;
    bannerEffect?: string;
    frameStyle?: string;
    usernameGlow?: string | null;
    visibility?: any;
    bio?: string;
  };
}

class ApiClient {
  private baseUrl: string;
  private authToken: string | null = null;
  private refreshPromise: Promise<boolean> | null = null;

  private readonly SESSION_STORAGE_KEY = '7anime_auth_session';

  constructor() {
    const env = (typeof import.meta !== 'undefined' && (import.meta as any).env) || {};
    const isDev = Boolean(env.DEV);

    if (isDev) {
      // Local development MUST communicate ONLY with the local backend by default.
      // An explicit development override can be provided via VITE_DEV_API_BASE_URL.
      // Standard production environment variables (VITE_API_BASE_URL / VITE_API_URL) NEVER route dev traffic to Render.
      const devOverride = (env.VITE_DEV_API_BASE_URL as string | undefined)?.trim();
      const raw = devOverride || 'http://localhost:3001/api';
      const clean = raw.replace(/\/+$/, '');
      this.baseUrl = clean.endsWith('/api') ? clean : `${clean}/api`;
    } else {
      // Production mode: communicate with Render backend via Vercel env variable, or fallback to /api
      const prodUrl = String(env.VITE_API_BASE_URL || env.VITE_API_URL || '').trim();
      if (!prodUrl) {
        this.baseUrl = '/api';
      } else {
        const clean = prodUrl.replace(/\/+$/, '');
        this.baseUrl = clean.endsWith('/api') ? clean : `${clean}/api`;
      }
    }

    // Restore active session token from tab-scoped sessionStorage if present
    const stored = this.getStoredSession();
    if (stored?.access_token) {
      this.authToken = stored.access_token;
    }
  }

  /**
   * Returns normalized API base URL (guaranteed to end in /api).
   */
  public getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Persists active session into tab-scoped sessionStorage and memory.
   */
  public saveSession(session: any) {
    if (session?.access_token) {
      this.authToken = session.access_token;
      try {
        sessionStorage.setItem(this.SESSION_STORAGE_KEY, JSON.stringify(session));
      } catch { }
    }
  }

  /**
   * Retrieves tab-scoped session from sessionStorage.
   */
  public getStoredSession(): any | null {
    try {
      const raw = sessionStorage.getItem(this.SESSION_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  /**
   * Purges active session from memory and sessionStorage.
   */
  public clearSession() {
    this.authToken = null;
    try {
      sessionStorage.removeItem(this.SESSION_STORAGE_KEY);
    } catch { }
  }

  /**
   * Sets or clears the active Supabase JWT session token.
   */
  public setAuthToken(token: string | null) {
    this.authToken = token;
    if (!token) {
      this.clearSession();
    }
  }

  /**
   * Returns current auth token.
   */
  public getAuthToken(): string | null {
    return this.authToken;
  }

  /**
   * Returns true if client has an active authenticated session token.
   */
  public isAuthenticated(): boolean {
    return Boolean(this.authToken);
  }

  /**
   * Merges default headers with Authorization Bearer if available.
   */
  private getHeaders(custom: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...custom,
    };
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }
    return headers;
  }

  /**
   * Fetches the backend health diagnostics.
   * Checks /api/health with automatic root /health fallback.
   */
  async getHealth(): Promise<BackendHealthResponse> {
    const res = await fetch(`${this.baseUrl}/health`, {
      headers: this.getHeaders(),
      credentials: 'include',
    });

    if (!res.ok) {
      // Fallback: If /api/health returned non-200, attempt bare /health root endpoint
      const rootUrl = this.baseUrl.replace(/\/api\/?$/, '');
      if (rootUrl && rootUrl !== this.baseUrl) {
        try {
          const fallbackRes = await fetch(`${rootUrl}/health`, {
            headers: this.getHeaders(),
            credentials: 'include',
          });
          if (fallbackRes.ok) {
            return fallbackRes.json();
          }
        } catch { }
      }
      throw new Error(`API health check failed with status: ${res.status}`);
    }

    return res.json();
  }

  /**
   * Returns the direct backend entrypoint for Google OAuth initiation.
   * Direct top-level navigation allows the backend to set the oauth_state cookie
   * in a first-party context, preventing third-party cookie blocks across all browsers.
   */
  getGoogleLoginUrl(): string {
    return `${this.baseUrl}/auth/google`;
  }

  /**
   * Fetches the Google OAuth authorization redirect URL from backend.
   */
  async getGoogleOAuthUrl(): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/auth/google/url`, {
        headers: this.getHeaders(),
        credentials: 'include',
      });

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        return {
          success: false,
          error: `Authentication server returned non-JSON response (HTTP ${res.status}).`,
        };
      }

      const json = await res.json();
      if (!res.ok || !json.success) {
        return {
          success: false,
          error: json.error || `Failed to retrieve Google OAuth URL (HTTP ${res.status}).`,
        };
      }

      return {
        success: true,
        url: json.url,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `Network failure connecting to authentication server: ${message}`,
      };
    }
  }

  /**
   * Exchanges a single-use authorization ticket with backend for an active Supabase session.
   * Eliminates long-lived token exposure in browser URL history.
   */
  async exchangeAuthTicket(ticket: string): Promise<{ success: boolean; session?: any; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/auth/session/exchange`, {
        method: 'POST',
        headers: this.getHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({ ticket }),
      });

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        return { success: false, error: `Auth exchange returned non-JSON response (HTTP ${res.status})` };
      }

      const json = await res.json();
      if (!res.ok || !json.success || !json.session) {
        return { success: false, error: json.error || 'Failed to exchange authorization ticket.' };
      }

      this.saveSession(json.session);
      return { success: true, session: json.session };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Refreshes an expired Supabase session.
   * Utilizes a shared in-flight promise to prevent concurrent refresh requests
   * from causing Supabase Refresh Token Rotation (RTR) invalidation conflicts.
   */
  async refreshSession(): Promise<boolean> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    const stored = this.getStoredSession();
    if (!stored?.refresh_token) {
      return false;
    }

    this.refreshPromise = (async (): Promise<boolean> => {
      try {
        const res = await fetch(`${this.baseUrl}/auth/session/refresh`, {
          method: 'POST',
          headers: this.getHeaders({ 'Content-Type': 'application/json' }),
          credentials: 'include',
          body: JSON.stringify({ refresh_token: stored.refresh_token }),
        });

        if (!res.ok) {
          this.clearSession();
          return false;
        }

        const json = await res.json();
        if (json.success && json.session) {
          this.saveSession(json.session);
          return true;
        }

        this.clearSession();
        return false;
      } catch {
        this.clearSession();
        return false;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  /**
   * Server-side logout: calls backend logout endpoint and clears local session.
   */
  async logout(): Promise<{ success: boolean }> {
    try {
      await fetch(`${this.baseUrl}/auth/logout`, {
        method: 'POST',
        headers: this.getHeaders(),
        credentials: 'include',
      });
    } catch { } finally {
      this.clearSession();
    }
    return { success: true };
  }

  /**
   * Restores authenticated session on page load: verifies with backend /api/auth/me.
   */
  async restoreSession(): Promise<UserProfileResponse | null> {
    if (!this.authToken) {
      const stored = this.getStoredSession();
      if (stored?.access_token) {
        this.authToken = stored.access_token;
      }
    }

    if (!this.authToken) {
      const directMe = await this.getMe();
      if (directMe?.user) return directMe;
      return null;
    }

    let profile = await this.getMe();
    if (!profile) {
      const refreshed = await this.refreshSession();
      if (refreshed) {
        profile = await this.getMe();
      }
    }

    if (!profile) {
      this.clearSession();
    }

    return profile;
  }

  /**
   * Fetches client auth config from backend.
   */
  async getClientAuthConfig(): Promise<ClientAuthConfig | null> {
    try {
      const res = await fetch(`${this.baseUrl}/auth/config`, {
        headers: this.getHeaders(),
        credentials: 'include',
      });
      if (!res.ok) return null;
      const json = await res.json();
      return json.success ? (json.data as ClientAuthConfig) : null;
    } catch {
      return null;
    }
  }

  /**
   * Fetches current authenticated user profile.
   */
  async getMe(): Promise<UserProfileResponse | null> {
    try {
      const res = await fetch(`${this.baseUrl}/auth/me`, {
        headers: this.getHeaders(),
        credentials: 'include',
      });
      if (!res.ok) return null;
      const json = await res.json();
      return json.success ? (json.data as UserProfileResponse) : null;
    } catch {
      return null;
    }
  }

  /**
   * Updates user profile in Supabase PostgreSQL via backend.
   */
  async updateProfile(profileData: {
    username?: string;
    displayName?: string;
    avatarUrl?: string;
    bannerUrl?: string;
    banner?: string;
    avatarDecoration?: string;
    bannerEffect?: string;
    frameStyle?: string;
    usernameGlow?: string | null;
    visibility?: any;
    bio?: string;
  }) {
    const res = await fetch(`${this.baseUrl}/auth/profile`, {
      method: 'POST',
      headers: this.getHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'include',
      body: JSON.stringify(profileData),
    });
    return res.json();
  }

  /**
   * Fetches user watchlist.
   */
  async getWatchlist() {
    const res = await fetch(`${this.baseUrl}/auth/watchlist`, {
      headers: this.getHeaders(),
      credentials: 'include',
    });
    return res.json();
  }

  /**
   * Adds or updates anime in watchlist.
   */
  async updateWatchlist(item: { animeId: number; animeTitle: string; posterUrl?: string; format?: string; status: string }) {
    const res = await fetch(`${this.baseUrl}/auth/watchlist`, {
      method: 'POST',
      headers: this.getHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'include',
      body: JSON.stringify(item),
    });
    return res.json();
  }

  /**
   * Requests a password reset email via verified backend SMTP.
   */
  async sendPasswordReset(email: string, resetCodeOrUrl?: string) {
    const res = await fetch(`${this.baseUrl}/auth/password-reset`, {
      method: 'POST',
      headers: this.getHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'include',
      body: JSON.stringify({ email, resetCodeOrUrl }),
    });
    return res.json();
  }

  /**
   * Fetches resolved anime details by AniList ID with multi-layer caching,
   * in-flight deduplication, and Stale-While-Revalidate (SWR).
   */
  async getAnimeById(anilistId: number | string): Promise<ResolvedAnime | null> {
    const key = `anime:detail:v10:${anilistId}`;
    void cacheManager.delete(`anime:detail:${anilistId}`);
    void cacheManager.delete(`anime:detail:v9:${anilistId}`);
    return cacheManager.getOrFetch<ResolvedAnime | null>(
      key,
      async () => {
        const res = await fetch(`${this.baseUrl}/anime/${anilistId}`, {
          headers: this.getHeaders(),
        });
        if (!res.ok) {
          if (res.status === 404) return null;
          throw new Error(`API error ${res.status}: ${res.statusText}`);
        }
        const json = await res.json();
        return json.success && json.data ? (json.data as ResolvedAnime) : null;
      },
      {
        ttlMs: 12 * 60 * 60 * 1000, // 12 hours
        staleTtlMs: 24 * 60 * 60 * 1000, // 24 hours SWR
        tags: [`anime:${anilistId}`],
        negativeTtlMs: 60 * 1000,
      }
    );
  }

  /**
   * Fetches specific artwork breakdown for an anime with multi-layer caching.
   */
  async getAnimeArtwork(anilistId: number | string): Promise<ArtworkResolution | null> {
    const key = `anime:artwork:v10:${anilistId}`;
    void cacheManager.delete(`anime:artwork:${anilistId}`);
    return cacheManager.getOrFetch<ArtworkResolution | null>(
      key,
      async () => {
        const res = await fetch(`${this.baseUrl}/anime/${anilistId}/artwork`, {
          headers: this.getHeaders(),
        });
        if (!res.ok) {
          if (res.status === 404) return null;
          throw new Error(`Artwork fetch error ${res.status}`);
        }
        const json = await res.json();
        return json.success && json.data ? (json.data as ArtworkResolution) : null;
      },
      {
        ttlMs: 7 * 24 * 60 * 60 * 1000, // 7 days
        staleTtlMs: 30 * 24 * 60 * 60 * 1000, // 30 days SWR
        tags: [`anime:${anilistId}`],
        negativeTtlMs: 60 * 1000,
      }
    );
  }

  /**
   * Searches anime catalog with 5-minute search caching and in-flight deduplication.
   */
  async searchAnime(query: string, page = 1, limit = 20): Promise<AnimeSearchResult> {
    const normalized = query.trim().toLowerCase();
    const key = `anime:search:${normalized}:${page}:${limit}`;
    return cacheManager.getOrFetch<AnimeSearchResult>(
      key,
      async () => {
        const res = await fetch(
          `${this.baseUrl}/anime/search?q=${encodeURIComponent(query)}&page=${page}&limit=${limit}`,
          { headers: this.getHeaders() }
        );
        if (!res.ok) {
          throw new Error(`Search error ${res.status}`);
        }
        const json = await res.json();
        return json.data;
      },
      {
        ttlMs: 5 * 60 * 1000, // 5 minutes
        tags: ['search'],
      }
    );
  }

  /**
   * Fetches genuine transparent TMDB title logo with multi-layer caching and negative caching.
   */
  async getLogo(anilistId: number | string): Promise<AnimeLogoResult | null> {
    const key = `anime:logo:v10:${anilistId}`;
    // Purge obsolete legacy cache keys
    void cacheManager.delete(`anime:logo:${anilistId}`);
    void cacheManager.delete(`anime:logo:v2:${anilistId}`);
    void cacheManager.delete(`anime:logo:v3:${anilistId}`);

    return cacheManager.getOrFetch<AnimeLogoResult | null>(
      key,
      async () => {
        const res = await fetch(`${this.baseUrl}/anime/${anilistId}/logo`, {
          headers: this.getHeaders(),
        });
        if (!res.ok) return null;
        const json = await res.json();
        return json.success && json.data ? (json.data as AnimeLogoResult) : null;
      },
      {
        ttlMs: 24 * 60 * 60 * 1000, // 24 hours
        staleTtlMs: 7 * 24 * 60 * 60 * 1000, // 7 days SWR
        tags: [`anime:${anilistId}`],
        negativeTtlMs: 60 * 1000, // 60s cooldown for missing logos
      }
    );
  }

  /**
   * Fetches batch genuine transparent TMDB title logos for a list of AniList IDs,
   * reusing already-cached logos and requesting only missing items from the backend.
   */
  async getBatchLogos(anilistIds: (number | string)[]): Promise<Record<string, AnimeLogoResult | null>> {
    if (!anilistIds || anilistIds.length === 0) return {};

    const results: Record<string, AnimeLogoResult | null> = {};
    const missingIds: string[] = [];

    // 1. Check local multi-tier cache for each ID
    await Promise.all(
      anilistIds.map(async (id) => {
        void cacheManager.delete(`anime:logo:${id}`);
        void cacheManager.delete(`anime:logo:v2:${id}`);
        void cacheManager.delete(`anime:logo:v3:${id}`);
        const key = `anime:logo:v10:${id}`;
        const cached = await cacheManager.get<AnimeLogoResult | null>(key);
        if (cached !== null && cached !== undefined) {
          results[String(id)] = cached;
        } else {
          missingIds.push(String(id));
        }
      })
    );

    // If all requested logos were warm in cache, return immediately with zero network requests!
    if (missingIds.length === 0) {
      return results;
    }

    try {
      const idsParam = missingIds.join(',');
      const res = await fetch(`${this.baseUrl}/anime/logos?ids=${encodeURIComponent(idsParam)}`, {
        headers: this.getHeaders(),
      });
      if (!res.ok) return results;
      const json = await res.json();
      const fresh = json.success ? (json.data as Record<string, AnimeLogoResult | null>) : {};

      for (const [id, logo] of Object.entries(fresh)) {
        results[id] = logo;
        const ttl = logo ? 24 * 60 * 60 * 1000 : 60 * 1000;
        void cacheManager.set(`anime:logo:v10:${id}`, logo, {
          ttlMs: ttl,
          tags: [`anime:${id}`],
          negativeTtlMs: 60 * 1000,
        });
      }
      return results;
    } catch {
      return results;
    }
  }

  /**
   * Fetches verified external IDs (AniList, MAL, TMDB, IMDb, OMDb) with 24-hour caching.
   */
  async getExternalIds(anilistId: number | string): Promise<AnimeExternalIds | null> {
    const key = `anime:ext_ids:${anilistId}`;
    return cacheManager.getOrFetch<AnimeExternalIds | null>(
      key,
      async () => {
        const res = await fetch(`${this.baseUrl}/anime/${anilistId}/external-ids`, {
          headers: this.getHeaders(),
        });
        if (!res.ok) return null;
        const json = await res.json();
        return json.success ? (json.data as AnimeExternalIds) : null;
      },
      {
        ttlMs: 24 * 60 * 60 * 1000, // 24 hours
        staleTtlMs: 7 * 24 * 60 * 60 * 1000,
        tags: [`anime:${anilistId}`],
      }
    );
  }

  /**
   * Fetches trending anime with 30-minute caching and SWR background revalidation.
   */
  async getTrending(page = 1, limit = 10): Promise<ResolvedAnime[]> {
    const key = `anime:trending:${page}:${limit}`;
    return cacheManager.getOrFetch<ResolvedAnime[]>(
      key,
      async () => {
        const res = await fetch(`${this.baseUrl}/anime/trending?page=${page}&limit=${limit}`, {
          headers: this.getHeaders(),
        });
        if (!res.ok) throw new Error(`Trending error ${res.status}`);
        const json = await res.json();
        return json.data || [];
      },
      {
        ttlMs: 30 * 60 * 1000, // 30 minutes
        staleTtlMs: 60 * 60 * 1000, // 1 hour SWR
        tags: ['trending'],
      }
    );
  }

  /**
   * Fetches verified episode catalogue for an anime by AniList ID with versioned caching.
   */
  async getEpisodes(anilistId: number | string): Promise<AnimeEpisodeCatalogue | null> {
    const key = `anime:episodes:v10:${anilistId}`;
    // Purge obsolete legacy cache keys if present in L1/L2
    void cacheManager.delete(`anime:episodes:${anilistId}`);
    void cacheManager.delete(`anime:episodes:v8:${anilistId}`);
    void cacheManager.delete(`anime:episodes:v9:${anilistId}`);

    return cacheManager.getOrFetch<AnimeEpisodeCatalogue | null>(
      key,
      async () => {
        const res = await fetch(`${this.baseUrl}/anime/${anilistId}/episodes`, {
          headers: this.getHeaders(),
        });
        if (!res.ok) return null;
        const json = await res.json();
        return json.success && json.data ? (json.data as AnimeEpisodeCatalogue) : null;
      },
      {
        ttlMs: 5 * 60 * 1000, // 5 minutes fresh TTL
        staleTtlMs: 15 * 60 * 1000, // 15 minutes SWR
        tags: [`anime:${anilistId}`],
        negativeTtlMs: 30 * 1000,
      }
    );
  }

  /**
   * Fetches real recently aired episodes with 15-minute caching and SWR background revalidation.
   */
  async getRecentAiring(page = 1, limit = 12): Promise<RecentAiredEpisodeItem[]> {
    const key = `anime:recent_airing:${page}:${limit}`;
    return cacheManager.getOrFetch<RecentAiredEpisodeItem[]>(
      key,
      async () => {
        const res = await fetch(`${this.baseUrl}/anime/recent-airing?page=${page}&limit=${limit}`, {
          headers: this.getHeaders(),
        });
        if (!res.ok) return [];
        const json = await res.json();
        return json.success && Array.isArray(json.data) ? json.data : [];
      },
      {
        ttlMs: 15 * 60 * 1000, // 15 minutes
        staleTtlMs: 30 * 60 * 1000, // 30 minutes SWR
        tags: ['recent-airing'],
      }
    );
  }

  /**
   * Fetches weekly airing schedule between start and end UTC timestamps.
   */
  async getWeeklySchedule(
    start: number,
    end: number,
    page = 1,
    limit = 50
  ): Promise<WeeklyScheduleResponse> {
    const key = `anime:weekly-schedule:${start}:${end}:${page}:${limit}`;
    return cacheManager.getOrFetch<WeeklyScheduleResponse>(
      key,
      async () => {
        const res = await fetch(
          `${this.baseUrl}/anime/schedule?start=${start}&end=${end}&page=${page}&limit=${limit}`,
          { headers: this.getHeaders() }
        );
        if (!res.ok) {
          throw new Error(`Schedule fetch failed with status: ${res.status}`);
        }
        const json = await res.json();
        if (json.success && json.data) {
          return json.data as WeeklyScheduleResponse;
        }
        throw new Error(json.error || 'Failed to fetch schedule from backend');
      },
      {
        ttlMs: 10 * 60 * 1000, // 10 minutes
        staleTtlMs: 20 * 60 * 1000, // 20 minutes SWR
        tags: ['schedule'],
      }
    );
  }

  /**
   * Invalidate all cached data for a specific anime by AniList ID (detail, artwork, logo, episodes).
   */
  async invalidateAnime(anilistId: number | string): Promise<number> {
    return cacheManager.invalidateByTag(`anime:${anilistId}`);
  }

  /**
   * Invalidate search caches.
   */
  async invalidateSearch(): Promise<number> {
    return cacheManager.invalidateByPrefix('anime:search:');
  }

  /**
   * Clears all cached application data.
   */
  async clearAllCache(): Promise<void> {
    return cacheManager.clear();
  }
}

export const apiClient = new ApiClient();
