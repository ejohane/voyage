# Voyage architecture

## Current slice

Voyage is a TypeScript monorepo managed with Bun workspaces. The first deployable application is a
React single-page application with a Hono API, built by Vite and deployed together as one Cloudflare
Worker.

```text
Browser
  ├── static app requests ──> Cloudflare static assets ──> React SPA
  └── /api/* requests ─────> Cloudflare Worker ─────────> Hono API
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
- `wrangler.jsonc` is the source of Cloudflare deployment configuration.
- GitHub Actions validates every pull request and push to `main`.
- A successful validation on `main` deploys the frontend and Worker together.

## Deferred intentionally

Authentication, database storage, file storage, maps, background jobs, and product analytics are not
part of this foundation slice. They will be introduced when a product feature requires them.
