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

**Honest status: Phase 1 (Foundation) and Phase 2 (Social core) are built,
deployed and verified against the live Supabase project.** What remains open
is listed under "Not yet done" and is honest about being open.

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
* **374 database assertions passing** against the live project: 38 schema,
  29 RLS, 9 seed, 22 posts, 18 comments/reactions, 19 media, 16 follows,
  13 followers-only posts, 27 groups, 38 messages, 29 group conversations,
  14 presence, 35 events, 35 jobs, 32 marketplace.
* **Followers-only posts verified**, including that replies and images inherit
  the tier without those tables having been modified.
* **Phase 2 slice 7 (groups) verified against the live database.** 27
  assertions cover creator-as-owner, member counts, who may see a private
  group, who may join one, the last-owner guard, and -- the one that mattered
  -- that a post inside a private group is unreadable by the public **despite
  carrying the column default `visibility = 'public'`**. Permissive policies
  are OR'd, so migration 014 had to narrow the four existing post policies to
  `group_id is null`; without that narrowing a private group's posts would
  have been world-readable while the group itself looked locked.
* **Phase 2 is complete**: posts, images, comments, reactions, member
  profiles, following, followers-only visibility, and groups.
* **Phase 3 slice 1 (direct messages) verified against the live database.**
  Migration 015 is applied and 38 assertions pass. They cover the canonical
  pair key (both sides open the SAME conversation), that conversations and
  memberships have no INSERT policy for anyone, that a private or suspended
  profile cannot be messaged, that withdrawal blanks the body in the database,
  and -- the one that matters most -- that **a moderator and an admin each read
  exactly nothing**. `messages` is the only table here with no staff read
  policy, and that assertion is what keeps it that way.
  Three assertions in that suite had to be fixed first, all the same shape: an
  INSERT ... SELECT the outsider could not read fed on zero rows and threw
  nothing; a read-marker test measured the wrong person's count; and `now()`
  being the transaction timestamp made two rows compare EQUAL so an unread
  count was silently zero. Each passed or failed without reaching the thing it
  named.
* **Phase 3 slice 2 (group conversations) verified against the live database.**
  Migration 016 is applied and 29 assertions pass. A group has one chat,
  membership of the GROUP is the access rule, and the assertion that earned
  the suite is that **leaving the group ends access even though the read
  marker survives** -- `conversation_members` rows are markers, not grants,
  and nothing deletes them when somebody leaves. The suite leaves a stale one
  behind on purpose before asserting the departed member sees nothing.
  Almost no policy was written for this: every message policy asks
  `in_conversation()`, so teaching that one function about groups gave
  reading, writing and withdrawing their group rules for free.
* **Phase 3 slice 3 (presence) verified against the live database.** Migration
  017 is applied and 14 assertions pass. Presence stores nothing -- it lives in
  Realtime, on its own private channel, authorised by the same
  `in_conversation()` that guards the messages. The assertions are all about
  the topic parser, because the privacy of presence rests on a regular
  expression: it must return NULL and never raise for a topic that is not a
  conversation topic, since an error inside a policy is not a refusal.
* **Phase 3 is complete**: direct messages, group conversations, presence and
  typing. Realtime DELIVERY remains the one unverified thing.
* **Phase 4 slice 1 (events) verified against the live database.** Migration
  018 is applied and 35 assertions pass. They cover the WAT end-of-day fill
  (including an event just after midnight, which a UTC-based fill would end a
  day early), that an event in a private group is invisible despite carrying
  `visibility = 'public'`, that RSVP counts move a person between counters
  rather than double-counting, and that a moderator may cancel or remove an
  event but may NOT move it.
  Two defects were found by writing them: `eventWhen()` checked for a filled
  midnight end inside a branch that could never be reached, and the composer
  told organisers that a community event with no community chosen would be
  seen by "nobody but you" -- when `member_of_geo(null)` is TRUE and it in
  fact reaches the whole LGA.
* **Phase 4 slice 2 (jobs) verified against the live database.** Migration 019
  is applied and 35 assertions pass. They cover the split between a public,
  indexable listing and contact details with **no anon policy at all** -- a
  signed-out reader sees the job, cannot read the phone number, and cannot
  reach it by joining from the row they CAN read -- and that an application is
  readable only by its applicant and the job's employer, not even by staff.
  One assertion had the wrong error code before it was fixed: a non-employer's
  insert into `job_contacts` was expected to fail on the primary key (23505)
  when it in fact fails on the policy (42501) first, since `job_contacts_write_own`
  checks `employs_for_job()` before the row ever reaches the unique constraint.
  Split into the authorisation case and the duplicate case, tested where each
  can actually happen.
