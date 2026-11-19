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
  };
  profile: {
    id: string;
    email: string;
    username?: string;
    displayName?: string;
    avatarUrl?: string;
    bio?: string;
  };
}

class ApiClient {
  private baseUrl: string;
  private authToken: string | null = null;
  private animeCache = new Map<string, { data: ResolvedAnime; timestamp: number }>();
  private artworkCache = new Map<string, { data: ArtworkResolution; timestamp: number }>();
  private inFlightRequests = new Map<string, Promise<any>>();
  private readonly CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

  constructor() {
    const rawEnv = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || '';
    this.baseUrl = rawEnv ? rawEnv.replace(/\/+$/, '') : '/api';
  }

  /**
   * Sets or clears the active Supabase JWT session token.
   */
  public setAuthToken(token: string | null) {
    this.authToken = token;
  }

  /**
   * Returns current auth token.
   */
  public getAuthToken(): string | null {
    return this.authToken;
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
   */
  async getHealth(): Promise<BackendHealthResponse> {
    const res = await fetch(`${this.baseUrl}/health`, {
      headers: this.getHeaders(),
    });

    if (!res.ok) {
      throw new Error(`API health check failed with status: ${res.status}`);
    }

    return res.json();
  }

  /**
   * Fetches client auth config from backend.
   */
  async getClientAuthConfig(): Promise<ClientAuthConfig | null> {
    try {
      const res = await fetch(`${this.baseUrl}/auth/config`, {
        headers: this.getHeaders(),
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
  async updateProfile(profileData: { username?: string; displayName?: string; avatarUrl?: string; bio?: string }) {
    const res = await fetch(`${this.baseUrl}/auth/profile`, {
      method: 'POST',
      headers: this.getHeaders({ 'Content-Type': 'application/json' }),
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
   * Fetches genuine transparent TMDB title logo for an anime.
   */
  async getLogo(anilistId: number | string): Promise<AnimeLogoResult | null> {
    try {
      const res = await fetch(`${this.baseUrl}/anime/${anilistId}/logo`, {
        headers: this.getHeaders(),
      });
      if (!res.ok) return null;
      const json = await res.json();
      return json.success ? (json.data as AnimeLogoResult) : null;
    } catch {
      return null;
    }
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
      return json.success ? (json.data as Record<string, AnimeLogoResult | null>) : {};
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
