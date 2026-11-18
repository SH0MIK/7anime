import { Router } from 'express';
import { AnimeController } from '../controllers/anime.controller.js';

export const animeRouter = Router();

// Search anime catalog
animeRouter.get('/search', AnimeController.search);

// Trending anime
animeRouter.get('/trending', AnimeController.getTrending);

// Batch logo resolution (e.g. for homepage spotlight or collections)
animeRouter.get('/logos', AnimeController.getBatchLogos);

// Single anime external IDs (AniList, MAL, TMDB, IMDb, OMDb)
animeRouter.get('/:anilistId/external-ids', AnimeController.getExternalIds);

// Single anime genuine transparent TMDB logo
animeRouter.get('/:anilistId/logo', AnimeController.getLogo);

// Single anime artwork breakdown
animeRouter.get('/:anilistId/artwork', AnimeController.getArtwork);

// Single anime full resolved details
animeRouter.get('/:anilistId', AnimeController.getById);
