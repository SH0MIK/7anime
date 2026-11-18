import { CATALOG } from '@/src/data/catalogService';
import type { AnimeTitle } from '@/src/types/anime';
import { buildAnimeArtwork } from './mockArtwork';

/**
 * Centralized Mock Catalog Layer
 * Encapsulates all anime titles, artwork, and metadata for 7Anime.
 * Easily swappable with the future live metadata backend (AniList / TMDB / MAL / OMDb).
 */
export const MOCK_CATALOG: AnimeTitle[] = CATALOG.map((anime) => {
  const artwork = buildAnimeArtwork({
    poster: anime.poster,
    cover: anime.poster,
    banner: anime.banner,
    background: anime.banner,
    logo: anime.logo,
  });

  return {
    ...anime,
    artwork,
    cover: artwork.cover,
    background: artwork.background,
  };
});

/**
 * Look up an anime title by routeId, slug, or ID
 */
export function getMockAnimeByRoute(routeIdOrSlug: string): AnimeTitle | undefined {
  if (!routeIdOrSlug) return undefined;
  const target = routeIdOrSlug.toLowerCase();
  return MOCK_CATALOG.find(
    (a) =>
      a.routeId.toLowerCase() === target ||
      a.slug.toLowerCase() === target ||
      String(a.id) === target
  );
}

/**
 * Filter anime by status, genre, or format
 */
export function getMockAnimeByGenre(genre: string, limit = 18): AnimeTitle[] {
  const g = genre.toLowerCase();
  return MOCK_CATALOG.filter((a) =>
    a.genres.some((item) => item.toLowerCase() === g)
  ).slice(0, limit);
}
