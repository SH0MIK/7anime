import { Router } from 'express';
import { getHealth } from '../controllers/health.controller.js';

export const healthRouter = Router();

// Supports both /api/health and standalone /health when mounted
healthRouter.get('/', getHealth);
healthRouter.get('/health', getHealth);
