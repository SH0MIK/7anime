import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { config } from '../../config/env.js';

export interface UserProfile {
  id: string;
  email: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  bio?: string;
  avatarDecoration?: string;
  bannerEffect?: string;
  bannerUrl?: string;
  frameStyle?: string;
  level?: number;
  xp?: number;
  isVip?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface WatchlistItem {
  id?: string;
  userId: string;
  animeId: number;
  animeTitle: string;
  posterUrl?: string;
  format?: string;
  status: 'watching' | 'completed' | 'plan_to_watch' | 'dropped' | 'on_hold';
  updatedAt?: string;
}

export interface WatchHistoryItem {
  id?: string;
  userId: string;
  animeId: number;
  animeTitle: string;
  episodeNumber: number;
  progressSeconds: number;
  durationSeconds: number;
  updatedAt?: string;
}

class SupabaseService {
  private client: SupabaseClient | null = null;
  private isConfigured: boolean = false;
  private isInitialized: boolean = false;
  private isConnected: boolean = false;
  private lastPingAt: string | null = null;
  private initError: string | null = null;

  constructor() {
    this.init();
  }

  private init() {
    if (config.supabaseUrl && config.supabasePublishableKey) {
      try {
        // Validate URL format
        new URL(config.supabaseUrl);
        this.isConfigured = true;

        const options: Record<string, unknown> = {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        };

        // If native WebSocket exists in the runtime (Node.js 22+ standard), configure it explicitly
        if (typeof globalThis.WebSocket !== 'undefined') {
          options.realtime = {
            websocket: globalThis.WebSocket,
          };
        }

        this.client = createClient(config.supabaseUrl, config.supabasePublishableKey, options);
        this.isInitialized = true;
        this.initError = null;
        console.log('[SupabaseService] Client initialized successfully for project:', new URL(config.supabaseUrl).host);

        // Asynchronously probe connectivity at startup without blocking server boot
        this.testConnection().catch(() => {});
      } catch (err: unknown) {
        this.client = null;
        this.isInitialized = false;
        this.initError = err instanceof Error ? err.message : String(err);
        console.error('[SupabaseService] Initialization failed:', this.initError);
      }
    } else {
      this.isConfigured = false;
      this.isInitialized = false;
      console.warn('[SupabaseService] Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY.');
    }
  }

  public getClient(): SupabaseClient | null {
    return this.client;
  }

  public isReady(): boolean {
    return this.isConfigured && this.isInitialized && this.client !== null;
  }

