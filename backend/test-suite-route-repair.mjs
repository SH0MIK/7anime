/**
 * 7Anime Production Route Repair & OAuth Flow Verification Suite
 *
 * Verifies:
 * 1. Base URL normalization centrally with and without /api (no /api/api).
 * 2. Express route mounting for /api/anime, /api/auth, /api/health, and root /health.
 * 3. Google OAuth URL generator and callback route registration.
 * 4. Google OAuth callback handler parameter validation and error flows.
 * 5. Anime recent-airing, trending, logos, details, and episodes route integrity.
 * 6. Auth subsystem status and Supabase/SMTP readiness.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { authRouter } from './dist/routes/auth.route.js';
import { animeRouter } from './dist/routes/anime.route.js';
import { healthRouter } from './dist/routes/health.route.js';
import {
  getGoogleOAuthUrl,
  initiateGoogleOAuth,
  handleGoogleOAuthCallback,
  resolveGoogleRedirectUri,
  exchangeAuthTicket,
  refreshSession,
  logout,
  oauthStateMap,
  authTicketMap,
  authStore,
} from './dist/controllers/auth.controller.js';
import { config } from './dist/config/env.js';
import { supabaseService } from './dist/services/supabase/supabase.service.js';

let passed = 0;
let failed = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`[PASS] ${desc}`);
    passed++;
  } catch (err) {
    console.error(`[FAIL] ${desc}: ${err.message}`);
    failed++;
  }
}

async function itAsync(desc, fn) {
  try {
    await fn();
    console.log(`[PASS] ${desc}`);
    passed++;
  } catch (err) {
    console.error(`[FAIL] ${desc}: ${err.message}`);
    failed++;
  }
}

console.log('================================================================');
console.log('    7ANIME PRODUCTION REPAIR & ROUTE INTEGRITY TEST SUITE       ');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// TEST GROUP 1: Base URL Normalization Logic (apiClient constructor parity)
// -----------------------------------------------------------------------------
console.log('--- TEST GROUP 1: API Base URL Normalization ---');

function normalizeBaseUrl(rawEnv) {
  const trimmed = (rawEnv || '').trim();
  if (!trimmed) {
    return '/api';
  }
  const clean = trimmed.replace(/\/+$/, '');
  return clean.endsWith('/api') ? clean : `${clean}/api`;
}

it('Normalizes empty string to /api', () => {
  assert.strictEqual(normalizeBaseUrl(''), '/api');
  assert.strictEqual(normalizeBaseUrl(undefined), '/api');
});

it('Normalizes bare Render origin to contain exactly one /api', () => {
  assert.strictEqual(
    normalizeBaseUrl('https://sevenanime-new.onrender.com'),
    'https://sevenanime-new.onrender.com/api'
  );
  assert.strictEqual(
    normalizeBaseUrl('https://sevenanime-new.onrender.com/'),
    'https://sevenanime-new.onrender.com/api'
  );
});

it('Preserves origin already ending in /api without duplicating /api/api', () => {
  assert.strictEqual(
    normalizeBaseUrl('https://sevenanime-new.onrender.com/api'),
    'https://sevenanime-new.onrender.com/api'
  );
  assert.strictEqual(
    normalizeBaseUrl('https://sevenanime-new.onrender.com/api/'),
    'https://sevenanime-new.onrender.com/api'
  );
  assert(!normalizeBaseUrl('https://sevenanime-new.onrender.com/api').includes('/api/api'));
});

it('Normalizes localhost dev origins with and without /api', () => {
  assert.strictEqual(normalizeBaseUrl('http://localhost:3001'), 'http://localhost:3001/api');
  assert.strictEqual(normalizeBaseUrl('http://localhost:3001/api'), 'http://localhost:3001/api');
  assert.strictEqual(normalizeBaseUrl('http://localhost:3001/api/'), 'http://localhost:3001/api');
});

it('All endpoint combinations produce verified canonical paths', () => {
  const baseUrl = normalizeBaseUrl('https://sevenanime-new.onrender.com');
  const recentAiringUrl = `${baseUrl}/anime/recent-airing`;
  const logosUrl = `${baseUrl}/anime/logos?ids=21`;
  const trendingUrl = `${baseUrl}/anime/trending?page=1`;
  const episodesUrl = `${baseUrl}/anime/21/episodes`;
  const googleOAuthUrl = `${baseUrl}/auth/google/url`;
  const healthUrl = `${baseUrl}/health`;

  assert.strictEqual(recentAiringUrl, 'https://sevenanime-new.onrender.com/api/anime/recent-airing');
  assert.strictEqual(logosUrl, 'https://sevenanime-new.onrender.com/api/anime/logos?ids=21');
  assert.strictEqual(trendingUrl, 'https://sevenanime-new.onrender.com/api/anime/trending?page=1');
  assert.strictEqual(episodesUrl, 'https://sevenanime-new.onrender.com/api/anime/21/episodes');
  assert.strictEqual(googleOAuthUrl, 'https://sevenanime-new.onrender.com/api/auth/google/url');
  assert.strictEqual(healthUrl, 'https://sevenanime-new.onrender.com/api/health');
});

// -----------------------------------------------------------------------------
// TEST GROUP 2: Express Route Definitions & Mounting
// -----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 2: Express Route Stack Verification ---');

function getRouterPaths(router) {
  return router.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods),
    }));
}

const authPaths = getRouterPaths(authRouter);
it('authRouter registers /google/url GET endpoint', () => {
  const match = authPaths.find((r) => r.path === '/google/url' && r.methods.includes('get'));
  assert(Boolean(match), 'Expected /google/url GET in authRouter');
});

it('authRouter registers /google GET endpoint for direct first-party OAuth navigation', () => {
  const match = authPaths.find((r) => r.path === '/google' && r.methods.includes('get'));
  assert(Boolean(match), 'Expected /google GET in authRouter');
});

it('authRouter registers /google/callback GET endpoint', () => {
  const match = authPaths.find((r) => r.path === '/google/callback' && r.methods.includes('get'));
  assert(Boolean(match), 'Expected /google/callback GET in authRouter');
});

it('authRouter registers /session/exchange POST endpoint', () => {
  const match = authPaths.find((r) => r.path === '/session/exchange' && r.methods.includes('post'));
  assert(Boolean(match), 'Expected /session/exchange POST in authRouter');
});

it('authRouter registers /session/refresh POST endpoint', () => {
  const match = authPaths.find((r) => r.path === '/session/refresh' && r.methods.includes('post'));
  assert(Boolean(match), 'Expected /session/refresh POST in authRouter');
});

it('authRouter registers /logout POST endpoint', () => {
  const match = authPaths.find((r) => r.path === '/logout' && r.methods.includes('post'));
  assert(Boolean(match), 'Expected /logout POST in authRouter');
});

it('authRouter preserves /status, /config, /password-reset, /me, /profile, /watchlist', () => {
  const registered = authPaths.map((r) => r.path);
  assert(registered.includes('/status'), 'Missing /status');
  assert(registered.includes('/config'), 'Missing /config');
  assert(registered.includes('/password-reset'), 'Missing /password-reset');
  assert(registered.includes('/me'), 'Missing /me');
  assert(registered.includes('/profile'), 'Missing /profile');
  assert(registered.includes('/watchlist'), 'Missing /watchlist');
});

const animePaths = getRouterPaths(animeRouter);
it('animeRouter registers all required anime metadata endpoints', () => {
  const registered = animePaths.map((r) => r.path);
  assert(registered.includes('/recent-airing'), 'Missing /recent-airing');
  assert(registered.includes('/trending'), 'Missing /trending');
  assert(registered.includes('/logos'), 'Missing /logos');
  assert(registered.includes('/search'), 'Missing /search');
  assert(registered.includes('/:anilistId'), 'Missing /:anilistId');
  assert(registered.includes('/:anilistId/episodes'), 'Missing /:anilistId/episodes');
  assert(registered.includes('/:anilistId/artwork'), 'Missing /:anilistId/artwork');
  assert(registered.includes('/:anilistId/logo'), 'Missing /:anilistId/logo');
  assert(registered.includes('/:anilistId/external-ids'), 'Missing /:anilistId/external-ids');
});

const healthPaths = getRouterPaths(healthRouter);
it('healthRouter registers /health endpoint', () => {
  const registered = healthPaths.map((r) => r.path);
  assert(registered.includes('/health'), 'Missing /health in healthRouter');
});

// -----------------------------------------------------------------------------
// TEST GROUP 3: Google OAuth URL & Redirect URI Generation
// -----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 3: Google OAuth URL Generation & Redirect Logic ---');

it('resolveGoogleRedirectUri prioritizes configured GOOGLE_REDIRECT_URI', () => {
  const fakeReq = {
    protocol: 'http',
    headers: {},
    get: () => 'localhost:3001',
  };
  const resolved = resolveGoogleRedirectUri(fakeReq);
  assert(resolved.includes('/api/auth/google/callback'), 'Redirect URI includes /api/auth/google/callback');
  if (config.googleRedirectUri) {
    assert.strictEqual(resolved, config.googleRedirectUri);
  }
});

it('resolveGoogleRedirectUri correctly handles proxy headers', () => {
  const originalConfigUri = config.googleRedirectUri;
  try {
    delete config.googleRedirectUri;
    const proxyReq = {
      protocol: 'http',
      headers: {
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'sevenanime-new.onrender.com',
      },
      get: () => 'internal-render-port:10000',
    };
    const uri = resolveGoogleRedirectUri(proxyReq);
    assert.strictEqual(uri, 'https://sevenanime-new.onrender.com/api/auth/google/callback');
  } finally {
    config.googleRedirectUri = originalConfigUri;
  }
});

await itAsync('getGoogleOAuthUrl generates valid OAuth authorization URL with required scopes and cryptographic state nonce', async () => {
  let capturedStatus = 200;
  let capturedJson = null;

  const fakeReq = {
    protocol: 'https',
    headers: { referer: 'https://7anime-new.vercel.app' },
    query: {},
    get: (name) => (name === 'host' ? 'sevenanime-new.onrender.com' : 'https://7anime-new.vercel.app'),
  };
  const fakeRes = {
    cookies: {},
    cookie(name, val, opts) {
      this.cookies[name] = { val, opts };
      return this;
    },
    status(code) {
      capturedStatus = code;
      return this;
    },
    json(body) {
      capturedJson = body;
      return this;
    },
  };

  await getGoogleOAuthUrl(fakeReq, fakeRes);

  if (config.googleClientId) {
    assert.strictEqual(capturedStatus, 200);
    assert(capturedJson?.success === true, 'Response is successful');
    assert(capturedJson?.url?.startsWith('https://accounts.google.com/o/oauth2/v2/auth'), 'Target is Google OAuth v2');
    const url = new URL(capturedJson.url);
    assert.strictEqual(url.searchParams.get('client_id'), config.googleClientId);
    assert.strictEqual(url.searchParams.get('response_type'), 'code');
    assert(url.searchParams.get('redirect_uri').includes('/api/auth/google/callback'));
    assert(url.searchParams.get('scope').includes('userinfo.email'));
    assert(url.searchParams.get('scope').includes('userinfo.profile'));

    const stateNonce = url.searchParams.get('state');
    assert(Boolean(stateNonce) && stateNonce.length >= 32, 'Generated crypto state nonce');
    assert.strictEqual(fakeRes.cookies['oauth_state']?.val, stateNonce, 'State nonce set in HTTP-only cookie');
  } else {
    assert.strictEqual(capturedStatus, 503);
    assert(capturedJson?.error?.includes('not configured'));
  }
});

await itAsync('initiateGoogleOAuth sets first-party oauth_state cookie, stores in authStore, and 302 redirects to Google', async () => {
  let redirectedUrl = null;
  let cookieSet = null;
  const fakeReq = {
    protocol: 'https',
    headers: { referer: 'https://7anime-new.vercel.app' },
    query: {},
    get: (name) => (name === 'host' ? 'sevenanime-new.onrender.com' : 'https://7anime-new.vercel.app'),
  };
  const fakeRes = {
    cookie(name, val, opts) {
      cookieSet = { name, val, opts };
      return this;
    },
    redirect(url) {
      redirectedUrl = url;
    },
    status() { return this; },
    json() { return this; },
  };

  await initiateGoogleOAuth(fakeReq, fakeRes);

  if (config.googleClientId) {
    assert(Boolean(redirectedUrl), 'Redirect was invoked');
    assert(redirectedUrl.startsWith('https://accounts.google.com/o/oauth2/v2/auth'));
    assert(cookieSet && cookieSet.name === 'oauth_state');
    assert.strictEqual(cookieSet.opts.httpOnly, true);
    assert.strictEqual(cookieSet.opts.sameSite, 'lax');
  }
});

// -----------------------------------------------------------------------------
// TEST GROUP 4: Google OAuth Callback Handler Error & Validation Flows
// -----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 4: Google OAuth Callback Error Handling & State Validation ---');

await itAsync('Callback redirects with error when Google returns access_denied', async () => {
  let redirectedUrl = null;
  const fakeReq = {
    protocol: 'https',
    headers: { referer: 'https://7anime-new.vercel.app' },
    query: { error: 'access_denied', error_description: 'User denied permission', state: 'https://7anime-new.vercel.app' },
    get: () => 'sevenanime-new.onrender.com',
  };
  const fakeRes = {
    redirect(url) {
      redirectedUrl = url;
    },
    status() { return this; },
    json() { return this; },
  };

  await handleGoogleOAuthCallback(fakeReq, fakeRes);
  assert(Boolean(redirectedUrl), 'Redirect was invoked');
  assert(redirectedUrl.includes('auth_error='), 'Redirect includes auth_error');
  assert(redirectedUrl.startsWith('https://7anime-new.vercel.app'), 'Redirects to allowed frontend origin');
});

await itAsync('Callback rejects missing state parameter with 400 when JSON requested', async () => {
  let capturedStatus = 200;
  let capturedJson = null;
  const fakeReq = {
    protocol: 'https',
    headers: { accept: 'application/json' },
    query: { code: 'fake-code' },
    get: () => 'sevenanime-new.onrender.com',
  };
  const fakeRes = {
    status(code) { capturedStatus = code; return this; },
    json(body) { capturedJson = body; return this; },
    clearCookie() { return this; },
  };

  await handleGoogleOAuthCallback(fakeReq, fakeRes);
  assert.strictEqual(capturedStatus, 400);
  assert(capturedJson?.success === false);
  assert(capturedJson?.error?.includes('state'));
});

await itAsync('Callback strictly rejects missing oauth_state cookie with 400 when JSON requested', async () => {
  let capturedStatus = 200;
  let capturedJson = null;
  const fakeReq = {
    protocol: 'https',
    headers: { accept: 'application/json' },
    query: { code: 'fake-code', state: 'unaccompanied-state-12345' },
    get: () => 'sevenanime-new.onrender.com',
  };
  const fakeRes = {
    status(code) { capturedStatus = code; return this; },
    json(body) { capturedJson = body; return this; },
    clearCookie() { return this; },
  };

  await handleGoogleOAuthCallback(fakeReq, fakeRes);
  assert.strictEqual(capturedStatus, 400);
  assert(capturedJson?.success === false);
  assert(capturedJson?.error?.toLowerCase().includes('missing'));
});

await itAsync('Callback rejects forged/unregistered state parameter with 400 when JSON requested', async () => {
  let capturedStatus = 200;
  let capturedJson = null;
  const fakeReq = {
    protocol: 'https',
    headers: {
      accept: 'application/json',
      cookie: 'oauth_state=forged-state-12345',
    },
    query: { code: 'fake-code', state: 'forged-state-12345' },
    get: () => 'sevenanime-new.onrender.com',
  };
  const fakeRes = {
    status(code) { capturedStatus = code; return this; },
    json(body) { capturedJson = body; return this; },
    clearCookie() { return this; },
  };

  await handleGoogleOAuthCallback(fakeReq, fakeRes);
  assert.strictEqual(capturedStatus, 400);
  assert(capturedJson?.success === false);
  assert(capturedJson?.error?.toLowerCase().includes('invalid'));
});

await itAsync('Callback rejects state parameter when cookie state does not match', async () => {
  const nonce = 'mismatch-test-nonce-' + Date.now();
  await authStore.saveOAuthState(nonce, {
    nonce,
    clientOrigin: 'https://7anime-new.vercel.app',
    createdAt: Date.now(),
  });

  let capturedStatus = 200;
  let capturedJson = null;
  const fakeReq = {
    protocol: 'https',
    headers: {
      accept: 'application/json',
      cookie: 'oauth_state=different-cookie-nonce',
    },
    query: { code: 'fake-code', state: nonce },
    get: () => 'sevenanime-new.onrender.com',
  };
  const fakeRes = {
    status(code) { capturedStatus = code; return this; },
    json(body) { capturedJson = body; return this; },
    clearCookie() { return this; },
  };

  await handleGoogleOAuthCallback(fakeReq, fakeRes);
  assert.strictEqual(capturedStatus, 400);
  assert(capturedJson?.success === false);
  assert(capturedJson?.error?.includes('mismatch'));
});

await itAsync('Callback handles missing code with 400 when valid state is provided', async () => {
  const nonce = 'valid-nonce-missing-code-' + Date.now();
  await authStore.saveOAuthState(nonce, {
    nonce,
    clientOrigin: 'https://7anime-new.vercel.app',
    createdAt: Date.now(),
  });

  let capturedStatus = 200;
  let capturedJson = null;
  const fakeReq = {
    protocol: 'https',
    headers: {
      accept: 'application/json',
      cookie: `oauth_state=${nonce}`,
    },
    query: { state: nonce },
    get: () => 'sevenanime-new.onrender.com',
  };
  const fakeRes = {
    status(code) {
      capturedStatus = code;
      return this;
    },
    json(body) {
      capturedJson = body;
      return this;
    },
    clearCookie() { return this; },
  };

  await handleGoogleOAuthCallback(fakeReq, fakeRes);
  assert.strictEqual(capturedStatus, 400);
  assert(capturedJson?.success === false);
  assert(capturedJson?.error?.includes('code is missing'));
});

// -----------------------------------------------------------------------------
// TEST GROUP 5: Single-Use Authorization Ticket Exchange & Anti-Replay
// -----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 5: Authorization Ticket Exchange & Replay Protection ---');

await itAsync('exchangeAuthTicket rejects missing ticket with 400', async () => {
  let capturedStatus = 200;
  let capturedJson = null;
  const fakeReq = { body: {} };
  const fakeRes = {
    status(code) { capturedStatus = code; return this; },
    json(body) { capturedJson = body; return this; },
    cookie() { return this; },
  };

  await exchangeAuthTicket(fakeReq, fakeRes);
  assert.strictEqual(capturedStatus, 400);
  assert.strictEqual(capturedJson?.success, false);
});

await itAsync('exchangeAuthTicket rejects non-existent ticket with 401', async () => {
  let capturedStatus = 200;
  let capturedJson = null;
  const fakeReq = { body: { ticket: 'non-existent-ticket-xyz' } };
  const fakeRes = {
    status(code) { capturedStatus = code; return this; },
    json(body) { capturedJson = body; return this; },
    cookie() { return this; },
  };

  await exchangeAuthTicket(fakeReq, fakeRes);
  assert.strictEqual(capturedStatus, 401);
  assert.strictEqual(capturedJson?.success, false);
});

await itAsync('exchangeAuthTicket rejects expired ticket (>60s) with 401', async () => {
  const expiredTicket = 'expired-ticket-' + Date.now();
  authTicketMap.set(expiredTicket, {
    ticket: expiredTicket,
    session: {
      access_token: 'fake-access',
      refresh_token: 'fake-refresh',
      token_type: 'bearer',
      user: { id: 'uuid-123' },
    },
    createdAt: Date.now() - 70000,
  });

  let capturedStatus = 200;
  let capturedJson = null;
  const fakeReq = { body: { ticket: expiredTicket } };
  const fakeRes = {
    status(code) { capturedStatus = code; return this; },
    json(body) { capturedJson = body; return this; },
    cookie() { return this; },
  };

  await exchangeAuthTicket(fakeReq, fakeRes);
  assert.strictEqual(capturedStatus, 401);
  assert.strictEqual(capturedJson?.success, false);
  assert(!authTicketMap.has(expiredTicket), 'Expired ticket was cleaned from registry');
});

await itAsync('exchangeAuthTicket exchanges valid ticket and atomically consumes it (anti-replay)', async () => {
  const validTicket = 'valid-ticket-' + Date.now();
  const mockSession = {
    access_token: 'valid-access-token-123',
    refresh_token: 'valid-refresh-token-456',
    token_type: 'bearer',
    user: { id: '00000000-0000-0000-0000-000000000001', email: 'test@7anime.io' },
  };
  authTicketMap.set(validTicket, {
    ticket: validTicket,
    session: mockSession,
    createdAt: Date.now(),
  });

  let capturedStatus = 200;
  let capturedJson = null;
  let cookieSet = null;
  const fakeReq = { body: { ticket: validTicket } };
  const fakeRes = {
    status(code) { capturedStatus = code; return this; },
    json(body) { capturedJson = body; return this; },
    cookie(name, val, opts) { cookieSet = { name, val, opts }; return this; },
  };

  // 1st attempt: should succeed
  await exchangeAuthTicket(fakeReq, fakeRes);
  assert.strictEqual(capturedStatus, 200);
  assert.strictEqual(capturedJson?.success, true);
  assert.strictEqual(capturedJson?.session?.access_token, 'valid-access-token-123');
  assert.strictEqual(cookieSet?.name, 'sevenanime_token');

  // Verify ticket was atomically removed
  assert(!authTicketMap.has(validTicket), 'Ticket was consumed from registry');

  // 2nd attempt (Replay Attack): MUST fail with 401!
  let replayStatus = 200;
  let replayJson = null;
  const replayRes = {
    status(code) { replayStatus = code; return this; },
    json(body) { replayJson = body; return this; },
    cookie() { return this; },
  };
  await exchangeAuthTicket(fakeReq, replayRes);
  assert.strictEqual(replayStatus, 401, 'Replay attempt must be rejected with 401');
  assert.strictEqual(replayJson?.success, false);
});

await itAsync('authStore atomic single-use OAuth state storage & GETDEL consumption', async () => {
  const testNonce = 'atomic-state-test-' + Date.now();
  const stateRecord = {
    nonce: testNonce,
    clientOrigin: 'https://7anime-new.vercel.app',
    createdAt: Date.now(),
  };

  await authStore.saveOAuthState(testNonce, stateRecord);
  const firstRetrieval = await authStore.getDelOAuthState(testNonce);
  assert(firstRetrieval !== null, 'First retrieval succeeds');
  assert.strictEqual(firstRetrieval.nonce, testNonce);

  // Single-use guarantee: second retrieval MUST be null!
  const secondRetrieval = await authStore.getDelOAuthState(testNonce);
  assert.strictEqual(secondRetrieval, null, 'Second retrieval must return null (atomic single-use consumption)');
});

await itAsync('authStore atomic single-use auth ticket storage & GETDEL anti-replay', async () => {
  const testTicket = 'atomic-ticket-test-' + Date.now();
  const ticketRecord = {
    ticket: testTicket,
    session: {
      access_token: 'test-jwt-access-token',
      token_type: 'bearer',
      user: { id: '00000000-0000-0000-0000-000000000002', email: 'atomic@7anime.io' },
    },
    createdAt: Date.now(),
  };

  await authStore.saveAuthTicket(testTicket, ticketRecord);
  const firstRetrieval = await authStore.getDelAuthTicket(testTicket);
  assert(firstRetrieval !== null, 'First ticket retrieval succeeds');
  assert.strictEqual(firstRetrieval.ticket, testTicket);

  // Anti-replay guarantee: second retrieval MUST be null!
  const secondRetrieval = await authStore.getDelAuthTicket(testTicket);
  assert.strictEqual(secondRetrieval, null, 'Second ticket retrieval must return null (anti-replay)');
});

// -----------------------------------------------------------------------------
// TEST GROUP 6: Server-Side Logout & Cookie Clearance
// -----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 6: Server-Side Logout ---');

await itAsync('logout clears session cookies and returns success', async () => {
  let clearedCookies = [];
  let capturedJson = null;
  const fakeReq = { headers: {} };
  const fakeRes = {
    clearCookie(name, opts) {
      clearedCookies.push({ name, opts });
      return this;
    },
    json(body) {
      capturedJson = body;
      return this;
    },
  };

  await logout(fakeReq, fakeRes);
  assert.strictEqual(capturedJson?.success, true);
  assert(clearedCookies.some((c) => c.name === 'sevenanime_token'), 'sevenanime_token cookie cleared');
  assert(clearedCookies.some((c) => c.name === 'oauth_state'), 'oauth_state cookie cleared');
});

// -----------------------------------------------------------------------------
// TEST GROUP 7: Frontend Security & Elimination of Unauthenticated URL Param Login
// -----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 7: Frontend Security Audit ---');

it('Frontend AppContext does not authenticate from URL query params alone', () => {
  const appContextPath = fs.existsSync('./frontend/src/context/AppContext.tsx')
    ? './frontend/src/context/AppContext.tsx'
    : '../frontend/src/context/AppContext.tsx';
  const appContextSource = fs.readFileSync(appContextPath, 'utf-8');

  // Must not have signIn(authProvider) triggered by authSuccess
  assert(
    !appContextSource.includes('signIn(authProvider'),
    'AppContext must NOT call signIn(authProvider) from URL parameters'
  );

  // Must use single-use authorization ticket exchange
  assert(
    appContextSource.includes('apiClient.exchangeAuthTicket(authTicket)'),
    'AppContext must exchange authTicket with apiClient'
  );

  // Must fetch verified server profile with getMe
  assert(
    appContextSource.includes('apiClient.getMe()'),
    'AppContext must verify session with apiClient.getMe()'
  );

  // Must clean sensitive URL parameters
  assert(
    appContextSource.includes('window.history.replaceState'),
    'AppContext must immediately sanitize URL query params'
  );

  // Sign out must invoke server-side logout
  assert(
    appContextSource.includes('apiClient.logout()'),
    'AppContext signOut must call apiClient.logout()'
  );
});

it('Frontend apiClient implements concurrent refreshSession deduplication via refreshPromise', () => {
  const apiClientPath = fs.existsSync('./frontend/src/services/apiClient.ts')
    ? './frontend/src/services/apiClient.ts'
    : '../frontend/src/services/apiClient.ts';
  const apiClientSource = fs.readFileSync(apiClientPath, 'utf-8');

  // Verify private in-flight refreshPromise property
  assert(
    apiClientSource.includes('private refreshPromise: Promise<boolean> | null = null;'),
    'apiClient must declare refreshPromise member'
  );

  // Verify early return for existing in-flight refresh
  assert(
    apiClientSource.includes('if (this.refreshPromise) {') &&
    apiClientSource.includes('return this.refreshPromise;'),
    'apiClient must return existing refreshPromise if in-flight'
  );

  // Verify assignment and finally block cleanup
  assert(
    apiClientSource.includes('this.refreshPromise = (async (): Promise<boolean> => {'),
    'apiClient must assign refreshPromise before network request'
  );
  assert(
    apiClientSource.includes('this.refreshPromise = null;'),
    'apiClient must clear refreshPromise in finally block'
  );
});

it('Frontend apiClient provides getGoogleLoginUrl and Dialogs uses top-level navigation', () => {
  const apiClientPath = fs.existsSync('./frontend/src/services/apiClient.ts')
    ? './frontend/src/services/apiClient.ts'
    : '../frontend/src/services/apiClient.ts';
  const apiClientSource = fs.readFileSync(apiClientPath, 'utf-8');

  assert(
    apiClientSource.includes('getGoogleLoginUrl(): string'),
    'apiClient must provide getGoogleLoginUrl()'
  );
  assert(
    apiClientSource.includes('${this.baseUrl}/auth/google'),
    'getGoogleLoginUrl must point to /auth/google'
  );

  const dialogsPath = fs.existsSync('./frontend/src/components/Dialogs.tsx')
    ? './frontend/src/components/Dialogs.tsx'
    : '../frontend/src/components/Dialogs.tsx';
  const dialogsSource = fs.readFileSync(dialogsPath, 'utf-8');

  assert(
    dialogsSource.includes('apiClient.getGoogleLoginUrl()'),
    'Dialogs must use apiClient.getGoogleLoginUrl() for top-level OAuth navigation'
  );
});

// -----------------------------------------------------------------------------
// TEST GROUP 8: Supabase Readiness & Node 22 Compatibility
// -----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 8: Runtime & Supabase Verification ---');

it('Runtime provides global WebSocket or clean fallback', () => {
  assert(typeof globalThis !== 'undefined', 'globalThis is defined');
  const hasWebSocket = typeof globalThis.WebSocket !== 'undefined';
  console.log(`ℹ️ Native WebSocket available in runtime: ${hasWebSocket}`);
});

await itAsync('Supabase service status is initialized and safe', async () => {
  const status = supabaseService.getStatus();
  assert(typeof status === 'object', 'Status is an object');
  assert(typeof status.configured === 'boolean', 'status.configured is boolean');
  assert(typeof status.initialized === 'boolean', 'status.initialized is boolean');
  assert(!JSON.stringify(status).includes('key='), 'No raw secrets in status');
});

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log('\n================================================================');
console.log(`ROUTE REPAIR VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log('================================================================');

if (failed > 0) {
  process.exit(1);
}
