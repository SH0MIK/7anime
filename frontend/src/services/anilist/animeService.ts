import { anilistClient } from './client';
import {
  HOMEPAGE_SECTIONS_QUERY,
  ANIME_DETAILS_QUERY,
  BROWSE_ANIME_QUERY,
  SEARCH_PREVIEW_QUERY,
} from './queries';
import { normalizeAniListMedia } from './normalizers';
import type {
  AniListMedia,
  AniListMediaSeason,
  AniListMediaFormat,
  AniListMediaStatus,
  AniListPageInfo,
} from './types';
import type { AnimeTitle, BrowseFilters } from '@/src/types/anime';

export interface HomepageFeedData {
  spotlight: AnimeTitle[];
  trending: AnimeTitle[];
  popular: AnimeTitle[];
  airing: AnimeTitle[];
  topRated: AnimeTitle[];
  seasonal: AnimeTitle[];
  movies: AnimeTitle[];
  upcoming: AnimeTitle[];
  currentSeason: AniListMediaSeason;
  currentYear: number;
}

export interface BrowseResult {
  items: AnimeTitle[];
  pageInfo: AniListPageInfo;
}

export interface AnimeDetailResult {
  anime: AnimeTitle;
  rawMedia: AniListMedia;
  related: AnimeTitle[];
  recommendations: AnimeTitle[];
}

export class AniListService {
  /**
   * Helper to determine current anime broadcast season.
   */
  public static getCurrentSeason(): { season: AniListMediaSeason; year: number } {
    const now = new Date();
    const month = now.getMonth(); // 0 = Jan, 11 = Dec
    const year = now.getFullYear();

    let season: AniListMediaSeason = 'WINTER';
    if (month >= 0 && month <= 2) season = 'WINTER';
    else if (month >= 3 && month <= 5) season = 'SPRING';
    else if (month >= 6 && month <= 8) season = 'SUMMER';
    else season = 'FALL';

    return { season, year };
  }

  /**
   * Fetches all homepage sections in a single batched GraphQL query.
   */
  public static async getHomepageFeed(): Promise<HomepageFeedData> {
    const { season, year } = this.getCurrentSeason();

    const data = await anilistClient.query<{
      spotlight: { media: AniListMedia[] };
      trending: { media: AniListMedia[] };
      popular: { media: AniListMedia[] };
      airing: { media: AniListMedia[] };
      topRated: { media: AniListMedia[] };
      seasonal: { media: AniListMedia[] };
      movies: { media: AniListMedia[] };
      upcoming: { media: AniListMedia[] };
    }>(
      HOMEPAGE_SECTIONS_QUERY,
      { season, seasonYear: year },
      { ttlMs: 30 * 60 * 1000 } // 30 minutes cache
    );

    return {
      spotlight: (data.spotlight?.media || []).map(normalizeAniListMedia),
      trending: (data.trending?.media || []).map(normalizeAniListMedia),
      popular: (data.popular?.media || []).map(normalizeAniListMedia),
      airing: (data.airing?.media || []).map(normalizeAniListMedia),
      topRated: (data.topRated?.media || []).map(normalizeAniListMedia),
      seasonal: (data.seasonal?.media || []).map(normalizeAniListMedia),
      movies: (data.movies?.media || []).map(normalizeAniListMedia),
      upcoming: (data.upcoming?.media || []).map(normalizeAniListMedia),
      currentSeason: season,
      currentYear: year,
    };
  }

  /**
   * Fetches full anime details by AniList ID including relations & recommendations.
   */
  public static async getAnimeDetails(id: number): Promise<AnimeDetailResult | null> {
    const data = await anilistClient.query<{ Media: AniListMedia | null }>(
      ANIME_DETAILS_QUERY,
      { id },
      { ttlMs: 30 * 60 * 1000 }
    );

    if (!data.Media) return null;

    const anime = normalizeAniListMedia(data.Media);

    // Extract relations
    const related: AnimeTitle[] = (data.Media.relations?.edges || [])
      .filter((edge) => edge.node && edge.node.id)
      .map((edge) => normalizeAniListMedia(edge.node as unknown as AniListMedia));

    // Extract recommendations
    const recommendations: AnimeTitle[] = (data.Media.recommendations?.nodes || [])
      .filter((rec) => rec.mediaRecommendation && rec.mediaRecommendation.id)
      .map((rec) => normalizeAniListMedia(rec.mediaRecommendation as unknown as AniListMedia));

    return {
      anime,
      rawMedia: data.Media,
      related,
      recommendations,
    };
  }

