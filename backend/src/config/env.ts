import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from backend root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export interface AppConfig {
  port: number;
  nodeEnv: string;
  corsOrigins: string[];
  tmdbApiKey?: string;
  tmdbReadAccessToken?: string;
  upstashRedisRestUrl?: string;
  upstashRedisRestToken?: string;
}

export const config: AppConfig = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:4173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  tmdbApiKey: process.env.TMDB_API_KEY,
  tmdbReadAccessToken: process.env.TMDB_READ_ACCESS_TOKEN,
  upstashRedisRestUrl: process.env.UPSTASH_REDIS_REST_URL,
  upstashRedisRestToken: process.env.UPSTASH_REDIS_REST_TOKEN,
};

/**
 * Returns safe environment diagnostic status without revealing secret values.
 */
export function getSanitizedConfigStatus() {
  return {
    port: config.port,
    nodeEnv: config.nodeEnv,
    corsOrigins: config.corsOrigins,
    providersConfigured: {
      tmdbApiKey: Boolean(config.tmdbApiKey && config.tmdbApiKey.length > 5),
      tmdbReadAccessToken: Boolean(config.tmdbReadAccessToken && config.tmdbReadAccessToken.length > 20),
      upstashRedis: Boolean(config.upstashRedisRestUrl && config.upstashRedisRestToken),
      anilist: true, // Public GraphQL API
    },
  };
}
