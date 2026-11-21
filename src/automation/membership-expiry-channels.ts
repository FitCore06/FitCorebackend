export type MembershipExpiryNotifyChannel = 'in_app';

const ALL: MembershipExpiryNotifyChannel[] = ['in_app'];

export const DEFAULT_MEMBERSHIP_EXPIRY_CHANNELS: MembershipExpiryNotifyChannel[] = ['in_app'];

export function parseMembershipExpiryChannels(
  raw: string | undefined | null,
): MembershipExpiryNotifyChannel[] {
  if (!raw?.trim()) return [...DEFAULT_MEMBERSHIP_EXPIRY_CHANNELS];
  const picked = raw
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter((part): part is MembershipExpiryNotifyChannel =>
      ALL.includes(part as MembershipExpiryNotifyChannel),
    );
  return picked.length ? [...new Set(picked)] : [...DEFAULT_MEMBERSHIP_EXPIRY_CHANNELS];
}