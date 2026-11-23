# Oracle auto-deploy (GitHub Actions)

On every push to `main`, workflow `.github/workflows/deploy-oracle.yml` builds a linux bundle and deploys to your VM.

## One-time: GitHub repository secrets

**Settings → Secrets and variables → Actions → New repository secret**

| Secret | Example |
|--------|---------|
| `ORACLE_HOST` | `80.225.218.137` |
| `ORACLE_SSH_USER` | `ubuntu` |
| `ORACLE_SSH_KEY` | Full private key file (PEM), same as Mac `Downloads/ssh-key-….key` |
| `DATABASE_URL` | Neon pooler URL (same as production) |
| `JWT_ACCESS_SECRET` | Same as Vercel/Render prod |
| `CORS_ORIGINS` | `https://athra-fit.vercel.app` |

Optional: `APP_PUBLIC_URL`, `FITCORE_AUTOMATION_SECRET`, Razorpay keys.

## Verify

1. **Actions** tab → **Deploy API to Oracle** → green on last `main` push.
2. `curl http://ORACLE_HOST:3001/api/v1/health`

## Manual run

**Actions → Deploy API to Oracle → Run workflow**