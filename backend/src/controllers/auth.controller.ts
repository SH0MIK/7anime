import { Request, Response } from 'express';
import crypto from 'node:crypto';
import { config } from '../config/env.js';
import { supabaseService } from '../services/supabase/supabase.service.js';
import { mailerService } from '../services/mail/mailer.service.js';
import { AuthenticatedRequest, extractBearerToken, extractCookie } from '../middleware/auth.middleware.js';
import {
  authStore,
  type OAuthStateRecord,
  type AuthTicketRecord,
  STATE_TTL_SECONDS,
  TICKET_TTL_SECONDS,
} from '../services/auth/auth-store.service.js';

export { STATE_TTL_SECONDS, TICKET_TTL_SECONDS, authStore };
export type { OAuthStateRecord, AuthTicketRecord };

// Backwards-compatible map aliases backed by authStore
export const oauthStateMap = authStore.localOAuthStateMap;
export const authTicketMap = authStore.localAuthTicketMap;

/**
 * Returns auth subsystem status (Supabase GoTrue, SMTP, Google OAuth).
 */
export async function getAuthStatus(req: Request, res: Response) {
  const supabaseHealth = await supabaseService.checkHealth();
  const smtpHealth = await mailerService.verifyConnection();

  return res.json({
    success: true,
    data: {
      supabase: supabaseHealth,
      smtp: {
        configured: Boolean(config.smtpHost && config.smtpUser && config.smtpPassword),
        connected: smtpHealth.success,
        host: config.smtpHost,
        port: config.smtpPort,
        error: smtpHealth.error,
      },
      googleLogin: {
        configured: Boolean(config.googleAuthClientId && config.googleAuthClientSecret),
        redirectUriConfigured: Boolean(config.googleAuthRedirectUri),
      },
      googleOAuth: {
        configured: Boolean(config.googleAuthClientId && config.googleAuthClientSecret),
        redirectUriConfigured: Boolean(config.googleAuthRedirectUri),
      },
      gmailMailer: {
        configured: Boolean(config.gmailUser && config.gmailRefreshToken),
        oauthClientConfigured: Boolean(config.googleClientId && config.googleClientSecret),
        redirectUriConfigured: Boolean(config.googleRedirectUri),
        note: 'Dedicated Gmail Mailer OAuth client credentials.',
      },
      gmailOAuth: {
        configured: Boolean(config.gmailUser && config.gmailRefreshToken),
        note: 'Separate from SMTP transport. Used if Google API consent refresh is active.',
      },
    },
  });
}

/**
 * Returns safe public client authentication configuration for the frontend UI.
 */
export function getClientAuthConfig(req: Request, res: Response) {
  return res.json({
    success: true,
    data: {
      googleOAuthEnabled: Boolean(config.googleAuthClientId),
      supabaseUrl: config.supabaseUrl || null,
      supabasePublishableKey: config.supabasePublishableKey || null,
      publicLogoUrl: config.publicLogoUrl,
    },
  });
}

/**
 * Resolves the Google OAuth redirect URI with priority:
 * 1. Explicitly configured GOOGLE_REDIRECT_URI environment variable
 * 2. Inferred from request host & protocol (accounting for reverse proxies)
 */
export function resolveGoogleAuthRedirectUri(req: Request): string {
  if (config.googleAuthRedirectUri) {
    return config.googleAuthRedirectUri;
  }
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.get('host') || 'localhost:3001';
  return `${protocol}://${host}/api/auth/google/callback`;
}

// Backward-compatible alias for existing imports
export const resolveGoogleRedirectUri = resolveGoogleAuthRedirectUri;

/**
 * Validates a client redirect URI against allowed origins (CORS origins & localhost in dev)
 * to prevent open-redirect vulnerabilities.
 */
