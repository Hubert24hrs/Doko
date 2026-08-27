# Architecture

How Ezike Oba is put together, and why. For status and commands see
[`CLAUDE.md`](../CLAUDE.md).

---

## System shape

```
            Browser  /  (later) Android + iOS
                          |
                    Next.js 16 App Router
        Server Components - Server Actions - Route Handlers
                          |
                    @supabase/ssr
                (anon key + user session)
                          |
                       Supabase
         Postgres + RLS | Auth | Storage | Realtime
```

There is no separate API tier. Server Components read directly through a
request-scoped Supabase client that carries the caller's session, so **Row
Level Security applies to server reads exactly as it would in the browser**.
That removes the most common source of authorization bugs: a privileged
backend that forgets to re-check who is asking.

---

## Authorization model

Three layers, in descending order of authority:

| Layer | File | Is it the boundary? |
|---|---|---|
| RLS policies | `supabase/migrations/*_rls_policies.sql` | **Yes** |
| Server guards | `src/features/auth/session.ts` | No -- UX |
| Proxy redirects | `src/proxy.ts` | No -- UX |

The guards exist to produce a good redirect instead of an empty page. If both
upper layers were deleted, an attacker would still read nothing they are not
entitled to, because the database refuses.

### Why roles live in their own table

`user_roles` is separate from `profiles`. A profile is user-editable; roles
are not. Keeping them apart means no possible `profiles` UPDATE -- however
malformed or malicious -- can grant privilege. Fields that confer status
(`is_verified`, `is_suspended`, ...) are additionally restored from the old
row by the `profiles_guard_privileged` trigger for non-admins.

Only a `super_admin` can create an `admin` or another `super_admin`. That is
the single escalation boundary, enforced in the `user_roles` INSERT policy.

### RLS recursion

A policy on a table must never `SELECT FROM` that same table: Postgres
re-applies the policy to the subquery and aborts with *"infinite recursion
detected in policy"*. Where a policy genuinely needs to read the caller's own
row -- as `profiles_select_visible` does, to compare communities -- it calls a
`SECURITY DEFINER` helper (`shares_community_with`) which runs with RLS
bypassed. That is safe because the helper exposes nothing beyond a boolean
about the caller's own affiliation.

---

## The geographic tree

One self-referencing table, `geo_entities`, with a `kind` discriminator.

**Rejected alternative:** separate `towns`, `districts`, `villages` tables.
It reads more naturally, but every admin operation the product requires --
move a village to a different parent, merge two duplicates, reorder siblings,
mark an entity historical -- becomes a cross-table migration instead of an
`UPDATE ... SET parent_id`. One tree wins on the operations that actually
happen.

Read ergonomics are restored with `v_towns`, `v_districts`, `v_villages` and
`v_autonomous_communities`, all `security_invoker = on` so they respect the
caller's RLS rather than the view owner's.

**Integrity guarantees**

* `geo_entities_cycle_guard` trigger -- a move can never create a loop
* `ON DELETE RESTRICT` on `parent_id` -- a parent with children cannot vanish
* `merged_into_id` -- merged entities stay resolvable instead of dangling
* `deleted_at` soft deletion -- historical references survive
* partial unique index on `(parent, slug)` -- "Umuogbo" may exist under two
  districts, but not twice under one

The real hierarchy is messier than the product brief assumed: Enugu-Ezike
divides into four traditional districts, while the 20 INEC council wards are
an *electoral overlay* that does not line up with them. Wards are therefore
stored as `area` entities under their town, not pretended to be districts.

---

## Data access

Queries live in `src/features/*/queries.ts`, never inline in a page.

* `cache()` from React dedupes repeated reads within one render pass.
* Counts use `head: true` so Postgres returns a count without shipping rows.
* `getVillageOptions` embeds parent names in a single query rather than
  issuing one lookup per village -- no N+1.
* `buildTree` assembles the adjacency list into a tree in one pass, and
  **promotes orphans** rather than dropping them, so a village whose district
  was archived never silently disappears.

### Failure is rendered honestly

A failed count returns `null`, rendered as an em dash. Returning `0` would
tell a reader "there are no villages in Igbo-Eze North", which is a lie with
the same shape as the truth. This is a deliberate, tested rule.

---

## Rendering strategy

Pages that read per-request data are `force-dynamic`. They still server-render
complete HTML, so SEO is unaffected; only the build-time snapshot is skipped.
This also keeps `next build` working when no database is configured, which
matters for CI.

Static: `/login`, `/register/check-email`, `/_not-found`.

---

## Design system

All tokens live in `src/app/globals.css`. Tailwind v4 is configured in CSS --
there is no `tailwind.config.js`.

The palette is a deep palm green with harvest gold and red-clay accents --
regional without being costume, and deliberately not the blue that every
social network defaults to.

Rules the tokens enforce:

* every colour is defined in the light `:root` block first, then overridden
  for dark; nothing gets its only definition inside a media query
* dark mode responds to both `prefers-color-scheme` and an explicit
  `data-theme`
* one focus treatment for the entire app
* `prefers-reduced-motion` is honoured globally

Typography uses the platform UI stack. `next/font/google` was rejected: it
downloads font files from Google at build time (a hard CDN dependency for
every build) and leaks reader IPs. For members on slow Nigerian mobile
networks, system fonts also paint instantly with zero font bytes. A bespoke
typeface can be self-hosted later via `next/font/local`.

---

## Rate limiting

`consume_rate_limit()` is a Postgres function performing an atomic
`INSERT ... ON CONFLICT DO UPDATE` against a fixed window.

An in-process counter was rejected outright: on Vercel every cold start resets
it and concurrent lambdas share nothing, so it would provide the appearance of
a control with none of the effect.

The limiter **fails open** on database error. A limiter outage must not become
a total sign-in outage. Abuse remains bounded by Supabase Auth's own limits.
This trade-off is recorded in [`SECURITY.md`](./SECURITY.md).

---

## Known limits

* No Supabase project is connected, so migrations and RLS are **written but
  unexecuted**. See `CLAUDE.md` section 12.
* `src/types/database.ts` is hand-maintained. Once a project is linked,
  `npm run db:types` regenerates it from the live schema.
* The AI layer is not built. It presupposes a social core with real content to
  ground answers in; that content does not exist yet.
