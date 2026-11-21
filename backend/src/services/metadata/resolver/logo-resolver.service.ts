import { AnimeLogoResult } from '@7anime/shared';
import { TmdbProvider, TmdbImagesResponse, TmdbImageItem, TMDB_IMAGE_ORIGINAL } from '../providers/tmdb.provider.js';
import { ExternalIdResolverService, ResolvedExternalIds } from './external-id-resolver.service.js';
import { CANONICAL_OVERRIDES } from './anime-matcher.service.js';
import { redisCache } from '../../cache/redis-cache.service.js';

interface CachedLogoPayload {
  logo?: AnimeLogoResult | null;
  notFound?: boolean;
  cachedAt: number;
}

const inFlightLogoRequests = new Map<number, Promise<AnimeLogoResult | null>>();
const LOGO_CACHE_TTL = 86400 * 30; // 30 days
const LOGO_NEGATIVE_TTL = 900; // 15 minutes (short negative TTL prevents long-term cache poisoning)

export class LogoResolverService {
  /**
   * Resolves the genuine transparent PNG title logo from TMDB for an anime.
   */
  public static async resolveLogo(
    anilistId: number,
    hintTmdbId?: number,
    hintMediaType?: 'tv' | 'movie',
    prefetchedLogos?: TmdbImageItem[]
  ): Promise<AnimeLogoResult | null> {
    if (!Number.isInteger(anilistId) || anilistId <= 0) {
      return null;
    }

    // Versioned cache key (v2) to immediately bypass any historical 7-day negative cache
    const cacheKey = `anime:logo:v2:${anilistId}`;

    // 1. Check Redis Cache
    try {
      const cached = await redisCache.get<CachedLogoPayload>(cacheKey);
      if (cached) {
        if (cached.notFound) {
          // When non-empty prefetchedLogos are supplied, do not immediately return null;
          // allow the supplied prefetched logos to be evaluated.
          if (!prefetchedLogos || prefetchedLogos.length === 0) {
            return null;
          }
        } else if (cached.logo && cached.logo.logoUrl && cached.logo.filePath) {
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
          if (CANONICAL_OVERRIDES[anilistId]) {
            tmdbId = CANONICAL_OVERRIDES[anilistId].tmdbId;
            mediaType = CANONICAL_OVERRIDES[anilistId].mediaType;
          } else {
            const extIds = await ExternalIdResolverService.resolve(anilistId);
            if (extIds && extIds.tmdbId && extIds.mediaType) {
              tmdbId = extIds.tmdbId;
              mediaType = extIds.mediaType;
            }
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

        // Reuse prefetched logos if available, otherwise query TMDB images endpoint
        let logos = prefetchedLogos;
        if (!logos) {
          const images: TmdbImagesResponse | null = mediaType === 'movie'
            ? await TmdbProvider.getMovieImages(tmdbId)
            : await TmdbProvider.getTvImages(tmdbId);
          logos = images?.logos;
        }

        if (!logos || logos.length === 0) {
          void redisCache.set(
            cacheKey,
            { notFound: true, cachedAt: Date.now() },
            LOGO_NEGATIVE_TTL
          );
          return null;
        }

        // Select the highest quality transparent logo matching language priority
        const bestLogo = TmdbProvider.selectBestLogo(logos);

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
