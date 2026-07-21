# Zamzam Super App — Brutal Inspection & Blueprint Conformance Audit

Audit date: 2026-07-05 · Scope: full `client/` + `server/` source vs `zamzam_super_app_comprehensive_blueprint.pdf` (v1.0.4)

Verdict up front: the codebase is a **clean, well-engineered bus/hotel/food booking MVP with role-based portals** — but it implements roughly **25–30% of the blueprint**, and it shipped with **one credential leak and one exploitable financial bug**, both now addressed in this fixed copy.

---

## PART A — Critical issues found (and fixed in this copy)

### A1. 🔴 CRITICAL — Live database credentials leaked in `server/.env`
The zip contained a real Neon Postgres connection string (host + username + password) and the super-admin bootstrap password. Anyone with this zip has full read/write access to your production database and can log into `/x-admin`.

**Fixed here:** credentials replaced with placeholders; missing `server/.env.example` and `client/.env.example` (both referenced by the README) created.
**You must still do, immediately:**
1. Rotate the database password in the Neon dashboard (Settings → Reset password).
2. Change `SUPER_ADMIN_PASSWORD` and re-seed, or update the row's hash.
3. Set real random values for all three JWT secrets (`openssl rand -base64 48`) — they were still the `replace-with-…` placeholders, meaning **anyone could forge valid access, refresh, and super-admin tokens** by signing JWTs with the publicly known placeholder strings.
4. Audit the DB for data you didn't create.

### A2. 🔴 CRITICAL — Infinite-money exploit (book → cancel → free wallet balance)
Across **all three verticals** (bus, hotel, food):
- Booking **never debited anything** — no wallet check, no gateway call; a transaction row was merely recorded.
- Cancelling **credited the full grand total to the wallet**, unconditionally.

So: book any ticket with method "cash", cancel it, and the wallet gains the full amount. Repeat forever. Balance is pure fabrication.

**Fixed here (server + client):**
- New `wallet` payment method. Paying by wallet performs an **atomic conditional debit** (`UPDATE … WHERE available >= amount`) inside the same DB transaction as the booking — insufficient balance returns 402, and concurrent bookings can't double-spend.
- Refunds credit the wallet **only if the booking was paid from the wallet**. External-method cancellations now record a `REFUND` transaction with status `PENDING` ("returned to your original payment method") and never touch the balance.
- Same policy applied to the operator-cancels-departure mass-refund path.
- Client checkout UIs now offer "Zamzam Wallet"; cancel toasts updated to match the real policy.
- Shared logic centralized in `server/src/common/wallet.util.ts`.

### A3. 🟠 HIGH — Bus seat inventory could be corrupted
`POST /buses/:tripId/book` accepted **any string** as a seat: seats not on the bus ("ZZ999"), unlimited quantities, duplicates in one request (double-charging), and mixed-case duplicates of the same seat.

