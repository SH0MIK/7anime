import path from 'node:path';

// Attempt to load .env file if available in Node 20.6+ / 24+
try {
  if (typeof (process as any).loadEnvFile === 'function') {
    (process as any).loadEnvFile();
  }
} catch {}

const rawClientId = process.env.DISCORD_CLIENT_ID?.trim();

/**
 * Validates that a real, non-placeholder Discord Application ID is provided.
 * Throws a clear configuration error with actionable instructions if missing or malformed.
 */
export function getValidatedDiscordClientId(): string {
  const id = process.env.DISCORD_CLIENT_ID?.trim();
  if (!id) {
    throw new Error(
      `[Configuration Error] DISCORD_CLIENT_ID is not configured.\n` +
      `Please provide a valid Discord Application ID in your environment or .env file:\n` +
      `  DISCORD_CLIENT_ID=your_discord_application_id_here\n` +
      `You can obtain or create an Application ID from the Discord Developer Portal: https://discord.com/developers/applications`
    );
  }
  if (!/^\d{17,21}$/.test(id)) {
    throw new Error(
      `[Configuration Error] DISCORD_CLIENT_ID "${id}" is invalid.\n` +
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

  // Exact configured 7Anime production and development origins — NO WILDCARDS
  EXACT_ALLOWED_ORIGINS: new Set<string>([
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000',
    'https://7anime.to',
    'https://www.7anime.to',
    ...(process.env.ADDITIONAL_ALLOWED_ORIGIN ? [process.env.ADDITIONAL_ALLOWED_ORIGIN.trim().toLowerCase()] : []),
  ]),

  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL || 'https://7anime.to',
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
