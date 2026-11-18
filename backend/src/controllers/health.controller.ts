import { Request, Response } from 'express';
import { getSanitizedConfigStatus } from '../config/env.js';

export function getHealth(req: Request, res: Response) {
  const uptime = process.uptime();
  const memory = process.memoryUsage();

  return res.json({
    status: 'ok',
    service: '7anime-backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(uptime),
    memoryUsageMb: Math.round(memory.heapUsed / 1024 / 1024),
    environment: getSanitizedConfigStatus(),
  });
}
