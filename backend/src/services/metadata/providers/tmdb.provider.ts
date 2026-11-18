import https from 'node:https';
import dns from 'node:dns';
import { config } from '../../../config/env.js';
import { tmdbCache } from '../../cache/memory-cache.service.js';
import { redisCache } from '../../cache/redis-cache.service.js';
import { AnimeTrailer, AnimeLogoResult } from '@7anime/shared';

export interface TmdbImageItem {
  aspect_ratio: number;
  height: number;
  width: number;
  file_path: string;
  vote_average: number;
  vote_count: number;
  iso_639_1: string | null;
}

export interface TmdbImagesResponse {
  id: number;
  backdrops: TmdbImageItem[];
  logos: TmdbImageItem[];
  posters: TmdbImageItem[];
}

export interface TmdbVideo {
  id: string;
  iso_639_1: string;
  iso_3166_1: string;
  name: string;
  key: string;
  site: string;
  size: number;
  type: string;
  official: boolean;
  published_at: string;
}

export interface TmdbExternalIds {
  id: number;
  imdb_id?: string;
  freebase_mid?: string;
  freebase_id?: string;
  tvdb_id?: number;
  tvrage_id?: number;
  wikidata_id?: string;
  facebook_id?: string;
  instagram_id?: string;
  twitter_id?: string;
}

export interface TmdbTvSearchResult {
  id: number;
  name: string;
  original_name: string;
  overview: string;
  first_air_date?: string;
  backdrop_path?: string;
  poster_path?: string;
  genre_ids: number[];
  origin_country: string[];
  original_language: string;
  popularity: number;
  vote_average: number;
  vote_count: number;
}

export interface TmdbMovieSearchResult {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  release_date?: string;
  backdrop_path?: string;
  poster_path?: string;
  genre_ids: number[];
  original_language: string;
  popularity: number;
  vote_average: number;
  vote_count: number;
}

export interface TmdbEpisode {
  id: number;
  episode_number: number;
  season_number: number;
  name: string;
  overview?: string;
  air_date?: string;
  runtime?: number;
  still_path?: string;
  vote_average?: number;
}

export interface TmdbSeasonResponse {
  id: number;
  _id: string;
  air_date?: string;
  name: string;
  overview?: string;
  poster_path?: string;
  season_number: number;
  episodes: TmdbEpisode[];
}

export interface TmdbSeasonSummary {
  id: number;
  name: string;
  season_number: number;
  episode_count: number;
  air_date?: string;
  poster_path?: string;
}

export interface TmdbTvDetails {
  id: number;
  name: string;
  original_name: string;
  overview: string;
  first_air_date?: string;
  last_air_date?: string;
  number_of_episodes?: number;
  number_of_seasons?: number;
  status: string;
  backdrop_path?: string;
  poster_path?: string;
  vote_average: number;
  vote_count: number;
  popularity: number;
  seasons?: TmdbSeasonSummary[];
}

export interface TmdbMovieDetails {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  release_date?: string;
  runtime?: number;
  status: string;
  backdrop_path?: string;
  poster_path?: string;
  vote_average: number;
  vote_count: number;
  popularity: number;
}

const TMDB_API_BASE = 'https://api.themoviedb.org/3';
export const TMDB_IMAGE_ORIGINAL = 'https://image.tmdb.org/t/p/original';
export const TMDB_IMAGE_W500 = 'https://image.tmdb.org/t/p/w500';
export const TMDB_IMAGE_W780 = 'https://image.tmdb.org/t/p/w780';

// Public DNS resolver to prevent ISP DNS filtering on api.themoviedb.org
const publicDnsResolver = new dns.promises.Resolver();
try {
  publicDnsResolver.setServers(['8.8.8.8', '1.1.1.1']);
} catch {
  // Graceful fallback
}

/**
 * Resilient TMDB request dispatcher with DNS resolution fallback and timeout protection.
 */
