import { AniListProvider, AniListMedia } from '../providers/anilist.provider.js';
import { TmdbProvider } from '../providers/tmdb.provider.js';
import { AnimeMatcherService, AnimeMatchResult, CANONICAL_OVERRIDES } from './anime-matcher.service.js';
import { redisCache } from '../../cache/redis-cache.service.js';

export interface ResolvedExternalIds {
  anilistId: number;
  malId?: number;
  tmdbId?: number;
  imdbId?: string;
  omdbId?: string;
  mediaType?: 'tv' | 'movie';
  confidence: number;
  matchMethod: string;
  source: string;
}

const inFlightExternalIdRequests = new Map<number, Promise<ResolvedExternalIds | null>>();
const EXT_IDS_CACHE_TTL = 86400 * 30; // 30 days
const EXT_IDS_NEGATIVE_TTL = 86400 * 7; // 7 days

export class ExternalIdResolverService {
  /**
   * Resolves all external IDs for an anime by its canonical AniList ID.
   */
  public static async resolve(anilistId: number): Promise<ResolvedExternalIds | null> {
    if (!Number.isInteger(anilistId) || anilistId <= 0) {
      return null;
    }

    const cacheKey = `anime:ext_ids:${anilistId}`;

    // 1. Check Redis Cache
    try {
      const cached = await redisCache.get<ResolvedExternalIds>(cacheKey);
      if (cached && typeof cached === 'object') {
        return cached;
      }
    } catch {
      // Continue to live resolution
    }

    // 2. In-flight request deduplication
    const existing = inFlightExternalIdRequests.get(anilistId);
    if (existing) {
      return existing;
    }

    const resolutionPromise = (async (): Promise<ResolvedExternalIds | null> => {
      try {
        // Fetch AniList metadata
        const media = await AniListProvider.getAnimeById(anilistId);
        if (!media) {
          return null;
        }

        return await this.resolveFromMedia(media);
      } catch (err) {
        console.warn(`[ExternalIdResolver] Resolution failed for ${anilistId}:`, (err as Error).message);
        return null;
      } finally {
        inFlightExternalIdRequests.delete(anilistId);
      }
    })();

    inFlightExternalIdRequests.set(anilistId, resolutionPromise);
    return resolutionPromise;
  }

  /**
   * Resolves external IDs from an existing AniListMedia object.
   */
  public static async resolveFromMedia(media: AniListMedia): Promise<ResolvedExternalIds> {
    const anilistId = media.id;
    const malId = media.idMal || undefined;
    const cacheKey = `anime:ext_ids:${anilistId}`;

    let tmdbId: number | undefined = undefined;
    let imdbId: string | undefined = undefined;
    let omdbId: string | undefined = undefined;
    let mediaType: 'tv' | 'movie' | undefined = undefined;
    let confidence = 0;
    let matchMethod = 'unmatched';
    let source = 'anilist_only';

    // 1. Check if canonical override exists
    if (CANONICAL_OVERRIDES[anilistId]) {
      const override = CANONICAL_OVERRIDES[anilistId];
      tmdbId = override.tmdbId;
      mediaType = override.mediaType;
      confidence = 1.0;
      matchMethod = 'canonical_override';
      source = 'verified_seed';
    } else {
      // 2. Perform live matching
      const match: AnimeMatchResult | null = await AnimeMatcherService.match(media);
      if (match) {
        tmdbId = match.tmdbId;
        mediaType = match.mediaType;
        confidence = match.confidence;
        matchMethod = match.matchMethod;
        source = 'tmdb_api';
      }
    }

    // 3. Resolve IMDb and OMDb IDs via TMDB external IDs
    if (tmdbId && mediaType) {
      try {
        const extIds = mediaType === 'movie'
          ? await TmdbProvider.getMovieExternalIds(tmdbId)
          : await TmdbProvider.getTvExternalIds(tmdbId);

        if (extIds?.imdb_id) {
          const rawImdb = extIds.imdb_id.trim();
          // Strictly validate IMDb ID format (tt followed by 7-8 digits)
          if (/^tt\d{7,8}$/.test(rawImdb)) {
            imdbId = rawImdb;
            // The OMDb ID is canonically the verified IMDb ID
            omdbId = rawImdb;
          }
        }
      } catch (err) {
        console.warn(`[ExternalIdResolver] IMDb lookup failed for TMDB ${tmdbId}:`, (err as Error).message);
      }
    }

    const result: ResolvedExternalIds = {
      anilistId,
      malId,
      tmdbId,
      imdbId,
      omdbId,
      mediaType,
      confidence,
      matchMethod,
      source,
    };

    // Store in Redis cache
    void redisCache.set(cacheKey, result, tmdbId ? EXT_IDS_CACHE_TTL : EXT_IDS_NEGATIVE_TTL);

    return result;
  }
}