export function resolveClientRedirectOrigin(req: Request): string {
  const candidate = (req.query.state as string) || (req.query.redirect as string) || req.get('referer');
  if (candidate) {
    try {
      const origin = new URL(candidate).origin;
      if (config.corsOrigins.includes(origin)) return origin;
      if (config.nodeEnv === 'development' && (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:'))) {
        return origin;
      }
    } catch {}
  }
  return config.corsOrigins[0] || 'https://7anime-new.vercel.app';
}

/**
 * Direct top-level navigation entrypoint for Google OAuth:
 * Sets the browser-bound oauth_state cookie on the backend domain (first-party context)
 * and 302 redirects directly to Google's consent screen.
 * Avoids third-party cookie blocking in browsers with ITP or partitioned cookies.
 */
export async function initiateGoogleOAuth(req: Request, res: Response) {
  const clientOrigin = resolveClientRedirectOrigin(req);

  if (!config.googleAuthClientId) {
    const errMsg = 'Google Login is not configured on this server (missing GOOGLE_AUTH_CLIENT_ID).';
    if (req.headers.accept?.includes('application/json')) {
      return res.status(503).json({ success: false, error: errMsg });
    }
    return res.redirect(`${clientOrigin}/?auth_error=${encodeURIComponent(errMsg)}`);
  }

  const nonce = crypto.randomBytes(32).toString('hex');
  const record: OAuthStateRecord = {
    nonce,
    clientOrigin,
    createdAt: Date.now(),
  };

  try {
    await authStore.saveOAuthState(nonce, record, STATE_TTL_SECONDS);
  } catch (err) {
    console.error('[GoogleOAuth] Failed to persist OAuth state to Redis:', (err as Error).message);
    const errMsg = 'Authentication service temporarily unavailable.';
    if (req.headers.accept?.includes('application/json')) {
      return res.status(503).json({ success: false, error: errMsg });
    }
    return res.redirect(`${clientOrigin}/?auth_error=${encodeURIComponent(errMsg)}`);
  }

  const isProd = config.nodeEnv === 'production';
  res.cookie('oauth_state', nonce, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: STATE_TTL_SECONDS * 1000,
    path: '/api/auth',
  });

  const redirectUri = resolveGoogleRedirectUri(req);
  const rootUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
  const options: Record<string, string> = {
    redirect_uri: redirectUri,
    client_id: config.googleAuthClientId,
    access_type: 'offline',
    response_type: 'code',
    prompt: 'consent',
    scope: [
      'openid',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
    ].join(' '),
    state: nonce,
  };

  const qs = new URLSearchParams(options).toString();
  return res.redirect(`${rootUrl}?${qs}`);
}

/**
 * Generates the Google OAuth authorization URL for frontend redirects.
 * Generates an unguessable cryptographic nonce, binds it to an HTTP-only cookie,
 * registers in distributed Redis store, and sets the state parameter for CSRF and replay protection.
 */
export async function getGoogleOAuthUrl(req: Request, res: Response) {
  if (!config.googleAuthClientId) {
    return res.status(503).json({
      success: false,
      error: 'Google Login is not configured on this server (missing GOOGLE_AUTH_CLIENT_ID).',
    });
  }

  const redirectUri = resolveGoogleRedirectUri(req);
  const clientOrigin = resolveClientRedirectOrigin(req);
  const nonce = crypto.randomBytes(32).toString('hex');

  const record: OAuthStateRecord = {
    nonce,
    clientOrigin,
    createdAt: Date.now(),
  };

  try {
    await authStore.saveOAuthState(nonce, record, STATE_TTL_SECONDS);
  } catch (err) {
    console.error('[GoogleOAuth] Failed to persist OAuth state to Redis:', (err as Error).message);
    return res.status(503).json({
      success: false,
      error: 'Authentication service temporarily unavailable.',
    });
  }

  const isProd = config.nodeEnv === 'production';
  res.cookie('oauth_state', nonce, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: STATE_TTL_SECONDS * 1000,
    path: '/api/auth',
  });

  const rootUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
  const options: Record<string, string> = {
    redirect_uri: redirectUri,
    client_id: config.googleAuthClientId,
    access_type: 'offline',
    response_type: 'code',
    prompt: 'consent',
    scope: [
      'openid',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
    ].join(' '),
    state: nonce,
  };

  const qs = new URLSearchParams(options).toString();
  return res.json({
    success: true,
    url: `${rootUrl}?${qs}`,
  });
}

