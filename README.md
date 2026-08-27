# Ezike Oba

The digital home of **Igbo-Eze North Local Government Area, Enugu State,
Nigeria** — one place where citizens can find each other, discover their
communities, share what matters, find opportunities and build together.

> **Status: Phase 1 (Foundation).** The application builds, typechecks, lints
> and passes its tests. **No Supabase project is connected yet**, so the
> database migrations and RLS policies are written but have never been
> executed. See [`CLAUDE.md`](./CLAUDE.md) §12 for exactly what that blocks.

---

## What exists today

* Public landing page and a communities directory covering the real
  Igbo-Eze North hierarchy — 2 towns, 4 districts, 31 villages, 20 council wards
* Registration and sign-in, validated on both client and server
* Role-based access control enforced in the database, not the UI
* An admin console foundation with a live platform overview
* A design system with light/dark themes, accessible primitives, and
  reduced-motion support

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in your Supabase values
npm run dev
```

The app runs without credentials — data pages show an honest "unavailable"
state instead of crashing. To connect a database, see
[`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md).

## Commands

```bash
npm run dev        # dev server
npm run build      # production build
npm run verify     # typecheck + lint + test
npm run test       # unit tests
```

## Documentation

| Document | Contents |
|---|---|
| [`CLAUDE.md`](./CLAUDE.md) | engineering memory: status, decisions, gotchas |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | how it fits together and why |
| [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md) | setup, workflow, traps |
| [`docs/TESTING.md`](./docs/TESTING.md) | what is tested, what is not |
| [`docs/SECURITY.md`](./docs/SECURITY.md) | threat model and trade-offs |
| [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) | Vercel + Supabase release process |

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Supabase
(Postgres, Auth, Storage, Realtime) · zod · Vitest

## Community data

The geographic hierarchy in `supabase/seed.sql` is compiled from public
sources, cited inline. Sources disagree on the exact village count, so the
seed is an attributable starting point that administrators correct in-app —
which is why the hierarchy is editable data rather than a hard-coded list.
