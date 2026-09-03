# Security

Threat model, controls, and the trade-offs taken deliberately.

---

## Principles

1. **The database is the boundary.** Every other check is convenience.
2. **Least privilege.** The anon key is the default; the service-role key is
   the rare, deliberate exception.
3. **Never trust the client.** Not its role claims, not its validation, not
   its redirect parameters.
4. **Fail honestly.** Errors are logged with detail server-side and returned
   to users in generic form.

---

## Secret handling

| Key | Exposure | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public, by design | every request it makes is filtered by RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | **secret** | bypasses RLS entirely |

`src/lib/env.server.ts` imports `server-only`. Importing it from a Client
Component is a **build error**, so the service-role key cannot reach the
browser by accident. `requireServiceRoleKey()` is a single named accessor,
so every privileged use is greppable in review.

`.gitignore` excludes `.env` and `.env.*` while explicitly re-including
`.env.example`.

---

## Row Level Security

RLS is enabled on `geo_entities`, `profiles`, `profile_social_links`,
`user_roles`, `audit_logs` and `rate_limit_counters`, with explicit policies
per command. No table is left with RLS on and no policy "to be added later",
and no policy exists merely to make a feature work.

**Grants matter too.** RLS filters rows; grants decide whether the table is
reachable at all. Both are set in `20260827000005_rls_policies.sql`.

### Privilege escalation boundary

`user_roles` INSERT:

```sql
case when role in ('super_admin','admin') then public.is_super_admin()
     else public.is_admin() end
```

An `admin` can appoint moderators but cannot manufacture another `admin`.

### Self-service escalation

Blocked by `profiles_guard_privileged`, which for non-admins restores
`is_verified`, `verified_at`, `is_suspended`, `suspended_until`, `deleted_at`
and `created_at` from the previous row. Values are restored rather than
rejected, so a client posting a whole row back does not error -- it simply
cannot change what it must not change.

### Audit trail

`audit_logs` has **no INSERT, UPDATE or DELETE policy for any role**,
including admins. Rows arrive only via `log_admin_action()`, which is
`SECURITY DEFINER`, resolves the actor from `auth.uid()` and refuses
unauthenticated calls. Nobody edits history.

### Staff cannot read private messages

`messages` is the one table in this schema with **no staff SELECT policy**.
Moderators and admins can read posts, comments, media and groups; they read
exactly nothing in anybody's correspondence, and `10_messages` asserts it for
both roles so that the day somebody adds a policy "for moderation" the suite
fails rather than the guarantee quietly disappearing.

A post is public speech, and moderating it is legitimate. Private
correspondence between two people is not, and a moderation queue is not a
reason to hand every moderator everybody's messages. When reporting is built,
the right shape is a `SECURITY DEFINER` function that surfaces **one reported
message** and records who looked at it -- an access that leaves a trail, not a
blanket read policy.

Three supporting properties, all asserted:

* `conversations` and `conversation_members` have **no INSERT policy for
  anyone**. Opening a conversation inserts a membership row for the other
  person, which no policy can safely permit, so it happens only inside
  `open_direct_conversation()`.
* Who may be messaged is the **profile-visibility rule reused**, not restated:
  a `private` profile cannot be messaged cold, and one error covers "no such
  person", "they are private" and "they are suspended" alike so the button
  cannot be used to tell them apart.
* Withdrawing a message **blanks the body in the database**, not in the UI. The
  text may already be in a cached payload or a realtime broadcast; hiding it in
  the renderer would leave it in both.

### A public page that is not a phone directory

A job listing has to be public and indexable, because that is how somebody
finds work. The employer's phone number must not be, or the board becomes a
harvesting ground within a week.

RLS grants **rows, not columns**, so this could not be solved on one table:
keeping the number on `jobs` meant choosing between a members-only job board
and publishing every employer's number to every crawler. The contact details
therefore live in `job_contacts`, which has **no `anon` policy at all** --
that absence is the feature -- and whose read policy additionally asks
`is_active_member()`, so a suspended account cannot harvest them either.

`14_jobs.test.sql` asserts all three halves: a signed-out reader sees the job,
cannot read the contacts, and cannot reach them by joining from the row they
CAN read.

### Applications are private, including from staff

