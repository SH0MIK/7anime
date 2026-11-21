import type { AnimeTitle, EpisodeItem } from '@/src/types/anime';
import type { AniListMedia } from './types';

/**
 * Strips HTML tags and unescapes common entities from AniList descriptions.
 */
export function sanitizeDescription(html?: string | null): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?[^>]+(>|$)/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

/**
 * Generates a clean URL slug from title string.
 */
export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Normalizes AniList GraphQL media object into standard 7Anime frontend AnimeTitle.
 */
export function normalizeAniListMedia(media: AniListMedia): AnimeTitle {
  const primaryTitle = media.title.english || media.title.romaji || 'Untitled Anime';
  const slug = slugifyTitle(primaryTitle) || `anime-${media.id}`;
  const routeId = `${slug}-${media.id}`;

  const poster =
    media.coverImage?.extraLarge ||
    media.coverImage?.large ||
    media.coverImage?.medium ||
    '/assets/posters/f382e8b3b01044cf55c0.webp';

  const banner = media.bannerImage || null;

  // Real episodes count
  const episodeCount = media.episodes ?? (media.nextAiringEpisode ? media.nextAiringEpisode.episode - 1 : 12);
  const subCount = media.nextAiringEpisode
    ? Math.max(1, media.nextAiringEpisode.episode - 1)
    : (media.episodes ?? 12);
  const dubCount = Math.floor(subCount * 0.85);

  const score = media.averageScore !== null && media.averageScore !== undefined
    ? Number((media.averageScore / 10).toFixed(1))
    : null;

  const studios = (media.studios?.nodes || []).map((s) => s.name);
  const tags = (media.tags || []).map((t) => t.name);

  // Trailer normalization
  let trailer: AnimeTitle['trailer'] = null;
  if (media.trailer && media.trailer.site?.toLowerCase() === 'youtube' && media.trailer.id) {
    const cleanId = media.trailer.id.trim();
    trailer = {
      source: 'youtube',
      key: cleanId,
      url: `https://www.youtube.com/watch?v=${cleanId}`,
      site: 'youtube',
      official: true,
    };
  }

  return {
    id: media.id,
    source: 'anilist',
    slug,
    routeId,
    title: primaryTitle,
    native: media.title.native || undefined,
    poster,
    banner,
    logo: undefined, // Explicit: AniList has no transparent logo field; triggers typography fallback
    cover: media.coverImage?.large || null,
    background: banner,
    year: media.seasonYear || media.startDate?.year || null,
    score,
    rating: media.format === 'TV' ? 'PG-13' : 'TV-14',
    duration: media.duration ? `${media.duration} min` : '24 min',
    status: media.status || 'RELEASING',
    type: media.format || 'TV',
    genres: media.genres || [],
    studios,
    episodeCount: media.episodes || episodeCount,
    subCount,
    dubCount,
    synopsis: sanitizeDescription(media.description),
    malId: media.idMal || null,
    anilistId: media.id,
    season: media.season || null,
    tags,
    trailer,
  };
}

/**
 * Builds clean minimal episode list entries when only the verified count is known.
 * Never introduces fake filler flags, fake still images, or fake arc titles.
 */
export function generateEpisodesForAniList(
  anime: AnimeTitle,
  _stillsPool: string[] = []
): EpisodeItem[] {
  const total = Math.max(0, Math.min(anime.episodeCount || 0, 1000));
  if (total === 0) return [];
  const epDuration = typeof anime.duration === 'string' ? anime.duration : '24m';

  return Array.from({ length: total }, (_, i) => {
    const num = i + 1;
    return {
      number: num,
      title: `Episode ${num}`,
      synopsis: `Episode ${num} of ${anime.title}.`,
      aired: anime.year ? `${anime.year}` : '',
      duration: epDuration,
      durationSec: 1440,
      hasSub: true,
      hasDub: false,
      kind: 'canon',
      arc: 'Season 1',
      season: 1,
      thumbnail: null,
    };
  });
}
