@AGENTS.md

# Ezike Oba -- engineering memory

Read this before major development work. Keep it accurate: when architecture,
dependencies, commands, schema, security rules or workflow change, update this
file in the same commit.

---

## 1. Project overview

**Ezike Oba** is a digital community ecosystem for **Igbo-Eze North Local
Government Area, Enugu State, Nigeria** -- one trusted digital home where
citizens can find each other, discover their communities, share what matters,
find opportunities, trade, attend events and report community issues.

* Repository: <https://github.com/Hubert24hrs/Doko>
* Local path: `C:\EzikeObaWebsite`
* Target platforms: responsive web (now), Android + iOS (later)

**Product rules that constrain the design:**

| Rule | Consequence in code |
|---|---|
| Accounts represent real people | Sign-up requires an explicit real-person confirmation; no anonymous public accounts |
| Village/community selection is **optional** | `profiles.village_id` is nullable; the picker offers "Prefer not to say" |
| Anyone may explore any community | No community gate on public directory reads |
| Admin controls community structure | Geography is database rows edited in-app, never hard-coded in components |
| Original identity | Deliberately not a Facebook/Instagram clone -- palm-green palette, not blue |

---

## 2. Current implementation status

**Honest status: Phase 1 (Foundation) is built and verified as far as it can
be without a live Supabase project.**

### Done and verified

* Next.js 16 + React 19 + TypeScript + Tailwind v4 scaffold
* Design system: tokens, light/dark, reduced-motion, focus treatment
* UI primitives: Button, Field set, Card, Badge/VerifiedBadge, loading/empty/error states
* Supabase clients: browser, request-scoped server, admin (service-role), proxy session refresh
* Env validation with zod, split public/server, `server-only` guard on secrets
* Auth: register + login + sign-out + email-callback route, all server-validated
* Route protection via `src/proxy.ts`
* Session/role helpers (`requireUser`, `requireStaff`, `requireAdmin`)
* Public landing page, communities directory, authenticated home, admin overview, admin communities
* SQL migrations 001-006 (schema, RLS, audit, rate limits) -- **written, not yet executed**
* Seed data for the real Igbo-Eze North hierarchy -- **written, not yet executed**
* 44 unit tests passing; typecheck clean; lint clean; production build clean
* Verified by smoke test: every route responds correctly with **no database
  configured** -- public pages render, protected routes 307 to
  `/login?next=...`, and no secrets appear in the HTML

### Not yet done

* **No Supabase project is connected.** Migrations have never run against a
  database. RLS policies are unverified. Auth has not been exercised end-to-end.
  See section 12 for exactly what is needed.
* Phases 2-6 of the platform (feed, groups, messaging, events, jobs,
  marketplace, issues, map, verification, moderation, payments)
* The entire AI intelligence layer (Oba AI, RAG, semantic search, moderation,
  translation). **Note:** the AI brief assumes an existing platform to
  integrate into. That platform is what is being built now; AI work starts
  once the social core exists and there is real content to ground answers in.
* Mobile apps

---

## 3. Tech stack

| Layer | Choice | Version | Note |
|---|---|---|---|
| Framework | Next.js App Router | 16.3.3 | Turbopack build |
| UI | React | 19.2.8 | |
| Language | TypeScript | 5.x | strict |
| Styling | Tailwind CSS | v4 | CSS-first config in `globals.css`, no `tailwind.config` |
| Backend | Supabase | -- | Postgres + Auth + Storage + Realtime |
| DB client | `@supabase/supabase-js` + `@supabase/ssr` | 2.112.4 | |
| Validation | zod | 4.4.3 | **v4 API** -- see section 10 |
| Variants | class-variance-authority | | |
| Icons | lucide-react | | |
| Animation | motion | | installed, used sparingly |
| Tests | Vitest | 4.1.11 | node env, single fork |

**Deliberately NOT used:**

* `next/font/google` -- needs build-time network access to Google's CDN and
  leaks reader IPs. System font stack instead. Self-host with
  `next/font/local` if a bespoke typeface is ever wanted.
* A `tailwind.config.js` -- Tailwind v4 is configured in CSS.

---

## 4. Folder structure

```
src/
  app/                      routes only; thin, delegate to features/
    (auth)/login|register/  auth route group
    admin/                  staff console
    auth/callback/          email-confirmation handler
    communities/            public directory
    home/                   authenticated landing
    globals.css             ALL design tokens live here
    layout.tsx
  components/
    brand/                  logo mark
    ui/                     reusable primitives (no feature logic)
  features/                 feature-owned logic
    admin/queries.ts
    auth/{actions,schemas,session}.ts, components/
    geo/{queries,snapshot}.ts
  lib/
    env.ts                  public env (browser-safe)
    env.server.ts           secrets, `server-only` guarded
    security/{rate-limit,redirect}.ts
    supabase/{client,server,middleware}.ts
    utils/cn.ts
  types/database.ts         hand-maintained DB types
  proxy.ts                  route protection + session refresh
supabase/
  migrations/               numbered, idempotent
  seed.sql                  real Igbo-Eze North data
tests/unit/                 vitest suites
docs/                       ARCHITECTURE, DEVELOPMENT, TESTING, SECURITY, DEPLOYMENT
```

