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
project**: 374 pgTAP assertions cover the escalation boundary, the append-only
audit trail, every profile visibility tier, the rate limiter's threshold, post
and group visibility, the storage policies, the messaging rules above --
including that a moderator and an admin each read nothing -- and the same
public-listing/private-contact split proven twice, for jobs and for the
marketplace. Those are proven, not asserted.

What is still unproven, and must not be described as working:

1. **Realtime delivery.** The subscription and the publication line exist;
   nothing has been watched arriving live in a second browser. It degrades
   rather than breaks -- the composer says so when the channel is not
   subscribed.
2. **`community_admin` subtree scoping.** A community admin should be able to
   edit only their own part of the geographic tree. Written, never asserted.
3. **Migration idempotency.** The files are written to be re-runnable and have
   been re-run by hand, but nothing tests it.
4. **Passkey sign-in.** Enrolment works; the sign-in ceremony has never been
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

---

## Audit: the Phase 5 money-and-trust tables (found 2026-09-08)

Migrations 023-027 added verification, advertising, payments and community
projects. Writing pgTAP suites for them found **five real defects**, and they
were all the same shape: **the rule was written as a COMMENT and never as a
mechanism.**

Migrations 001-021 do not have this problem. Every intent there is paired with
a policy, a CHECK or a guard trigger. Somewhere in Phase 5 the habit slipped,
and the comments kept reading as though it had not.

### 1. Anyone could confirm their own payment (migration 028)

`confirm_ad_payment()` and `confirm_project_donation()` are `SECURITY DEFINER`.
**PostgreSQL grants EXECUTE on a new function to `PUBLIC` by default**, and
neither migration revoked it. Any signed-in member could call either one over
PostgREST and mark their own advert paid, or credit a donation that never
arrived. Free advertising, and a fundraising total that meant nothing.

Closed by revoking EXECUTE from `public`, `anon` and `authenticated`, and
granting it to `service_role` alone.

**The revoke must come AFTER the `create or replace`.** Replacing a function
resets its privileges, so a revoke written above the definition is undone by
the definition below it.

### 2. A donation credited its PARAMETER, not the payment (migration 028)

`confirm_project_donation(p_amount_naira, ...)` added the caller's number to
`raised_amount_naira` without ever comparing it to the payment it named. With
defect 1, that is a member typing any figure they like onto a public progress
bar. It now derives the amount from the `payments` row and refuses a mismatch,
and refuses a payment whose `target_id` is a different project.

### 3. Verification delegation did not work at all (migration 029)

`profiles_update` admitted only `id = auth.uid()` or `is_admin()`. A delegated
verifier is neither, so every badge they granted was **silently filtered away
by RLS and reported to them as success** -- the failure mode already recorded
under "RLS refuses by filtering, not by raising" above, repeated in a feature
built after it was written down.

Two fixes, because either alone is insufficient: a `profiles_update_verifier`
policy so the write can land, and `.select("id")` plus a row-count check in
`src/features/admin/actions.ts` so a refusal is never reported as success.

### 4. An advertiser could approve their own advert (migration 030)

`ad_campaigns_update` admits `advertiser_id = auth.uid()` and nothing narrowed
what that could set. An advertiser could PATCH `status = 'active'` straight
past the `/admin/ads` moderation queue and the payment gate, and type in their
own impression and click counts. Closed with a guard trigger in the same
restore-rather-than-raise style as posts, events, jobs and listings. Pausing
and resuming are kept, because that was the documented intent and neither is
self-promotion.

### 5. A project creator could fabricate a fundraising total (migration 031)

The same hole on `community_projects`, and the worst of the five. A progress
bar reading "4,800,000 naira raised by 190 donors" is the single most
persuasive thing on a crowdfunding page. A creator who can type that number in
can raise real money on it.

### The defect the fix introduced: SECURITY DEFINER does not change auth.uid()

Migrations 030 and 031 both branched on `if public.is_staff() then return new`,
on the stated assumption that the confirming RPCs "run as the definer and are
therefore not subject to this branch."

**That is wrong, and it is worth remembering.** `SECURITY DEFINER` changes the
EXECUTING ROLE. It does not change `auth.uid()`, which reads the JWT claim off
the session. The Paystack webhook uses the service role, whose JWT carries no
`sub`, so `auth.uid()` is NULL, `is_staff()` is false, and both guards took
their member branch and restored exactly the columns the payment had just
written. The guards broke the two paths they existed to protect.

Migration 032 adds `auth.uid() is null or public.is_staff()`. A NULL uid means
no member is acting -- service role, definer function, or migration -- and it
grants nothing RLS has not already allowed, because an anon caller satisfies
neither table's UPDATE policy in the first place.

`19_community_projects` caught the donation half. **Nothing caught the
advertising half**, because `18_advertising` asserted only that an advertiser
COULD NOT set `payment_status` and never that the platform COULD -- a rule with
no test, which is the exact failure this audit exists to find. That assertion
now exists.

