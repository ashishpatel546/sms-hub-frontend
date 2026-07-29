# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`sms-hub-frontend` ("Colegio Hub") is the Next.js 16 App Router admin console for the platform's control plane. It is the frontend for **sms-hub-backend** (auth + AI subscription platform) and manages tenants living in **sms-backend** (the per-school API). There is exactly one user persona: `SYSTEM_ADMIN`. The app has two sections:

- **Schools console** (`/dashboard`, `/dashboard/schools/*`) — provision, configure, suspend/activate tenant schools.
- **AI platform admin** (`/dashboard/ai/*`) — overview metrics, AI users, subscription plans, LLM tier/pricing/feature-role settings for the school-ai product.

Every page is a client component (`'use client'`); there are no Next.js API routes or server components in this repo — it's a pure SPA-style console over two external REST APIs.

## Commands

```bash
npm run dev     # next dev -p 3001
npm run build   # next build
npm run start   # next start (serve production build)
npm run lint    # eslint
```

- **No test suite exists in this repo** (no jest/vitest, no `*.test.*`/`*.spec.*` files) — don't assume one when asked to "run tests".
- `npm run lint` currently fails as-is: the script runs bare `eslint` (ESLint 10 / flat config) but **no `eslint.config.*` file exists at the repo root**, so it errors with "couldn't find an eslint.config file" before checking anything. If asked to lint, either add a minimal `eslint.config.mjs` (e.g. via `eslint-config-next`, already a devDependency) or flag this instead of assuming it works.
- Local dev needs a `.env` with `NEXT_PUBLIC_HUB_API_URL`, `NEXT_PUBLIC_SMS_API_URL`, `NEXT_PUBLIC_APP_NAME` (see the existing `.env` for local defaults, pointing at sms-hub-backend on `:5001` and sms-backend on `:5000`).

## Local dev over Cloudflare tunnel (mobile testing)

Local dev is exposed to the internet through a named Cloudflare tunnel (`home-app`) so the apps can be tested on real phones/tablets, not just a desktop browser. Config lives at `~/.cloudflared/config.yml`; the PowerShell profile provides `c-tunnel` (run the tunnel) and `cloudflared-config` (open the config in VS Code). Ingress map (specific hostnames must stay ABOVE the `*.appme.in` wildcard — cloudflared matches in order):

| Hostname | Local service |
|---|---|
| `hub.appme.in` | **sms-hub-frontend (this app)** — `localhost:3001` |
| `hub-api.appme.in` | sms-hub-backend — `localhost:5001` |
| `myapp.appme.in` | sms-backend API — `localhost:5000` |
| `ai-api.appme.in` | school-ai — `localhost:8001` (long keep-alive for slow AI generations) |
| `*.appme.in` wildcard (e.g. `edusphere.appme.in`), also `myrealapp.appme.in` | sms-frontend — `localhost:3000` (subdomain doubles as the tenant slug) |

**Responsive + PWA requirement:** the platform's frontends are used as installable PWAs on phones, tablets, laptops, and large desktop screens. UI changes here must stay responsive across all four sizes — verify at mobile (~360–430px), tablet (~768–1024px), laptop, and large desktop widths before considering UI work done. Real-device mobile verification happens through the tunnel hostnames above.

## Architecture

### Two backend API clients — do not mix them up

- **`src/lib/api.ts`** — client for **sms-hub-backend** (`NEXT_PUBLIC_HUB_API_URL`). Use for hub-only routes: `/auth/login`, `/auth/change-password`, and all `/ai-admin/*` endpoints (wrapped by `aiAdmin` in `src/lib/ai-admin-api.ts`). Exposes `api.get/post/delete/upload`; PATCH/PUT aren't in the base client, so `ai-admin-api.ts` has its own `aiAdminRequest`/`aiAdminPatch` that duplicate the fetch logic for those verbs.
- **`src/lib/sms-api.ts`** — client for **sms-backend** (`NEXT_PUBLIC_SMS_API_URL`). Use for all `/admin/*` tenant-management routes, wrapped by `adminSchools` (list/get/create/update/updatePlan/updateFeatures/updateSettings/updateProfile/uploadLogo/secrets/suspend/activate/owner management). Domain types (`School`, `SchoolProfile`, `SchoolPlan`, `SchoolStatus`, etc.) are colocated in this same file rather than a separate types module.
- Both clients inject `Authorization: Bearer <token>` from `localStorage`, treat HTTP 401 as "log out and redirect to `/login`", and normalize thrown errors to `{ status, info }` shape (`info.message` is what gets toasted).
- **The JWT is shared**: sms-hub-backend mints it, and sms-backend validates it using the same `JWT_SECRET`, so one token authenticates against both services. Role values in the token are UPPERCASE and synced with the `UserRole` enum in sms-backend — see the doc comment in `src/lib/auth.ts`.
- `getPublicLogoUrl()` in `sms-api.ts` builds school logo URLs directly against an S3 bucket (`NEXT_PUBLIC_PUBLIC_ASSETS_URL`), bypassing both API clients — the bucket name/region must match `PUBLIC_ASSETS_BUCKET`/`PUBLIC_ASSETS_REGION` in sms-backend.

