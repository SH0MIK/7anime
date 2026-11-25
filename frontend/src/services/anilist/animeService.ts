import { anilistClient } from './client';
import {
  HOMEPAGE_SECTIONS_QUERY,
  ANIME_DETAILS_QUERY,
  ANIME_BY_MAL_ID_QUERY,
  BROWSE_ANIME_QUERY,
  SEARCH_PREVIEW_QUERY,
  STUDIO_MEDIA_QUERY,
  WEEKLY_AIRING_SCHEDULE_QUERY,
} from './queries';
import { normalizeAniListMedia, slugifyTitle } from './normalizers';
import type {
  AniListMedia,
  AniListMediaSeason,
  AniListMediaFormat,
  AniListMediaStatus,
  AniListPageInfo,
} from './types';
import type { AnimeTitle, BrowseFilters } from '@/src/types/anime';
import type { AiringScheduleItem } from '@7anime/shared';

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
  public static async getAnimeDetails(id: number, forceRefresh = false): Promise<AnimeDetailResult | null> {
    const data = await anilistClient.query<{ Media: AniListMedia | null }>(
      ANIME_DETAILS_QUERY,
      { id },
      { ttlMs: 30 * 60 * 1000, forceRefresh }
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
   * Resolves canonical AniList ID from a verified MyAnimeList ID.
   * Ensures providers requiring AniList IDs never receive a raw MAL ID by mistake.
   */
  public static async resolveAniListIdByMalId(malId: number): Promise<number | null> {
    if (!Number.isInteger(malId) || malId <= 0) return null;
    try {
      const data = await anilistClient.query<{ Media: { id: number; idMal?: number | null } | null }>(
        ANIME_BY_MAL_ID_QUERY,
        { malId },
        { ttlMs: 24 * 60 * 60 * 1000 }
      );
      const resolvedId = data.Media?.id;
      return typeof resolvedId === 'number' && Number.isInteger(resolvedId) && resolvedId > 0
        ? resolvedId
        : null;
    } catch (err) {
      console.warn(`[AniListService] Failed to map MAL ID ${malId} -> AniList ID:`, err);
      return null;
    }
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

    // 1. Studio Resolution: Resolve verified studio anime IDs
    if (filters.studio && filters.studio.trim() && filters.studio.toLowerCase() !== 'all') {
      const studioName = filters.studio.trim();
      try {
        const studioData = await anilistClient.query<{
          Studio?: {
            id: number;
            name: string;
            media?: {
              nodes?: Array<{ id: number }>;
            };
          };
        }>(STUDIO_MEDIA_QUERY, { studio: studioName }, { ttlMs: 24 * 60 * 60 * 1000 });

        const studioNodes = studioData.Studio?.media?.nodes || [];
        const studioIds = Array.from(new Set(studioNodes.map((n) => n.id)));
        if (studioIds.length > 0) {
          variables.id_in = studioIds;
        } else {
          variables.id_in = [-1]; // Explicitly empty result if studio has no verified media
        }
      } catch (err) {
        console.warn(`[AniListService] Studio resolution failed for "${studioName}":`, err);
      }
    }

    // 2. Official AniList Genres vs Tags Separation
    const ANILIST_GENRES = new Set([
      'Action', 'Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy', 'Horror',
      'Mahou Shoujo', 'Mecha', 'Music', 'Mystery', 'Psychological', 'Romance',
      'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller',
    ]);

    const validGenres: string[] = [];
    const extraTags: string[] = [];
    (filters.genres || []).forEach((g) => {
      const trimmed = g.trim();
      if (!trimmed) return;
      const matched = Array.from(ANILIST_GENRES).find(
        (og) => og.toLowerCase() === trimmed.toLowerCase()
      );
      if (matched) {
        validGenres.push(matched);
      } else {
        extraTags.push(trimmed);
      }
    });

    if (validGenres.length > 0) {
      variables.genre_in = validGenres;
    }

    const combinedTags = Array.from(new Set([...(filters.tags || []), ...extraTags]));
    if (combinedTags.length > 0) {
      variables.tag_in = combinedTags;
    }

    // 3. Season
    if (filters.season && filters.season !== 'all') {
      variables.season = filters.season.toUpperCase() as AniListMediaSeason;
    }

    // 4. Release Year
    if (filters.year && filters.year !== 'all') {
      const parsedYear = parseInt(filters.year, 10);
      if (!isNaN(parsedYear) && parsedYear > 1950) {
        variables.seasonYear = parsedYear;
      }
    }

    // 5. Airing Status
    if (filters.status && filters.status !== 'all') {
      const statusMap: Record<string, AniListMediaStatus> = {
        releasing: 'RELEASING',
        airing: 'RELEASING',
        finished: 'FINISHED',
        completed: 'FINISHED',
        upcoming: 'NOT_YET_RELEASED',
        cancelled: 'CANCELLED',
        hiatus: 'HIATUS',
      };
      const key = filters.status.toLowerCase();
      if (statusMap[key]) {
        variables.status = statusMap[key];
      }
    }

    // 6. Media Format
    if (filters.format && filters.format !== 'all') {
      const formatMap: Record<string, AniListMediaFormat> = {
        tv: 'TV',
        movie: 'MOVIE',
        ova: 'OVA',
        ona: 'ONA',
        special: 'SPECIAL',
        music: 'MUSIC',
      };
      const key = filters.format.toLowerCase();
      if (formatMap[key]) {
        variables.format = formatMap[key];
      }
    }

    // 7. Advanced Filters: Min Score & Min Episodes
    if (filters.minScore) {
      const scoreNum = parseFloat(filters.minScore);
      if (!isNaN(scoreNum) && scoreNum > 0) {
        // AniList averageScore is an integer on 0-100 scale (e.g. 7.0 -> 70, 7.5 -> 75, 8.0 -> 80)
        variables.averageScore_greater = Math.round(scoreNum * 10);
      }
    }

    if (filters.minEpisodes) {
      const epNum = parseInt(filters.minEpisodes, 10);
      if (!isNaN(epNum) && epNum > 0) {
        variables.episodes_greater = Math.max(1, epNum - 1);
      }
    }

    // 8. Sorting
    const sortMap: Record<string, string[]> = {
      recommended: ['POPULARITY_DESC', 'SCORE_DESC'],
      popular: ['POPULARITY_DESC'],
      trending: ['TRENDING_DESC'],
      score: ['SCORE_DESC'],
      mal: ['SCORE_DESC'],
      newest: ['START_DATE_DESC'],
      title: ['TITLE_ROMAJI'],
      episodes: ['EPISODES_DESC'],
      sub: ['POPULARITY_DESC'],
      dub: ['POPULARITY_DESC'],
    };

    const sortKey = (filters.sort || 'popular').toLowerCase();
    variables.sort = sortMap[sortKey] || ['POPULARITY_DESC'];

    const data = await anilistClient.query<{
      Page: {
        pageInfo: AniListPageInfo;
        media: AniListMedia[];
      };
    }>(BROWSE_ANIME_QUERY, variables, { ttlMs: 10 * 60 * 1000 });

    let items = (data.Page?.media || []).map(normalizeAniListMedia);

    // 9. Language Filter Post-processing
    if (filters.language === 'sub') {
      items = items.filter((item) => item.subCount > 0);
    } else if (filters.language === 'dub') {
      items = items.filter((item) => item.dubCount > 0);
    }

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
   * Fetches the weekly airing schedule directly from AniList with 10-minute caching.
   */
  public static async getWeeklySchedule(
    start: number,
    end: number,
    page = 1,
    perPage = 50
  ): Promise<{ items: AiringScheduleItem[]; total: number }> {
    const data = await anilistClient.query<{
      Page: {
        pageInfo: AniListPageInfo;
        airingSchedules: Array<{
          id: number;
          airingAt: number;
          timeUntilAiring: number;
          episode: number;
          media: AniListMedia;
        }>;
      };
    }>(
      WEEKLY_AIRING_SCHEDULE_QUERY,
      { start, end, page, perPage },
      { ttlMs: 10 * 60 * 1000 }
    );

    const now = Math.floor(Date.now() / 1000);
    const rawList = data.Page?.airingSchedules || [];
    const total = data.Page?.pageInfo?.total || rawList.length;

    const items: AiringScheduleItem[] = rawList.map((item) => {
      const media = item.media;
      const eng = media.title?.english?.trim();
      const rom = media.title?.romaji?.trim();
      const nat = media.title?.native?.trim();
      const title = eng || rom || 'Anime';
      const slug = slugifyTitle(title) || `anime-${media.id}`;
      const routeId = `${slug}-${media.id}`;

      let status: 'released' | 'upcoming' | 'delayed' = 'upcoming';
      if (item.airingAt <= now) {
        status = 'released';
      } else if (media.status === 'CANCELLED' || media.status === 'HIATUS') {
        status = 'delayed';
      }

      const studios = (media.studios?.nodes || []).map((s) => s.name).filter(Boolean);

      return {
        id: item.id,
        anilistId: media.id,
        malId: media.idMal || null,
        routeId,
        title,
        romajiTitle: rom || undefined,
        nativeTitle: nat || undefined,
        episode: item.episode,
        airingAt: item.airingAt,
        timeUntilAiring: item.airingAt - now,
        status,
        poster:
          media.coverImage?.extraLarge ||
          media.coverImage?.large ||
          media.coverImage?.medium ||
          '',
        banner: media.bannerImage || null,
        format: media.format || 'TV',
        genres: media.genres || [],
        score: media.averageScore !== null && media.averageScore !== undefined
          ? Number((media.averageScore / 10).toFixed(1))
          : null,
        studios,
        totalEpisodes: media.episodes || null,
      };
    });

    return { items, total };
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