  /**
   * Browse and search anime with multi-facet filtering and pagination.
   */
  public static async browseAnime(
    filters: Partial<BrowseFilters>,
    page = 1,
    perPage = 24
  ): Promise<BrowseResult> {
    const variables: Record<string, any> = {
      page,
      perPage,
    };

    if (filters.q && filters.q.trim()) {
      variables.search = filters.q.trim();
    }

    if (filters.genres && filters.genres.length > 0) {
      variables.genre_in = filters.genres;
    }

    if (filters.tags && filters.tags.length > 0) {
      variables.tag_in = filters.tags;
    }

    if (filters.season && filters.season !== 'all') {
      variables.season = filters.season.toUpperCase() as AniListMediaSeason;
    }

    if (filters.year && filters.year !== 'all') {
      const parsedYear = parseInt(filters.year, 10);
      if (!isNaN(parsedYear)) {
        variables.seasonYear = parsedYear;
      }
    }

    if (filters.status && filters.status !== 'all') {
      const statusMap: Record<string, AniListMediaStatus> = {
        releasing: 'RELEASING',
        airing: 'RELEASING',
        finished: 'FINISHED',
        completed: 'FINISHED',
        upcoming: 'NOT_YET_RELEASED',
        cancelled: 'CANCELLED',
      };
      const key = filters.status.toLowerCase();
      if (statusMap[key]) {
        variables.status = statusMap[key];
      }
    }

    if (filters.format && filters.format !== 'all') {
      const formatMap: Record<string, AniListMediaFormat> = {
        tv: 'TV',
        movie: 'MOVIE',
        ova: 'OVA',
        ona: 'ONA',
        special: 'SPECIAL',
      };
      const key = filters.format.toLowerCase();
      if (formatMap[key]) {
        variables.format = formatMap[key];
      }
    }

    // Sort mapping
    const sortMap: Record<string, string[]> = {
      trending: ['TRENDING_DESC'],
      popular: ['POPULARITY_DESC'],
      score: ['SCORE_DESC'],
      newest: ['START_DATE_DESC'],
      title: ['TITLE_ROMAJI'],
      episodes: ['EPISODES_DESC'],
      recommended: ['POPULARITY_DESC', 'SCORE_DESC'],
    };

    const sortKey = (filters.sort || 'popular').toLowerCase();
    variables.sort = sortMap[sortKey] || ['POPULARITY_DESC'];

    const data = await anilistClient.query<{
      Page: {
        pageInfo: AniListPageInfo;
        media: AniListMedia[];
      };
    }>(BROWSE_ANIME_QUERY, variables, { ttlMs: 10 * 60 * 1000 });

    const items = (data.Page?.media || []).map(normalizeAniListMedia);
    const pageInfo = data.Page?.pageInfo || {
      total: 0,
      perPage,
      currentPage: page,
      lastPage: 1,
      hasNextPage: false,
    };

    return { items, pageInfo };
  }

  /**
   * Fast search preview for search modal autocomplete.
   */
  public static async searchPreview(search: string, limit = 8): Promise<AnimeTitle[]> {
    if (!search || !search.trim()) return [];

    const data = await anilistClient.query<{
      Page: { media: AniListMedia[] };
    }>(
      SEARCH_PREVIEW_QUERY,
      { search: search.trim(), perPage: limit },
      { ttlMs: 5 * 60 * 1000 }
    );

    return (data.Page?.media || []).map(normalizeAniListMedia);
  }
}
