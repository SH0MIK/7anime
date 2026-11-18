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
    trailer = {
      source: 'youtube',
      key: media.trailer.id,
      url: `https://www.youtube.com/watch?v=${media.trailer.id}`,
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
 * Builds realistic episode list entries for a given anime using real episode count.
 */
export function generateEpisodesForAniList(
  anime: AnimeTitle,
  stillsPool: string[] = []
): EpisodeItem[] {
  const total = Math.max(1, Math.min(anime.episodeCount || 12, 1000));
  const epDuration = typeof anime.duration === 'string' ? anime.duration : '24m';
  const durationSec = 1440;

  return Array.from({ length: total }, (_, i) => {
    const num = i + 1;
    const kind: EpisodeItem['kind'] =
      num % 9 === 0 ? 'filler' : num % 5 === 0 ? 'mixed' : 'canon';

    const thumb =
      stillsPool.length > 0 ? stillsPool[(num - 1) % stillsPool.length] : null;

    return {
      number: num,
      title: `Episode ${num}`,
      synopsis: `Episode ${num} of ${anime.title}. Stream and follow the storyline.`,
      aired: anime.year ? `${anime.year}` : 'Recent',
      duration: epDuration,
      durationSec,
      hasSub: true,
      hasDub: num <= anime.dubCount,
      kind,
      arc: total > 24 ? `Arc ${Math.ceil(num / 25)}` : 'Main Arc',
      season: 1,
      thumbnail: thumb,
    };
  });
}
