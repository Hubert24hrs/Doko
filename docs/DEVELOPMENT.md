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
