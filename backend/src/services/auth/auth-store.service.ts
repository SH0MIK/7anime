import { config } from '../../config/env.js';

export interface OAuthStateRecord {
  nonce: string;
  clientOrigin: string;
  createdAt: number;
}

export interface AuthTicketRecord {
  ticket: string;
  session: {
    access_token: string;
    refresh_token?: string;
    expires_at?: number;
    expires_in?: number;
    token_type: string;
    user: {
      id: string;
      email?: string;
      createdAt?: string;
      user_metadata?: Record<string, unknown>;
    };
  };
  createdAt: number;
}

export const STATE_TTL_SECONDS = 10 * 60; // 10 minutes
export const TICKET_TTL_SECONDS = 60;      // 60 seconds

/**
 * Distributed, Redis-backed authentication storage for OAuth states and single-use authorization tickets.
 *
 * Guarantees:
 * 1. Horizontal scaling: All instances share the same state and ticket records in Upstash Redis.
 * 2. Atomic consumption: Uses Redis GETDEL to guarantee strict single-use / anti-replay across all nodes.
 * 3. Strict production safety: Never silently falls back to process-local memory in production.
 */
export class AuthStoreService {
  private restUrl?: string;
  private restToken?: string;
  private isConfigured: boolean;

  // Process-local memory maps maintained for test compatibility and non-production offline development
  public readonly localOAuthStateMap = new Map<string, OAuthStateRecord>();
  public readonly localAuthTicketMap = new Map<string, AuthTicketRecord>();

