import { AnimeLogoResult } from '@7anime/shared';
import { AniListProvider, AniListMedia } from '../providers/anilist.provider.js';
import { TmdbProvider, TmdbImagesResponse, TmdbImageItem, TMDB_IMAGE_ORIGINAL } from '../providers/tmdb.provider.js';
import { ExternalIdResolverService, ResolvedExternalIds } from './external-id-resolver.service.js';
import { CANONICAL_OVERRIDES } from './anime-matcher.service.js';
import { AnimeIdentityValidator } from './anime-identity-validator.service.js';
import { redisCache } from '../../cache/redis-cache.service.js';

interface CachedLogoPayload {
  logo?: AnimeLogoResult | null;
  notFound?: boolean;
  cachedAt: number;
}

const inFlightLogoRequests = new Map<number, Promise<AnimeLogoResult | null>>();
const LOGO_CACHE_TTL = 86400 * 30; // 30 days
const LOGO_NEGATIVE_TTL = 900; // 15 minutes (prevents long-term cache poisoning)

export class LogoResolverService {
  /**
   * Resolves the genuine verified transparent PNG title logo from TMDB for an anime.
   * Cross-verifies entity identity and attaches full provenance.
   */
  public static async resolveLogo(
    anilistId: number,
    hintTmdbId?: number,
    hintMediaType?: 'tv' | 'movie',
    prefetchedLogos?: TmdbImageItem[],
    animeMedia?: AniListMedia
  ): Promise<AnimeLogoResult | null> {
    if (!Number.isInteger(anilistId) || anilistId <= 0) {
      return null;
    }

    // Versioned cache key (v10) to immediately bypass any historical misattributed logos (e.g. Blindspot)
    const cacheKey = `anime:logo:v10:${anilistId}`;
    void redisCache.del(`anime:logo:${anilistId}`);
    void redisCache.del(`anime:logo:v2:${anilistId}`);
    void redisCache.del(`anime:logo:v3:${anilistId}`);

    // 1. Check Redis Cache
    try {
      const cached = await redisCache.get<CachedLogoPayload>(cacheKey);
      if (cached) {
        if (cached.notFound) {
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
        // Resolve AniList media metadata if not supplied
        let media = animeMedia;
        if (!media) {
          media = (await AniListProvider.getAnimeById(anilistId)) || undefined;
        }

        let tmdbId = hintTmdbId;
        let mediaType = hintMediaType;

        // Resolve TMDB ID and media type if not provided
        if (!tmdbId || !mediaType) {
          if (CANONICAL_OVERRIDES[anilistId]) {
            tmdbId = CANONICAL_OVERRIDES[anilistId].tmdbId;
            mediaType = CANONICAL_OVERRIDES[anilistId].mediaType;
          } else if (media) {
            const extIds = await ExternalIdResolverService.resolveFromMedia(media);
            if (extIds && extIds.tmdbId && extIds.mediaType) {
              tmdbId = extIds.tmdbId;
              mediaType = extIds.mediaType;
            }
          } else {
            const extIds = await ExternalIdResolverService.resolve(anilistId);
            if (extIds && extIds.tmdbId && extIds.mediaType) {
              tmdbId = extIds.tmdbId;
              mediaType = extIds.mediaType;
            }
          }
        }

        if (!tmdbId || !mediaType) {
          void redisCache.set(
            cacheKey,
            { notFound: true, cachedAt: Date.now() },
            LOGO_NEGATIVE_TTL
          );
          return null;
        }

        // Strict Entity Identity Cross-Verification
        if (media) {
          const details = mediaType === 'movie'
            ? await TmdbProvider.getMovieDetails(tmdbId)
            : await TmdbProvider.getTvDetails(tmdbId);

          if (details) {
            const validation = AnimeIdentityValidator.validateTmdbMatch(media, details);
            if (!validation.isValid) {
              console.warn(
                `[LogoResolverService] TMDB ${tmdbId} failed identity validation for anime ${anilistId}: ${validation.reason}`
              );
              // Reject candidate: never select a logo from an unrelated media entity
              void redisCache.set(
                cacheKey,
                { notFound: true, cachedAt: Date.now() },
                LOGO_NEGATIVE_TTL
              );
              return null;
            }
          }
        }

        // Fetch candidate logos from TMDB images endpoint if not prefetched
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

        // Validate each candidate logo item (dimensions, transparent PNG, valid aspect ratio)
        const animeTitle = media?.title?.english || media?.title?.romaji || 'Anime';
        const validCandidates = logos.filter((logo) => {
          const check = AnimeIdentityValidator.validateLogoCandidate(logo, animeTitle);
          return check.isValid;
        });

        if (validCandidates.length === 0) {
          void redisCache.set(
            cacheKey,
            { notFound: true, cachedAt: Date.now() },
            LOGO_NEGATIVE_TTL
          );
          return null;
        }

        // Select the highest quality transparent logo matching language priority
        const chosen = TmdbProvider.selectBestLogo(validCandidates);
        if (!chosen) {
          void redisCache.set(
            cacheKey,
            { notFound: true, cachedAt: Date.now() },
            LOGO_NEGATIVE_TTL
          );
          return null;
        }

        // Build verified result with complete provenance
        const verifiedLogo: AnimeLogoResult = {
          ...chosen,
          animeId: anilistId,
          provider: 'tmdb',
          providerMediaId: tmdbId,
          artworkType: 'official_logo',
          resolvedAt: Date.now(),
          verificationStatus: 'verified',
          verifiedTitle: animeTitle,
        };

        // Cache valid verified result in Redis
        void redisCache.set(
          cacheKey,
          { logo: verifiedLogo, notFound: false, cachedAt: Date.now() },
          LOGO_CACHE_TTL
        );

        return verifiedLogo;
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
