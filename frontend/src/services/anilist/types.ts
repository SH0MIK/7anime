/**
 * AniList GraphQL API Type Definitions
 */

export type AniListMediaFormat =
  | 'TV'
  | 'TV_SHORT'
  | 'MOVIE'
  | 'SPECIAL'
  | 'OVA'
  | 'ONA'
  | 'MUSIC'
  | 'MANGA'
  | 'NOVEL'
  | 'ONE_SHOT';

export type AniListMediaStatus =
  | 'FINISHED'
  | 'RELEASING'
  | 'NOT_YET_RELEASED'
  | 'CANCELLED'
  | 'HIATUS';

export type AniListMediaSeason = 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';

export type AniListMediaSort =
  | 'ID'
  | 'ID_DESC'
  | 'TITLE_ROMAJI'
  | 'TITLE_ROMAJI_DESC'
  | 'TITLE_ENGLISH'
  | 'TITLE_ENGLISH_DESC'
  | 'START_DATE'
  | 'START_DATE_DESC'
  | 'END_DATE'
  | 'END_DATE_DESC'
  | 'SCORE'
  | 'SCORE_DESC'
  | 'POPULARITY'
  | 'POPULARITY_DESC'
  | 'TRENDING'
  | 'TRENDING_DESC'
  | 'EPISODES'
  | 'EPISODES_DESC'
  | 'DURATION'
  | 'DURATION_DESC'
  | 'STATUS'
  | 'STATUS_DESC'
  | 'UPDATED_AT'
  | 'UPDATED_AT_DESC'
  | 'FAVOURITES'
  | 'FAVOURITES_DESC';

export interface AniListTitle {
  romaji: string;
  english: string | null;
  native: string | null;
}

export interface AniListCoverImage {
  extraLarge: string | null;
  large: string | null;
  medium: string | null;
  color: string | null;
}

export interface AniListFuzzyDate {
  year: number | null;
  month: number | null;
  day: number | null;
}

export interface AniListTrailer {
  id: string | null;
  site: string | null;
  thumbnail: string | null;
}

export interface AniListTag {
  id: number;
  name: string;
  description?: string | null;
  category?: string;
  rank?: number;
  isGeneralSpoiler?: boolean;
  isMediaSpoiler?: boolean;
}

export interface AniListStudioNode {
  id: number;
  name: string;
  isAnimationStudio: boolean;
}

export interface AniListAiringSchedule {
  id: number;
  airingAt: number;
  timeUntilAiring: number;
  episode: number;
}

export interface AniListCharacterNode {
  id: number;
  name: {
    full: string;
    native: string | null;
  };
  image: {
    medium: string | null;
  } | null;
}

export interface AniListCharacterEdge {
  role: string;
  node: AniListCharacterNode;
}

export interface AniListRelationNode {
  id: number;
  type: string;
  format: AniListMediaFormat | null;
  status: AniListMediaStatus | null;
  title: AniListTitle;
  coverImage: AniListCoverImage | null;
  bannerImage: string | null;
  averageScore: number | null;
  episodes: number | null;
}

export interface AniListRelationEdge {
  id: number;
  relationType: string;
  node: AniListRelationNode;
}

export interface AniListRecommendationNode {
  id: number;
  rating: number;
  mediaRecommendation: AniListRelationNode | null;
}

export interface AniListMedia {
  id: number;
  idMal: number | null;
  title: AniListTitle;
  synonyms: string[];
  description: string | null;
  format: AniListMediaFormat | null;
  status: AniListMediaStatus | null;
  season: AniListMediaSeason | null;
  seasonYear: number | null;
  episodes: number | null;
  duration: number | null;
  source: string | null;
  countryOfOrigin: string | null;
  hashtag: string | null;
  trailer: AniListTrailer | null;
  updatedAt: number | null;
  coverImage: AniListCoverImage | null;
  bannerImage: string | null;
  genres: string[];
  averageScore: number | null;
  meanScore: number | null;
  popularity: number | null;
  trending: number | null;
  favourites: number | null;
  tags?: AniListTag[];
  studios?: {
    nodes: AniListStudioNode[];
  };
  startDate?: AniListFuzzyDate;
  endDate?: AniListFuzzyDate;
  nextAiringEpisode?: AniListAiringSchedule | null;
  relations?: {
    edges: AniListRelationEdge[];
  };
  recommendations?: {
    nodes: AniListRecommendationNode[];
  };
  characters?: {
    edges: AniListCharacterEdge[];
  };
}

export interface AniListPageInfo {
  total: number;
  perPage: number;
  currentPage: number;
  lastPage: number;
  hasNextPage: boolean;
}

export interface AniListPageResponse {
  pageInfo: AniListPageInfo;
  media: AniListMedia[];
}

export interface AniListGraphQLResponse<T> {
  data?: T;
  errors?: Array<{
    message: string;
    status?: number;
    locations?: Array<{ line: number; column: number }>;
  }>;
}
