#!/usr/bin/env node
/**
 * Burst login failures against local API; expect HTTP 429 before 15 attempts complete.
 * Usage: BASE_URL=http://localhost:3001/api/v1 node scripts/verify-auth-throttle.mjs
 */
const BASE = (process.env.BASE_URL ?? 'http://localhost:3001/api/v1').replace(/\/$/, '');
const attempts = Number(process.env.THROTTLE_PROBE_ATTEMPTS ?? 15);

async function login(i) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'owner@gym.test',
      password: `wrong-password-${i}`,
    }),
  });
  return { status: res.status, retryAfter: res.headers.get('retry-after') };
}

async function main() {
  const statuses = [];
  let first429At = null;
  for (let i = 0; i < attempts; i++) {
    const r = await login(i);
    statuses.push(r.status);
    if (r.status === 429 && first429At === null) first429At = i + 1;
  }
  const summary = {
    base: BASE,
    attempts,
    statuses,
    count401: statuses.filter((s) => s === 401).length,
    count429: statuses.filter((s) => s === 429).length,
    first429At,
    pass: statuses.some((s) => s === 429),
  };
  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});