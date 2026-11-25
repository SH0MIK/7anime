import type {
  DiscordPresencePlaybackPayload,
  CompanionClientMessage,
  CompanionServerMessage,
  DiscordPresencePreferences,
} from '@7anime/shared';
import { discordPresenceCoordinator } from './discordPresenceCoordinator';

export type CompanionConnectionStatus =
  | 'DISABLED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'DISCONNECTED';

export interface PresenceState {
  status: CompanionConnectionStatus;
  discordConnected: boolean;
  discordUser?: {
    username: string;
    id: string;
  };
  companionVersion?: string;
  error?: string;
}

const DEFAULT_PORT = 17077;
const COMPANION_WS_URL = `ws://127.0.0.1:${DEFAULT_PORT}`;
const RECONNECT_DELAYS_MS = [3000, 6000, 12000, 20000, 30000];

class DiscordPresenceService {
  private socket: WebSocket | null = null;
  private state: PresenceState = {
    status: 'DISABLED',
    discordConnected: false,
  };
  private listeners = new Set<(state: PresenceState) => void>();
  private lastPayload: DiscordPresencePlaybackPayload | null = null;
  private lastSentPrivacy: { hideTitle: boolean; hideEpisode: boolean } | null = null;
  private isConnecting = false;
  private reconnectTimer: number | null = null;
  private reconnectAttempts = 0;
  private prefs: DiscordPresencePreferences = {
    enabled: false,
    autoShare: true,
    hideTitle: false,
    hideEpisode: false,
  };

  constructor() {
    this.setupPageListeners();
    this.setupLeadershipListener();
  }

  private setupLeadershipListener(): void {
    discordPresenceCoordinator.onLeadershipChange((isLeader) => {
      if (isLeader && this.lastPayload && this.prefs.enabled && this.prefs.autoShare) {
        this.sendPlaybackUpdate(this.lastPayload);
      }
    });
  }

  public init(prefs: DiscordPresencePreferences): void {
    this.prefs = prefs;
    this.reconnectAttempts = 0;

    if (prefs.enabled) {
      this.connect();
    } else {
      this.disconnect();
    }
  }

  public updatePrefs(prefs: DiscordPresencePreferences): void {
    const wasEnabled = this.prefs.enabled;
    const privacyChanged =
      this.prefs.hideTitle !== prefs.hideTitle ||
      this.prefs.hideEpisode !== prefs.hideEpisode;
    this.prefs = prefs;

    if (prefs.enabled && !wasEnabled) {
      this.reconnectAttempts = 0;
      this.connect();
    } else if (!prefs.enabled && wasEnabled) {
      this.clearActivity();
      this.disconnect();
    } else if (prefs.enabled && this.lastPayload && (privacyChanged || prefs.autoShare)) {
      if (!prefs.autoShare) {
        this.clearActivity();
      } else if (discordPresenceCoordinator.isLeader()) {
        this.sendPlaybackUpdate(this.lastPayload);
      }
    }
  }

  public getState(): PresenceState {
    return { ...this.state };
  }

