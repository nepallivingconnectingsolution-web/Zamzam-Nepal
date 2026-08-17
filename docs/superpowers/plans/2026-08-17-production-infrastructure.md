# Production Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take Zamzam from local-dev-only (Neon Postgres, no Redis, no error tracking, no image moderation, no backups) to a self-hosted production deployment on one Hostinger KVM4 VPS, serving `zamzam.com.np` / `www.zamzam.com.np` (client) and `api.zamzam.com.np` (NestJS API), with self-hosted Postgres + Redis, Sentry error tracking, AWS Rekognition upload moderation, and nightly Backblaze B2 backups.

**Architecture:** Docker Compose on the VPS runs five services — `postgres`, `redis`, `api` (NestJS, built from `server/`), `nginx` (TLS termination + client static files + reverse proxy to `api`), and a `backup` cron job. The client is a static build served directly by nginx; the API is unchanged in how it's built, just re-pointed at self-hosted Postgres/Redis instead of Neon and given no in-memory-only rate limiter.

**Tech Stack:** Docker Compose, Postgres 16, Redis 7, nginx + certbot, `@nest-lab/throttler-storage-redis`, `@aws-sdk/client-rekognition`, `@sentry/nestjs`, `@sentry/react`, existing Resend/Drizzle/NestJS/React stack unchanged.

## Global Constraints

