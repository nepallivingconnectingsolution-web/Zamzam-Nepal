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
