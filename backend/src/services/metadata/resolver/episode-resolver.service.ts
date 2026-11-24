import {
  AnimeEpisodeCatalogue,
  VerifiedEpisode,
  NextAiringEpisode,
  CatalogueCompleteness,
} from '@7anime/shared';
import { AniListProvider, AniListMedia } from '../providers/anilist.provider.js';
import { TmdbProvider, TmdbEpisode } from '../providers/tmdb.provider.js';
import { KitsuProvider } from '../providers/kitsu.provider.js';
import { MalProvider } from '../providers/mal.provider.js';
import { ExternalIdResolverService } from './external-id-resolver.service.js';
import { FillerClassifierService } from './filler-classifier.service.js';
import { AnimeIdentityValidator } from './anime-identity-validator.service.js';
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

    // Versioned cache key (v10) to invalidate obsolete or cross-contaminated caches
    const cacheKey = `anime:episodes:v10:${anilistId}`;

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
            playableEpisodeCount: 1,
          };

          await redisCache.set(cacheKey, singleCatalogue, SEVEN_DAYS_SECONDS);
          return singleCatalogue;
        }

        // 5. Separate Episode Count Concepts
        const totalAnnounced = typeof media.episodes === 'number' && media.episodes > 0 ? media.episodes : null;

        let nextUpcomingEpisode: NextAiringEpisode | null = null;
        if (media.nextAiringEpisode) {
          nextUpcomingEpisode = {
            episode: media.nextAiringEpisode.episode,
            airingAt: media.nextAiringEpisode.airingAt,
            timeUntilAiring: media.nextAiringEpisode.timeUntilAiring,
          };
        }

        // 6. Announced / Not Yet Released Check
        // If an anime has not aired any episodes yet:
        const isNotYetReleased =
          media.status === 'NOT_YET_RELEASED' ||
          (media.status === 'RELEASING' && media.nextAiringEpisode?.episode === 1 && (media.nextAiringEpisode.timeUntilAiring ?? 1) > 0);

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
            playableEpisodeCount: 0,
          };
          await redisCache.set(cacheKey, upcomingCatalogue, SHORT_CACHE_SECONDS);
          return upcomingCatalogue;
        }

        // 7. Initial Confirmed Aired Episode Count Resolution (Priority baseline)
        let confirmedAiredCount = 0;
        if (media.status === 'FINISHED') {
          // A completed anime or season has finished airing all planned episodes
          confirmedAiredCount = totalAnnounced || 0;
        } else if (media.status === 'RELEASING') {
          if (media.nextAiringEpisode?.episode && media.nextAiringEpisode.episode > 1) {
            confirmedAiredCount = media.nextAiringEpisode.episode - 1;
          } else if (totalAnnounced) {
            confirmedAiredCount = totalAnnounced;
          }
        }

        // Optional MAL check if confirmedAiredCount is 0 and MAL ID exists
        if (confirmedAiredCount === 0 && media.idMal) {
          try {
            const malData = await MalProvider.getAnimeById(media.idMal);
            if (malData) {
              if (malData.status === 'finished_airing' && malData.numEpisodes) {
                confirmedAiredCount = malData.numEpisodes;
              }
            }
          } catch {
            // Non-blocking
          }
        }

        // 8. Multi-Source Upstream Provider Metadata Collection
        const episodeMap = new Map<number, VerifiedEpisode>();
        let primarySourceUsed: string = 'none';

        // 8.1 Provider Priority 1: TMDB TV Season Resolution
        const extIds = await ExternalIdResolverService.resolve(anilistId);
        const tmdbId = extIds?.tmdbId;
        const mediaType = extIds?.mediaType;

        let tmdbEpisodes: TmdbEpisode[] = [];
        if (tmdbId && mediaType === 'tv') {
          try {
            // Strict Cross-Entity Identity Validation before consuming TMDB episodes
            const details = await TmdbProvider.getTvDetails(tmdbId);
            const identityCheck = details ? AnimeIdentityValidator.validateTmdbMatch(media, details) : { isValid: false, reason: 'Details unavailable' };
            if (!identityCheck.isValid) {
              console.warn(`[EpisodeResolver] TMDB ${tmdbId} identity mismatch for anime ${anilistId}: ${identityCheck.reason}`);
            } else {
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
                    metadataVerified: true,
                    isPlayable: true,
                    source: 'tmdb',
                  });
                }
              }
            }
          } catch (err: any) {
            console.warn(`[EpisodeResolver] TMDB error for ${anilistId} (TMDB ${tmdbId}):`, err.message);
          }
        }

        // 8.2 Provider Priority 2: Kitsu Fallback and Enrichment
        const missingThumbsCount = Array.from(episodeMap.values()).filter((e) => !e.thumbnail).length;
        const needsFallback =
          episodeMap.size === 0 ||
          (confirmedAiredCount > 4 && episodeMap.size < confirmedAiredCount * 0.5) ||
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

        // 8.3 Provider Priority 3: AniList Streaming Episodes (Crunchyroll official links)
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
                  if (!existing.thumbnail && validStreamThumb) {
                    existing.thumbnail = validStreamThumb;
                  }
                } else if (primarySourceUsed === 'none') {
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
                      metadataVerified: true,
                      isPlayable: true,
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

        // 9. Filter ONLY Genuinely Released Episodes (Strictly exclude future unreleased episodes)
        const now = Date.now();
        let maxReleasedEpNum = Infinity;
        if (media.status === 'NOT_YET_RELEASED') {
          maxReleasedEpNum = 0;
        } else if (media.status === 'RELEASING') {
          if (media.nextAiringEpisode?.episode) {
            maxReleasedEpNum = media.nextAiringEpisode.episode - 1;
          } else if (confirmedAiredCount > 0) {
            maxReleasedEpNum = confirmedAiredCount;
          }
        } else if (media.status === 'FINISHED' && (totalAnnounced || confirmedAiredCount > 0)) {
          maxReleasedEpNum = totalAnnounced || confirmedAiredCount;
        }

        const verifiedReleasedMap = new Map<number, VerifiedEpisode>();

        for (const ep of episodeMap.values()) {
          // Rule 1: Exclude episodes exceeding known released ceiling
          if (ep.number > maxReleasedEpNum) {
            continue;
          }

          // Rule 2: Exclude episodes with air date strictly in the future (using JST/UTC)
          if (ep.airDate) {
            const airTime = new Date(`${ep.airDate}T23:59:59+09:00`).getTime();
            if (!isNaN(airTime) && airTime > now) {
              continue;
            }
          } else if (media.status === 'RELEASING' && confirmedAiredCount > 0 && ep.number > confirmedAiredCount) {
            continue;
          }

          verifiedReleasedMap.set(ep.number, ep);
        }

        // 10. Establish Definite Aired Episode Count
        let maxVerifiedEpNum = 0;
        if (verifiedReleasedMap.size > 0) {
          maxVerifiedEpNum = Math.max(...Array.from(verifiedReleasedMap.keys()));
        }

        let airedEpisodeCount = Math.max(confirmedAiredCount, maxVerifiedEpNum);

        // Fallback for finished anime with known total
        if (airedEpisodeCount === 0 && media.status === 'FINISHED' && totalAnnounced && totalAnnounced > 0) {
          airedEpisodeCount = totalAnnounced;
        }

        // 11. Enrich Verified Released Episodes with Canon / Mixed / Filler Classifications
        try {
          const classificationMap = await FillerClassifierService.classifyAnime(
            primaryTitle,
            media.title?.romaji,
            media.synonyms || []
          );

          for (const [epNum, ep] of verifiedReleasedMap.entries()) {
            const info = classificationMap.get(epNum);
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
          for (const ep of verifiedReleasedMap.values()) {
            ep.classification = 'UNKNOWN';
            ep.classificationSource = 'unknown';
            ep.isFiller = false;
          }
        }

        // 12. GUARANTEED CATALOGUE FALLBACK & GAP RESOLUTION
        // Every episode that has genuinely aired must appear in the 7Anime catalogue.
        // If an upstream provider omits individual records for released episodes,
        // generate honest numbered fallback entries without fabricating fake metadata.
        const catalogueEpisodes: VerifiedEpisode[] = [];

        if (airedEpisodeCount > 0) {
          for (let i = 1; i <= airedEpisodeCount; i++) {
            const existing = verifiedReleasedMap.get(i);
            if (existing) {
              catalogueEpisodes.push(existing);
            } else {
              // Guaranteed Fallback Entry: Honest unknown states, zero fabricated streams
              catalogueEpisodes.push({
                number: i,
                title: `Episode ${i}`,
                overview: undefined,
                airDate: undefined,
                duration: media.duration,
                thumbnail: undefined,
                isFiller: false,
                classification: 'UNKNOWN',
                classificationSource: 'generated_fallback',
                hasSub: false,
                hasDub: false,
                metadataVerified: false,
                isPlayable: false,
                source: 'GENERATED_FALLBACK',
              });
            }
          }
        } else if (verifiedReleasedMap.size > 0) {
          // If expected aired count was 0, but verified episodes were discovered:
          const sortedNumbers = Array.from(verifiedReleasedMap.keys()).sort((a, b) => a - b);
          airedEpisodeCount = sortedNumbers[sortedNumbers.length - 1];
          for (let i = 1; i <= airedEpisodeCount; i++) {
            const existing = verifiedReleasedMap.get(i);
            if (existing) {
              catalogueEpisodes.push(existing);
            } else {
              catalogueEpisodes.push({
                number: i,
                title: `Episode ${i}`,
                overview: undefined,
                airDate: undefined,
                duration: media.duration,
                thumbnail: undefined,
                isFiller: false,
                classification: 'UNKNOWN',
                classificationSource: 'generated_fallback',
                hasSub: false,
                hasDub: false,
                metadataVerified: false,
                isPlayable: false,
                source: 'GENERATED_FALLBACK',
              });
            }
          }
        }

        // 13. Accurate Statistics & Honest Completeness Status
        const verifiedRecordsCount = catalogueEpisodes.filter((e) => e.source !== 'GENERATED_FALLBACK').length;
        const playableEpisodeCount = catalogueEpisodes.filter((e) => e.isPlayable === true).length;

        let completenessStatus: CatalogueCompleteness = 'metadata_unavailable';

        if (catalogueEpisodes.length > 0) {
          if (verifiedRecordsCount >= airedEpisodeCount && airedEpisodeCount > 0) {
            completenessStatus = 'complete';
          } else if (verifiedRecordsCount > 0) {
            completenessStatus = 'partial';
          } else {
            completenessStatus = 'fallback_generated';
          }
        } else {
          // Zero episode records
          if (media.status === 'NOT_YET_RELEASED') {
            completenessStatus = 'resolving';
          } else if (media.status === 'RELEASING' && airedEpisodeCount === 0) {
            completenessStatus = 'resolving';
          } else {
            completenessStatus = 'metadata_unavailable';
          }
        }

        const catalogue: AnimeEpisodeCatalogue = {
          anilistId,
          totalAnnouncedEpisodes: totalAnnounced,
          airedEpisodeCount,
          verifiedRecordsCount,
          completenessStatus,
          nextUpcomingEpisode,
          hasEpisodeList: catalogueEpisodes.length > 0,
          episodes: catalogueEpisodes,
          source: primarySourceUsed !== 'none' ? primarySourceUsed : (verifiedRecordsCount > 0 ? 'multi_provider' : 'official_counts'),
          playableEpisodeCount,
        };

        // Ongoing/releasing anime or dynamic/partial states cached for 5 minutes; completed catalogues cached for 7 days
        const isDynamic =
          media.status === 'RELEASING' ||
          media.status === 'NOT_YET_RELEASED' ||
          completenessStatus !== 'complete';
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
