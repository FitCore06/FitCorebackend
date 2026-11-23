#!/usr/bin/env tsx
/**
 * Production security audit — exit 1 when blocking issues found.
 * Run: npm run security:audit
 */

const issues: string[] = [];
const warnings: string[] = [];

function requireProd(name: string, value: string | undefined, minLen = 24) {
  const v = value?.trim();
  if (!v) {
    issues.push(`Missing ${name}`);
    return;
  }
  if (v.length < minLen) {
    issues.push(`${name} too short (min ${minLen} chars)`);
  }
  if (/change-me|example|your_password|placeholder/i.test(v)) {
    issues.push(`${name} looks like a placeholder`);
  }
}

const env = process.env;

if (env.DEV_AUTH_STUB === 'true') {
  issues.push('DEV_AUTH_STUB=true (must be false in production)');
}

requireProd('JWT_ACCESS_SECRET', env.JWT_ACCESS_SECRET);
requireProd(
  'ATHRA_AUTOMATION_SECRET or FITCORE_AUTOMATION_SECRET',
  env.ATHRA_AUTOMATION_SECRET ?? env.FITCORE_AUTOMATION_SECRET,
);

if (!env.DATABASE_URL?.includes('sslmode=require')) {
  warnings.push('DATABASE_URL should use sslmode=require');
}

if (env.NODE_ENV === 'production') {
  if (env.CORS_ALLOW_VERCEL_APPS === 'true' || env.CORS_ALLOW_VERCEL_APPS === '1') {
    warnings.push('CORS_ALLOW_VERCEL_APPS allows any *.vercel.app origin');
  }
  if (!env.RAZORPAY_WEBHOOK_SECRET?.trim()) {
    warnings.push('RAZORPAY_WEBHOOK_SECRET not set (needed if online pay is enabled)');
  }
}

const apiLimit = Number(env.API_THROTTLE_LIMIT ?? 300);
if (apiLimit > 2000) {
  warnings.push(`API_THROTTLE_LIMIT=${apiLimit} is very high`);
}

console.log('Athra API security audit\n');
if (warnings.length) {
  console.log('Warnings:');
  for (const w of warnings) console.log(`  - ${w}`);
  console.log('');
}
if (issues.length) {
  console.log('Blocking issues:');
  for (const i of issues) console.log(`  - ${i}`);
  process.exit(1);
}

console.log('OK — no blocking issues.');
if (warnings.length) process.exit(2);