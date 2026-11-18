import { HttpClient } from '../../../utils/httpClient.js';
import { redisCache, SEVEN_DAYS_SECONDS } from '../../cache/redis-cache.service.js';
import { anilistBreaker } from '../resolver/circuit-breaker.service.js';
import { RecentAiredEpisodeItem } from '@7anime/shared';

export interface AniListTitle {
  romaji?: string;
  english?: string;
  native?: string;
}

export interface AniListTag {
  id: number;
  name: string;
  rank?: number;
  isMediaSpoiler?: boolean;
}

export interface AniListStudioNode {
  id: number;
  name: string;
  isAnimationStudio: boolean;
}

export interface AniListRelationNode {
  id: number;
  type: string;
  format?: string;
  status?: string;
  title: AniListTitle;
  coverImage?: {
    large?: string;
    medium?: string;
  };
}

export interface AniListRelationEdge {
  relationType: string;
  node: AniListRelationNode;
}

export interface AniListExternalLink {
  id: number;
  site: string;
  url: string;
}

export interface AniListTrailer {
  id?: string;
  site?: string;
  thumbnail?: string;
}

export interface AniListAiringSchedule {
  airingAt: number;
  timeUntilAiring: number;
  episode: number;
}

export interface AniListStreamingEpisode {
  title?: string;
  thumbnail?: string;
  url?: string;
  site?: string;
}

export interface AniListFuzzyDate {
  year?: number;
  month?: number;
  day?: number;
}

export interface AniListMedia {
  id: number;
  idMal?: number;
  title: AniListTitle;
  synonyms: string[];
  description?: string;
  format?: string;
  status?: string;
  season?: string;
  seasonYear?: number;
  startDate?: AniListFuzzyDate;
  endDate?: AniListFuzzyDate;
  episodes?: number;
  duration?: number;
  averageScore?: number;
  meanScore?: number;
  popularity?: number;
  isAdult?: boolean;
  genres: string[];
  tags: AniListTag[];
  studios?: {
    nodes: AniListStudioNode[];
  };
  coverImage?: {
    extraLarge?: string;
    large?: string;
    medium?: string;
    color?: string;
  };
  bannerImage?: string;
  relations?: {
    edges: AniListRelationEdge[];
  };
  externalLinks: AniListExternalLink[];
  trailer?: AniListTrailer;
  nextAiringEpisode?: AniListAiringSchedule;
  streamingEpisodes?: AniListStreamingEpisode[];
}

export interface AniListSearchResponse {
  pageInfo: {
    total: number;
    currentPage: number;
    lastPage: number;
    hasNextPage: boolean;
    perPage: number;
  };
  media: AniListMedia[];
}

const ANILIST_GRAPHQL_URL = 'https://graphql.anilist.co';

const MEDIA_FRAGMENT = `
  id
  idMal
  title {
    romaji
    english
    native
  }
  synonyms
  description(asHtml: false)
  format
  status
  season
  seasonYear
  startDate {
    year
    month
    day
  }
  endDate {
    year
    month
    day
  }
  episodes
  duration
  averageScore
  meanScore
  popularity
  isAdult
  genres
  tags {
    id
    name
    rank
    isMediaSpoiler
  }
  studios(isMain: true) {
    nodes {
      id
      name
      isAnimationStudio
    }
  }
  coverImage {
    extraLarge
    large
    medium
    color
  }
  bannerImage
  relations {
    edges {
      relationType
      node {
        id
        type
        format
        status
        title {
          romaji
          english
        }
        coverImage {
          large
        }
      }
    }
  }
  externalLinks {
    id
    site
    url
  }
  trailer {
    id
    site
    thumbnail
  }
  nextAiringEpisode {
    airingAt
    timeUntilAiring
    episode
  }
  streamingEpisodes {
    title
    thumbnail
    url
    site
  }
`;

export class AniListProvider {
  /**
   * Fetches full anime details by AniList ID with shared 7-day Redis caching.
   */
  public static async getAnimeById(anilistId: number): Promise<AniListMedia | null> {
    if (!Number.isInteger(anilistId) || anilistId <= 0) {
      return null;
    }

    const cacheKey = `anilist:anime:${anilistId}`;
    const cached = await redisCache.get<AniListMedia>(cacheKey);
    if (cached) {
      return cached;
    }

    return anilistBreaker.execute(
      async () => {
        const query = `
          query GetAnimeDetails($id: Int) {
            Media(id: $id, type: ANIME) {
              ${MEDIA_FRAGMENT}
            }
          }
        `;

        const response = await HttpClient.post<{ data?: { Media?: AniListMedia }; errors?: any[] }>(
          ANILIST_GRAPHQL_URL,
          {
            query,
            variables: { id: anilistId },
          },
          { timeoutMs: 9000 }
        );

        if (response.errors && response.errors.length > 0) {
          console.warn(`[AniListProvider] GraphQL error for ID ${anilistId}:`, response.errors[0].message);
          return null;
        }

        const media = response.data?.Media || null;
        if (media) {
          // Default 7-day TTL in shared Redis cache
          await redisCache.set(cacheKey, media, SEVEN_DAYS_SECONDS);
        }

        return media;
      },
      async (err) => {
        console.warn(`[AniListProvider] Circuit breaker failover for anime ${anilistId}:`, err?.message);
        return null;
      }
    );
  }

  /**
   * Searches anime by text query with pagination and shared Redis caching.
   */
  public static async searchAnime(
    searchQuery: string,
    page: number = 1,
    perPage: number = 20
  ): Promise<AniListSearchResponse> {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      return {
        pageInfo: { total: 0, currentPage: page, lastPage: 1, hasNextPage: false, perPage },
        media: [],
      };
    }

