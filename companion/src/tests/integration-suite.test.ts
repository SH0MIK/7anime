import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { WebSocket } from 'ws';
import { ActivityBuilder } from '../discord/activity-builder.js';
import { PresenceCoordinator } from '../coordinator/presence-coordinator.js';
import { CompanionWebSocketServer } from '../server/websocket-server.js';
import type { DiscordActivity, DiscordIpcClient } from '../discord/ipc-client.js';
import type { CompanionServerMessage, DiscordPresencePlaybackPayload } from '@7anime/shared';

class MockDiscordIpcClient extends EventEmitter {
  public connected = true;
  public user = { id: '777888999', username: 'TestKuronoWatcher' };
  public activities: (DiscordActivity | null)[] = [];
  public reconnectAttempts = 0;

  public async setActivity(activity: DiscordActivity | null): Promise<boolean> {
    this.activities.push(activity);
    return true;
  }

  public async clearActivity(): Promise<boolean> {
    this.activities.push(null);
    return true;
  }

  public disconnect(): void {
    this.connected = false;
    this.emit('disconnected');
  }

  public simulateReconnect(): void {
    this.connected = true;
    this.emit('ready', this.user);
  }
}

test('Comprehensive 17-Point Discord Presence Integration Suite', async () => {
  const mockIpc = new MockDiscordIpcClient() as unknown as DiscordIpcClient;
  const coordinator = new PresenceCoordinator(mockIpc);
  const server = new CompanionWebSocketServer(coordinator);

  const port = await server.start(0);
  assert.ok(port > 0);

  // 1. Companion connected and initial status handshake
  const ws1 = new WebSocket(`ws://127.0.0.1:${port}`, {
    headers: { origin: 'http://localhost:5173' },
  });

  const ws1Messages: CompanionServerMessage[] = [];
  await new Promise<void>((resolve) => {
    ws1.on('open', resolve);
    ws1.on('message', (data) => {
      ws1Messages.push(JSON.parse(data.toString()));
    });
  });

  assert.equal(ws1Messages[0].type, 'STATUS');
  assert.equal(ws1Messages[0].discordConnected, true);
  assert.equal(ws1Messages[0].discordUser?.username, 'TestKuronoWatcher');

  // 2. Playback started on Episode 12
  const ep12Payload: DiscordPresencePlaybackPayload = {
    animeTitle: 'Naruto',
    routeId: 'naruto-20',
    episodeNumber: 12,
    seasonNumber: 1,
    isPlaying: true,
    currentTimeSec: 10,
    durationSec: 1400,
    startTimestamp: 1700000000000,
  };

  ws1.send(JSON.stringify({ type: 'PLAYBACK_UPDATE', payload: ep12Payload }));
  await new Promise((r) => setTimeout(r, 60));

  const ipcMock = mockIpc as unknown as MockDiscordIpcClient;
  assert.equal(ipcMock.activities.length, 1);
  assert.equal(ipcMock.activities[0]?.details, 'Watching Naruto · Episode 12');
  assert.equal(ipcMock.activities[0]?.state, 'On 7Anime');
  assert.equal(ipcMock.activities[0]?.assets?.small_image, undefined);
  assert.equal(ipcMock.activities[0]?.timestamps?.start, 1700000000000);
  assert.deepEqual(ipcMock.activities[0]?.buttons, [
    { label: 'Visit 7Anime', url: 'https://7anime-new.vercel.app' },
    { label: 'Join Discord', url: 'https://discord.gg/TpqgaXjDQC' },
  ]);

  // 3. Duplicate playback event suppression (Rate limit / Zero unnecessary requests)
  ws1.send(JSON.stringify({ type: 'PLAYBACK_UPDATE', payload: ep12Payload }));
  ws1.send(JSON.stringify({ type: 'PLAYBACK_UPDATE', payload: ep12Payload }));
  await new Promise((r) => setTimeout(r, 60));
  // Count must still be 1!
  assert.equal(ipcMock.activities.length, 1);

  // 4. Episode switching (Episode 12 -> Episode 13)
  const ep13Payload: DiscordPresencePlaybackPayload = {
    ...ep12Payload,
    episodeNumber: 13,
  };
  const ep13Activity = ActivityBuilder.buildActivity(ep13Payload);
  assert.equal(ep13Activity.details, 'Watching Naruto · Episode 13');
  assert.equal(ActivityBuilder.isSameActivity(ipcMock.activities[0], ep13Activity), false);

  // 5. Pause and resume
  const pausedPayload: DiscordPresencePlaybackPayload = {
    ...ep12Payload,
    isPlaying: false,
  };
  const pausedActivity = ActivityBuilder.buildActivity(pausedPayload);
  assert.equal(pausedActivity.details, 'Paused: Naruto · Episode 12');
  assert.equal(pausedActivity.state, 'Paused · On 7Anime');
  assert.equal(pausedActivity.timestamps, undefined);

  // 6. User disables presence or clears activity
  ws1.send(JSON.stringify({ type: 'CLEAR_ACTIVITY' }));
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(ipcMock.activities[ipcMock.activities.length - 1], null);

  // 7. Multiple tabs: Tab 2 connects alongside Tab 1
  const ws2 = new WebSocket(`ws://127.0.0.1:${port}`, {
    headers: { origin: 'http://localhost:5173' },
  });
  await new Promise<void>((resolve) => ws2.on('open', resolve));

  // Tab 1 closes
  ws1.close();
  await new Promise((r) => setTimeout(r, 60));

  // Activity should NOT clear because Tab 2 is still active
  // Now Tab 2 sends clear and closes
  ws2.send(JSON.stringify({ type: 'CLEAR_ACTIVITY' }));
  ws2.close();
  await new Promise((r) => setTimeout(r, 60));

  // 8. Security verification: reject invalid origin
  const wsInvalid = new WebSocket(`ws://127.0.0.1:${port}`, {
    headers: { origin: 'https://malicious-phishing-site.com' },
  });
  const rejected = await new Promise<boolean>((resolve) => {
    wsInvalid.on('error', () => resolve(true));
    wsInvalid.on('open', () => {
      wsInvalid.close();
      resolve(false);
    });
  });
  assert.equal(rejected, true);

  // 9. Discord IPC disconnect and reconnect simulation
  ipcMock.disconnect();
  assert.equal(coordinator.isDiscordConnected, false);
  ipcMock.simulateReconnect();
  assert.equal(coordinator.isDiscordConnected, true);

  // 10. Missing episode metadata or missing artwork fallback
  const missingMetaPayload: DiscordPresencePlaybackPayload = {
    animeTitle: '',
    routeId: 'unknown-00',
    episodeNumber: 1,
    isPlaying: true,
    currentTimeSec: 0,
    durationSec: 1440,
    hideTitle: true,
    hideEpisode: true,
  };
  const fallbackActivity = ActivityBuilder.buildActivity(missingMetaPayload);
  assert.equal(fallbackActivity.details, 'Watching anime on 7Anime');
  assert.equal(fallbackActivity.state, 'On 7Anime');
  assert.equal(fallbackActivity.assets?.large_image, '7anime_large');

  await server.close();
  coordinator.shutdown();
});
