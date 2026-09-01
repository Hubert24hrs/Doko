# Development

## Prerequisites

* Node.js 22+
* npm 11+
* A Supabase project (hosted) **or** Docker Desktop for the local stack

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in real values
npm run dev                  # http://localhost:3000
```

The app boots without Supabase credentials: data pages degrade to an honest
"unavailable" state rather than crashing. Auth will not work until the
environment is configured.

> **Windows note:** `npm install` is very slow here -- a 385-package install
> took 20 minutes. Run it in the background and keep working.

## Connecting a database

Nothing database-backed has been executed yet. Pick one route.

### Hosted Supabase (recommended)

1. Create a project at <https://supabase.com/dashboard>.
2. Copy **Project URL** and **anon key** from Project Settings > API into
   `.env.local`.
3. Link and push:

```bash
npx supabase link --project-ref <your-project-ref>
npm run db:push
```

4. Apply the seed via the SQL editor (paste `supabase/seed.sql`) or:

```bash
npx supabase db execute --file supabase/seed.sql
```

5. Regenerate types from the live schema:

```bash
npm run db:types
```

### Local Supabase

Requires Docker Desktop.

```bash
npx supabase start
npm run db:reset     # migrations + seed
```

### Creating the first admin

Roles are database rows; there is no bootstrap UI by design. After signing up
through `/register`, run in the SQL editor:

```sql
insert into public.user_roles (user_id, role)
select id, 'super_admin' from auth.users where email = 'you@example.com';
```

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run test` | Vitest |
| `npm run verify` | typecheck + lint + test |

Run `npm run verify && npm run build` before every commit.

## Adding a feature

1. **Migration first** if the schema changes. Numbered, idempotent, with RLS
   policies in the same change. Never add a table without policies.
2. Update `src/types/database.ts` (or regenerate).
3. Add queries/actions under `src/features/<feature>/`.
4. Build the route in `src/app/`, keeping it thin.
5. Write tests for the logic, not the framework.
6. `npm run verify && npm run build`.
7. Update `CLAUDE.md` and the relevant doc **in the same commit**.

## Traps already hit

**zod is v4.** `z.email()` / `z.uuid()` are top-level; `errorMap` is gone.
Use `z.boolean().refine(v => v, "msg")` rather than `z.literal(true, {...})`.

**Database row types must be `type`, not `interface`.** postgrest-js requires
`Record<string, unknown>`; type aliases get an implicit index signature,
interfaces do not. An `interface` row type silently degrades **every table and
RPC to `never`**. The same applies to `Insert`/`Update` -- never `never`.

**Postgres validates `language sql` bodies at CREATE time.** Define a callee
before its caller within a migration.

**A policy on table X must not query X.** Use a `SECURITY DEFINER` helper.

**Do not reintroduce `next/font/google`.** It needs build-time network access
to Google's CDN. Self-host with `next/font/local` instead.

**`middleware.ts` is deprecated in Next 16** -- the convention is `proxy.ts`
exporting `proxy()`.

## Reading the Next.js docs

This Next.js version ships its own docs. Prefer them over memory:

```
node_modules/next/dist/docs/
```

---

## Applying database changes

There is no Docker and no `psql` on the development machine, so the Supabase
CLI cannot run migrations locally. **Migrations are applied by hand through the
Supabase SQL Editor**, and everything is written to suit that:

* Migrations and pgTAP suites use portable SQL only — no psql meta-commands
  such as `\set`, which the SQL Editor cannot parse.
* Each pgTAP suite sets `search_path = public, extensions, pg_temp`, because
  pgTAP installs into `extensions` on hosted Supabase and its functions are
  otherwise unresolvable.
* Each suite ends with a `coalesce` over `finish()` so exactly one row always
  comes back: the named failures, or `ALL ASSERTIONS PASSED`. The editor shows
  only the final statement's result, so a suite that returned nothing on
  success was indistinguishable from one whose failures scrolled past.
* Suites wrap everything in `begin … rollback`, so they can run against the
  live database and leave nothing behind.

To apply a change:

1. Open the Supabase SQL Editor, new query.
2. Paste the whole migration file. Run.
3. Paste the relevant `supabase/tests/*.sql` suite. Run. Expect
   `ALL ASSERTIONS PASSED`.

**Deployment does not run migrations.** Apply them before merging code that
depends on them, or production will query columns that do not exist.

## Two traps that have already cost time

**After `next build`, restart the server.** A running `next start` keeps
serving the previous build. Worse, a signed-out `curl` cannot tell a missing
route from a proxy redirect — both return 307 — so a route can appear to work
while returning 404 to a signed-in member. Verify with
`ls .next/server/app/<route>` instead.

**Privileged profile columns cannot be set from raw SQL.**
`profiles_guard_privileged_columns()` silently restores `is_verified`,
`is_suspended` and friends whenever `is_admin()` is false, and a statement run
directly in the SQL Editor has no `auth.uid()`. Adopt an admin identity first —
see `docs/SECURITY.md`.
