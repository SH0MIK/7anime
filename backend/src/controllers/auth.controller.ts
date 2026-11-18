import { Request, Response } from 'express';
import { config } from '../config/env.js';
import { supabaseService } from '../services/supabase/supabase.service.js';
import { mailerService } from '../services/mail/mailer.service.js';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';

/**
 * Returns auth subsystem status (Supabase GoTrue, SMTP, Google OAuth).
 */
export async function getAuthStatus(req: Request, res: Response) {
  const supabaseHealth = await supabaseService.checkHealth();
  const smtpHealth = await mailerService.verifyConnection();

  return res.json({
    success: true,
    data: {
      supabase: supabaseHealth,
      smtp: {
        configured: Boolean(config.smtpHost && config.smtpUser && config.smtpPassword),
        connected: smtpHealth.success,
        host: config.smtpHost,
        port: config.smtpPort,
        error: smtpHealth.error,
      },
      googleOAuth: {
        configured: Boolean(config.googleClientId && config.googleClientSecret),
        redirectUriConfigured: Boolean(config.googleRedirectUri),
      },
      gmailOAuth: {
        configured: Boolean(config.gmailUser && config.gmailRefreshToken),
        note: 'Separate from SMTP transport. Used if Google API consent refresh is active.',
      },
    },
  });
}

/**
 * Returns safe public client authentication configuration for the frontend UI.
 */
export function getClientAuthConfig(req: Request, res: Response) {
  return res.json({
    success: true,
    data: {
      googleOAuthEnabled: Boolean(config.googleClientId),
      supabaseUrl: config.supabaseUrl || null,
      supabasePublishableKey: config.supabasePublishableKey || null,
      publicLogoUrl: config.publicLogoUrl,
    },
  });
}

/**
 * Generates the Google OAuth authorization URL for frontend redirects.
 */
export function getGoogleOAuthUrl(req: Request, res: Response) {
  if (!config.googleClientId) {
    return res.status(503).json({
      success: false,
      error: 'Google OAuth is not configured on this server.',
    });
  }

  const redirectUri = config.googleRedirectUri || `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
  const rootUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
  const options = {
    redirect_uri: redirectUri,
    client_id: config.googleClientId,
    access_type: 'offline',
    response_type: 'code',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
    ].join(' '),
  };

  const qs = new URLSearchParams(options).toString();
  return res.json({
    success: true,
    url: `${rootUrl}?${qs}`,
  });
}

/**
 * Returns the currently authenticated user's profile.
 */
export async function getMe(req: AuthenticatedRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const profile = await supabaseService.getUserProfile(req.user);
  return res.json({
    success: true,
    data: {
      user: {
        id: req.user.id,
        email: req.user.email,
        createdAt: req.user.created_at,
      },
      profile,
    },
  });
}

/**
 * Updates the user's profile.
 */
export async function updateProfile(req: AuthenticatedRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const { username, displayName, avatarUrl, bio } = req.body;
  const result = await supabaseService.upsertUserProfile({
    id: req.user.id,
    email: req.user.email,
    username,
    displayName,
    avatarUrl,
    bio,
  });

  if (!result.success) {
    return res.status(500).json({ success: false, error: result.error });
  }

  return res.json({ success: true, message: 'Profile updated successfully' });
}

/**
 * Gets user watchlist.
 */
export async function getWatchlist(req: AuthenticatedRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const watchlist = await supabaseService.getWatchlist(req.user.id);
  return res.json({ success: true, data: watchlist });
}

/**
 * Adds or updates an item in user watchlist.
 */
export async function updateWatchlist(req: AuthenticatedRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const { animeId, animeTitle, posterUrl, format, status } = req.body;
  if (!animeId || !animeTitle || !status) {
    return res.status(400).json({ success: false, error: 'animeId, animeTitle and status are required' });
  }

  const result = await supabaseService.upsertWatchlistItem({
    userId: req.user.id,
    animeId: Number(animeId),
    animeTitle: String(animeTitle),
    posterUrl: posterUrl ? String(posterUrl) : undefined,
    format: format ? String(format) : undefined,
    status,
  });

  if (!result.success) {
    return res.status(500).json({ success: false, error: result.error });
  }

  return res.json({ success: true, message: 'Watchlist updated' });
}

/**
 * Sends a password reset email using the verified SMTP service.
 */
export async function sendPasswordReset(req: Request, res: Response) {
  const { email, resetCodeOrUrl } = req.body;

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ success: false, error: 'Valid email address is required' });
  }

  const targetCode = resetCodeOrUrl || Math.floor(100000 + Math.random() * 900000).toString();
  const result = await mailerService.sendPasswordResetEmail(email, targetCode);

  if (!result.success) {
    return res.status(500).json({ success: false, error: result.error });
  }

  return res.json({
    success: true,
    message: `Password reset email dispatched to ${email}`,
  });
}
