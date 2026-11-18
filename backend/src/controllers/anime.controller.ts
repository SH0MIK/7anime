import { Request, Response } from 'express';
import { config } from '../config/env.js';
import { AniListProvider } from '../services/metadata/providers/anilist.provider.js';
import { AnimeResolverService } from '../services/metadata/resolver/anime-resolver.service.js';
import { ExternalIdResolverService } from '../services/metadata/resolver/external-id-resolver.service.js';
import { LogoResolverService } from '../services/metadata/resolver/logo-resolver.service.js';
import { EpisodeResolverService } from '../services/metadata/resolver/episode-resolver.service.js';
import { anilistBreaker, malBreaker, tmdbBreaker } from '../services/metadata/resolver/circuit-breaker.service.js';
import { redisCache } from '../services/cache/redis-cache.service.js';
import { AnimeSearchResult } from '@7anime/shared';

export class AnimeController {
  /**
   * GET /api/anime/search?q=&page=&limit=
   */
  public static async search(req: Request, res: Response): Promise<void> {
    try {
      const query = (req.query.q as string || '').trim();
      const page = parseInt(req.query.page as string || '1', 10);
      const limit = Math.min(parseInt(req.query.limit as string || '20', 10), 50);

      if (!query) {
        res.status(400).json({
          success: false,
          error: 'Search query parameter "q" is required.',
        });
        return;
      }

      const anilistResponse = await AniListProvider.searchAnime(query, page, limit);

      // Resolve each media item
      const resolvedItems = await Promise.all(
        anilistResponse.media.map((media) => AnimeResolverService.resolveMedia(media))
      );

      const result: AnimeSearchResult = {
        items: resolvedItems,
        total: anilistResponse.pageInfo.total,
        page: anilistResponse.pageInfo.currentPage,
        hasMore: anilistResponse.pageInfo.hasNextPage,
      };

      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      console.error('[AnimeController.search] Error:', err);
      res.status(500).json({
        success: false,
        error: 'Failed to search anime.',
      });
    }
  }

  /**
   * GET /api/anime/trending?page=&limit=
   */
  public static async getTrending(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string || '1', 10);
      const limit = Math.min(parseInt(req.query.limit as string || '10', 10), 30);

      const mediaList = await AniListProvider.getTrendingAnime(page, limit);
      const resolvedItems = await Promise.all(
        mediaList.map((media) => AnimeResolverService.resolveMedia(media))
      );

