import {
  SERVER_DESCRIPTORS,
  getAllowAttribute,
  getSandboxAttribute,
} from '../providerCapabilities';
import type { EmbedResolveInput, ResolvedEmbedResult } from '../types';

export const ANIMETVPLUS_ANILIST_EMBED_BASE =
  'https://embed.animetvplus.site/home/embed/anilist';

export function parsePositiveIntId(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 && Number.isFinite(value)
      ? value
      : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) {
      const parsed = Number(trimmed);
      return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
    }
  }
  return null;
}

/**
 * Builds an embed resolution result for AnimeTVPlus (Server 1).
 * Uses the canonical `/home/embed/anilist/{anilistId}/{episodeNumber}` route.
 * Strictly requires a verified positive AniList ID; never substitutes MAL ID.
 */
export function resolveAnimeTvPlusEmbed(
  input: EmbedResolveInput
): ResolvedEmbedResult {
  const descriptor = SERVER_DESCRIPTORS.server1;
  const anilistId = parsePositiveIntId(input.anilistId);
  const malId = parsePositiveIntId(input.malId);
  const tmdbId = parsePositiveIntId(input.tmdbId);
  const rawEp = Number(input.episodeNumber);
  const episodeNumber =
    Number.isFinite(rawEp) && rawEp >= 1 ? Math.floor(rawEp) : 0;

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

  if (!anilistId) {
    return {
      ...baseResult,
      ok: false,
      embedUrl: null,
      errorCode: 'missing_anilist_id',
      errorMessage: malId
        ? 'AniList ID mapping is unavailable for this title. Please switch to Backup server (MegaPlay MAL) or try again.'
        : 'A valid AniList ID is required for Server 1 (AnimeTVPlus). Please switch servers.',
    };
  }

  if (episodeNumber < 1) {
    return {
      ...baseResult,
      ok: false,
      embedUrl: null,
      errorCode: 'invalid_episode',
      errorMessage: 'A valid positive episode number is required for playback.',
    };
  }

  return {
    ...baseResult,
    ok: true,
    embedUrl: `${ANIMETVPLUS_ANILIST_EMBED_BASE}/${anilistId}/${episodeNumber}`,
  };
}
