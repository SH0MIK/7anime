import { LATEST_EPISODES, STILLS_POOL } from '@/src/data/catalogService';
import type { EpisodeItem, LatestEpisode } from '@/src/types/anime';

/**
 * Centralized Mock Episodes & Details Layer
 */
export const MOCK_LATEST_EPISODES: LatestEpisode[] = LATEST_EPISODES;

export function getMockEpisodesForAnime(animeIdOrRouteId: string | number, episodeCount = 12): EpisodeItem[] {
  const count = Math.max(1, episodeCount);
  const stillCount = STILLS_POOL.length;

  return Array.from({ length: count }, (_, idx) => {
    const epNum = idx + 1;
    const thumbnail = stillCount > 0 ? STILLS_POOL[idx % stillCount] : null;

    return {
      number: epNum,
      title: `Episode ${epNum}`,
      synopsis: `Episode ${epNum} of the series. Characters face escalating challenges as the story arc unfolds.`,
      aired: '2026',
      duration: '24m',
      durationSec: 1440,
      hasSub: true,
      hasDub: true,
      kind: 'canon',
      arc: 'Main Story Arc',
      season: 1,
      thumbnail,
    };
  });
}
