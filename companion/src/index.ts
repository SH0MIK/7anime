import { COMPANION_CONFIG, getValidatedDiscordClientId } from './config.js';
import { DiscordIpcClient } from './discord/ipc-client.js';
import { PresenceCoordinator } from './coordinator/presence-coordinator.js';
import { CompanionWebSocketServer } from './server/websocket-server.js';

async function bootstrap() {
  console.log('====================================================');
  console.log(`  7Anime Desktop Presence Companion v${COMPANION_CONFIG.VERSION}`);
  console.log('  Local Discord Rich Presence Bridge');
  console.log('====================================================');

  // 1. Verify and enforce configured Discord Application ID
  let validatedClientId: string;
  try {
    validatedClientId = getValidatedDiscordClientId();
  } catch (err: any) {
    console.error(`\n${err.message}\n`);
    process.exit(1);
  }

  const ipcClient = new DiscordIpcClient(validatedClientId);
  const coordinator = new PresenceCoordinator(ipcClient);
  const wsServer = new CompanionWebSocketServer(coordinator);

  ipcClient.on('ready', (user) => {
    console.log(`[DiscordIPC] Rich Presence active for Discord user: @${user?.username || 'unknown'} (${user?.id || 'n/a'})`);
  });

  ipcClient.on('disconnected', () => {
    console.log('[DiscordIPC] Discord client disconnected. Waiting for client...');
  });

  ipcClient.on('reconnect_exhausted', () => {
    console.log(
      `[DiscordIPC] Initial reconnect attempts reached (${COMPANION_CONFIG.MAX_RECONNECT_ATTEMPTS}). Switching to passive background check every ${Math.round(COMPANION_CONFIG.IDLE_PROBE_INTERVAL_MS / 1000)}s.`
    );
  });

  coordinator.on('discord_error', (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[DiscordIPC] Error: ${msg}`);
  });

  coordinator.on('error', (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Coordinator] Error: ${msg}`);
  });

  coordinator.on('activity_updated', (activity) => {
    console.log(`[Activity] Synchronized: "${activity.details}" | "${activity.state}"`);
  });

  coordinator.on('activity_cleared', () => {
    console.log('[Activity] Cleared presence activity.');
  });

  // 2. Start local WebSocket bridge server (Loopback 127.0.0.1 only)
  try {
    await wsServer.start();
  } catch (err: any) {
    console.error(`[Fatal] Failed to bind local companion WebSocket: ${err.message}`);
    process.exit(1);
  }

  // 3. Connect to Discord Desktop IPC
  console.log('[DiscordIPC] Searching for local Discord desktop client on OS named pipes...');
  const connected = await ipcClient.connect();
  if (connected) {
    console.log('[DiscordIPC] Connected to Discord Desktop pipe; awaiting READY handshake...');
  } else {
    console.log('[DiscordIPC] Discord desktop client not currently running. Will connect automatically when opened.');
  }

  // Graceful termination
  const shutdown = async () => {
    console.log('\n[Companion] Shutting down companion cleanly...');
    await coordinator.clearActivity();
    coordinator.shutdown();
    await wsServer.close();
    console.log('[Companion] Stopped.');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  console.error('[Fatal] Companion startup failure:', err);
  process.exit(1);
});
