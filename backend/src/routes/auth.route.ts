import { Router } from 'express';
import {
  getAuthStatus,
  getClientAuthConfig,
  initiateGoogleOAuth,
  getGoogleOAuthUrl,
  handleGoogleOAuthCallback,
  exchangeAuthTicket,
  refreshSession,
  logout,
  getMe,
  updateProfile,
  getWatchlist,
  updateWatchlist,
  sendPasswordReset,
} from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

export const authRouter = Router();

// Public auth status & client config
authRouter.get('/status', getAuthStatus);
authRouter.get('/config', getClientAuthConfig);
authRouter.get('/google', initiateGoogleOAuth);
authRouter.get('/google/url', getGoogleOAuthUrl);
authRouter.get('/google/callback', handleGoogleOAuthCallback);
authRouter.post('/session/exchange', exchangeAuthTicket);
authRouter.post('/session/refresh', refreshSession);
authRouter.post('/logout', logout);
authRouter.post('/password-reset', sendPasswordReset);

// Protected routes (requires valid Supabase JWT)
authRouter.get('/me', requireAuth, getMe);
authRouter.post('/profile', requireAuth, updateProfile);
authRouter.get('/watchlist', requireAuth, getWatchlist);
authRouter.post('/watchlist', requireAuth, updateWatchlist);