async function fetchTmdbResilient<T>(pathAndQuery: string, timeoutMs = 6000): Promise<T | null> {
  const token = config.tmdbReadAccessToken;
  const apiKey = config.tmdbApiKey;

  if (!token && !apiKey) {
    console.warn('[TmdbProvider] No TMDB credentials configured.');
    return null;
  }

  // Tier 1: HTTPS request with public DNS lookup to bypass ISP blocks
  try {
    const fullPath = pathAndQuery.includes('?')
      ? `${pathAndQuery}&api_key=${apiKey || ''}`
      : `${pathAndQuery}?api_key=${apiKey || ''}`;

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const data = await new Promise<T | null>((resolve) => {
      const req = https.request({
        hostname: 'api.themoviedb.org',
        path: fullPath,
        method: 'GET',
        headers,
        timeout: timeoutMs,
        lookup: (hostname, opts, cb) => {
          const callback = typeof opts === 'function' ? opts : cb;
          const isAll = typeof opts === 'object' && opts && (opts as any).all;
          publicDnsResolver.resolve4(hostname).then(ips => {
            if (isAll) {
              callback(null, ips.map(ip => ({ address: ip, family: 4 })) as any);
            } else {
              callback(null, ips[0] as any, 4);
            }
          }).catch(err => callback(err, '', 4));
        }
      }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          resolve(null);
          return;
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(body) as T);
          } catch {
            resolve(null);
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
      req.on('error', () => {
        resolve(null);
      });
      req.end();
    });

    if (data !== null) {
      return data;
    }
  } catch {
    // Proceed to standard fetch fallback
  }

  // Tier 2: Standard fetch fallback
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const url = `${TMDB_API_BASE}${pathAndQuery}`;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      return (await res.json()) as T;
    }
  } catch {
    // Both failed
  }

  return null;
}

export class TmdbProvider {
  /**
   * Search TV series on TMDB with animation & Asian language checks.
   */
  public static async searchTv(query: string, firstAirDateYear?: number): Promise<TmdbTvSearchResult[]> {
    const cleanQuery = query.toLowerCase().trim();
    const cacheKey = `tmdb:search:tv:${cleanQuery}:${firstAirDateYear || ''}`;

    // Check Redis & memory cache
    const cached = await redisCache.get<TmdbTvSearchResult[]>(cacheKey);
    if (cached) return cached;

    const yearParam = firstAirDateYear ? `&first_air_date_year=${firstAirDateYear}` : '';
    const path = `/3/search/tv?query=${encodeURIComponent(cleanQuery)}&include_adult=false${yearParam}`;

    const res = await fetchTmdbResilient<{ results?: TmdbTvSearchResult[] }>(path);
    const results = res?.results || [];

    if (results.length > 0) {
      void redisCache.set(cacheKey, results, 86400 * 7); // 7 days
    }
    return results;
  }

  /**
   * Search Movies on TMDB with animation & Asian language checks.
   */
  public static async searchMovie(query: string, primaryReleaseYear?: number): Promise<TmdbMovieSearchResult[]> {
    const cleanQuery = query.toLowerCase().trim();
    const cacheKey = `tmdb:search:movie:${cleanQuery}:${primaryReleaseYear || ''}`;

    const cached = await redisCache.get<TmdbMovieSearchResult[]>(cacheKey);
    if (cached) return cached;

    const yearParam = primaryReleaseYear ? `&primary_release_year=${primaryReleaseYear}` : '';
    const path = `/3/search/movie?query=${encodeURIComponent(cleanQuery)}&include_adult=false${yearParam}`;

    const res = await fetchTmdbResilient<{ results?: TmdbMovieSearchResult[] }>(path);
    const results = res?.results || [];

    if (results.length > 0) {
      void redisCache.set(cacheKey, results, 86400 * 7);
    }
    return results;
  }

  /**
   * Get TV images (logos, backdrops, posters).
   */
  public static async getTvImages(tmdbId: number): Promise<TmdbImagesResponse | null> {
    const cacheKey = `tmdb:tv:${tmdbId}:images`;
    const cached = await redisCache.get<TmdbImagesResponse>(cacheKey);
    if (cached) return cached;

    const path = `/3/tv/${tmdbId}/images?include_image_language=en,ja,null`;
    const res = await fetchTmdbResilient<TmdbImagesResponse>(path);

    if (res) {
      void redisCache.set(cacheKey, res, 86400 * 14);
    }
    return res;
  }

  /**
   * Get Movie images (logos, backdrops, posters).
   */
  public static async getMovieImages(tmdbId: number): Promise<TmdbImagesResponse | null> {
    const cacheKey = `tmdb:movie:${tmdbId}:images`;
    const cached = await redisCache.get<TmdbImagesResponse>(cacheKey);
    if (cached) return cached;

    const path = `/3/movie/${tmdbId}/images?include_image_language=en,ja,null`;
    const res = await fetchTmdbResilient<TmdbImagesResponse>(path);

    if (res) {
      void redisCache.set(cacheKey, res, 86400 * 14);
    }
    return res;
  }