**Convention:** `app/` holds routing and composition. Data access and business
logic live in `features/*/queries.ts` or `features/*/actions.ts`. Shared
primitives go in `components/ui/`. Never duplicate a primitive into a feature.

---

## 5. Database

### Geographic model -- important decision

The Igbo-Eze North hierarchy is **one self-referencing table**,
`geo_entities`, with a `kind` discriminator (`lga | town |
autonomous_community | district | village | area`) -- *not* separate
`towns`/`districts`/`villages` tables.

**Why:** admins must move a village to a different parent, merge duplicates,
reorder siblings and mark entities historical. Those are trivial on one tree
and painful across five tables with cross-table foreign keys. Read ergonomics
are restored by the views `v_towns`, `v_districts`, `v_villages`,
`v_autonomous_communities`.

Protections: a cycle-guard trigger, `ON DELETE RESTRICT` on `parent_id`, a
`merged_into_id` pointer so historical references stay resolvable, and soft
deletion via `deleted_at`. Geography is never hard-deleted casually -- posts,
events and issues will reference it.

### Tables (migrations 001-006)

| Table | Purpose |
|---|---|
| `geo_entities` | the community tree |
| `profiles` | one row per real person, created by trigger from `auth.users` |
| `profile_social_links` | separate table so platforms can be added without a migration |
| `user_roles` | roles, **never** stored on `profiles` |
| `audit_logs` | append-only administrative trail |
| `rate_limit_counters` | durable rate limiting |

### Helper functions

`has_role`, `is_staff`, `is_admin`, `is_super_admin`, `administers_geo`,
`shares_community_with`, `geo_ancestors`, `geo_descendants`,
`log_admin_action`, `consume_rate_limit`, `slugify`.

All RBAC helpers are `SECURITY DEFINER` with `set search_path = public,
pg_temp`.

### Two RLS traps already hit -- do not reintroduce

1. **Policy recursion.** A policy on `profiles` must never `SELECT FROM
   profiles`; Postgres re-applies the policy to the subquery and aborts with
   *"infinite recursion detected in policy for relation profiles"*. Use a
   `SECURITY DEFINER` helper (`shares_community_with`) instead.
2. **Function ordering.** Postgres validates `language sql` bodies at CREATE
   time, so a callee must be defined before its caller in the same migration.

### Seed data provenance

`supabase/seed.sql` encodes 2 towns, 4 districts, 31 villages and 20 INEC
wards, with sources cited inline. Sources disagree on the exact village count
(one lists 31 while describing 33; secondary sources cite 38 autonomous
communities without naming them). The seed is an attributable **starting
point** that admins correct in-app -- which is precisely why geography is
editable data rather than a hard-coded list.

---

## 6. Environment variables

| Variable | Scope | Required | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | yes | project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | yes | RLS-constrained key |
| `NEXT_PUBLIC_SITE_URL` | public | yes | auth redirects, canonical URLs |
| `SUPABASE_SERVICE_ROLE_KEY` | **secret** | no | privileged tasks only; bypasses RLS |

Template: `.env.example`. Real values go in `.env.local` (git-ignored).

`src/lib/env.server.ts` imports `server-only`, so bundling a secret into a
Client Component is a **build error**, not a runtime surprise.

---

## 7. Authentication and authorization

**Three layers, in order of authority:**

1. **RLS in Postgres** -- the real boundary. Every exposed table has RLS
   enabled with explicit per-command policies.
2. **Server-side checks** -- `requireUser` / `requireStaff` / `requireAdmin`
   give good redirects. These are *usability*, not security.
3. **`src/proxy.ts`** -- refreshes the session and redirects signed-out users
   away from protected prefixes. Also usability.

**Always `supabase.auth.getUser()`, never `getSession()`.** `getUser()`
revalidates the JWT with the auth server; `getSession()` trusts the cookie.

**Roles:** `super_admin`, `admin`, `moderator`, `community_admin`,
`verified_leader`, `verified_business`, `verified_organization`, `citizen`.
Only a `super_admin` may grant `admin` or `super_admin` -- that is the
privilege-escalation boundary, enforced in the `user_roles` INSERT policy.

