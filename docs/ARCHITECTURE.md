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

---

## The social core (Phase 2)

### Visibility is decided once, in one place

A post carries a `visibility` (`public`, `community` or `followers`) and a
`geo_id` -- or it carries a `group_id`, in which case visibility is ignored
entirely and membership of the group decides. RLS on `posts` turns that into
an answer. Everything else defers to it:

* `comments` and `reactions` policies are an `EXISTS` against `posts`. They do
  not restate who may see what. A second copy of those rules would be a second
  thing to keep in sync, and the copy outside the source of truth is the one
  that drifts.
* The feed query applies **no** visibility filter. It asks for posts and lets
  the policies decide. This is why the feed cannot leak: there is no
  application-level filter that could disagree with the database.
* `/posts/[id]` serves 404, not 403, for a post the caller cannot see. A 403
  would confirm the post exists.

`geo_id NULL` means the whole LGA, which is the right default rather than a
special case: village affiliation is optional, so a member who never chose one
must still be able to post to somebody.

### Groups, and the leak that OR'd policies would have caused

A group is a place with a membership, and **membership IS the access rule**. A
group post therefore ignores `post_visibility` completely -- applying both
would let a member accidentally hide a post from the very group they posted it
in, so the group composer offers no visibility selector at all.

That decision has a consequence that is easy to get wrong. **Multiple
permissive policies are OR'd together.** A post inside a private group still
carries the `visibility` column, and its default is `'public'` -- so
`posts_select_public` would have matched it, and the post would have been
readable by the entire internet while the group looked properly locked.
Replies and images, which ask an `EXISTS` against `posts`, would have followed
it out.

Migration 014 therefore does two jobs. It creates groups, and it narrows
`posts_select_public`, `posts_select_community`, `posts_select_followers` and
`posts_insert_own` to `group_id is null`, so a group post matches exactly one
policy: `posts_select_group`. `posts_select_own` and `posts_select_staff` are
deliberately left alone -- an author should still see their own post after
leaving a group, and staff moderate everything.

Reading a public group does not entitle you to write in it:
`posts_insert_group` requires membership whatever the group's visibility.

Two smaller rules keep a group coherent:

* **The creator is made owner by a trigger**, not by the application, so a
  group can never exist without somebody responsible for it -- however it was
  created.
* **A group must always keep one owner.** The guard refuses both the last
  owner leaving and the last owner self-demoting, which are the same problem
  by two routes. It raises rather than filtering, so unlike most refusals here
  it fails loudly and gets its own message in the UI.

Private groups cannot be joined at all; that is what makes them private. A
"request to join" tier would mean a `join_requests` table adding rows through
a definer function, not a third enum value -- which is why
`group_visibility` has exactly two.

### Deletion has two different meanings

| | Removal | Why |
|---|---|---|
| Posts, comments | soft (`deleted_at`) | moderation must stay auditable, and an author should see that their post was removed rather than watch it vanish |
| Reactions | hard `DELETE` | a reaction is a signal, not speech; a withdrawn one leaves nothing worth keeping, and a tombstone would misstate what the member currently thinks |

Neither `posts` nor `comments` has a `DELETE` policy for any role, including
`super_admin`. The guard triggers additionally restore `body` for anyone who
is not the author, so a moderator can remove but never rewrite. Moderation
must never be able to put words in a member's mouth.

### Reading the feed

* **Keyset pagination** on `created_at`, not `OFFSET`. Offsets slow with depth
  and skip or repeat rows when new posts arrive mid-scroll — on a feed that is
  the normal case, not an edge case.
* **Author and community are embedded** in the same query. Per-row lookups
  would be twenty-one round trips per page.
* **Engagement counts are denormalised** on `posts` and trigger-maintained.
  Counting per post at read time is twenty aggregates per page and gets worse
  as the platform grows. `recount_post_engagement()` repairs drift.

### One constraint worth remembering

`posts.author_id`, `comments.author_id` and `messages.author_id` reference
`public.profiles`, not `auth.users`. The identity is identical — `profiles.id` IS the auth user id —
but **PostgREST can only embed across a foreign key whose target is in the
exposed schema**. Pointing them at `auth.users` makes `author:author_id(...)`
fail with PGRST200, which takes down the entire feed query rather than merely
omitting a name. This shipped broken once. `05_comments` now asserts it.

## Messaging (Phase 3)

### One conversation per pair, or none

