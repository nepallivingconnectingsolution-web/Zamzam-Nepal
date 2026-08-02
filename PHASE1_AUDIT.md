# Zamzam Super App — Phase 1 Gap Analysis (2026-07-28)

Scope: `server/` (NestJS + Drizzle + Neon Postgres, ~13.5k LOC / 91 files) and `client/` (React 19 + Vite, ~22k LOC / 132 files). Builds on the prior `AUDIT_REPORT.md` (2026-07-05) — this pass verifies those fixes against current code and adds everything found since.

**Already actioned during this pass** (see git commit `5d00b09` on `chore/qa-foundation-phase1`):
- Wallet top-up no longer credits balance on an unverified request — now PENDING until a super-admin confirms it (generalizes the existing refund-resolution flow).
- Removed the real Neon connection string that was still sitting in `server/.env.example`.

---

## Verified: prior audit's fixes that actually hold up

| Finding | Status |
|---|---|
| A2 — book→cancel wallet exploit | ✅ Fixed. `wallet.util.ts` debit/credit helpers applied consistently across buses/hotel/restaurant/grocery/rides. |
| A3 — bus seat DTO validation | ✅ Fixed. Regex + row-range + max-6 check in `buses.service.ts`. |
| A4 — raw SQL in seat-clash guard | ✅ Fixed. Uses `sql.join` with bound params. |
| A5 — mobile uniqueness | ✅ Fixed. DB unique index + app-level 409 check. |
| A6 — weak-secret prod guard | ✅ Fixed. `main.ts` fails fast on short/placeholder JWT secrets when `NODE_ENV=production`. |
| A1 — leaked DB credential | ⚠️ Partially fixed. Live credential **confirmed rotated** by the user (2026-07-28); the old value is still recoverable from git history — see Critical #1 below. |
| "Refresh-token rotation… single-flight refresh" (Part C) | ❌ Overstated. No rotation actually happens on refresh — see High #4. |

---

## CRITICAL

### 1. Leaked DB credential is permanently in git history on a public remote path
`git log --all -p -- server/.env.example` shows the exact previously-leaked Neon connection string committed in the initial commit, on a repo with remote `github.com/SonuMandal1/Zamzam-Super-App`. The password itself has been rotated (confirmed), so there's no longer an active compromise — but the dead credential, and the *pattern* it reveals (username, host, project shape), remains permanently visible to anyone with read access to the repo history.
**Recommendation:** when convenient, purge it with `git filter-repo` (or BFG) and force-push, coordinated with anyone else who has a clone. Not urgent now that rotation is confirmed — treat as scheduled hygiene, not an incident.

### 2. Wallet top-up minted free balance — **FIXED this session** (see commit `5d00b09`)
`POST /wallet/topup` credited real spendable balance with zero payment verification. Now PENDING until super-admin confirmation. Left in this report for the record.

---

## HIGH

### 3. Hotel room booking has a real double-booking race condition
`server/src/modules/hotel/hotel.service.ts:168-274` — `book()` does `SELECT overlappingBookedCount()` then `INSERT` inside a plain transaction at Postgres's default READ COMMITTED isolation. No `SELECT ... FOR UPDATE`, no exclusion constraint, no atomic conditional update (unlike bus seats and grocery stock, which both do this correctly elsewhere in the same codebase). Two concurrent bookings for `roomCount=1` against a `totalRooms=1` room type, submitted within milliseconds, can both pass the capacity check and both commit — the hotel ends up with two confirmed guests for one room.
**Fix shape:** same pattern already used for bus seats/grocery stock — either an atomic conditional `UPDATE` on a per-room-type counter, or `SELECT ... FOR UPDATE` on the room-type row before counting overlaps.

### 4. No session/refresh-token revocation exists anywhere
The schema has full per-session refresh-token infrastructure (`refreshTokens` table, hashed tokens, `jti`), but there is no `/auth/logout` endpoint and `refresh()` never rotates or deletes the row. A stolen refresh token (default 30-day life) stays valid for its full lifetime with no way for the user or an admin to kill that one session.
**Fix shape:** add a logout endpoint that deletes the refresh-token row by `jti`; rotate (delete old, issue+store new) on every `/auth/refresh` call.

### 5. Driver-document upload: spoofable MIME + attacker-controlled extension → stored XSS
`server/src/modules/driver-documents/driver-documents.controller.ts:45-64` — `fileFilter` trusts the client-supplied `mimetype` header (not content-sniffed), and the stored filename's extension comes from the also-attacker-controlled `originalname`, independent of the mimetype check. A file sent as `originalname: "x.svg"` with `Content-Type: image/png` passes the filter but is written and served as `.svg` from `/uploads/...` with `crossOriginResourcePolicy: 'cross-origin'` — a stored-content/XSS vector reachable by any authenticated driver.
**Fix shape:** derive the stored extension from the verified mimetype (never from `originalname`), and/or sniff magic bytes; disallow SVG/HTML entirely for this upload class.

### 6. Silent unlimited-lifetime JWTs if an expiry env var is ever unset
`auth.service.ts:62-99` passes `config.get('JWT_ACCESS_EXPIRES_IN')` straight into `jwt.signAsync`. If that key is missing, `ConfigService.get()` returns `undefined`, and `jsonwebtoken` silently omits `exp` — a token that never expires, with no error or log. `main.ts`'s production fail-fast only checks the three *secret* values, not the three expiry values.
**Fix shape:** extend the existing `main.ts` boot-time guard to also require the three `*_EXPIRES_IN` vars to be set.

---