/**
 * Handles Google OAuth 2.0 callback:
 * 1. Strictly validates presence of browser cookie and match with OAuth state parameter (CSRF defense)
 * 2. Atomically consumes and deletes single-use state from distributed Redis store (anti-replay)
 * 3. Exchanges authorization code for Google ID token and access token
 * 4. Uses Supabase Auth's native signInWithIdToken to establish a genuine Supabase session
 * 5. Generates a short-lived (60s), single-use authorization ticket in Redis for cross-origin SPA delivery
 * 6. Safely redirects browser to frontend with auth_ticket parameter
 */
export async function handleGoogleOAuthCallback(req: Request, res: Response) {
  const { code, error, error_description, state } = req.query;
  const fallbackOrigin = config.corsOrigins[0] || 'https://7anime-new.vercel.app';
  const isProd = config.nodeEnv === 'production';
  const cookieClearOpts = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? ('none' as const) : ('lax' as const),
    path: '/api/auth',
  };

  // 1. Strict State & Cookie Validation (CSRF & Replay Defense)
  const stateParam = typeof state === 'string' ? state.trim() : null;
  const cookieState = extractCookie(req, 'oauth_state');

  // Strict Requirement 1: oauth_state cookie MUST be present
  if (!cookieState) {
    if (stateParam) {
      await authStore.deleteOAuthState(stateParam).catch(() => {});
    }
    const errMsg = 'OAuth state cookie is missing. Authentication must be initiated from the same browser.';
    if (req.headers.accept?.includes('application/json')) {
      return res.status(400).json({ success: false, error: errMsg });
    }
    return res.redirect(`${fallbackOrigin}/?auth_error=${encodeURIComponent(errMsg)}`);
  }

  // Strict Requirement 2: state query parameter MUST be present
  if (!stateParam) {
    res.clearCookie('oauth_state', cookieClearOpts);
    const errMsg = 'OAuth state parameter is missing from callback.';
    if (req.headers.accept?.includes('application/json')) {
      return res.status(400).json({ success: false, error: errMsg });
    }
    return res.redirect(`${fallbackOrigin}/?auth_error=${encodeURIComponent(errMsg)}`);
  }

  // Strict Requirement 3: Cookie value MUST match state parameter
  if (cookieState !== stateParam) {
    res.clearCookie('oauth_state', cookieClearOpts);
    await authStore.deleteOAuthState(stateParam).catch(() => {});
    const errMsg = 'OAuth state mismatch between browser cookie and query parameter.';
    if (req.headers.accept?.includes('application/json')) {
      return res.status(400).json({ success: false, error: errMsg });
    }
    return res.redirect(`${fallbackOrigin}/?auth_error=${encodeURIComponent(errMsg)}`);
  }

  // 2. Atomic Single-Use State Retrieval & Consumption from Redis
  let stateRecord: OAuthStateRecord | null = null;
  try {
    stateRecord = await authStore.getDelOAuthState(stateParam);
  } catch (err) {
    console.error('[GoogleOAuth] Redis state retrieval error:', (err as Error).message);
    res.clearCookie('oauth_state', cookieClearOpts);
    const errMsg = 'Authentication service temporarily unavailable.';
    if (req.headers.accept?.includes('application/json')) {
      return res.status(503).json({ success: false, error: errMsg });
    }
    return res.redirect(`${fallbackOrigin}/?auth_error=${encodeURIComponent(errMsg)}`);
  }

  // State cookie is consumed and cleared immediately
  res.clearCookie('oauth_state', cookieClearOpts);

  if (!stateRecord) {
    const errMsg = 'OAuth state is invalid, expired, or has already been consumed.';
    if (req.headers.accept?.includes('application/json')) {
      return res.status(400).json({ success: false, error: errMsg });
    }
    return res.redirect(`${fallbackOrigin}/?auth_error=${encodeURIComponent(errMsg)}`);
  }

  const targetOrigin = stateRecord.clientOrigin || fallbackOrigin;

  // 3. Handle OAuth Provider Error (e.g. user denied consent: access_denied)
  if (error) {
    const errorMsg = String(error_description || error);
    console.warn('[GoogleOAuth] Provider returned authorization error:', errorMsg);

    if (req.headers.accept?.includes('application/json')) {
      return res.status(400).json({ success: false, error: errorMsg });
    }
    return res.redirect(`${targetOrigin}/?auth_error=${encodeURIComponent(errorMsg)}`);
  }

  if (!code || typeof code !== 'string') {
    if (req.headers.accept?.includes('application/json')) {
      return res.status(400).json({ success: false, error: 'Authorization code is missing from callback.' });
    }
    return res.redirect(`${targetOrigin}/?auth_error=${encodeURIComponent('Authorization code is missing from Google callback.')}`);
  }

  if (!config.googleAuthClientId || !config.googleAuthClientSecret) {
    const msg = 'Google Login credentials not configured on backend (missing GOOGLE_AUTH_CLIENT_ID or GOOGLE_AUTH_CLIENT_SECRET).';
    if (req.headers.accept?.includes('application/json')) {
      return res.status(503).json({ success: false, error: msg });
    }
    return res.redirect(`${targetOrigin}/?auth_error=${encodeURIComponent(msg)}`);
  }

  const redirectUri = resolveGoogleRedirectUri(req);

  try {
    // 4. Exchange authorization code for Google tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        code,
        client_id: config.googleAuthClientId,
        client_secret: config.googleAuthClientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });

    if (!tokenRes.ok) {
      const tokenErr = await tokenRes.text();
      console.error('[GoogleOAuth] Token exchange failed:', tokenRes.status, tokenErr);
      const errMsg = 'Failed to exchange authorization code with Google.';
      if (req.headers.accept?.includes('application/json')) {
        return res.status(401).json({ success: false, error: errMsg });
      }
      return res.redirect(`${targetOrigin}/?auth_error=${encodeURIComponent(errMsg)}`);
    }

    const tokenData = (await tokenRes.json()) as { access_token?: string; id_token?: string };
    if (!tokenData.id_token) {
      const errMsg = 'Google OAuth response did not contain an id_token.';
      if (req.headers.accept?.includes('application/json')) {
        return res.status(401).json({ success: false, error: errMsg });
      }
      return res.redirect(`${targetOrigin}/?auth_error=${encodeURIComponent(errMsg)}`);
    }

    // 5. Authenticate with Supabase Auth using native signInWithIdToken
    if (!supabaseService.isReady()) {
      const errMsg = 'Supabase client is not initialized on backend.';
      if (req.headers.accept?.includes('application/json')) {
        return res.status(503).json({ success: false, error: errMsg });
      }
      return res.redirect(`${targetOrigin}/?auth_error=${encodeURIComponent(errMsg)}`);
    }

    const { data: supaAuthData, error: supaAuthError } = await supabaseService.getClient()!.auth.signInWithIdToken({
      provider: 'google',
      token: tokenData.id_token,
      access_token: tokenData.access_token,
    });

    if (supaAuthError || !supaAuthData?.session || !supaAuthData?.user) {
      console.error('[GoogleOAuth] Supabase signInWithIdToken error:', supaAuthError);
      let errMsg = supaAuthError?.message || 'Failed to establish Supabase session from Google identity.';
      if (supaAuthError?.code === 'provider_disabled') {
        errMsg = 'Google authentication provider is not enabled in the Supabase project dashboard (Auth -> Providers -> Google).';
      }
      if (req.headers.accept?.includes('application/json')) {
        return res.status(401).json({ success: false, error: errMsg });
      }
      return res.redirect(`${targetOrigin}/?auth_error=${encodeURIComponent(errMsg)}`);
    }

    const supaSession = supaAuthData.session;
    const supaUser = supaAuthData.user;

    // 6. Sync user profile into Supabase PostgreSQL using genuine Supabase UUID
    const derivedUsername =
      (supaUser.user_metadata?.full_name as string) ||
      (supaUser.user_metadata?.name as string) ||
      (supaUser.email ? supaUser.email.split('@')[0] : 'GoogleUser');

    await supabaseService.upsertUserProfile({
      id: supaUser.id, // Genuine Supabase User UUID
      email: supaUser.email,
      username: derivedUsername,
      displayName: (supaUser.user_metadata?.full_name as string) || derivedUsername,
      avatarUrl: (supaUser.user_metadata?.avatar_url as string) || (supaUser.user_metadata?.picture as string),
    }).catch((err) => {
      console.warn('[GoogleOAuth] Non-blocking profile upsert warning:', err);
    });

    // 7. Store single-use authorization ticket in Redis (60-second TTL)
    const authTicket = crypto.randomBytes(32).toString('hex');
    const ticketRecord: AuthTicketRecord = {
      ticket: authTicket,
      session: {
        access_token: supaSession.access_token,
        refresh_token: supaSession.refresh_token,
        expires_at: supaSession.expires_at,
        expires_in: supaSession.expires_in,
        token_type: supaSession.token_type,
        user: {
          id: supaUser.id,
          email: supaUser.email,
          createdAt: supaUser.created_at,
          user_metadata: supaUser.user_metadata,
        },
      },
      createdAt: Date.now(),
    };

    await authStore.saveAuthTicket(authTicket, ticketRecord, TICKET_TTL_SECONDS);

    // 8. Set HTTP-only cookie as defense-in-depth for direct/same-domain clients
    res.cookie('sevenanime_token', supaSession.access_token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/',
    });

    // 9. Redirect browser to frontend SPA with single-use ticket
    if (req.headers.accept?.includes('application/json')) {
      return res.json({
        success: true,
        session: {
          access_token: supaSession.access_token,
          refresh_token: supaSession.refresh_token,
          expires_at: supaSession.expires_at,
          user: {
            id: supaUser.id,
            email: supaUser.email,
            username: derivedUsername,
          },
        },
      });
    }

    return res.redirect(`${targetOrigin}/?auth_ticket=${authTicket}`);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[GoogleOAuth] Unexpected error during callback processing:', errorMsg);
    if (req.headers.accept?.includes('application/json')) {
      return res.status(500).json({ success: false, error: 'Internal OAuth callback processing error' });
    }
    return res.redirect(`${targetOrigin}/?auth_error=${encodeURIComponent('Internal error during Google sign-in.')}`);
  }
}