`job_applications` is the second table after `messages` to depart from "staff
moderate everything". Only the applicant and the employer may read one.

Job fraud is real and worth moderating. But what needs moderating is the
**posting** -- which staff can read in full, edit-guarded so they may remove it
without rewriting it -- not what applicants wrote about themselves in order to
get work.

Neither side may edit the other's half of an application: a guard trigger
restores `message` for anybody who is not the applicant, and refuses a status
change for anybody who is, except to `withdrawn`. So an employer cannot rewrite
what somebody said about themselves, and an applicant cannot shortlist
themselves.

### Contact details are optional here, unlike a job's

`listing_contacts` uses the same split as `job_contacts` -- no `anon` policy
at all, `is_active_member()` required on top of ordinary visibility -- but
with one difference. A job posting with no way to reach the employer is
refused by the schema, because there was nothing else a candidate could do.
A marketplace listing has a second route that did not exist when jobs was
built: **messaging**. A seller who would rather not publish a phone number
can rely on "Message the seller" instead, so `createListingAction` writes to
`listing_contacts` only when the seller actually gave something, and a
listing with no contact row at all is a normal, fully functional listing.

`15_marketplace.test.sql` asserts the split holds regardless: a signed-out
reader sees the listing but never the contact row, cannot reach it by joining
from the listing they can read, and a member who is not the seller cannot
write to it at all.

### The same leak, closed correctly the first time

`listings_select_public` is narrowed to `group_id is null` in the migration
that CREATES the table, rather than needing a second migration to fix it the
way posts did. A listing inside a private group carries `visibility='public'`
by column default; without the narrowing, permissive policies being OR'd
together would have made it readable by the whole internet while the group
looked locked. `15_marketplace` asserts exactly that row.

### A read marker is not an access grant

A group conversation's membership is the **group's** membership and nothing
else. `conversation_members` rows exist only to remember where somebody had
read up to; they are created when a member first opens a thread, and nothing
removes them when that member later leaves the group.

So `in_conversation()` must not be written as *"a membership row exists OR you
are in the group"*. That reading leaks: anybody who had ever opened a group's
chat could go on reading it after leaving. For a group conversation the
function consults `group_members` alone, and
`11_group_conversations.test.sql` deliberately leaves a stale marker behind
before asserting that the departed member can no longer see the conversation,
read its messages, write into it, or find it in their inbox.

Reading a public group does not entitle you to its conversation, for the same
reason it does not entitle you to post in it.

---

## Authentication

* `supabase.auth.getUser()` everywhere -- it revalidates the JWT with the auth
  server. `getSession()` trusts the cookie and is not used for authorization.
* Sign-in returns **one generic message** for both "no such account" and
  "wrong password", so the form cannot enumerate registered emails.
* Sign-up does surface "email already registered" -- unavoidable in an
  email-confirmation flow, and it reveals nothing the password-reset flow
  would not.
* Password policy: 10-72 characters with upper, lower and a digit. The upper
  bound is bcrypt's input limit; without it, long passwords are silently
  truncated.

---

## Input validation

Every Server Action re-parses the same zod schema the client used. Client
validation is for feedback only.

Defence in depth on top of application validation:

* `profiles_username_format` CHECK -- `^[a-z0-9_]{3,30}$`
* `social_url_scheme` CHECK -- `^https?://`, so a `javascript:` URL cannot be
  **stored**, not merely not rendered
* `profiles_website_scheme` CHECK -- same
* latitude/longitude range CHECKs
* `geo_entities_root_only_lga`, `geo_entities_no_self_parent`,
  `geo_entities_no_self_merge`

---

## Open redirect

`safeRelativePath` (`src/lib/security/redirect.ts`) rejects:

