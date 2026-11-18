import { Request, Response, NextFunction } from 'express';
import { User } from '@supabase/supabase-js';
import { supabaseService } from '../services/supabase/supabase.service.js';

export interface AuthenticatedRequest extends Request {
  user?: User;
}

function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }

  // Also check cookie if provided (e.g., sb-access-token)
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').map(c => c.trim());
    const tokenCookie = cookies.find(c => c.startsWith('sb-access-token=') || c.startsWith('sevenanime_token='));
    if (tokenCookie) {
      return tokenCookie.split('=')[1].trim();
    }
  }

  return null;
}

/**
 * Strict authentication middleware: requires a valid Supabase JWT session.
 */
export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const token = extractBearerToken(req);

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Authentication token missing from Authorization header.',
    });
  }

  const user = await supabaseService.verifyUserToken(token);
  if (!user) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Invalid, revoked or expired session token.',
    });
  }

  req.user = user;
  next();
}

/**
 * Optional authentication middleware: attaches user if token is present, but allows guests.
 */
export async function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const token = extractBearerToken(req);

  if (token) {
    const user = await supabaseService.verifyUserToken(token);
    if (user) {
      req.user = user;
    }
  }

  next();
}
