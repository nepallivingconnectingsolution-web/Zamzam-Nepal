# Zamzam Super App

Nepal's mobility, logistics, tourism, commerce & services ecosystem.

```
zamzam-super-app/
├── client/   # React 19 + Vite frontend
└── server/   # NestJS + Drizzle ORM + Neon Postgres backend
```

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

## Accounts

There are no seeded demo accounts. Register a customer or partner account
through the app's normal sign-up flow at `/register`. Partner accounts
(driver, bus operator, freight, hotel) require super-admin approval before
they can sign in — see the Approvals screen in the super-admin console.

**Super-admin console:** `/x-admin/login`. Credentials are whatever you set
in `server/.env` (`SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD`) before
running `npm run db:seed:superadmin` — there is no default password shipped
in this repo.

Full documentation lives in `client/README.md`, `client/ARCHITECTURE.md`,
and `server/README.md`.

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