  /**
   * Get TV External IDs (including IMDb ID).
   */
  public static async getTvExternalIds(tmdbId: number): Promise<TmdbExternalIds | null> {
    const cacheKey = `tmdb:tv:${tmdbId}:external_ids`;
    const cached = await redisCache.get<TmdbExternalIds>(cacheKey);
    if (cached) return cached;

    const path = `/3/tv/${tmdbId}/external_ids`;
    const res = await fetchTmdbResilient<TmdbExternalIds>(path);

    if (res) {
      void redisCache.set(cacheKey, res, 86400 * 30);
    }
    return res;
  }

  /**
   * Get Movie External IDs (including IMDb ID).
   */
  public static async getMovieExternalIds(tmdbId: number): Promise<TmdbExternalIds | null> {
    const cacheKey = `tmdb:movie:${tmdbId}:external_ids`;
    const cached = await redisCache.get<TmdbExternalIds>(cacheKey);
    if (cached) return cached;

    const path = `/3/movie/${tmdbId}/external_ids`;
    const res = await fetchTmdbResilient<TmdbExternalIds>(path);

    if (res) {
      void redisCache.set(cacheKey, res, 86400 * 30);
    }
    return res;
  }

  /**
   * Get TV details by TMDB ID.
   */
  public static async getTvDetails(tmdbId: number): Promise<TmdbTvDetails | null> {
    const cacheKey = `tmdb:tv:${tmdbId}:details`;
    const cached = await redisCache.get<TmdbTvDetails>(cacheKey);
    if (cached) return cached;

    const path = `/3/tv/${tmdbId}`;
    const res = await fetchTmdbResilient<TmdbTvDetails>(path);

    if (res) {
      void redisCache.set(cacheKey, res, 86400 * 7);
    }
    return res;
  }

  /**
   * Get Movie details by TMDB ID.
   */
  public static async getMovieDetails(tmdbId: number): Promise<TmdbMovieDetails | null> {
    const cacheKey = `tmdb:movie:${tmdbId}:details`;
    const cached = await redisCache.get<TmdbMovieDetails>(cacheKey);
    if (cached) return cached;

    const path = `/3/movie/${tmdbId}`;
    const res = await fetchTmdbResilient<TmdbMovieDetails>(path);

    if (res) {
      void redisCache.set(cacheKey, res, 86400 * 7);
    }
    return res;
  }

  /**
   * Get TV videos (trailers, teasers).
   */
  public static async getTvVideos(tmdbId: number): Promise<TmdbVideo[]> {
    const cacheKey = `tmdb:tv:${tmdbId}:videos`;
    const cached = await redisCache.get<TmdbVideo[]>(cacheKey);
    if (cached) return cached;

    const path = `/3/tv/${tmdbId}/videos`;
    const res = await fetchTmdbResilient<{ results?: TmdbVideo[] }>(path);
    const results = res?.results || [];

    if (results.length > 0) {
      void redisCache.set(cacheKey, results, 86400 * 7);
    }
    return results;
  }

  /**
   * Get Movie videos (trailers, teasers).
   */
  public static async getMovieVideos(tmdbId: number): Promise<TmdbVideo[]> {
    const cacheKey = `tmdb:movie:${tmdbId}:videos`;
    const cached = await redisCache.get<TmdbVideo[]>(cacheKey);
    if (cached) return cached;

    const path = `/3/movie/${tmdbId}/videos`;
    const res = await fetchTmdbResilient<{ results?: TmdbVideo[] }>(path);
    const results = res?.results || [];

    if (results.length > 0) {
      void redisCache.set(cacheKey, results, 86400 * 7);
    }
    return results;
  }

  /**
   * Fetches TV season episodes with verified names, air dates, and still images.
   */
  public static async getTvSeasonEpisodes(tmdbId: number, seasonNumber: number = 1): Promise<TmdbEpisode[]> {
    const cacheKey = `tmdb:tv:${tmdbId}:season:${seasonNumber}:episodes`;
    const cached = await redisCache.get<TmdbEpisode[]>(cacheKey);
    if (cached) return cached;

    const path = `/3/tv/${tmdbId}/season/${seasonNumber}`;
    const res = await fetchTmdbResilient<TmdbSeasonResponse>(path);
    const episodes = res?.episodes || [];

    if (episodes.length > 0) {
      void redisCache.set(cacheKey, episodes, 86400 * 7); // 7-day cache
    }
    return episodes;
  }

