import { resolveAnimeTvPlusEmbed } from './adapters/animetvplusAdapter';
import { resolveMegaPlayEmbed } from './adapters/megaplayAdapter';
import { resolveNxshaHindiEmbed } from './adapters/nxshaAdapter';
import { normalizePlayerServer } from './providerCapabilities';
import type {
  EmbedResolveInput,
  ParsedEmbedProgress,
  ResolvedEmbedResult,
} from './types';

/**
 * Resolves the active server embed URL, sandbox policy, and capabilities.
 */
export function resolvePlayerEmbed(
  input: EmbedResolveInput
): ResolvedEmbedResult {
  const serverId = normalizePlayerServer(input.server);

  switch (serverId) {
    case 'server1':
      return resolveAnimeTvPlusEmbed(input);
    case 'hindi':
      return resolveNxshaHindiEmbed(input);
    case 'beta':
      return resolveMegaPlayEmbed(input, 'beta');
    case 'default':
      return resolveMegaPlayEmbed(input, 'default');
    default:
      return resolveAnimeTvPlusEmbed(input);
  }
}

/**
 * Safely parses cross-origin postMessage playback telemetry (preserved from 7ANIME_CODEX MegaPlay).
 */
export function parseEmbedProgressMessage(
  event: MessageEvent
): ParsedEmbedProgress | null {
  let data: unknown = event.data;

  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }

  if (!data || typeof data !== 'object') {
    return null;
  }

  const root = data as Record<string, unknown>;
  const candidates: Record<string, unknown>[] = [root];

  for (const key of ['data', 'detail', 'payload', 'progress']) {
    const nested = root[key];
    if (nested && typeof nested === 'object') {
      candidates.push(nested as Record<string, unknown>);
    }
  }

  for (const candidate of candidates) {
    const currentRaw =
      candidate.currentTime ??
      candidate.currentTimeSeconds ??
      candidate.progressSeconds ??
      candidate.progress ??
      candidate.position;

    const durationRaw =
      candidate.duration ??
      candidate.durationSeconds ??
      candidate.totalDuration;

    const current =
      typeof currentRaw === 'number'
        ? currentRaw
        : typeof currentRaw === 'string'
          ? Number(currentRaw)
          : NaN;

    const duration =
      typeof durationRaw === 'number'
        ? durationRaw
        : typeof durationRaw === 'string'
          ? Number(durationRaw)
          : NaN;

    if (Number.isFinite(current) && current >= 0) {
      return {
        progressSeconds: current,
        durationSeconds:
          Number.isFinite(duration) && duration >= 0 ? duration : 0,
        completed:
          candidate.completed === true ||
          candidate.ended === true ||
          candidate.event === 'ended' ||
          candidate.type === 'ended',
        isPaused:
          candidate.paused === true ||
          candidate.event === 'pause' ||
          candidate.type === 'pause',
      };
    }
  }

  return null;
}
