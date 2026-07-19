# Voyage architecture

## Current slice

Voyage is a TypeScript monorepo managed with Bun workspaces. The first deployable application is a
React single-page application with a Hono API, built by Vite and deployed together as one Cloudflare
Worker.

```text
Browser
  ├── static app requests ──> Cloudflare static assets ──> React SPA
  └── /api/* requests ─────> Cloudflare Worker ─────────> Hono API ──> D1
```

Keeping the frontend and API on one origin avoids cross-origin configuration and lets one deployment
represent a complete, production-testable product slice.

## Repository structure

```text
apps/web/             React SPA, Hono Worker, and Cloudflare configuration
packages/contracts/   Types and constants shared by the browser and Worker
design/               Brand direction and logo explorations
docs/                 Product and technical decisions
```

## Runtime and deployment

- `@cloudflare/vite-plugin` runs Worker code in the Workers runtime during local Vite development.
- Static application routes are served as Cloudflare assets.
- `/api/*` routes run through the Worker first.
- Clerk session tokens authenticate protected API routes. The Worker verifies their signatures with
  the production Clerk JWT public key and scopes trip access through D1 membership records.
- D1 stores trips, ordered trip stops, memberships, travel segments, and stays. A trip has one or
  more stable stop records with optional arrival and departure dates. The trip start and end dates
  are derived from the earliest arrival and latest departure so sorting stays efficient without a
  second editable date range. The original destination column remains as a migration-era
  compatibility field. Stays reference their destination, while travel segments can reference
  itinerary stops at either end and retain free-text airport or station locations. Trip plans also
  reference a destination and use a nullable local date to move between the Ideas collection and
  the day-by-day itinerary without duplicating records. Travel and plan times are stored as local
  values so details are not shifted across time zones. SQL migrations under `apps/web/migrations/`
  are applied locally for development and by GitHub Actions before production deployment.
- `wrangler.jsonc` is the source of Cloudflare deployment configuration.
- GitHub Actions validates every pull request and push to `main`.
- A successful validation on `main` deploys the frontend and Worker together.

## Deferred intentionally

File storage, maps, background jobs, invitations, expense splitting, live travel status, and product
analytics are not part of the current slice. They will be introduced when a product feature
requires them.
