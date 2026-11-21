import express from 'express';
import cors from 'cors';
import { config, getSanitizedConfigStatus, loadedEnvPath, validateEnvironment } from './config/env.js';
import { supabaseService } from './services/supabase/supabase.service.js';
import { healthRouter } from './routes/health.route.js';
import { animeRouter } from './routes/anime.route.js';
import { authRouter } from './routes/auth.route.js';

const app = express();

// Security: Disable X-Powered-By banner
app.disable('x-powered-by');

// Enable trust proxy for correct client IP & protocol detection behind Render / Cloudflare
app.set('trust proxy', 1);

// Security Headers Middleware (OWASP recommended baseline)
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. mobile apps, curl, server-to-server, health checks)
    if (!origin) {
      return callback(null, true);
    }

    // Localhost origins are permitted ONLY during local development (NODE_ENV === 'development')
    const isDevOrigin =
      config.nodeEnv === 'development' && (
        origin.startsWith('http://localhost:') ||
        origin.startsWith('http://127.0.0.1:')
      );

    // In production, permit only configured production origins (e.g. https://7anime-new.vercel.app, CORS_ORIGIN)
    const isAllowed = isDevOrigin || config.corsOrigins.includes(origin);

    if (isAllowed) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  optionsSuccessStatus: 200,
};

// Configurable CORS with local development support
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json({ limit: '1mb' }));

// Lightweight root health check for Render web service monitors
app.use('/health', healthRouter);

// API Routes
app.use('/api', healthRouter);
app.use('/api/anime', animeRouter);
app.use('/api/auth', authRouter);

// Root informative gateway descriptor
app.get('/', (_req, res) => {
  res.json({
    name: '7Anime Backend API Gateway',
    version: '1.0.0',
    status: 'online',
    endpoints: {
      health: '/health',
      apiHealth: '/api/health',
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

// Explicit binding to 0.0.0.0 on Render dynamic PORT
const PORT = config.port;
const HOST = '0.0.0.0';

const server = app.listen(PORT, HOST, () => {
  const status = getSanitizedConfigStatus();
  const validation = validateEnvironment();

  console.log(`[7Anime Backend] Server listening on http://${HOST}:${PORT}`);
  console.log(`[7Anime Backend] Environment: ${status.nodeEnv} (loaded: ${loadedEnvPath})`);
  console.log(`[7Anime Backend] Integrations summary:`, {
    supabase: supabaseService.isReady(),
    upstashRedis: status.integrations.upstashRedis.configured,
    smtp: status.integrations.smtp.configured,
    googleLogin: status.integrations.googleLogin.configured,
    gmailMailer: status.integrations.gmailMailer.oauthClientConfigured,
    tmdb: status.integrations.tmdb.hasReadAccessToken || status.integrations.tmdb.hasApiKey,
    anilist: status.integrations.anilist.configured,
    mal: status.integrations.mal.configured,
  });

  if (validation.warnings.length > 0) {
    validation.warnings.forEach((warn) => console.log(`[7Anime Backend Warning] ${warn}`));
  }
});

// Graceful shutdown handling for Render zero-downtime deploys
const gracefulShutdown = (signal: string) => {
  console.log(`[7Anime Backend] Received ${signal}. Starting graceful shutdown...`);
  server.close(() => {
    console.log('[7Anime Backend] HTTP server closed cleanly. Exiting process.');
    process.exit(0);
  });

  // Force close after 10s timeout
  setTimeout(() => {
    console.error('[7Anime Backend] Forceful shutdown after 10s timeout.');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export { app, server };
