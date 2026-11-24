import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PresenceCoordinator } from '../coordinator/presence-coordinator.js';
import type { DiscordActivity, DiscordIpcClient } from '../discord/ipc-client.js';
import type { DiscordPresencePlaybackPayload } from '@7anime/shared';

class MockDiscordIpcClient extends EventEmitter {
  public connected = true;
  public user = { id: '999999', username: 'TestAnimeWatcher' };
  public activitiesSent: (DiscordActivity | null)[] = [];

  public async setActivity(activity: DiscordActivity | null): Promise<boolean> {
    this.activitiesSent.push(activity);
    return true;
  }

  public async clearActivity(): Promise<boolean> {
    this.activitiesSent.push(null);
    return true;
  }

  public disconnect(): void {
    this.connected = false;
  }
}

test('PresenceCoordinator: dispatches first update immediately', async () => {
  const mockIpc = new MockDiscordIpcClient() as unknown as DiscordIpcClient;
  const coordinator = new PresenceCoordinator(mockIpc);

  const payload: DiscordPresencePlaybackPayload = {
    animeTitle: 'Naruto',
    routeId: 'naruto-20',
    episodeNumber: 1,
    isPlaying: true,
    currentTimeSec: 5,
    durationSec: 1400,
    startTimestamp: 1700000000000,
  };

  coordinator.updatePlayback(payload);

  // Give tick for async dispatch
  await new Promise((r) => setTimeout(r, 50));

  const sent = (mockIpc as unknown as MockDiscordIpcClient).activitiesSent;
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.details, 'Naruto');
  assert.equal(sent[0]?.state, 'Episode 1');
  coordinator.shutdown();
});

test('PresenceCoordinator: drops identical duplicate payloads without invoking IPC', async () => {
  const mockIpc = new MockDiscordIpcClient() as unknown as DiscordIpcClient;
  const coordinator = new PresenceCoordinator(mockIpc);

  const payload: DiscordPresencePlaybackPayload = {
    animeTitle: 'Naruto',
    routeId: 'naruto-20',
    episodeNumber: 1,
    isPlaying: true,
    currentTimeSec: 5,
    durationSec: 1400,
    startTimestamp: 1700000000000,
  };

  coordinator.updatePlayback(payload);
  await new Promise((r) => setTimeout(r, 50));

  // Send identical payload 5 times
  for (let i = 0; i < 5; i++) {
    coordinator.updatePlayback(payload);
  }
  await new Promise((r) => setTimeout(r, 50));

  const sent = (mockIpc as unknown as MockDiscordIpcClient).activitiesSent;
  // Must still only be 1 update sent!
  assert.equal(sent.length, 1);
  coordinator.shutdown();
});

test('PresenceCoordinator: clears activity immediately on clearActivity', async () => {
  const mockIpc = new MockDiscordIpcClient() as unknown as DiscordIpcClient;
  const coordinator = new PresenceCoordinator(mockIpc);

  const payload: DiscordPresencePlaybackPayload = {
    animeTitle: 'Naruto',
    routeId: 'naruto-20',
    episodeNumber: 1,
    isPlaying: true,
    currentTimeSec: 5,
    durationSec: 1400,
    startTimestamp: 1700000000000,
  };

  coordinator.updatePlayback(payload);
  await new Promise((r) => setTimeout(r, 50));

  await coordinator.clearActivity();

  const sent = (mockIpc as unknown as MockDiscordIpcClient).activitiesSent;
  assert.equal(sent.length, 2);
  assert.equal(sent[1], null);
  coordinator.shutdown();
});
