import { createHmac, timingSafeEqual } from 'node:crypto';

export type CheckInQrPayload = {
  sid: string;
  tok: string;
  g: string;
  m: string;
  exp: number;
};

export function signCheckInQr(
  payload: CheckInQrPayload,
  secret: string,
): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `FCQR1.${body}.${sig}`;
}

export function verifyCheckInQr(
  qr: string,
  secret: string,
): CheckInQrPayload {
  const parts = qr.trim().split('.');
  if (parts.length !== 3 || parts[0] !== 'FCQR1') {
    throw new Error('Invalid check-in QR');
  }
  const body = parts[1]!;
  const sig = parts[2]!;
  const expected = createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error('QR signature mismatch');
  }
  const payload = JSON.parse(
    Buffer.from(body, 'base64url').toString('utf8'),
  ) as CheckInQrPayload;
  if (payload.exp < Date.now()) throw new Error('QR expired');
  return payload;
}