* anything not starting with `/`
* protocol-relative `//evil.example`
* any string containing a backslash (browsers may normalise `\` to `/`)
* any C0 control character or DEL (tab/newline/NUL smuggling)

Applied to the `next` parameter in `/auth/callback`. Covered by 9 tests
including the header-injection and NUL cases.

---

## Rate limiting

`consume_rate_limit()` -- atomic `INSERT ... ON CONFLICT DO UPDATE` on a fixed
window, stored in Postgres.

| Action | Limit |
|---|---|
| register | 5 / hour / IP |
| login | 10 / 15 min / IP |

`rate_limit_counters` has RLS enabled and **zero policies**, so it is
unreachable through PostgREST; the `SECURITY DEFINER` function is the only door.

### Accepted trade-off: fails open

If the limiter's database call fails, the request is **allowed** and the
failure is logged.

*Why:* failing closed converts a degraded dependency into a total sign-in
outage for every member. Supabase Auth applies its own throttling underneath,
so the exposure is a window of unthrottled attempts, not unlimited ones.

*Revisit if:* credential-stuffing is observed in practice. The change is one
line in `src/lib/security/rate-limit.ts`.

### Known limitation

The IP comes from `x-forwarded-for`, which is trustworthy behind Vercel's
proxy but spoofable if the app is ever served without one. Locally it falls
back to a constant.

---

## Prompt injection (forward-looking)

The AI layer is not built. When it is, treat every retrieved document and all
user content as **untrusted data, never instructions**, keep system prompts
server-side and unrewritable, and re-check every retrieved row against the
caller's permissions -- vector metadata is not an access control.

---

## Not yet verified

Most of what this document claims has been **executed against the hosted
project**: 342 pgTAP assertions cover the escalation boundary, the append-only
audit trail, every profile visibility tier, the rate limiter's threshold, post
and group visibility, the storage policies, the messaging rules above --
including that a moderator and an admin each read nothing -- and the jobs
split between a public listing and private contact details. Those are proven,
not asserted.

What is still unproven, and must not be described as working:

1. **The marketplace.** Migration 020 has not been applied and
   `15_marketplace` (32 assertions) has not been run.
2. **Realtime delivery.** The subscription and the publication line exist;
   nothing has been watched arriving live in a second browser. It degrades
   rather than breaks -- the composer says so when the channel is not
   subscribed.
3. **`community_admin` subtree scoping.** A community admin should be able to
   edit only their own part of the geographic tree. Written, never asserted.
4. **Migration idempotency.** The files are written to be re-runnable and have
   been re-run by hand, but nothing tests it.
5. **Passkey sign-in.** Enrolment works; the sign-in ceremony has never been
   completed on a real device.

Tracked in [`TESTING.md`](./TESTING.md).

---

## Incident: rate limiting was silently inert (found 2026-09-01)

Found by the first execution of `supabase/tests/02_rls.test.sql` against a real
database. Worth recording in full, because the failure mode is the dangerous
kind.

`consume_rate_limit()` declared its third output column as `window_start`. A
`RETURNS TABLE` column becomes a PL/pgSQL variable inside the function body,
and `rate_limit_counters` has a column of the same name, so every reference in
the `INSERT ... ON CONFLICT` was ambiguous:

    ERROR 42702: column reference "window_start" is ambiguous

Three things combined to make this invisible:

1. PL/pgSQL bodies are not fully validated at `CREATE` time, so migration 006
   applied cleanly and the function looked healthy.
2. It failed only when **called** -- on every login and registration attempt.
3. `checkRateLimit()` **fails open** by design, so a limiter outage cannot lock
   every member out of sign-in.

The result: login and registration rate limiting would have been entirely
inert in production. No failed requests, no user-visible symptom, one console
line per attempt. A brute-force control that was documented, unit-tested,
reviewed -- and worthless.

**Fixed** by renaming the output column to `window_started_at`, in the
migration, `src/lib/security/rate-limit.ts` and the generated types together.
Verified by calling the function four times against a limit of three and
confirming the fourth call returns `allowed = false`.

**The lesson for fail-open controls.** Failing open is still the right choice
here -- availability beats a partial abuse control, and Supabase Auth throttles
independently. But a fail-open control cannot be trusted to announce its own
death. It needs a test that calls it and asserts it actually refuses, which is
what `02_rls` now does. Any future fail-open control gets the same treatment.

---

## Gotcha: privileged profile fields cannot be set from raw SQL

`profiles_guard_privileged_columns()` restores `is_verified`, `is_suspended`,
`suspended_until`, `deleted_at` and `created_at` from the previous row for any
caller where `public.is_admin()` is false. It does this **silently**, because a
client sending a whole row back should not be able to grant itself a badge, and
raising there would turn an ordinary profile save into an error.

A statement run directly in the SQL Editor has no `auth.uid()`, so `is_admin()`
is false and the guard treats it as an ordinary member. The consequence:

```sql
-- Looks like it works. Changes nothing.
update public.profiles set is_suspended = true where username = 'someone';
```

To suspend or verify a member from the SQL Editor, adopt an admin identity
first:

```sql
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"<an-admin-user-uuid>","role":"authenticated"}';
update public.profiles set is_suspended = true where username = 'someone';
reset role;
commit;
```

This cost a confusing test failure: a suspended-member fixture that was never
actually suspended, surfacing as "a suspended member CANNOT post" failing, with
nothing wrong in the posts policies at all. The behaviour is correct and worth
keeping; it just needs to be known.

---

## RLS refuses by filtering, not by raising

The single most important thing to know when writing a Server Action against
these tables.

When a policy forbids an UPDATE or DELETE, PostgREST does **not** return an
error. The row is simply not visible to the statement, zero rows change, and
`error` is `null`. This code therefore reports success for a write that did
nothing at all:

```ts
const { error } = await supabase
  .from("posts").update({ body }).eq("id", postId);
