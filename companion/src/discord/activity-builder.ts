import type { DiscordPresencePlaybackPayload } from '@7anime/shared';
import type { DiscordActivity } from './ipc-client.js';
import { COMPANION_CONFIG } from '../config.js';

export class ActivityBuilder {
  /**
   * Constructs Discord Rich Presence activity adhering strictly to Discord Activity specifications.
   */
  public static buildActivity(payload: DiscordPresencePlaybackPayload): DiscordActivity {
    const rawTitle = payload.animeTitle ? payload.animeTitle.trim() : 'Anime';
    const displayTitle = payload.hideTitle ? 'Anime' : rawTitle;

    // State line: "Season X · Episode Y" or "Episode Y"
    let state = '';
    if (!payload.hideEpisode) {
      if (payload.seasonNumber && payload.seasonNumber > 1) {
        state = `Season ${payload.seasonNumber} · Episode ${payload.episodeNumber}`;
      } else {
        state = `Episode ${payload.episodeNumber}`;
      }
    } else {
      state = 'Streaming on 7Anime';
    }

    // Status prefix
    const details = payload.isPlaying
      ? displayTitle
      : `Paused: ${displayTitle}`;

    // Target watch URL
    const watchUrl = `${COMPANION_CONFIG.PUBLIC_BASE_URL}/anime/${payload.routeId}?ep=${payload.episodeNumber}`;

    const activity: DiscordActivity = {
      type: 3, // ActivityType 3 = Watching
      details: details.slice(0, 128),
      state: state.slice(0, 128),
      assets: {
        large_image: '7anime_large',
        large_text: displayTitle.slice(0, 128),
        small_image: payload.isPlaying ? 'play' : 'pause',
        small_text: payload.isPlaying ? 'Playing on 7Anime' : 'Paused on 7Anime',
      },
      buttons: [
        {
          label: 'Watch on 7Anime',
          url: watchUrl,
        },
      ],
      instance: false,
    };

    // Include playback start timestamp only when actively playing
    if (payload.isPlaying && payload.startTimestamp && payload.startTimestamp > 0) {
      activity.timestamps = {
        start: payload.startTimestamp,
      };
    }

    return activity;
  }

  /**
   * Performs deep comparison to deduplicate identical payloads and eliminate redundant IPC calls.
   */
  public static isSameActivity(a: DiscordActivity | null, b: DiscordActivity | null): boolean {
    if (a === null && b === null) return true;
    if (a === null || b === null) return false;

    if (a.type !== b.type) return false;
    if (a.details !== b.details) return false;
    if (a.state !== b.state) return false;

    // Compare timestamps (allow +- 2 seconds variance for start timestamps to avoid jitter re-sends)
    const aStart = a.timestamps?.start || 0;
    const bStart = b.timestamps?.start || 0;
    if (Math.abs(aStart - bStart) > 2000) return false;

    // Compare assets
    if (a.assets?.large_image !== b.assets?.large_image) return false;
    if (a.assets?.small_image !== b.assets?.small_image) return false;

    // Compare button URLs
    const aBtn = a.buttons?.[0]?.url || '';
    const bBtn = b.buttons?.[0]?.url || '';
    if (aBtn !== bBtn) return false;

    return true;
  }
}
