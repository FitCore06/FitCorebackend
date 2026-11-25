export async function verifyTurnstileToken(
  token: string | undefined,
  secret: string,
  remoteIp?: string,
): Promise<boolean> {
  if (!secret.trim()) return true;
  if (!token?.trim()) return false;

  const body = new URLSearchParams({
    secret,
    response: token.trim(),
  });
  if (remoteIp) body.set('remoteip', remoteIp);

  try {
    const res = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!res.ok) return false;
    const payload = (await res.json()) as { success?: boolean };
    return payload.success === true;
  } catch {
    return false;
  }
}