* **Phase 4 slice 3 (marketplace) verified against the live database.**
  Migration 020 is applied and 32 assertions pass. They cover the same
  public-listing/private-contact split as jobs, plus two things unique to a
  marketplace: a listing in a private group is invisible despite carrying
  `visibility='public'` by column default -- narrowed correctly from the
  first migration rather than needing a second one, the way posts did -- and
  `listing_media` accepts up to six photos and refuses a seventh. Contact
  details are genuinely optional here, unlike a job's: a listing with none
  at all is a normal listing, because "Message the seller" reuses messaging
  exactly as it stands.
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
* 268 unit tests passing (20 test files); typecheck clean; lint clean; production build clean
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
* **Realtime delivery is unverified.** The subscription is written and the
  publication line is in migration 015, but nothing has been observed arriving
  live in a second browser. The thread renders correctly either way -- the
  composer says "Live updates unavailable" when the channel is not subscribed
  -- so this degrades rather than breaks.
* Phase 4 directory, issues, map;
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
   Until this is done, a member can register with an address they do not
   control -- which is fine for an audience known personally and not fine
   once the URL is shared.
2. **Exercise a thread on the live site in two browsers.** The database is
   proven; realtime delivery is not, and watching a message arrive without a
   refresh is the only way to find out whether it does.
3. Phase 5, rest: advertising & payments (Paystack / Flutterwave), and Phase 6 hardening.

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
    groups/                 groups, and one group
    messages/               inbox and one conversation
    events/                 listing, one event, and the composer
    jobs/                   listing, one job, applications, and the composer
    marketplace/            listing, one item, and the composer
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
    follows/{actions,queries}.ts, components/
    groups/{actions,queries,schemas,post-actions,post-queries}.ts, components/
    messages/{actions,queries,schemas}.ts, components/
    events/{actions,queries,schemas,format}.ts, components/
    jobs/{actions,queries,schemas,format}.ts, components/
    marketplace/{actions,queries,schemas,media,media-actions,media-queries}.ts, components/
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
supabase/tests/             pgTAP suites 01-15, portable SQL
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
| `groups` | public or private; optional geographic anchor |
| `group_members` | membership IS the access rule; owner/moderator/member |
| `conversations` | a conversation; `dm_key` is a pair, `group_id` a group |
| `conversation_members` | who is in one, and their `last_read_at` |
| `messages` | what was said; **no staff read policy, deliberately** |
| `events` | festivals, funerals, meetings; `ends_at` is filled, never null |
| `event_attendees` | going / interested / not going, one row per person |
| `jobs` | vacancies; the public, indexable half |
| `job_contacts` | the phone number; **no anon policy, deliberately** |
| `job_applications` | private to the applicant and the employer |
| `marketplace_listings` | buy/sell listings; `group_id is null` narrowed from the start |
| `listing_contacts` | the phone number; unlike a job's, genuinely optional |
| `listing_media` | up to 6 photos; own private `listing-media` bucket |

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
`is_active_member`, `member_of_geo`, `recount_post_engagement`,
`is_group_member`, `leads_group`, `can_see_group`, `in_conversation`,
`can_message`, `open_direct_conversation`, `open_group_conversation`,
`my_conversation_summaries`, `my_unread_message_count`,
`conversation_from_presence_topic`, `can_see_event`,
`recount_event_attendance`, `can_see_job`, `employs_for_job`,
`can_see_listing`, `owns_listing`.

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

Nothing about Phases 1 and 2 is blocked. The hosted Supabase project
(`ezike-oba`) holds the schema, the seed and every policy; the app is wired to
it, deployed, and exercised end to end. Three things ARE blocked, and none of
them are code:

| Blocked | On what | Consequence while it waits |
|---|---|---|
| Google sign-in | Google Cloud OAuth credentials + one env var | Registration verifies nothing -- see section 2 |
| Apple sign-in | Paid Developer Program membership ($99/yr) | Deferred indefinitely; not on the critical path |
| Passkey sign-in | A real device to complete the ceremony on | Enrolment works, sign-in unconfirmed; PARKED |

