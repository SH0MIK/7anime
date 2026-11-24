import http from 'node:http';
import { WebSocketServer as WsServer, WebSocket } from 'ws';
import type {
  CompanionClientMessage,
  CompanionServerMessage,
} from '@7anime/shared';
import { COMPANION_CONFIG } from '../config.js';
import { PresenceCoordinator } from '../coordinator/presence-coordinator.js';

export class CompanionWebSocketServer {
  private httpServer: http.Server | null = null;
  private wss: WsServer | null = null;
  private coordinator: PresenceCoordinator;
  private clients = new Set<WebSocket>();

  constructor(coordinator: PresenceCoordinator) {
    this.coordinator = coordinator;
    this.setupCoordinatorListeners();
  }

  private setupCoordinatorListeners(): void {
    this.coordinator.on('discord_ready', () => {
      this.broadcastStatus();
    });

    this.coordinator.on('discord_disconnected', () => {
      this.broadcastStatus();
    });

    this.coordinator.on('activity_updated', () => {
      this.broadcastStatus();
    });

    this.coordinator.on('activity_cleared', () => {
      this.broadcastStatus();
    });
  }

  public start(customPort = COMPANION_CONFIG.WS_PORT): Promise<number> {
    return new Promise((resolve, reject) => {
      this.httpServer = http.createServer((req, res) => {
        // Return minimal status for localhost HTTP diagnostics
        if (req.method === 'GET' && req.url === '/health') {
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': 'http://localhost:5173',
          });
          res.end(
            JSON.stringify({
              status: 'ok',
              service: '7anime-presence-companion',
              discordConnected: this.coordinator.isDiscordConnected,
              version: COMPANION_CONFIG.VERSION,
            })
          );
          return;
        }

        res.writeHead(404);
        res.end();
      });

      this.wss = new WsServer({
        server: this.httpServer,
        maxPayload: COMPANION_CONFIG.MAX_PAYLOAD_BYTES,
        verifyClient: (info, callback) => {
          this.verifyClientConnection(info, callback);
        },
      });

      this.wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
        this.handleClientConnected(ws, req);
      });

      this.wss.on('error', (err) => {
        console.error('[CompanionWS] Server error:', err);
      });

      // Bind exclusively to 127.0.0.1 (IPv4 loopback)
      this.httpServer.listen(customPort, COMPANION_CONFIG.WS_HOST, () => {
        const address = this.httpServer?.address();
        const actualPort = typeof address === 'object' && address ? address.port : customPort;
        console.log(`[CompanionWS] Listening securely on ws://${COMPANION_CONFIG.WS_HOST}:${actualPort}`);
        resolve(actualPort);
      });

      this.httpServer.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Enforces local security: loopback IP verification and origin whitelist validation.
   */
  private verifyClientConnection(
    info: { origin: string; secure: boolean; req: http.IncomingMessage },
    callback: (res: boolean, code?: number, message?: string) => void
  ): void {
    const remoteIp = info.req.socket.remoteAddress;
    const isLoopback =
      remoteIp === '127.0.0.1' ||
      remoteIp === '::1' ||
      remoteIp === '::ffff:127.0.0.1';

    if (!isLoopback) {
      console.warn(`[CompanionWS] Rejected connection from non-loopback IP: ${remoteIp}`);
      callback(false, 403, 'Forbidden: Loopback connections only');
      return;
    }

    const rawOrigin = info.origin || info.req.headers.origin;
    if (rawOrigin) {
      const origin = rawOrigin.toLowerCase().trim();
      if (!COMPANION_CONFIG.EXACT_ALLOWED_ORIGINS.has(origin)) {
        console.warn(`[CompanionWS] Rejected connection with unauthorized Origin: "${origin}"`);
        callback(false, 403, 'Forbidden: Unauthorized origin');
        return;
      }
    }

    callback(true);
  }

  private handleClientConnected(ws: WebSocket, req: http.IncomingMessage): void {
    this.clients.add(ws);

    // Send immediate status on connection
    this.sendToClient(ws, this.buildStatusMessage());

    ws.on('message', (data: Buffer | string) => {
      this.handleIncomingMessage(ws, data);
    });

    ws.on('close', () => {
      this.clients.delete(ws);
      // If all browser tabs disconnect, clear activity after grace period
      if (this.clients.size === 0) {
        this.coordinator.clearActivity();
      }
    });

    ws.on('error', (err) => {
      console.warn('[CompanionWS] Client socket error:', err.message);
      this.clients.delete(ws);
    });
  }

  private handleIncomingMessage(ws: WebSocket, rawData: Buffer | string): void {
    try {
      const text = typeof rawData === 'string' ? rawData : rawData.toString('utf-8');
      if (text.length > COMPANION_CONFIG.MAX_PAYLOAD_BYTES) {
        this.sendToClient(ws, {
          type: 'ERROR',
          discordConnected: this.coordinator.isDiscordConnected,
          companionVersion: COMPANION_CONFIG.VERSION,
          error: 'Payload exceeded max size limit',
        });
        return;
      }

      const msg = JSON.parse(text) as CompanionClientMessage;
      if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') {
        return;
      }

      switch (msg.type) {
        case 'HANDSHAKE':
        case 'GET_STATUS':
          this.sendToClient(ws, this.buildStatusMessage());
          break;

        case 'PLAYBACK_UPDATE':
          if (msg.payload && typeof msg.payload === 'object') {
            const p = msg.payload;
            const isValid =
              typeof p.animeTitle === 'string' &&
              p.animeTitle.length <= 256 &&
              typeof p.routeId === 'string' &&
              p.routeId.length <= 128 &&
              typeof p.episodeNumber === 'number' &&
              Number.isInteger(p.episodeNumber) &&
              p.episodeNumber >= 0 &&
              typeof p.isPlaying === 'boolean' &&
              typeof p.currentTimeSec === 'number' &&
              typeof p.durationSec === 'number';

            if (isValid) {
              this.coordinator.updatePlayback(p);
            } else {
              console.warn('[CompanionWS] Dropped malformed PLAYBACK_UPDATE payload');
            }
          }
          break;

        case 'CLEAR_ACTIVITY':
          this.coordinator.clearActivity();
          break;

        default:
          console.warn(`[CompanionWS] Unknown message type received: ${(msg as any).type}`);
      }
    } catch (err: any) {
      console.warn('[CompanionWS] Malformed message rejected:', err.message);
    }
  }

  private buildStatusMessage(): CompanionServerMessage {
    const user = this.coordinator.discordUser;
    const current = this.coordinator.currentActivity;

    return {
      type: 'STATUS',
      discordConnected: this.coordinator.isDiscordConnected,
      discordUser: user ? { username: user.username, id: user.id } : undefined,
      currentActivity: current
        ? {
            animeTitle: current.details,
            episodeNumber: undefined,
            isPlaying: current.assets?.small_image === 'play',
          }
        : null,
      companionVersion: COMPANION_CONFIG.VERSION,
    };
  }

  private sendToClient(ws: WebSocket, message: CompanionServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  public broadcastStatus(): void {
    const msg = JSON.stringify(this.buildStatusMessage());
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    }
  }

  public close(): Promise<void> {
    return new Promise((resolve) => {
      for (const client of this.clients) {
        try {
          client.close();
        } catch {}
      }
      this.clients.clear();

      if (this.wss) {
        this.wss.close();
        this.wss = null;
      }

      if (this.httpServer) {
        this.httpServer.close(() => resolve());
        this.httpServer = null;
      } else {
        resolve();
      }
    });
  }
}
