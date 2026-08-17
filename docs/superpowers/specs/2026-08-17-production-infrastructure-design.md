# Production Infrastructure Design — zamzam.com.np

**Date:** 2026-08-17
**Status:** Approved (design), pending implementation

## Goal

Take the Zamzam Super App from local-dev-only (Neon Postgres, no Redis, no
error tracking, no image moderation, no automated backups, client on
Vercel) to a fully self-hosted production deployment on a single Hostinger
KVM4 VPS, served at `zamzam.com.np`.

## Non-goals

- Migrating the database engine. The app is built on Drizzle ORM against
  Postgres (typed schema, relations, migrations already in place). Postgres
  stays; it moves from Neon (managed) to self-hosted on the VPS. MongoDB is
  not introduced.
- Adding new upload surfaces. Image moderation is wired into the two upload
  endpoints that exist today (`driver-documents`, `partner-documents`); no
  new photo-upload feature is being built for restaurant/hotel/grocery
  listings as part of this work.
- Multi-server/HA setup. Single VPS, single instance of each service.
  Horizontal scaling is out of scope.

## Current state (as found in the repo)

- Server: NestJS + Drizzle ORM + Neon serverless Postgres (`DATABASE_URL`
  in `server/.env`)
- Email: Resend, already integrated (`server/src/common/mailer`)
- Uploads: `driver-documents` and `partner-documents` only, multer →
  local disk (`server/uploads/`), served via
  `NestExpressApplication.useStaticAssets`. Restaurant/hotel/grocery/bus
  "images" are plain URL text fields, not real uploads.
- No Redis, no Sentry, no AWS integration, no backup automation.
- Client: React 19 + Vite, `client/vercel.json` present (Vercel hosting).

## Architecture overview

```
                        ┌─────────────────────────────────────────┐
                        │         Hostinger KVM4 VPS               │
                        │                                           │
  zamzam.com.np,          │  nginx (TLS via certbot/Let's Encrypt,   │
  www.zamzam.com.np ────▶│   one SAN cert for all 3 hostnames)      │
  (A records)             │   ├── zamzam.com.np      → client dist/ │
  api.zamzam.com.np ────▶│   └── api.zamzam.com.np  → proxy api:4000│
  (A record)              │                                           │
                        │  ┌────────┐  ┌──────────┐  ┌───────────┐  │
                        │  │  api   │──│ postgres │  │   redis   │  │
                        │  │ (Nest) │  │  (data   │  │ (sessions,│  │
                        │  │        │──│  volume) │  │ rate-lmt) │  │
                        │  └───┬────┘  └────┬─────┘  └───────────┘  │
                        │      │            │                       │
                        │      │       ┌────▼─────┐                 │
                        │      │       │ nightly   │                 │
                        │      │       │ backup job│                 │
                        │      │       └────┬─────┘                 │
                        │  uploads/     (pg_dump + uploads/ archive) │
                        │  (volume)          │                       │
                        └─────────────────────┼───────────────────────┘
                                               ▼
                                     Backblaze B2 bucket
                                     (30-day retention)

  api → Sentry (error tracking, server + client)
  api → AWS Rekognition (DetectModerationLabels on upload)
  api → Resend (transactional email)
```

All inter-service traffic (api ↔ postgres, api ↔ redis) stays on the
Docker Compose internal network — only nginx (80/443) is exposed to the
internet.

## Components

### 1. VPS layout — Docker Compose

Single `docker-compose.yml` at the repo root defining:

| Service | Image/build | Exposure | Persistence |
|---|---|---|---|
| `nginx` | official `nginx` + certbot sidecar/cron | 80/443 public | TLS cert volume |
| `api` | built from `server/Dockerfile` | internal :4000 only | none (stateless) |
| `postgres` | `postgres:16` | internal :5432 only | named volume |
| `redis` | `redis:7`, AOF persistence on | internal :6379 only | named volume |
| `backup` | small script container or host cron | — | writes to B2, no local retention needed |

