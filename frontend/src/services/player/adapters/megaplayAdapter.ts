import {
  SERVER_DESCRIPTORS,
  getAllowAttribute,
  getSandboxAttribute,
} from '../providerCapabilities';
import { parsePositiveIntId } from './animetvplusAdapter';
import type { EmbedResolveInput, ResolvedEmbedResult } from '../types';

export const MEGAPLAY_STREAM_BASE = 'https://megaplay.buzz/stream';

/**
 * Preserves legacy 7ANIME_CODEX MegaPlay embed URL resolution:
 * - 'beta'    (MegaPlay AniList): https://megaplay.buzz/stream/ani/{anilistId}/{episodeNumber}/{sub|dub}
 * - 'default' (MegaPlay MAL):     https://megaplay.buzz/stream/mal/{malId}/{episodeNumber}/{sub|dub}
 */
export function resolveMegaPlayEmbed(
  input: EmbedResolveInput,
  variant: 'beta' | 'default'
): ResolvedEmbedResult {
  const descriptor = SERVER_DESCRIPTORS[variant];
  const anilistId = parsePositiveIntId(input.anilistId);
  const malId = parsePositiveIntId(input.malId);
  const tmdbId = parsePositiveIntId(input.tmdbId);
  const rawEp = Number(input.episodeNumber);
  const episodeNumber =
    Number.isFinite(rawEp) && rawEp >= 1 ? Math.floor(rawEp) : 0;
  const safeLang = input.audioMode === 'dub' ? 'dub' : 'sub';

  const baseResult = {
    provider: descriptor.provider,
    serverId: descriptor.id,
    serverLabel: descriptor.label,
    sandboxMode: descriptor.sandboxMode,
    sandboxAttribute: getSandboxAttribute(descriptor.sandboxMode),
    allowAttribute: getAllowAttribute(
      descriptor.capabilities,
      input.autoplay ?? true
    ),
    capabilities: descriptor.capabilities,
    resolvedIdentifiers: {
      anilistId,
      malId,
      tmdbId,
      seasonNumber: parsePositiveIntId(input.seasonNumber),
      episodeNumber: episodeNumber || 1,
    },
  };

  if (episodeNumber < 1) {
    return {
      ...baseResult,
      ok: false,
      embedUrl: null,
      errorCode: 'invalid_episode',
      errorMessage: 'A valid positive episode number is required for playback.',
    };
  }

  if (variant === 'beta') {
    if (!anilistId) {
      return {
        ...baseResult,
        ok: false,
        embedUrl: null,
        errorCode: 'missing_anilist_id',
        errorMessage:
          'AniList ID unavailable for MegaPlay Beta server. Please switch to Backup server (MAL) or Server 1.',
      };
    }

    return {
      ...baseResult,
      ok: true,
      embedUrl: `${MEGAPLAY_STREAM_BASE}/ani/${anilistId}/${episodeNumber}/${safeLang}`,
    };
  }

  // Backup server ('default') -> MegaPlay MAL variant
  if (!malId) {
    return {
      ...baseResult,
      ok: false,
      embedUrl: null,
      errorCode: 'missing_mal_id',
      errorMessage:
        'MyAnimeList (MAL) ID unavailable for Backup server (MegaPlay MAL). Please switch to Beta server or Server 1.',
    };
  }

  return {
    ...baseResult,
    ok: true,
    embedUrl: `${MEGAPLAY_STREAM_BASE}/mal/${malId}/${episodeNumber}/${safeLang}`,
  };
}
