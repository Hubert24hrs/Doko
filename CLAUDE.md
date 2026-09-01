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
* **Live: <https://doko-delta.vercel.app>** (Vercel, deploys from `main`)
* Database: hosted Supabase project `ezike-oba`
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
* Public landing page, communities directory, authenticated home, profile
  settings, admin overview, admin communities
* SQL migrations 001-006 (schema, RLS, audit, rate limits) -- **executed
  against the hosted project on 2026-09-01**
* Seed data for the real Igbo-Eze North hierarchy -- **applied and verified**
* **76 database assertions passing** against live Postgres via pgTAP:
  38 structural (`01_schema`), 29 RLS behaviour (`02_rls`), 9 seed integrity
  (`03_seed`). RLS enforcement, the privilege-escalation boundary, the
  append-only audit trail, the rate limiter, provider sign-up handling and
  the seeded directory are VERIFIED, not assumed.
* The suites run against the live database and leave nothing behind: verified
  independently that no fixture user, no capture table and no altered row
  survives the closing rollback.
* Auth verified end to end through the running app: sign-up, the profile
  trigger, sign-in, `/settings`, and `/admin` correctly refusing a citizen.
* **Phase 2 slices 1 and 2 are live and working**: posts, the feed, comments,
  four reactions, trigger-maintained engagement counts, and a public
  `/posts/[id]` page. Verified against the hosted project with real data,
  including the author embed and the generated SEO metadata for public posts.
* **147 database assertions passing**: 38 schema, 29 RLS, 9 seed, 22 posts,
  18 comments/reactions, 19 media, 16 follows.
* **Phase 2 slices 4 and 5 verified on the live site**: member profiles at
  `/members/[username]`, and following -- Follow button, counts, and the
  Everyone / Following feed views, including the empty-following case showing
  an empty feed rather than everything.
* **Phase 2 slice 3 (images on posts)**: up to four per post, private bucket,
  signed URLs, visible exactly when the post is. Verified end to end on the
  live site -- upload, storage policies, signed-URL rendering and the two-step
  composer flow all exercised with a real photograph.
* **Deployed to production and verified on the live URL**: public routes serve,
  protected routes redirect, real community data renders, canonical URLs and
  the sitemap carry the production host, and no secret appears in the HTML.
* **Audited 2026-09-01**, 15/15 live routes healthy. Three real defects found
  and fixed, all recorded in docs/SECURITY.md:
  1. Post and reply editing was unreachable -- policies, guard triggers and the
     "edited" label all existed with no way in.
  2. Five write actions reported success for writes RLS had silently refused.
     **RLS refuses by filtering, not by raising**: every write must `.select()`
     and check the affected rows.
  3. `?next=` was computed by the proxy and discarded by every consumer, so
     sign-in always landed on /home.
* 56 unit tests passing; typecheck clean; lint clean; production build clean
* Verified by smoke test: every route responds correctly with **no database
  configured** -- public pages render, protected routes 307 to
  `/login?next=...`, and no secrets appear in the HTML

### Not yet done

* **Biometric sign-in (passkeys) is built but PARKED, not working.** Enrolment
  succeeds; sign-in has not been confirmed. auth-js ships security-key
  defaults (`hints: ['security-key']`, `cross-platform`,
  `residentKey: 'discouraged'`), so the first attempt produced a USB-key
  prompt and a non-discoverable credential. `passkey-ceremony.ts` drives the
  ceremony by hand to ask for the platform authenticator instead, but that fix
  has not been verified on a real device. Do not describe biometrics as
  working. See docs/SECURITY.md.
* **Identity providers are switched off.** Google needs credentials; Apple
  needs paid Developer Program membership. Both are one env var away.
* **Registration verifies nothing.** Email confirmation is off and no provider
  is enabled, so a member can register with an address they do not control.
  Acceptable while the audience is known personally; NOT acceptable once the
  URL is shared. Resolve before public launch -- see docs/DEPLOYMENT.md section 6.
