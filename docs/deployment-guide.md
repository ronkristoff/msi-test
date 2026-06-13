# Deployment Guide

## Architecture Overview

MSITest is a three-part system with different deployment models per part:

| Part | Deployment Model | Hosting |
|---|---|---|
| **Frontend** (Next.js) | Standard Next.js deployment | Vercel, Netlify, or any Node.js host |
| **Backend** (Convex) | Serverless — deployed by Convex | Convex Cloud (`npx convex deploy`) |
| **Runner** (Playwright) | Long-running Node.js process | Any VM/container (needs Playwright browsers) |

## Environment Variables

### Frontend (Next.js)

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | Yes | Convex deployment URL (production) |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | Yes | Convex site URL |
| `NEXT_PUBLIC_SITE_URL` | Yes | Public-facing app URL (auth redirects) |

### Backend (Convex)

Set in Convex Dashboard → Settings → Environment Variables:

| Variable | Required | Description |
|---|---|---|
| `SITE_URL` | Yes | App base URL for auth callbacks |
| `BETTER_AUTH_SECRET` | Yes | Better Auth encryption secret |
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth client secret |
| `RUNNER_SECRET` | Yes | Shared secret for Runner authentication |
| `BROWSERBASE_API_KEY` | No | Browserbase API key (Stagehand integration) |
| `BROWSERBASE_PROJECT_ID` | No | Browserbase project ID |
| `MODEL_API_KEY` | No | LLM provider API key (Stagehand model) |
| `RUNNER_URL` | Yes | Runner HTTP endpoint URL |

### Runner

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | Yes | Convex deployment URL |
| `RUNNER_SECRET` | Yes | Shared secret (must match Convex) |
| `RUNNER_API_PORT` | No (default: 8931) | Snapshot API port |

## Deployment Steps

### 1. Deploy Convex Backend

```bash
npx convex deploy
```

This pushes all functions, schema, and cron jobs to Convex Cloud. Set environment variables in the Convex Dashboard after first deploy.

### 2. Deploy Next.js Frontend

```bash
pnpm build
```

The build output goes to `.next/`. Deploy to any Next.js-compatible host:

**Vercel:**
```bash
npx vercel --prod
```

**Self-hosted:**
```bash
pnpm start   # runs `next start` on port 3000
```

### 3. Deploy Runner

The Runner needs Playwright browsers installed:

```bash
# Install dependencies
pnpm install

# Install Playwright browsers
npx playwright install --with-deps chromium

# Start runner (use a process manager like PM2 or systemd)
npx tsx runner/src/index.ts
```

**Production considerations:**
- Run with a process manager (PM2, systemd, Docker)
- Set `RUNNER_SECRET` to a strong random value (must match Convex env var)
- Ensure network access to Convex deployment URL
- Configure health checks on the snapshot API port (default: 8931)
- Only one runner should be active per Convex deployment (atomic claiming prevents duplicate work)

## Infrastructure Requirements

| Component | Min Specs | Notes |
|---|---|---|
| Frontend hosting | 512MB RAM | Standard Next.js hosting |
| Convex | N/A | Managed serverless — no infrastructure to manage |
| Runner | 2GB RAM, 2 CPU | Playwright browsers are memory-intensive |

## CI/CD Integration

The project has no CI/CD pipeline configured yet. The Runner supports CI-triggered runs via `trigger_type: "ci"` in the run schema.

**Recommended CI setup:**
1. On PR: `pnpm lint && pnpm test:all`
2. On merge to main: `npx convex deploy` + `pnpm build`
3. Runner: managed separately (long-running process, not per-build)

## Convex Cron Jobs

Five cron jobs run automatically in Convex Cloud:

| Job | Interval | Purpose |
|---|---|---|
| `markStaleRuns` | 60s | Time out runs with stale heartbeats |
| `clearStaleTestLocks` | 5min | Clear stale editing locks |
| `checkScheduledRuns` | 60s | Trigger due scheduled runs |
| `markStaleGenerations` | 2min | Fail stuck test generation |
| `resetStaleHealingTests` | 2min | Reset stuck healing tests |

No additional configuration needed — these run automatically after deploy.

## Security Notes

- **Runner secret**: Use a strong random string (e.g., `openssl rand -hex 32`). Must be identical in Convex env vars and Runner process.
- **AI API keys**: Store in Convex Dashboard, never in code or `.env` files committed to git.
- **Better Auth secrets**: Use strong random strings. Never commit to git.
- **Rate limiting**: Convex rate limiter component protects high-cost endpoints.