**Self-service escalation is blocked** by the `profiles_guard_privileged`
trigger, which silently restores `is_verified`, `verified_at`, `is_suspended`,
`suspended_until` and `deleted_at` from the old row for non-admins.

---

## 8. Commands

```bash
npm run dev          # dev server
npm run build        # production build
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run test         # vitest run
npm run verify       # typecheck + lint + test   <-- run before every commit
```

Database (needs a linked Supabase project):

```bash
npm run db:push      # apply migrations
npm run db:reset     # reset + re-run migrations + seed
npm run db:types     # regenerate src/types/database.ts from the live schema
```

**Windows note:** `npm install` is very slow in this environment (a 385-package
install took 20 minutes). Run installs in the background and keep working.

---

## 9. Git / GitHub workflow

`BUILD -> AUDIT -> TEST -> FIX -> RE-TEST -> REGRESSION -> COMMIT -> PUSH -> VERIFY PUSH`

Before every push: `git status`, review changed files, `npm run verify`,
`npm run build`, then commit and push and confirm the push landed.

Never commit: `.env*` (except `.env.example`), keys, tokens, real user data.

---

## 10. Coding conventions and version gotchas

**zod is v4**, not v3. The APIs differ:

```ts
z.email("msg")                     // NOT z.string().email()
z.uuid("msg")                      // NOT z.string().uuid()
z.boolean().refine(v => v, "msg")  // NOT z.literal(true, { errorMap })
```

**Database row types must be `type` aliases, never `interface`.** postgrest-js
constrains every table to `Record<string, unknown>`. TypeScript gives type
aliases an implicit index signature but interfaces none, so an `interface` row
type silently fails the constraint and degrades **every table and RPC in the
client to `never`**. This cost real debugging time; do not undo it.

Similarly, a table's `Insert`/`Update` must be object types. Setting them to
`never` (to express "append-only") breaks the whole schema the same way --
append-only is expressed with RLS, not with types.

**Other conventions**

* Server Actions re-parse the same zod schema the client used. Client
  validation is convenience; the server decides.
* Never trust a client role check.
* Colours come from tokens in `globals.css`. No hard-coded hex in components.
* Every icon is `aria-hidden`; every icon-only control carries an accessible name.
* Loading, empty and error states are required, not optional.
* Failure to load data renders `null`/"unavailable", never `0` -- a broken
  query must not read as "there are no villages".

---

## 11. Security requirements

* RLS on every exposed table, explicit per-command policies.
* Server-side calls only for anything privileged; no secret ever reaches the client.
* Rate limiting is **Postgres-backed**, not in-process: on serverless, an
  in-memory counter resets on every cold start and is not shared between
  instances. It fails **open** on database error -- a limiter outage must not
  lock every member out of sign-in. Recorded in `docs/SECURITY.md`.
* Login returns one generic error for both "no such user" and "wrong password",
  so the form cannot enumerate accounts.
* Redirect parameters pass through `safeRelativePath` -- rejects absolute URLs,
  protocol-relative `//`, backslashes and control characters.
* Social link URLs are constrained to `http(s)` by a CHECK constraint, so
  `javascript:` cannot be stored at all.
* `audit_logs` has no INSERT/UPDATE/DELETE policy for anyone; rows arrive only
  through `log_admin_action()`.

---

## 12. What is blocked, and on what

**Everything database-dependent is blocked on a Supabase project.** There is
no Docker and no `psql` on this machine, so migrations cannot even be run
locally.

To unblock, one of:

* **Hosted (recommended):** create a Supabase project, put its URL + anon key
  in `.env.local`, then `npm run db:push` and apply `supabase/seed.sql`.
* **Local:** install Docker Desktop, then `npx supabase start` and
  `npm run db:reset`.

Until then, these remain **unverified** and must not be described as working:
migration execution, RLS policy behaviour, the signup trigger, live auth
flows, and every page's real data path.

---

## 13. Key decisions log

| Decision | Reason |
|---|---|
| One `geo_entities` tree, not per-level tables | admin move/merge/reorder must be cheap |
| Roles in `user_roles`, not on `profiles` | a profile UPDATE must never escalate privilege |
| Postgres-backed rate limiting | in-memory counters are useless on serverless |
| Rate limiter fails open | availability over a partial abuse control; Supabase Auth still throttles |
| No `next/font/google` | build-time CDN dependency + privacy leak |
| Row types as `type`, not `interface` | postgrest-js `Record<string, unknown>` constraint |
| `force-dynamic` on data pages | they read per-request session/live data; also keeps builds working with no DB |
| Counts render `--` on failure | a failed query must not look like real zero |
| Missing env degrades, never 500s | a misconfigured deploy must still serve public content; `tryGetClientEnv()` returns null and the caller is treated as signed out |
