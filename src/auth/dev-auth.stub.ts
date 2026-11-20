import { randomBytes, createHash } from 'node:crypto';
import type { AuthTokens, AuthUserPayload } from './auth.types.js';

const GYM_ID = 'dev-gym-id';
const GYM_SLUG = 'demo-gym';
const GYM_NAME = 'Demo Fitness Club';

const users: Record<
  string,
  { password: string; name: string; phone?: string; role: string }
> = {
  'owner@gym.test': {
    password: 'FitCore@123',
    name: 'Demo Gym Owner',
    phone: '+919900000001',
    role: 'GYM_ADMIN',
  },
  'member@gym.test': {
    password: 'FitCore@123',
    name: 'Demo Member',
    phone: '+919900000002',
    role: 'MEMBER',
  },
  'newmember@gym.test': {
    password: 'FitCore@123',
    name: 'New Member',
    phone: '+919900000003',
    role: 'MEMBER',
  },
  'trainer@gym.test': {
    password: 'FitCore@123',
    name: 'Demo Trainer',
    phone: '+919900000004',
    role: 'TRAINER',
  },
};

const refreshStore = new Map<string, string>();

export function isDevAuthStubEnabled(): boolean {
  return process.env.DEV_AUTH_STUB === 'true';
}

function userPayload(email: string): AuthUserPayload {
  const u = users[email];
  return {
    id: `dev-${email.split('@')[0]}`,
    email,
    name: u.name,
    phone: u.phone,
    roles: [
      {
        gymId: GYM_ID,
        gymSlug: GYM_SLUG,
        gymName: GYM_NAME,
        role: u.role,
      },
    ],
  };
}

export function devAuthLogin(
  email: string,
  password: string,
): { user: AuthUserPayload; tokens: AuthTokens } {
  const key = email.toLowerCase();
  const account = users[key];
  if (!account || account.password !== password) {
    throw new Error('INVALID');
  }
  const refreshToken = randomBytes(48).toString('base64url');
  refreshStore.set(hash(refreshToken), key);
  return {
    user: userPayload(key),
    tokens: {
      accessToken: '',
      refreshToken,
      expiresIn: 60 * 15,
    },
  };
}

export function devAuthRefresh(refreshToken: string): string | null {
  return refreshStore.get(hash(refreshToken)) ?? null;
}

export function devAuthRotateRefresh(refreshToken: string): {
  user: AuthUserPayload;
  refreshToken: string;
} | null {
  const email = refreshStore.get(hash(refreshToken));
  if (!email) return null;
  refreshStore.delete(hash(refreshToken));
  const next = randomBytes(48).toString('base64url');
  refreshStore.set(hash(next), email);
  return { user: userPayload(email), refreshToken: next };
}

export function devAuthRevoke(refreshToken: string) {
  refreshStore.delete(hash(refreshToken));
}

export function devAuthUserById(emailKey: string): AuthUserPayload | null {
  if (!users[emailKey]) return null;
  return userPayload(emailKey);
}

/** Maps JWT sub (dev-user id) back to email for stub users */
export function devAuthResolveSub(sub: string): AuthUserPayload | null {
  for (const email of Object.keys(users)) {
    if (`dev-${email.split('@')[0]}` === sub) {
      return userPayload(email);
    }
  }
  return null;
}

function hash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}