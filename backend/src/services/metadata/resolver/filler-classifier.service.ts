import { CircuitBreaker } from './circuit-breaker.service.js';
import { redisCache, SEVEN_DAYS_SECONDS } from '../../cache/redis-cache.service.js';

export type EpisodeClassificationType = 'CANON' | 'MIXED' | 'FILLER' | 'UNKNOWN';

export interface EpisodeClassificationInfo {
  number: number;
  classification: EpisodeClassificationType;
  source: 'afl' | 'official' | 'unknown';
}

const ONE_DAY_SECONDS = 86400;
const inFlightAflRequests = new Map<string, Promise<Map<number, EpisodeClassificationInfo> | null>>();

const aflBreaker = new CircuitBreaker({
  name: 'AflFillerClassifier',
  failureThreshold: 4,
  cooldownPeriodMs: 60000,
});

export class FillerClassifierService {
  /**
   * Generates possible AnimeFillerList URL slugs from titles and synonyms.
   */
  public static generateCandidateSlugs(
    primaryTitle: string,
    romajiTitle?: string,
    synonyms: string[] = []
  ): string[] {
    const rawCandidates = [primaryTitle, romajiTitle, ...synonyms].filter(Boolean) as string[];
    const slugs = new Set<string>();

    for (const raw of rawCandidates) {
      const clean = raw
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim();

      const standardSlug = clean.replace(/\s+/g, '-');
      if (standardSlug) slugs.add(standardSlug);

      // Handle common AFL patterns (e.g. "attack on titan" -> "attack-titan")
      if (clean.includes('attack on titan')) {
        slugs.add('attack-titan');
      }

      // Handle season / part suffixes removed for franchise-level filler lists
      const withoutSeason = clean
        .replace(/\b(?:season|series|part|cour)\s*\d+\b/gi, '')
        .replace(/\b\d+(?:st|nd|rd|th)\s*season\b/gi, '')
        .trim()
        .replace(/\s+/g, '-');
      if (withoutSeason && withoutSeason !== standardSlug) {
        slugs.add(withoutSeason);
      }
    }

    return Array.from(slugs);
  }

  /**
   * Resolves episode classifications for an anime by its titles.
   * Returns a map of episode number to EpisodeClassificationInfo.
   * If an episode is not in the map, it should be treated as UNKNOWN.
   */
  public static async classifyAnime(
    primaryTitle: string,
    romajiTitle?: string,
    synonyms: string[] = []
  ): Promise<Map<number, EpisodeClassificationInfo>> {
    const candidateSlugs = this.generateCandidateSlugs(primaryTitle, romajiTitle, synonyms);
    if (candidateSlugs.length === 0) {
      return new Map();
    }

    for (const slug of candidateSlugs) {
      const result = await this.fetchAflClassification(slug);
      if (result && result.size > 0) {
        return result;
      }
    }

    return new Map();
  }

  /**
   * Fetches and parses anime classification data from AnimeFillerList for a given slug.
   */
  private static async fetchAflClassification(
    slug: string
  ): Promise<Map<number, EpisodeClassificationInfo> | null> {
    const cacheKey = `afl:classification:${slug}`;

    // 1. Check Redis cache
    const cached = await redisCache.get<Record<string, EpisodeClassificationInfo> | null>(cacheKey);
    if (cached !== null && cached !== undefined) {
      const map = new Map<number, EpisodeClassificationInfo>();
      for (const [key, val] of Object.entries(cached)) {
        map.set(Number(key), val);
      }
      return map;
    }

    // 2. In-flight request deduplication
    const existing = inFlightAflRequests.get(slug);
    if (existing) {
      return existing;
    }

    const fetchPromise = (async (): Promise<Map<number, EpisodeClassificationInfo> | null> => {
      try {
        return await aflBreaker.execute(
          async () => {
            const url = `https://www.animefillerlist.com/shows/${slug}`;
            const res = await fetch(url, {
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                Accept: 'text/html,application/xhtml+xml',
              },
              signal: AbortSignal.timeout(6000),
            });

            if (res.status === 404) {
              // Negative cache non-existent show for 24h
              await redisCache.set(cacheKey, {}, ONE_DAY_SECONDS);
              return null;
            }

            if (!res.ok) {
              return null;
            }

            const html = await res.text();
            if (!html.includes('EpisodeList')) {
              await redisCache.set(cacheKey, {}, ONE_DAY_SECONDS);
              return null;
            }

            const episodeMap = new Map<number, EpisodeClassificationInfo>();
            const cacheObj: Record<string, EpisodeClassificationInfo> = {};

            // Row pattern: <tr class="manga_canon odd" id="eps-1"><td class="Number">1</td>...
            const rowRegex = /<tr class="([^"]*(?:canon|filler)[^"]*)"[^>]*>([\s\S]*?)<\/tr>/gi;
            let match: RegExpExecArray | null;

            while ((match = rowRegex.exec(html)) !== null) {
              const classAttr = match[1].toLowerCase();
              const rowContent = match[2];

              const numMatch = rowContent.match(/<td class="Number">\s*(\d+)\s*<\/td>/i);
              if (!numMatch) continue;
              const epNum = parseInt(numMatch[1], 10);
              if (isNaN(epNum) || epNum <= 0) continue;

              let classification: EpisodeClassificationType = 'UNKNOWN';
              if (classAttr.includes('mixed')) {
                classification = 'MIXED';
              } else if (classAttr.includes('filler')) {
                classification = 'FILLER';
              } else if (classAttr.includes('manga_canon') || classAttr.includes('anime_canon')) {
                classification = 'CANON';
              }

              const info: EpisodeClassificationInfo = {
                number: epNum,
                classification,
                source: 'afl',
              };

              episodeMap.set(epNum, info);
              cacheObj[String(epNum)] = info;
            }

            if (episodeMap.size > 0) {
              await redisCache.set(cacheKey, cacheObj, SEVEN_DAYS_SECONDS);
              return episodeMap;
            }

            await redisCache.set(cacheKey, {}, ONE_DAY_SECONDS);
            return null;
          },
          async () => null
        );
      } catch (err: any) {
        console.warn(`[FillerClassifier] Error for slug "${slug}":`, err.message);
        return null;
      } finally {
        inFlightAflRequests.delete(slug);
      }
    })();

    inFlightAflRequests.set(slug, fetchPromise);
    return fetchPromise;
  }
}