**Fixed here:** DTO now enforces the real seat-label format (`1A`–`99D`, matching the client's `generateSeats`), max 6 seats per booking; the service normalizes case, de-duplicates, and validates each seat's row against the trip's `totalRows`.

### A4. 🟠 HIGH — Raw SQL string interpolation in the seat-clash guard
The atomic booking guard built a Postgres `ARRAY[...]` by string-concatenating user seat values into `sql.raw()`. Single quotes were escaped, so it wasn't directly injectable today — but it's one refactor away from being so, and it's the only place in the codebase that bypassed parameterization.

**Fixed here:** rewritten with `sql.join` so every seat value is a bound parameter.

### A5. 🟠 HIGH — Mobile numbers were not unique
The blueprint (§4.1.1) defines mobile as a primary unique registration field. The schema only enforced unique email — unlimited accounts could share one phone number (a multi-account fraud vector the blueprint's own AI section says you must detect).

**Fixed here:** unique index added to the schema, migration generated (`drizzle/0007_….sql` — run `npm run db:migrate`; deduplicate any existing duplicate mobiles first or the migration will fail), plus an application-level duplicate check in `register()` for a clean 409 message.

### A6. 🟠 HIGH — Server would happily boot in production with placeholder JWT secrets
**Fixed here:** `main.ts` now refuses to start when `NODE_ENV=production` and any JWT secret is missing, shorter than 32 chars, or still a `replace-with-…` placeholder.

### A7. 🟡 Noted, not changed (design decisions for you)
- **Tokens in `localStorage`** (`zz_token`, `zz_refresh_token`): vulnerable to exfiltration if any XSS ever lands. Industry-acceptable for an MVP, but httpOnly cookies for the refresh token would be stronger.
- **bcryptjs** (pure-JS, cost 10) instead of the blueprint's **Argon2id**; fine for now, upgrade path recommended.
- **No OTP / phone verification** — blueprint mandates phone/OTP registration; current flow is email+password with the mobile field unverified.
- `forbidNonWhitelisted: false` in the global ValidationPipe silently strips unknown fields rather than rejecting them.
- Booking `method` values eSewa/Khalti/card are **labels only** — there is no gateway integration, so "payments" for those methods are fictional records.
- The audit-logs table exists but only the super-admin module writes to it; admin/operator/partner privileged actions aren't audited.
- No automated tests at all (`npm test` is a stub) — for a system moving money, this is the single biggest process risk.

---

## PART B — Blueprint conformance matrix

| Blueprint requirement | Status in code | Notes |
|---|---|---|
| One Identity (SSO) across verticals | ✅ Partial | Single `users` table + JWT works across all modules; no OTP/biometric, no true SSO protocol |
| One Digital Wallet | ⚠️ Now functional | Was display-only + exploitable; now debits/refunds correctly. Still missing: top-up via gateway, escrow usage (column exists, never used), driver payouts, dual-entry ledger |
| One AI Assistant / AI Brain | ❌ Missing | `/app/assistant` is a scaffold page; no model endpoints, no fraud scoring, no dynamic allocation |
| One Unified Admin | ✅ Partial | Super-admin console with approvals/users/partners/revenue is real; heatmap, AI/fraud, ledger, audit, CMS, roles, reports are all scaffold pages |
| Taxi/Bike ride-hailing (matching, GPS, surge, chat) | ❌ Missing | `POST /rides` returns `{ok:true}` stub; booking panel is presentational only; only ride *history* reads work |
| Intercity bus platform | ✅ Implemented | Search, seat map, atomic booking, cancellation, operator fleet/schedules/trips, cron for past trips — the strongest vertical |
| Hotels | ✅ Implemented | Listings, availability-aware booking, reviews, partner management |
| Food/restaurants | ✅ Implemented | Menus, orders, order lifecycle, reviews, partner management |
| Freight/B2B load marketplace | ❌ Stub | Controller returns hardcoded zeros; no loads/bids/shipments tables |
| Grocery, pharmacy, tours, guides, activities | ❌ Absent | No code at all |
| Payment gateways (eSewa, Khalti, bank APIs) | ❌ Absent | Method names only, no integration |
| Escrow hold/release lifecycle | ❌ Absent | `escrow` column exists, never written |
| Commissions: 12% mobility / 8% bus / 10% freight | ❌ Deviates | Flat 2% `SERVICE_FEE_RATE` in all three services; fee is charged to the customer, not deducted from the partner |
| Microservices + API Gateway + Kafka | ❌ Deviates | Single NestJS modular monolith. (Honestly the right call for this team size/timeline — but it contradicts the PRD; either update the PRD or the architecture) |
| PostgreSQL + PostGIS + Redis | ⚠️ Partial | Neon Postgres yes; no PostGIS (no geometry anywhere — locations are text labels), no Redis |
| Flutter mobile apps | ❌ Deviates | React 19 + Vite web app only |
| Schema per §4.1 (UUID PKs, GEOMETRY points, Argon2id, driver license/rating tables) | ❌ Deviates | nanoid varchar(32) IDs, no spatial columns, bcrypt, no drivers-detail table (only an online flag), ride states reduced to 3 |
| WebSockets / real-time telemetry | ❌ Absent | No socket layer anywhere |
| Load testing, pen testing, store submission (Sprint 5) | ❌ Absent | No test suite of any kind |

**Bottom line vs the 60–75-day plan:** Sprints 1–2 are ~70% done (auth, DB core, a working ledger now), Sprint 3 (mobility — the flagship vertical) is ~5% done, Sprint 4 (AI + full admin) ~20%, Sprint 5 0%. The three verticals that *are* built are genuinely production-quality in structure; the gap is breadth, not craftsmanship.

---

## PART C — What was verified to be good
- Clean NestJS module layout, consistent DTO validation with class-validator, global rate limiting, helmet, strict CORS allow-list, graceful shutdown hooks.
- Atomic seat-booking race protection (correct instinct; now also parameterized and layout-validated).
- Proper separation of super-admin auth domain (own secret, own token `type`, own client store — a forged user token cannot pass it).
- Refresh-token rotation with hashed storage and single-flight client refresh logic.
- Both `tsc` typecheck (server) and full production build (client) pass after all fixes.

## PART D — Prioritized next steps
1. **Today:** rotate Neon password + super-admin password + set real JWT secrets (A1).
2. **This week:** run `npm run db:migrate` (applies the unique-mobile index), add wallet top-up via a real eSewa/Khalti sandbox integration so the wallet path is end-to-end.
3. **Next:** decide monolith-vs-microservices honestly and update the PRD; add a test suite starting with the money paths (booking, cancel, concurrent double-spend); implement the escrow hold/release lifecycle and partner settlement/payout.
4. **Then:** the ride-hailing vertical (the blueprint's core), WebSockets, and PostGIS for real geolocation.

## Files changed in this fixed copy
- `server/src/common/wallet.util.ts` (new)
- `server/src/modules/buses/{buses.service.ts, dto/buses.dto.ts}`
- `server/src/modules/hotel/{hotel.service.ts, dto/hotel.dto.ts}`
- `server/src/modules/restaurant/{restaurant.service.ts, dto/restaurant.dto.ts}`
- `server/src/modules/auth/auth.service.ts`
- `server/src/database/schema.ts` + `server/drizzle/0007_*.sql` (new migration)
- `server/src/main.ts`
- `server/.env` (sanitized), `server/.env.example` (new), `client/.env.example` (new)
- `client/src/features/buses/types.ts`, `client/src/features/{hotels/HotelDetailPage.tsx, restaurants/RestaurantDetailPage.tsx}`, cancel toasts in the three bookings pages