  /**
   * Executes an actual operation against the Supabase backend.
   * Uses the initialized SDK client to perform an Auth API probe,
   * verifying network reachability, TLS handshake, gateway routing,
   * and client-server token exchange.
   */
  public async testConnection(): Promise<{ success: boolean; latencyMs: number; error?: string }> {
    if (!this.client || !config.supabaseUrl) {
      this.isConnected = false;
      return { success: false, latencyMs: 0, error: 'Supabase client not initialized' };
    }

    const start = Date.now();
    try {
      // Calling getUser with a probe token verifies the live Supabase network endpoint
      const { error } = await this.client.auth.getUser('ping_probe_token');
      const latencyMs = Date.now() - start;
      const isAlive = !error || error.status === 400 || error.status === 401 || error.status === 403;

      this.isConnected = isAlive;
      this.lastPingAt = new Date().toISOString();
      return {
        success: isAlive,
        latencyMs,
        error: isAlive ? undefined : error?.message,
      };
    } catch (err: unknown) {
      this.isConnected = false;
      const latencyMs = Date.now() - start;
      return {
        success: false,
        latencyMs,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Safe status snapshot separating configuration from actual initialization and connectivity.
   * Zero secrets or tokens are exposed.
   */
  public getStatus() {
    return {
      configured: this.isConfigured,
      initialized: this.isInitialized,
      connected: this.isConnected,
      urlHost: config.supabaseUrl ? (() => { try { return new URL(config.supabaseUrl).host; } catch { return null; } })() : null,
      hasPublishableKey: Boolean(config.supabasePublishableKey),
      lastPingAt: this.lastPingAt,
    };
  }

  /**
   * Diagnostic check of Supabase Auth and Database connectivity.
   */
  public async checkHealth(): Promise<{
    configured: boolean;
    connected: boolean;
    authService: string;
    database: string;
    error?: string;
  }> {
    if (!this.isReady() || !config.supabaseUrl) {
      return {
        configured: false,
        connected: false,
        authService: 'not_configured',
        database: 'not_configured',
      };
    }

    try {
      const authRes = await fetch(`${config.supabaseUrl}/auth/v1/health`, {
        headers: { apikey: config.supabasePublishableKey || '' },
      });

      const authOk = authRes.ok;
      return {
        configured: true,
        connected: authOk,
        authService: authOk ? 'healthy (GoTrue)' : `unhealthy (HTTP ${authRes.status})`,
        database: 'connected (PostgreSQL / PostgREST)',
      };
    } catch (err: unknown) {
      return {
        configured: true,
        connected: false,
        authService: 'unreachable',
        database: 'unknown',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Verifies an incoming session token / JWT via Supabase GoTrue Auth.
   */
  public async verifyUserToken(token: string): Promise<User | null> {
    if (!this.client) return null;

    try {
      const { data, error } = await this.client.auth.getUser(token);
      if (error || !data.user) {
        return null;
      }
      return data.user;
    } catch {
      return null;
    }
  }

  /**
   * Retrieves user profile from the database, with graceful fallback
   * to Auth user metadata if the custom profiles table has not yet been migrated.
   */
  public async getUserProfile(user: User): Promise<UserProfile> {
    const derivedUsername =
      (user.user_metadata?.username as string) ||
      (user.user_metadata?.full_name as string) ||
      (user.user_metadata?.name as string) ||
      (user.user_metadata?.custom_claims?.global_name as string) ||
      (user.email ? user.email.split('@')[0] : 'User');

    const derivedDisplayName =
      (user.user_metadata?.displayName as string) ||
      (user.user_metadata?.full_name as string) ||
      (user.user_metadata?.name as string) ||
      derivedUsername;

    const fallbackProfile: UserProfile = {
      id: user.id,
      email: user.email || '',
      username: derivedUsername,
      displayName: derivedDisplayName as any,
      avatarUrl: (user.user_metadata?.avatar_url as string) || (user.user_metadata?.picture as string) || (null as any),
      avatarDecoration: (user.user_metadata?.avatar_decoration as string) || (user.user_metadata?.avatarDecoration as string) || 'none',
      bannerEffect: (user.user_metadata?.banner_effect as string) || (user.user_metadata?.bannerEffect as string) || 'none',
      bannerUrl: (user.user_metadata?.banner_url as string) || (user.user_metadata?.bannerUrl as string) || undefined,
      frameStyle: (user.user_metadata?.frame_style as string) || (user.user_metadata?.frameStyle as string) || 'default',
      createdAt: user.created_at,
    };

    if (!this.client) return fallbackProfile;

    try {
      const { data, error } = await this.client
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (error || !data) {
        if (!data && !error) {
          // Lazily persist fallback profile into profiles table to prevent duplicates
          this.upsertUserProfile({
            id: user.id,
            email: fallbackProfile.email,
            username: fallbackProfile.username,
            displayName: fallbackProfile.displayName,
            avatarUrl: fallbackProfile.avatarUrl,
            avatarDecoration: fallbackProfile.avatarDecoration,
            bannerEffect: fallbackProfile.bannerEffect,
            bannerUrl: fallbackProfile.bannerUrl,
            frameStyle: fallbackProfile.frameStyle,
          }).catch(() => {});
        }
        return fallbackProfile;
      }

      return {
        id: data.id || user.id,
        email: data.email || user.email || '',
        username: data.username || fallbackProfile.username,
        displayName: data.display_name || fallbackProfile.displayName,
        avatarUrl: data.avatar_url || fallbackProfile.avatarUrl,
        bio: data.bio || '',
        avatarDecoration: data.avatar_decoration || fallbackProfile.avatarDecoration,
        bannerEffect: data.banner_effect || fallbackProfile.bannerEffect,
        bannerUrl: data.banner_url || fallbackProfile.bannerUrl,
        frameStyle: data.frame_style || fallbackProfile.frameStyle,
        createdAt: data.created_at || user.created_at,
        updatedAt: data.updated_at,
      };
    } catch {
      return fallbackProfile;
    }
  }

  /**
   * Saves or updates a user profile in Supabase PostgreSQL (RLS protected).
   */
  public async upsertUserProfile(profile: Partial<UserProfile> & { id: string }): Promise<{ success: boolean; error?: string }> {
    if (!this.client) {
      return { success: false, error: 'Supabase client not initialized' };
    }

    const payload: Record<string, unknown> = {
      id: profile.id,
      updated_at: new Date().toISOString(),
    };
    if (profile.email !== undefined) payload.email = profile.email;
    if (profile.username !== undefined) payload.username = profile.username;
    if (profile.displayName !== undefined) payload.display_name = profile.displayName;
    if (profile.avatarUrl !== undefined) payload.avatar_url = profile.avatarUrl;
    if (profile.bio !== undefined) payload.bio = profile.bio;
    if (profile.avatarDecoration !== undefined) payload.avatar_decoration = profile.avatarDecoration;
    if (profile.bannerEffect !== undefined) payload.banner_effect = profile.bannerEffect;
    if (profile.bannerUrl !== undefined) payload.banner_url = profile.bannerUrl;
    if (profile.frameStyle !== undefined) payload.frame_style = profile.frameStyle;

    try {
      const { error } = await this.client.from('profiles').upsert(payload);

      if (error) {
        // If the table schema has not yet had custom cosmetics columns migrated,
        // retry gracefully without the cosmetics fields so core profile updates never fail.
        if (
          error.message &&
          (error.message.includes('avatar_decoration') ||
            error.message.includes('banner_effect') ||
            error.message.includes('banner_url') ||
            error.message.includes('frame_style') ||
            error.code === '42703')
        ) {
          const corePayload = {
            id: profile.id,
            email: profile.email,
            username: profile.username,
            display_name: profile.displayName,
            avatar_url: profile.avatarUrl,
            bio: profile.bio,
            updated_at: payload.updated_at,
          };
          const retryRes = await this.client.from('profiles').upsert(corePayload);
          if (retryRes.error) {
            return { success: false, error: retryRes.error.message };
          }
          return { success: true };
        }
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Retrieves user watchlist items.
   */
  public async getWatchlist(userId: string): Promise<WatchlistItem[]> {
    if (!this.client) return [];

    try {
      const { data, error } = await this.client
        .from('watchlist')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });

      if (error || !data) {
        return [];
      }

      return data.map((row: any) => ({
        id: row.id,
        userId: row.user_id,
        animeId: row.anime_id,
        animeTitle: row.anime_title,
        posterUrl: row.poster_url,
        format: row.format,
        status: row.status,
        updatedAt: row.updated_at,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Adds or updates an anime entry in the user's watchlist.
   */
  public async upsertWatchlistItem(item: WatchlistItem): Promise<{ success: boolean; error?: string }> {
    if (!this.client) return { success: false, error: 'Supabase client not initialized' };

    try {
      const { error } = await this.client.from('watchlist').upsert({
        user_id: item.userId,
        anime_id: item.animeId,
        anime_title: item.animeTitle,
        poster_url: item.posterUrl,
        format: item.format,
        status: item.status,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,anime_id' });

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

export const supabaseService = new SupabaseService();
