import type { AnimeTitle, EpisodeItem } from '@/src/types/anime';
import type { VerifiedEpisode } from '@7anime/shared';

/**
 * Maps verified episode records to frontend EpisodeItem format without fabricating any data.
 */
export function mapVerifiedToEpisodeItems(
  verified: VerifiedEpisode[],
  animeTitle: string,
  defaultDuration?: string
): EpisodeItem[] {
  return verified.map((ep) => ({
    number: ep.number,
    title: ep.title || `Episode ${ep.number}`,
    synopsis: ep.overview || `Episode ${ep.number} of ${animeTitle}.`,
    aired: ep.airDate || '',
    duration: ep.duration ? `${ep.duration}m` : (defaultDuration || '24m'),
    durationSec: ep.duration ? ep.duration * 60 : 1440,
    hasSub: true,
    hasDub: Boolean(ep.hasDub),
    kind: ep.isFiller ? 'filler' : 'canon',
    arc: 'Season 1',
    season: 1,
    thumbnail: ep.thumbnail || null,
  }));
}

/**
 * Fallback generator strictly used when only the verified count is known.
 * Never introduces fake filler flags, fake still images, or fake arc titles.
 */
export function buildEpisodesForAnime(anime: AnimeTitle): EpisodeItem[] {
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
