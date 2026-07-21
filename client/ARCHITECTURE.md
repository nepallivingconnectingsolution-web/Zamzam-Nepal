# Architecture

Feature-based structure. Shared primitives live in `components/`, business
surfaces in `features/`, and cross-cutting concerns (api, services, stores,
hooks, config) sit at the top of `src/`.

```
src/
├── api/
│   └── client.ts            # api.get/post/patch/delete → real fetch calls to the NestJS backend
├── components/
│   ├── ui/                  # owned shadcn-style primitives
│   │   ├── button · card · input · badge · avatar · skeleton · tabs · icon · theme-toggle · toaster
│   ├── shared/              # cross-feature building blocks
│   │   ├── async-states     # EmptyState · ErrorState · WaitingForData · AsyncBoundary
│   │   ├── page-header · section · stat-card · service-grid
│   │   └── scaffold-page    # placeholder for not-yet-built screens
│   └── layout/              # public-navbar · footer · logo · portal-layout (sidebar+topbar)
├── config/
│   └── index.ts             # SERVICES catalog, PORTAL_NAV (RBAC nav), ROLE_HOME/LABEL
├── features/
│   ├── marketing/           # LandingPage + sections (hero, blocks) + NotFound
│   ├── auth/                # LoginPage · RegisterPage · ProfileSetupPage (email/password)
│   ├── customer/            # MarketplaceHome · WalletPage · marketplace/ServiceBookingPage
│   ├── buses/               # BusList · BusDetail (seat picker) · BusBookings · OperatorBusManager
│   ├── driver/              # DriverDashboard (earnings chart, online toggle, requests)
│   ├── admin/               # AdminOverview (revenue chart, disputes, KPIs)
│   ├── partner/             # PartnerDashboard (hotel/operator/freight, shared KPI + chart)
│   └── super-admin/         # SuperAdmin login/guard/layout/overview + users/approvals/reg-review
├── hooks/
│   └── useResource.ts       # async state machine → idle/loading/success/empty/error
├── stores/
│   ├── ui.store.ts          # theme + sidebar
│   ├── auth.store.ts        # session: token + user (+ previewRole for RBAC preview)
│   ├── super-admin.store.ts # separate super-admin session (zz_sa)
│   └── toast.store.ts       # toast queue + imperative toast.success/error/info helpers
├── styles/globals.css       # Tailwind + design tokens (light/dark)
├── types/index.ts           # Role, User, ServiceVertical, NavItem, AsyncState
└── routes/index.tsx         # createBrowserRouter, role-based portal layouts
```

## Talking to the backend

`api/client.ts` exposes `api.get/post/patch/delete`, sending real HTTP
requests to `VITE_API_URL` (see `../server`). It attaches the stored
`zz_token` as a Bearer header, and on a 401 it transparently tries
`POST /auth/refresh` once before falling back to signing the user out — so a
short-lived 15-minute access token doesn't bounce people to the login screen
constantly. `features/super-admin/useSuperAdminApi.ts` does the same thing
but against the super-admin's own token (`zz_sa` store) with no refresh flow
(by design — that session is shorter-lived and re-auth is required).

## Auth & RBAC model

`Role` ∈ guest · customer · driver · bus_operator · freight · hotel · admin.

- **Customers** register → instant session → profile setup → app.
- **Partners** register → `kycStatus: PENDING` (no session) → a super-admin
  approves them → they can log in → business setup (gated by `profileComplete`).

Each portal route mounts `<RequireRole role="…">` then `<PortalLayout role="…" />`,
which selects its sidebar from `PORTAL_NAV[role]`. Login routes by
`profileComplete` (incomplete → `/profile/setup`, else → `ROLE_HOME[role]`).

## Theming

All neutral surfaces resolve from CSS variables in `globals.css` (`--bg`,
`--surface`, `--fg`, …) under `:root` / `.dark`. Brand colors (slate `#0F172A`,
emerald `#10B981`) are fixed Tailwind tokens. Re-theme the whole app from one
file.

## Build & bundling

`npm run build` runs `tsc -b` then `vite build`. Vendors are split into cacheable
chunks (`react`, `recharts`, `framer-motion`) via `manualChunks`, and the `Icon`
component registers only the icons actually used rather than importing the full
Lucide set — keeping the main app chunk lean.
