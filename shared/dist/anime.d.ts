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
export interface NextAiringEpisode {
    airingAt: number;
    timeUntilAiring: number;
    episode: number;
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
    startDate?: {
        year?: number;
        month?: number;
        day?: number;
    };
    endDate?: {
        year?: number;
        month?: number;
        day?: number;
    };
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
    duration?: number;
    thumbnail?: string;
    isFiller?: boolean;
    classification?: EpisodeClassification;
    classificationSource?: string;
    hasSub?: boolean;
    hasDub?: boolean;
    source: 'tmdb' | 'kitsu' | 'anilist' | 'official' | string;
}
export type CatalogueCompleteness = 'complete' | 'partial' | 'resolving' | 'provider_temporarily_unavailable' | 'mapping_required' | 'metadata_unavailable' | 'not_applicable' | 'unavailable';
export interface AnimeEpisodeCatalogue {
    anilistId: number;
    totalAnnouncedEpisodes: number | null;
    airedEpisodeCount: number;
    verifiedRecordsCount: number;
    completenessStatus: CatalogueCompleteness;
    nextUpcomingEpisode: NextAiringEpisode | null;
    hasEpisodeList: boolean;
    episodes: VerifiedEpisode[];
    source: string;
}
export interface RecentAiredEpisodeItem {
    id: number;
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
