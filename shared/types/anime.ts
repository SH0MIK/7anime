/**
 * Unified shared anime metadata types between 7Anime frontend and backend.
 */

export interface AnimeExternalIds {
  anilistId?: number;
  malId?: number;
  tmdbId?: number;
  imdbId?: string;
  omdbId?: string;
}

export interface AnimeLogoResult {
  logoUrl: string;
  aspectRatio: number;
  width: number;
  height: number;
  language: string | null;
  filePath: string;
  animeId?: number;
  provider?: 'tmdb' | 'anilist' | 'mal' | 'custom';
  providerMediaId?: number | string;
  artworkType?: 'official_logo' | 'transparent_title' | 'title_art';
  resolvedAt?: number;
  verificationStatus?: 'verified' | 'unverified' | 'rejected';
  verifiedTitle?: string;
}

export interface AnimeTitles {
  romaji?: string;
  english?: string;
  native?: string;
  synonyms: string[];
}

export interface AnimeRatings {
  anilist?: number; // 0-10 or 0-100
  mal?: number;     // 0-10
  tmdb?: number;    // 0-10
  imdb?: number;    // 0-10
}

export interface AnimeArtwork {
  poster?: string;
  cover?: string;
  backdrop?: string;
  banner?: string;
  logo?: string;
}

export interface AnimeTrailer {
  source: string; // 'youtube' | 'tmdb' | 'anilist'
  key?: string;
  url?: string;
  site?: string;
  type?: string; // 'Trailer' | 'Teaser' | 'Opening'
  official?: boolean;
}

export interface NextAiringEpisode {
  airingAt: number;
  timeUntilAiring: number;
  episode: number;
}

export interface ResolvedAnime {
  id: string; // Canonical identifier (AniList ID string)
  routeId: string; // URL-safe slug e.g. "one-piece-21"
  externalIds: AnimeExternalIds;
  titles: AnimeTitles;
  description?: string;
  format?: string; // TV, TV_SHORT, MOVIE, SPECIAL, OVA, ONA, MUSIC
  status?: string; // FINISHED, RELEASING, NOT_YET_RELEASED, CANCELLED, HIATUS
  season?: string; // WINTER, SPRING, SUMMER, FALL
  seasonYear?: number;
  startDate?: { year?: number; month?: number; day?: number };
  endDate?: { year?: number; month?: number; day?: number };
  episodes?: number; // Total announced episodes, or undefined if unknown
  duration?: number; // minutes per episode
  genres: string[];
  studios: string[];
  ratings: AnimeRatings;
  artwork: AnimeArtwork;
  trailer?: AnimeTrailer;
  metadataSources: string[];
  popularity?: number;
  isAdult?: boolean;
  nextAiringEpisode?: NextAiringEpisode;
}

export interface ArtworkResolution {
  logo?: string;
  logoSource?: 'tmdb' | 'anilist' | 'none';
  backdrop?: string;
  backdropSource?: 'tmdb' | 'anilist' | 'fallback';
  poster?: string;
  posterSource?: 'anilist' | 'tmdb' | 'mal' | 'fallback';
  banner?: string;
  bannerSource?: 'anilist' | 'tmdb' | 'fallback';
}

export interface AnimeSearchResult {
  items: ResolvedAnime[];
  total: number;
  page: number;
  hasMore: boolean;
}

export type EpisodeClassification = 'CANON' | 'MIXED' | 'FILLER' | 'UNKNOWN';

export interface VerifiedEpisode {
  number: number;
  title?: string;
  overview?: string;
  airDate?: string;
  duration?: number; // minutes
  thumbnail?: string;
  isFiller?: boolean;
  classification?: EpisodeClassification;
  classificationSource?: string;
  hasSub?: boolean;
  hasDub?: boolean;
  source: 'tmdb' | 'kitsu' | 'anilist' | 'official' | 'GENERATED_FALLBACK' | string;
  metadataVerified?: boolean;
  isPlayable?: boolean;
}

export type CatalogueCompleteness =
  | 'complete'
  | 'partial'
  | 'resolving'
  | 'provider_temporarily_unavailable'
  | 'mapping_required'
  | 'metadata_unavailable'
  | 'not_applicable'
  | 'unavailable'
  | 'fallback_generated';

export interface AnimeEpisodeCatalogue {
  anilistId: number;
  totalAnnouncedEpisodes: number | null; // null if unknown (e.g. One Piece)
  airedEpisodeCount: number;
  verifiedRecordsCount: number;
  completenessStatus: CatalogueCompleteness;
  nextUpcomingEpisode: NextAiringEpisode | null;
  hasEpisodeList: boolean;
  episodes: VerifiedEpisode[];
  source: string;
  playableEpisodeCount?: number;
}

export interface RecentAiredEpisodeItem {
  id: number; // airingSchedule id
  anilistId: number;
  routeId: string;
  title: string;
  episode: number;
  airingAt: number;
  timeAgoText?: string;
  thumbnail?: string;
  poster?: string;
  duration?: string;
  hasSub: boolean;
  hasDub: boolean;
}

export interface AiringScheduleItem {
  id: number; // AniList AiringSchedule ID
  anilistId: number;
  malId?: number | null;
  routeId: string;
  title: string;
  romajiTitle?: string;
  nativeTitle?: string;
  episode: number;
  airingAt: number; // UTC unix timestamp in seconds
  timeUntilAiring: number; // seconds remaining (negative if already aired)
  status: 'released' | 'upcoming' | 'delayed';
  poster: string;
  banner?: string | null;
  format?: string;
  genres: string[];
  score?: number | null;
  studios: string[];
  totalEpisodes?: number | null;
}

export interface WeeklyScheduleResponse {
  start: number; // UTC start timestamp
  end: number;   // UTC end timestamp
  timezone: string; // Default: 'Asia/Kolkata'
  items: AiringScheduleItem[];
  total: number;
}