- Postgres and Drizzle ORM are not being replaced — every data-layer change in this plan is deployment/config only, never a schema or query rewrite.
- No new object-storage system: uploaded files stay on local disk under a Docker-managed volume (`uploads_data`), backed up separately to B2.
- Rekognition moderation applies only to `image/*` uploads; `application/pdf` uploads pass through unmoderated (Rekognition doesn't support PDFs) — this must not become a silent bypass, so it's an explicit mimetype check, not a try/catch swallow.
- Fail-closed: if Rekognition's API call errors (not "labels found", but the call itself failing), the upload is rejected, not silently allowed.
- All new secrets (`AWS_*`, `SENTRY_DSN_SERVER`, `B2_*`, `REDIS_URL`) follow the existing `.env.example` convention: documented with a comment explaining where to get the value and what breaks if it's unset.
- API is reached at `api.zamzam.com.np`; the client is reached at `zamzam.com.np`/`www.zamzam.com.np`. No `/api` path prefix is introduced on the NestJS app.

---

## File Structure

New files:
- `docker-compose.yml` (repo root) — orchestrates postgres, redis, api, nginx, backup
- `.env.example` (repo root) — `POSTGRES_*` container credentials, documented for docker-compose only
- `server/Dockerfile`, `server/.dockerignore` — multi-stage API build
- `nginx/Dockerfile`, `nginx/nginx.conf.template` — client static + reverse proxy + client build stage
- `server/src/common/throttler/redis-throttler-storage.ts`, `.spec.ts` — Redis-backed throttler storage factory
- `server/src/common/moderation/moderation.module.ts`
- `server/src/common/moderation/moderation.service.ts`, `.spec.ts` — Rekognition wrapper
- `server/scripts/backup-prune.ts`, `.spec.ts` — pure retention-window logic
- `server/scripts/backup.sh` — nightly pg_dump + uploads tar + B2 upload + prune
- `server/src/modules/driver-documents/driver-documents.service.spec.ts`
- `server/src/modules/partner-documents/partner-documents.service.spec.ts`
- `server/src/common/filters/all-exceptions.filter.spec.ts`

Modified files:
- `server/src/app.module.ts` — Redis-backed `ThrottlerModule`
- `server/src/main.ts` — Sentry init, production AWS-config guard
- `server/src/common/filters/all-exceptions.filter.ts` — report 5xx/unknown errors to Sentry
- `server/src/modules/driver-documents/storage.ts`, `driver-documents.controller.ts`, `driver-documents.service.ts`, `driver-documents.module.ts` — memoryStorage + moderation
- `server/src/modules/partner-documents/storage.ts`, `partner-documents.controller.ts`, `partner-documents.service.ts`, `partner-documents.module.ts` — same
- `server/.env.example` — new vars, `DATABASE_URL` default updated
- `client/src/main.tsx` — Sentry init
- `client/.env.example` — `VITE_SENTRY_DSN`, `VITE_API_URL` production note
- `README.md`, `server/README.md` — docker-compose dev/deploy instructions, restore procedure

---

### Task 1: Docker Compose skeleton — Postgres + Redis

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`
- Modify: `.gitignore` (repo root, if one exists — add top-level `.env`)

**Interfaces:**
- Produces: a `postgres` service reachable at `postgres:5432` and a `redis` service reachable at `redis:6379` on the compose network `zamzam_net`, both with named volumes and healthchecks later tasks depend on.

- [ ] **Step 1: Check for a root `.gitignore`, create one if missing**

Run: `ls -la` in the repo root (`zamzam testing/`). If no `.gitignore` exists at the root (client/ and server/ each have their own already), create one:

```gitignore
# Root-level docker-compose secrets — never commit.
.env
```

If a root `.gitignore` already exists, just confirm `.env` is in it; add the line above if not.

- [ ] **Step 2: Write `.env.example`**

```env
# ─────────────────────────────────────────────────────────────────────────
# docker-compose environment — copy to `.env` in the repo root and fill in
# real values before running `docker compose up` on the VPS. This file is
# ONLY for the containers' own bootstrap credentials (Postgres superuser,
# etc). Application secrets (JWT, Resend, AWS...) live in server/.env,
# loaded separately via the api service's env_file.
# ─────────────────────────────────────────────────────────────────────────

POSTGRES_USER=zamzam
# Generate with: openssl rand -base64 24
POSTGRES_PASSWORD=replace-with-a-strong-password
POSTGRES_DB=zamzam
```

- [ ] **Step 3: Write `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 10
    networks: [zamzam_net]

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 10
    networks: [zamzam_net]

networks:
  zamzam_net:

volumes:
  postgres_data:
  redis_data:
```

- [ ] **Step 4: Verify the skeleton starts and is healthy**

Run (from the repo root):
```bash
cp .env.example .env
# edit .env, set a real POSTGRES_PASSWORD
docker compose up -d postgres redis
docker compose ps
```
Expected: both `postgres` and `redis` show `healthy` within ~30s. Then:
```bash
docker compose exec postgres psql -U zamzam -d zamzam -c "select 1;"
docker compose exec redis redis-cli ping
```
Expected: `1` row back from Postgres, `PONG` from Redis.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml .env.example .gitignore
git commit -m "infra: add docker-compose skeleton for self-hosted postgres + redis"
```

---

### Task 2: Server Dockerfile

**Files:**
- Create: `server/Dockerfile`
- Create: `server/.dockerignore`
- Modify: `docker-compose.yml`

**Interfaces:**
- Consumes: `postgres`/`redis` services from Task 1 (compose network `zamzam_net`).
- Produces: an `api` service, built from `server/`, listening on container port 4000, depending on `postgres`/`redis` being healthy before it starts, with `uploads_data` mounted at `/app/uploads`.

- [ ] **Step 1: Write `server/.dockerignore`**

```
node_modules
dist
coverage
uploads
.env
*.tsbuildinfo
```

- [ ] **Step 2: Write `server/Dockerfile`**

```dockerfile
# ── Build stage ─────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Runtime stage ───────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
# Drizzle migrations run from source (tsx), not the compiled dist — keep
# the schema/migration folder and tsx available at runtime.
COPY --from=build /app/src/database ./src/database
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts
RUN npm install tsx --no-save
RUN mkdir -p uploads
EXPOSE 4000
CMD ["node", "dist/main.js"]
```

- [ ] **Step 3: Add the `api` service to `docker-compose.yml`**

```yaml
  api:
    build:
      context: ./server
    restart: unless-stopped
    env_file:
      - ./server/.env
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - uploads_data:/app/uploads
    expose:
      - "4000"
    networks: [zamzam_net]
```

Add `uploads_data:` under the top-level `volumes:` key.

- [ ] **Step 4: Verify the API builds and connects to compose Postgres/Redis**

First point `server/.env`'s `DATABASE_URL` at the compose network (this becomes the permanent default in Task 4, but set it now to verify):
```
DATABASE_URL=postgresql://zamzam:<same password as .env>@postgres:5432/zamzam
```
Run:
```bash
docker compose up -d --build api
docker compose logs api --tail=50
```
Expected: log line `Zamzam server listening on port 4000`, no connection errors. Then:
```bash
docker compose exec api node -e "require('http').get('http://localhost:4000/auth/me', r => console.log(r.statusCode))"
```
Expected: `401` (unauthenticated, but the server responded — proves the app is up and routing).

- [ ] **Step 5: Commit**

```bash
git add server/Dockerfile server/.dockerignore docker-compose.yml
git commit -m "infra: add server Dockerfile and wire api service into compose"
```

---

### Task 3: Self-hosted Postgres cutover (env + docs)

**Files:**
- Modify: `server/.env.example`
- Modify: `README.md`
- Modify: `server/README.md`

**Interfaces:**
- Produces: `server/.env.example`'s `DATABASE_URL` default now documents the self-hosted form; local non-Docker development against Neon remains possible by overriding the value, nothing forces Docker for development.

- [ ] **Step 1: Update `server/.env.example`'s database section**

Replace:
```
# Database — Neon serverless Postgres connection string.
# Get this from your Neon project dashboard (Connection Details).
# Must include sslmode=require for Neon.
# ⚠️ SECURITY: a real Neon connection string (with password) was previously
# committed/shared in this file. That credential must be considered
# COMPROMISED — rotate the database password in the Neon dashboard NOW,
# then paste the NEW connection string below. Never share .env again.
DATABASE_URL=postgresql://user:password@host.neon.tech/dbname?sslmode=require&channel_binding=require
```
with:
```
# Database — self-hosted Postgres (see docker-compose.yml at the repo
# root). When running the full stack via `docker compose up`, this value
# points at the `postgres` service over the internal Docker network — no
# sslmode needed, it never leaves the host. The user/password/db here
# must match POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_DB in the repo
# root's .env (see .env.example there).
#
# For local development without Docker, run Postgres yourself (e.g.
# `docker run -p 5432:5432 -e POSTGRES_PASSWORD=dev postgres:16-alpine`)
# and point this at localhost instead.
DATABASE_URL=postgresql://zamzam:replace-with-postgres-password@postgres:5432/zamzam
```

- [ ] **Step 2: Update `README.md`'s quick-start section**

Replace the "Quick start" section's backend instructions to mention the docker-compose path as the primary route, keeping the manual path as an alternative:

```markdown
## Quick start

**Full stack via Docker Compose (recommended — matches production):**

```bash
cp .env.example .env                    # POSTGRES_* container creds
cp server/.env.example server/.env      # DATABASE_URL, JWT secrets, etc.
docker compose up -d postgres redis
cd server && npm install && npm run db:migrate && npm run db:seed:superadmin && cd ..
docker compose up -d --build
```
Client: http://localhost (nginx) · API: http://localhost:4000 direct, or via nginx at the configured domain.

**Backend only, without Docker** (see `server/README.md` for full detail):

```bash
cd server
npm install
cp .env.example .env       # point DATABASE_URL at your own Postgres
npm run db:migrate
npm run db:seed:superadmin
npm run start:dev          # http://localhost:4000
```

**Frontend only, without Docker:**

```bash
cd client
npm install
cp .env.example .env.local  # VITE_API_URL defaults to http://localhost:4000
npm run dev                 # http://localhost:5173
npm run build                # type-check + production build
```
```

- [ ] **Step 3: Add a one-line pointer in `server/README.md`**

Add near the top (before existing setup instructions), if not already present:
```markdown
> For the full self-hosted production setup (Docker Compose, Postgres/Redis, Nginx/TLS, backups), see the repo root `README.md` and `docs/superpowers/specs/2026-08-17-production-infrastructure-design.md`.
```

- [ ] **Step 4: Verify**

Run: `docker compose exec api npm run db:migrate --prefix /app 2>&1 || true` — actually migrations run from the host against the exposed connection in Step 1 of Task 2's verification already proved this path works; re-confirm by running, from the host:
```bash
cd server && npm run db:migrate
```
with `DATABASE_URL` pointed at `localhost:5432` (compose doesn't publish postgres's port by default — temporarily add `ports: ["5432:5432"]` under the `postgres` service to test from the host, or run the migrate command inside the `api` container: `docker compose exec api node dist/database/migrate.js` after confirming `dist/database/migrate.js` exists in the build. If it's a `tsx`-run TS file without a compiled JS output, use `docker compose exec api npx tsx src/database/migrate.ts` instead — tsx was installed in the Dockerfile's runtime stage for exactly this).
Expected: migration runs cleanly against the containerized Postgres, no errors.

- [ ] **Step 5: Commit**

```bash
git add server/.env.example README.md server/README.md
git commit -m "docs: document self-hosted Postgres as the default deployment path"
```

---

### Task 4: Client build + Nginx (static + reverse proxy + TLS)

**Files:**
- Create: `nginx/Dockerfile`
- Create: `nginx/nginx.conf.template`
- Modify: `docker-compose.yml`
- Modify: `client/.env.example`

**Interfaces:**
- Consumes: `api` service from Task 2 (proxies `api.zamzam.com.np` to `api:4000`).
- Produces: `nginx` service exposing 80/443, serving the client build at `zamzam.com.np`/`www.zamzam.com.np` and proxying `api.zamzam.com.np` to the API.

- [ ] **Step 1: Write `nginx/Dockerfile`** (multi-stage: builds the client, then copies into an nginx image)

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY client/package*.json ./
RUN npm ci
COPY client/ .
# VITE_API_URL is baked in at build time — must point at the public API
# hostname, not localhost, for a production build.
ARG VITE_API_URL=https://api.zamzam.com.np
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:1.27-alpine
RUN apk add --no-cache certbot certbot-nginx
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx/nginx.conf.template /etc/nginx/templates/default.conf.template
```

- [ ] **Step 2: Write `nginx/nginx.conf.template`**

```nginx
# Frontend — zamzam.com.np / www.zamzam.com.np
server {
    listen 80;
    server_name zamzam.com.np www.zamzam.com.np;

    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}

# API — api.zamzam.com.np
server {
    listen 80;
    server_name api.zamzam.com.np;

    client_max_body_size 6M; # matches server-side 5MB upload limit + headroom

    location / {
        proxy_pass http://api:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

(TLS/443 server blocks are added by `certbot --nginx` once DNS is live — see Step 4. Hand-writing them now would reference certificate files that don't exist yet and break `nginx -t`.)

- [ ] **Step 3: Add the `nginx` service to `docker-compose.yml`**

```yaml
  nginx:
    build:
      context: .
      dockerfile: nginx/Dockerfile
      args:
        VITE_API_URL: https://api.zamzam.com.np
    restart: unless-stopped
    depends_on:
      - api
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - certbot_conf:/etc/letsencrypt
      - certbot_www:/var/www/certbot
    networks: [zamzam_net]
```

Add `certbot_conf:` and `certbot_www:` under the top-level `volumes:` key.

- [ ] **Step 4: Verify locally with a hosts-file override** (DNS isn't live yet, so simulate it)

Add to the local machine's hosts file (`/etc/hosts` or Windows `C:\Windows\System32\drivers\etc\hosts`):
```
127.0.0.1 zamzam.com.np www.zamzam.com.np api.zamzam.com.np
```
Run:
```bash
docker compose up -d --build
curl -I http://zamzam.com.np
curl -I http://api.zamzam.com.np/auth/me
```
Expected: first curl returns `200` with `Content-Type: text/html` (the client's `index.html`); second returns `401` (proves the proxy reaches the API, not the client's SPA fallback).
Remove the hosts-file lines afterward.

- [ ] **Step 5: Update `client/.env.example`** with a production note

```env
# Zamzam client environment
# Base URL of the NestJS API (see /server). Defaults to http://localhost:4000
# for local dev. In production this is baked in at build time via the
# nginx Docker build's VITE_API_URL arg (see nginx/Dockerfile) and should
# be https://api.zamzam.com.np.
VITE_API_URL=http://localhost:4000
```

- [ ] **Step 6: Commit**

```bash
git add nginx/ docker-compose.yml client/.env.example
git commit -m "infra: add nginx service for client static hosting + API reverse proxy"
```

---

### Task 5: TLS/domain cutover checklist (ops, on the actual VPS)

**Files:**
- Modify: `README.md` (adds a "Deploying to the VPS" section)

This task has no application code — it's the one-time manual sequence run on the real Hostinger VPS once DNS is pointed at it. It's still a plan task because it has a concrete, checkable deliverable (a live HTTPS site) and belongs in the repo's docs so it isn't tribal knowledge.

**Interfaces:**
- Consumes: the `nginx`/`api`/`postgres`/`redis` services from Tasks 1–4.
- Produces: `docs` describing the exact commands to run once on the VPS.

- [ ] **Step 1: Write the deployment section in `README.md`**

```markdown
## Deploying to the VPS

One-time setup on a fresh Hostinger KVM4 VPS:

1. Install Docker + Docker Compose plugin (see Docker's official install docs for the VPS's distro).
2. Point DNS: create A records for `zamzam.com.np`, `www.zamzam.com.np`, and `api.zamzam.com.np`, all pointing at the VPS's public IP. Wait for propagation (`dig zamzam.com.np` should return the VPS IP).
3. Clone this repo onto the VPS, `cd` into it.
4. `cp .env.example .env` and `cp server/.env.example server/.env`, fill in every value (strong Postgres password, JWT secrets via `openssl rand -base64 48`, Resend API key, AWS keys, B2 keys, Sentry DSN — see each file's comments).
5. `docker compose up -d postgres redis` and wait for both to report healthy (`docker compose ps`).
6. `docker compose run --rm api npx tsx src/database/migrate.ts` then `docker compose run --rm api npx tsx src/database/seed-super-admin.ts`.
7. `docker compose up -d --build` — brings up `api` and `nginx` (HTTP only at this point).
8. Issue the TLS certificate:
   ```bash
   docker compose run --rm nginx certbot --nginx \
     -d zamzam.com.np -d www.zamzam.com.np -d api.zamzam.com.np \
     --non-interactive --agree-tos -m <your-email>
   docker compose restart nginx
   ```
9. Verify: `curl -I https://zamzam.com.np` and `curl -I https://api.zamzam.com.np/auth/me` both succeed over HTTPS.

Certbot's container sets up its own renewal timer; confirm with `docker compose exec nginx certbot renew --dry-run` after step 8.

Redeploying after a code change: `git pull && docker compose up -d --build api nginx`.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add VPS deployment checklist"
```

---

### Task 6: Redis-backed rate limiting

**Files:**
- Create: `server/src/common/throttler/redis-throttler-storage.ts`
- Create: `server/src/common/throttler/redis-throttler-storage.spec.ts`
- Modify: `server/src/app.module.ts`
- Modify: `server/.env.example`

**Interfaces:**
- Produces: `buildThrottlerStorage(redisUrl: string | undefined): ThrottlerStorage | undefined` — returns a Redis-backed storage instance when `redisUrl` is set, `undefined` (falls back to `@nestjs/throttler`'s built-in in-memory storage) otherwise. Used by `app.module.ts`'s `ThrottlerModule.forRootAsync`.

- [ ] **Step 1: Install dependencies**

```bash
cd server
npm install @nest-lab/throttler-storage-redis ioredis
```

- [ ] **Step 2: Write the failing test**

```typescript
// server/src/common/throttler/redis-throttler-storage.spec.ts
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { buildThrottlerStorage } from './redis-throttler-storage';

describe('buildThrottlerStorage', () => {
  it('returns undefined when no REDIS_URL is configured (falls back to in-memory)', () => {
    expect(buildThrottlerStorage(undefined)).toBeUndefined();
    expect(buildThrottlerStorage('')).toBeUndefined();
  });

  it('returns a Redis-backed storage instance when REDIS_URL is set', () => {
    const storage = buildThrottlerStorage('redis://localhost:6379');
    expect(storage).toBeInstanceOf(ThrottlerStorageRedisService);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- redis-throttler-storage.spec.ts`
Expected: FAIL — `Cannot find module './redis-throttler-storage'`.

- [ ] **Step 4: Write the implementation**

```typescript
// server/src/common/throttler/redis-throttler-storage.ts
import type { ThrottlerStorage } from '@nestjs/throttler';
import Redis from 'ioredis';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';

/**
 * Backs @nestjs/throttler with Redis so rate-limit counters survive app
 * restarts/deploys instead of resetting to zero every time (the default
 * in-memory storage). Returns undefined when REDIS_URL isn't configured
 * (e.g. local dev without Docker) so ThrottlerModule falls back to its
 * built-in in-memory storage rather than failing to start.
 */
export function buildThrottlerStorage(redisUrl: string | undefined): ThrottlerStorage | undefined {
  if (!redisUrl) return undefined;
  return new ThrottlerStorageRedisService(new Redis(redisUrl));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- redis-throttler-storage.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Wire it into `app.module.ts`**

Modify the `ThrottlerModule.forRootAsync` block:

```typescript
import { buildThrottlerStorage } from './common/throttler/redis-throttler-storage';

// ...inside @Module imports:
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: Number(config.get('API_RATE_LIMIT_TTL_MS') ?? 60_000),
            limit: Number(config.get('API_RATE_LIMIT_LIMIT') ?? 300),
          },
        ],
        storage: buildThrottlerStorage(config.get<string>('REDIS_URL')),
      }),
    }),
```

- [ ] **Step 7: Add `REDIS_URL` to `server/.env.example`**

```env
# Redis — backs rate limiting (see docker-compose.yml). Without this set,
# rate limits still work but reset on every restart/deploy instead of
# persisting.
REDIS_URL=redis://redis:6379
```

- [ ] **Step 8: Run the full test suite**

Run: `npm test`
Expected: all existing tests still pass, plus the 2 new ones.

- [ ] **Step 9: Manual verification against the real Redis (requires Task 1's compose stack running)**

```bash
docker compose up -d postgres redis
cd server && REDIS_URL=redis://localhost:6379 npm run start:dev
```
(temporarily add `ports: ["6379:6379"]` to the `redis` service to reach it from the host, or run this check from inside the `api` container once Task 2 is done)
```bash
for i in $(seq 1 12); do curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4000/auth/login -H "Content-Type: application/json" -d '{"email":"x@x.com","password":"wrong"}'; done
```
Expected: the first 10 requests return `401` (wrong password), the 11th and 12th return `429` (rate limited). Restart the server and immediately repeat — expect the 429s to still trigger at the same count, proving the counter persisted in Redis rather than resetting.

- [ ] **Step 10: Commit**

```bash
git add server/src/common/throttler server/src/app.module.ts server/.env.example server/package.json server/package-lock.json
git commit -m "feat: back rate limiting with Redis so counters survive restarts"
```

---

### Task 7: AWS Rekognition moderation service

**Files:**
- Create: `server/src/common/moderation/moderation.service.ts`
- Create: `server/src/common/moderation/moderation.service.spec.ts`
- Create: `server/src/common/moderation/moderation.module.ts`
- Modify: `server/.env.example`

**Interfaces:**
- Produces: `ModerationService.checkImage(buffer: Buffer): Promise<ModerationResult>` where `ModerationResult = { allowed: boolean; reasons: string[] }`. Throws on Rekognition API failure (network/AWS error) — callers must catch and fail closed. Returns `{ allowed: true, reasons: [] }` without calling AWS when `AWS_REGION` isn't configured (local dev). `ModerationModule` exports `ModerationService` for `driver-documents`/`partner-documents` modules to import.

- [ ] **Step 1: Install dependency**

```bash
cd server
npm install @aws-sdk/client-rekognition
```

- [ ] **Step 2: Write the failing tests**

```typescript
// server/src/common/moderation/moderation.service.spec.ts
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RekognitionClient, DetectModerationLabelsCommand } from '@aws-sdk/client-rekognition';
import { ModerationService } from './moderation.service';

jest.mock('@aws-sdk/client-rekognition');

describe('ModerationService', () => {
  const buffer = Buffer.from('fake-image-bytes');

  async function build(config: Record<string, string>) {
    const module = await Test.createTestingModule({
      providers: [
        ModerationService,
        { provide: ConfigService, useValue: { get: (key: string) => config[key] } },
      ],
    }).compile();
    return module.get(ModerationService);
  }

  it('allows the image when AWS_REGION is not configured (local dev, no bypass of the rest of the app)', async () => {
    const service = await build({});
    const result = await service.checkImage(buffer);
    expect(result).toEqual({ allowed: true, reasons: [] });
    expect(RekognitionClient).not.toHaveBeenCalled();
  });

  it('allows the image when Rekognition returns no moderation labels', async () => {
    const send = jest.fn().mockResolvedValue({ ModerationLabels: [] });
    (RekognitionClient as jest.Mock).mockImplementation(() => ({ send }));

    const service = await build({ AWS_REGION: 'ap-south-1' });
    const result = await service.checkImage(buffer);

    expect(result).toEqual({ allowed: true, reasons: [] });
    expect(send).toHaveBeenCalledWith(expect.any(DetectModerationLabelsCommand));
  });

  it('rejects the image and lists reasons when Rekognition returns moderation labels', async () => {
    const send = jest.fn().mockResolvedValue({
      ModerationLabels: [{ Name: 'Explicit Nudity', Confidence: 92.3 }],
    });
    (RekognitionClient as jest.Mock).mockImplementation(() => ({ send }));

    const service = await build({ AWS_REGION: 'ap-south-1' });
    const result = await service.checkImage(buffer);

    expect(result.allowed).toBe(false);
    expect(result.reasons).toEqual(['Explicit Nudity (92.3%)']);
  });

  it('propagates an error when the Rekognition call itself fails (fail closed)', async () => {
    const send = jest.fn().mockRejectedValue(new Error('AWS unavailable'));
    (RekognitionClient as jest.Mock).mockImplementation(() => ({ send }));

    const service = await build({ AWS_REGION: 'ap-south-1' });
    await expect(service.checkImage(buffer)).rejects.toThrow('AWS unavailable');
  });

  it('passes the configured MinConfidence to Rekognition', async () => {
    const send = jest.fn().mockResolvedValue({ ModerationLabels: [] });
    (RekognitionClient as jest.Mock).mockImplementation(() => ({ send }));

    const service = await build({ AWS_REGION: 'ap-south-1', REKOGNITION_MIN_CONFIDENCE: '90' });
    await service.checkImage(buffer);

    const command = send.mock.calls[0][0] as DetectModerationLabelsCommand;
    expect(command.input.MinConfidence).toBe(90);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- moderation.service.spec.ts`
Expected: FAIL — `Cannot find module './moderation.service'`.

- [ ] **Step 4: Write the implementation**

```typescript
// server/src/common/moderation/moderation.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RekognitionClient, DetectModerationLabelsCommand } from '@aws-sdk/client-rekognition';

export interface ModerationResult {
  allowed: boolean;
  /** Human-readable reasons for rejection, e.g. "Explicit Nudity (92.3%)". Empty when allowed. */
  reasons: string[];
}

/**
 * Wraps AWS Rekognition's image moderation. Only ever called with image
 * bytes (image/jpeg, image/png, image/webp) — Rekognition doesn't support
 * PDFs, so PDF uploads never reach this service; see driver-documents and
 * partner-documents services for where that mimetype check happens.
 *
 * Fails OPEN (allows the upload) only when AWS_REGION isn't configured at
 * all — that's the local-dev-without-AWS-credentials case, mirroring how
 * RESEND_API_KEY works elsewhere in this codebase (unset = degrade
 * gracefully in dev). In production, main.ts refuses to boot without
 * AWS_REGION set, so this fallback never actually triggers there.
 *
 * Fails CLOSED (throws) if Rekognition is configured but the API call
 * itself errors — callers must catch that and reject the upload, not
 * swallow it and let an unmoderated file through.
 */
@Injectable()
export class ModerationService {
  private readonly client: RekognitionClient | null;
  private readonly minConfidence: number;

  constructor(private readonly config: ConfigService) {
    const region = this.config.get<string>('AWS_REGION');
    this.minConfidence = Number(this.config.get<string>('REKOGNITION_MIN_CONFIDENCE') ?? 80);
    this.client = region ? new RekognitionClient({ region }) : null;
  }

  async checkImage(buffer: Buffer): Promise<ModerationResult> {
    if (!this.client) return { allowed: true, reasons: [] };

    const result = await this.client.send(
      new DetectModerationLabelsCommand({
        Image: { Bytes: buffer },
        MinConfidence: this.minConfidence,
      }),
    );

    const labels = result.ModerationLabels ?? [];
    if (labels.length === 0) return { allowed: true, reasons: [] };

    return {
      allowed: false,
      reasons: labels.map((l) => `${l.Name} (${l.Confidence?.toFixed(1)}%)`),
    };
  }
}
```

```typescript
// server/src/common/moderation/moderation.module.ts
import { Module } from '@nestjs/common';
import { ModerationService } from './moderation.service';

@Module({
  providers: [ModerationService],
  exports: [ModerationService],
})
export class ModerationModule {}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- moderation.service.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Add env vars to `server/.env.example`**

```env
# AWS Rekognition — moderates image uploads (driver/partner documents)
# before they're saved. Without AWS_REGION set, uploads are NOT moderated
# (local dev only — main.ts refuses to start in production without this).
# IAM user should be scoped to rekognition:DetectModerationLabels only.
AWS_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
# Confidence threshold (0-100) above which a label rejects the upload.
REKOGNITION_MIN_CONFIDENCE=80
```

- [ ] **Step 7: Commit**

```bash
git add server/src/common/moderation server/.env.example server/package.json server/package-lock.json
git commit -m "feat: add AWS Rekognition image moderation service"
```

---

### Task 8: Wire moderation into driver-documents uploads

**Files:**
- Modify: `server/src/modules/driver-documents/storage.ts`
- Modify: `server/src/modules/driver-documents/driver-documents.controller.ts`
- Modify: `server/src/modules/driver-documents/driver-documents.service.ts`
- Modify: `server/src/modules/driver-documents/driver-documents.module.ts`
- Create: `server/src/modules/driver-documents/driver-documents.service.spec.ts`

**Interfaces:**
- Consumes: `ModerationService.checkImage(buffer: Buffer): Promise<ModerationResult>` (Task 7).
- Produces: `writeDriverDocumentFile(buffer: Buffer, originalName: string): string` in `storage.ts`, returning the generated filename. `DriverDocumentsService.upload` signature changes from `(driverId, type, file: Express.Multer.File)` to the same signature, but now expects `file.buffer` (memoryStorage) instead of `file.filename`/`file.path` (diskStorage).

- [ ] **Step 1: Add the write helper to `storage.ts`**

```typescript
// server/src/modules/driver-documents/storage.ts
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { join, extname } from 'path';
import { id } from '../../common/id';

export const DRIVER_DOCUMENTS_DIR = join(process.cwd(), 'uploads', 'driver-documents');

export function ensureDriverDocumentsDir(): void {
  if (!existsSync(DRIVER_DOCUMENTS_DIR)) mkdirSync(DRIVER_DOCUMENTS_DIR, { recursive: true });
}

/**
 * Writes an in-memory upload buffer to disk under a random filename and
 * returns that filename. Called only after moderation (for images) has
 * already passed — see driver-documents.service.ts's upload().
 */
export function writeDriverDocumentFile(buffer: Buffer, originalName: string): string {
  ensureDriverDocumentsDir();
  const filename = `${id('doc')}${extname(originalName).toLowerCase()}`;
  writeFileSync(join(DRIVER_DOCUMENTS_DIR, filename), buffer);
  return filename;
}

export function deleteUploadedDocumentFile(fileUrl: string): void {
  try {
    const filename = fileUrl.split('/').pop();
    if (!filename) return;
    const filePath = join(DRIVER_DOCUMENTS_DIR, filename);
    if (existsSync(filePath)) unlinkSync(filePath);
  } catch {
    // Stale file left on disk is not worth failing the request over.
  }
}
```

- [ ] **Step 2: Switch the controller to `memoryStorage`**

```typescript
// server/src/modules/driver-documents/driver-documents.controller.ts
import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { DriverDocumentsService } from './driver-documents.service';
import { DRIVER_DOCUMENT_TYPES, type DriverDocumentType } from './dto/driver-documents.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

@Controller('driver/documents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('driver')
export class DriverDocumentsController {
  constructor(private readonly documents: DriverDocumentsService) {}

  @Get('mine')
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.documents.mine(user.id);
  }

  @Post(':type')
  @UseInterceptors(
    FileInterceptor('file', {
      // memoryStorage (not diskStorage) so the buffer is available for
      // Rekognition moderation before anything is written to disk — see
      // driver-documents.service.ts's upload().
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
          cb(new BadRequestException('Only JPG, PNG, WEBP or PDF files are allowed.'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('type') type: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!(DRIVER_DOCUMENT_TYPES as readonly string[]).includes(type)) {
      throw new BadRequestException('type must be one of: citizenship, license, nid.');
    }
    if (!file) throw new BadRequestException('Attach a JPG, PNG, WEBP or PDF file to upload.');

    return this.documents.upload(user.id, type as DriverDocumentType, file);
  }
}
```

(`ensureDriverDocumentsDir`/`DRIVER_DOCUMENTS_DIR`/`id`/`extname` imports are dropped from the controller — filename generation moves into `storage.ts`'s `writeDriverDocumentFile`, called from the service.)

- [ ] **Step 3: Update the service's `upload` method to moderate + write the file**

In `driver-documents.service.ts`, add the `ModerationService` dependency and change `upload`:

```typescript
import { Inject, Injectable, UnprocessableEntityException } from '@nestjs/common';
// ...existing imports...
import { deleteUploadedDocumentFile, writeDriverDocumentFile } from './storage';
import { ModerationService } from '../../common/moderation/moderation.service';

// ...

@Injectable()
export class DriverDocumentsService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
    private readonly notifications: NotificationsService,
    private readonly moderation: ModerationService,
  ) {}

  // ...mine() unchanged...

  async upload(driverId: string, type: DriverDocumentType, file: Express.Multer.File) {
    // Rekognition doesn't moderate PDFs — only run it on actual images.
    // Fail closed: if the moderation call itself errors, reject the
    // upload rather than let an unchecked image through.
    if (file.mimetype.startsWith('image/')) {
      let result: { allowed: boolean; reasons: string[] };
      try {
        result = await this.moderation.checkImage(file.buffer);
      } catch {
        throw new UnprocessableEntityException(
          'Could not verify this image right now. Please try again in a moment.',
        );
      }
      if (!result.allowed) {
        throw new UnprocessableEntityException(
          'This image was flagged by automated content moderation and cannot be uploaded.',
        );
      }
    }

    const filename = writeDriverDocumentFile(file.buffer, file.originalname);
    const fileUrl = `/uploads/driver-documents/${filename}`;

    const [existing] = await this.db
      .select()
      .from(driverDocuments)
      .where(and(eq(driverDocuments.driverId, driverId), eq(driverDocuments.type, type)))
      .limit(1);

    let row: DocumentRow;
    if (existing) {
      deleteUploadedDocumentFile(existing.fileUrl);
      [row] = await this.db
        .update(driverDocuments)
        .set({
          fileUrl,
          fileName: file.originalname,
          mimeType: file.mimetype,
          status: 'PENDING',
          reviewNote: null,
          updatedAt: new Date(),
        })
        .where(eq(driverDocuments.id, existing.id))
        .returning();
    } else {
      [row] = await this.db
        .insert(driverDocuments)
        .values({
          id: id('doc'),
          driverId,
          type,
          fileUrl,
          fileName: file.originalname,
          mimeType: file.mimetype,
        })
        .returning();
    }

    const [driver] = await this.db.select({ name: users.name }).from(users).where(eq(users.id, driverId)).limit(1);
    await this.notifications.notify({
      type: 'system',
      title: 'Driver document awaiting review',
      message: `${driver?.name ?? 'A driver'} uploaded a ${DRIVER_DOCUMENT_LABELS[type].toLowerCase()} and needs verification.`,
      entityType: 'driver_document',
      entityId: driverId,
    });

    return this.toDto(row);
  }

  // ...rest of the class unchanged...
}
```

- [ ] **Step 4: Import `ModerationModule` in `driver-documents.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { DriverDocumentsController } from './driver-documents.controller';
import { AdminDriverDocumentsController } from './admin-driver-documents.controller';
import { DriverDocumentsService } from './driver-documents.service';
import { ModerationModule } from '../../common/moderation/moderation.module';

@Module({
  imports: [ModerationModule],
  controllers: [DriverDocumentsController, AdminDriverDocumentsController],
  providers: [DriverDocumentsService],
})
export class DriverDocumentsModule {}
```

- [ ] **Step 5: Write the failing test for the new moderation behavior**

```typescript
// server/src/modules/driver-documents/driver-documents.service.spec.ts
import { Test } from '@nestjs/testing';
import { UnprocessableEntityException } from '@nestjs/common';
import { DriverDocumentsService } from './driver-documents.service';
import { DATABASE_CONNECTION } from '../../database/database.module';
import { NotificationsService } from '../notifications/notifications.service';
import { ModerationService } from '../../common/moderation/moderation.service';

jest.mock('./storage', () => ({
  writeDriverDocumentFile: jest.fn().mockReturnValue('doc_generated123.jpg'),
  deleteUploadedDocumentFile: jest.fn(),
}));

function makeFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    buffer: Buffer.from('fake-bytes'),
    originalname: 'license.jpg',
    mimetype: 'image/jpeg',
    fieldname: 'file',
    encoding: '7bit',
    size: 10,
    stream: undefined as never,
    destination: '',
    filename: '',
    path: '',
    ...overrides,
  };
}

describe('DriverDocumentsService.upload — moderation', () => {
  let moderation: { checkImage: jest.Mock };
  let db: any;
  let service: DriverDocumentsService;

  beforeEach(async () => {
    moderation = { checkImage: jest.fn() };
    db = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([
        {
          id: 'doc_1', driverId: 'u_1', type: 'license', fileUrl: '/uploads/driver-documents/doc_generated123.jpg',
          fileName: 'license.jpg', status: 'PENDING', reviewNote: null, updatedAt: new Date(),
        },
      ]),
    };

    const module = await Test.createTestingModule({
      providers: [
        DriverDocumentsService,
        { provide: DATABASE_CONNECTION, useValue: db },
        { provide: NotificationsService, useValue: { notify: jest.fn() } },
        { provide: ModerationService, useValue: moderation },
      ],
    }).compile();
    service = module.get(DriverDocumentsService);
  });

  it('rejects the upload when moderation flags the image', async () => {
    moderation.checkImage.mockResolvedValue({ allowed: false, reasons: ['Explicit Nudity (92.3%)'] });

    await expect(service.upload('u_1', 'license', makeFile())).rejects.toThrow(UnprocessableEntityException);
  });

  it('rejects the upload when the moderation call itself fails (fail closed)', async () => {
    moderation.checkImage.mockRejectedValue(new Error('AWS unavailable'));

    await expect(service.upload('u_1', 'license', makeFile())).rejects.toThrow(UnprocessableEntityException);
  });

  it('accepts the upload when moderation allows the image', async () => {
    moderation.checkImage.mockResolvedValue({ allowed: true, reasons: [] });

    const result = await service.upload('u_1', 'license', makeFile());
    expect(result.status).toBe('PENDING');
    expect(moderation.checkImage).toHaveBeenCalledWith(Buffer.from('fake-bytes'));
  });

  it('does not call moderation for PDF uploads', async () => {
    const result = await service.upload(
      'u_1', 'license',
      makeFile({ mimetype: 'application/pdf', originalname: 'license.pdf' }),
    );
    expect(moderation.checkImage).not.toHaveBeenCalled();
    expect(result.status).toBe('PENDING');
  });
});
```

- [ ] **Step 6: Run tests to verify they fail, then pass**

Run: `npm test -- driver-documents.service.spec.ts`
Expected first: FAIL (service doesn't take a `ModerationService` yet / imports don't resolve, if Steps 1-4 weren't done first — since this plan does implementation before the test file in this task, run this after Step 4 and expect PASS directly). Run: `npm test -- driver-documents.service.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including the untouched `mine`/`adminList`/`adminVerify` code paths (no test changes needed there — behavior unchanged).

- [ ] **Step 8: Manual end-to-end verification**

With the compose stack up and `AWS_REGION` unset (local dev — moderation bypassed): upload a real file through `POST /driver/documents/license` (as an authenticated driver) and confirm `GET /driver/documents/mine` shows it as `PENDING` with a working `fileUrl`. This proves the memoryStorage→manual-disk-write path didn't break normal uploads.

- [ ] **Step 9: Commit**

```bash
git add server/src/modules/driver-documents
git commit -m "feat: moderate driver-document image uploads with Rekognition"
```

---

### Task 9: Wire moderation into partner-documents uploads

Same pattern as Task 8, applied to `partner-documents`. Full detail given because the file names, DTO types, and service internals differ slightly (partner type catalog, `deleteUploadedPartnerDocumentFile`, etc).

**Files:**
- Modify: `server/src/modules/partner-documents/storage.ts`
- Modify: `server/src/modules/partner-documents/partner-documents.controller.ts`
- Modify: `server/src/modules/partner-documents/partner-documents.service.ts`
- Modify: `server/src/modules/partner-documents/partner-documents.module.ts`
- Create: `server/src/modules/partner-documents/partner-documents.service.spec.ts`

**Interfaces:**
- Consumes: `ModerationService.checkImage(buffer: Buffer): Promise<ModerationResult>` (Task 7).
- Produces: `writePartnerDocumentFile(buffer: Buffer, originalName: string): string` in `storage.ts`.

- [ ] **Step 1: Add the write helper to `storage.ts`**

```typescript
// server/src/modules/partner-documents/storage.ts
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { join, extname } from 'path';
import { id } from '../../common/id';

export const PARTNER_DOCUMENTS_DIR = join(process.cwd(), 'uploads', 'partner-documents');

export function ensurePartnerDocumentsDir(): void {
  if (!existsSync(PARTNER_DOCUMENTS_DIR)) mkdirSync(PARTNER_DOCUMENTS_DIR, { recursive: true });
}

export function writePartnerDocumentFile(buffer: Buffer, originalName: string): string {
  ensurePartnerDocumentsDir();
  const filename = `${id('doc')}${extname(originalName).toLowerCase()}`;
  writeFileSync(join(PARTNER_DOCUMENTS_DIR, filename), buffer);
  return filename;
}

export function deleteUploadedPartnerDocumentFile(fileUrl: string): void {
  try {
    const filename = fileUrl.split('/').pop();
    if (!filename) return;
    const filePath = join(PARTNER_DOCUMENTS_DIR, filename);
    if (existsSync(filePath)) unlinkSync(filePath);
  } catch {
    // Stale file on disk isn't worth failing the request over.
  }
}
```

- [ ] **Step 2: Switch the controller to `memoryStorage`**

```typescript
// server/src/modules/partner-documents/partner-documents.controller.ts
import {
  BadRequestException, Controller, Get, Param, Post,
  UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { PartnerDocumentsService } from './partner-documents.service';
import { PARTNER_DOCUMENT_CATALOG, type PartnerType } from './dto/partner-documents.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

@Controller('partner/documents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('hotel', 'restaurant', 'grocery', 'bus_operator', 'freight')
export class PartnerDocumentsController {
  constructor(private readonly documents: PartnerDocumentsService) {}

  @Get('mine')
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.documents.mine(user.id, user.role as PartnerType);
  }

  @Post(':type')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
          cb(new BadRequestException('Only JPG, PNG, WEBP or PDF files are allowed.'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('type') type: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const partnerType = user.role as PartnerType;
    const validTypes = PARTNER_DOCUMENT_CATALOG[partnerType].map((d) => d.type);
    if (!validTypes.includes(type)) {
      throw new BadRequestException(`type must be one of: ${validTypes.join(', ')}.`);
    }
    if (!file) throw new BadRequestException('Attach a JPG, PNG, WEBP or PDF file to upload.');
    return this.documents.upload(user.id, partnerType, type, file);
  }
}
```

- [ ] **Step 3: Update the service's `upload` method**

In `partner-documents.service.ts`, add `ModerationService` and change `upload`:

```typescript
import { Inject, Injectable, UnprocessableEntityException } from '@nestjs/common';
// ...existing imports...
import { deleteUploadedPartnerDocumentFile, writePartnerDocumentFile } from './storage';
import { ModerationService } from '../../common/moderation/moderation.service';

// ...

@Injectable()
export class PartnerDocumentsService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
    private readonly notifications: NotificationsService,
    private readonly moderation: ModerationService,
  ) {}

  // ...assertRequiredDocsUploaded, mine unchanged...

  async upload(partnerId: string, partnerType: PartnerType, type: string, file: Express.Multer.File) {
    const spec = PARTNER_DOCUMENT_CATALOG[partnerType].find((d) => d.type === type)!;

    if (file.mimetype.startsWith('image/')) {
      let result: { allowed: boolean; reasons: string[] };
      try {
        result = await this.moderation.checkImage(file.buffer);
      } catch {
        throw new UnprocessableEntityException(
          'Could not verify this image right now. Please try again in a moment.',
        );
      }
      if (!result.allowed) {
        throw new UnprocessableEntityException(
          'This image was flagged by automated content moderation and cannot be uploaded.',
        );
      }
    }

    const filename = writePartnerDocumentFile(file.buffer, file.originalname);
    const fileUrl = `/uploads/partner-documents/${filename}`;

    const [existing] = await this.db
      .select().from(partnerDocuments)
      .where(and(eq(partnerDocuments.partnerId, partnerId), eq(partnerDocuments.type, type)))
      .limit(1);

    let row: DocumentRow;
    if (existing) {
      deleteUploadedPartnerDocumentFile(existing.fileUrl);
      [row] = await this.db
        .update(partnerDocuments)
        .set({ fileUrl, fileName: file.originalname, mimeType: file.mimetype, status: 'PENDING', reviewNote: null, updatedAt: new Date() })
        .where(eq(partnerDocuments.id, existing.id))
        .returning();
    } else {
      [row] = await this.db
        .insert(partnerDocuments)
        .values({ id: id('doc'), partnerId, partnerType, type, fileUrl, fileName: file.originalname, mimeType: file.mimetype })
        .returning();
    }

    const [partner] = await this.db.select({ name: users.name }).from(users).where(eq(users.id, partnerId)).limit(1);
    await this.notifications.notify({
      type: 'system',
      title: 'Partner document awaiting review',
      message: `${partner?.name ?? 'A partner'} (${PARTNER_TYPE_LABEL[partnerType]}) uploaded a ${spec.label.toLowerCase()} and needs verification.`,
      entityType: 'partner_document',
      entityId: partnerId,
    });

    return this.toDto(row);
  }

  // ...rest of the class unchanged...
}
```

- [ ] **Step 4: Import `ModerationModule` in `partner-documents.module.ts`**

Add `ModerationModule` to `imports: []`, matching Task 8 Step 4's pattern (read the current file first — it likely also declares an admin controller alongside `PartnerDocumentsController`).

- [ ] **Step 5: Write the failing test, mirroring Task 8 Step 5**

```typescript
// server/src/modules/partner-documents/partner-documents.service.spec.ts
import { Test } from '@nestjs/testing';
import { UnprocessableEntityException } from '@nestjs/common';
import { PartnerDocumentsService } from './partner-documents.service';
import { DATABASE_CONNECTION } from '../../database/database.module';
import { NotificationsService } from '../notifications/notifications.service';
import { ModerationService } from '../../common/moderation/moderation.service';

jest.mock('./storage', () => ({
  writePartnerDocumentFile: jest.fn().mockReturnValue('doc_generated456.jpg'),
  deleteUploadedPartnerDocumentFile: jest.fn(),
}));

function makeFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    buffer: Buffer.from('fake-bytes'),
    originalname: 'menu-photo.jpg',
    mimetype: 'image/jpeg',
    fieldname: 'file',
    encoding: '7bit',
    size: 10,
    stream: undefined as never,
    destination: '',
    filename: '',
    path: '',
    ...overrides,
  };
}

describe('PartnerDocumentsService.upload — moderation', () => {
  let moderation: { checkImage: jest.Mock };
  let db: any;
  let service: PartnerDocumentsService;

  beforeEach(async () => {
    moderation = { checkImage: jest.fn() };
    db = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([
        {
          id: 'doc_1', partnerId: 'u_1', partnerType: 'restaurant', type: 'business_license',
          fileUrl: '/uploads/partner-documents/doc_generated456.jpg',
          fileName: 'menu-photo.jpg', status: 'PENDING', reviewNote: null, updatedAt: new Date(),
        },
      ]),
    };

    const module = await Test.createTestingModule({
      providers: [
        PartnerDocumentsService,
        { provide: DATABASE_CONNECTION, useValue: db },
        { provide: NotificationsService, useValue: { notify: jest.fn() } },
        { provide: ModerationService, useValue: moderation },
      ],
    }).compile();
    service = module.get(PartnerDocumentsService);
  });

  it('rejects the upload when moderation flags the image', async () => {
    moderation.checkImage.mockResolvedValue({ allowed: false, reasons: ['Explicit Nudity (92.3%)'] });
    await expect(
      service.upload('u_1', 'restaurant', 'business_license', makeFile()),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('rejects the upload when the moderation call itself fails (fail closed)', async () => {
    moderation.checkImage.mockRejectedValue(new Error('AWS unavailable'));
    await expect(
      service.upload('u_1', 'restaurant', 'business_license', makeFile()),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('accepts the upload when moderation allows the image', async () => {
    moderation.checkImage.mockResolvedValue({ allowed: true, reasons: [] });
    const result = await service.upload('u_1', 'restaurant', 'business_license', makeFile());
    expect(result.status).toBe('PENDING');
  });

  it('does not call moderation for PDF uploads', async () => {
    const result = await service.upload(
      'u_1', 'restaurant', 'business_license',
      makeFile({ mimetype: 'application/pdf', originalname: 'license.pdf' }),
    );
    expect(moderation.checkImage).not.toHaveBeenCalled();
    expect(result.status).toBe('PENDING');
  });
});
```

Note: adjust `partnerType`/`type` string literals in the test to a real entry from `PARTNER_DOCUMENT_CATALOG.restaurant` — check `server/src/modules/partner-documents/dto/partner-documents.dto.ts` for the exact `type` value if `'business_license'` isn't one of them, and use whatever the real catalog defines.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- partner-documents.service.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 8: Manual end-to-end verification**

Same as Task 8 Step 8, using `POST /partner/documents/:type` as an authenticated partner (e.g. `restaurant` role).

- [ ] **Step 9: Commit**

```bash
git add server/src/modules/partner-documents
git commit -m "feat: moderate partner-document image uploads with Rekognition"
```

---

### Task 10: Sentry — server

**Files:**
- Modify: `server/src/main.ts`
- Modify: `server/src/common/filters/all-exceptions.filter.ts`
- Create: `server/src/common/filters/all-exceptions.filter.spec.ts`
- Modify: `server/.env.example`

**Interfaces:**
- Produces: `AllExceptionsFilter` now calls `Sentry.captureException(exception)` for every 5xx or non-`HttpException` error, before formatting the response (unchanged response shape/behavior otherwise).

- [ ] **Step 1: Install dependency**

```bash
cd server
npm install @sentry/nestjs @sentry/profiling-node
```

- [ ] **Step 2: Write the failing test for the filter's Sentry reporting**

```typescript
// server/src/common/filters/all-exceptions.filter.spec.ts
import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { AllExceptionsFilter } from './all-exceptions.filter';

jest.mock('@sentry/nestjs', () => ({ captureException: jest.fn() }));

function makeHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const response = { status };
  const request = { method: 'GET', url: '/test' };
  const host = {
    switchToHttp: () => ({ getResponse: () => response, getRequest: () => request }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('AllExceptionsFilter — Sentry reporting', () => {
  const filter = new AllExceptionsFilter();

  beforeEach(() => jest.clearAllMocks());

  it('reports an unknown (non-HttpException) error to Sentry', () => {
    const { host } = makeHost();
    filter.catch(new Error('boom'), host);
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error));
  });

  it('reports a 5xx HttpException to Sentry', () => {
    const { host } = makeHost();
    const err = new HttpException('server exploded', HttpStatus.INTERNAL_SERVER_ERROR);
    filter.catch(err, host);
    expect(Sentry.captureException).toHaveBeenCalledWith(err);
  });

  it('does NOT report a 4xx HttpException to Sentry (expected client errors, not bugs)', () => {
    const { host } = makeHost();
    const err = new HttpException('bad input', HttpStatus.BAD_REQUEST);
    filter.catch(err, host);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- all-exceptions.filter.spec.ts`
Expected: FAIL (filter doesn't call `Sentry.captureException` yet).

- [ ] **Step 4: Update the filter**

```typescript
// server/src/common/filters/all-exceptions.filter.ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import * as Sentry from '@sentry/nestjs';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Something went wrong. Please try again.';
    let code: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, unknown>;
        if (Array.isArray(b.message)) {
          message = b.message.join(' ');
        } else if (typeof b.message === 'string') {
          message = b.message;
        }
        if (typeof b.code === 'string') code = b.code;
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    } else {
      this.logger.error('Unknown exception thrown', JSON.stringify(exception));
    }

    // Only report real bugs, not expected 4xx client errors (bad input,
    // auth failures, etc) — those would drown out actual signal in Sentry.
    if (status >= 500) {
      Sentry.captureException(exception);
      this.logger.error(`${request.method} ${request.url} -> ${status}: ${message}`);
    }

    response.status(status).json(code ? { message, code } : { message });
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- all-exceptions.filter.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Initialize Sentry in `main.ts`**

Add near the top of `bootstrap()`, before `NestFactory.create`:

```typescript
import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

// ...inside bootstrap(), before NestFactory.create:
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  if (nodeEnv === 'production' && process.env.SENTRY_DSN_SERVER) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN_SERVER,
      environment: nodeEnv,
      integrations: [nodeProfilingIntegration()],
      tracesSampleRate: 0.1,
    });
  }
```

Also extend the existing production pre-flight check (the one that refuses to boot with weak JWT secrets) to also require Rekognition config, since Task 7's `ModerationService` fails open without it:

```typescript
  if ((config.get<string>('NODE_ENV') ?? 'development') === 'production') {
    const weak = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'SUPER_ADMIN_JWT_SECRET'].filter((key) => {
      const v = config.get<string>(key) ?? '';
      return v.length < 32 || v.startsWith('replace-with');
    });
    if (weak.length > 0) {
      throw new Error(
        `Refusing to start in production with weak/placeholder secrets: ${weak.join(', ')}. ` +
          'Generate strong values, e.g. `openssl rand -base64 48`.',
      );
    }
    if (!config.get<string>('AWS_REGION')) {
      throw new Error(
        'Refusing to start in production without AWS_REGION set — uploads would go unmoderated. ' +
          'Set AWS_REGION/AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY in server/.env.',
      );
    }
  }
```

- [ ] **Step 7: Add `SENTRY_DSN_SERVER` to `server/.env.example`**

```env
# Sentry — server-side error tracking. Only active when NODE_ENV=production
# AND this is set; local dev stays silent. Get the DSN from your Sentry
# project settings (Client Keys / DSN).
SENTRY_DSN_SERVER=
```

- [ ] **Step 8: Run the full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add server/src/main.ts server/src/common/filters server/.env.example server/package.json server/package-lock.json
git commit -m "feat: report server errors to Sentry, require AWS config in production"
```

---

### Task 11: Sentry — client

**Files:**
- Modify: `client/src/main.tsx`
- Modify: `client/.env.example`

**Interfaces:**
- Produces: Sentry initialized at app startup when `VITE_SENTRY_DSN` is set (any environment — Vite's production build is what ships to users, there's no separate server-only gate on the client side beyond the env var being unset in local `.env.local`).

- [ ] **Step 1: Install dependency**

```bash
cd client
npm install @sentry/react
```

- [ ] **Step 2: Initialize Sentry in `main.tsx`**

```typescript
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App";

import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/public-sans";
import "@fontsource-variable/jetbrains-mono";

import "./styles/globals.css";

const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
  });
}

try {
  const stored = JSON.parse(localStorage.getItem("zz_ui") ?? "{}");
  if (stored?.state?.theme === "dark") document.documentElement.classList.add("dark");
} catch {
  /* ignore */
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 3: Add `VITE_SENTRY_DSN` to `client/.env.example`**

```env
# Sentry — client-side error tracking. Baked in at build time; leave
# unset for local dev. Get the DSN from your Sentry project settings.
VITE_SENTRY_DSN=
```

- [ ] **Step 4: Verify the app still builds and runs**

Run:
```bash
cd client
npm run build
npm run test
```
Expected: build succeeds, existing test suite passes unchanged (no test depended on `main.tsx`'s exact contents).

- [ ] **Step 5: Manual verification (once a real DSN is set)**

Set `VITE_SENTRY_DSN` in `client/.env.local` to a real Sentry DSN, run `npm run dev`, temporarily throw an error from a button click handler somewhere in the app, click it, and confirm the event shows up in the Sentry project dashboard within a minute. Revert the temporary throw.

- [ ] **Step 6: Commit**

```bash
git add client/src/main.tsx client/.env.example client/package.json client/package-lock.json
git commit -m "feat: report client errors to Sentry"
```

---

### Task 12: Backblaze B2 nightly backups

**Files:**
- Create: `server/scripts/backup-prune.ts`
- Create: `server/scripts/backup-prune.spec.ts`
- Create: `server/scripts/backup.sh`
- Modify: `docker-compose.yml`
- Modify: `server/.env.example`
- Modify: `server/README.md`

**Interfaces:**
- Produces: `filesToDelete(files: { name: string; uploadedAt: Date }[], retentionDays: number, now: Date): string[]` — a pure function returning which backup filenames are older than the retention window and should be pruned. `backup.sh` calls out to a small Node one-liner using this via `tsx` for the prune step; the dump/tar/upload steps are shell (simplest for `pg_dump`/`tar`/`aws s3` piping).

- [ ] **Step 1: Write the failing test for the pure pruning logic**

```typescript
// server/scripts/backup-prune.spec.ts
import { filesToDelete } from './backup-prune';

describe('filesToDelete', () => {
  const now = new Date('2026-08-17T00:00:00Z');

  it('keeps files within the retention window', () => {
    const files = [{ name: 'backup-2026-08-16.tar.gz', uploadedAt: new Date('2026-08-16T00:00:00Z') }];
    expect(filesToDelete(files, 30, now)).toEqual([]);
  });

  it('deletes files older than the retention window', () => {
    const files = [{ name: 'backup-2026-01-01.tar.gz', uploadedAt: new Date('2026-01-01T00:00:00Z') }];
    expect(filesToDelete(files, 30, now)).toEqual(['backup-2026-01-01.tar.gz']);
  });

  it('keeps a file exactly at the retention boundary', () => {
    const boundary = new Date(now.getTime() - 30 * 86_400_000);
    const files = [{ name: 'backup-boundary.tar.gz', uploadedAt: boundary }];
    expect(filesToDelete(files, 30, now)).toEqual([]);
  });

  it('handles an empty list', () => {
    expect(filesToDelete([], 30, now)).toEqual([]);
  });

  it('only deletes the files that are actually old, from a mixed list', () => {
    const files = [
      { name: 'recent.tar.gz', uploadedAt: new Date('2026-08-10T00:00:00Z') },
      { name: 'old.tar.gz', uploadedAt: new Date('2026-01-01T00:00:00Z') },
    ];
    expect(filesToDelete(files, 30, now)).toEqual(['old.tar.gz']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- backup-prune.spec.ts`
Expected: FAIL — `Cannot find module './backup-prune'`.

- [ ] **Step 3: Write the implementation**

```typescript
// server/scripts/backup-prune.ts
export interface BackupFile {
  name: string;
  uploadedAt: Date;
}

/**
 * Returns the names of backup files older than `retentionDays`, relative
 * to `now`. Pure function — the B2 list/delete calls live in backup.sh,
 * which shells out to this via a small tsx invocation so the actual
 * "what's too old" decision is unit-tested instead of only ever exercised
 * against a real bucket.
 */
export function filesToDelete(files: BackupFile[], retentionDays: number, now: Date): string[] {
  const cutoff = now.getTime() - retentionDays * 86_400_000;
  return files.filter((f) => f.uploadedAt.getTime() < cutoff).map((f) => f.name);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- backup-prune.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Write `server/scripts/backup.sh`**

```bash
#!/bin/sh
# Nightly backup: dumps Postgres, tars the uploads volume, pushes both to
# Backblaze B2 via its S3-compatible API, then prunes anything older than
# BACKUP_RETENTION_DAYS. Runs inside the `backup` compose service, which
# has the `postgres` and `uploads_data` volumes/network available.
set -eu

DATE=$(date -u +%Y-%m-%dT%H-%M-%SZ)
DUMP_FILE="/tmp/pg-${DATE}.sql.gz"
UPLOADS_FILE="/tmp/uploads-${DATE}.tar.gz"

echo "[backup] dumping postgres..."
PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip > "$DUMP_FILE"

echo "[backup] archiving uploads..."
tar -czf "$UPLOADS_FILE" -C /app uploads

echo "[backup] uploading to B2..."
aws s3 cp "$DUMP_FILE" "s3://${B2_BUCKET}/postgres/" --endpoint-url "$B2_ENDPOINT"
aws s3 cp "$UPLOADS_FILE" "s3://${B2_BUCKET}/uploads/" --endpoint-url "$B2_ENDPOINT"

echo "[backup] pruning backups older than ${BACKUP_RETENTION_DAYS} days..."
npx tsx /app/scripts/prune-b2.ts

rm -f "$DUMP_FILE" "$UPLOADS_FILE"
echo "[backup] done."
```

Note: `aws s3` here is the standard AWS CLI pointed at B2's S3-compatible endpoint via `--endpoint-url` and credentials read from `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`-shaped env vars — B2 issues its own key pair (`B2_KEY_ID`/`B2_APPLICATION_KEY`) that the AWS CLI accepts under those same env var names, so the backup container's environment maps `AWS_ACCESS_KEY_ID=${B2_KEY_ID}` / `AWS_SECRET_ACCESS_KEY=${B2_APPLICATION_KEY}` (set in Step 6's compose service, not reused from Rekognition's real AWS credentials — these are different providers, don't conflate the two credential pairs even though the CLI env var names collide).

- [ ] **Step 6: Write the small script `filesToDelete` is driven from**

```typescript
// server/scripts/prune-b2.ts
import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { filesToDelete } from './backup-prune';

async function main() {
  const client = new S3Client({
    endpoint: process.env.B2_ENDPOINT,
    region: 'auto',
    credentials: {
      accessKeyId: process.env.B2_KEY_ID!,
      secretAccessKey: process.env.B2_APPLICATION_KEY!,
    },
  });
  const bucket = process.env.B2_BUCKET!;
  const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS ?? 30);

  for (const prefix of ['postgres/', 'uploads/']) {
    const listed = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
    const files = (listed.Contents ?? [])
      .filter((o) => o.Key && o.LastModified)
      .map((o) => ({ name: o.Key!, uploadedAt: o.LastModified! }));

    const toDelete = filesToDelete(files, retentionDays, new Date());
    for (const name of toDelete) {
      console.log(`[prune-b2] deleting ${name}`);
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: name }));
    }
  }
}

main().catch((err) => {
  console.error('[prune-b2] failed:', err);
  process.exit(1);
});
```

Install: `cd server && npm install @aws-sdk/client-s3`

- [ ] **Step 7: Add the `backup` service to `docker-compose.yml`**

```yaml
  backup:
    build:
      context: ./server
    restart: "no"
    entrypoint: ["sh", "-c"]
    command: ["while true; do sh /app/scripts/backup.sh; sleep 86400; done"]
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
      AWS_ACCESS_KEY_ID: ${B2_KEY_ID}
      AWS_SECRET_ACCESS_KEY: ${B2_APPLICATION_KEY}
      B2_KEY_ID: ${B2_KEY_ID}
      B2_APPLICATION_KEY: ${B2_APPLICATION_KEY}
      B2_BUCKET: ${B2_BUCKET}
      B2_ENDPOINT: ${B2_ENDPOINT}
      BACKUP_RETENTION_DAYS: ${BACKUP_RETENTION_DAYS:-30}
    depends_on:
      postgres:
        condition: service_healthy
    volumes:
      - uploads_data:/app/uploads:ro
    networks: [zamzam_net]
```

(A daemonized `while true; sleep 86400` loop rather than a real cron daemon — simplest thing that works in one container, no extra cron package needed. `aws-cli` needs to be present in the `server/Dockerfile` runtime image for `backup.sh`'s `aws s3` calls — add `RUN apk add --no-cache aws-cli` to the runtime stage; note the base image is `node:22-alpine`, so this is Alpine's `aws-cli` package, not the pip-installed one.)

Add `B2_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET`, `B2_ENDPOINT`, `BACKUP_RETENTION_DAYS` to the root `.env.example` (Task 1's file) with comments on where to get them (B2 dashboard → App Keys; endpoint is shown on the bucket's details page, e.g. `https://s3.us-west-004.backblazeb2.com`).

- [ ] **Step 8: Add `aws-cli` to `server/Dockerfile`'s runtime stage**

```dockerfile
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache aws-cli
COPY package*.json ./
# ...rest unchanged from Task 2
```

- [ ] **Step 9: Document restore procedure in `server/README.md`**

```markdown
## Restoring from a Backblaze B2 backup

1. Download the dump: `aws s3 cp s3://<bucket>/postgres/pg-<timestamp>.sql.gz . --endpoint-url <B2_ENDPOINT>`
2. Restore it: `gunzip -c pg-<timestamp>.sql.gz | docker compose exec -T postgres psql -U <user> -d <db>`
3. Download and extract the uploads archive similarly: `aws s3 cp s3://<bucket>/uploads/uploads-<timestamp>.tar.gz . --endpoint-url <B2_ENDPOINT> && tar -xzf uploads-<timestamp>.tar.gz`
4. Copy the extracted `uploads/` directory's contents into the running `api` container's volume, or stop the stack and place them directly in the `uploads_data` volume's mount path before restarting.
```

- [ ] **Step 10: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including the 5 new `backup-prune.spec.ts` tests.

- [ ] **Step 11: Verify the backup script end-to-end (requires B2 credentials)**

```bash
docker compose run --rm backup sh /app/scripts/backup.sh
```
Expected: script completes without error; confirm the two new objects appear under `postgres/` and `uploads/` in the B2 bucket via the B2 web dashboard. Run it a second time and confirm no error and no unexpected pruning (nothing should be over `BACKUP_RETENTION_DAYS` old yet).

- [ ] **Step 12: Commit**

```bash
git add server/scripts docker-compose.yml server/.env.example server/README.md server/Dockerfile .env.example server/package.json server/package-lock.json
git commit -m "feat: nightly Postgres + uploads backup to Backblaze B2 with retention pruning"
```

---

### Task 13: Full-stack verification on the VPS

No new files — this is the final checklist proving every prior task works together in the real deployment target, run after Task 5's one-time VPS setup and every task's `docker-compose.yml` additions have landed.

- [ ] **Step 1: Fresh deploy**

On the VPS: `git pull && docker compose up -d --build`. Expected: all 5 services (`postgres`, `redis`, `api`, `nginx`, `backup`) start; `docker compose ps` shows `postgres`/`redis` healthy and `api`/`nginx` running.

- [ ] **Step 2: HTTPS reachability**

`curl -I https://zamzam.com.np` → `200`. `curl -I https://api.zamzam.com.np/auth/me` → `401`.

- [ ] **Step 3: Database + seed**

`docker compose run --rm api npx tsx src/database/migrate.ts` then `docker compose run --rm api npx tsx src/database/seed-super-admin.ts` both succeed; log into `/x-admin/login` at `https://zamzam.com.np` with the seeded credentials.

- [ ] **Step 4: Rate limiting persists across restarts**

Repeat Task 6 Step 9's curl loop against `https://api.zamzam.com.np/auth/login`, confirm `429` after the configured limit, restart `docker compose restart api`, repeat immediately, confirm the limit is still enforced (proves Redis, not memory, is backing it).

- [ ] **Step 5: Upload moderation**

Log in as a driver, upload a normal license photo to `/driver/documents/license` — expect success. (An explicit "upload something Rekognition flags" test isn't practical/appropriate to script against production; trust Task 8/9's unit tests for the rejection path and confirm only that the happy path works end-to-end here.)

- [ ] **Step 6: Error tracking**

Temporarily add a route that throws (or trigger any known 500), confirm it appears in the Sentry dashboard within a minute, then remove the temporary route.

- [ ] **Step 7: Backup**

Confirm `docker compose logs backup` shows the loop running; manually trigger one cycle (Task 12 Step 11) and confirm a fresh object lands in the B2 bucket.

- [ ] **Step 8: Update `server/README.md`'s status note, if one exists, to reflect production is live** (optional — only if the README tracks deployment status; skip if it doesn't).

- [ ] **Step 9: Commit** (only if Step 8 produced a change)

```bash
git add server/README.md
git commit -m "docs: mark production deployment verified"
```

---

## Self-Review Notes

- **Spec coverage:** VPS/Docker Compose (Tasks 1–5), Postgres self-hosted (Tasks 1–3), Redis rate limiting (Task 6, corrected scope), Rekognition moderation (Tasks 7–9), Sentry server+client (Tasks 10–11), Backblaze B2 backups (Task 12), full verification (Task 13). Resend/email requires no code task — Task 5's deployment checklist covers the one-time domain-verification step, which is dashboard config, not code.
- **Placeholder scan:** no TBD/TODO markers; every step has literal code or literal shell commands.
- **Type consistency:** `ModerationResult { allowed, reasons }` used identically in Tasks 7, 8, 9. `writeDriverDocumentFile`/`writePartnerDocumentFile` signatures `(buffer: Buffer, originalName: string): string` match their call sites. `buildThrottlerStorage(redisUrl: string | undefined): ThrottlerStorage | undefined` matches its use in `app.module.ts`.
