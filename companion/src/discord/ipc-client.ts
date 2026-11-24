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

export class DiscordIpcClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private isConnected = false;
  private isReady = false;
  private currentUser: DiscordUser | null = null;
  private clientId: string;
  private incomingBuffer = Buffer.alloc(0);
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private isManuallyClosed = false;

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
   */
  public async connect(): Promise<boolean> {
    if (this.isConnected) return true;
    this.isManuallyClosed = false;

    const paths = getDiscordIpcPaths();
    for (const pipePath of paths) {
      const success = await this.tryConnectPipe(pipePath);
      if (success) {
        this.reconnectAttempts = 0;
        return true;
      }
    }

    this.scheduleReconnect();
    return false;
  }

  private tryConnectPipe(pipePath: string): Promise<boolean> {
    return new Promise((resolve) => {
      let resolved = false;
      const sock = net.createConnection(pipePath);

      const cleanup = () => {
        if (!resolved) {
          resolved = true;
          sock.removeAllListeners();
          sock.destroy();
          resolve(false);
        }
      };

      sock.once('connect', () => {
        if (!resolved) {
          resolved = true;
          this.socket = sock;
          this.isConnected = true;
          this.setupSocketListeners();
          this.sendHandshake();
          resolve(true);
        }
      });

      sock.once('error', () => cleanup());
      sock.once('close', () => cleanup());

      // Timeout for pipe connection attempt
      setTimeout(() => {
        if (!resolved) {
          cleanup();
        }
      }, 500);
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
      this.emit('error', err);
    });
  }

  private handleIncomingData(chunk: Buffer): void {
    this.incomingBuffer = Buffer.concat([this.incomingBuffer, chunk]);

    while (this.incomingBuffer.length >= 8) {
      const opcode = this.incomingBuffer.readUInt32LE(0);
      const length = this.incomingBuffer.readUInt32LE(4);

      if (this.incomingBuffer.length < 8 + length) {
        // Incomplete packet; wait for next data chunk
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
      const payload = payloadStr ? JSON.parse(payloadStr) : {};

      if (opcode === DiscordIpcOpcode.FRAME) {
        if (payload.cmd === 'DISPATCH' && payload.evt === 'READY') {
          this.isReady = true;
          this.currentUser = payload.data?.user || null;
          this.emit('ready', this.currentUser);
        }
      } else if (opcode === DiscordIpcOpcode.PING) {
        this.sendPacket(DiscordIpcOpcode.PONG, payload);
      } else if (opcode === DiscordIpcOpcode.CLOSE) {
        this.disconnect();
      }
    } catch (err) {
      this.emit('error', new Error(`Failed to parse IPC packet: ${err}`));
    }
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
      this.emit('error', err);
      return false;
    }
  }

  /**
   * Sends SET_ACTIVITY command to Discord IPC.
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

    return this.sendPacket(DiscordIpcOpcode.FRAME, packet);
  }

  /**
   * Clears Discord Rich Presence.
   */
  public async clearActivity(): Promise<boolean> {
    return this.setActivity(null);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.isManuallyClosed) return;
    if (this.reconnectAttempts >= COMPANION_CONFIG.MAX_RECONNECT_ATTEMPTS) {
      // Bounded backoff: stop retrying aggressively once threshold reached, emit idle
      this.emit('reconnect_exhausted');
      return;
    }

    this.reconnectAttempts++;
    // Exponential backoff with jitter
    const delay = Math.min(
      COMPANION_CONFIG.RECONNECT_INITIAL_MS * Math.pow(1.5, this.reconnectAttempts - 1),
      COMPANION_CONFIG.RECONNECT_MAX_MS
    );

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      await this.connect();
    }, delay);
  }

  private handleDisconnect(): void {
    this.isConnected = false;
    this.isReady = false;
    this.currentUser = null;
    this.incomingBuffer = Buffer.alloc(0);
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
      this.socket = null;
    }
  }

  public disconnect(): void {
    this.isManuallyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.handleDisconnect();
    this.emit('disconnected');
  }
}