      res.json({
        success: true,
        data: resolvedItems,
      });
    } catch (err) {
      console.error('[AnimeController.getTrending] Error:', err);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch trending anime.',
      });
    }
  }

  /**
   * GET /api/anime/recent-airing?page=&limit=
   * Returns real recently aired episodes directly from AniList schedule.
   */
  public static async getRecentAiring(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string || '1', 10);
      const limit = Math.min(parseInt(req.query.limit as string || '12', 10), 24);

      const recentEpisodes = await AniListProvider.getRecentAiringEpisodes(page, limit);

      res.json({
        success: true,
        data: recentEpisodes,
      });
    } catch (err) {
      console.error('[AnimeController.getRecentAiring] Error:', err);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch recent airing episodes.',
      });
    }
  }

  /**
   * GET /api/anime/logos?ids=21,1735,21175
   * Resolves genuine TMDB transparent logos for a batch of AniList anime IDs.
   */
  public static async getBatchLogos(req: Request, res: Response): Promise<void> {
    try {
      const rawIds = req.query.ids;
      if (!rawIds || (typeof rawIds !== 'string' && !Array.isArray(rawIds))) {
        res.status(400).json({
          success: false,
          error: 'Missing query parameter "ids". Provide comma-separated positive integer AniList IDs.',
        });
        return;
      }

      const idStrings = (Array.isArray(rawIds) ? rawIds.join(',') : String(rawIds))
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const numericIds = idStrings.map(Number).filter((n) => Number.isInteger(n) && n > 0);

      if (numericIds.length === 0) {
        res.status(400).json({
          success: false,
          error: 'All IDs must be positive integers.',
        });
        return;
      }

      const MAX_BATCH = 30;
      const idsToResolve = numericIds.slice(0, MAX_BATCH);

      const results = await LogoResolverService.resolveBatchLogos(idsToResolve);

      res.json({
        success: true,
        data: results,
      });
    } catch (err) {
      console.error('[AnimeController.getBatchLogos] Error:', err);
      res.status(500).json({
        success: false,
        error: 'Failed to resolve batch anime logos.',
      });
    }
  }

  /**
   * GET /api/anime/:anilistId/external-ids
   * Resolves AniList ID, MAL ID, TMDB ID, IMDb ID, and OMDb ID.
   */
  public static async getExternalIds(req: Request, res: Response): Promise<void> {
    try {
      const idParam = Array.isArray(req.params.anilistId) ? req.params.anilistId[0] : req.params.anilistId;
      const anilistId = parseInt(idParam || '', 10);
      if (isNaN(anilistId) || anilistId <= 0) {
        res.status(400).json({
          success: false,
          error: 'Invalid anime ID parameter.',
        });
        return;
      }

      const extIds = await ExternalIdResolverService.resolve(anilistId);
      if (!extIds) {
        res.status(404).json({
          success: false,
          error: `External IDs for anime ID ${anilistId} could not be resolved.`,
        });
        return;
      }

      res.json({
        success: true,
        data: extIds,
      });
    } catch (err) {
      console.error(`[AnimeController.getExternalIds] Error for ID ${req.params.anilistId}:`, err);
      res.status(500).json({
        success: false,
        error: 'Failed to resolve anime external IDs.',
      });
    }
  }

  /**
   * GET /api/anime/:anilistId/logo
   * Resolves genuine TMDB transparent PNG logo for a single anime.
   */
  public static async getLogo(req: Request, res: Response): Promise<void> {
    try {
      const idParam = Array.isArray(req.params.anilistId) ? req.params.anilistId[0] : req.params.anilistId;
      const anilistId = parseInt(idParam || '', 10);
      if (isNaN(anilistId) || anilistId <= 0) {
        res.status(400).json({
          success: false,
          error: 'Invalid anime ID parameter.',
        });
        return;
      }

      const logo = await LogoResolverService.resolveLogo(anilistId);
      if (!logo) {
        res.status(404).json({
          success: false,
          error: `Transparent TMDB logo for anime ID ${anilistId} was not found.`,
          data: null,
        });
        return;
      }

      res.json({
        success: true,
        data: logo,
      });
    } catch (err) {
      console.error(`[AnimeController.getLogo] Error for ID ${req.params.anilistId}:`, err);
      res.status(500).json({
        success: false,
        error: 'Failed to resolve anime logo.',
      });
    }
  }

  /**
   * GET /api/anime/:anilistId/artwork
   */
  public static async getArtwork(req: Request, res: Response): Promise<void> {
    try {
      const idParam = Array.isArray(req.params.anilistId) ? req.params.anilistId[0] : req.params.anilistId;
      const anilistId = parseInt(idParam || '', 10);
      if (isNaN(anilistId) || anilistId <= 0) {
        res.status(400).json({
          success: false,
          error: 'Invalid anime ID parameter.',
        });
        return;
      }

      const artwork = await AnimeResolverService.resolveArtwork(anilistId);
      if (!artwork) {
        res.status(404).json({
          success: false,
          error: `Artwork for anime ID ${anilistId} was not found.`,
        });
        return;
      }

      res.json({
        success: true,
        data: artwork,
      });
    } catch (err) {
      console.error(`[AnimeController.getArtwork] Error for ID ${req.params.anilistId}:`, err);
      res.status(500).json({
        success: false,
        error: 'Failed to resolve anime artwork.',
      });
    }
  }

  /**
   * GET /api/anime/:anilistId/episodes
   * Retrieves verified episode catalogue without fabricated cards or fake filler tags.
   */
  public static async getEpisodes(req: Request, res: Response): Promise<void> {
    try {
      const idParam = Array.isArray(req.params.anilistId) ? req.params.anilistId[0] : req.params.anilistId;
      const anilistId = parseInt(idParam || '', 10);
      if (isNaN(anilistId) || anilistId <= 0) {
        res.status(400).json({
          success: false,
          error: 'Invalid anime ID parameter.',
        });
        return;
      }

      const catalogue = await EpisodeResolverService.resolveEpisodes(anilistId);
      if (!catalogue) {
        res.status(404).json({
          success: false,
          error: `Episode catalogue for anime ID ${anilistId} could not be resolved.`,
        });
        return;
      }

      res.json({
        success: true,
        data: catalogue,
      });
    } catch (err) {
      console.error(`[AnimeController.getEpisodes] Error for ID ${req.params.anilistId}:`, err);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve episode catalogue.',
      });
    }
  }

  /**
   * GET /api/anime/providers/status
   * Returns live health and circuit breaker status for all metadata providers and cache.
   */
  public static async getProviderStatus(_req: Request, res: Response): Promise<void> {
    try {
      const redisHealth = await redisCache.getHealth();
      res.json({
        success: true,
        data: {
          cache: redisHealth,
          providers: {
            anilist: {
              name: 'AniList GraphQL',
              endpoint: 'https://graphql.anilist.co',
              configured: true,
              circuitBreaker: anilistBreaker.getStatus(),
            },
            mal: {
              name: 'MyAnimeList API v2 (Official)',
              endpoint: 'https://api.myanimelist.net/v2',
              configured: Boolean(config.malClientId),
              circuitBreaker: malBreaker.getStatus(),
            },
            tmdb: {
              name: 'The Movie Database (TMDB)',
              endpoint: 'https://api.themoviedb.org/3',
              configured: Boolean(config.tmdbApiKey || config.tmdbReadAccessToken),
              circuitBreaker: tmdbBreaker.getStatus(),
            },
          },
          circuitBreakers: {
            anilist: anilistBreaker.getStatus(),
            mal: malBreaker.getStatus(),
            tmdb: tmdbBreaker.getStatus(),
          },
        },
      });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Failed to retrieve provider status.' });
    }
  }

  /**
   * GET /api/anime/:anilistId
   */
  public static async getById(req: Request, res: Response): Promise<void> {
    try {
      const idParam = Array.isArray(req.params.anilistId) ? req.params.anilistId[0] : req.params.anilistId;
      const anilistId = parseInt(idParam || '', 10);
      if (isNaN(anilistId) || anilistId <= 0) {
        res.status(400).json({
          success: false,
          error: 'Invalid anime ID parameter.',
        });
        return;
      }

      const resolved = await AnimeResolverService.resolveById(anilistId);
      if (!resolved) {
        res.status(404).json({
          success: false,
          error: `Anime with AniList ID ${anilistId} was not found.`,
        });
        return;
      }

      res.json({
        success: true,
        data: resolved,
      });
    } catch (err) {
      console.error(`[AnimeController.getById] Error:`, err);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve anime details.',
      });
    }
  }
}
