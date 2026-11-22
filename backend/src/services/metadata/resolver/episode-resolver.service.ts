import {
  AnimeEpisodeCatalogue,
  VerifiedEpisode,
  NextAiringEpisode,
  CatalogueCompleteness,
} from '@7anime/shared';
import { AniListProvider, AniListMedia } from '../providers/anilist.provider.js';
import { TmdbProvider, TmdbEpisode } from '../providers/tmdb.provider.js';
import { KitsuProvider } from '../providers/kitsu.provider.js';
import { ExternalIdResolverService } from './external-id-resolver.service.js';
import { FillerClassifierService } from './filler-classifier.service.js';
import { redisCache, SEVEN_DAYS_SECONDS } from '../../cache/redis-cache.service.js';

const inFlightEpisodeRequests = new Map<number, Promise<AnimeEpisodeCatalogue | null>>();
const SHORT_CACHE_SECONDS = 300; // 5 minutes for dynamic / resolving / partial states

/**
 * Programmatically validates that an image URL is well-formed, uses a supported scheme,
 * and originates from an accessible or known image host or standard image asset extension.
 * Rejects placeholder literals, data URIs, empty strings, and broken paths.
 */
export function isValidImageUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (trimmed.length < 10) return false;
  if (!/^https?:\/\//i.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host.includes('example.com')) {
      return false;
    }
    const path = parsed.pathname.toLowerCase();
    const isKnownImageHost =
      host.includes('tmdb.org') ||
      host.includes('crunchyroll.com') ||
      host.includes('kitsu.app') ||
      host.includes('kitsu.io') ||
      host.includes('anilist.co') ||
      host.includes('myanimelist.net') ||
      host.includes('cloudinary.com') ||
      host.includes('supabase.co');
    const hasImageExtension = /\.(jpg|jpeg|png|webp|avif|gif)(\?.*)?$/i.test(path);
    return isKnownImageHost || hasImageExtension;
  } catch {
    return false;
  }
}

