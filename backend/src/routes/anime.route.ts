import { Router } from 'express';
import { AnimeController } from '../controllers/anime.controller.js';

export const animeRouter = Router();

// Provider & Circuit Breaker Health Status
animeRouter.get('/providers/status', AnimeController.getProviderStatus);

// Real Recently Aired Episodes
animeRouter.get('/recent-airing', AnimeController.getRecentAiring);

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