**Database work is still done by hand.** There is no Docker and no `psql` on
this machine, so migrations and pgTAP suites are pasted into the hosted SQL
Editor. That is why every file under `supabase/` is portable SQL with no psql
meta-commands, and why an `ALTER TYPE ... ADD VALUE` needs its own file: the
editor runs a pasted script as one transaction.

If a local database is ever wanted, install Docker Desktop, then
`npx supabase start` and `npm run db:reset`.

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
| `followers` visibility arrived only once following existed | a visibility nobody can satisfy is a trap |
| Adding an enum value needs its OWN migration file | Postgres refuses to USE a new enum value in the transaction that added it, and the SQL Editor runs a pasted script as one transaction |
| Comments, reactions and media needed no change for the third tier | they ask an EXISTS against `posts` rather than restating visibility, so a new tier is inherited; 08_followers_posts asserts exactly this |
| A group post ignores `post_visibility` entirely | membership IS the access rule; applying both would let a member accidentally hide a post from the group they posted it in |
| Existing post policies were narrowed to `group_id is null` | permissive policies are OR'd, so without this a private group's post marked `visibility='public'` would have been world-readable while the group looked locked |
| A group must always keep one owner | the guard trigger refuses the last owner leaving OR self-demoting; otherwise nobody could edit, admit or close the group |
| The creator is made owner by trigger, not by the application | a group can then never exist without someone responsible for it, however it was created |
| Private groups cannot be joined at all | that is what makes them private; an invitation flow would add rows through a definer function rather than a third visibility value |
| A conversation is keyed by the ORDERED pair | two people messaging at the same moment would otherwise create two conversations and each would hold half the history, with no error anywhere. Without least/greatest, (a,b) and (b,a) are different keys and the uniqueness is decorative |
| Conversations are opened by a definer function, never by an INSERT | creating one means inserting a membership row for somebody else, which no policy can safely allow -- group_members refuses exactly that. So `conversations` has no INSERT policy for anyone |
| Opening is idempotent | pressing Message on somebody you have written to before belongs in the existing conversation, not a new one; the pair key makes a second one impossible anyway |
| Staff have NO read policy on messages | the single place this schema departs from "staff moderate everything". A post is public speech; a private message is not. A report flow should surface ONE reported message through a definer function that records who looked, not grant blanket access to everyone's correspondence. `10_messages` asserts a moderator and an admin both see nothing |
| Who may be messaged is the profile-visibility rule, reused | a private profile cannot be messaged cold. Writing a second rule here would be a second copy to keep in step, and the copy outside the source of truth is the one that drifts |
| `can_message` takes no `check_user_id` | it delegates to `shares_community_with`, which reads `auth.uid()` as the viewer. A `can_message(target, someone_else)` would answer for the CALLER while appearing to answer for someone else -- a wrong answer that looks right |
| Read state is `last_read_at` on the membership row | one row per person per conversation answers "how many unread" as well as one row per person per message, and does not grow with the conversation |
| Sending a message marks it read for its own author | otherwise everybody carries an unread count that includes their own messages, which reads as a bug even though the arithmetic is right |
| Withdrawal blanks the body IN THE DATABASE | a stale client, a cached payload or a realtime event must not still be carrying the words of a message somebody withdrew. Hiding it in the UI would leave the text in flight |
| A withdrawn message keeps its row | a hole in a thread is more confusing than a tombstone, and every reply above it stops making sense |
| A realtime event is a SIGNAL, not data | the payload is discarded and the server component re-runs, so what renders has passed through RLS on the server exactly as a fresh page load would. It costs a round trip per message and buys the guarantee that no broadcast can put on screen something the reader was not entitled to see |
| The inbox is one RPC, not a query per conversation | the unread count, the last-message preview and the other person are all per-conversation, and an inbox is exactly the screen where an N+1 shows |
| A conversation the caller is not in 404s | as for posts and profiles: a 403 would confirm that a conversation between two other people exists |
| A job's contact details live in their OWN table | RLS grants rows, not columns. Keeping the phone number on `jobs` meant choosing between a members-only job board -- which defeats the point -- and publishing employers' numbers to every crawler. Split, the listing is indexable and the number behind it is not |
| `job_contacts` has NO anon policy at all | that absence IS the feature. `14_jobs` asserts a signed-out reader sees the job, cannot read the contacts, and cannot reach them by joining from the row they CAN read |
| An application is private to its applicant and the employer | no staff policy, the second table after `messages` to depart from "staff moderate everything". Job fraud is real and worth moderating -- but what needs moderating is the POSTING, which staff read in full, not what applicants wrote about themselves to get work |
| A pay figure cannot be stored without a period | "50,000" could be a day or a month, and the difference is somebody's livelihood. A CHECK refuses the ambiguous row rather than letting it be published |
| Pay is whole naira in a `bigint` | nobody advertises a salary in kobo, and an integer avoids every rounding argument a float would invite |
| A filled job stays listed, marked filled | somebody who applied deserves to see what happened, and in a community where they will meet the employer at the market, a vacancy that silently vanished is worse than a refusal |
| The job is saved before its contact row | if the second write fails the employer keeps the advert and can add the details again; the other order loses everything they wrote because a phone number did not save. Same reasoning as saving a post before its images |
| Neither side of an application may edit the other's half | the guard restores `message` for anybody who is not the applicant and refuses a status change for anybody who is -- except 'withdrawn'. An employer cannot rewrite what somebody said about themselves, and an applicant cannot shortlist themselves |
| `listing_contacts` is genuinely OPTIONAL, unlike `job_contacts` | a job posting with no way to reach the employer is not a posting; a marketplace listing has a second route jobs did not have when built -- "Message the seller", reusing `open_direct_conversation` as-is |
| A listing's price CHECK is `price is null or price > 0` | simpler than a job's pay-period rule because a price is a one-time figure, not a recurring one; NULL means "ask" and zero is refused so a free item goes in the title, not a price field pretending to be a number |
| An issue has no visibility tiers and no groups | a broken borehole or washed-out road is not private information. Issues exist to be seen by as many people as possible, including whoever can fix it |
| `geo_id` is NOT NULL on issues | everywhere else NULL means "the whole LGA", which is a sensible default for a post and meaningless for a pothole |
| Issue coordinates must be strictly paired | a single coordinate puts a marker in the Gulf of Guinea (0,0); a database CHECK enforces both or neither |
| Community confirmations recount by trigger | confirming an issue is a statement of fact, not speech; withdrawing hard-deletes to keep the priority count accurate |
| Notifications are private to the recipient | `notifications` has no staff read policy; a member reads only their own alerts, keeping user activity private |
| Community Pulse 3D sphere | `SphereImageGrid` renders verified members active in last 24h; node badges overlay Gold vs Blue badges; images only (no text inside sphere); clicking opens post detail modal |
| Community Pulse 24h aggregation | RPC `get_community_pulse(limit)` aggregates activity across posts, comments, reactions for verified non-suspended members; groups by user for 1 entry per member |
| Two verification tiers: Golden & Blue | office holders, traditional leaders (Igwes, elders, councilors) receive a golden ticker with verification mark; regular citizens and active members receive a blue ticker with verification mark |
| Verification delegation is admin-only | only super_admin/admin can delegate verification authority via `verification_delegates`; delegated verifiers can grant/revoke badges but cannot suspend users or delete accounts |
| Verification requests queue | registered members can submit requests from `/verification`; admins and delegates review requests in `/admin/members` |
| Dual-tier constraint on profiles | `profiles_verified_check` enforces `((is_verified = false and verified_at is null and verification_type is null) or (is_verified = true and verified_at is not null and verification_type is not null))` |
| Verification requires a timestamp | `profiles_verified_check` enforces ((is_verified = false and verified_at is null and verification_type is null) or (is_verified = true and verified_at is not null and verification_type is not null)) |
| `listing_media` mirrors `post_media` almost exactly | a marketplace listing without photos is not a listing -- nobody buys a used refrigerator sight unseen -- so the same private-bucket, signed-URL, path-carries-the-owner discipline from migration 010 is reused rather than reinvented |
| Six photos per listing, not four | a listing is an item somebody may travel for, and a buyer reasonably wants more than one angle; a post is a moment, which needs less |
| `listings_select_public` was narrowed to `group_id is null` FROM THE START | the third table (after posts, then events and jobs) where this matters; writing it correctly on the first migration rather than needing a second one to fix a leak |
| `createListingAction` returns an id rather than redirecting | events' and jobs' create actions redirect because they have no upload step; a listing's photos upload AFTER the row exists, so the client needs the id back before it can navigate |
| An event is filtered on `ends_at` and ordered by `starts_at` | an event that began an hour ago and runs all day is STILL HAPPENING. Filtering on the start drops a funeral from the listing at the hour people are most likely to look it up |
| `events.ends_at` is filled by trigger, never left null | with a missing end set to midnight of the event's own WAT day, "still upcoming" is one indexed comparison instead of a rule restated in every query that asks -- and the copies would drift |
| Every event time is rendered in `Africa/Lagos`, explicitly | otherwise the same event reads 4pm in Enugu and 3pm in London, and it is the reader in London who turns up at the wrong time. Nigeria is UTC+1 with NO daylight saving, so a fixed zone is exact rather than approximate |
| The form value is parsed as WAT, not as the viewer's clock | `<input type="datetime-local">` sends "2026-09-12T16:00" with no zone at all; `new Date()` would read it wherever the browser happens to be, so one funeral submitted from Lagos and from London would become two different instants |
| Events are CANCELLED, not quietly removed | people arrange their day around a funeral or a meeting. An event that simply vanished would leave them turning up; the row is what tells them, and it can say why |
| `event_visibility` has no 'followers' tier | an event is an invitation to a place at a time, and "only my followers may know" is not something anybody organising a village meeting means. A tier nobody can satisfy is a trap |
| RSVP counts are RECOUNTED by trigger, not incremented | changing 'interested' to 'going' must MOVE a person between two counters, and a pair of deltas gets that wrong far more easily than a pair of counts gets it slow |
| Withdrawing an RSVP hard-deletes | an RSVP is a current intention, not speech; a tombstone would misstate who is coming, which is the one question the table exists to answer |
| 'not_going' is collected and never displayed | it is a useful number for the organiser and a needlessly public one to show -- naming everybody who declined a funeral would stop people answering honestly at all |
| Moderators may cancel or remove an event, never move it | the guard trigger restores every content column for anybody who is not the organiser. Moderation must not be able to change where somebody's funeral is being held |
| Presence is NOT a table | "who is online" is worthless a minute later, and storing it means a write per member per heartbeat to keep a fact nobody reads twice. It lives in Realtime, where it disappears with the connection -- which is exactly the lifetime the fact has |
| Presence rides its OWN channel, not the message channel | the two fail differently: presence needs a private channel whose authorization can refuse, and message delivery must not go down with it. If the presence channel never joins, the bar renders nothing and the thread behaves as it did before presence existed |
| The presence topic is authorised by `in_conversation`, the same rule as the messages | a broadcast channel is open to anyone holding its name by default. "They would have to know the conversation id" is obscurity, and the same argument was already rejected for the media bucket |
| The topic parser returns NULL, never raises | a cast that throws inside a policy turns a nonsense channel name into an ERROR, and an error in a policy is not a refusal. `12_presence` asserts null for ten malformed topics |
| Typing is asserted, never retracted | a client that closes its laptop mid-sentence sends no "stopped typing", so each signal carries its own expiry and the label goes away on its own |
| Typing is throttled, not debounced | somebody typing steadily should keep the label alive; a debounce would only ever fire once they had stopped |
| A group conversation consults `group_members` ONLY | `conversation_members` rows are READ MARKERS and nothing deletes them when somebody leaves a group. "A marker exists OR you are in the group" would mean anyone who once opened a group chat could read it forever after leaving. A read marker is not an access grant |
| A group chat is not fanned out to its members | opening it inserts no membership rows at all; markers are created on demand by the people who actually read. A group of five hundred must not materialise five hundred rows nobody has looked at |
| The unread baseline for a group is `greatest(marker, joined_at)` | joining should not greet you with everything said before you arrived, and REJOINING should not resurrect what was said while you were away. Without the `greatest`, a stale marker from a previous membership does exactly that |
| `conversations` carries a pair-or-group CHECK | a row with both a `dm_key` and a `group_id` would satisfy two different access rules at once, which is the sort of thing that gets discovered late |
| Teaching `in_conversation()` about groups was the whole slice | every message policy asks it, so reading, writing and withdrawing picked up their group rules without one of them being edited -- the same inheritance that gave comments and reactions the followers-only tier for free |
