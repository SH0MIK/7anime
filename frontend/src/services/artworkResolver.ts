import type { ResolvedAnime, ArtworkResolution, AnimeTrailer } from '@7anime/shared';
import { apiClient } from './apiClient';

export interface ComprehensiveArtwork {
  logo?: string;
  logoSource: 'tmdb' | 'anilist' | 'none';
  backdrop?: string;
  backdropSource: 'tmdb' | 'anilist' | 'fallback';
  poster: string;
  posterSource: 'anilist' | 'tmdb' | 'mal' | 'fallback';
  banner?: string;
  bannerSource: 'anilist' | 'tmdb' | 'fallback';
  trailer?: AnimeTrailer;
  trailerSource: 'tmdb' | 'anilist' | 'none';
}

const artworkMemoryCache = new Map<string, { data: ComprehensiveArtwork; timestamp: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

export class ArtworkResolver {
  /**
   * Resolves artwork and cinematic assets for a resolved anime record.
   */
  public static resolve(resolved: ResolvedAnime): ComprehensiveArtwork {
    const cacheKey = `resolved_art:${resolved.id}`;
    const cached = artworkMemoryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }

    // 1. Logo Resolution: TMDB transparent PNG first, else undefined/none
    let logo: string | undefined = undefined;
    let logoSource: ComprehensiveArtwork['logoSource'] = 'none';

    if (resolved.artwork.logo && resolved.artwork.logo.startsWith('http')) {
      logo = resolved.artwork.logo;
      logoSource = resolved.artwork.logo.includes('themoviedb.org') ? 'tmdb' : 'anilist';
    }

    // 2. Backdrop Resolution: TMDB backdrop first, then AniList banner, else undefined
    let backdrop: string | undefined = undefined;
    let backdropSource: ComprehensiveArtwork['backdropSource'] = 'fallback';

    if (resolved.artwork.backdrop && resolved.artwork.backdrop.startsWith('http')) {
      backdrop = resolved.artwork.backdrop;
      backdropSource = resolved.artwork.backdrop.includes('themoviedb.org')
        ? 'tmdb'
        : 'anilist';
    } else if (resolved.artwork.banner && resolved.artwork.banner.startsWith('http')) {
      backdrop = resolved.artwork.banner;
      backdropSource = 'anilist';
    }

    // 3. Poster Resolution: AniList cover first, then TMDB poster, fallback to available poster
    let poster = resolved.artwork.poster || resolved.artwork.cover || '';
    let posterSource: ComprehensiveArtwork['posterSource'] = 'fallback';

    if (resolved.artwork.cover && resolved.artwork.cover.startsWith('http')) {
      poster = resolved.artwork.cover;
      posterSource = 'anilist';
    } else if (resolved.artwork.poster && resolved.artwork.poster.startsWith('http')) {
      poster = resolved.artwork.poster;
      posterSource = resolved.artwork.poster.includes('themoviedb.org') ? 'tmdb' : 'anilist';
    }

    // 4. Banner Resolution: AniList banner first, then backdrop
    let banner: string | undefined = undefined;
    let bannerSource: ComprehensiveArtwork['bannerSource'] = 'fallback';

    if (resolved.artwork.banner && resolved.artwork.banner.startsWith('http')) {
      banner = resolved.artwork.banner;
      bannerSource = 'anilist';
    } else if (backdrop) {
      banner = backdrop;
      bannerSource = backdropSource;
    }

    // 5. Trailer Resolution: TMDB official YouTube trailer first, then AniList trailer
    let trailer: AnimeTrailer | undefined = undefined;
    let trailerSource: ComprehensiveArtwork['trailerSource'] = 'none';

    if (resolved.trailer && resolved.trailer.key) {
      trailer = resolved.trailer;
      trailerSource = resolved.trailer.source === 'tmdb' ? 'tmdb' : 'anilist';
    }

    const result: ComprehensiveArtwork = {
      logo,
      logoSource,
      backdrop,
      backdropSource,
      poster,
      posterSource,
      banner,
      bannerSource,
      trailer,
      trailerSource,
    };

    artworkMemoryCache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  }

  /**
   * Asynchronously fetches and resolves artwork for an AniList ID via API.
   */
  public static async fetchAndResolve(anilistId: number | string): Promise<ComprehensiveArtwork | null> {
    const resolved = await apiClient.getAnimeById(anilistId);
    if (!resolved) return null;
    return this.resolve(resolved);
  }
}
