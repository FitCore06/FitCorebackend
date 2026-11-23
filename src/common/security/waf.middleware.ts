import type { NextFunction, Request, Response } from 'express';
import type { SecurityEventsService } from './security-events.service.js';

const SUSPICIOUS_PATH = /(\.\.|%2e%2e|%00|<script|javascript:|union\s+select)/i;
const BLOCKED_PATH_PREFIX = /^\/(\.env|\.git|wp-admin|wp-login|phpmyadmin)/i;

export function createWafMiddleware(events: SecurityEventsService) {
  return (req: Request, res: Response, next: NextFunction) => {
    const path = `${req.url ?? ''}`;
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
      req.socket.remoteAddress;

    if (BLOCKED_PATH_PREFIX.test(path) || SUSPICIOUS_PATH.test(path)) {
      events.record('waf_block', { ip, path, detail: 'blocked_path' });
      res.status(403).json({ statusCode: 403, message: 'Forbidden' });
      return;
    }

  if (req.method === 'TRACE' || req.method === 'TRACK') {
      events.record('waf_block', { ip, path, detail: 'blocked_method' });
      res.status(405).json({ statusCode: 405, message: 'Method Not Allowed' });
      return;
    }

    next();
  };
}