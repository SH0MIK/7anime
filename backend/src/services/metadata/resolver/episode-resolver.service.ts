import { AnimeEpisodeCatalogue, VerifiedEpisode, NextAiringEpisode, CatalogueCompleteness } from '@7anime/shared';
import { AniListProvider, AniListMedia } from '../providers/anilist.provider.js';
import { TmdbProvider, TmdbEpisode } from '../providers/tmdb.provider.js';
import { ExternalIdResolverService } from './external-id-resolver.service.js';
import { redisCache, SEVEN_DAYS_SECONDS } from '../../cache/redis-cache.service.js';

export class EpisodeResolverService {
  /**
   * Resolves genuine, verified episode catalogue for an anime by its AniList ID.
   * Never fabricates episode records, titles, thumbnails, or fake filler labels.
   */
  public static async resolveEpisodes(anilistId: number): Promise<AnimeEpisodeCatalogue | null> {
    if (!Number.isInteger(anilistId) || anilistId <= 0) {
      return null;
    }

    // Versioned cache key to immediately invalidate any obsolete incomplete cache
    const cacheKey = `anime:episodes:v2:${anilistId}`;

    // 1. Check shared Redis cache
    const cached = await redisCache.get<AnimeEpisodeCatalogue>(cacheKey);
    if (cached) {
      return cached;
    }

    // 2. Fetch AniList media metadata
    const media: AniListMedia | null = await AniListProvider.getAnimeById(anilistId);
    if (!media) {
      return null;
    }

    // 3. Resolve external IDs to get TMDB ID if available
    const extIds = await ExternalIdResolverService.resolve(anilistId);
    const tmdbId = extIds?.tmdbId;
    const mediaType = extIds?.mediaType;

    // 4. Movie special case
    if (media.format === 'MOVIE') {
      const movieEp: VerifiedEpisode = {
        number: 1,
        title: media.title?.english || media.title?.romaji || 'Full Movie',
        overview: media.description || undefined,
        airDate: media.startDate?.year ? `${media.startDate.year}` : undefined,
        duration: media.duration,
        thumbnail: media.bannerImage || media.coverImage?.large,
        hasSub: true,
        hasDub: false,
        source: 'official',
      };

      const movieCatalogue: AnimeEpisodeCatalogue = {
        anilistId,
        totalAnnouncedEpisodes: 1,
        airedEpisodeCount: 1,
        verifiedRecordsCount: 1,
        completenessStatus: 'complete',
        nextUpcomingEpisode: null,
        hasEpisodeList: true,
        episodes: [movieEp],
        source: 'anilist',
      };

      await redisCache.set(cacheKey, movieCatalogue, SEVEN_DAYS_SECONDS);
      return movieCatalogue;
    }

    // 5. Collect TMDB season episodes if TV
    let tmdbEpisodes: TmdbEpisode[] = [];
    if (tmdbId && mediaType === 'tv') {
      try {
        tmdbEpisodes = await TmdbProvider.getAllTvEpisodes(tmdbId, media.episodes);
      } catch (err: any) {
        console.warn(`[EpisodeResolver] Failed to load TMDB TV episodes for ${tmdbId}: ${err.message}`);
      }
    }

    // 6. Collect AniList streaming episodes (Crunchyroll, etc.)
    const streamingEpisodes = media.streamingEpisodes || [];

    // 7. Assemble verified episodes
    const episodeMap = new Map<number, VerifiedEpisode>();

    // Index TMDB episodes
    for (const tmdbEp of tmdbEpisodes) {
      const epNum = tmdbEp.episode_number;
      if (!epNum || epNum <= 0) continue;

      const thumb = tmdbEp.still_path ? `https://image.tmdb.org/t/p/w300${tmdbEp.still_path}` : undefined;

      episodeMap.set(epNum, {
        number: epNum,
        title: tmdbEp.name || `Episode ${epNum}`,
        overview: tmdbEp.overview || undefined,
        airDate: tmdbEp.air_date || undefined,
        duration: tmdbEp.runtime || media.duration,
        thumbnail: thumb,
        isFiller: undefined,
        hasSub: true,
        hasDub: false,
        source: 'tmdb',
      });
    }

    // Merge AniList streaming episodes
    for (const streamEp of streamingEpisodes) {
      const match = streamEp.title?.match(/Episode\s+(\d+)/i);
      if (match) {
        const epNum = parseInt(match[1], 10);
        if (epNum > 0) {
          const existing = episodeMap.get(epNum);
          if (existing) {
            if (!existing.thumbnail && streamEp.thumbnail) {
              existing.thumbnail = streamEp.thumbnail;
            }
          } else {
            const cleanTitle = streamEp.title?.replace(/^Episode\s+\d+\s*[-–:]\s*/i, '') || streamEp.title;
            episodeMap.set(epNum, {
              number: epNum,
              title: cleanTitle || `Episode ${epNum}`,
              thumbnail: streamEp.thumbnail || undefined,
              duration: media.duration,
              hasSub: true,
              hasDub: false,
              source: 'anilist',
            });
          }
        }
      }
    }

    const verifiedEpisodes = Array.from(episodeMap.values()).sort((a, b) => a.number - b.number);

    // 8. Calculate real episode counts & completeness status
    const totalAnnounced = typeof media.episodes === 'number' && media.episodes > 0 ? media.episodes : null;

    let airedEpisodeCount = 0;
    if (media.status === 'FINISHED') {
      airedEpisodeCount = totalAnnounced || verifiedEpisodes.length;
    } else if (media.status === 'RELEASING') {
      if (media.nextAiringEpisode?.episode) {
        airedEpisodeCount = Math.max(0, media.nextAiringEpisode.episode - 1);
      } else {
        airedEpisodeCount = totalAnnounced || verifiedEpisodes.length;
      }
    } else if (media.status === 'NOT_YET_RELEASED') {
      airedEpisodeCount = 0;
    } else {
      airedEpisodeCount = totalAnnounced || verifiedEpisodes.length;
    }

    let nextUpcomingEpisode: NextAiringEpisode | null = null;
    if (media.nextAiringEpisode) {
      nextUpcomingEpisode = {
        episode: media.nextAiringEpisode.episode,
        airingAt: media.nextAiringEpisode.airingAt,
        timeUntilAiring: media.nextAiringEpisode.timeUntilAiring,
      };
    }

    let completenessStatus: CatalogueCompleteness = 'unavailable';
    if (verifiedEpisodes.length === 0) {
      completenessStatus = 'unavailable';
    } else if (airedEpisodeCount > 0 && verifiedEpisodes.length >= airedEpisodeCount) {
      completenessStatus = 'complete';
    } else if (totalAnnounced && verifiedEpisodes.length >= totalAnnounced) {
      completenessStatus = 'complete';
    } else {
      completenessStatus = 'partial';
    }

    const catalogue: AnimeEpisodeCatalogue = {
      anilistId,
      totalAnnouncedEpisodes: totalAnnounced,
      airedEpisodeCount,
      verifiedRecordsCount: verifiedEpisodes.length,
      completenessStatus,
      nextUpcomingEpisode,
      hasEpisodeList: verifiedEpisodes.length > 0,
      episodes: verifiedEpisodes,
      source: verifiedEpisodes.length > 0 ? (tmdbEpisodes.length > 0 ? 'tmdb+anilist' : 'anilist') : 'official_counts',
    };

    // Cache in shared Redis with 7-day TTL
    await redisCache.set(cacheKey, catalogue, SEVEN_DAYS_SECONDS);

    return catalogue;
  }
}