* Rest of Phase 2: groups
* Phase 3 messaging; Phase 4 events, jobs, marketplace, directory, issues, map;
  Phase 5 verification, moderation queue, advertising, payments; Phase 6
  hardening
* The entire AI intelligence layer (Oba AI, RAG, semantic search, moderation,
  translation). **Note:** the AI brief assumes an existing platform to
  integrate into. That platform is what is being built now; AI work starts
  once there is real content to ground answers in. Posts and comments exist
  now, so the ground is beginning to be there.
* Mobile apps

### Where to pick up

Recommended order, and why:

1. **Enable Google sign-in.** Closes the registration gap above. The code is
   built; it needs credentials and one env var. Free, roughly 20 minutes.
2. **Followers-only post visibility.** Following now exists, so the third
   `post_visibility` value deliberately left out can finally be added. NOTE:
   `ALTER TYPE ... ADD VALUE` cannot be used in the same transaction that
   creates the policy referring to it, so this needs TWO migration files.
3. **Groups**, then Phase 3 messaging.

Operational notes that will otherwise be rediscovered painfully:

* Migrations are applied BY HAND through the Supabase SQL Editor. There is no
  Docker or `psql` on the development machine, which is why every migration
  and pgTAP suite is written in portable SQL with no psql meta-commands.
* Deployment does NOT run migrations. Apply them before merging code that
  depends on them, or production queries columns that do not exist.
* After `next build`, RESTART the dev server. A running server keeps serving
  the old build, and a signed-out `curl` cannot tell a missing route from a
  proxy redirect -- both return 307. Check `.next/server/app/<route>` instead.

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
    auth/callback/          email + OAuth callback
    settings/               profile editing, passkey enrolment
    communities/            public directory
    home/                   authenticated landing
    welcome/                post-registration greeting
    feed/                   the community feed
    posts/[id]/             public post page, indexable
    members/[username]/     public member profile, indexable
    robots.ts sitemap.ts    SEO surface
    not-found.tsx error.tsx global-error.tsx
    globals.css             ALL design tokens live here
    layout.tsx
  components/
    brand/                  logo mark
    ui/                     reusable primitives (no feature logic)
  features/                 feature-owned logic
    admin/queries.ts
    auth/{actions,schemas,session}.ts, components/
    geo/{queries,snapshot}.ts
    profile/{actions,queries,schemas}.ts, components/
    posts/{actions,queries,schemas}.ts, components/
    comments/{actions,queries,schemas}.ts, components/
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
supabase/tests/             pgTAP suites 01-05, portable SQL
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

### Tables (migrations 001-009, all applied to the live project)

| Table | Purpose |
|---|---|
| `geo_entities` | the community tree |
| `profiles` | one row per real person, created by trigger from `auth.users` |
| `profile_social_links` | separate table so platforms can be added without a migration |
| `user_roles` | roles, **never** stored on `profiles` |
| `audit_logs` | append-only administrative trail |
| `rate_limit_counters` | durable rate limiting |
| `posts` | member posts; `geo_id` NULL means LGA-wide |
| `comments` | replies; visibility follows the post's |
| `reactions` | one per person per post, four kinds |
| `post_media` | up to 4 images per post; bytes live in the private `post-media` bucket |
| `follows` | one-directional, no approval; the pair is the primary key |

**`posts.author_id` and `comments.author_id` reference `public.profiles`, not
`auth.users`.** The identity is the same, since `profiles.id` IS the auth user
id, but PostgREST can only embed across a foreign key whose target is in the
exposed schema. Pointing them at `auth.users` makes
`author:author_id ( ... )` fail with PGRST200 and takes the whole feed query
down, not just the author's name. This shipped broken once; do not undo it.

**`posts.comment_count` and `posts.reaction_count` are denormalised** and
maintained by triggers, because a feed page would otherwise run twenty
aggregates. `recount_post_engagement()` repairs drift.

### Helper functions