/**
 * Exchanges a single-use authorization ticket for an active Supabase session.
 * Protects against cross-origin cookie restrictions and token leakage in URL history.
 * Atomically consumes and invalidates ticket in Redis (GETDEL) to prevent replay attacks.
 */
export async function exchangeAuthTicket(req: Request, res: Response) {
  const { ticket } = req.body || {};
  if (!ticket || typeof ticket !== 'string') {
    return res.status(400).json({ success: false, error: 'Authorization ticket is required.' });
  }

  let entry: AuthTicketRecord | null = null;
  try {
    entry = await authStore.getDelAuthTicket(ticket.trim());
  } catch (err) {
    console.error('[Auth] Redis ticket exchange error:', (err as Error).message);
    return res.status(503).json({
      success: false,
      error: 'Authentication service temporarily unavailable.',
    });
  }

  if (!entry) {
    return res.status(401).json({
      success: false,
      error: 'Invalid, expired, or already consumed authorization ticket.',
    });
  }

  if (entry.session.access_token && typeof res.cookie === 'function') {
    res.cookie('sevenanime_token', entry.session.access_token, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: config.nodeEnv === 'production' ? 'none' : 'lax',
      maxAge: (entry.session.expires_in || 3600) * 1000,
      path: '/',
    });
  }

  return res.json({
    success: true,
    session: entry.session,
  });
}

