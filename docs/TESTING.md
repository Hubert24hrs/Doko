# Testing

## Running

```bash
npm run test          # once
npm run test:watch    # watch
npm run verify        # typecheck + lint + test
```

## Current state -- honest

**216 unit tests, 15 files, all passing.** Typecheck clean, lint clean,
production build clean.

**374 database assertions pass against the live hosted project**, across
fifteen pgTAP suites. They are run by pasting each file into the Supabase SQL Editor,
not by `supabase test db` -- there is no Docker here. See "Database tests"
below.

No end-to-end (browser) tests exist yet. Everything else below has actually
run; nothing here is aspirational.

### Unit suites

| Suite | File | Tests | Covers |
|---|---|---|---|
| Auth schemas | `tests/unit/auth-schemas.test.ts` | 22 | username rules, reserved names, email normalisation, Nigerian phone -> E.164, password policy, optional village, password match, consent |
| Group schemas | `tests/unit/group-schemas.test.ts` | 21 | slug derivation incl. Igbo diacritics, the empty-slug fallback the action depends on, bounds mirroring the CHECK constraints, end-state membership intent |
| Media | `tests/unit/media.test.ts` | 18 | storage path shape, accepted types, per-post limit, aspect ratio |
| Comment schemas | `tests/unit/comment-schemas.test.ts` | 15 | body bounds, trimming, parent id, edit payload |
| Post schemas | `tests/unit/post-schemas.test.ts` | 14 | body bounds, optional community -> null, visibility enum |
| Profile schema | `tests/unit/profile-schemas.test.ts` | 12 | blank optionals -> null, optional village, phone normalisation, http(s)-only website, bio length, visibility enum, privileged fields stripped |
| Redirect guard | `tests/unit/redirect.test.ts` | 12 | open-redirect defence incl. protocol-relative, backslash, control chars |
| Geo tree | `tests/unit/geo-tree.test.ts` | 7 | hierarchy nesting, siblings, orphan promotion, immutability |
| Message schemas | `tests/unit/message-schemas.test.ts` | 16 | body bounds measured after trimming, newlines preserved, an edit may not empty a message because withdrawing is a different act |
| Env schema | `tests/unit/env.test.ts` | 6 | required variables, URL validation, site-URL default, multi-error reporting |

## Configuration

`vitest.config.mts`:

* `environment: "node"` -- current suites are pure logic. A component test
  opts into jsdom per file with `// @vitest-environment jsdom`.
* `pool: "forks"`, `fileParallelism: false` -- spawning a worker per file
  timed out on this machine.
* `tests/setup.ts` stubs `server-only`, which throws outside a Server
  Component. This does not weaken the real build; Next.js still enforces the
  boundary at compile time.

## What is tested, and why those things

Tests target logic that can be wrong in a way types cannot catch:

* **Validation rules** -- the phone normaliser and username constraints have
  real edge cases.
* **The redirect guard** -- a security control; each rejected shape gets a
  case.
* **Tree assembly** -- including that orphans are *promoted, not dropped*,
  which is the behaviour that keeps a village from vanishing when its district
  is archived.

Deliberately not tested: that Next renders a page, that Supabase returns rows,
or other framework behaviour. Those belong in integration tests against a real
database.

## Required before production

### Database tests -- RUN AND PASSING against the hosted project

**All 374 assertions pass** against the live project, 01-09 as of 2026-09-01
and the messaging, presence, events, jobs and marketplace suites as of
2026-09-02/03:

| Suite | Assertions | Covers |
|---|---|---|
| `01_schema.test.sql` | 38 | structure, RLS enabled, definer helpers pin `search_path` |
| `02_rls.test.sql` | 29 | behaviour under impersonation; the privilege-escalation boundary |
| `03_seed.test.sql` | 9 | the seeded Igbo-Eze North hierarchy |
| `04_posts.test.sql` | 22 | post visibility tiers, soft deletion, moderator limits |
| `05_comments.test.sql` | 18 | replies and reactions; both author FKs target `profiles` |
| `06_media.test.sql` | 19 | storage policies; an image is visible exactly when its post is |
| `07_follows.test.sql` | 16 | one-directional follows, counts, self-follow refused |
| `08_followers_posts.test.sql` | 13 | the followers-only tier, inherited by replies and images |
| `09_groups.test.sql` | 27 | membership as the access rule; the private-group leak below |
| `10_messages.test.sql` | 38 | the pair key; withdrawal; **staff read nothing** |
| `11_group_conversations.test.sql` | 29 | **leaving a group ends access despite the surviving read marker** |
| `12_presence.test.sql` | 14 | the presence topic parser refuses ten malformed topics **without raising** |
| `13_events.test.sql` | 35 | the filled WAT end date; a moderator may cancel but **not move** an event |
| `14_jobs.test.sql` | 35 | a signed-out reader sees the job and not the phone number; nobody but the applicant and the employer reads an application |
| `15_marketplace.test.sql` | 32 | a private group listing is invisible despite `visibility='public'`; contact details are optional and still not public when given |

