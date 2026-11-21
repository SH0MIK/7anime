import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Deterministically locates and loads the root .env file regardless of
 * current working directory (e.g. running from root or from backend folder).
 */
function findAndLoadRootEnv(): string {
  const candidateDirs = [
    process.cwd(),
    path.resolve(process.cwd(), '..'),
    path.resolve(__dirname, '../../..'), // from backend/src/config or backend/dist/config
    path.resolve(__dirname, '../..'),
    path.resolve(__dirname, '..'),
  ];

  for (const dir of candidateDirs) {
    const candidatePath = path.resolve(dir, '.env');
    if (fs.existsSync(candidatePath)) {
      dotenv.config({ path: candidatePath });
      return candidatePath;
    }
  }

  // Fallback: standard dotenv default
  dotenv.config();
  return path.resolve(process.cwd(), '.env');
}

export const loadedEnvPath = findAndLoadRootEnv();

function cleanEnvVal(val?: string): string | undefined {
  if (!val) return undefined;
  const trimmed = val.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export interface AppConfig {
  port: number;
  nodeEnv: string;
  corsOrigins: string[];

  // Supabase
  supabaseUrl?: string;
  supabasePublishableKey?: string;

  // Upstash Redis
  upstashRedisRestUrl?: string;
  upstashRedisRestToken?: string;

  // SMTP Email Transport
  smtpHost?: string;
  smtpPort: number;
  smtpUser?: string;
  smtpPassword?: string;
  smtpFrom?: string;

  // Existing Gmail Mailer (Google OAuth & Gmail API)
  googleClientId?: string;
  googleClientSecret?: string;
  googleRedirectUri?: string;
  gmailUser?: string;
  gmailRefreshToken?: string;

  // Dedicated Google Login OAuth Client (User Authentication)
  googleAuthClientId?: string;
  googleAuthClientSecret?: string;
  googleAuthRedirectUri?: string;

  // Public Branding
  publicLogoUrl?: string;

  // TMDB
  tmdbApiKey?: string;
  tmdbReadAccessToken?: string;

  // MyAnimeList (Official v2)
  malClientId?: string;
  malClientSecret?: string;
}

/**
 * Safely parses and normalizes CORS origins.
 * Ensures the primary production frontend domain is always allowed,
 * normalizes trailing slashes, and validates protocol.
 */
export function parseCorsOrigins(rawEnv?: string): string[] {
  const allowed = new Set<string>();

  // Always permit the primary production frontend domain
  allowed.add('https://7anime-new.vercel.app');

  if (rawEnv && rawEnv.trim()) {
    const rawList = rawEnv.split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
    for (const item of rawList) {
      try {
        const parsed = new URL(item);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          allowed.add(parsed.origin);
        }
      } catch {
        // Ignore unparseable entries
      }
    }
  }

  return Array.from(allowed);
}

