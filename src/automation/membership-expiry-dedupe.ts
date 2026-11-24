export function expiryDedupeKey(
  membershipId: string,
  endsAt: Date,
  notifyOn: Date,
) {
  const ends = endsAt.toISOString().slice(0, 10);
  const notify = notifyOn.toISOString().slice(0, 10);
  return `membership-expiry-wa:${membershipId}:${ends}:${notify}`;
}

/** Older rows used 3-part keys; gym-ops once used membership-expiry: without -wa. */
export function expiryDedupeKeyVariants(
  membershipId: string,
  endsAt: Date,
  notifyOn: Date,
): string[] {
  const ends = endsAt.toISOString().slice(0, 10);
  const notify = notifyOn.toISOString().slice(0, 10);
  return [
    expiryDedupeKey(membershipId, endsAt, notifyOn),
    `membership-expiry-wa:${membershipId}:${ends}`,
    `membership-expiry:${membershipId}:${ends}:${notify}`,
  ];
}

export function membershipIdFromExpiryDedupe(key: string): string | null {
  const match = /^membership-expiry(?:-wa)?:([^:]+):/.exec(key);
  return match?.[1] ?? null;
}