`has_role`, `is_staff`, `is_admin`, `is_super_admin`, `administers_geo`,
`shares_community_with`, `geo_ancestors`, `geo_descendants`,
`log_admin_action`, `consume_rate_limit`, `slugify`,
`is_active_member`, `member_of_geo`, `recount_post_engagement`.

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
| `NEXT_PUBLIC_OAUTH_PROVIDERS` | public | no | comma-separated: `google`, `apple`. **Empty by default** -- a provider with no credentials behind it must never render a button |
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

**The database is live.** A hosted Supabase project (`ezike-oba`) holds the
schema, the seed and all policies, verified by the pgTAP suites. There is
still no Docker and no `psql` here, so database work is done by pasting
`supabase/migrations/*.sql` and `supabase/tests/*.sql` into the hosted SQL
Editor. Both test suites are written in portable SQL for exactly that reason.

Remaining: wire the app to the project (`.env.local`) and exercise auth
end-to-end.

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
| Posts and comments soft-delete; reactions hard-delete | moderation must stay auditable, and an author must be able to see that their own post was removed rather than watch it vanish. A reaction is a signal, not speech: a withdrawn one leaves nothing worth keeping |
| Moderators may remove, never rewrite | the guard triggers restore `body` for anyone who is not the author, so moderation can never put words in a member's mouth |
| Author foreign keys point at `profiles` | PostgREST embeds only across keys targeting the exposed schema; pointing at `auth.users` broke the entire feed query |
| Comment and reaction visibility is an EXISTS against `posts` | restating the rules would create a second copy, and the copy outside the source of truth is the one that drifts |
| Engagement counts denormalised on `posts` | twenty aggregates per feed page does not scale; `recount_post_engagement()` repairs drift |
| Keyset pagination on the feed | OFFSET slows with depth and skips or repeats rows when new posts arrive mid-scroll, which on a feed is normal |
| Reactions are like/celebrate/support/sad | chosen for this community: funerals and festivals are both major events here, and a thumbs-up handles condolence badly |
| Identity providers behind `NEXT_PUBLIC_OAUTH_PROVIDERS`, defaulting to none | which providers exist is an account and billing decision, not an engineering one, and a button with no credentials behind it is worse than no button |
| Sitemap uses a cookie-free anonymous client | a sitemap has no caller; reading cookies made the route dynamic and silently shipped it empty |
| An invisible post 404s, not 403s | a 403 would confirm the post exists |
| Media bucket is private, read via signed URLs | a public bucket serves any object to anyone holding the URL with no policy consulted; unguessable ids are obscurity, not access control |
| Storage path is `<post_id>/<uuid>.<ext>` | storage policies read the first segment to find the owning post; a malformed path matches no policy and is denied |
| Post saved before images upload | if an upload fails the member keeps their words; the other order loses the post because a photo would not transfer |
| Plain `<img>`, not `next/image`, for post media | the optimiser caches under a key that outlives the signed URL and would serve a broken image |
| Alt text asked for always, required never | refusing the upload costs the community the photograph rather than gaining it a description |
| Post image containers carry the recorded aspect ratio | an `<img>` sized only by `w-auto` has no dimensions until it loads, so its box collapses -- and `loading="lazy"` then never fires, because a zero-height element never enters the viewport. It could not load because it had no size, and had no size because it had not loaded |
| A profile that is not visible 404s, like a post | indistinguishable from one that does not exist, so probing usernames reveals nothing |
| Following is one-directional and needs no approval | a community noticeboard, not a private network; profile visibility already controls who sees what, so a request-and-accept dance would be friction with no safety gain |
| Follow sends the desired END STATE, not a toggle | a toggle read from stale UI does the opposite of what the member meant -- a double click would follow then immediately unfollow |
| Unfollowing hard-deletes, like withdrawing a reaction | a follow is a current relationship, not speech; a tombstone would misstate who someone follows today |
| An empty following list means an empty feed | treating it as "no filter" would silently show everything, which is the opposite of what was asked for |
