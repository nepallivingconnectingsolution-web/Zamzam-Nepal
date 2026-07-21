# Zamzam Super App

Nepal's mobility, logistics, tourism, commerce & services ecosystem.

```
zamzam-super-app/
├── client/   # React 19 + Vite frontend
└── server/   # NestJS + Drizzle ORM + Neon Postgres backend
```

## Quick start

**1. Backend** (see `server/README.md` for full detail):

```bash
cd server
npm install
cp .env.example .env       # fill in DATABASE_URL, JWT secrets, super-admin creds
npm run db:migrate
npm run db:seed:superadmin
npm run start:dev          # http://localhost:4000
```

**2. Frontend:**

```bash
cd client
npm install
cp .env.example .env.local  # VITE_API_URL defaults to http://localhost:4000
npm run dev                 # http://localhost:5173
npm run build                # type-check + production build
```

Both must be running for the app to work — there is no mock data layer
anymore; every screen is backed by the real API in `server/`.

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