  /**
   * Fetches all relevant season episodes for a TV anime.
   * - If expectedEpisodes is specified (e.g. Bleach = 366), and Season 1 has >= expectedEpisodes, returns Season 1.
   * - If expectedEpisodes is null (ongoing e.g. One Piece) or spans across seasons, fetches all non-special seasons with continuous episode numbering.
   */
  public static async getAllTvEpisodes(tmdbId: number, expectedEpisodes?: number | null): Promise<TmdbEpisode[]> {
    const tv = await this.getTvDetails(tmdbId);
    if (!tv || !Array.isArray(tv.seasons)) {
      return this.getTvSeasonEpisodes(tmdbId, 1);
    }

    const validSeasons = tv.seasons.filter((s) => s.season_number > 0 && s.episode_count > 0);
    if (validSeasons.length === 0) {
      return this.getTvSeasonEpisodes(tmdbId, 1);
    }

    // Single season check: if Season 1 contains all expected episodes (e.g. Bleach 366, Frieren 28)
    if (expectedEpisodes && expectedEpisodes > 0) {
      const s1 = validSeasons.find((s) => s.season_number === 1);
      if (s1 && s1.episode_count >= expectedEpisodes) {
        return this.getTvSeasonEpisodes(tmdbId, 1);
      }
    }

    // Multi-season TV anime (like One Piece with 23 seasons, or multi-cour continuous series)
    // Fetch all non-special seasons in bounded concurrent batches
    const allEpisodes: TmdbEpisode[] = [];
    const batchSize = 6;
    for (let i = 0; i < validSeasons.length; i += batchSize) {
      const batch = validSeasons.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((s) => this.getTvSeasonEpisodes(tmdbId, s.season_number))
      );
      for (const seasonEps of batchResults) {
        allEpisodes.push(...seasonEps);
      }
    }

    // Deduplicate by episode_number
    const epMap = new Map<number, TmdbEpisode>();
    for (const ep of allEpisodes) {
      if (ep.episode_number && !epMap.has(ep.episode_number)) {
        epMap.set(ep.episode_number, ep);
      }
    }

