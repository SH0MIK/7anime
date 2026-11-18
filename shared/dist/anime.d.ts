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
    anilist?: number;
    mal?: number;
    tmdb?: number;
    imdb?: number;
}
export interface AnimeArtwork {
    poster?: string;
    cover?: string;
    backdrop?: string;
    banner?: string;
    logo?: string;
}
export interface AnimeTrailer {
    source: string;
    key?: string;
    url?: string;
    site?: string;
    type?: string;
    official?: boolean;
}
export interface ResolvedAnime {
    id: string;
    routeId: string;
    externalIds: AnimeExternalIds;
    titles: AnimeTitles;
    description?: string;
    format?: string;
    status?: string;
    season?: string;
    seasonYear?: number;
    episodes?: number;
    duration?: number;
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