  constructor() {
    this.restUrl = (config.upstashRedisRestUrl || '').replace(/^["']|["']$/g, '').trim();
    this.restToken = (config.upstashRedisRestToken || '').replace(/^["']|["']$/g, '').trim();
    this.isConfigured = Boolean(this.restUrl && this.restToken);
  }

  public isRedisConfigured(): boolean {
    return this.isConfigured;
  }

  /**
   * Persists an OAuth state record with a 10-minute TTL in Redis.
   */
  public async saveOAuthState(nonce: string, record: OAuthStateRecord, ttlSeconds: number = STATE_TTL_SECONDS): Promise<boolean> {
    const key = `auth:state:${nonce}`;
    this.localOAuthStateMap.set(nonce, record);

    if (this.isConfigured && this.restUrl && this.restToken) {
      try {
        const payload = JSON.stringify(record);
        const url = `${this.restUrl}/set/${encodeURIComponent(key)}/${encodeURIComponent(payload)}?ex=${ttlSeconds}`;
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${this.restToken}`,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(4000),
        });

        if (!res.ok) {
          throw new Error(`Redis SET failed with HTTP ${res.status}`);
        }

        const json = (await res.json()) as any;
        return json?.result === 'OK';
      } catch (err) {
        if (config.nodeEnv === 'production') {
          console.error('[AuthStoreService] Redis saveOAuthState failed in production:', (err as Error).message);
          throw new Error('Redis authentication store is unreachable.');
        }
        console.warn('[AuthStoreService] Redis saveOAuthState failed in dev, using memory fallback:', (err as Error).message);
        return true;
      }
    }

    if (config.nodeEnv === 'production') {
      throw new Error('Redis authentication store is required in production but not configured.');
    }

    return true;
  }

  /**
   * Atomically consumes and deletes an OAuth state record from Redis using GETDEL.
   * Guarantees strict single-use across all server instances.
   */
  public async getDelOAuthState(nonce: string): Promise<OAuthStateRecord | null> {
    const key = `auth:state:${nonce}`;

    if (this.isConfigured && this.restUrl && this.restToken) {
      try {
        const res = await fetch(`${this.restUrl}/getdel/${encodeURIComponent(key)}`, {
          headers: {
            Authorization: `Bearer ${this.restToken}`,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(4000),
        });

        if (!res.ok) {
          throw new Error(`Redis GETDEL failed with HTTP ${res.status}`);
        }

        const json = (await res.json()) as any;
        if (json && json.result !== null && json.result !== undefined) {
          this.localOAuthStateMap.delete(nonce);
          const data = typeof json.result === 'string' ? JSON.parse(json.result) : json.result;
          const stateRecord = data as OAuthStateRecord;
          if (stateRecord.createdAt && Date.now() - stateRecord.createdAt > STATE_TTL_SECONDS * 1000) {
            return null;
          }
          return stateRecord;
        }

        // In non-production environments (e.g. unit tests injecting into local map), check local map
        if (config.nodeEnv !== 'production') {
          const local = this.localOAuthStateMap.get(nonce);
          if (local) {
            this.localOAuthStateMap.delete(nonce);
            if (local.createdAt && Date.now() - local.createdAt > STATE_TTL_SECONDS * 1000) {
              return null;
            }
            return local;
          }
        }

        return null;
      } catch (err) {
        if (config.nodeEnv === 'production') {
          console.error('[AuthStoreService] Redis getDelOAuthState failed in production:', (err as Error).message);
          throw new Error('Redis authentication store is unreachable.');
        }
        console.warn('[AuthStoreService] Redis getDelOAuthState failed in dev, using memory fallback:', (err as Error).message);
      }
    }

    if (config.nodeEnv === 'production') {
      throw new Error('Redis authentication store is required in production but not configured.');
    }

    const local = this.localOAuthStateMap.get(nonce);
    if (!local) return null;
    this.localOAuthStateMap.delete(nonce);
    return local;
  }

  /**
   * Immediately invalidates and deletes an OAuth state record (e.g. upon validation failure or mismatch).
   */
  public async deleteOAuthState(nonce: string): Promise<boolean> {
    const key = `auth:state:${nonce}`;
    this.localOAuthStateMap.delete(nonce);

    if (this.isConfigured && this.restUrl && this.restToken) {
      try {
        await fetch(`${this.restUrl}/del/${encodeURIComponent(key)}`, {
          headers: {
            Authorization: `Bearer ${this.restToken}`,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(3000),
        });
      } catch {}
    }
    return true;
  }

  /**
   * Persists a single-use authorization ticket with a 60-second TTL in Redis.
   */
  public async saveAuthTicket(ticket: string, record: AuthTicketRecord, ttlSeconds: number = TICKET_TTL_SECONDS): Promise<boolean> {
    const key = `auth:ticket:${ticket}`;
    this.localAuthTicketMap.set(ticket, record);

    if (this.isConfigured && this.restUrl && this.restToken) {
      try {
        const payload = JSON.stringify(record);
        const url = `${this.restUrl}/set/${encodeURIComponent(key)}/${encodeURIComponent(payload)}?ex=${ttlSeconds}`;
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${this.restToken}`,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(4000),
        });

        if (!res.ok) {
          throw new Error(`Redis SET ticket failed with HTTP ${res.status}`);
        }

        const json = (await res.json()) as any;
        return json?.result === 'OK';
      } catch (err) {
        if (config.nodeEnv === 'production') {
          console.error('[AuthStoreService] Redis saveAuthTicket failed in production:', (err as Error).message);
          throw new Error('Redis authentication store is unreachable.');
        }
        console.warn('[AuthStoreService] Redis saveAuthTicket failed in dev, using memory fallback:', (err as Error).message);
        return true;
      }
    }

    if (config.nodeEnv === 'production') {
      throw new Error('Redis authentication store is required in production but not configured.');
    }

    return true;
  }

  /**
   * Atomically consumes and deletes an authorization ticket from Redis using GETDEL.
   * Guarantees strict single-use across all server instances.
   */
  public async getDelAuthTicket(ticket: string): Promise<AuthTicketRecord | null> {
    const key = `auth:ticket:${ticket}`;

    if (this.isConfigured && this.restUrl && this.restToken) {
      try {
        const res = await fetch(`${this.restUrl}/getdel/${encodeURIComponent(key)}`, {
          headers: {
            Authorization: `Bearer ${this.restToken}`,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(4000),
        });

        if (!res.ok) {
          throw new Error(`Redis GETDEL ticket failed with HTTP ${res.status}`);
        }

        const json = (await res.json()) as any;
        if (json && json.result !== null && json.result !== undefined) {
          this.localAuthTicketMap.delete(ticket);
          const data = typeof json.result === 'string' ? JSON.parse(json.result) : json.result;
          const ticketRecord = data as AuthTicketRecord;
          if (ticketRecord.createdAt && Date.now() - ticketRecord.createdAt > TICKET_TTL_SECONDS * 1000) {
            return null;
          }
          return ticketRecord;
        }

        // In non-production environments (e.g. unit tests injecting into local map), check local map
        if (config.nodeEnv !== 'production') {
          const local = this.localAuthTicketMap.get(ticket);
          if (local) {
            this.localAuthTicketMap.delete(ticket);
            if (local.createdAt && Date.now() - local.createdAt > TICKET_TTL_SECONDS * 1000) {
              return null;
            }
            return local;
          }
        }

        return null;
      } catch (err) {
        if (config.nodeEnv === 'production') {
          console.error('[AuthStoreService] Redis getDelAuthTicket failed in production:', (err as Error).message);
          throw new Error('Redis authentication store is unreachable.');
        }
        console.warn('[AuthStoreService] Redis getDelAuthTicket failed in dev, using memory fallback:', (err as Error).message);
      }
    }

    if (config.nodeEnv === 'production') {
      throw new Error('Redis authentication store is required in production but not configured.');
    }

    const local = this.localAuthTicketMap.get(ticket);
    if (!local) return null;
    this.localAuthTicketMap.delete(ticket);
    if (local.createdAt && Date.now() - local.createdAt > TICKET_TTL_SECONDS * 1000) {
      return null;
    }
    return local;
  }
}

export const authStore = new AuthStoreService();