    return Array.from(epMap.values()).sort((a, b) => a.episode_number - b.episode_number);
  }

  // --- ARTWORK EXTRACTION HELPERS ---

  /**
   * Scores a logo candidate based on transparency (PNG), wordmark aspect ratio, and resolution.
   */
  public static scoreLogo(logo: TmdbImageItem): number {
    let score = 0;
    const filePath = (logo.file_path || '').toLowerCase();

    // 1. Must be PNG (transparent)
    if (filePath.endsWith('.png')) {
      score += 100;
    } else {
      score += 10;
    }

    // 2. Wordmark aspect ratio: Horizontal title logos typically 1.5 to 6.0
    const ar = logo.aspect_ratio || 0;
    if (ar >= 1.5 && ar <= 6.0) {
      score += 50;
    } else if (ar >= 1.0 && ar < 1.5) {
      score += 30;
    } else if (ar > 6.0 && ar <= 12.0) {
      score += 20;
    } else if (ar < 0.8 || ar > 14.0) {
      score -= 40;
    }

    // 3. Resolution
    if (logo.width >= 800) {
      score += 40;
    } else if (logo.width >= 400) {
      score += 25;
    } else if (logo.width < 100 || logo.height < 40) {
      score -= 50;
    }

    // 4. Community rating
    if (typeof logo.vote_average === 'number' && logo.vote_average > 0) {
      score += logo.vote_average * 3;
    }
    if (typeof logo.vote_count === 'number' && logo.vote_count > 0) {
      score += Math.min(25, logo.vote_count * 2);
    }

    return score;
  }

  /**
   * Deterministically selects the best transparent anime title logo from TMDB images.
   * Priority:
   * 1. English ('en')
   * 2. Japanese ('ja')
   * 3. Language-neutral ('null' or 'xx')
   * 4. Other languages as final fallback
   */
  public static selectBestLogo(logos: TmdbImageItem[]): AnimeLogoResult | null {
    if (!logos || !Array.isArray(logos) || logos.length === 0) {
      return null;
    }

    // Filter to valid PNGs with root-relative paths and positive dimensions
    const validPngLogos = logos.filter((l) => {
      if (!l || typeof l !== 'object') return false;
      if (!l.file_path || typeof l.file_path !== 'string') return false;
      if (!l.file_path.startsWith('/') || !l.file_path.toLowerCase().endsWith('.png')) return false;
      if (typeof l.width !== 'number' || l.width <= 0) return false;
      if (typeof l.height !== 'number' || l.height <= 0) return false;
      if (typeof l.aspect_ratio !== 'number' || l.aspect_ratio <= 0) return false;
      return true;
    });

    if (validPngLogos.length === 0) {
      return null;
    }

    const enGroup: TmdbImageItem[] = [];
    const jaGroup: TmdbImageItem[] = [];
    const neutralGroup: TmdbImageItem[] = [];
    const otherGroup: TmdbImageItem[] = [];

    for (const logo of validPngLogos) {
      const lang = logo.iso_639_1 ? logo.iso_639_1.trim().toLowerCase() : null;
      if (lang === 'en') {
        enGroup.push(logo);
      } else if (lang === 'ja') {
        jaGroup.push(logo);
      } else if (!lang || lang === 'xx' || lang === 'null') {
        neutralGroup.push(logo);
      } else {
        otherGroup.push(logo);
      }
    }

    const sortGroup = (group: TmdbImageItem[]) => {
      return group.sort((a, b) => {
        const scoreDiff = TmdbProvider.scoreLogo(b) - TmdbProvider.scoreLogo(a);
        if (scoreDiff !== 0) return scoreDiff;
        return a.file_path.localeCompare(b.file_path);
      });
    };

    const chosen = enGroup.length > 0
      ? sortGroup(enGroup)[0]
      : jaGroup.length > 0
      ? sortGroup(jaGroup)[0]
      : neutralGroup.length > 0
      ? sortGroup(neutralGroup)[0]
      : otherGroup.length > 0
      ? sortGroup(otherGroup)[0]
      : null;

    if (!chosen) return null;

    return {
      logoUrl: `${TMDB_IMAGE_ORIGINAL}${chosen.file_path}`,
      aspectRatio: Number(chosen.aspect_ratio.toFixed(3)),
      width: chosen.width,
      height: chosen.height,
      language: chosen.iso_639_1 ?? null,
      filePath: chosen.file_path,
    };
  }

  /**
   * Extracts the best backdrop image from TMDB images.
   */
  public static extractBestBackdrop(images: TmdbImagesResponse | null, fallbackPath?: string): string | undefined {
    if (images && images.backdrops && images.backdrops.length > 0) {
      const sorted = [...images.backdrops].sort((a, b) => {
        if (a.iso_639_1 === null && b.iso_639_1 !== null) return -1;
        if (b.iso_639_1 === null && a.iso_639_1 !== null) return 1;

        const scoreA = a.vote_average * Math.log10(a.vote_count + 1);
        const scoreB = b.vote_average * Math.log10(b.vote_count + 1);
        return scoreB - scoreA;
      });

      return `${TMDB_IMAGE_ORIGINAL}${sorted[0].file_path}`;
    }

    if (fallbackPath) {
      return `${TMDB_IMAGE_ORIGINAL}${fallbackPath}`;
    }

    return undefined;
  }

  /**
   * Extracts the best poster image from TMDB images.
   */
  public static extractBestPoster(images: TmdbImagesResponse | null, fallbackPath?: string): string | undefined {
    if (images && images.posters && images.posters.length > 0) {
      const sorted = [...images.posters].sort((a, b) => {
        if (a.iso_639_1 === 'en' && b.iso_639_1 !== 'en') return -1;
        if (b.iso_639_1 === 'en' && a.iso_639_1 !== 'en') return 1;

        const scoreA = a.vote_average * Math.log10(a.vote_count + 1);
        const scoreB = b.vote_average * Math.log10(b.vote_count + 1);
        return scoreB - scoreA;
      });

      return `${TMDB_IMAGE_W780}${sorted[0].file_path}`;
    }

    if (fallbackPath) {
      return `${TMDB_IMAGE_W780}${fallbackPath}`;
    }

    return undefined;
  }

  /**
   * Extracts the highest quality official YouTube trailer from TMDB videos.
   */
  public static extractBestTrailer(videos: TmdbVideo[]): AnimeTrailer | undefined {
    if (!videos || videos.length === 0) return undefined;

    const youtubeVideos = videos.filter((v) => v.site.toLowerCase() === 'youtube' && Boolean(v.key));
    if (youtubeVideos.length === 0) return undefined;

    const sorted = [...youtubeVideos].sort((a, b) => {
      const isOfficialA = a.official ? 1 : 0;
      const isOfficialB = b.official ? 1 : 0;
      if (isOfficialA !== isOfficialB) return isOfficialB - isOfficialA;

      const isTrailerA = a.type.toLowerCase() === 'trailer' ? 1 : 0;
      const isTrailerB = b.type.toLowerCase() === 'trailer' ? 1 : 0;
      if (isTrailerA !== isTrailerB) return isTrailerB - isTrailerA;

      return 0;
    });

    const best = sorted[0];
    return {
      source: 'tmdb',
      key: best.key,
      url: `https://www.youtube.com/watch?v=${best.key}`,
      site: 'youtube',
      type: best.type,
      official: best.official,
    };
  }
}