/**
 * Refreshes an expired Supabase session using the refresh token.
 */
export async function refreshSession(req: Request, res: Response) {
  const { refresh_token } = req.body || {};
  if (!refresh_token || typeof refresh_token !== 'string') {
    return res.status(400).json({ success: false, error: 'Refresh token is required.' });
  }

  if (!supabaseService.isReady()) {
    return res.status(503).json({ success: false, error: 'Supabase client is not initialized.' });
  }

  try {
    const { data, error } = await supabaseService.getClient()!.auth.refreshSession({
      refresh_token: refresh_token.trim(),
    });

    if (error || !data.session) {
      return res.status(401).json({ success: false, error: error?.message || 'Failed to refresh Supabase session.' });
    }

    res.cookie('sevenanime_token', data.session.access_token, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: config.nodeEnv === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      success: true,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
        expires_in: data.session.expires_in,
        token_type: data.session.token_type,
        user: data.session.user,
      },
    });
  } catch (err: unknown) {
    return res.status(500).json({ success: false, error: 'Internal error during session refresh.' });
  }
}

/**
 * Server-side logout: clears session cookies and signs out of Supabase GoTrue.
 */
export async function logout(req: Request, res: Response) {
  const token = extractBearerToken(req);

  const cookieOptions = {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: config.nodeEnv === 'production' ? ('none' as const) : ('lax' as const),
  };

  res.clearCookie('sevenanime_token', cookieOptions);
  res.clearCookie('sb-access-token', cookieOptions);
  res.clearCookie('oauth_state', { path: '/api/auth' });

  if (token && supabaseService.isReady()) {
    try {
      await supabaseService.getClient()!.auth.signOut();
    } catch {}
  }

  return res.json({
    success: true,
    message: 'Logged out successfully.',
  });
}