if (error) return { ok: false, ... };
return { ok: true, message: "Post updated." };   // ← a lie when RLS refused
```

Editing another member's post would have shown "Post updated." while the post
stayed exactly as it was. Nothing in the logs, nothing in the UI.

**Every write action must `.select()` and check what came back:**

```ts
const { data, error } = await supabase
  .from("posts").update({ body }).eq("id", postId).select("id");

if (error) return { ok: false, ... };
if (!data || data.length === 0) {
  return { ok: false, formError: "That post could not be edited…" };
}
```

This is not a substitute for RLS — RLS is what actually refused the write, and
it worked. It is about not lying to the member afterwards.

Applied to `updatePostAction`, `deletePostAction`, `updateCommentAction`,
`deleteCommentAction` and `updateProfileAction`. Any new write action must do
the same.

## Rate limits on every write

Reads are cheap and RLS-bounded; writes are not. Every write action is capped
per member per hour:

| Action | Cap |
|---|---|
| Register | 5 (per IP) |
| Sign in | 10 per 15 min (per IP) |
| Create post | 20 |
| Edit / remove post | 60 each |
| Create reply | 60 |
| Edit / remove reply | 60 each |
| Set reaction | 240 |
| Open a conversation | 30 |
| Send a message | 200 |
| Create an event | 20 (per day) |
| Reply to an event | 200 |
| Post a job | 20 (per day) |
| Apply for a job | 50 (per day) |

Messages get a high cap because a real conversation is fast and the cost of
refusing a legitimate one is high; opening a conversation gets a low one,
because that is the action that reaches a stranger and so is the one worth
throttling.

Reactions get the highest cap because real members genuinely react a lot, and
the lowest cost per call — but they were the one action originally shipped with
no limit at all, which made them the cheapest thing on the platform to abuse:
one click, two round trips and two revalidations, repeatable as fast as a
script can send them.

---

## Registration verification

Email confirmation is off by product decision, so a member can register with an
address they do not control. That is acceptable while the audience is people
you know personally and unacceptable on a public URL.

**Google sign-in is the resolution, not email confirmation.** The provider has
already verified the address, so it closes the gap without reintroducing the
inbox round trip that confirmation was switched off to avoid.

The order matters, because getting it wrong produces a button that fails:

1. Google Cloud Console -> Credentials -> OAuth client ID (Web application).
2. Authorised redirect URI must be **Supabase's** callback, not the app's:
   `https://<project-ref>.supabase.co/auth/v1/callback`.
   This is the step most often got wrong. The browser goes Google -> Supabase
   -> `/auth/callback` in the app; Google never redirects to the app directly.
3. Paste the client ID and secret into Supabase -> Authentication ->
   Sign In / Providers -> Google, and enable it.
4. ONLY THEN set `NEXT_PUBLIC_OAUTH_PROVIDERS=google` in Vercel and redeploy.
   Doing this first would render a button with nothing behind it.

The Vercel variable is what actually shows the button, and it is separate from
`.env.example`, so committing a change to that file does not enable anything in
production.
