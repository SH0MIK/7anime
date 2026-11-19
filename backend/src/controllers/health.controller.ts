import { Request, Response } from 'express';
import { getSanitizedConfigStatus } from '../config/env.js';
import { supabaseService } from '../services/supabase/supabase.service.js';

export function getHealth(req: Request, res: Response) {
  const uptime = process.uptime();
  const memory = process.memoryUsage();
  const envStatus = getSanitizedConfigStatus();

  return res.json({
    status: 'ok',
    service: '7anime-backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(uptime),
    memoryUsageMb: Math.round(memory.heapUsed / 1024 / 1024),
    environment: {
      ...envStatus,
      integrations: {
        ...envStatus.integrations,
        supabase: supabaseService.getStatus(),
      },
    },
  });
}