    const cacheKey = `anilist:search:${trimmed.toLowerCase()}:${page}:${perPage}`;
    const cached = await redisCache.get<AniListSearchResponse>(cacheKey);
    if (cached) {
      return cached;
    }

    return anilistBreaker.execute(
      async () => {
        const query = `
          query SearchAnime($search: String, $page: Int, $perPage: Int) {
            Page(page: $page, perPage: $perPage) {
              pageInfo {
                total
                currentPage
                lastPage
                hasNextPage
                perPage
              }
              media(search: $search, type: ANIME, sort: [POPULARITY_DESC, SCORE_DESC]) {
                ${MEDIA_FRAGMENT}
              }
            }
          }
        `;

        const response = await HttpClient.post<{
          data?: {
            Page?: {
              pageInfo: AniListSearchResponse['pageInfo'];
              media: AniListMedia[];
            };
          };
          errors?: any[];
        }>(
          ANILIST_GRAPHQL_URL,
          {
            query,
            variables: { search: trimmed, page, perPage },
          },
          { timeoutMs: 9000 }
        );

        if (response.errors && response.errors.length > 0) {
          console.warn(`[AniListProvider] GraphQL search error:`, response.errors[0].message);
          return {
            pageInfo: { total: 0, currentPage: page, lastPage: 1, hasNextPage: false, perPage },
            media: [],
          };
        }

        const result: AniListSearchResponse = {
          pageInfo: response.data?.Page?.pageInfo || {
            total: 0,
            currentPage: page,
            lastPage: 1,
            hasNextPage: false,
            perPage,
          },
          media: response.data?.Page?.media || [],
        };

        await redisCache.set(cacheKey, result, 86400 * 3); // 3 days search cache
        return result;
      },
      async () => ({
        pageInfo: { total: 0, currentPage: page, lastPage: 1, hasNextPage: false, perPage },
        media: [],
      })
    );
  }

  /**
   * Fetches trending anime.
   */
  public static async getTrendingAnime(page: number = 1, perPage: number = 10): Promise<AniListMedia[]> {
    const cacheKey = `anilist:trending:${page}:${perPage}`;
    const cached = await redisCache.get<AniListMedia[]>(cacheKey);
    if (cached) {
      return cached;
    }

    return anilistBreaker.execute(
      async () => {
        const query = `
          query GetTrending($page: Int, $perPage: Int) {
            Page(page: $page, perPage: $perPage) {
              media(type: ANIME, sort: [TRENDING_DESC, POPULARITY_DESC]) {
                ${MEDIA_FRAGMENT}
              }
            }
          }
        `;

        const response = await HttpClient.post<{ data?: { Page?: { media: AniListMedia[] } } }>(
          ANILIST_GRAPHQL_URL,
          {
            query,
            variables: { page, perPage },
          },
          { timeoutMs: 9000 }
        );

        const media = response.data?.Page?.media || [];
        await redisCache.set(cacheKey, media, 86400 * 2); // 2 days for trending
        return media;
      },
      async () => []
    );
  }

  /**
   * Fetches real recently aired episodes directly from AniList airing schedules.
   * Completely replaces synthesized timeAgo and dummy cards.
   */
  public static async getRecentAiringEpisodes(
    page: number = 1,
    perPage: number = 12
  ): Promise<RecentAiredEpisodeItem[]> {
    const cacheKey = `anilist:recent_airing:${page}:${perPage}`;
    const cached = await redisCache.get<RecentAiredEpisodeItem[]>(cacheKey);
    if (cached) {
      return cached;
    }

    return anilistBreaker.execute(
      async () => {
        const now = Math.floor(Date.now() / 1000);
        const query = `
          query GetRecentAiring($now: Int, $page: Int, $perPage: Int) {
            Page(page: $page, perPage: $perPage) {
              airingSchedules(airingAt_lesser: $now, sort: TIME_DESC) {
                id
                airingAt
                episode
                media {
                  id
                  title {
                    english
                    romaji
                    native
                  }
                  coverImage {
                    large
                    extraLarge
                  }
                  bannerImage
                  format
                  duration
                }
              }
            }
          }
        `;

        const response = await HttpClient.post<any>(
          ANILIST_GRAPHQL_URL,
          {
            query,
            variables: { now, page, perPage },
          },
          { timeoutMs: 9000 }
        );

        const rawList = response.data?.Page?.airingSchedules || [];
        const result: RecentAiredEpisodeItem[] = rawList.map((item: any) => {
          const media = item.media;
          const title = media?.title?.english || media?.title?.romaji || 'Anime';
          const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
          const routeId = `${slug}-${media?.id}`;

          // Calculate timeAgo in minutes/hours
          const diffSeconds = Math.max(0, now - item.airingAt);
          const minutes = Math.floor(diffSeconds / 60);
          const hours = Math.floor(minutes / 60);
          const days = Math.floor(hours / 24);

          let timeAgoText = `${minutes}m ago`;
          if (days > 0) {
            timeAgoText = `${days}d ago`;
          } else if (hours > 0) {
            timeAgoText = `${hours}h ago`;
          }

          return {
            id: item.id,
            anilistId: media?.id,
            routeId,
            title,
            episode: item.episode,
            airingAt: item.airingAt,
            timeAgoText,
            thumbnail: media?.bannerImage || media?.coverImage?.extraLarge || media?.coverImage?.large,
            poster: media?.coverImage?.large,
            duration: media?.duration ? `${media.duration}m` : '24m',
            hasSub: true,
            hasDub: false,
          };
        });

        // 10-minute cache for live recent airing rail (refreshes frequently)
        await redisCache.set(cacheKey, result, 600);
        return result;
      },
      async () => []
    );
  }
}