/**
 * Returns the currently authenticated user's profile.
 */
export async function getMe(req: AuthenticatedRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const profile = await supabaseService.getUserProfile(req.user);
  return res.json({
    success: true,
    data: {
      user: {
        id: req.user.id,
        email: req.user.email,
        createdAt: req.user.created_at,
        app_metadata: req.user.app_metadata,
        user_metadata: req.user.user_metadata,
      },
      profile,
    },
  });
}

const VALID_AVATAR_DECORATIONS = new Set([
  'none',
  'neon_halo', 'ember_crown', 'sakura_drift', 'frostbite', 'lucky_clover',
  'thunderstrike', 'heartbeat', 'neko_ears', 'victory_laurel', 'starlight',
  'pumpkin_night', 'frosty_hat', 'spring_bloom',
  'butterflies', 'bubbles', 'melody',
  'cyber_ring', 'crescent_night',
  'kitsune', 'angel_halo', 'devil_horns', 'jade_dragon',
  'royal_crown',
  // Backwards compatibility legacy frames
  'crown', 'celestial', 'crimson', 'neon',
]);

const VALID_BANNER_EFFECTS = new Set([
  'none',
  'sakura', 'snowfall', 'night_sky', 'fireflies', 'aurora',
  'embers', 'hearts', 'confetti',
  'neon_rain', 'autumn_leaves',
  'bubbles', 'fireworks', 'thunderstorm',
  'code_rain',
  // Backwards compatibility legacy aliases
  'snow', 'stars',
]);

