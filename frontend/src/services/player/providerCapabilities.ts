import type {
  PlayerServerId,
  ProviderCapabilities,
  ProviderId,
  SandboxMode,
  ServerDescriptor,
} from './types';

export const BASE_ALLOW_PERMISSIONS =
  'fullscreen; picture-in-picture; encrypted-media';

export const AUTOPLAY_ALLOW_PERMISSIONS =
  'autoplay; fullscreen; picture-in-picture; encrypted-media';

const API_CAPABILITIES: ProviderCapabilities = {
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
  supportsSubDub: true,
  // The API returns cross-origin embeds; they do not expose a shared progress
  // postMessage contract, so progress is recorded when the iframe initializes.
  progressPostMessage: false,
};

export const PROVIDER_CAPABILITIES: Record<ProviderId, ProviderCapabilities> = {
  animetvplus: API_CAPABILITIES,
  nxsha: API_CAPABILITIES,
  megaplay: API_CAPABILITIES,
  'anivault-api': API_CAPABILITIES,
};

const descriptor = (
  id: PlayerServerId,
  label: string,
  shortDescription: string
): ServerDescriptor => ({
  id,
  provider: 'anivault-api',
  label,
  shortDescription,
  // The source embeds require their own scripts, storage and media permissions.
  // Keep them unsandboxed as the previous MegaPlay integration was.
  sandboxMode: 'none' as SandboxMode,
  capabilities: API_CAPABILITIES,
});

export const SERVER_DESCRIPTORS: Record<PlayerServerId, ServerDescriptor> = {
  server1: descriptor('server1', 'Anikoto', 'AniVault API · Anikoto'),
  beta: descriptor('beta', 'DesiDub', 'AniVault API · DesiDub'),
  default: descriptor('default', 'MegaPlay', 'AniVault API · MegaPlay Direct'),
  hindi: descriptor('hindi', 'AnimeHeaven', 'AniVault API · AnimeHeaven'),
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

export function getSandboxAttribute(_mode: SandboxMode): string | undefined {
  return undefined;
}

export function getAllowAttribute(
  capabilities: ProviderCapabilities,
  autoplayEnabled: boolean
): string {
  return capabilities.autoplay && autoplayEnabled
    ? AUTOPLAY_ALLOW_PERMISSIONS
    : BASE_ALLOW_PERMISSIONS;
}