export class EpisodeResolverService {
  /**
   * Resolves genuine, verified episode catalogue for an anime by its AniList ID.
   * Multi-provider fallback sequence:
   * 1. Check Redis cache
   * 2. Non-episodic / Movie check
   * 3. Announced / Not-yet-released check (honest 'resolving' state)
   * 4. Primary: TMDB Season Resolution
   * 5. Fallback 1: Kitsu API Episodes
   * 6. Fallback 2: AniList streamingEpisodes
   * 7. Honest state determination (complete, partial, resolving, not_applicable, metadata_unavailable)
   */
  public static async resolveEpisodes(anilistId: number): Promise<AnimeEpisodeCatalogue | null> {
    if (!Number.isInteger(anilistId) || anilistId <= 0) {
      return null;
    }

    // Versioned cache key (v6) to invalidate obsolete or faulty previous caches
    const cacheKey = `anime:episodes:v6:${anilistId}`;

    // 1. Check shared Redis cache
    const cached = await redisCache.get<AnimeEpisodeCatalogue>(cacheKey);
    if (cached) {
      return cached;
    }

    // 2. In-flight request deduplication
    const existing = inFlightEpisodeRequests.get(anilistId);
    if (existing) {
      return existing;
    }

    const resolverPromise = (async (): Promise<AnimeEpisodeCatalogue | null> => {
      try {
        // 3. Fetch canonical AniList media metadata
        const media: AniListMedia | null = await AniListProvider.getAnimeById(anilistId);
        if (!media) {
          return null;
        }

        const primaryTitle = media.title?.english || media.title?.romaji || 'Untitled';
        const isMovie = String(media.format || '').toUpperCase() === 'MOVIE';
        const isMusic = String(media.format || '').toUpperCase() === 'MUSIC';

        // 4. Non-episodic / Single installment handling (Movies, Music videos)
        if (isMovie || isMusic) {
          const bannerThumb = isValidImageUrl(media.bannerImage) ? media.bannerImage : undefined;
          const coverThumb = media.coverImage?.large && isValidImageUrl(media.coverImage.large) ? media.coverImage.large : undefined;
          const singleEp: VerifiedEpisode = {
            number: 1,
            title: primaryTitle,
            overview: media.description || undefined,
            airDate: media.startDate?.year ? `${media.startDate.year}` : undefined,
            duration: media.duration,
            thumbnail: bannerThumb || coverThumb,
            hasSub: true,
            hasDub: false,
            source: 'official',
          };

          const singleCatalogue: AnimeEpisodeCatalogue = {
            anilistId,
            totalAnnouncedEpisodes: 1,
            airedEpisodeCount: 1,
            verifiedRecordsCount: 1,
            completenessStatus: isMovie ? 'complete' : 'not_applicable',
            nextUpcomingEpisode: null,
            hasEpisodeList: true,
            episodes: [singleEp],
            source: 'official',
          };

          await redisCache.set(cacheKey, singleCatalogue, SEVEN_DAYS_SECONDS);
          return singleCatalogue;
        }

        // Calculate expected counts and aired count
        const totalAnnounced = typeof media.episodes === 'number' && media.episodes > 0 ? media.episodes : null;

        let airedEpisodeCount = 0;
        if (media.status === 'FINISHED') {
          airedEpisodeCount = totalAnnounced || 0;
        } else if (media.status === 'RELEASING') {
          if (media.nextAiringEpisode?.episode) {
            airedEpisodeCount = Math.max(0, media.nextAiringEpisode.episode - 1);
          } else {
            airedEpisodeCount = totalAnnounced || 0;
          }
        } else if (media.status === 'NOT_YET_RELEASED') {
          airedEpisodeCount = 0;
        } else {
          airedEpisodeCount = totalAnnounced || 0;
        }

        let nextUpcomingEpisode: NextAiringEpisode | null = null;
        if (media.nextAiringEpisode) {
          nextUpcomingEpisode = {
            episode: media.nextAiringEpisode.episode,
            airingAt: media.nextAiringEpisode.airingAt,
            timeUntilAiring: media.nextAiringEpisode.timeUntilAiring,
          };
        }

        // 5. Announced / Upcoming Anime Check
        // If an anime has not aired any episodes yet (status is NOT_YET_RELEASED or future date without aired episodes):
        // It must NOT falsely match past seasons or spin-offs from providers.
        const isNotYetReleased =
          media.status === 'NOT_YET_RELEASED' ||
          (media.status === 'RELEASING' && airedEpisodeCount === 0 && !totalAnnounced);

        if (isNotYetReleased) {
          const upcomingCatalogue: AnimeEpisodeCatalogue = {
            anilistId,
            totalAnnouncedEpisodes: totalAnnounced,
            airedEpisodeCount: 0,
            verifiedRecordsCount: 0,
            completenessStatus: 'resolving',
            nextUpcomingEpisode,
            hasEpisodeList: false,
            episodes: [],
            source: 'official_counts',
          };
          await redisCache.set(cacheKey, upcomingCatalogue, SHORT_CACHE_SECONDS);
          return upcomingCatalogue;
        }

        // 6. Episode map for deduplication and progressive enrichment
        const episodeMap = new Map<number, VerifiedEpisode>();
        let primarySourceUsed: string = 'none';

        // 7. Provider Priority 1: TMDB TV Season Resolution
        const extIds = await ExternalIdResolverService.resolve(anilistId);
        const tmdbId = extIds?.tmdbId;
        const mediaType = extIds?.mediaType;

        let tmdbEpisodes: TmdbEpisode[] = [];
        if (tmdbId && mediaType === 'tv') {
          try {
            tmdbEpisodes = await TmdbProvider.resolveSeasonEpisodes(tmdbId, media);
            if (tmdbEpisodes.length > 0) {
              primarySourceUsed = 'tmdb';
              for (const tmdbEp of tmdbEpisodes) {
                const epNum = tmdbEp.episode_number;
                if (!epNum || epNum <= 0) continue;

                const rawThumb = tmdbEp.still_path ? `https://image.tmdb.org/t/p/w300${tmdbEp.still_path}` : undefined;
                const thumb = isValidImageUrl(rawThumb) ? rawThumb : undefined;
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
            }
          } catch (err: any) {
            console.warn(`[EpisodeResolver] TMDB error for ${anilistId} (TMDB ${tmdbId}):`, err.message);
          }
        }

        // 8. Provider Priority 2: Kitsu Fallback and Enrichment
        // Attempt Kitsu if TMDB produced zero records, or if TMDB produced fewer than 50% of expected aired episodes,
        // or if TMDB produced episodes but some are missing thumbnails (for series with <= 300 episodes)
        const missingThumbsCount = Array.from(episodeMap.values()).filter((e) => !e.thumbnail).length;
        const needsFallback =
          episodeMap.size === 0 ||
          (airedEpisodeCount > 4 && episodeMap.size < airedEpisodeCount * 0.5) ||
          (missingThumbsCount > 0 && episodeMap.size <= 300);

        if (needsFallback) {
          try {
            const kitsuId = await KitsuProvider.searchAnime(primaryTitle, totalAnnounced, media.startDate?.year);
            if (kitsuId) {
              const kitsuEpisodes = await KitsuProvider.getEpisodes(kitsuId, totalAnnounced || 2000);
              if (kitsuEpisodes.length > 0) {
                if (episodeMap.size === 0) {
                  primarySourceUsed = 'kitsu';
                }
                for (const kEp of kitsuEpisodes) {
                  const existing = episodeMap.get(kEp.number);
                  const validKitsuThumb = isValidImageUrl(kEp.thumbnail) ? kEp.thumbnail : undefined;
                  if (!existing) {
                    if (!totalAnnounced || kEp.number <= totalAnnounced) {
                      episodeMap.set(kEp.number, {
                        ...kEp,
                        thumbnail: validKitsuThumb,
                      });
                    }
                  } else {
                    // Enrich existing record with verified thumbnail, title, or overview if missing
                    if (!existing.thumbnail && validKitsuThumb) {
                      existing.thumbnail = validKitsuThumb;
                    }
                    if (existing.title === `Episode ${kEp.number}` && kEp.title) {
                      existing.title = kEp.title;
                    }
                    if (!existing.overview && kEp.overview) {
                      existing.overview = kEp.overview;
                    }
                  }
                }
              }
            }
          } catch (err: any) {
            console.warn(`[EpisodeResolver] Kitsu fallback error for ${anilistId}:`, err.message);
          }
        }

        // 9. Provider Priority 3: AniList Streaming Episodes (Crunchyroll official links)
        const streamingEpisodes = media.streamingEpisodes || [];
        if (streamingEpisodes.length > 0) {
          let addedFromAniList = 0;
          for (const streamEp of streamingEpisodes) {
            const match = streamEp.title?.match(/Episode\s+(\d+)/i);
            if (match) {
              const epNum = parseInt(match[1], 10);
              if (epNum > 0) {
                const existing = episodeMap.get(epNum);
                const validStreamThumb = isValidImageUrl(streamEp.thumbnail) ? streamEp.thumbnail : undefined;
                if (existing) {
                  // Always enrich existing thumbnail from streaming service if missing
                  if (!existing.thumbnail && validStreamThumb) {
                    existing.thumbnail = validStreamThumb;
                  }
                } else if (primarySourceUsed === 'none') {
                  // Only add new records from streaming links if no primary provider succeeded
                  if (!totalAnnounced || epNum <= totalAnnounced) {
                    const cleanTitle =
                      streamEp.title?.replace(/^Episode\s+\d+\s*[-–:]\s*/i, '') || streamEp.title;
                    episodeMap.set(epNum, {
                      number: epNum,
                      title: cleanTitle || `Episode ${epNum}`,
                      thumbnail: validStreamThumb,
                      duration: media.duration,
                      hasSub: true,
                      hasDub: false,
                      source: 'anilist',
                    });
                    addedFromAniList++;
                  }
                }
              }
            }
          }
          if (primarySourceUsed === 'none' && addedFromAniList > 0) {
            primarySourceUsed = 'anilist';
          }
        }

        // 10. Filter ONLY genuinely released episodes (Exclude any future scheduled or unreleased episodes)
        const now = Date.now();
        let maxReleasedEpNum = Infinity;
        if (media.status === 'NOT_YET_RELEASED') {
          maxReleasedEpNum = 0;
        } else if (media.status === 'RELEASING') {
          if (media.nextAiringEpisode?.episode) {
            maxReleasedEpNum = media.nextAiringEpisode.episode - 1;
          } else if (totalAnnounced) {
            maxReleasedEpNum = totalAnnounced;
          }
        } else if (media.status === 'FINISHED' && totalAnnounced) {
          maxReleasedEpNum = totalAnnounced;
        }

        const candidateEpisodes = Array.from(episodeMap.values()).sort((a, b) => a.number - b.number);
        const verifiedEpisodes: VerifiedEpisode[] = [];

        for (const ep of candidateEpisodes) {
          // Rule 1: Exclude episodes exceeding known released ceiling
          if (ep.number > maxReleasedEpNum) {
            continue;
          }

          // Rule 2: Exclude episodes with air date strictly in the future (using JST/UTC)
          if (ep.airDate) {
            // Air dates in anime are published in JST (+09:00). An episode airing on YYYY-MM-DD finishes airing by end of day in JST.
            const airTime = new Date(`${ep.airDate}T23:59:59+09:00`).getTime();
            if (!isNaN(airTime) && airTime > now) {
              // Air date is in the future
              continue;
            }
          } else if (media.status === 'RELEASING' && airedEpisodeCount > 0 && ep.number > airedEpisodeCount) {
            // Air date missing and exceeds known aired count for releasing anime
            continue;
          }

          verifiedEpisodes.push(ep);
        }

        // 11. Enrich with Canon / Mixed / Filler / Unknown classifications
        try {
          const classificationMap = await FillerClassifierService.classifyAnime(
            primaryTitle,
            media.title?.romaji,
            media.synonyms || []
          );

          for (const ep of verifiedEpisodes) {
            const info = classificationMap.get(ep.number);
            if (info) {
              ep.classification = info.classification;
              ep.classificationSource = info.source;
              ep.isFiller = info.classification === 'FILLER';
            } else {
              ep.classification = 'UNKNOWN';
              ep.classificationSource = 'unknown';
              ep.isFiller = false;
            }
          }
        } catch (clfErr: any) {
          console.warn(`[EpisodeResolver] Classification failed for ${anilistId}:`, clfErr.message);
          for (const ep of verifiedEpisodes) {
            ep.classification = 'UNKNOWN';
            ep.classificationSource = 'unknown';
            ep.isFiller = false;
          }
        }

        // 12. Update aired episode count to match verified released records
        const actualReleasedCount = verifiedEpisodes.length;

        // 13. Honest completeness status
        let completenessStatus: CatalogueCompleteness = 'metadata_unavailable';

        if (verifiedEpisodes.length > 0) {
          if (totalAnnounced && verifiedEpisodes.length >= totalAnnounced) {
            completenessStatus = 'complete';
          } else if (media.status === 'RELEASING' && media.nextAiringEpisode && verifiedEpisodes.length >= (media.nextAiringEpisode.episode - 1)) {
            // All currently released episodes for this airing show are fully resolved
            completenessStatus = 'complete';
          } else if (media.status === 'FINISHED' && (airedEpisodeCount === 0 || verifiedEpisodes.length >= airedEpisodeCount)) {
            completenessStatus = 'complete';
          } else {
            completenessStatus = 'partial';
          }
        } else {
          // Zero episode records
          if (media.status === 'NOT_YET_RELEASED') {
            completenessStatus = 'resolving';
          } else if (media.status === 'RELEASING' && actualReleasedCount === 0) {
            completenessStatus = 'resolving';
          } else {
            completenessStatus = 'metadata_unavailable';
          }
        }

        const catalogue: AnimeEpisodeCatalogue = {
          anilistId,
          totalAnnouncedEpisodes: totalAnnounced,
          airedEpisodeCount: actualReleasedCount,
          verifiedRecordsCount: verifiedEpisodes.length,
          completenessStatus,
          nextUpcomingEpisode,
          hasEpisodeList: verifiedEpisodes.length > 0,
          episodes: verifiedEpisodes,
          source: primarySourceUsed !== 'none' ? primarySourceUsed : 'official_counts',
        };

        // Ongoing/releasing anime or resolving states are cached for 5 minutes; completed catalogues cached for 7 days
        const isDynamic = media.status === 'RELEASING' || media.status === 'NOT_YET_RELEASED' || completenessStatus !== 'complete';
        const ttl = isDynamic ? SHORT_CACHE_SECONDS : SEVEN_DAYS_SECONDS;
        await redisCache.set(cacheKey, catalogue, ttl);

        return catalogue;
      } catch (err: any) {
        console.error(`[EpisodeResolver] Fatal error for ${anilistId}:`, err);
        return null;
      } finally {
        inFlightEpisodeRequests.delete(anilistId);
      }
    })();

    inFlightEpisodeRequests.set(anilistId, resolverPromise);
    return resolverPromise;
  }
}
