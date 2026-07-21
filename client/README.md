# Zamzam Super App — Frontend

Nepal's mobility, logistics, tourism, commerce & services ecosystem.
A **marketplace-first**, enterprise-grade React frontend backed by a real
NestJS API (see `../server`).

## Stack

- **React 19 + TypeScript + Vite 6**
- **TailwindCSS** design system (light/dark, CSS-variable tokens)
- **shadcn-style** owned component library (`src/components/ui`)
- **Zustand** for UI, auth & toast state
- **React Router 7** with role-based portal layouts (RBAC)
- **Framer Motion** for motion, **Lucide** icons, **Recharts** for analytics

## Run it

The backend (`../server`) must be running first — see its README for setup.

```bash
cp .env.example .env.local   # VITE_API_URL, defaults to http://localhost:4000
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build
npm run preview  # serve the production build locally
```

## Accounts

There are no seeded demo accounts — register through the app's normal
`/register` flow. Partner roles (driver, hotel, bus operator, freight)
require super-admin approval before they can sign in.

**Super-admin console** lives at `/x-admin/login` (or triple-click the ©
in the footer). Credentials come from `server/.env`
(`SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD`) — there's no default shipped.

## Auth flow

- **Customers** register → log in immediately → set up their profile → use the app.
- **Partners** (driver, hotel, bus operator, freight) register → land in a
  **pending** state → a **super-admin approves** them in the approvals queue →
  only then can they log in and set up their business.

## What's included

| Area | State |
| --- | --- |
| Design system, tokens, dark/light | ✅ |
| Component library (Button, Card, Input, Tabs, Badge, Avatar, Skeleton, Toaster…) | ✅ |
| Real auth (JWT access/refresh, bcrypt, role guards) | ✅ |
| Public marketing site | ✅ |
| Customer portal — marketplace, service booking, wallet | ✅ |
| Bus search → seat selection → atomic booking → my bookings (with cancel + refund) | ✅ |
| Operator fleet manager — buses, schedules, cron-generated departures, tickets | ✅ |
| Driver / Operator dashboards with real (zero-by-default) metrics | ✅ |
| Freight / Hotel dashboards — honest-zero metrics (domain not built yet) | ⚠️ stub |
| Admin command center — real revenue/disputes/KPIs from the database | ✅ |
| Super-admin console — users, partner approvals, registration review, audit log | ✅ |
| Toasts, skeletons, empty/error states, animations | ✅ |
| Live ride-hailing matching (driver requests, GPS, dynamic pricing) | ⚠️ not built |

## Notes

- All data lives in the real Postgres database behind `../server` — nothing
  is stored in `localStorage` except auth tokens and small UI preferences.
- See `ARCHITECTURE.md` for the folder layout and how it maps to the backend.