`client/` is built (`npm run build`) in a multi-stage step and its
`dist/` output is copied into the nginx image/volume. `client/vercel.json`
is left in place but unused (or removed at implementation time if that's
cleaner).

**DNS/TLS:** `zamzam.com.np`, `www.zamzam.com.np`, and `api.zamzam.com.np`
→ VPS IP (A records). Certbot issues one Let's Encrypt cert covering all
three (SAN cert, one `certbot` invocation); nginx redirects HTTP → HTTPS.

**Correction from the original draft:** the API is reached at
`api.zamzam.com.np` (its own nginx server block, proxied to the `api`
container), not a `zamzam.com.np/api/*` path prefix. The NestJS app has
no global route prefix today — controllers are mounted at bare paths
(`/auth`, `/driver/documents`, etc.) and `/uploads/*` is served by Nest
itself via `useStaticAssets`. Retrofitting a `/api` prefix would mean
touching every controller and carving out an exception for
`/uploads`, for no real benefit. The client already reads its API base
from a single `VITE_API_URL` env var
(`client/src/api/client.ts`), so pointing it at a subdomain is a
zero-code-change, build-time config value — the simpler and lower-risk
option, at the cost of one extra DNS record covered by the same
certificate.

### 2. Database — self-hosted Postgres

- Replaces Neon. `DATABASE_URL=postgresql://zamzam:<pw>@postgres:5432/zamzam`
  pointing at the internal `postgres` service — no `sslmode=require`
  needed since it never leaves the Docker network.
- Existing Drizzle schema and migration tooling (`npm run db:migrate`,
  `db:generate`, `db:seed:superadmin`) run unchanged against it.
- `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` set via a top-level
  `.env` consumed by docker-compose.

### 3. Redis — rate limiting

- `@nestjs/throttler`'s storage backed by Redis (e.g.
  `@nest-lab/throttler-storage-redis`) instead of the current in-memory
  store, so both the general API limiter and the stricter auth-endpoint
  `@Throttle()` overrides survive app restarts and would work correctly
  if ever scaled to >1 instance.
- `REDIS_URL=redis://redis:6379` env var.
- **Correction from the original draft:** refresh-token/session state is
  already durable in Postgres (`refreshTokens` table, keyed by `jti`,
  revocable per-device — see `auth.service.ts`), so there is no session
  data to move to Redis. Logout-everywhere already works by deleting a
  user's `refreshTokens` rows; the only residual exposure is that an
  already-issued *access* token (15 min TTL) keeps working until it
  naturally expires, which is an accepted tradeoff, not a gap being
  closed by this project.

### 4. Email — Resend (unchanged)

- Keep `server/src/common/mailer` as-is; no code changes.
- Production config only: verify `zamzam.com.np` as a sending domain in
  the Resend dashboard (SPF/DKIM DNS records added alongside the A
  records), set `MAIL_FROM=Zamzam <noreply@zamzam.com.np>`, set a real
  `RESEND_API_KEY` in the VPS's `.env`.

### 5. Error tracking — Sentry

- **Server:** `@sentry/nestjs`, initialized in `server/src/main.ts`,
  wired into the existing global exception filter
  (`server/src/common/filters`) so unhandled exceptions report with
  request context (route, user id if available, status code).
- **Client:** `@sentry/react`, initialized at app entry
  (`client/src/main.tsx` or equivalent), captures render/runtime errors
  and unhandled promise rejections.
- Two DSNs (`SENTRY_DSN_SERVER`, `VITE_SENTRY_DSN`), only active when
  `NODE_ENV=production` — local dev stays quiet/no-op.

### 6. Image moderation — AWS Rekognition

- Scope: the two real upload endpoints today —
  `server/src/modules/driver-documents` and
  `server/src/modules/partner-documents`. Both currently accept
  `image/jpeg`, `image/png`, `image/webp`, or `application/pdf` and use
  multer's `diskStorage`, which streams straight to disk with no buffer
  available to inspect first.
