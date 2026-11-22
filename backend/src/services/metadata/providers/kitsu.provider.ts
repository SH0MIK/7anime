import { HttpClient } from '../../../utils/httpClient.js';
import { redisCache, SEVEN_DAYS_SECONDS } from '../../cache/redis-cache.service.js';
import { CircuitBreaker } from '../resolver/circuit-breaker.service.js';
import type { VerifiedEpisode } from '@7anime/shared';

const kitsuBreaker = new CircuitBreaker({
  name: 'KitsuProvider',
  failureThreshold: 4,
  cooldownPeriodMs: 30000,
});

interface KitsuEpisodeAttributes {
  number: number;
  seasonNumber?: number;
  canonicalTitle?: string;
  titles?: {
    en_jp?: string;
    en_us?: string;
    ja_jp?: string;
  };
  synopsis?: string;
  description?: string;
  airdate?: string;
  length?: number; // duration in minutes
  thumbnail?: {
    original?: string;
    large?: string;
    medium?: string;
  };
}

interface KitsuEpisodeItem {
  id: string;
  type: string;
  attributes: KitsuEpisodeAttributes;
}

interface KitsuAnimeItem {
  id: string;
  attributes: {
    canonicalTitle: string;
    titles?: Record<string, string>;
    episodeCount?: number | null;
    subtype?: string;
    startDate?: string;
  };
}

function extractSeasonNumber(str: string): number | null {
  const m =
    str.match(/(?:season|series|s)\s*(\d+)/i) ||
    str.match(/(\d+)(?:st|nd|rd|th)\s*season/i) ||
    str.match(/\bpart\s*(\d+)/i) ||
    str.match(/\bcour\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

export class KitsuProvider {
  private static readonly BASE_URL = 'https://kitsu.io/api/edge';

  /**
   * Searches Kitsu for matching anime ID by title and expected episode count or year.
   * Strictly enforces season parity to prevent sequel queries from matching Season 1.
   */
  public static async searchAnime(title: string, expectedCount?: number | null, year?: number | null): Promise<string | null> {
    const cleanTitle = title.trim();
    if (!cleanTitle) return null;

    const cacheKey = `kitsu:search:v2:${cleanTitle.toLowerCase()}:${expectedCount || 0}:${year || 0}`;
    const cached = await redisCache.get<string>(cacheKey);
    if (cached) return cached;

    const querySeason = extractSeasonNumber(cleanTitle);

    return kitsuBreaker.execute(
      async () => {
        try {
          const url = `${this.BASE_URL}/anime?filter[text]=${encodeURIComponent(cleanTitle)}&page[limit]=5`;
          const res = await HttpClient.get<{ data: KitsuAnimeItem[] }>(url, {
            headers: { Accept: 'application/vnd.api+json' },
            timeoutMs: 7000,
          });

          if (!res?.data || res.data.length === 0) {
            return null;
          }

          let bestId: string | null = null;
          let bestScore = -1;

          for (const item of res.data) {
            let score = 0;
            const itemTitle = (item.attributes.canonicalTitle || '').toLowerCase();
            const query = cleanTitle.toLowerCase();
            const candidateSeason = extractSeasonNumber(itemTitle);

            // Strictly reject mismatched seasons (e.g. query is Season 2, candidate is Season 1)
            if (querySeason !== null && candidateSeason !== null && querySeason !== candidateSeason) {
              continue;
            }
            if (querySeason !== null && querySeason > 1 && candidateSeason === null) {
              // Query explicitly asks for Season 2+, candidate does not specify a season
              continue;
            }

            if (itemTitle === query) {
              score += 10;
            } else if (itemTitle.includes(query) || query.includes(itemTitle)) {
              score += 5;
            }

            if (expectedCount && item.attributes.episodeCount === expectedCount) {
              score += 8;
            }

            if (year && item.attributes.startDate && item.attributes.startDate.startsWith(String(year))) {
              score += 4;
            }

            if (score > bestScore) {
              bestScore = score;
              bestId = item.id;
            }
          }

          if (bestId && bestScore >= 4) {
            await redisCache.set(cacheKey, bestId, SEVEN_DAYS_SECONDS);
            return bestId;
          }

          return null;
        } catch (err: any) {
          console.warn(`[KitsuProvider.searchAnime] Error for "${cleanTitle}":`, err?.message);
          return null;
        }
      },
      async () => null
    );
  }

  /**
   * Fetches all episode records from Kitsu for a given Kitsu anime ID.
   */
  public static async getEpisodes(kitsuId: string, maxEpisodes: number = 2000): Promise<VerifiedEpisode[]> {
    if (!kitsuId) return [];

    const cacheKey = `kitsu:episodes:v2:${kitsuId}`;
    const cached = await redisCache.get<VerifiedEpisode[]>(cacheKey);
    if (cached && Array.isArray(cached) && cached.length > 0) {
      return cached;
    }

    return kitsuBreaker.execute(
      async () => {
        const episodes: VerifiedEpisode[] = [];
        let offset = 0;
        const limit = 20; // Kitsu default page limit
        let hasMore = true;

        while (hasMore && episodes.length < maxEpisodes) {
          try {
            const url = `${this.BASE_URL}/anime/${kitsuId}/episodes?page[limit]=${limit}&page[offset]=${offset}&sort=number`;
            const res = await HttpClient.get<{ data: KitsuEpisodeItem[]; links?: { next?: string } }>(url, {
              headers: { Accept: 'application/vnd.api+json' },
              timeoutMs: 8000,
            });

            if (!res?.data || res.data.length === 0) {
              break;
            }

            for (const ep of res.data) {
              const attr = ep.attributes;
              const epNum = Number(attr.number);
              if (!epNum || epNum <= 0) continue;

              const title =
                attr.canonicalTitle ||
                attr.titles?.en_us ||
                attr.titles?.en_jp ||
                `Episode ${epNum}`;

              const thumb =
                attr.thumbnail?.original ||
                attr.thumbnail?.large ||
                attr.thumbnail?.medium ||
                undefined;

              episodes.push({
                number: epNum,
                title,
                overview: attr.synopsis || attr.description || undefined,
                airDate: attr.airdate || undefined,
                duration: attr.length || undefined,
                thumbnail: thumb,
                hasSub: true,
                hasDub: false,
                source: 'kitsu',
              });
            }

            if (!res.links?.next || res.data.length < limit) {
              hasMore = false;
            } else {
              offset += limit;
            }
          } catch (err: any) {
            console.warn(`[KitsuProvider.getEpisodes] Page error for ${kitsuId} at offset ${offset}:`, err?.message);
            break;
          }
        }

        if (episodes.length > 0) {
          // Sort and deduplicate
          const epMap = new Map<number, VerifiedEpisode>();
          for (const ep of episodes) {
            if (!epMap.has(ep.number)) {
              epMap.set(ep.number, ep);
            }
          }
          const sorted = Array.from(epMap.values()).sort((a, b) => a.number - b.number);
          await redisCache.set(cacheKey, sorted, SEVEN_DAYS_SECONDS);
          return sorted;
        }

        return [];
      },
      async () => []
    );
  }
}
