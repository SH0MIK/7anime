/**
 * Lightweight local tab coordinator using BroadcastChannel.
 * Guarantees that only ONE active playback tab transmits presence updates to the local companion.
 * Zero Supabase, zero backend, zero external network requests.
 */
class DiscordPresenceCoordinator {
  private channel: BroadcastChannel | null = null;
  public readonly tabId: string;
  private isCurrentLeader = false;
  private currentPlayingRoute: string | null = null;
  private leadershipListeners = new Set<(isLeader: boolean) => void>();

  constructor() {
    this.tabId = `tab_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}`;
    this.initChannel();
    this.setupUnloadListeners();
  }

  private initChannel(): void {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel('7anime_presence_coordinator');
        this.channel.onmessage = (event) => {
          this.handleChannelMessage(event.data);
        };
      } catch (err) {
        console.warn('[PresenceCoordinator] BroadcastChannel unavailable, falling back to single-tab mode');
      }
    }
  }

  public onLeadershipChange(cb: (isLeader: boolean) => void): () => void {
    this.leadershipListeners.add(cb);
    return () => {
      this.leadershipListeners.delete(cb);
    };
  }

  private notifyLeadershipChange(isLeader: boolean): void {
    for (const cb of this.leadershipListeners) {
      try {
        cb(isLeader);
      } catch (err) {
        console.warn('[PresenceCoordinator] Listener error:', err);
      }
    }
  }

  private setupUnloadListeners(): void {
    if (typeof window === 'undefined') return;

    const onUnload = () => {
      if (this.isCurrentLeader) {
        this.releaseLeadership();
      }
    };

    window.addEventListener('beforeunload', onUnload);
    window.addEventListener('pagehide', onUnload);
  }

  private handleChannelMessage(data: any): void {
    if (!data || typeof data !== 'object') return;

    if (data.type === 'CLAIM_LEADERSHIP') {
      if (data.tabId !== this.tabId) {
        // Another tab has claimed active playback leadership; yield leadership gracefully
        const wasLeader = this.isCurrentLeader;
        this.isCurrentLeader = false;
        if (wasLeader) {
          this.notifyLeadershipChange(false);
        }
      }
    } else if (data.type === 'RELEASE_LEADERSHIP') {
      // Prior leader tab stopped playback or closed
      // If this tab is currently playing something, it can re-claim leadership
      if (this.currentPlayingRoute && !this.isCurrentLeader) {
        this.claimLeadership(this.currentPlayingRoute);
      }
    }
  }

  /**
   * Claims leadership for the current tab when playback begins.
   */
  public claimLeadership(routeId: string): void {
    this.currentPlayingRoute = routeId;
    const wasLeader = this.isCurrentLeader;
    this.isCurrentLeader = true;

    if (!wasLeader) {
      this.notifyLeadershipChange(true);
    }

    if (this.channel) {
      try {
        this.channel.postMessage({
          type: 'CLAIM_LEADERSHIP',
          tabId: this.tabId,
          routeId,
          timestamp: Date.now(),
        });
      } catch {}
    }
  }

  /**
   * Releases leadership when playback ends, pauses, or tab closes.
   */
  public releaseLeadership(): void {
    const wasLeader = this.isCurrentLeader;
    this.isCurrentLeader = false;
    this.currentPlayingRoute = null;

    if (wasLeader) {
      this.notifyLeadershipChange(false);
    }

    if (this.channel && wasLeader) {
      try {
        this.channel.postMessage({
          type: 'RELEASE_LEADERSHIP',
          tabId: this.tabId,
          timestamp: Date.now(),
        });
      } catch {}
    }
  }

  public isLeader(): boolean {
    return this.isCurrentLeader;
  }
}

export const discordPresenceCoordinator = new DiscordPresenceCoordinator();
