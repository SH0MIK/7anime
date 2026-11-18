import { HttpClient } from '../../../utils/httpClient.js';
import { config } from '../../../config/env.js';
import { malBreaker } from '../resolver/circuit-breaker.service.js';
import { redisCache, SEVEN_DAYS_SECONDS } from '../../cache/redis-cache.service.js';

export interface MalPicture {
  medium?: string;
  large?: string;
}

export interface MalGenre {
  id: number;
  name: string;
}

export interface MalStudio {
  id: number;
  name: string;
}

export interface MalAlternativeTitles {
  synonyms?: string[];
  en?: string;
  ja?: string;
}

export interface MalAnimeDetails {
  id: number;
  title: string;
  alternativeTitles?: MalAlternativeTitles;
  mainPicture?: MalPicture;
  synopsis?: string;
  mean?: number; // Score e.g. 8.71
  rank?: number;
  popularity?: number;
  numEpisodes?: number;
  status?: string; // 'finished_airing' | 'currently_airing' | 'not_yet_aired'
  genres?: MalGenre[];
  studios?: MalStudio[];
  mediaType?: string; // 'tv' | 'movie' | 'ova' | 'special' | 'ona' | 'music'
  broadcast?: {
    dayOfTheWeek?: string;
    startTime?: string;
  };
  source?: string;
  averageEpisodeDuration?: number; // seconds
  rating?: string; // 'pg_13' | 'r'
  retrievedAt: number;
  provider: 'mal_api';
}

const MAL_API_BASE = 'https://api.myanimelist.net/v2';

const MAL_FIELDS = [
  'id',
  'title',
  'main_picture',
  'alternative_titles',
  'start_date',
  'end_date',
  'synopsis',
  'mean',
  'rank',
  'popularity',
  'num_episodes',
  'status',
  'genres',
  'media_type',
  'broadcast',
  'source',
  'average_episode_duration',
  'rating',
  'studios',
].join(',');

export class MalProvider {
  /**
   * Fetches anime details by MAL ID from the official MyAnimeList API v2.
   * Uses only the configured MAL Client ID. No third-party scraper fallback.
   */
  public static async getAnimeById(malId: number): Promise<MalAnimeDetails | null> {
    if (!Number.isInteger(malId) || malId <= 0) {
      return null;
    }

    const cacheKey = `mal:anime:${malId}`;
    const cached = await redisCache.get<MalAnimeDetails>(cacheKey);
    if (cached) {
      return cached;
    }

    if (!config.malClientId) {
      console.warn('[MalProvider] Official MAL API client ID not configured. MAL requests unavailable.');
      return null;
    }

    return malBreaker.execute(
      async () => {
        const url = `${MAL_API_BASE}/anime/${malId}?fields=${MAL_FIELDS}`;
        const res = await HttpClient.get<any>(url, {
          headers: {
            'X-MAL-CLIENT-ID': config.malClientId!,
          },
          timeoutMs: 8000,
        });

        if (res && res.id) {
          const details = this.normalizeMalResponse(res);
          await redisCache.set(cacheKey, details, SEVEN_DAYS_SECONDS);
          return details;
        }

        return null;
      },
      async (breakerError) => {
        console.warn(`[MalProvider] Circuit breaker triggered: ${breakerError?.message}`);
        return null;
      }
    );
  }

  /**
   * Searches anime on official MyAnimeList API v2.
   */
  public static async searchAnime(query: string, limit: number = 10): Promise<MalAnimeDetails[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const cacheKey = `mal:search:${trimmed.toLowerCase()}:${limit}`;
    const cached = await redisCache.get<MalAnimeDetails[]>(cacheKey);
    if (cached) return cached;

    if (!config.malClientId) {
      console.warn('[MalProvider] Official MAL API client ID not configured. MAL search unavailable.');
      return [];
    }

    return malBreaker.execute(
      async () => {
        const url = `${MAL_API_BASE}/anime?q=${encodeURIComponent(trimmed)}&limit=${limit}&fields=${MAL_FIELDS}`;
        const res = await HttpClient.get<any>(url, {
          headers: { 'X-MAL-CLIENT-ID': config.malClientId! },
          timeoutMs: 8000,
        });

        if (Array.isArray(res?.data)) {
          const items = res.data.map((entry: any) => this.normalizeMalResponse(entry.node));
          await redisCache.set(cacheKey, items, 86400 * 3); // 3 days
          return items;
        }

        return [];
      },
      async () => []
    );
  }

  private static normalizeMalResponse(raw: any): MalAnimeDetails {
    return {
      id: raw.id,
      title: raw.title,
      alternativeTitles: {
        en: raw.alternative_titles?.en,
        ja: raw.alternative_titles?.ja,
        synonyms: raw.alternative_titles?.synonyms || [],
      },
      mainPicture: {
        medium: raw.main_picture?.medium,
        large: raw.main_picture?.large,
      },
      synopsis: raw.synopsis,
      mean: raw.mean,
      rank: raw.rank,
      popularity: raw.popularity,
      numEpisodes: raw.num_episodes || undefined,
      status: raw.status,
      genres: (raw.genres || []).map((g: any) => ({ id: g.id, name: g.name })),
      studios: (raw.studios || []).map((s: any) => ({ id: s.id, name: s.name })),
      mediaType: raw.media_type,
      broadcast: raw.broadcast ? {
        dayOfTheWeek: raw.broadcast.day_of_the_week,
        startTime: raw.broadcast.start_time,
      } : undefined,
      source: raw.source,
      averageEpisodeDuration: raw.average_episode_duration,
      rating: raw.rating,
      retrievedAt: Date.now(),
      provider: 'mal_api',
    };
  }
}
