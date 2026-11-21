import type {
  ResolvedAnime,
  ArtworkResolution,
  AnimeSearchResult,
  AnimeLogoResult,
  AnimeExternalIds,
  AnimeEpisodeCatalogue,
  RecentAiredEpisodeItem,
} from '@7anime/shared';

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
  private animeCache = new Map<string, { data: ResolvedAnime; timestamp: number }>();
  private artworkCache = new Map<string, { data: ArtworkResolution; timestamp: number }>();
  private logoCache = new Map<string, { data: AnimeLogoResult | null; expiresAt: number }>();
  private inFlightRequests = new Map<string, Promise<any>>();
  private refreshPromise: Promise<boolean> | null = null;
  private readonly CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
  private readonly LOGO_NEGATIVE_CACHE_TTL_MS = 60 * 1000; // 60 seconds (short negative TTL)

  private readonly SESSION_STORAGE_KEY = '7anime_auth_session';

  constructor() {
    const isDev = Boolean(import.meta.env.DEV);

    if (isDev) {
      // Local development MUST communicate ONLY with the local backend by default.
      // An explicit development override can be provided via VITE_DEV_API_BASE_URL.
      // Standard production environment variables (VITE_API_BASE_URL / VITE_API_URL) NEVER route dev traffic to Render.
      const devOverride = (import.meta.env.VITE_DEV_API_BASE_URL as string | undefined)?.trim();
      const raw = devOverride || 'http://localhost:3001/api';
      const clean = raw.replace(/\/+$/, '');
      this.baseUrl = clean.endsWith('/api') ? clean : `${clean}/api`;
    } else {
      // Production mode: communicate with Render backend via Vercel env variable, or fallback to /api
      const prodUrl = (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || '').trim();
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
   * Fetches resolved anime details by AniList ID with deduplication and caching.
   */
  async getAnimeById(anilistId: number | string): Promise<ResolvedAnime | null> {
    const key = `anime:${anilistId}`;

    const cached = this.animeCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.data;
    }

    if (this.inFlightRequests.has(key)) {
      return this.inFlightRequests.get(key)!;
    }

    const requestPromise = (async () => {
      try {
        const res = await fetch(`${this.baseUrl}/anime/${anilistId}`, {
          headers: this.getHeaders(),
        });

        if (!res.ok) {
          if (res.status === 404) return null;
          throw new Error(`API error ${res.status}: ${res.statusText}`);
        }

        const json = await res.json();
        if (json.success && json.data) {
          this.animeCache.set(key, { data: json.data, timestamp: Date.now() });
          return json.data as ResolvedAnime;
        }

        return null;
      } finally {
        this.inFlightRequests.delete(key);
      }
    })();

    this.inFlightRequests.set(key, requestPromise);
    return requestPromise;
  }

  /**
   * Fetches specific artwork breakdown for an anime.
   */
  async getAnimeArtwork(anilistId: number | string): Promise<ArtworkResolution | null> {
    const key = `artwork:${anilistId}`;

    const cached = this.artworkCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.data;
    }

    if (this.inFlightRequests.has(key)) {
      return this.inFlightRequests.get(key)!;
    }

    const requestPromise = (async () => {
      try {
        const res = await fetch(`${this.baseUrl}/anime/${anilistId}/artwork`, {
          headers: this.getHeaders(),
        });

        if (!res.ok) {
          if (res.status === 404) return null;
          throw new Error(`Artwork fetch error ${res.status}`);
        }

        const json = await res.json();
        if (json.success && json.data) {
          this.artworkCache.set(key, { data: json.data, timestamp: Date.now() });
          return json.data as ArtworkResolution;
        }

        return null;
      } finally {
        this.inFlightRequests.delete(key);
      }
    })();

    this.inFlightRequests.set(key, requestPromise);
    return requestPromise;
  }

  /**
   * Searches anime catalog by query string.
   */
  async searchAnime(query: string, page = 1, limit = 20): Promise<AnimeSearchResult> {
    const res = await fetch(
      `${this.baseUrl}/anime/search?q=${encodeURIComponent(query)}&page=${page}&limit=${limit}`,
      { headers: this.getHeaders() }
    );

    if (!res.ok) {
      throw new Error(`Search error ${res.status}`);
    }

    const json = await res.json();
    return json.data;
  }

  /**
   * Fetches genuine transparent TMDB title logo for an anime with client-side caching and in-flight deduplication.
   */
  async getLogo(anilistId: number | string): Promise<AnimeLogoResult | null> {
    const key = String(anilistId);

    // 1. Check in-memory logo cache with explicit expiration
    const cached = this.logoCache.get(key);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }

    // 2. In-flight request deduplication
    const inFlightKey = `logo:${key}`;
    const existing = this.inFlightRequests.get(inFlightKey);
    if (existing) {
      return existing;
    }

    const requestPromise = (async (): Promise<AnimeLogoResult | null> => {
      try {
        const res = await fetch(`${this.baseUrl}/anime/${anilistId}/logo`, {
          headers: this.getHeaders(),
        });

        if (!res.ok) {
          // HTTP 404: cache null for 60 seconds
          if (res.status === 404) {
            this.logoCache.set(key, {
              data: null,
              expiresAt: Date.now() + this.LOGO_NEGATIVE_CACHE_TTL_MS,
            });
          }
          // HTTP 5xx and other transient server errors: return null without caching
          return null;
        }

        const json = await res.json();
        const logo = json.success && json.data ? (json.data as AnimeLogoResult) : null;

        if (logo) {
          // Successful response containing a logo: cache for 30 minutes
          this.logoCache.set(key, {
            data: logo,
            expiresAt: Date.now() + this.CACHE_TTL_MS,
          });
        } else {
          // Successful response containing no logo: cache null for 60 seconds
          this.logoCache.set(key, {
            data: null,
            expiresAt: Date.now() + this.LOGO_NEGATIVE_CACHE_TTL_MS,
          });
        }

        return logo;
      } catch {
        // Network errors: return null without caching
        return null;
      } finally {
        this.inFlightRequests.delete(inFlightKey);
      }
    })();

    this.inFlightRequests.set(inFlightKey, requestPromise);
    return requestPromise;
  }

  /**
   * Fetches batch genuine transparent TMDB title logos for a list of AniList IDs.
   */
  async getBatchLogos(anilistIds: (number | string)[]): Promise<Record<string, AnimeLogoResult | null>> {
    if (!anilistIds || anilistIds.length === 0) return {};
    try {
      const idsParam = anilistIds.map(String).join(',');
      const res = await fetch(`${this.baseUrl}/anime/logos?ids=${encodeURIComponent(idsParam)}`, {
        headers: this.getHeaders(),
      });
      if (!res.ok) return {};
      const json = await res.json();
      const results = json.success ? (json.data as Record<string, AnimeLogoResult | null>) : {};
      const now = Date.now();
      for (const [id, logo] of Object.entries(results)) {
        // Successful logo cached for 30m; null result cached for short 60s negative TTL
        const ttl = logo ? this.CACHE_TTL_MS : this.LOGO_NEGATIVE_CACHE_TTL_MS;
        this.logoCache.set(id, { data: logo, expiresAt: now + ttl });
      }
      return results;
    } catch {
      return {};
    }
  }

  /**
   * Fetches verified external IDs (AniList, MAL, TMDB, IMDb, OMDb).
   */
  async getExternalIds(anilistId: number | string): Promise<AnimeExternalIds | null> {
    try {
      const res = await fetch(`${this.baseUrl}/anime/${anilistId}/external-ids`, {
        headers: this.getHeaders(),
      });
      if (!res.ok) return null;
      const json = await res.json();
      return json.success ? (json.data as AnimeExternalIds) : null;
    } catch {
      return null;
    }
  }

  /**
   * Fetches trending anime.
   */
  async getTrending(page = 1, limit = 10): Promise<ResolvedAnime[]> {
    const res = await fetch(`${this.baseUrl}/anime/trending?page=${page}&limit=${limit}`, {
      headers: this.getHeaders(),
    });

    if (!res.ok) {
      throw new Error(`Trending error ${res.status}`);
    }

    const json = await res.json();
    return json.data || [];
  }

  /**
   * Fetches verified episode catalogue for an anime by AniList ID.
   */
  async getEpisodes(anilistId: number | string): Promise<AnimeEpisodeCatalogue | null> {
    try {
      const res = await fetch(`${this.baseUrl}/anime/${anilistId}/episodes`, {
        headers: this.getHeaders(),
      });
      if (!res.ok) return null;
      const json = await res.json();
      return json.success ? (json.data as AnimeEpisodeCatalogue) : null;
    } catch {
      return null;
    }
  }

  /**
   * Fetches real recently aired episodes directly from the backend.
   */
  async getRecentAiring(page = 1, limit = 12): Promise<RecentAiredEpisodeItem[]> {
    try {
      const res = await fetch(`${this.baseUrl}/anime/recent-airing?page=${page}&limit=${limit}`, {
        headers: this.getHeaders(),
      });
      if (!res.ok) return [];
      const json = await res.json();
      return json.success && Array.isArray(json.data) ? json.data : [];
    } catch {
      return [];
    }
  }
}

export const apiClient = new ApiClient();
