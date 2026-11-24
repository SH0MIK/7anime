import { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';

export interface HttpCacheOptions {
  /** Browser cache max-age in seconds (default: 1800s = 30m) */
  maxAgeSec?: number;
  /** Shared CDN cache s-maxage in seconds (default: 3600s = 1h) */
  sMaxAgeSec?: number;
  /** Stale-while-revalidate window in seconds (default: 86400s = 24h) */
  staleWhileRevalidateSec?: number;
  /** Whether to compute and evaluate ETags for 304 Not Modified */
  etag?: boolean;
}

/**
 * L4 CDN and HTTP Caching Middleware:
 * - Generates weak ETags and checks client `If-None-Match` header.
 * - Responds with HTTP 304 Not Modified when resource has not changed.
 * - Applies public Cache-Control headers to eligible read-only metadata endpoints.
 * - Strictly isolates authenticated or sensitive endpoints with `private, no-cache, no-store`.
 */
export function httpCacheMiddleware(options: HttpCacheOptions = {}) {
  const maxAge = options.maxAgeSec ?? 1800;
  const sMaxAge = options.sMaxAgeSec ?? 3600;
  const swr = options.staleWhileRevalidateSec ?? 86400;
  const enableEtag = options.etag !== false;

  return (req: Request, res: Response, next: NextFunction): void => {
    // Only apply HTTP caching to GET and HEAD requests
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Cache-Control', 'no-store');
      return next();
    }

    // Never publicly cache authenticated or sensitive requests
    const isAuth = Boolean(req.headers.authorization || req.cookies?.['sb-access-token']);
    if (isAuth || req.path.includes('/auth/')) {
      res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      return next();
    }

    // Set standard public Cache-Control with stale-while-revalidate for CDN & browser
    res.setHeader(
      'Cache-Control',
      `public, max-age=${maxAge}, s-maxage=${sMaxAge}, stale-while-revalidate=${swr}`
    );

    if (!enableEtag) {
      return next();
    }

    // Intercept response to compute ETag and handle 304 Not Modified
    const originalJson = typeof res.json === 'function' ? res.json.bind(res) : null;
    const originalSend = typeof res.send === 'function' ? res.send.bind(res) : null;

    if (originalJson) {
      res.json = (body: any): Response => {
        try {
          const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
          const hash = crypto.createHash('sha1').update(bodyStr).digest('hex').slice(0, 16);
          const etag = `W/"${hash}"`;

          res.setHeader('ETag', etag);

          const clientEtag = req.headers['if-none-match'];
          if (clientEtag && (clientEtag === etag || clientEtag === hash)) {
            return res.status(304).end();
          }
        } catch {
          // Fall back to sending raw response
        }

        return originalJson(body);
      };
    }

    if (originalSend) {
      res.send = (body: any): Response => {
        try {
          if (typeof body === 'string' || Buffer.isBuffer(body)) {
            const hash = crypto.createHash('sha1').update(body).digest('hex').slice(0, 16);
            const etag = `W/"${hash}"`;

            res.setHeader('ETag', etag);

            const clientEtag = req.headers['if-none-match'];
            if (clientEtag && (clientEtag === etag || clientEtag === hash)) {
              return res.status(304).end();
            }
          }
        } catch {}

        return originalSend(body);
      };
    }

    next();
  };
}
