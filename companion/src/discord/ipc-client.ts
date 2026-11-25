import net from 'node:net';
import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import { COMPANION_CONFIG, getDiscordIpcPaths } from '../config.js';

export const DiscordIpcOpcode = {
  HANDSHAKE: 0,
  FRAME: 1,
  CLOSE: 2,
  PING: 3,
  PONG: 4,
} as const;

export type DiscordIpcOpcodeType = (typeof DiscordIpcOpcode)[keyof typeof DiscordIpcOpcode];

export interface DiscordActivity {
  type?: number; // 3 for Watching, 0 for Playing
  details?: string;
  state?: string;
  timestamps?: {
    start?: number;
    end?: number;
  };
  assets?: {
    large_image?: string;
    large_text?: string;
    small_image?: string;
    small_text?: string;
  };
  buttons?: Array<{
    label: string;
    url: string;
  }>;
  instance?: boolean;
}

export interface DiscordUser {
  id: string;
  username: string;
  discriminator?: string;
  avatar?: string;
}

interface PendingIpcRequest {
  resolve: (ok: boolean) => void;
  timer: NodeJS.Timeout;
}

export class DiscordIpcClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private isConnected = false;
  private isReady = false;
  private currentUser: DiscordUser | null = null;
  private clientId: string;
  private incomingBuffer = Buffer.alloc(0);
  private reconnectTimer: NodeJS.Timeout | null = null;
  private idleProbeTimer: NodeJS.Timeout | null = null;
  private connectPromise: Promise<boolean> | null = null;
  private reconnectAttempts = 0;
  private hasLoggedExhaustion = false;
  private isManuallyClosed = false;
  private pendingRequests = new Map<string, PendingIpcRequest>();

  constructor(clientId = COMPANION_CONFIG.DISCORD_CLIENT_ID) {
    super();
    this.clientId = clientId;
  }

  public get connected(): boolean {
    return this.isConnected && this.isReady;
  }

  public get user(): DiscordUser | null {
    return this.currentUser;
  }

  /**
   * Attempts connection to Discord Desktop IPC through standard local pipes/sockets.
   * Deduplicates concurrent connection attempts cleanly.
   */
  public async connect(): Promise<boolean> {
    if (this.isConnected) return true;
    if (this.connectPromise) return this.connectPromise;

    this.isManuallyClosed = false;
    this.clearTimers();

    this.connectPromise = (async () => {
      try {
        const paths = getDiscordIpcPaths();
        for (const pipePath of paths) {
          if (this.isManuallyClosed) return false;
          const success = await this.tryConnectPipe(pipePath);
          if (success) {
            this.reconnectAttempts = 0;
            return true;
          }
        }

        this.scheduleReconnect();
        return false;
      } finally {
        this.connectPromise = null;
      }
    })();

    return this.connectPromise;
  }

  private tryConnectPipe(pipePath: string): Promise<boolean> {
    return new Promise((resolve) => {
      let resolved = false;
      const sock = net.createConnection(pipePath);

      const fail = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          sock.removeAllListeners();
          sock.destroy();
          resolve(false);
        }
      };

      const timeout = setTimeout(fail, 500);

      sock.once('connect', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          sock.removeListener('error', fail);
          sock.removeListener('close', fail);
          this.socket = sock;
          this.isConnected = true;
          this.setupSocketListeners();
          this.sendHandshake();
          resolve(true);
        }
      });

      sock.once('error', fail);
      sock.once('close', fail);
    });
  }

  private setupSocketListeners(): void {
    if (!this.socket) return;

    this.socket.on('data', (chunk: Buffer) => {
      this.handleIncomingData(chunk);
    });

    this.socket.on('close', () => {
      const wasConnected = this.isConnected;
      this.handleDisconnect();
      if (wasConnected && !this.isManuallyClosed) {
        this.emit('disconnected');
        this.scheduleReconnect();
      }
    });

    this.socket.on('error', (err) => {
      this.emitErrorSafe(err);
    });
  }

  private handleIncomingData(chunk: Buffer): void {
    this.incomingBuffer = Buffer.concat([this.incomingBuffer, chunk]);

    while (this.incomingBuffer.length >= 8) {
      const opcode = this.incomingBuffer.readUInt32LE(0);
      const length = this.incomingBuffer.readUInt32LE(4);

      if (length > COMPANION_CONFIG.MAX_PAYLOAD_BYTES * 4) {
        this.emitErrorSafe(new Error(`Rejected oversized IPC frame (${length} bytes)`));
        this.handleDisconnect();
        break;
      }

      if (this.incomingBuffer.length < 8 + length) {
        break;
      }

      const payloadBuffer = this.incomingBuffer.subarray(8, 8 + length);
      this.incomingBuffer = this.incomingBuffer.subarray(8 + length);

      this.processPacket(opcode, payloadBuffer);
    }
  }

  private processPacket(opcode: number, payloadBuffer: Buffer): void {
    try {
      const payloadStr = payloadBuffer.toString('utf-8');
      const payload = payloadStr ? (JSON.parse(payloadStr) as Record<string, any>) : {};

      if (opcode === DiscordIpcOpcode.FRAME) {
        const nonce = typeof payload.nonce === 'string' ? payload.nonce : null;

        if (payload.evt === 'ERROR') {
          const code = payload.data?.code ?? 'UNKNOWN';
          const message = payload.data?.message || 'Discord IPC returned an error frame';
          const rpcError = new Error(`Discord RPC error (${code}): ${message}`);
          if (nonce) {
            this.resolvePendingRequest(nonce, false);
          }
          this.emitErrorSafe(rpcError);
          return;
        }

        if (payload.cmd === 'DISPATCH' && payload.evt === 'READY') {
          this.isReady = true;
          this.currentUser = payload.data?.user || null;
          this.reconnectAttempts = 0;
          this.hasLoggedExhaustion = false;
          this.clearTimers();
          this.emit('ready', this.currentUser);
          return;
        }

        if (payload.cmd === 'SET_ACTIVITY') {
          if (nonce) {
            this.resolvePendingRequest(nonce, true);
          }
          this.emit('activity_ack', payload.data ?? null);
          return;
        }
      } else if (opcode === DiscordIpcOpcode.PING) {
        this.sendPacket(DiscordIpcOpcode.PONG, payload);
      } else if (opcode === DiscordIpcOpcode.CLOSE) {
        const closeCode = payload.code ?? 'CLOSE';
        const closeMsg = payload.message ? `: ${payload.message}` : '';
        this.emitErrorSafe(new Error(`Discord IPC closed connection (${closeCode})${closeMsg}`));
        const wasManuallyClosed = this.isManuallyClosed;
        this.handleDisconnect();
        this.emit('disconnected');
        if (!wasManuallyClosed) {
          this.scheduleReconnect();
        }
      }
    } catch (err) {
      this.emitErrorSafe(new Error(`Failed to parse IPC packet: ${err}`));
    }
  }

  private emitErrorSafe(err: unknown): void {
    const normalized = err instanceof Error ? err : new Error(String(err));
    if (this.listenerCount('error') > 0) {
      this.emit('error', normalized);
    }
  }

  private resolvePendingRequest(nonce: string, ok: boolean): void {
    const entry = this.pendingRequests.get(nonce);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pendingRequests.delete(nonce);
    entry.resolve(ok);
  }

  private rejectAllPendingRequests(): void {
    for (const [, entry] of this.pendingRequests) {
      clearTimeout(entry.timer);
      entry.resolve(false);
    }
    this.pendingRequests.clear();
  }

  private sendHandshake(): void {
    const handshake = {
      v: 1,
      client_id: this.clientId,
    };
    this.sendPacket(DiscordIpcOpcode.HANDSHAKE, handshake);
  }

  private sendPacket(opcode: DiscordIpcOpcodeType, data: object): boolean {
    if (!this.socket || !this.isConnected) return false;

    try {
      const jsonStr = JSON.stringify(data);
      const payloadBuf = Buffer.from(jsonStr, 'utf-8');
      const headerBuf = Buffer.alloc(8);

      headerBuf.writeUInt32LE(opcode, 0);
      headerBuf.writeUInt32LE(payloadBuf.length, 4);

      const packet = Buffer.concat([headerBuf, payloadBuf]);
      return this.socket.write(packet);
    } catch (err) {
      this.emitErrorSafe(err);
      return false;
    }
  }

  /**
   * Sends SET_ACTIVITY command to Discord IPC and waits for Discord's response frame.
   */
  public async setActivity(activity: DiscordActivity | null): Promise<boolean> {
    if (!this.connected) return false;

    const nonce = crypto.randomUUID();
    const packet = {
      cmd: 'SET_ACTIVITY',
      args: {
        pid: process.pid,
        activity: activity || null,
      },
      nonce,
    };

    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(nonce);
        resolve(true);
      }, 2500);
      timer.unref?.();

      this.pendingRequests.set(nonce, { resolve, timer });
      const written = this.sendPacket(DiscordIpcOpcode.FRAME, packet);
      if (!written) {
        this.resolvePendingRequest(nonce, false);
      }
    });
  }

  /**
   * Clears Discord Rich Presence.
   */
  public async clearActivity(): Promise<boolean> {
    return this.setActivity(null);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.idleProbeTimer || this.isManuallyClosed) return;
    if (this.reconnectAttempts >= COMPANION_CONFIG.MAX_RECONNECT_ATTEMPTS) {
      if (!this.hasLoggedExhaustion) {
        this.hasLoggedExhaustion = true;
        this.emit('reconnect_exhausted');
      }
      // Transition to a lightweight background probe so launching Discord Desktop later still recovers
      this.idleProbeTimer = setTimeout(() => {
        this.idleProbeTimer = null;
        if (!this.isManuallyClosed && !this.isConnected) {
          this.connect().catch(() => {});
        }
      }, COMPANION_CONFIG.IDLE_PROBE_INTERVAL_MS);
      this.idleProbeTimer.unref?.();
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      COMPANION_CONFIG.RECONNECT_INITIAL_MS * Math.pow(1.5, this.reconnectAttempts - 1),
      COMPANION_CONFIG.RECONNECT_MAX_MS
    );

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      await this.connect();
    }, delay);
    this.reconnectTimer.unref?.();
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.idleProbeTimer) {
      clearTimeout(this.idleProbeTimer);
      this.idleProbeTimer = null;
    }
  }

  private handleDisconnect(): void {
    this.isConnected = false;
    this.isReady = false;
    this.currentUser = null;
    this.incomingBuffer = Buffer.alloc(0);
    this.rejectAllPendingRequests();
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
      this.socket = null;
    }
  }

  public disconnect(): void {
    this.isManuallyClosed = true;
    this.clearTimers();
    this.handleDisconnect();
    this.emit('disconnected');
  }
}
