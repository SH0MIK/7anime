import { ArtworkResolution, AnimeTrailer } from '@7anime/shared';
import { AniListMedia } from '../providers/anilist.provider.js';
import { TmdbProvider, TmdbImagesResponse, TmdbVideo } from '../providers/tmdb.provider.js';
import { LogoResolverService } from './logo-resolver.service.js';

export interface ComprehensiveArtworkResult {
  artwork: {
    poster?: string;
    cover?: string;
    backdrop?: string;
    banner?: string;
    logo?: string;
  };
  trailer?: AnimeTrailer;
  resolution: ArtworkResolution;
}

export class ArtworkResolverService {
  /**
   * Resolves artwork independently for an anime from AniList media and optional TMDB data.
   */
  public static async resolveArtwork(
    media: AniListMedia,
    tmdbId?: number,
    mediaType?: 'tv' | 'movie'
  ): Promise<ComprehensiveArtworkResult> {
    // 1. Base artwork from AniList
    const anilistPoster = media.coverImage?.extraLarge || media.coverImage?.large;
    const anilistCover = media.coverImage?.large || media.coverImage?.medium;
    const anilistBanner = media.bannerImage || undefined;

    let anilistTrailer: AnimeTrailer | undefined = undefined;
    if (media.trailer && media.trailer.site?.toLowerCase() === 'youtube' && media.trailer.id) {
      anilistTrailer = {
        source: 'anilist',
        key: media.trailer.id,
        url: `https://www.youtube.com/watch?v=${media.trailer.id}`,
        site: 'youtube',
        official: true,
      };
    }

    let tmdbLogoUrl: string | undefined = undefined;
    let tmdbBackdropUrl: string | undefined = undefined;
    let tmdbPosterUrl: string | undefined = undefined;
    let tmdbTrailer: AnimeTrailer | undefined = undefined;

    // 2. Resolve TMDB artwork if TMDB ID is known
    if (tmdbId && mediaType) {
      try {
        const [images, videos] = await Promise.all([
          mediaType === 'movie' ? TmdbProvider.getMovieImages(tmdbId) : TmdbProvider.getTvImages(tmdbId),
          mediaType === 'movie' ? TmdbProvider.getMovieVideos(tmdbId) : TmdbProvider.getTvVideos(tmdbId),
        ]);

        if (images) {
          // Transparent PNG logo
          const logoResult = await LogoResolverService.resolveLogo(media.id, tmdbId, mediaType);
          if (logoResult?.logoUrl) {
            tmdbLogoUrl = logoResult.logoUrl;
          }

          // Best backdrop
          const bestBackdrop = TmdbProvider.extractBestBackdrop(images);
          if (bestBackdrop) {
            tmdbBackdropUrl = bestBackdrop;
          }

          // Best poster
          const bestPoster = TmdbProvider.extractBestPoster(images);
          if (bestPoster) {
            tmdbPosterUrl = bestPoster;
          }
        }

        // Best trailer
        const bestTrailer = TmdbProvider.extractBestTrailer(videos);
        if (bestTrailer) {
          tmdbTrailer = bestTrailer;
        }
      } catch (err) {
        console.warn(`[ArtworkResolverService] TMDB artwork fetch error for ${tmdbId}:`, (err as Error).message);
      }
    }

    // 3. Assemble final prioritized artwork fields
    // Logo: TMDB transparent logo ONLY (never AniList banner or fake logo)
    const finalLogo = tmdbLogoUrl;

    // Backdrop: TMDB high-res backdrop first, then AniList banner
    const finalBackdrop = tmdbBackdropUrl || anilistBanner;

    // Poster: AniList cover first (true to anime style), then TMDB poster
    const finalPoster = anilistPoster || tmdbPosterUrl || anilistCover;

    // Banner: AniList banner first, then TMDB backdrop
    const finalBanner = anilistBanner || tmdbBackdropUrl;

    // Cover: AniList cover
    const finalCover = anilistCover || anilistPoster || tmdbPosterUrl;

    // Trailer: TMDB official YouTube trailer first, then AniList trailer
    const finalTrailer = tmdbTrailer || anilistTrailer;

    const resolution: ArtworkResolution = {
      logo: finalLogo,
      logoSource: finalLogo ? 'tmdb' : 'none',
      backdrop: finalBackdrop,
      backdropSource: finalBackdrop === tmdbBackdropUrl ? 'tmdb' : finalBackdrop ? 'anilist' : 'fallback',
      poster: finalPoster,
      posterSource: finalPoster === anilistPoster ? 'anilist' : finalPoster === tmdbPosterUrl ? 'tmdb' : 'fallback',
      banner: finalBanner,
      bannerSource: finalBanner === anilistBanner ? 'anilist' : finalBanner ? 'tmdb' : 'fallback',
    };

    return {
      artwork: {
        poster: finalPoster,
        cover: finalCover,
        backdrop: finalBackdrop,
        banner: finalBanner,
        logo: finalLogo,
      },
      trailer: finalTrailer,
      resolution,
    };
  }
}
