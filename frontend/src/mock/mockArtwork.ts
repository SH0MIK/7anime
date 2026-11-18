import type { AnimeArtwork } from '@/src/types/anime';

/**
 * Default fallback artwork assets (served locally from public/assets/)
 */
export const DEFAULT_MOCK_ARTWORK: AnimeArtwork = {
  poster: '/assets/posters/f382e8b3b01044cf55c0.webp',
  cover: '/assets/posters/f382e8b3b01044cf55c0.webp',
  banner: '/assets/banners/srZ5QZsenfmHXPXp3eIIYjsSBXH.webp',
  background: '/assets/banners/srZ5QZsenfmHXPXp3eIIYjsSBXH.webp',
  logo: null,
};

/**
 * Normalizes artwork fields from raw catalog entries into a structured AnimeArtwork object.
 * Keeps poster, cover, banner, background, and logo strictly separated.
 */
export function buildAnimeArtwork(raw: {
  poster?: string | null;
  cover?: string | null;
  banner?: string | null;
  background?: string | null;
  logo?: string | null;
}): AnimeArtwork {
  const poster = raw.poster || DEFAULT_MOCK_ARTWORK.poster;
  const cover = raw.cover || poster;
  const banner = raw.banner || DEFAULT_MOCK_ARTWORK.banner;
  const background = raw.background || banner;
  const logo = raw.logo || null;

  return {
    poster,
    cover,
    banner,
    background,
    logo,
  };
}
