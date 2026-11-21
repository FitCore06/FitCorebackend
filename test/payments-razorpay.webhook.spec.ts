import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PaymentsService } from '../src/payments/payments.service.js';

describe('PaymentsService Razorpay webhook signature', () => {
  const service = new PaymentsService({} as never, { get: () => undefined } as never);

  it('verifies valid signature', () => {
    const body = '{"event":"payment.captured"}';
    const secret = 'whsec_test';
    const sig = createHmac('sha256', secret).update(body).digest('hex');
    expect(service.verifyRazorpayWebhookSignature(body, sig, secret)).toBe(true);
  });

  it('rejects tampered body', () => {
    const body = '{"event":"payment.captured"}';
    const secret = 'whsec_test';
    const sig = createHmac('sha256', secret).update(body).digest('hex');
    expect(
      service.verifyRazorpayWebhookSignature(body + ' ', sig, secret),
    ).toBe(false);
  });
});