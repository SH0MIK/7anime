import {
  SERVER_DESCRIPTORS,
  getAllowAttribute,
  getSandboxAttribute,
} from '../providerCapabilities';
import { parsePositiveIntId } from './animetvplusAdapter';
import type { EmbedResolveInput, ResolvedEmbedResult } from '../types';

export const NXSHA_TV_EMBED_BASE = 'https://nxsha.space/embed/tv';

/**
 * Builds an embed resolution result for NXsha Hindi Server.
 * Exact URL format:
 *   https://nxsha.space/embed/tv/{tmdbId}/{seasonNumber}/{episodeNumber}?lang=hi
 *
 * Validates TMDB TV series ID, positive season & episode numbers,
 * and preserves `lang=hi` unconditionally.
 */
export function resolveNxshaHindiEmbed(
  input: EmbedResolveInput
): ResolvedEmbedResult {
  const descriptor = SERVER_DESCRIPTORS.hindi;
  const anilistId = parsePositiveIntId(input.anilistId);
  const malId = parsePositiveIntId(input.malId);
  const tmdbId = parsePositiveIntId(input.tmdbId);
  const seasonNumber = parsePositiveIntId(input.seasonNumber);
  const rawEp = Number(input.tmdbEpisodeNumber ?? input.episodeNumber);
  const episodeNumber =
    Number.isFinite(rawEp) && rawEp >= 1 ? Math.floor(rawEp) : 0;

  const isMovie =
    typeof input.mediaType === 'string' &&
    input.mediaType.trim().toLowerCase() === 'movie';

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
      seasonNumber,
      episodeNumber: episodeNumber || 1,
    },
  };

  if (isMovie) {
    return {
      ...baseResult,
      ok: false,
      embedUrl: null,
      errorCode: 'unsupported_media_type',
      errorMessage:
        'Hindi TV embed is only available for episodic TV series. Please select Server 1 or MegaPlay for movies.',
    };
  }

  if (!tmdbId) {
    return {
      ...baseResult,
      ok: false,
      embedUrl: null,
      errorCode: 'missing_tmdb_id',
      errorMessage:
        'Verified TMDB TV ID is unavailable for this anime, so the Hindi server cannot be loaded safely. Please use Server 1 or MegaPlay.',
    };
  }

  if (!seasonNumber) {
    return {
      ...baseResult,
      ok: false,
      embedUrl: null,
      errorCode: 'invalid_season',
      errorMessage:
        'Valid TMDB season metadata is unavailable for this episode. Please switch servers.',
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
    embedUrl: `${NXSHA_TV_EMBED_BASE}/${tmdbId}/${seasonNumber}/${episodeNumber}?lang=hi`,
  };
}
