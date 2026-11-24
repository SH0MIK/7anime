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

class DiscordPresenceService {
  private socket: WebSocket | null = null;
  private state: PresenceState = {
    status: 'DISABLED',
    discordConnected: false,
  };
  private listeners = new Set<(state: PresenceState) => void>();
  private lastPayload: DiscordPresencePlaybackPayload | null = null;
  private isConnecting = false;
  private prefs: DiscordPresencePreferences = {
    enabled: false,
    autoShare: true,
    hideTitle: false,
    hideEpisode: false,
  };
  private isInitialized = false;

  constructor() {
    this.setupPageListeners();
    this.setupLeadershipListener();
  }

  private setupLeadershipListener(): void {
    discordPresenceCoordinator.onLeadershipChange((isLeader) => {
      if (isLeader && this.lastPayload && this.prefs.enabled && this.prefs.autoShare) {
        // Tab acquired active playback leadership; synchronize playback immediately
        this.sendPlaybackUpdate(this.lastPayload);
      }
    });
  }

  public init(prefs: DiscordPresencePreferences): void {
    this.prefs = prefs;
    this.isInitialized = true;

    if (prefs.enabled) {
      this.connect();
    } else {
      this.disconnect();
    }
  }

  public updatePrefs(prefs: DiscordPresencePreferences): void {
    const wasEnabled = this.prefs.enabled;
    this.prefs = prefs;

    if (prefs.enabled && !wasEnabled) {
      this.connect();
    } else if (!prefs.enabled && wasEnabled) {
      this.clearActivity();
      this.disconnect();
    } else if (prefs.enabled && this.lastPayload) {
      // Re-send with updated privacy preferences
      this.updatePlayback(this.lastPayload);
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

  /**
   * Attempts connection to local companion application.
   * If companion is offline, fails gracefully without aggressive polling.
   */
  public connect(): void {
    if (!this.prefs.enabled) {
      this.state = { status: 'DISABLED', discordConnected: false };
      this.notify();
      return;
    }

    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    if (this.isConnecting) return;
    this.isConnecting = true;

    this.state = { ...this.state, status: 'CONNECTING' };
    this.notify();

    try {
      this.socket = new WebSocket(COMPANION_WS_URL);

      this.socket.onopen = () => {
        this.isConnecting = false;
        this.state = { ...this.state, status: 'CONNECTED' };
        this.notify();

        // Perform initial handshake
        this.sendMessage({
          type: 'HANDSHAKE',
          tabId: discordPresenceCoordinator.tabId,
          version: '1.0.0',
        });

        // If tab was already playing, re-send current playback
        if (this.lastPayload && discordPresenceCoordinator.isLeader()) {
          this.sendPlaybackUpdate(this.lastPayload);
        }
      };

      this.socket.onmessage = (event) => {
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
          }
        } catch {}
      };

      this.socket.onclose = () => {
        this.isConnecting = false;
        this.socket = null;
        this.state = {
          status: this.prefs.enabled ? 'DISCONNECTED' : 'DISABLED',
          discordConnected: false,
          discordUser: undefined,
        };
        this.notify();
      };

      this.socket.onerror = () => {
        this.isConnecting = false;
        // On error, let onclose handle cleanup without throwing unhandled exceptions
      };
    } catch (err: any) {
      this.isConnecting = false;
      this.state = {
        status: 'DISCONNECTED',
        discordConnected: false,
        error: err.message,
      };
      this.notify();
    }
  }

  public disconnect(): void {
    if (this.socket) {
      try {
        this.socket.close();
      } catch {}
      this.socket = null;
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

    // Multi-tab check: only the active tab can command presence
    if (!discordPresenceCoordinator.isLeader()) {
      return;
    }

    // Deduplication check
    if (this.isPayloadEqual(this.lastPayload, payload)) {
      return;
    }

    this.lastPayload = payload;
    this.sendPlaybackUpdate(payload);
  }

  private sendPlaybackUpdate(payload: DiscordPresencePlaybackPayload): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      // If companion is offline, do not block playback or continuously loop
      return;
    }

    const sanitizedPayload: DiscordPresencePlaybackPayload = {
      ...payload,
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

    return (
      a.routeId === b.routeId &&
      a.episodeNumber === b.episodeNumber &&
      a.isPlaying === b.isPlaying &&
      a.seasonNumber === b.seasonNumber
    );
  }

  private setupPageListeners(): void {
    if (typeof window === 'undefined') return;

    const onUnload = () => {
      if (discordPresenceCoordinator.isLeader()) {
        this.clearActivity();
      }
    };

    window.addEventListener('beforeunload', onUnload);
    window.addEventListener('pagehide', onUnload);
  }
}

export const discordPresenceService = new DiscordPresenceService();