export const config: AppConfig = {
  port: parseInt(process.env.PORT || process.env.BACKEND_PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigins: parseCorsOrigins(process.env.CORS_ORIGIN),

  // Supabase
  supabaseUrl: cleanEnvVal(process.env.SUPABASE_URL),
  supabasePublishableKey: cleanEnvVal(process.env.SUPABASE_PUBLISHABLE_KEY),

  // Upstash Redis
  upstashRedisRestUrl: cleanEnvVal(process.env.UPSTASH_REDIS_REST_URL),
  upstashRedisRestToken: cleanEnvVal(process.env.UPSTASH_REDIS_REST_TOKEN),

  // SMTP
  smtpHost: cleanEnvVal(process.env.SMTP_HOST) || 'smtp.gmail.com',
  smtpPort: parseInt(process.env.SMTP_PORT || '465', 10),
  smtpUser: cleanEnvVal(process.env.SMTP_USER),
  smtpPassword: cleanEnvVal(process.env.SMTP_PASSWORD),
  smtpFrom: cleanEnvVal(process.env.SMTP_FROM),

  // Existing Gmail Mailer (Preserved original variables)
  googleClientId: cleanEnvVal(process.env.GOOGLE_CLIENT_ID),
  googleClientSecret: cleanEnvVal(process.env.GOOGLE_CLIENT_SECRET),
  googleRedirectUri: cleanEnvVal(process.env.GOOGLE_REDIRECT_URI),
  gmailUser: cleanEnvVal(process.env.GMAIL_USER),
  gmailRefreshToken: cleanEnvVal(process.env.GMAIL_REFRESH_TOKEN),

  // Dedicated Google Login OAuth Client (Strictly separated, zero fallback to Gmail credentials)
  googleAuthClientId: cleanEnvVal(process.env.GOOGLE_AUTH_CLIENT_ID),
  googleAuthClientSecret: cleanEnvVal(process.env.GOOGLE_AUTH_CLIENT_SECRET),
  googleAuthRedirectUri: cleanEnvVal(process.env.GOOGLE_AUTH_REDIRECT_URI),

  // Public Branding
  publicLogoUrl: cleanEnvVal(process.env.PUBLIC_LOGO_URL) || '/logo.png',

  // TMDB
  tmdbApiKey: cleanEnvVal(process.env.TMDB_API_KEY),
  tmdbReadAccessToken: cleanEnvVal(process.env.TMDB_READ_ACCESS_TOKEN),

  // MAL
  malClientId: cleanEnvVal(process.env.MAL_CLIENT_ID),
  malClientSecret: cleanEnvVal(process.env.MAL_CLIENT_SECRET) || cleanEnvVal(process.env.Client_Secret),
};

/**
 * Validates environment readiness without throwing fatal errors for optional integrations.
 * Distinguishes core vs optional capabilities.
 */
export function validateEnvironment(): { ready: boolean; warnings: string[]; missingRequired: string[] } {
  const warnings: string[] = [];
  const missingRequired: string[] = [];

  // Core metadata check
  if (!config.tmdbApiKey && !config.tmdbReadAccessToken) {
    warnings.push('TMDB credentials missing: artwork and backdrop resolution will use AniList fallbacks.');
  }

  // Upstash check
  if (!config.upstashRedisRestUrl || !config.upstashRedisRestToken) {
    warnings.push('Upstash Redis credentials missing: operating with local in-memory LRU cache.');
  }

  // Supabase check
  if (!config.supabaseUrl || !config.supabasePublishableKey) {
    warnings.push('Supabase credentials missing: user profiles and watchlists will use memory sessions.');
  }

  // SMTP check
  if (!config.smtpUser || !config.smtpPassword) {
    warnings.push('SMTP credentials missing: transactional emails and OTP dispatch disabled.');
  }

  // Google Login check (Dedicated client)
  if (!config.googleAuthClientId || !config.googleAuthClientSecret) {
    warnings.push('Google Login credentials missing (GOOGLE_AUTH_CLIENT_ID / GOOGLE_AUTH_CLIENT_SECRET): Google authentication disabled.');
  }

  // Gmail Mailer check (Preserved client)
  if (!config.googleClientId || !config.googleClientSecret) {
    warnings.push('Gmail Mailer OAuth credentials missing (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET): Gmail API transport disabled.');
  }

  return {
    ready: missingRequired.length === 0,
    warnings,
    missingRequired,
  };
}

/**
 * Returns safe environment diagnostic status without revealing any secret values.
 */
export function getSanitizedConfigStatus() {
  return {
    port: config.port,
    nodeEnv: config.nodeEnv,
    corsOrigins: config.corsOrigins,
    envFileLoaded: Boolean(loadedEnvPath && fs.existsSync(loadedEnvPath)),
    integrations: {
      supabase: {
        configured: Boolean(config.supabaseUrl && config.supabasePublishableKey),
        urlHost: config.supabaseUrl ? (() => { try { return new URL(config.supabaseUrl).host; } catch { return 'invalid'; } })() : null,
        hasPublishableKey: Boolean(config.supabasePublishableKey),
      },
      upstashRedis: {
        configured: Boolean(config.upstashRedisRestUrl && config.upstashRedisRestToken),
        urlHost: config.upstashRedisRestUrl ? (() => { try { return new URL(config.upstashRedisRestUrl).host; } catch { return 'invalid'; } })() : null,
      },
      smtp: {
        configured: Boolean(config.smtpHost && config.smtpUser && config.smtpPassword),
        host: config.smtpHost,
        port: config.smtpPort,
        fromConfigured: Boolean(config.smtpFrom),
      },
      googleLogin: {
        configured: Boolean(config.googleAuthClientId && config.googleAuthClientSecret),
        hasRedirectUri: Boolean(config.googleAuthRedirectUri),
      },
      gmailMailer: {
        configured: Boolean(config.gmailUser && config.gmailRefreshToken),
        oauthClientConfigured: Boolean(config.googleClientId && config.googleClientSecret),
        hasRedirectUri: Boolean(config.googleRedirectUri),
      },
      // Backward-compatibility aliases
      googleOAuth: {
        configured: Boolean(config.googleAuthClientId && config.googleAuthClientSecret),
        hasRedirectUri: Boolean(config.googleAuthRedirectUri),
      },
      gmailOAuth: {
        configured: Boolean(config.gmailUser && config.gmailRefreshToken),
      },
      branding: {
        publicLogoUrl: config.publicLogoUrl,
      },
      tmdb: {
        hasApiKey: Boolean(config.tmdbApiKey && config.tmdbApiKey.length > 5),
        hasReadAccessToken: Boolean(config.tmdbReadAccessToken && config.tmdbReadAccessToken.length > 20),
      },
      anilist: {
        configured: true, // Public GraphQL API
      },
      mal: {
        configured: Boolean(config.malClientId && config.malClientId.length > 5),
      },
    },
  };
}
