# Ezike Oba

The digital home of **Igbo-Eze North Local Government Area, Enugu State,
Nigeria** — one place where citizens can find each other, discover their
communities, share what matters, find opportunities and build together.

**Live: <https://doko-delta.vercel.app>**

> **Status: Phase 1 complete, Phase 2 in progress.** Deployed and running
> against a hosted Supabase project. 112 database assertions and 79 unit tests
> pass; typecheck, lint and the production build are clean.
>
> **Before sharing the link publicly:** registration currently verifies
> nothing — email confirmation is off and no identity provider is enabled, so
> a member can register with an address they do not control. See
> [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) §6.

---

## What exists today

* Public landing page and a communities directory covering the real
  Igbo-Eze North hierarchy — 2 towns, 4 districts, 31 villages, 20 council
  wards, seeded from cited sources and editable by administrators
* Registration and sign-in, validated on both client and server, with a
  password reveal toggle and a welcome flow
* Profile settings, including optional village and profile visibility
* A community feed: posts scoped to a village, a town or the whole LGA, with
  public or community-only visibility
* Replies and four reactions — like, celebrate, support, sad — chosen for a
  community where funerals and festivals both matter
* Public post pages with real metadata, a sitemap and robots rules
* Role-based access control enforced in the database, not the UI
* An admin console with a live platform overview and the community directory
* A design system with light/dark themes, accessible primitives, and
  reduced-motion support

## What does not work yet

* **Biometric sign-in (passkeys).** Built, enrolment succeeds, sign-in
  unconfirmed. Recorded honestly rather than described as working.
* Google and Apple sign-in are switched off — Google needs credentials,
  Apple needs paid Developer Program membership.
* Media on posts, following, groups, messaging, events, jobs, marketplace,
  community issues, the map, and the AI layer.

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in your Supabase values
npm run dev
```

The app runs without credentials — data pages show an honest "unavailable"
state instead of crashing, which is deliberate: a misconfigured deploy should
still serve public content. To connect a database, see
[`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md).

Database changes are applied by hand through the Supabase SQL Editor. Every
migration and test is written in portable SQL for that reason — no psql
meta-commands.

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
