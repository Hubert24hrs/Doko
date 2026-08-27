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

### RLS policy tests (blocked on a database)

Write as SQL under `supabase/tests/`, run with `supabase test db`:

1. non-staff cannot read `audit_logs`
2. a user cannot insert a row into `user_roles` for themselves
3. an `admin` cannot create another `admin` (only `super_admin` can)
4. a user cannot set `is_verified` on their own profile
5. a `private` profile is invisible to others, visible to its owner
6. a `community` profile is visible only within the same community
7. anonymous visitors see only `public`, non-suspended profiles
8. a `community_admin` can update only their own subtree
9. `consume_rate_limit` blocks at the configured threshold
10. nobody -- including `super_admin` -- can UPDATE or DELETE an audit row

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
