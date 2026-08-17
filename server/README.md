# Zamzam server

Production backend for the Zamzam Super App — NestJS, Drizzle ORM, Neon
(serverless Postgres), JWT auth.

> For the full self-hosted production setup (Docker Compose, Postgres/Redis, Nginx/TLS, backups), see the repo root `README.md` and `docs/superpowers/specs/2026-08-17-production-infrastructure-design.md`.

## Stack

- **NestJS 10** — modules, guards, pipes, DI
- **Drizzle ORM** + **Neon Postgres** — schema in `src/database/schema.ts`
- **JWT** (`@nestjs/jwt` + `passport-jwt`) — access/refresh tokens for
  regular users, a completely separate token domain for super admin
- **bcryptjs** — password hashing
- **@nestjs/schedule** — cron-based bus trip generation
- **@nestjs/throttler** + **helmet** — rate limiting and security headers

## Getting started

```bash
npm install
cp .env.example .env
# fill in DATABASE_URL (from your Neon project), JWT secrets, and the
# super-admin bootstrap credentials in .env

npm run db:generate      # only needed if you change schema.ts
npm run db:migrate       # applies drizzle/ migrations to your database
npm run db:seed:superadmin   # creates/updates the one super-admin account

npm run start:dev        # http://localhost:4000
```

The frontend (`../client`) expects this server at `VITE_API_URL`
(`../client/.env.example`, defaults to `http://localhost:4000`).

## Restoring from a Backblaze B2 backup

1. Download the dump: `aws s3 cp s3://<bucket>/postgres/pg-<timestamp>.sql.gz . --endpoint-url <B2_ENDPOINT>`
2. Restore it: `gunzip -c pg-<timestamp>.sql.gz | docker compose exec -T postgres psql -U <user> -d <db>`
3. Download and extract the uploads archive similarly: `aws s3 cp s3://<bucket>/uploads/uploads-<timestamp>.tar.gz . --endpoint-url <B2_ENDPOINT> && tar -xzf uploads-<timestamp>.tar.gz`
4. Copy the extracted `uploads/` directory's contents into the running `api` container's volume, or stop the stack and place them directly in the `uploads_data` volume's mount path before restarting.

## Architecture notes

**Two separate auth domains.** Regular users (customer, driver, bus_operator,
freight, hotel, admin) authenticate via `/auth/*` with JWTs signed by
`JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`. Super admin is a completely
separate table (`super_admins`), a separate passport strategy
(`super-admin-jwt`), and a separate secret (`SUPER_ADMIN_JWT_SECRET`) — a
forged or leaked regular-user token can never pass as a super-admin token,
and there is no public registration route for the super-admin account by
design. See `src/database/seed-super-admin.ts`.

**Real domains vs. honest stubs.** Auth, profiles, wallet, and the full bus
booking system (search, atomic seat-locking, operator fleet/schedule/trip
management, cron-based trip generation) are fully implemented against real
tables. Freight (load matching) and hotel (room inventory) have no domain
tables yet — their `/freight/metrics` and `/hotel/metrics` routes
deliberately return real zeros rather than fabricated numbers, so the
frontend's dashboards show their correct empty state. Build out
`freight.service.ts` / `hotel.service.ts` with real tables when those
modules are scoped. The same is true for live ride-hailing matching
(`/driver/requests`, `/rides`) — no real-time matching engine exists yet.

**Atomic seat booking.** `BusesService.book()` uses a single SQL `UPDATE …
WHERE NOT (booked_seats ?| requested_seats)` inside a transaction, so two
concurrent booking requests for overlapping seats can never both succeed —
the loser gets a clean 409, not a corrupted seat map.

**Connection pool.** Capped at `max: 10` (see `database.module.ts`) and
closed via a real `OnModuleDestroy` hook on shutdown — this is the direct,
permanent fix for the uncapped-pool / missing-shutdown-hook heap-out-of-memory
issue from this project's history.

**Cron registration.** `BusesCronService.regenerateAllTrips` only actually
fires because `ScheduleModule.forRoot()` is imported in `app.module.ts`.
Forgetting that single import is exactly how the earlier `regenerateAllTrips`
cron silently never ran — it's called out in a comment on both files as a
reminder.

## Project layout

```
src/
├── main.ts                  # bootstrap: helmet, CORS, validation, shutdown hooks
├── app.module.ts             # wires every feature module
├── database/
│   ├── schema.ts             # Drizzle schema — single source of truth
│   ├── database.module.ts    # pooled connection + graceful shutdown
│   ├── migrate.ts            # `npm run db:migrate`
│   └── seed-super-admin.ts   # `npm run db:seed:superadmin`
├── common/                   # exception filter, guards, decorators, id helper
└── modules/
    ├── auth/                 # register/login/refresh/me (regular users)
    ├── profile/               # customer + business profile completion
    ├── wallet/                # balance + transaction history
    ├── rides/                 # ride history (matching engine not built yet)
    ├── buses/                 # search, booking, fleet, schedules, trips, cron
    ├── driver/                # earnings, status, requests
    ├── operator/              # bus-operator KPI dashboard
    ├── freight/                # honest-zero metrics stub
    ├── hotel/                  # honest-zero metrics stub
    ├── admin/                  # platform-wide oversight (regular admin role)
    └── super-admin/            # separate auth domain, KYC approval, audit log
```

## Testing

`test/smoke.ts` boots the real `AppModule` (database calls stubbed out) and
verifies validation, guards, and the exception filter behave correctly
end-to-end. Run it compiled (not via `tsx`, which has known gaps in
decorator-metadata emission that NestJS's DI relies on):

```bash
npx tsc -p tsconfig.json --outDir dist-test --rootDir . test/smoke.ts src/**/*.ts
node dist-test/test/smoke.js
```
