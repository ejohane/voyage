# Voyage

[![CI](https://github.com/ejohane/voyage/actions/workflows/ci.yml/badge.svg)](https://github.com/ejohane/voyage/actions/workflows/ci.yml)

![Voyage logo](design/brand/voyage-logo-primary.png)

Voyage is the shared home for a trip: one place where everyone traveling can understand the plan, contribute in the ways that suit them, and know what matters now.

The project is currently establishing its web foundation on Cloudflare.

**Live application:** [voyageplan.app](https://voyageplan.app)

## Development

Voyage is a Bun-managed TypeScript monorepo. Its first application combines a Vite-powered React SPA
with a Hono API and deploys them together as one Cloudflare Worker.

```bash
bun install
cp apps/web/.env.example apps/web/.env.local
bun run dev
```

Set `VITE_CLERK_PUBLISHABLE_KEY` in `.env.local` to the publishable key from your Clerk
application before starting the web app. The authentication flow is available at `/sign-in` and
`/sign-up`.

Production deploys expect the same key in the GitHub environment variable
`VITE_CLERK_PUBLISHABLE_KEY`.

The local app is available at the URL printed by Vite. The frontend calls `/api/health` through the
same Workers runtime used by production.

Before committing:

```bash
bun run check
```

To preview the production build locally or deploy it:

```bash
bun run preview
bun run deploy
```

## Product documents

- [Vision](docs/VISION.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Brand direction](design/brand/README.md)
