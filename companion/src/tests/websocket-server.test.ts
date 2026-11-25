import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { WebSocket } from 'ws';
import { CompanionWebSocketServer } from '../server/websocket-server.js';
import { PresenceCoordinator } from '../coordinator/presence-coordinator.js';
import type { DiscordActivity, DiscordIpcClient } from '../discord/ipc-client.js';
import type { CompanionServerMessage } from '@7anime/shared';

class MockDiscordIpcClient extends EventEmitter {
  public connected = true;
  public user = { id: '123456', username: 'AnimeFan' };
  public activities: (DiscordActivity | null)[] = [];

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
  }
}

test('CompanionWebSocketServer: connects, validates payload fields, and updates activity', async () => {
  const mockIpc = new MockDiscordIpcClient() as unknown as DiscordIpcClient;
  const coordinator = new PresenceCoordinator(mockIpc);
  const server = new CompanionWebSocketServer(coordinator);

  const port = await server.start(0);
  assert.ok(port > 0);

  const ws = new WebSocket(`ws://127.0.0.1:${port}`, {
    headers: {
      origin: 'http://localhost:5173',
    },
  });

  const messagesReceived: CompanionServerMessage[] = [];

  await new Promise<void>((resolve, reject) => {
    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          type: 'PLAYBACK_UPDATE',
          payload: {
            animeTitle: 'Demon Slayer',
            routeId: 'demon-slayer-101',
            episodeNumber: 1,
            isPlaying: true,
            currentTimeSec: 10,
            durationSec: 1400,
            startTimestamp: 1700000000000,
            artworkUrl: 'https://s4.anilist.co/demon-slayer.jpg',
            serverLabel: 'Server 1',
          },
        })
      );
    });

    ws.on('message', (raw) => {
      const parsed = JSON.parse(raw.toString()) as CompanionServerMessage;
      messagesReceived.push(parsed);
      if (messagesReceived.length >= 2) {
        resolve();
      }
    });

    ws.on('error', reject);
  });

  assert.equal(messagesReceived[0].type, 'STATUS');
  assert.equal(messagesReceived[0].discordConnected, true);
  assert.equal(messagesReceived[0].discordUser?.username, 'AnimeFan');

  const sent = (mockIpc as unknown as MockDiscordIpcClient).activities;
  assert.ok(sent.length >= 1);
  assert.equal(sent[0]?.details, 'Watching Demon Slayer · Episode 1');
  assert.equal(sent[0]?.state, 'On 7Anime · Server 1');
  assert.equal(sent[0]?.assets?.large_image, 'https://s4.anilist.co/demon-slayer.jpg');
  assert.equal(sent[0]?.buttons?.length, 2);

  // Malformed artworkUrl (HTTP instead of HTTPS) must be rejected with ERROR
  ws.send(
    JSON.stringify({
      type: 'PLAYBACK_UPDATE',
      payload: {
        animeTitle: 'Demon Slayer',
        routeId: 'demon-slayer-101',
        episodeNumber: 2,
        isPlaying: true,
        currentTimeSec: 10,
        durationSec: 1400,
        artworkUrl: 'http://insecure.example.com/bad.jpg',
      },
    })
  );

  await new Promise((r) => setTimeout(r, 80));
  const errMsg = messagesReceived.find((m) => m.type === 'ERROR');
  assert.ok(errMsg, 'Invalid non-HTTPS artworkUrl must trigger ERROR response');

  ws.close();
  await server.close();
  coordinator.shutdown();
});

test('CompanionWebSocketServer: rejects connections with unauthorized Origin', async () => {
  const mockIpc = new MockDiscordIpcClient() as unknown as DiscordIpcClient;
  const coordinator = new PresenceCoordinator(mockIpc);
  const server = new CompanionWebSocketServer(coordinator);

  const port = await server.start(0);

  const ws = new WebSocket(`ws://127.0.0.1:${port}`, {
    headers: {
      origin: 'https://evil-unauthorized-site.com',
    },
  });

  const rejected = await new Promise<boolean>((resolve) => {
    ws.on('error', () => {
      resolve(true);
    });
    ws.on('open', () => {
      ws.close();
      resolve(false);
    });
  });

  assert.equal(rejected, true, 'Unauthorized origin connection must be rejected with error');

  await server.close();
  coordinator.shutdown();
});