A direct conversation is identified by `dm_key`, the two member ids ordered and
joined: `least(a,b) || ':' || greatest(a,b)`. The ordering is the whole point.
Without it, `(a,b)` and `(b,a)` are different strings, two people who message
each other at the same moment get a conversation each, and they hold half the
history apiece with no error raised anywhere.

Conversations are created by `open_direct_conversation()` and by nothing else.
`conversations` has **no INSERT policy for any role**, because creating one
means inserting a membership row for the other person -- and no policy can
safely allow one member to add another. `group_members` refuses exactly that,
for exactly the same reason. The function is a SECURITY DEFINER, is idempotent
("open", not "create"), and resolves the simultaneous-press race with
`ON CONFLICT` so the loser joins the winner's conversation rather than seeing
an error.

Who may be messaged is **the same rule that decides whether the profile is
visible at all**: public profiles are open, `community` profiles only to people
who share a community, `private` to nobody. That reuse gives the
anti-harassment property -- a private profile cannot be messaged cold -- without
a second copy of the rule to keep in step.

### Staff cannot read messages

This is the one place the schema departs from "staff moderate everything".
`messages` has no staff SELECT policy, and `10_messages` asserts that a
moderator and an admin both read exactly nothing.

A post is public speech and moderating it is legitimate. Private correspondence
between two people is not, and a moderation queue is not a reason to hand every
moderator everyone's messages. When reporting arrives, the right shape is a
definer function that surfaces **one reported message** and records who looked
at it -- not a blanket read policy.

### Withdrawal takes the words with it

A withdrawn message keeps its row and loses its body, and the blanking happens
in a **database trigger** rather than in the UI. That matters more here than it
does for a post: a message may already be in flight to a subscribed client, sat
in a cached payload, or on its way through a realtime broadcast. Hiding it in
the renderer would leave the text in every one of those places.

The row itself stays, as a post's does. A hole in a thread is more confusing
than a tombstone, and every reply above it stops making sense.

### A realtime event is a signal, not data

The thread subscribes to Postgres Changes on `messages` for its conversation
and, on any event, **discards the payload** and re-runs the server component.

Postgres Changes are RLS-filtered, so in principle the payload could be
rendered directly. Treating it as a signal instead means what finally reaches
the screen has passed through RLS on the server exactly as a fresh page load
would. It costs one round trip per incoming message and buys the guarantee that
no broadcast can ever put on screen something the reader was not entitled to
see. In a two-person conversation that trade is obviously worth making.

When the channel is not subscribed the composer says so, and the thread still
works on refresh -- realtime degrades rather than breaks.

### A group conversation is the group's membership

A conversation carries either a `dm_key` (a pair) or a `group_id` (a group),
never both -- the same `group_id is null` split that already separates a group
post from a feed post, and a CHECK constraint keeps it honest.

Almost nothing had to be written for this. Every message policy asks
`in_conversation()`, so teaching that one function about groups gave reading,
writing and withdrawing their group rules without a single policy being edited
-- the same inheritance that let comments, reactions and media pick up the
followers-only tier for free.

**The one thing that had to be got right: a read marker is not an access
grant.** `conversation_members` rows exist to remember where somebody had read
up to. They are created when a member first opens a thread, and nothing deletes
them when that member later leaves the group. So the obvious implementation --

> you are in the conversation if a membership row exists **or** you are in the
> group

-- is wrong in the direction that leaks: anybody who had ever opened a group's
chat could go on reading it forever after leaving. A group conversation
therefore consults `group_members` **only**, and `11_group_conversations`
leaves a marker behind on purpose before asserting that the departed member
sees nothing.

Two consequences worth keeping:

* **No fan-out.** Opening a group chat inserts no membership rows at all. A
  group of five hundred must not materialise five hundred read markers nobody
  has looked at, so markers are created on demand by the people who read.
* **The unread baseline is `greatest(marker, joined_at)`.** Joining a group
  should not greet you with four thousand messages from before you arrived, and
  rejoining should not resurrect what was said while you were away. Take the
  `greatest` out and a stale marker from a previous membership does exactly
  that.

Reading a public group still does not entitle you to its conversation, for the
same reason it does not entitle you to post in it.

### The inbox is one round trip

`my_conversation_summaries()` returns the unread count, the last-message
preview and the other participant for every conversation at once. All three are
per-conversation, so computing them in the application is three queries per row
on the single screen where that is most visible.

Unread is derived from `conversation_members.last_read_at` rather than from a
per-message receipts table: one row per person per conversation answers the
question just as well and does not grow with the conversation. Sending a
message advances the sender's own marker, or everyone would carry an unread
count that included their own messages.
