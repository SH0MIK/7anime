import {
  getAllowAttribute,
  SERVER_DESCRIPTORS,
} from './providerCapabilities';
import type {
  PlayerServerId,
  ResolvedEmbedResult,
} from './types';

const API_BASE = (
  import.meta.env.VITE_ANIVAULT_API_URL ||
  'https://anivaultapi-production.up.railway.app'
 ).replace(/\/+$/, '');

const SOURCE_BY_SERVER: Record<PlayerServerId, string> = {
  server1: 'anikoto',
  beta: 'desidub',
  default: 'megaplay',
  hindi: 'animeheaven',
};

function positiveId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function baseResult(
  server: PlayerServerId,
  ids: { anilistId?: unknown; malId?: unknown; tmdbId?: unknown; episodeNumber: number },
  autoplay: boolean
): Omit<ResolvedEmbedResult, 'ok' | 'embedUrl'> {
  const descriptor = SERVER_DESCRIPTORS[server];
  return {
    provider: 'anivault-api',
    serverId: server,
    serverLabel: descriptor.label,
    sandboxMode: 'none',
    allowAttribute: getAllowAttribute(descriptor.capabilities, autoplay),
    capabilities: descriptor.capabilities,
    resolvedIdentifiers: {
      anilistId: positiveId(ids.anilistId),
      malId: positiveId(ids.malId),
      tmdbId: positiveId(ids.tmdbId),
      seasonNumber: null,
      episodeNumber: ids.episodeNumber,
    },
  };
}

export function createLoadingEmbed(
  server: PlayerServerId,
  ids: { anilistId?: unknown; malId?: unknown; tmdbId?: unknown; episodeNumber?: number } = {},
  autoplay = true
): ResolvedEmbedResult {
  return {
    ...baseResult(server, { ...ids, episodeNumber: ids.episodeNumber ?? 1 }, autoplay),
    ok: false,
    embedUrl: null,
    loading: true,
    errorMessage: 'Connecting to AniVault streaming API…',
  };
}

export async function resolveAniVaultStream(input: {
  server: PlayerServerId;
  anilistId?: number | string | null;
  malId?: number | string | null;
  tmdbId?: number | string | null;
  episodeNumber: number;
  audioMode: 'sub' | 'dub';
  autoplay?: boolean;
  signal?: AbortSignal;
}): Promise<ResolvedEmbedResult> {
  const { server, episodeNumber, audioMode, signal } = input;
  const base = baseResult(server, input, input.autoplay ?? true);
  const anilistId = positiveId(input.anilistId);
  const malId = positiveId(input.malId);
  const id = anilistId ? String(anilistId) : malId ? `mal-${malId}` : null;

  const failure = (message: string): ResolvedEmbedResult => ({
    ...base,
    ok: false,
    embedUrl: null,
    errorCode: 'api_error',
    errorMessage: message,
  });

  if (!id) return failure('This title has no usable AniList or MAL ID for AniVault API.');
  if (!Number.isSafeInteger(episodeNumber) || episodeNumber < 1) {
    return failure('A valid episode number is required.');
  }

  const source = SOURCE_BY_SERVER[server];
  const url = `${API_BASE}/api/watch/${source}/${encodeURIComponent(id)}/${episodeNumber}/${audioMode}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;

    if (!response.ok) {
      const detail = typeof payload.error === 'string'
        ? payload.error
        : `AniVault API returned HTTP ${response.status}.`;
      return failure(detail);
    }

    const rawUrl = typeof payload.embedUrl === 'string' && payload.embedUrl.trim()
      ? payload.embedUrl
      : null;
    if (!rawUrl) return failure('The API resolved this source but did not return a playable URL.');

    let safeUrl: string;
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        return failure('The API returned an unsupported playback URL.');
      }
      safeUrl = parsed.toString();
    } catch {
      return failure('The API returned an invalid playback URL.');
    }

    return {
      ...base,
      ok: true,
      embedUrl: safeUrl,
      resolvedServerName: typeof payload.server === 'string' ? payload.server : null,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return failure('Playback request was cancelled.');
    }
    return failure(
      error instanceof Error
        ? `Could not reach AniVault API: ${error.message}`
        : 'Could not reach AniVault API.'
    );
  }
}
