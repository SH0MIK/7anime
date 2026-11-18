import { AnimeLogoResult } from '@7anime/shared';
import { TmdbProvider, TmdbImagesResponse, TMDB_IMAGE_ORIGINAL } from '../providers/tmdb.provider.js';
import { ExternalIdResolverService, ResolvedExternalIds } from './external-id-resolver.service.js';
import { redisCache } from '../../cache/redis-cache.service.js';

interface CachedLogoPayload {
  logo?: AnimeLogoResult | null;
  notFound?: boolean;
  cachedAt: number;
}

const inFlightLogoRequests = new Map<number, Promise<AnimeLogoResult | null>>();
const LOGO_CACHE_TTL = 86400 * 30; // 30 days
const LOGO_NEGATIVE_TTL = 86400 * 7; // 7 days

export class LogoResolverService {
  /**
   * Resolves the genuine transparent PNG title logo from TMDB for an anime.
   */
  public static async resolveLogo(
    anilistId: number,
    hintTmdbId?: number,
    hintMediaType?: 'tv' | 'movie'
  ): Promise<AnimeLogoResult | null> {
    if (!Number.isInteger(anilistId) || anilistId <= 0) {
      return null;
    }

    const cacheKey = `anime:logo:${anilistId}`;

    // 1. Check Redis Cache
    try {
      const cached = await redisCache.get<CachedLogoPayload>(cacheKey);
      if (cached) {
        if (cached.notFound) {
          return null;
        }
        if (cached.logo && cached.logo.logoUrl && cached.logo.filePath) {
          return cached.logo;
        }
      }
    } catch {
      // Continue to live resolution
    }

    // 2. In-flight request deduplication
    const existing = inFlightLogoRequests.get(anilistId);
    if (existing) {
      return existing;
    }

    const resolutionPromise = (async (): Promise<AnimeLogoResult | null> => {
      try {
        let tmdbId = hintTmdbId;
        let mediaType = hintMediaType;

        // Resolve TMDB ID and media type if not provided
        if (!tmdbId || !mediaType) {
          const extIds = await ExternalIdResolverService.resolve(anilistId);
          if (extIds && extIds.tmdbId && extIds.mediaType) {
            tmdbId = extIds.tmdbId;
            mediaType = extIds.mediaType;
          }
        }

        if (!tmdbId || !mediaType) {
          // Negative cache when no TMDB mapping is found
          void redisCache.set(
            cacheKey,
            { notFound: true, cachedAt: Date.now() },
            LOGO_NEGATIVE_TTL
          );
          return null;
        }

        // Query TMDB images endpoint
        const images: TmdbImagesResponse | null = mediaType === 'movie'
          ? await TmdbProvider.getMovieImages(tmdbId)
          : await TmdbProvider.getTvImages(tmdbId);

        if (!images || !images.logos || images.logos.length === 0) {
          void redisCache.set(
            cacheKey,
            { notFound: true, cachedAt: Date.now() },
            LOGO_NEGATIVE_TTL
          );
          return null;
        }

        // Select the highest quality transparent logo matching language priority
        const bestLogo = TmdbProvider.selectBestLogo(images.logos);

        if (!bestLogo) {
          void redisCache.set(
            cacheKey,
            { notFound: true, cachedAt: Date.now() },
            LOGO_NEGATIVE_TTL
          );
          return null;
        }

        // Cache valid result in Redis
        void redisCache.set(
          cacheKey,
          { logo: bestLogo, notFound: false, cachedAt: Date.now() },
          LOGO_CACHE_TTL
        );

        return bestLogo;
      } catch (err) {
        console.warn(`[LogoResolverService] Error resolving logo for AniList ${anilistId}:`, (err as Error).message);
        return null;
      } finally {
        inFlightLogoRequests.delete(anilistId);
      }
    })();

    inFlightLogoRequests.set(anilistId, resolutionPromise);
    return resolutionPromise;
  }

  /**
   * Concurrently resolves logos for a batch of AniList IDs (e.g. for homepage spotlight or collections).
   */
  public static async resolveBatchLogos(
    anilistIds: number[],
    concurrencyLimit = 10
  ): Promise<Record<number, AnimeLogoResult | null>> {
    const uniqueIds = Array.from(new Set(anilistIds.filter((id) => Number.isInteger(id) && id > 0)));
    const results: Record<number, AnimeLogoResult | null> = {};

    for (let i = 0; i < uniqueIds.length; i += concurrencyLimit) {
      const chunk = uniqueIds.slice(i, i + concurrencyLimit);
      const chunkPromises = chunk.map(async (id) => {
        try {
          const logo = await this.resolveLogo(id);
          return { id, logo };
        } catch {
          return { id, logo: null };
        }
      });

      const chunkResults = await Promise.all(chunkPromises);
      for (const { id, logo } of chunkResults) {
        results[id] = logo;
      }
    }

    return results;
  }
}
