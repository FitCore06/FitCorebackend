# Oracle auto-deploy (GitHub Actions)

On every push to `main`, workflow `.github/workflows/deploy-oracle.yml` builds a linux bundle and deploys to your VM.

## One-time: GitHub repository secrets

**Settings → Secrets and variables → Actions → New repository secret**

| Secret | Example |
|--------|---------|
| `ORACLE_HOST` | `80.225.218.137` |
| `ORACLE_SSH_USER` | `ubuntu` |
| `ORACLE_SSH_KEY` | Full private key file (PEM), same as Mac `Downloads/ssh-key-….key` |
| `MIGRATE_DATABASE_URL` | **Neon direct** (no `-pooler`) — used in CI migrate step |
| `DATABASE_URL` | **Neon pooled** — VM runtime (same as production API) |
| `JWT_ACCESS_SECRET` | Same as Vercel/Render prod |
| `CORS_ORIGINS` | `https://athra-fit.vercel.app` |

Optional: `APP_PUBLIC_URL`, `FITCORE_AUTOMATION_SECRET`, Razorpay keys.

Prisma **migrations run on the Oracle VM** during deploy (not on GitHub Actions — runners often get Neon P1001 on direct hosts).

**Neon URL:** Dashboard → **Connect** → **Direct** → copy full string. Host must be real (`ep-soft-cell-…`), not docs placeholder `ep-xxxx`. If password has `@ # %`, use Neon’s copy button or URL-encode it.

## Verify

1. **Actions** tab → **Deploy API to Oracle** → green on last `main` push.
2. `curl http://ORACLE_HOST:3001/api/v1/health`

If the run fails on **Migrate (Neon / prod DB)**:

- Missing secret → set `MIGRATE_DATABASE_URL` + `DATABASE_URL`.
- `P1001 Can't reach database server` → Neon was idle (scale-to-zero). Re-run workflow; CI now retries up to 6×. Open Neon console → **production** branch → confirm compute **Active** before deploy.
- Use **direct** host (no `-pooler`). URL should include `sslmode=require&schema=public`. Remove `channel_binding=require` from the secret if present.
- Wrong password / rotated Neon password → update `MIGRATE_DATABASE_URL` in GitHub Secrets.

## Manual run

**Actions → Deploy API to Oracle → Run workflow**