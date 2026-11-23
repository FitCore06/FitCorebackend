import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { requestContext } from './request-context.js';

export function requestContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const requestId =
    (req.headers['x-request-id'] as string | undefined)?.trim() || randomUUID();
  res.setHeader('X-Request-Id', requestId);

  const ip =
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
    req.socket.remoteAddress;

  requestContext.run(
    {
      requestId,
      ip,
      path: req.originalUrl,
    },
    () => next(),
  );
}