const AVATAR_DECORATION_REQUIREMENTS: Record<string, { type: 'free' | 'level' | 'seasonal' | 'vip'; level?: number; months?: number[] }> = {
  'none': { type: 'free' },
  'neon_halo': { type: 'free' },
  'ember_crown': { type: 'free' },
  'sakura_drift': { type: 'free' },
  'frostbite': { type: 'free' },
  'lucky_clover': { type: 'free' },
  'thunderstrike': { type: 'free' },
  'heartbeat': { type: 'free' },
  'neko_ears': { type: 'free' },
  'victory_laurel': { type: 'free' },
  'starlight': { type: 'free' },
  'pumpkin_night': { type: 'seasonal', months: [9] }, // October (0-indexed)
  'frosty_hat': { type: 'seasonal', months: [11, 0, 1] }, // Dec-Feb
  'spring_bloom': { type: 'seasonal', months: [2, 3, 4] }, // Mar-May
  'butterflies': { type: 'level', level: 1 },
  'bubbles': { type: 'level', level: 1 },
  'melody': { type: 'level', level: 2 },
  'cyber_ring': { type: 'level', level: 3 },
  'crescent_night': { type: 'level', level: 3 },
  'kitsune': { type: 'level', level: 5 },
  'angel_halo': { type: 'level', level: 5 },
  'devil_horns': { type: 'level', level: 5 },
  'jade_dragon': { type: 'level', level: 10 },
  'royal_crown': { type: 'vip' },
  'crown': { type: 'vip' },
  'celestial': { type: 'free' },
  'crimson': { type: 'free' },
  'neon': { type: 'free' },
};

const BANNER_EFFECT_REQUIREMENTS: Record<string, { type: 'free' | 'level' | 'vip'; level?: number }> = {
  'none': { type: 'free' },
  'sakura': { type: 'free' },
  'snowfall': { type: 'free' },
  'snow': { type: 'free' },
  'night_sky': { type: 'free' },
  'stars': { type: 'free' },
  'fireflies': { type: 'free' },
  'aurora': { type: 'free' },
  'embers': { type: 'free' },
  'hearts': { type: 'free' },
  'confetti': { type: 'free' },
  'neon_rain': { type: 'free' },
  'autumn_leaves': { type: 'free' },
  'bubbles': { type: 'level', level: 2 },
  'fireworks': { type: 'level', level: 5 },
  'thunderstorm': { type: 'level', level: 5 },
  'code_rain': { type: 'vip' },
};

function isCosmeticAllowed(
  reqMeta: { type: 'free' | 'level' | 'seasonal' | 'vip'; level?: number; months?: number[] } | undefined,
  isVip: boolean,
  userLevel: number
): boolean {
  if (!reqMeta) return true;
  if (isVip) return true;
  if (reqMeta.type === 'free') return true;
  if (reqMeta.type === 'level') return userLevel >= (reqMeta.level ?? 1);
  if (reqMeta.type === 'seasonal') {
    const currentMonth = new Date().getMonth();
    return Boolean(reqMeta.months && reqMeta.months.includes(currentMonth));
  }
  if (reqMeta.type === 'vip') return isVip;
  return false;
}

/**
 * Updates the user's profile.
 */
