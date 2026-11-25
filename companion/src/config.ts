import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const COMPANION_ROOT = path.resolve(CURRENT_DIR, '..');
const MONOREPO_ROOT = path.resolve(COMPANION_ROOT, '..');

/**
 * Loads KEY=VALUE pairs from an env file only for variables not already present in process.env.
 * Priority order: existing process.env > companion/.env > monorepo root .env.
 */
function loadEnvFileFallback(filePath: string): void {
  try {
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, 'utf-8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const cleaned = line.startsWith('export ') ? line.slice(7).trim() : line;
      const eqIdx = cleaned.indexOf('=');
      if (eqIdx <= 0) continue;
      const key = cleaned.slice(0, eqIdx).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
      if (process.env[key] !== undefined && process.env[key] !== '') continue;

      let value = cleaned.slice(eqIdx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
        (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
      ) {
        value = value.slice(1, -1);
      } else {
        const inlineCommentIdx = value.indexOf(' #');
        if (inlineCommentIdx >= 0) {
          value = value.slice(0, inlineCommentIdx).trim();
        }
      }
      process.env[key] = value;
    }
  } catch {
    // Ignore unreadable .env files cleanly; validation will report missing required configuration
  }
}

loadEnvFileFallback(path.join(COMPANION_ROOT, '.env'));
loadEnvFileFallback(path.join(MONOREPO_ROOT, '.env'));

const rawClientId = process.env.DISCORD_CLIENT_ID?.trim();

/**
 * Validates that a real, non-placeholder Discord Application ID is provided.
 * Throws a clear configuration error without leaking secrets or tokens.
 */
export function getValidatedDiscordClientId(): string {
  const id = process.env.DISCORD_CLIENT_ID?.trim();
  if (!id) {
    throw new Error(
      `[Configuration Error] DISCORD_CLIENT_ID is not configured.\n` +
      `Please provide a valid Discord Application ID in companion/.env, root .env, or your shell environment:\n` +
      `  DISCORD_CLIENT_ID=your_discord_application_id_here\n` +
      `You can obtain or manage it in the Discord Developer Portal: https://discord.com/developers/applications`
    );
  }
  if (!/^\d{17,21}$/.test(id)) {
    throw new Error(
      `[Configuration Error] DISCORD_CLIENT_ID is invalid.\n` +
      `Discord Application IDs must be a 17-21 digit numeric Snowflake ID.`
    );
  }
  return id;
}

export const COMPANION_CONFIG = {
  VERSION: '1.0.0',
  DISCORD_CLIENT_ID: rawClientId || '',
  WS_PORT: parseInt(process.env.COMPANION_PORT || '17077', 10),
  WS_HOST: '127.0.0.1',
  MAX_PAYLOAD_BYTES: 65536, // 64 KB

  // Discord Rich Presence rate limits: Discord limits SET_ACTIVITY to 1 per 5 seconds
  DISCORD_MIN_INTERVAL_MS: 5000,
  DISCORD_DEBOUNCE_MS: 800,

  // Reconnection backoff bounds
  RECONNECT_INITIAL_MS: 2000,
  RECONNECT_MAX_MS: 30000,
  MAX_RECONNECT_ATTEMPTS: 8,
  IDLE_PROBE_INTERVAL_MS: 20000,

  // Exact configured 7Anime production and development origins — NO WILDCARDS
  EXACT_ALLOWED_ORIGINS: new Set<string>([
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000',
    'https://7anime-new.vercel.app',
    'https://7anime.to',
    'https://www.7anime.to',
    ...(process.env.ADDITIONAL_ALLOWED_ORIGIN
      ? [process.env.ADDITIONAL_ALLOWED_ORIGIN.trim().toLowerCase()]
      : []),
  ]),

  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL || 'https://7anime-new.vercel.app',
  WEBSITE_URL: 'https://7anime-new.vercel.app',
  DISCORD_INVITE_URL: 'https://discord.gg/TpqgaXjDQC',
};

/**
 * Returns available Discord IPC pipe/socket paths for the current operating system.
 */
export function getDiscordIpcPaths(): string[] {
  const isWindows = process.platform === 'win32';
  const paths: string[] = [];

  for (let i = 0; i < 10; i++) {
    if (isWindows) {
      paths.push(`\\\\?\\pipe\\discord-ipc-${i}`);
    } else {
      const runtimeDir = process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || process.env.TMP || '/tmp';
      paths.push(path.join(runtimeDir, `discord-ipc-${i}`));
    }
  }

  return paths;
}
