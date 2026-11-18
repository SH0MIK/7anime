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
    };
  };
}

class ApiClient {
  private baseUrl: string;
  private animeCache = new Map<string, { data: ResolvedAnime; timestamp: number }>();
  private artworkCache = new Map<string, { data: ArtworkResolution; timestamp: number }>();
  private inFlightRequests = new Map<string, Promise<any>>();
  private readonly CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

  constructor() {
    this.baseUrl = import.meta.env.VITE_API_URL || '/api';
  }

  /**
   * Fetches the backend health diagnostics.
   */
  async getHealth(): Promise<BackendHealthResponse> {
    const res = await fetch(`${this.baseUrl}/health`, {
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`API health check failed with status: ${res.status}`);
    }

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
          headers: { Accept: 'application/json' },
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
          headers: { Accept: 'application/json' },
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
      { headers: { Accept: 'application/json' } }
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
        headers: { Accept: 'application/json' },
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
        headers: { Accept: 'application/json' },
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
        headers: { Accept: 'application/json' },
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
      headers: { Accept: 'application/json' },
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
        headers: { Accept: 'application/json' },
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
        headers: { Accept: 'application/json' },
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
