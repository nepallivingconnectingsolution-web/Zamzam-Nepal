# App home screen + super-admin login routing

**Date:** 2026-08-11
**Status:** Approved

## Problem

Two unrelated complaints, one session.

1. **`/` reads as a website, not an app.** The signed-out root renders `LandingPage`: a
   full marketing page (fixed full-bleed navbar → hero → services → AI → partners →
   app showcase → investors → contact → footer). Its hero leads with an eyebrow
   ("Live in the Kathmandu Valley"), a headline ("Nepal's whole day, / in one app."),
   and a paragraph of pitch copy, then two centered CTA pills, and only *then* the
   service picker. On a phone the first screenful is marketing prose and buttons; the
   thing a user actually came to do is below the fold.

2. **Super-admin credentials do not work in the normal login form.** Super admin is a
   separate table (`super_admins`), a separate JWT secret (`SUPER_ADMIN_JWT_SECRET`),
   a separate store (`useSuperAdminStore`), and a separate endpoint
   (`POST /super-admin/auth/login`) behind a hidden route (`/x-admin/login`). Typing
   admin credentials into `/login` returns "Invalid email or password."

## Non-goals

- Redesigning any signed-in screen. `MarketplaceHome` and the portals are untouched.
- Removing the marketing site. It survives at `/about` for investor and partner links.
- Changing the security model. `SuperAdminGuard` and the separate JWT secret remain
  the boundary; this work only changes which door you may knock on.

## Part 1 — `/` becomes an app home screen

### Approach

The codebase already solved "app, not website" for signed-in screens and never applied
it to the signed-out one. The fix is to speak the existing language rather than invent
a new one:

- `AppFrame` — the phone shell every in-app screen renders inside. On desktop it centers
  the app at a real phone width instead of stranding a content column in a wide page.
- The teal-700 hero band with `<TerrainLine variant="hero" animate />`, as used by
  `MarketplaceHome`.
- Design tokens `text-display` / `text-h1` / `text-body` / `text-caption`, `bg-surface-2`
  icon pucks, `rounded-2xl` cards.
- The one-accent rule `MarketplaceHome` documents: a screen spends its single amber
  element once. Here that is the primary CTA.

### New file: `client/src/features/home/AppHome.tsx`

Rendered inside `<AppFrame>`, top to bottom:

1. **In-frame app bar.** Logo · `ThemeToggle` · `Sign in`. It does *not* use
   `PublicNavbar`, which is `fixed inset-x-0` and therefore escapes the phone frame —
   that full-bleed nav is the single strongest "this is a website" signal on the page.

2. **Teal hero band.** `bg-teal-700` + `TerrainLine`, white text, edge-to-edge within
   the frame. Contains a live-dot location chip reading **Kathmandu Valley** and one
   prompt line: *"Where are you going today?"*. This is app UI copy — a prompt — not a
   pitch. The eyebrow, headline, and paragraph are gone.

3. **Service picker card.** Pulled up over the band with a negative top margin so it
   reads as a sheet resting on the hero, occupying exactly the space the deleted
   headline used to. A 3-column grid of all nine `SERVICES` from `@/config`, using the
   existing icon-puck + label tile. Tap behaviour is preserved from the old hero:
   signed-in customer → `service.to`; everyone else → `/login` with
   `state: { from: service.to }`, so the tap survives sign-in.

4. **Two CTAs, directly below the card.** `Explore the marketplace →` (accent) and
   `Partner with Zamzam` (outline, navigates to `/register` with
   `state: { intent: "partner" }` — sign-**up**, since whoever taps it has no account).
   Both full-width and stacked, the way app buttons sit, rather than centered pills.

5. **Trust strip + one link.** Three compact rows — one wallet, verified partners, live
   tracking — then a quiet `About Zamzam` text link to `/about`. Nothing else: no AI
   section, no partners, no app showcase, no investors, no contact form, no footer.

### Deletions and rewiring

- **Delete** `client/src/features/marketing/sections/hero.tsx`. The offending copy
  exists nowhere else, so deleting the file removes it from the product entirely. Its
  service-tile click logic moves into `AppHome`.
- `LandingPage` drops its `<Hero />` and leads with `<ServicesSection />`. It still
  renders at `/about`.
