export const Role = {
  GYM_ADMIN: 'GYM_ADMIN',
  MEMBER: 'MEMBER',
  TRAINER: 'TRAINER',
} as const;

export type RoleValue = (typeof Role)[keyof typeof Role];

export type AuthUserPayload = {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  roles: {
    gymId: string;
    gymSlug: string;
    gymName: string;
    role: string;
  }[];
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export type AuthSession = { user: AuthUserPayload } & AuthTokens;