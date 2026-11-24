import { Router } from 'express';
import { AnimeController } from '../controllers/anime.controller.js';
import { httpCacheMiddleware } from '../middleware/httpCache.middleware.js';

export const animeRouter = Router();

// Provider & Circuit Breaker Health Status (Live, non-cached)
animeRouter.get('/providers/status', AnimeController.getProviderStatus);

// Apply L4 CDN / HTTP Cache with ETag support to public metadata routes
animeRouter.use(httpCacheMiddleware({
  maxAgeSec: 1800, // 30 minutes client browser cache
  sMaxAgeSec: 3600, // 1 hour shared edge/CDN cache
  staleWhileRevalidateSec: 86400, // 24 hours SWR window
}));

// Real Recently Aired Episodes
animeRouter.get('/recent-airing', AnimeController.getRecentAiring);

// Weekly Airing Schedule
animeRouter.get('/schedule', AnimeController.getWeeklySchedule);

// Search anime catalog
animeRouter.get('/search', AnimeController.search);

// Trending anime
animeRouter.get('/trending', AnimeController.getTrending);

// Batch logo resolution
animeRouter.get('/logos', AnimeController.getBatchLogos);

// Single anime external IDs (AniList, MAL, TMDB, IMDb, OMDb)
animeRouter.get('/:anilistId/external-ids', AnimeController.getExternalIds);

// Single anime genuine transparent TMDB logo
animeRouter.get('/:anilistId/logo', AnimeController.getLogo);

// Single anime artwork breakdown
animeRouter.get('/:anilistId/artwork', AnimeController.getArtwork);

// Single anime verified real episode catalogue
animeRouter.get('/:anilistId/episodes', AnimeController.getEpisodes);

// Single anime full resolved details
animeRouter.get('/:anilistId', AnimeController.getById);
