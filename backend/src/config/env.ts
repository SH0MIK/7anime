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

  // Google OAuth
  googleClientId?: string;
  googleClientSecret?: string;
  googleRedirectUri?: string;

  // Gmail API / Refresh Token (Separate from SMTP)
  gmailUser?: string;
  gmailRefreshToken?: string;

  // Public Branding
  publicLogoUrl?: string;

  // TMDB
  tmdbApiKey?: string;
  tmdbReadAccessToken?: string;

  // MyAnimeList (Official v2)
  malClientId?: string;
  malClientSecret?: string;
}

export const config: AppConfig = {
  port: parseInt(process.env.PORT || process.env.BACKEND_PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:4173,http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

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

  // Google OAuth
  googleClientId: cleanEnvVal(process.env.GOOGLE_CLIENT_ID),
  googleClientSecret: cleanEnvVal(process.env.GOOGLE_CLIENT_SECRET),
  googleRedirectUri: cleanEnvVal(process.env.GOOGLE_REDIRECT_URI),

  // Gmail OAuth Refresh Token
  gmailUser: cleanEnvVal(process.env.GMAIL_USER),
  gmailRefreshToken: cleanEnvVal(process.env.GMAIL_REFRESH_TOKEN),

  // Public Branding
  publicLogoUrl: cleanEnvVal(process.env.PUBLIC_LOGO_URL) || 'https://7anime-tv.vercel.app/logo.png',

  // TMDB
  tmdbApiKey: cleanEnvVal(process.env.TMDB_API_KEY),
  tmdbReadAccessToken: cleanEnvVal(process.env.TMDB_READ_ACCESS_TOKEN),

  // MAL
  malClientId: cleanEnvVal(process.env.MAL_CLIENT_ID),
  malClientSecret: cleanEnvVal(process.env.MAL_CLIENT_SECRET),
};

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
      googleOAuth: {
        configured: Boolean(config.googleClientId && config.googleClientSecret),
        hasRedirectUri: Boolean(config.googleRedirectUri),
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
