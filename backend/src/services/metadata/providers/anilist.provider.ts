import { HttpClient } from '../../../utils/httpClient.js';
import { metadataCache } from '../../cache/memory-cache.service.js';

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
`;

export class AniListProvider {
  /**
   * Fetches full anime details by AniList ID.
   */
  public static async getAnimeById(anilistId: number): Promise<AniListMedia | null> {
    const cacheKey = `anilist:anime:${anilistId}`;
    const cached = metadataCache.get<AniListMedia>(cacheKey);
    if (cached) {
      return cached;
    }

    const query = `
      query GetAnimeDetails($id: Int) {
        Media(id: $id, type: ANIME) {
          ${MEDIA_FRAGMENT}
        }
      }
    `;

    try {
      const response = await HttpClient.post<{ data?: { Media?: AniListMedia }; errors?: any[] }>(
        ANILIST_GRAPHQL_URL,
        {
          query,
          variables: { id: anilistId },
        }
      );

      if (response.errors && response.errors.length > 0) {
        console.warn(`[AniListProvider] GraphQL error for ID ${anilistId}:`, response.errors[0].message);
        return null;
      }

      const media = response.data?.Media || null;
      if (media) {
        metadataCache.set(cacheKey, media, 60 * 60 * 1000); // 1 hour
      }

      return media;
    } catch (err) {
      console.error(`[AniListProvider] Failed to fetch anime ID ${anilistId}:`, (err as Error).message);
      return null;
    }
  }

  /**
   * Searches anime by text query with pagination.
   */
  public static async searchAnime(
    searchQuery: string,
    page: number = 1,
    perPage: number = 20
  ): Promise<AniListSearchResponse> {
    const cacheKey = `anilist:search:${searchQuery.toLowerCase().trim()}:${page}:${perPage}`;
    const cached = metadataCache.get<AniListSearchResponse>(cacheKey);
    if (cached) {
      return cached;
    }

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

    try {
      const response = await HttpClient.post<{
        data?: {
          Page?: {
            pageInfo: AniListSearchResponse['pageInfo'];
            media: AniListMedia[];
          };
        };
        errors?: any[];
      }>(ANILIST_GRAPHQL_URL, {
        query,
        variables: {
          search: searchQuery,
          page,
          perPage,
        },
      });

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

      metadataCache.set(cacheKey, result, 15 * 60 * 1000); // 15 mins cache
      return result;
    } catch (err) {
      console.error(`[AniListProvider] Failed to search anime "${searchQuery}":`, (err as Error).message);
      return {
        pageInfo: { total: 0, currentPage: page, lastPage: 1, hasNextPage: false, perPage },
        media: [],
      };
    }
  }

  /**
   * Fetches trending anime.
   */
  public static async getTrendingAnime(page: number = 1, perPage: number = 10): Promise<AniListMedia[]> {
    const cacheKey = `anilist:trending:${page}:${perPage}`;
    const cached = metadataCache.get<AniListMedia[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const query = `
      query GetTrending($page: Int, $perPage: Int) {
        Page(page: $page, perPage: $perPage) {
          media(type: ANIME, sort: [TRENDING_DESC, POPULARITY_DESC]) {
            ${MEDIA_FRAGMENT}
          }
        }
      }
    `;

    try {
      const response = await HttpClient.post<{ data?: { Page?: { media: AniListMedia[] } } }>(
        ANILIST_GRAPHQL_URL,
        {
          query,
          variables: { page, perPage },
        }
      );

      const media = response.data?.Page?.media || [];
      metadataCache.set(cacheKey, media, 30 * 60 * 1000); // 30 mins
      return media;
    } catch (err) {
      console.error(`[AniListProvider] Failed to fetch trending anime:`, (err as Error).message);
      return [];
    }
  }
}
