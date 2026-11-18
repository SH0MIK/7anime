import { ResolvedAnime, ArtworkResolution, AnimeTrailer } from '@7anime/shared';
import { AniListProvider, AniListMedia } from '../providers/anilist.provider.js';
import { TmdbProvider } from '../providers/tmdb.provider.js';
import { ExternalIdResolverService, ResolvedExternalIds } from './external-id-resolver.service.js';
import { LogoResolverService } from './logo-resolver.service.js';
import { ArtworkResolverService } from './artwork-resolver.service.js';
import { redisCache } from '../../cache/redis-cache.service.js';

export class AnimeResolverService {
  /**
   * Generates a URL-safe route slug from title and ID.
   * e.g. "One Piece", 21 -> "one-piece-21"
   */
  public static generateRouteId(title: string, id: number): string {
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `${slug || 'anime'}-${id}`;
  }

  /**
   * Sanitizes description string (strips basic HTML tags if any).
   */
  public static cleanDescription(desc?: string): string | undefined {
    if (!desc) return undefined;
    return desc
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?[^>]+(>|$)/g, '')
      .trim();
  }

  /**
   * Resolves a complete ResolvedAnime record by AniList ID.
   */
  public static async resolveById(anilistId: number): Promise<ResolvedAnime | null> {
    const cacheKey = `resolved:anime:${anilistId}`;
    const cached = await redisCache.get<ResolvedAnime>(cacheKey);
    if (cached) {
      return cached;
    }

    const anilistMedia = await AniListProvider.getAnimeById(anilistId);
    if (!anilistMedia) {
      return null;
    }

    const resolved = await this.resolveMedia(anilistMedia);
    if (resolved) {
      void redisCache.set(cacheKey, resolved, 86400); // 24 hours
    }

    return resolved;
  }

  /**
   * Resolves AniList media object + TMDB enrichment into a fully typed ResolvedAnime entity.
   */
  public static async resolveMedia(media: AniListMedia): Promise<ResolvedAnime> {
    const primaryTitle = media.title.english || media.title.romaji || 'Anime';
    const routeId = this.generateRouteId(primaryTitle, media.id);

    // 1. Resolve External IDs (AniList, MAL, TMDB, IMDb, OMDb)
    const extIds = await ExternalIdResolverService.resolveFromMedia(media);

    // 2. Resolve Artwork (Logo, Backdrop, Poster, Banner, Trailer)
    const artResult = await ArtworkResolverService.resolveArtwork(
      media,
      extIds.tmdbId,
      extIds.mediaType
    );

    // 3. Resolve Ratings
    let tmdbRating: number | undefined = undefined;
    if (extIds.tmdbId && extIds.mediaType) {
      try {
        const details = extIds.mediaType === 'movie'
          ? await TmdbProvider.getMovieDetails(extIds.tmdbId)
          : await TmdbProvider.getTvDetails(extIds.tmdbId);

        if (details?.vote_average && details.vote_average > 0) {
          tmdbRating = Number(details.vote_average.toFixed(1));
        }
      } catch {
        // Non-fatal
      }
    }

    const metadataSources: string[] = ['anilist'];
    if (extIds.tmdbId) metadataSources.push('tmdb');
    if (extIds.imdbId) metadataSources.push('imdb');
    if (extIds.malId) metadataSources.push('mal');

    const resolved: ResolvedAnime = {
      id: String(media.id),
      routeId,
      externalIds: {
        anilistId: extIds.anilistId,
        malId: extIds.malId,
        tmdbId: extIds.tmdbId,
        imdbId: extIds.imdbId,
        omdbId: extIds.omdbId,
      },
      titles: {
        romaji: media.title.romaji,
        english: media.title.english,
        native: media.title.native,
        synonyms: media.synonyms || [],
      },
      description: this.cleanDescription(media.description),
      format: media.format || 'TV',
      status: media.status || 'UNKNOWN',
      season: media.season || undefined,
      seasonYear: media.seasonYear || undefined,
      episodes: media.episodes || undefined,
      duration: media.duration || undefined,
      genres: media.genres || [],
      studios: (media.studios?.nodes || []).map((s) => s.name),
      ratings: {
        anilist: media.averageScore ? Number((media.averageScore / 10).toFixed(1)) : undefined,
        tmdb: tmdbRating,
        imdb: undefined,
      },
      artwork: artResult.artwork,
      trailer: artResult.trailer,
      metadataSources,
      popularity: media.popularity,
      isAdult: media.isAdult,
      nextAiringEpisode: media.nextAiringEpisode,
    };

    return resolved;
  }

  /**
   * Resolves artwork breakdown specifically for an anime.
   */
  public static async resolveArtwork(anilistId: number): Promise<ArtworkResolution | null> {
    const resolved = await this.resolveById(anilistId);
    if (!resolved) return null;

    const hasTmdb = resolved.metadataSources.includes('tmdb');

    return {
      logo: resolved.artwork.logo,
      logoSource: resolved.artwork.logo ? 'tmdb' : 'none',
      backdrop: resolved.artwork.backdrop,
      backdropSource: hasTmdb && resolved.artwork.backdrop?.includes('themoviedb.org') ? 'tmdb' : resolved.artwork.backdrop ? 'anilist' : 'fallback',
      poster: resolved.artwork.poster,
      posterSource: hasTmdb && resolved.artwork.poster?.includes('themoviedb.org') ? 'tmdb' : resolved.artwork.poster ? 'anilist' : 'fallback',
      banner: resolved.artwork.banner,
      bannerSource: resolved.artwork.banner ? 'anilist' : 'fallback',
    };
  }
}