export async function updateProfile(req: AuthenticatedRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const {
    username,
    displayName,
    avatarUrl,
    bio,
    avatarDecoration,
    bannerEffect,
    bannerUrl,
    banner,
    frameStyle,
  } = req.body;

  const effectiveBannerUrl = bannerUrl || banner;

  const isVip = Boolean(
    req.user.user_metadata?.isVip ||
    req.user.user_metadata?.vip ||
    req.user.app_metadata?.isVip ||
    req.user.app_metadata?.claims_admin
  );

  const userLevel = typeof req.user.user_metadata?.level === 'number'
    ? req.user.user_metadata.level
    : 0; // Default to Level 0 until a verified progression system exists

  const normalizedAvatarDeco = typeof avatarDecoration === 'string'
    ? avatarDecoration.replace(/-/g, '_')
    : avatarDecoration;

  const normalizedBannerEffect = typeof bannerEffect === 'string'
    ? bannerEffect.replace(/-/g, '_')
    : bannerEffect;

  // Validate avatar decoration if provided
  if (normalizedAvatarDeco !== undefined && normalizedAvatarDeco !== null) {
    if (typeof normalizedAvatarDeco !== 'string' || !VALID_AVATAR_DECORATIONS.has(normalizedAvatarDeco)) {
      return res.status(400).json({
        success: false,
        error: `Invalid avatar decoration: "${avatarDecoration}". Must be a valid cosmetic ID.`,
      });
    }

    const reqMeta = AVATAR_DECORATION_REQUIREMENTS[normalizedAvatarDeco];
    if (!isCosmeticAllowed(reqMeta, isVip, userLevel)) {
      return res.status(403).json({
        success: false,
        error: `Avatar decoration "${avatarDecoration}" is locked for your current level or membership.`,
      });
    }
  }

  // Validate banner effect if provided
  if (normalizedBannerEffect !== undefined && normalizedBannerEffect !== null) {
    if (typeof normalizedBannerEffect !== 'string' || !VALID_BANNER_EFFECTS.has(normalizedBannerEffect)) {
      return res.status(400).json({
        success: false,
        error: `Invalid banner effect: "${bannerEffect}". Must be a valid banner effect ID.`,
      });
    }

    const reqMeta = BANNER_EFFECT_REQUIREMENTS[normalizedBannerEffect];
    if (!isCosmeticAllowed(reqMeta, isVip, userLevel)) {
      return res.status(403).json({
        success: false,
        error: `Banner effect "${bannerEffect}" is locked for your current level or membership.`,
      });
    }
  }

  // Validate bannerUrl if provided
  if (effectiveBannerUrl !== undefined && effectiveBannerUrl !== null) {
    if (typeof effectiveBannerUrl !== 'string') {
      return res.status(400).json({ success: false, error: 'bannerUrl must be a string' });
    }
    const trimmedBanner = effectiveBannerUrl.trim();
    if (trimmedBanner.length > 7 * 1024 * 1024) {
      return res.status(400).json({ success: false, error: 'bannerUrl exceeds maximum permitted size (5MB)' });
    }
    if (trimmedBanner.toLowerCase().startsWith('javascript:')) {
      return res.status(400).json({ success: false, error: 'Invalid bannerUrl protocol' });
    }
  }

  const result = await supabaseService.upsertUserProfile({
    id: req.user.id,
    email: req.user.email,
    username,
    displayName,
    avatarUrl,
    bio,
    avatarDecoration: normalizedAvatarDeco || undefined,
    bannerEffect: normalizedBannerEffect || undefined,
    bannerUrl: effectiveBannerUrl || undefined,
    frameStyle: frameStyle || undefined,
  });

  if (!result.success) {
    return res.status(500).json({ success: false, error: result.error });
  }

  return res.json({ success: true, message: 'Profile updated successfully' });
}

/**
 * Gets user watchlist.
 */
export async function getWatchlist(req: AuthenticatedRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const watchlist = await supabaseService.getWatchlist(req.user.id);
  return res.json({ success: true, data: watchlist });
}

/**
 * Adds or updates an item in user watchlist.
 */
export async function updateWatchlist(req: AuthenticatedRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const { animeId, animeTitle, posterUrl, format, status } = req.body;
  if (!animeId || !animeTitle || !status) {
    return res.status(400).json({ success: false, error: 'animeId, animeTitle and status are required' });
  }

  const result = await supabaseService.upsertWatchlistItem({
    userId: req.user.id,
    animeId: Number(animeId),
    animeTitle: String(animeTitle),
    posterUrl: posterUrl ? String(posterUrl) : undefined,
    format: format ? String(format) : undefined,
    status,
  });

  if (!result.success) {
    return res.status(500).json({ success: false, error: result.error });
  }

  return res.json({ success: true, message: 'Watchlist updated' });
}

/**
 * Sends a password reset email using the verified SMTP service.
 */
export async function sendPasswordReset(req: Request, res: Response) {
  const { email, resetCodeOrUrl } = req.body;

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ success: false, error: 'Valid email address is required' });
  }

  const targetCode = resetCodeOrUrl || Math.floor(100000 + Math.random() * 900000).toString();
  const result = await mailerService.sendPasswordResetEmail(email, targetCode);

  if (!result.success) {
    return res.status(500).json({ success: false, error: result.error });
  }

  return res.json({
    success: true,
    message: `Password reset email dispatched to ${email}`,
  });
}