With a linked local database they would run as `supabase test db`; here each
file is pasted into the SQL Editor instead.

The 38 assertions in `10_messages` are WRITTEN AND NOT YET RUN. Until they
have passed against the hosted project, direct messages must not be described
as working, and `/messages` will in fact fail at runtime because migration 015
has not been applied.

Two of them are the reason the suite exists. The first is that **a moderator
and an admin can both read exactly nothing**: `messages` is the one table in
this schema with no staff read policy, and a test is the only thing that will
notice the day somebody adds one "for moderation". The second is the canonical
pair key -- Bob opening a conversation with Alice must land in *Alice's*
conversation, because without the least/greatest ordering the two of them get
one conversation each and half the history apiece, with no error anywhere.

The assertion that most earned its place so far is in `09_groups`: a post inside a
**private** group, left at the column default `visibility = 'public'`, must be
invisible to an anonymous reader. Permissive policies are OR'd, so before
migration 014 narrowed the four existing post policies to `group_id is null`,
that post would have been readable by the entire internet while the group
itself looked locked. The suite uses a default-visibility post deliberately,
because that is the shape the application actually inserts.

A third lesson, added after the feed shipped broken: **verify the thing, not a
proxy for it.** posts.author_id referenced auth.users while the feed embedded
profiles, so PostgREST could not resolve `author:author_id(...)` and the whole
feed query failed. It was reported as working because rows existed in the
database when queried WITHOUT the embed. 05_comments now asserts that both
author foreign keys target profiles, which is the property the embed actually
depends on.

Two lessons the first live runs taught, both now structural rather than
remembered:

* **Never count whole tables.** Assertions that counted every row in
  `profiles` broke the moment a real member signed up, reporting a defect in
  the signup trigger when the only thing that changed was the platform gaining
  a user. Membership counts are scoped to the suite's own fixture UUIDs.
  Absolute counts remain where they are the stronger claim -- a citizen must
  see ZERO audit rows however many exist.
* **Fixtures are deny-by-default.** Every fixture profile is set private
  first, and only the ones an assertion needs are opened up. Twice a new
  fixture inherited the `public` column default and silently joined the
  anonymous-visitor count.

The first real run found five defects -- four in the tests and scaffolding,
one in production code. See docs/SECURITY.md for the rate limiter, which is
the one that mattered.

Because there is no Docker here, the suites are written in portable SQL and
run by pasting them into the hosted SQL Editor. Two consequences shaped how
they are written: no psql meta-commands (no `\set`), and each file ends with a
`coalesce` over `finish()` so exactly one row is always returned -- either the
named failures or `ALL ASSERTIONS PASSED`. The editor shows only the final
statement's result, so a suite that reported nothing on success was
indistinguishable from one whose failures scrolled past.

`01_schema` asserts structure: extensions, enums, tables, that RLS is enabled
on every exposed table, that `audit_logs` has no write policy for anyone, that
`rate_limit_counters` has no policies at all, that every privileged helper is
SECURITY DEFINER *and* pins `search_path`, plus the geographic and social-link
CHECK constraints.

`02_rls` asserts behaviour by impersonating real identities with `set local
role` and a forged JWT claim, exactly as PostgREST does:

1. the signup trigger creates a profile and a `citizen` role
2. a citizen cannot read `audit_logs`; an admin can
3. nobody -- including `super_admin` -- can UPDATE or DELETE an audit row
4. a citizen cannot grant themselves any role
5. a citizen cannot read another member's roles
6. an `admin` can appoint a moderator but **cannot** mint another `admin`
7. a `super_admin` can mint an `admin`
8. a member cannot set `is_verified` on their own profile...
9. ...but can still edit their own ordinary fields
10. a `community` profile is hidden outside the community, visible inside it
11. a `private` profile stays visible to its owner
12. anonymous visitors see only public profiles
13. `consume_rate_limit` allows up to the limit and refuses beyond it, per bucket

Still to write: `community_admin` subtree scoping, and migration idempotency.

### Migration tests

* migrations apply cleanly to an empty database
* they are idempotent (re-running changes nothing)
* `seed.sql` is idempotent
* the `handle_new_user` trigger creates a profile and a `citizen` role
* the username de-duplication loop produces a valid username under collision
* `geo_entities_cycle_guard` rejects a cycle

### End-to-end (Playwright, not yet installed)

* register -> confirm -> sign in -> sign out
* signed-out user hitting `/home` is redirected to `/login?next=/home`
* non-staff user hitting `/admin` is redirected
* the communities directory renders seeded data
* keyboard-only navigation of both auth forms

## Accessibility checks

Built in rather than bolted on: one global focus treatment,
`prefers-reduced-motion` honoured globally, icons `aria-hidden` with
accessible names on icon-only controls, `role="alert"` on errors, labels tied
to controls through `Field`, and a skip link.

Not yet done: automated axe runs, and a real screen-reader pass.
