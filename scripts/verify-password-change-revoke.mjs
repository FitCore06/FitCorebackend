#!/usr/bin/env node
/**
 * Login → save refresh → change password → old refresh must fail.
 * Usage: BASE_URL=... TEST_PASSWORD=... node scripts/verify-password-change-revoke.mjs
 */
const BASE = (process.env.BASE_URL ?? 'http://localhost:3001/api/v1').replace(/\/$/, '');
const EMAIL = process.env.TEST_EMAIL ?? 'owner@gym.test';
const PASSWORD = process.env.TEST_PASSWORD ?? 'FitCore@123';

async function req(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

async function main() {
  const login = await req('POST', '/auth/login', {
    body: { email: EMAIL, password: PASSWORD },
  });
  if (login.status !== 200 && login.status !== 201) {
    console.log(JSON.stringify({ pass: false, step: 'login', login }, null, 2));
    process.exit(1);
  }
  const { accessToken, refreshToken } = login.json;
  const newPassword = `${PASSWORD}X`;
  const change = await req('POST', '/auth/change-password', {
    token: accessToken,
    body: { currentPassword: PASSWORD, newPassword },
  });
  const refreshOld = await req('POST', '/auth/refresh', {
    body: { refreshToken },
  });
  const loginNew = await req('POST', '/auth/login', {
    body: { email: EMAIL, password: newPassword },
  });
  const revert = loginNew.status === 200 || loginNew.status === 201
    ? await req('POST', '/auth/change-password', {
        token: loginNew.json.accessToken,
        body: { currentPassword: newPassword, newPassword: PASSWORD },
      })
    : { status: 0 };

  const summary = {
    pass:
      (change.status === 200 || change.status === 201) &&
      refreshOld.status === 401 &&
      (loginNew.status === 200 || loginNew.status === 201) &&
      (revert.status === 200 || revert.status === 201),
    changeStatus: change.status,
    refreshOldStatus: refreshOld.status,
    loginNewStatus: loginNew.status,
    revertStatus: revert.status,
  };
  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});