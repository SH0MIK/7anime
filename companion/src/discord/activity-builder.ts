import type { DiscordPresencePlaybackPayload } from '@7anime/shared';
import type { DiscordActivity } from './ipc-client.js';
import { COMPANION_CONFIG } from '../config.js';

const FALLBACK_LARGE_ASSET_KEY = '7anime_large';
const MAX_DISCORD_TEXT_LEN = 128;
const MAX_ARTWORK_URL_LEN = 256;

export function isValidHttpsArtworkUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_ARTWORK_URL_LEN) return false;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (
      !host ||
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host.endsWith('.local')
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function formatDetailsLine(
  prefix: string,
  title: string,
  suffix: string
): string {
  const full = `${prefix}${title}${suffix}`;
  if (full.length <= MAX_DISCORD_TEXT_LEN) {
    return full;
  }
  const availableTitleLen = Math.max(
    1,
    MAX_DISCORD_TEXT_LEN - prefix.length - suffix.length - 1
  );
  const clippedTitle = `${title.slice(0, availableTitleLen).trimEnd()}…`;
  return `${prefix}${clippedTitle}${suffix}`.slice(0, MAX_DISCORD_TEXT_LEN);
}

export class ActivityBuilder {
  /**
   * Constructs Discord Rich Presence activity adhering strictly to Discord Activity specifications.
   */
  public static buildActivity(payload: DiscordPresencePlaybackPayload): DiscordActivity {
    const rawTitle = payload.animeTitle ? payload.animeTitle.trim() : 'Anime';
    const displayTitle = payload.hideTitle ? 'Anime' : rawTitle || 'Anime';
    const seasonPart =
      payload.seasonNumber && payload.seasonNumber > 1
        ? ` · Season ${payload.seasonNumber}`
        : '';

    let details: string;
    if (payload.isPlaying) {
      if (payload.hideTitle && payload.hideEpisode) {
        details = 'Watching anime on 7Anime';
      } else if (payload.hideEpisode) {
        details = formatDetailsLine('Watching ', displayTitle, '');
      } else {
        details = formatDetailsLine(
          'Watching ',
          displayTitle,
          `${seasonPart} · Episode ${payload.episodeNumber}`
        );
      }
    } else if (payload.hideTitle && payload.hideEpisode) {
      details = 'Paused on 7Anime';
    } else if (payload.hideEpisode) {
      details = formatDetailsLine('Paused: ', displayTitle, '');
    } else {
      details = formatDetailsLine(
        'Paused: ',
        displayTitle,
        `${seasonPart} · Episode ${payload.episodeNumber}`
      );
    }

    const cleanServer =
      typeof payload.serverLabel === 'string' ? payload.serverLabel.trim() : '';
    const stateBase = payload.isPlaying ? 'On 7Anime' : 'Paused · On 7Anime';
    const state = (cleanServer ? `${stateBase} · ${cleanServer}` : stateBase).slice(
      0,
      MAX_DISCORD_TEXT_LEN
    );

    const safeArtwork =
      !payload.hideTitle && isValidHttpsArtworkUrl(payload.artworkUrl)
        ? payload.artworkUrl.trim()
        : null;

    const activity: DiscordActivity = {
      type: 3, // ActivityType 3 = Watching
      details,
      state,
      assets: {
        large_image: safeArtwork ?? FALLBACK_LARGE_ASSET_KEY,
        large_text: (payload.hideTitle ? '7Anime' : displayTitle).slice(
          0,
          MAX_DISCORD_TEXT_LEN
        ),
      },
      buttons: [
        {
          label: 'Visit 7Anime',
          url: COMPANION_CONFIG.WEBSITE_URL,
        },
        {
          label: 'Join Discord',
          url: COMPANION_CONFIG.DISCORD_INVITE_URL,
        },
      ],
      instance: false,
    };

    // Include playback start timestamp only when actively playing
    if (
      payload.isPlaying &&
      typeof payload.startTimestamp === 'number' &&
      Number.isFinite(payload.startTimestamp) &&
      payload.startTimestamp > 0
    ) {
      activity.timestamps = {
        start: Math.floor(payload.startTimestamp),
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

    // Compare timestamps (must agree on presence AND stay within +- 2s jitter tolerance)
    const aHasStart = typeof a.timestamps?.start === 'number' && a.timestamps.start > 0;
    const bHasStart = typeof b.timestamps?.start === 'number' && b.timestamps.start > 0;
    if (aHasStart !== bHasStart) return false;
    if (aHasStart && bHasStart) {
      if (Math.abs((a.timestamps?.start ?? 0) - (b.timestamps?.start ?? 0)) > 2000) {
        return false;
      }
    }

    // Compare assets
    if ((a.assets?.large_image ?? '') !== (b.assets?.large_image ?? '')) return false;
    if ((a.assets?.large_text ?? '') !== (b.assets?.large_text ?? '')) return false;

    // Compare buttons (Discord max 2)
    const aButtons = a.buttons ?? [];
    const bButtons = b.buttons ?? [];
    if (aButtons.length !== bButtons.length) return false;
    for (let i = 0; i < aButtons.length; i++) {
      if (aButtons[i].label !== bButtons[i].label || aButtons[i].url !== bButtons[i].url) {
        return false;
      }
    }

    return true;
  }
}