- Both controllers switch from `diskStorage` to `memoryStorage` so the
  file bytes are available in memory before anything is written; the
  service layer writes the buffer to disk itself only after moderation
  passes.
- Flow: on upload, for image mimetypes only, call Rekognition
  `DetectModerationLabels` with the raw buffer (inline bytes, no S3
  round-trip needed — Rekognition accepts up to 5MB inline, comfortably
  covering document photos; the existing 5MB `MAX_FILE_SIZE_BYTES` limit
  already enforces this). `application/pdf` uploads are **not** sent to
  Rekognition (it doesn't moderate PDFs) and pass straight through, same
  as today.
- If any returned label exceeds a configured confidence threshold
  (default 80%, tunable via `REKOGNITION_MIN_CONFIDENCE`) for categories
  like explicit/inappropriate content, the upload is rejected with a 422
  before touching disk or the database.
- Files continue to live on local disk under the VPS's persistent
  `uploads/` volume — no new object-storage system is introduced.
- `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (scoped to an
  IAM user with `rekognition:DetectModerationLabels` only) added to env.

### 7. Backups — Backblaze B2

- Nightly job (cron, either host-level or a dedicated lightweight
  container) that:
  1. Runs `pg_dump` against the `postgres` service, gzips the output.
  2. Archives the `uploads/` volume (tarball) — user-uploaded documents
     aren't in the database and need their own backup.
  3. Uploads both to a B2 bucket via the B2 S3-compatible API.
- Retention: 30 daily backups kept, older ones pruned automatically (B2
  lifecycle rule on the bucket, or script-side deletion after upload).
- Restore procedure (how to pull a dump back down and `psql` it in, how
  to untar the uploads archive) documented in `server/README.md`.
- `B2_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET`, `B2_ENDPOINT` added to
  env.

### 8. Env/config changes

`server/.env.example` gains: `REDIS_URL`, `SENTRY_DSN_SERVER`,
`AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
`REKOGNITION_MIN_CONFIDENCE`, `B2_KEY_ID`, `B2_APPLICATION_KEY`,
`B2_BUCKET`, `B2_ENDPOINT`. `DATABASE_URL` default updated to the
in-network Postgres form. A new top-level `.env` (docker-compose only,
not committed) holds `POSTGRES_*` container credentials. `client/.env`
gains `VITE_SENTRY_DSN`.

## Error handling

- Rekognition/Redis/Sentry are all treated as best-effort where it makes
  sense: if Rekognition's API call itself fails (network/AWS outage), the
  upload is rejected rather than silently allowed through unmoderated —
  fail closed for moderation, matching how document-integrity checks
  should behave.
- If Redis is unreachable, the app should fail closed for rate limiting
  (reject rather than allow unlimited requests) but the session/refresh
  lookup failing should produce a normal 401 (force re-login), not a
  500 crash.
- Backup job failures (pg_dump error, B2 upload error) must be visible —
  logged and reported to Sentry so a failed night doesn't go unnoticed.

## Testing/verification plan

- `docker compose up` locally reproduces the full stack (postgres, redis,
  api, nginx) against a throwaway `.env` before touching the VPS.
- Existing Jest test suite (`npm run test`) continues to pass unchanged —
  no test currently depends on Neon-specific behavior.
- Manual verification on the VPS after deploy: TLS cert valid, `/api/*`
  reachable, `db:migrate` + `db:seed:superadmin` succeed against the
  containerized Postgres, a test upload gets moderated (verify both an
  accepted and a rejected case), a forced error surfaces in Sentry, and
  one manual backup-job run lands a dump in the B2 bucket.

## Open items deferred to implementation time

- Exact nginx config and Dockerfile contents.
- Choice of B2 upload tooling (`rclone` vs AWS SDK against B2's
  S3-compatible endpoint) — implementation detail, either works.
- Whether `client/vercel.json` is deleted or just left unused.