## MEDIUM

### 7. Unbounded partner-facing queries (missing pagination)
`buses.service.ts` (`operatorBookings`, `operatorMetrics`, `operatorRevenue`), `hotel.service.ts` (`partnerBookings` and its callers), `restaurant.service.ts` (`partnerOrders`), `grocery.service.ts` (`partnerOrders`) all run unbounded `SELECT *` for a partner's full history. Other places in the same codebase (`wallet.transactions`, `freight.openLoads`) already cap with `.limit()` — the pattern exists, just isn't applied everywhere.

### 8. Super-admin `resolveRefund`/`resolveTransaction` outcome lacked DTO validation
Was a bare `@Body('outcome') outcome: 'SUCCESS'|'FAILED'` with only a TS annotation (no runtime check) — **fixed as part of this session's wallet patch**, which added `ResolveTransactionDto` with `class-validator`.

### 9. Money-moving admin action wasn't audit-logged
`resolveRefund` never called the shared `audit()` helper, unlike sibling privileged actions — **fixed as part of this session's wallet patch** (now calls `audit()` for both REFUND and TOPUP resolutions).

### 10. Duplicate route decorator on a privileged endpoint
`super-admin.controller.ts` had `@Patch('users/:id/kyc')` pasted twice on `decideKyc`. Likely harmless (first registration wins) but signals this endpoint path hasn't been reviewed recently. Not yet fixed — candidate for the Phase 3 cleanup pass alongside lint/dead-code tooling.

### 11. In-memory rate limiting won't survive horizontal scaling
`ThrottlerGuard` has no shared store (Redis) configured — every `@Throttle()` limit, including the top-up cap, is per-process. Not urgent at current scale; flag before adding a second server instance.

### 12. Zero code-splitting; two full charting libraries loaded eagerly
`client/src/routes/index.tsx` statically imports every route for every portal — no `React.lazy`/`Suspense` anywhere. A first-time visitor to the public landing page downloads the JS for every role's dashboard, plus both `recharts` and `react-apexcharts` (used for overlapping purposes) and Leaflet, before ever logging in.

### 13. Cross-account data leak via assistant chat, not cleared on sign-out
`auth.store.ts`'s `signOut()` only clears the auth tokens; the AI-assistant chat transcript (`sessionStorage["zz_assistant_chat"]`) persists independently and can leak one user's wallet balance/ride details to the next person who logs in on the same tab/device.

### 14. Search-as-you-type with no debounce (4 super-admin pages) + duplicate polling (2 customer order pages)
`SuperAdminUsers/Transactions/Audit/Partners.tsx` fire one request per keystroke. `FoodOrdersPage.tsx` / `GroceryOrdersPage.tsx` each run two independent 15s polling intervals against the same endpoint (their own `setInterval` *and* `useResource`'s built-in one), roughly doubling request volume on those screens.

### 15. Dropdown/menu components have no keyboard escape path or focus management
`NotificationBell.tsx` (both layout and super-admin variants), the profile dropdown in `portal-layout.tsx`, and the wallet `TopUpDialog` all close only on outside-click — no Escape handling, no focus trap/return, missing `aria-expanded`/`role="menu"`. A keyboard-only user can open these but not close them without tabbing through every item.

---

## LOW

- **TOCTOU on uniqueness pre-checks** (`auth.service.ts` register, `vehicles.service.ts`) — a genuine concurrent duplicate submission surfaces as a raw 500 instead of a clean 409.
- **No Dockerfile / containerization** anywhere in the repo.
- **`npm test` is a no-op stub** on the server; client has no test runner configured at all — this is what Phase 2 (next) addresses.
- **`RegisterBusDto.totalRows` has no lower bound** — an operator can self-brick their own bus with `totalRows: 0`. No cross-tenant impact.
- **Dead `admin` role** — `AdminController` is gated behind a role no registration path can ever assign.
- **Access token duplicated across two storage locations that can silently diverge** (`sessionStorage["zz_token"]` vs. the zustand-persisted `zz_auth` blob) — not currently exploited (nothing reads the store copy), but a live trap for the next feature that trusts it.
- **Production build silently falls back to `localhost:4000`** if `VITE_API_URL` is unset, instead of failing loudly.
- **Weak password policy** — length ≥ 8 only, no complexity requirement, on an account that holds a real wallet balance.
- **Client-side passenger validation on bus checkout is superficial** (age > 0 with no upper bound, no email format check) — server is presumably authoritative, so cosmetic only.

---

## What's already solid (verified, not just claimed)
- Clean NestJS module layout, consistent `class-validator` DTOs, global rate limiting, helmet, strict CORS allow-list, graceful shutdown.
- Atomic seat-booking and grocery-stock race protection (correct pattern — just not yet applied to hotel bookings, see High #3).
- `useResource.ts` (client) correctly guards against out-of-order async responses via a monotonic request-ID ref — eliminates the classic "stale response overwrites fresh state" bug across every screen that uses it.
- No `dangerouslySetInnerHTML`, `innerHTML`, `eval`, or open-redirect surface found anywhere in the client.
- Booking/payment/top-up submit buttons are consistently disabled while in flight — no double-submit paths found.
- `RequireRole.tsx` is correctly treated as defense-in-depth only; the server's `RolesGuard` is the real authority.

---

## Next: Phase 2 (this session, continuing)
Per agreed sequencing — test infrastructure and CI now, before working through the remaining Medium/Low items above. Coverage will prioritize the money/auth paths (wallet, booking, auth) rather than chasing 95% uniformly, per your direction.