  public subscribe(listener: (state: PresenceState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const s = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(s);
      } catch (err) {
        console.warn('[DiscordPresenceService] Listener error:', err);
      }
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (typeof window === 'undefined' || !this.prefs.enabled) return;
    if (this.reconnectTimer !== null) return;
    if (this.reconnectAttempts >= RECONNECT_DELAYS_MS.length) return;

    const delay = RECONNECT_DELAYS_MS[this.reconnectAttempts] ?? 30000;
    this.reconnectAttempts += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (this.prefs.enabled && (!this.socket || this.socket.readyState === WebSocket.CLOSED)) {
        this.connect();
      }
    }, delay);
  }

  /**
   * Attempts connection to local companion application.
   * Uses bounded backoff if companion launches after the browser tab opens.
   */
  public connect(): void {
    if (!this.prefs.enabled) {
      this.clearReconnectTimer();
      this.state = { status: 'DISABLED', discordConnected: false };
      this.notify();
      return;
    }

    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    if (this.isConnecting) return;
    this.clearReconnectTimer();
    this.isConnecting = true;

    this.state = { ...this.state, status: 'CONNECTING', error: undefined };
    this.notify();

    try {
      const ws = new WebSocket(COMPANION_WS_URL);
      this.socket = ws;

      ws.onopen = () => {
        if (this.socket !== ws) return;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.state = { ...this.state, status: 'CONNECTED', error: undefined };
        this.notify();

        this.sendMessage({
          type: 'HANDSHAKE',
          tabId: discordPresenceCoordinator.tabId,
          version: '1.0.0',
        });

        if (this.lastPayload && this.prefs.autoShare && discordPresenceCoordinator.isLeader()) {
          this.sendPlaybackUpdate(this.lastPayload);
        }
      };

      ws.onmessage = (event) => {
        if (this.socket !== ws) return;
        try {
          const msg = JSON.parse(event.data) as CompanionServerMessage;
          if (msg.type === 'STATUS') {
            this.state = {
              status: 'CONNECTED',
              discordConnected: msg.discordConnected,
              discordUser: msg.discordUser,
              companionVersion: msg.companionVersion,
            };
            this.notify();
          } else if (msg.type === 'ERROR' && msg.error) {
            this.state = {
              ...this.state,
              error: msg.error,
            };
            this.notify();
          }
        } catch {}
      };

      ws.onclose = () => {
        if (this.socket !== ws) return;
        this.isConnecting = false;
        this.socket = null;
        this.state = {
          status: this.prefs.enabled ? 'DISCONNECTED' : 'DISABLED',
          discordConnected: false,
          discordUser: undefined,
        };
        this.notify();
        if (this.prefs.enabled) {
          this.scheduleReconnect();
        }
      };

      ws.onerror = () => {
        if (this.socket !== ws) return;
        this.isConnecting = false;
      };
    } catch (err: any) {
      this.isConnecting = false;
      this.state = {
        status: 'DISCONNECTED',
        discordConnected: false,
        error: err.message,
      };
      this.notify();
      this.scheduleReconnect();
    }
  }

  public disconnect(): void {
    this.clearReconnectTimer();
    this.reconnectAttempts = 0;
    this.lastSentPrivacy = null;
    if (this.socket) {
      const ws = this.socket;
      this.socket = null;
      try {
        ws.close();
      } catch {}
    }
    this.isConnecting = false;
    this.state = { status: 'DISABLED', discordConnected: false };
    this.notify();
  }

  /**
   * Event-driven playback update.
   * Only the designated leader tab sends updates to avoid tab conflicts.
   */
  public updatePlayback(payload: DiscordPresencePlaybackPayload): void {
    if (!this.prefs.enabled || !this.prefs.autoShare) return;

    if (!discordPresenceCoordinator.isLeader()) {
      return;
    }

    const privacyMatches =
      this.lastSentPrivacy !== null &&
      this.lastSentPrivacy.hideTitle === this.prefs.hideTitle &&
      this.lastSentPrivacy.hideEpisode === this.prefs.hideEpisode;

    if (privacyMatches && this.isPayloadEqual(this.lastPayload, payload)) {
      return;
    }

    this.lastPayload = payload;
    this.sendPlaybackUpdate(payload);
  }

  private sendPlaybackUpdate(payload: DiscordPresencePlaybackPayload): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      if (this.prefs.enabled) {
        this.scheduleReconnect();
      }
      return;
    }

    const sanitizedPayload: DiscordPresencePlaybackPayload = {
      ...payload,
      hideTitle: this.prefs.hideTitle,
      hideEpisode: this.prefs.hideEpisode,
    };

    this.lastSentPrivacy = {
      hideTitle: this.prefs.hideTitle,
      hideEpisode: this.prefs.hideEpisode,
    };

    this.sendMessage({
      type: 'PLAYBACK_UPDATE',
      payload: sanitizedPayload,
      tabId: discordPresenceCoordinator.tabId,
    });
  }

  public clearActivity(): void {
    this.lastPayload = null;
    this.lastSentPrivacy = null;
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.sendMessage({
        type: 'CLEAR_ACTIVITY',
        tabId: discordPresenceCoordinator.tabId,
      });
    }
  }

  private sendMessage(msg: CompanionClientMessage): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      try {
        this.socket.send(JSON.stringify(msg));
      } catch (err) {
        console.warn('[DiscordPresenceService] Send error:', err);
      }
    }
  }

  private isPayloadEqual(
    a: DiscordPresencePlaybackPayload | null,
    b: DiscordPresencePlaybackPayload | null
  ): boolean {
    if (a === null && b === null) return true;
    if (a === null || b === null) return false;

    if (
      a.routeId !== b.routeId ||
      a.animeTitle !== b.animeTitle ||
      a.episodeNumber !== b.episodeNumber ||
      a.isPlaying !== b.isPlaying ||
      (a.seasonNumber ?? 1) !== (b.seasonNumber ?? 1) ||
      (a.serverLabel ?? '') !== (b.serverLabel ?? '') ||
      (a.artworkUrl ?? '') !== (b.artworkUrl ?? '')
    ) {
      return false;
    }

    if (a.isPlaying && b.isPlaying) {
      const aStart = a.startTimestamp ?? 0;
      const bStart = b.startTimestamp ?? 0;
      if (Math.abs(aStart - bStart) > 2500) {
        return false;
      }
    }

    return true;
  }

  private setupPageListeners(): void {
    if (typeof window === 'undefined') return;

    const onUnload = () => {
      if (discordPresenceCoordinator.isLeader()) {
        this.clearActivity();
      }
    };

    const onFocusOrVisible = () => {
      if (
        this.prefs.enabled &&
        (!this.socket || this.socket.readyState === WebSocket.CLOSED) &&
        !this.isConnecting
      ) {
        this.reconnectAttempts = 0;
        this.connect();
      }
    };

    window.addEventListener('beforeunload', onUnload);
    window.addEventListener('pagehide', onUnload);
    window.addEventListener('focus', onFocusOrVisible);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          onFocusOrVisible();
        }
      });
    }
  }
}

export const discordPresenceService = new DiscordPresenceService();