### Auth and route protection

- `src/lib/auth.ts`: token lives in `localStorage['hub_auth_token']`; `getUser()` decodes the JWT payload client-side (no signature check — display/gating only, the backend is the real authority). `HubRole` is currently just `'SYSTEM_ADMIN'`.
- `src/components/ProtectedRoute.tsx` wraps every `/dashboard/*` page (and the nested `/dashboard/ai` layout). It renders `null` until an effect confirms: token present → user decodable → not mid-forced-password-change (`isChangePasswordOnly`) → optional `requireRole` match. This deliberately delays mounting children so their data-fetching effects never fire while unauthenticated.
- Pattern used throughout: pages split into an outer default-export that's just `<ProtectedRoute><Toaster/><PageContent/></ProtectedRoute>`, with the actual `useEffect`-driven fetch living in a child `*Content` component — see `dashboard/page.tsx` (`DashboardContent`). This avoids a "flash of unauthenticated fetch" that used to cause spurious error toasts during the login → change-password → dashboard transition; keep this split when adding new protected pages.
- `/` unconditionally redirects to `/login` server-side; `/login` itself redirects to `/dashboard` client-side once a valid token is found. Don't collapse these — see the comment in `src/app/page.tsx` for why `/` can't redirect straight to `/dashboard`.
- First-login forces a password-change step (`requirePasswordChange` from `/auth/login`) handled as local state (`step` in `login/page.tsx`), not a separate route.

### Routing / page structure

- `src/app/dashboard/page.tsx` — schools list with search, stat cards, table (fetches `adminSchools.list(true, signal)` with `AbortController` cleanup).
- `src/app/dashboard/schools/new/page.tsx` — school onboarding form.
- `src/app/dashboard/schools/[slug]/page.tsx` — large single-file tabbed school-detail page (profile incl. country/state/city cascading selects via `country-state-city`, plan, feature flags, JSON settings, encrypted secrets, owner/SUPER_ADMIN management, logo upload). It's ~1000 lines; when editing, look for the section comments (`// ── Profile state ──`, `// ── Owner state ──`) rather than trying to split the file.
- `src/app/dashboard/ai/*` — a nested "sub-app" with its own persistent shell: `ai/layout.tsx` renders `AiAdminShell` (violet-accented sidebar nav: Overview/Users/Plans/Settings) inside `ProtectedRoute requireRole="SYSTEM_ADMIN"`, independent of the schools dashboard's header. Add new AI-admin pages as new routes under here and register them in `AI_NAV`.
- `src/components/DynamicTitle.tsx` maintains `document.title` from a `PAGE_TITLES` lookup keyed by pathname (mounted once in root `layout.tsx`) — because every page is a client component, static per-route `metadata` exports don't apply, so new routes need an entry added here to get a real tab title.

### State management and styling

- No global state library and SWR (a listed dependency) is not actually used anywhere — all data fetching is local `useState`/`useEffect` + the API clients above, generally with `AbortController` cancellation and a `cancelled` flag guard in cleanup.
- Styling is Tailwind CSS v4 (`@import 'tailwindcss'` in `globals.css`, no `tailwind.config`, PostCSS plugin only) with hand-rolled utility-class UI — no component library. Brand gradient is blue→indigo for the schools console; the AI admin section uses violet as its accent to visually distinguish it.
- Toasts via `react-hot-toast`, mounted per-page/per-layout (not globally in root layout), with `id`-based dedupe for fetch-error toasts (e.g. `id: 'load-schools'`) to prevent stacking on rapid re-fetches/re-renders.

### Deployment

- Two independent deployment paths exist — don't assume Docker is what's used in CI:
  - **CI/EC2 (actual deploy path)**: `.github/workflows/deploy-ec2.yml` builds on GitHub-hosted runners (push to `development` → port 3021, `main` → port 3020), then SCPs `.next/`, `public/`, `scripts/`, `package.json`, `ecosystem.config.js` to `~/sms-hub-frontend-{development,production}` on EC2. On the box, `scripts/fetch-aws-ssm.mjs` pulls env vars from AWS SSM at `/sms-hub/{env}/` into `.env` (skipping `PORT`/`NODE_ENV`, which `ecosystem.config.js` manages), then PM2 starts/restarts the app (`pm2 start ecosystem.config.js --only $DIR_NAME --update-env`).
  - **Dockerfile**: alternate/local containerized build — copies `.env.docker` over `.env` *before* `npm run build` because `NEXT_PUBLIC_*` vars are baked in at build time and read by the browser directly, so they must point at host-mapped ports (e.g. `localhost:3001`), not in-container service names.
- `ecosystem.config.js` defines both a `sms-hub-frontend-dev` and a `sms-hub-frontend-prod` PM2 app; the prod one's name is overridden at deploy time via `PM2_NAME` env var to get the per-environment directory naming above.
