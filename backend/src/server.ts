import express from 'express';
import cors from 'cors';
import { config, getSanitizedConfigStatus, loadedEnvPath } from './config/env.js';
import { healthRouter } from './routes/health.route.js';
import { animeRouter } from './routes/anime.route.js';
import { authRouter } from './routes/auth.route.js';

const app = express();

// Security and CORS
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, or same-origin)
      if (!origin || config.corsOrigins.includes(origin) || origin.startsWith('http://localhost:')) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  })
);

app.use(express.json());

// API Routes
app.use('/api', healthRouter);
app.use('/api/anime', animeRouter);
app.use('/api/auth', authRouter);

// Root informative endpoint
app.get('/', (req, res) => {
  res.json({
    name: '7Anime Backend API Gateway',
    version: '1.0.0',
    status: 'online',
    endpoints: {
      health: '/api/health',
      authStatus: '/api/auth/status',
      authConfig: '/api/auth/config',
      animeSearch: '/api/anime/search?q={query}',
      animeDetails: '/api/anime/{anilistId}',
      animeEpisodes: '/api/anime/{anilistId}/episodes',
      animeArtwork: '/api/anime/{anilistId}/artwork',
      animeLogo: '/api/anime/{anilistId}/logo',
      animeTrending: '/api/anime/trending',
    },
  });
});

// Start listening if not imported as a test module
const PORT = config.port;
const server = app.listen(PORT, () => {
  const status = getSanitizedConfigStatus();
  console.log(`[7Anime Backend] Server listening on http://localhost:${PORT}`);
  console.log(`[7Anime Backend] Environment: ${status.nodeEnv} (loaded: ${loadedEnvPath})`);
  console.log(`[7Anime Backend] Integrations summary:`, {
    supabase: status.integrations.supabase.configured,
    upstashRedis: status.integrations.upstashRedis.configured,
    smtp: status.integrations.smtp.configured,
    googleOAuth: status.integrations.googleOAuth.configured,
    tmdb: status.integrations.tmdb.hasReadAccessToken || status.integrations.tmdb.hasApiKey,
    anilist: status.integrations.anilist.configured,
  });
});

export { app, server };
