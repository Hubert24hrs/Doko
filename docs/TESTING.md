# Testing

## Running

```bash
npm run test          # once
npm run test:watch    # watch
npm run verify        # typecheck + lint + test
```

## Current state -- honest

**44 unit tests, 4 files, all passing.** Typecheck clean, lint clean,
production build clean.

**No integration, RLS, or end-to-end tests exist yet**, because no database
has ever been connected. Nothing below should be described as "verified"
until it has actually run.

| Suite | File | Tests | Covers |
|---|---|---|---|
| Auth schemas | `tests/unit/auth-schemas.test.ts` | 20 | username rules, reserved names, email normalisation, Nigerian phone -> E.164, password policy, optional village, password match, consent |
| Redirect guard | `tests/unit/redirect.test.ts` | 9 | open-redirect defence incl. protocol-relative, backslash, control chars |
| Geo tree | `tests/unit/geo-tree.test.ts` | 9 | hierarchy nesting, siblings, orphan promotion, immutability |
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

### RLS policy tests -- WRITTEN, awaiting a database

`supabase/tests/01_schema.test.sql` (38 assertions) and
`supabase/tests/02_rls.test.sql` (24 assertions) are written and ready. Run
both with:

```bash
supabase test db
```

They have **not been executed** -- no database has been available. Expect to
fix a few assertions on first run; that is what the first run is for.

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
