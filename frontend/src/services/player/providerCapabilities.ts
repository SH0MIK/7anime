import type {
  PlayerServerId,
  ProviderCapabilities,
  ProviderId,
  SandboxMode,
  ServerDescriptor,
} from './types';

/**
 * Sandbox configurations by security tier:
 * - STRICT (AnimeTVPlus): Minimum playback permissions only. No allow-same-origin,
 *   no allow-popups, no allow-popups-to-escape-sandbox, no allow-top-navigation.
 * - STANDARD (NXsha Hindi): Playback-compatible permissions including allow-same-origin
 *   for client hydration/stream fetch, strictly blocking all popups and top-level navigation.
 * - NONE (MegaPlay): Legacy configuration preserved from 7ANIME_CODEX for postMessage & stream init.
 */
export const ANIMETVPLUS_STRICT_SANDBOX =
  'allow-scripts allow-forms allow-presentation';

export const NXSHA_STANDARD_SANDBOX =
  'allow-scripts allow-same-origin allow-forms allow-presentation';

export const BASE_ALLOW_PERMISSIONS =
  'fullscreen; picture-in-picture; encrypted-media';

export const AUTOPLAY_ALLOW_PERMISSIONS =
  'autoplay; fullscreen; picture-in-picture; encrypted-media';

export const PROVIDER_CAPABILITIES: Record<ProviderId, ProviderCapabilities> = {
  animetvplus: {
    embedPlayback: true,
    episodeSwitching: true,
    autoplay: true,
    autoNext: false,
    autoSkip: false,
    theaterMode: true,
    ambientMode: true,
    fullscreen: true,
    playerSize: true,
    lightsOff: true,
    supportsSubDub: false,
    progressPostMessage: false,
  },
  nxsha: {
    embedPlayback: true,
    episodeSwitching: true,
    autoplay: true,
    autoNext: false,
    autoSkip: false,
    theaterMode: true,
    ambientMode: true,
    fullscreen: true,
    playerSize: true,
    lightsOff: true,
    supportsSubDub: false,
    progressPostMessage: false,
  },
  megaplay: {
    embedPlayback: true,
    episodeSwitching: true,
    autoplay: true,
    autoNext: true,
    autoSkip: true,
    theaterMode: true,
    ambientMode: true,
    fullscreen: true,
    playerSize: true,
    lightsOff: true,
    supportsSubDub: true,
    progressPostMessage: true,
  },
};

export const SERVER_DESCRIPTORS: Record<PlayerServerId, ServerDescriptor> = {
  server1: {
    id: 'server1',
    provider: 'animetvplus',
    label: 'Server 1',
    shortDescription: 'AnimeTVPlus (AniList)',
    sandboxMode: 'strict',
    capabilities: PROVIDER_CAPABILITIES.animetvplus,
  },
  beta: {
    id: 'beta',
    provider: 'megaplay',
    label: 'Beta server',
    shortDescription: 'MegaPlay (AniList Sub/Dub)',
    sandboxMode: 'none',
    capabilities: PROVIDER_CAPABILITIES.megaplay,
  },
  default: {
    id: 'default',
    provider: 'megaplay',
    label: 'Backup server',
    shortDescription: 'MegaPlay (MAL Sub/Dub)',
    sandboxMode: 'none',
    capabilities: PROVIDER_CAPABILITIES.megaplay,
  },
  hindi: {
    id: 'hindi',
    provider: 'nxsha',
    label: 'Hindi',
    shortDescription: 'NXsha Hindi (TMDB)',
    sandboxMode: 'standard',
    capabilities: PROVIDER_CAPABILITIES.nxsha,
  },
};

export const ORDERED_SERVER_IDS: readonly PlayerServerId[] = [
  'server1',
  'beta',
  'default',
  'hindi',
];

export function normalizePlayerServer(raw?: string | null): PlayerServerId {
  if (raw === 'server1' || raw === 'beta' || raw === 'default' || raw === 'hindi') {
    return raw;
  }
  return 'server1';
}

export function getSandboxAttribute(mode: SandboxMode): string | undefined {
  if (mode === 'strict') return ANIMETVPLUS_STRICT_SANDBOX;
  if (mode === 'standard') return NXSHA_STANDARD_SANDBOX;
  return undefined;
}

export function getAllowAttribute(capabilities: ProviderCapabilities, autoplayEnabled: boolean): string {
  return capabilities.autoplay && autoplayEnabled
    ? AUTOPLAY_ALLOW_PERMISSIONS
    : BASE_ALLOW_PERMISSIONS;
}
