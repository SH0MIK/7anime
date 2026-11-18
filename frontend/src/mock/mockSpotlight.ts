import { SPOTLIGHT_ITEMS } from '@/src/data/catalogService';
import type { AnimeTitle } from '@/src/types/anime';
import { buildAnimeArtwork } from './mockArtwork';
import { MOCK_CATALOG } from './mockCatalog';

/**
 * Centralized Mock Spotlight Layer
 * Contains featured theatrical banner carousel items with dedicated anime title logos.
 */
export const MOCK_SPOTLIGHT: AnimeTitle[] = (
  SPOTLIGHT_ITEMS.length > 0 ? SPOTLIGHT_ITEMS : MOCK_CATALOG.slice(0, 6)
).map((item) => {
  const artwork = buildAnimeArtwork({
    poster: item.poster,
    cover: item.poster,
    banner: item.banner,
    background: item.banner,
    logo: item.logo,
  });

  return {
    ...item,
    artwork,
    cover: artwork.cover,
    background: artwork.background,
  };
});
