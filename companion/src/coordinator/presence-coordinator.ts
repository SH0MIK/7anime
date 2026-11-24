import { EventEmitter } from 'node:events';
import type { DiscordPresencePlaybackPayload } from '@7anime/shared';
import { DiscordIpcClient, DiscordActivity } from '../discord/ipc-client.js';
import { ActivityBuilder } from '../discord/activity-builder.js';
import { COMPANION_CONFIG } from '../config.js';

export class PresenceCoordinator extends EventEmitter {
  private ipcClient: DiscordIpcClient;
  private lastSentActivity: DiscordActivity | null = null;
  private lastSentTime = 0;
  private pendingActivity: DiscordActivity | null = null;
  private cooldownTimer: NodeJS.Timeout | null = null;
  private currentRawPayload: DiscordPresencePlaybackPayload | null = null;

  constructor(ipcClient: DiscordIpcClient) {
    super();
    this.ipcClient = ipcClient;
    this.setupListeners();
  }

  private setupListeners(): void {
    this.ipcClient.on('ready', (user) => {
      this.emit('discord_ready', user);
      // Re-apply current activity if any was pending when Discord became ready
      if (this.currentRawPayload) {
        this.updatePlayback(this.currentRawPayload);
      }
    });

    this.ipcClient.on('disconnected', () => {
      this.lastSentActivity = null;
      this.emit('discord_disconnected');
    });

    this.ipcClient.on('error', (err) => {
      this.emit('discord_error', err);
    });
  }

  public get isDiscordConnected(): boolean {
    return this.ipcClient.connected;
  }

  public get discordUser() {
    return this.ipcClient.user;
  }

  public get currentActivity(): DiscordActivity | null {
    return this.lastSentActivity;
  }

  /**
   * Updates playback activity with deduplication, debouncing, and strict rate-limit protection.
   */
  public updatePlayback(payload: DiscordPresencePlaybackPayload): void {
    this.currentRawPayload = payload;
    const targetActivity = ActivityBuilder.buildActivity(payload);

    // Rule 1: Duplicate update suppression — If identical to last sent, drop immediately
    if (ActivityBuilder.isSameActivity(this.lastSentActivity, targetActivity)) {
      return;
    }

    // Rule 2: Coalesce rapid consecutive updates
    this.pendingActivity = targetActivity;

    const now = Date.now();
    const elapsedSinceLast = now - this.lastSentTime;

    if (elapsedSinceLast >= COMPANION_CONFIG.DISCORD_MIN_INTERVAL_MS && !this.cooldownTimer) {
      // Cooldown expired; dispatch immediately
      this.dispatchPendingActivity();
    } else if (!this.cooldownTimer) {
      // Within cooldown interval; schedule throttled release
      const delay = Math.max(
        COMPANION_CONFIG.DISCORD_DEBOUNCE_MS,
        COMPANION_CONFIG.DISCORD_MIN_INTERVAL_MS - elapsedSinceLast
      );

      this.cooldownTimer = setTimeout(() => {
        this.cooldownTimer = null;
        this.dispatchPendingActivity();
      }, delay);
    }
  }

  private async dispatchPendingActivity(): Promise<void> {
    if (!this.pendingActivity) return;

    const activityToSend = this.pendingActivity;
    this.pendingActivity = null;

    if (ActivityBuilder.isSameActivity(this.lastSentActivity, activityToSend)) {
      return;
    }

    this.lastSentActivity = activityToSend;
    this.lastSentTime = Date.now();

    if (this.ipcClient.connected) {
      try {
        await this.ipcClient.setActivity(activityToSend);
        this.emit('activity_updated', activityToSend);
      } catch (err) {
        this.emit('error', err);
      }
    }
  }

  /**
   * Clears Discord Rich Presence immediately.
   */
  public async clearActivity(): Promise<void> {
    this.currentRawPayload = null;
    this.pendingActivity = null;

    if (this.cooldownTimer) {
      clearTimeout(this.cooldownTimer);
      this.cooldownTimer = null;
    }

    if (this.lastSentActivity === null) {
      return; // Already cleared
    }

    this.lastSentActivity = null;
    this.lastSentTime = Date.now();

    if (this.ipcClient.connected) {
      try {
        await this.ipcClient.clearActivity();
        this.emit('activity_cleared');
      } catch (err) {
        this.emit('error', err);
      }
    }
  }

  public shutdown(): void {
    if (this.cooldownTimer) {
      clearTimeout(this.cooldownTimer);
      this.cooldownTimer = null;
    }
    this.ipcClient.disconnect();
  }
}