- `RootEntry` in `client/src/routes/index.tsx` returns `<AppHome />` for signed-out
  users on **both** web and native. Native previously jumped straight to `/login`;
  service-first is better there too, because the `from` state already carries the tap
  through sign-in. Signed-in users still redirect to `ROLE_HOME[user.role]`.
- `AppHome` is lazy-loaded like every other routed page.

## Part 2 — Super-admin credentials in the normal login form

Two layers, deliberately. The server change is the clean contract; the client fallback
is what makes the feature work against the **currently deployed** API, since the Vercel
client and the NestJS server deploy independently.

### Server: `server/src/modules/auth/auth.service.ts`

In `login()`, before the `users` lookup:

- Select from `superAdmins` by email; if found and `bcrypt.compare` passes, sign the
  super-admin JWT with payload `{ sub: admin.id, type: 'super_admin_access' }` using
  `SUPER_ADMIN_JWT_SECRET` / `SUPER_ADMIN_JWT_EXPIRES_IN`, write the same
  `super_admin.login` audit row the dedicated endpoint writes, and return
  `{ superAdmin: true, accessToken, admin: { id, name, email } }`.
- A super-admin row match with a **wrong** password falls through to the normal user
  lookup and ends in the standard invalid-credentials error. It must not short-circuit
  to a distinguishable message.
- Implemented inline using the already-injected `db`, `jwt`, and `config`. It does not
  import `SuperAdminModule` — `SuperAdminService` depends on other modules and importing
  it here risks a circular dependency for a twenty-line check.
- No refresh token is issued. Super-admin sessions are `sessionStorage`-scoped and
  short-lived by design; the dedicated endpoint issues no refresh token either.

### Client: `client/src/features/auth/LoginPage.tsx`

1. `LoginResponse` gains optional `superAdmin?: true` and `admin?: { id, name, email }`.
2. On success, if `res.superAdmin` → `useSuperAdminStore.getState().setSession(...)` →
   `navigate("/x-admin")`.
3. In `catch`, when the failure is invalid credentials (i.e. **not** `PENDING_APPROVAL`
   and **not** `SUSPENDED`), retry once against `POST /super-admin/auth/login` with the
   same email and password. On success, set the super-admin session and navigate to
   `/x-admin`.
4. If that retry also fails, show the original error text — `"Invalid email or
   password."`. The existence of a super-admin endpoint is never revealed, and the
   message must not differ between "no such user" and "not an admin either".

`/x-admin/login` remains routed as a direct entry point.

### Cost

A super admin signing in against an old server pays one extra round trip. A normal user
with a wrong password also pays one extra round trip. Both are acceptable; the fallback
only fires on an already-failed login.

## Verification

Done, with results:

- `npm run build` in `client/` (`tsc -b && vite build`) — passes.
- `tsc --noEmit` in `server/` — passes.
- Rendered `/` at 412×915 (light and dark) and 1440×900, plus `/about`, via Playwright
  against the production build: no console errors, no page errors on any view.
- `server/test/integration/auth-superadmin-login.integration.spec.ts` — 6/6 passing
  against a real in-process Postgres. Covers: admin credentials return an admin
  session; the token verifies under `SUPER_ADMIN_JWT_SECRET` with
  `type: 'super_admin_access'` (so the existing guard accepts it); no refresh token is
  issued; the `super_admin.login` audit row is written; a super-admin email with a
  wrong password returns the generic error; normal user login is unchanged.

## Pre-existing bug found, not fixed

**A fresh database cannot be migrated.** No migration in `drizzle/meta/_journal.json`
creates `ride_messages`, but `0020_chilly_bill_hollister.sql` runs
`DROP TABLE "ride_messages" CASCADE` (plus `DROP TYPE` for `ride_message_sender` and
`ride_reviewer_role`) with no `IF EXISTS`. The only file that creates that table,
`0020_sturdy_sabra.sql`, is not in the journal, so the real migrator never runs it. An
existing deployed database is fine — it already has the objects — but a new environment
fails partway through migration.

This is why all four pre-existing integration suites fail before running a single
assertion, and it predates this work (confirmed by stashing these changes and
re-running). The fix is to add `IF EXISTS` to those drops, or to journal the missing
migration — both edit shipped migration history, which is the deployment owner's call,
so nothing here touches them. This spec's own suite works around it locally and
documents the workaround inline.
