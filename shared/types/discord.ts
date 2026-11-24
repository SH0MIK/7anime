export interface DiscordPresencePlaybackPayload {
  animeTitle: string;
  routeId: string;
  episodeNumber: number;
  seasonNumber?: number;
  isPlaying: boolean;
  currentTimeSec: number;
  durationSec: number;
  startTimestamp?: number;
  hideTitle?: boolean;
  hideEpisode?: boolean;
}

export type CompanionClientMessageType =
  | 'HANDSHAKE'
  | 'PLAYBACK_UPDATE'
  | 'CLEAR_ACTIVITY'
  | 'GET_STATUS';

export interface CompanionClientMessage {
  type: CompanionClientMessageType;
  payload?: DiscordPresencePlaybackPayload;
  tabId?: string;
  version?: string;
}

export type CompanionServerMessageType =
  | 'STATUS'
  | 'ACK'
  | 'ERROR';

export interface CompanionServerMessage {
  type: CompanionServerMessageType;
  discordConnected: boolean;
  discordUser?: {
    username: string;
    id: string;
  };
  currentActivity?: {
    animeTitle?: string;
    episodeNumber?: number;
    isPlaying: boolean;
  } | null;
  companionVersion: string;
  error?: string;
}

export interface DiscordPresencePreferences {
  enabled: boolean;
  autoShare: boolean;
  hideTitle: boolean;
  hideEpisode: boolean;
}