### And the defect in the test that hid it

The first run of the corrected `18_advertising` still failed, and the migration
was not at fault. **`reset role` restores the role and nothing else.** A
`set local request.jwt.claims` survives it, so after `pg_temp.become(somebody)`
every later statement in the transaction still has that somebody's `auth.uid()`
even once the role is back. The suites were calling the platform's RPCs through
the guard's member branch while reading as though they tested the platform one.

Suites 16, 18 and 19 now use a `pg_temp.become_platform()` helper that clears
`request.jwt.claims` as well as the role, reproducing what the service role
actually looks like. **A test fixture that only half-drops a privilege proves
nothing, and does it quietly.**

---

## Audit: notifications and the Community Pulse (found 2026-09-08)

The three migrations with no test coverage left after the money-and-trust
audit -- 021 `community_issues`, 022 `notifications`, 024 `community_pulse` --
turned up two more defects of exactly the same shape. Migration 021 turned out
clean: it is Phase 4 work and pairs every rule with a guard trigger, a CHECK or
a policy, which is why `20_issues` found nothing to fix.

### 6. Anyone could plant a notification in anyone's tray (migration 033)

Migration 022 shipped this, under the comment "Triggers or system functions
can insert":

```sql
create policy notifications_insert_authenticated
  on public.notifications for insert
  to authenticated
  with check (public.is_active_member());
```

The check constrains the INSERTER. It says nothing at all about `user_id`, so
any signed-in member could write a row into ANY member's notification tray and
choose its `title`, its `body`, its `actor_id` and its `link`. A notification
is the one thing on this platform that arrives unasked and reads as coming
from the platform itself, so that is a phishing surface with a mailing list
attached: loop over the profile ids and it is a broadcast channel nobody
granted. `link` was unconstrained text, so it could carry an absolute URL that
the notification list renders as a link the member has every reason to trust.

The policy was not merely too wide -- **it was never needed**. Both
notification triggers are `SECURITY DEFINER` and bypass RLS entirely, and the
application never inserts one: `src/features/notifications` only selects and
marks read. The policy permitted something that did not require permission and
granted forgery as the price.

Migration 033 drops it and revokes INSERT, the way `audit_logs` (migration
004) and `conversations` (migration 015) already handle rows written on
somebody else's behalf. It also adds the guard `notifications_update_own` never
had -- `read_at` is now the only column a member may change -- and constrains
`link` to a path inside this app.

### 7. The Community Pulse published what RLS hides (migration 034)

`get_community_pulse()` is `SECURITY DEFINER`, so every table it reads is read
with row level security switched off. **A definer function is a hole in RLS
that somebody has promised to fill by hand**, and migration 024 did not fill
it:

* it returned `username`, `full_name` and `avatar_path` for any verified
  member, ignoring `profiles.visibility` -- so a member who set their profile
  to `private` or `community` was still drawn on the feed, by name and
  photograph, for anybody;
* `latest_post_id` came from `posts` with no visibility predicate at all, so
  the id it handed out could belong to a followers-only post or to one inside
  a private group. The post page still refuses to render it, but this schema
  is deliberate that an invisible post 404s rather than 403s **precisely so
  that its existence is not confirmed** -- and handing out its id confirms it;
* comments and reactions inside private groups counted as "activity", so the
  sphere reported that somebody had been busy somewhere the reader was not
  entitled to know about;
* and its EXECUTE was left at the PostgreSQL default of PUBLIC -- the same
  default that made `confirm_ad_payment()` callable by anybody until migration
  028.

Migration 034 writes the bypassed rules into the function explicitly,
mirroring `profiles_select_visible` and `posts_select_public`, and restricts
EXECUTE to `authenticated` and `service_role`. It stays `SECURITY DEFINER`:
it aggregates across four tables and running it under RLS would re-plan every
one of those policies per row.

**The general rule this pair establishes: every `SECURITY DEFINER` function
needs two things written down and tested -- who may EXECUTE it, and which
rules it is bypassing on purpose.** Four of the five definer functions added
in Phase 5 were wrong about the first, and this one was wrong about both.

### And a third defect in a test, again

`20_issues` first failed on "nobody but the reporter can add one to their
report". The migration was correct; the assertion was aimed at an issue that
already had four photographs, so `issue_media_enforce_limit` -- a BEFORE
INSERT trigger -- raised `23514` before RLS evaluated the policy's WITH CHECK
at all. The assertion named authorisation and measured the photo limit.

This is the third time in one session that an assertion was refused by an
earlier mechanism than the one it named: `14_jobs` expected `23505` from a
unique constraint the policy refuses first, `10_messages` had an
`INSERT ... SELECT` over an RLS-hidden table that fed on zero rows and threw
nothing, and now this. **Test each rule where it can actually fire**, and when
two mechanisms can refuse the same statement, know which one goes first.
