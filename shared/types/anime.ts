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
}

export interface AnimeTitles {
  romaji?: string;
  english?: string;
  native?: string;
  synonyms: string[];
}

export interface AnimeRatings {
  anilist?: number; // 0-100 or 0-10
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

export interface ResolvedAnime {
  id: string; // Canonical identifier (AniList ID string)
  routeId: string; // URL-safe slug e.g. "one-piece-1642"
  externalIds: AnimeExternalIds;
  titles: AnimeTitles;
  description?: string;
  format?: string; // TV, TV_SHORT, MOVIE, SPECIAL, OVA, ONA, MUSIC
  status?: string; // FINISHED, RELEASING, NOT_YET_RELEASED, CANCELLED, HIATUS
  season?: string; // WINTER, SPRING, SUMMER, FALL
  seasonYear?: number;
  episodes?: number;
  duration?: number; // minutes per episode
  genres: string[];
  studios: string[];
  ratings: AnimeRatings;
  artwork: AnimeArtwork;
  trailer?: AnimeTrailer;
  metadataSources: string[];
  popularity?: number;
  isAdult?: boolean;
  nextAiringEpisode?: {
    airingAt: number;
    timeUntilAiring: number;
    episode: number;
  };
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
