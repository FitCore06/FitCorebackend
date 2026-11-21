import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MEMBERSHIP_EXPIRY_CHANNELS,
  parseMembershipExpiryChannels,
} from '../src/automation/membership-expiry-channels.js';

describe('parseMembershipExpiryChannels', () => {
  it('defaults to in_app only', () => {
    expect(parseMembershipExpiryChannels(undefined)).toEqual([
      ...DEFAULT_MEMBERSHIP_EXPIRY_CHANNELS,
    ]);
  });

  it('ignores unknown tokens (legacy whatsapp, email, etc.)', () => {
    expect(parseMembershipExpiryChannels('whatsapp,telegram')).toEqual(['in_app']);
    expect(parseMembershipExpiryChannels('email,in_app')).toEqual(['in_app']);
    expect(parseMembershipExpiryChannels('in_app')).toEqual(['in_app']);
  });
});