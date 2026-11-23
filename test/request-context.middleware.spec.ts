import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { getRequestContext } from '../src/common/security/request-context.js';
import { requestContextMiddleware } from '../src/common/security/request-context.middleware.js';

function mockReqRes() {
  const req = {
    headers: {},
    originalUrl: '/api/v1/health',
    socket: { remoteAddress: '127.0.0.1' },
  } as Request;
  const res = {
    setHeader: vi.fn(),
  } as unknown as Response;
  return { req, res };
}

describe('requestContextMiddleware', () => {
  it('preserves ALS through async next()', async () => {
    const { req, res } = mockReqRes();
    let capturedRequestId: string | undefined;

    const next: NextFunction = () =>
      new Promise<void>((resolve) => {
        setImmediate(() => {
          capturedRequestId = getRequestContext()?.requestId;
          resolve();
        });
      });

    const result = requestContextMiddleware(req, res, next);
    await Promise.resolve(result);

    expect(capturedRequestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', capturedRequestId);
  });

  it('rejects when next() throws synchronously', async () => {
    const { req, res } = mockReqRes();
    const boom = new Error('sync');
    const next = vi.fn(() => {
      throw boom;
    }) as unknown as NextFunction;

    const result = requestContextMiddleware(req, res, next);
    await expect(Promise.resolve(result)).rejects.toBe(boom);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('forwards rejected async next() to the returned promise', async () => {
    const { req, res } = mockReqRes();
    const boom = new Error('downstream');

    const next: NextFunction = () => Promise.reject(boom);

    const result = requestContextMiddleware(req, res, next);
    await expect(Promise.resolve(result)).rejects.toBe(boom);
  });
});