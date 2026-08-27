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

RLS policies have **never been executed against a database** (no Docker, no
`psql`, no linked project). They are written carefully and two recursion/order
bugs were caught by inspection, but they are unproven.

Before production, run against a real project:

1. a non-staff user cannot read `audit_logs`
2. a user cannot grant themselves a role
3. a user cannot set `is_verified` on their own profile
4. a `private` profile is invisible to others but visible to its owner
5. a `community` profile is visible only to members of the same community
6. an anonymous visitor sees only `public`, non-suspended profiles
7. a `community_admin` can edit only their own subtree
8. `consume_rate_limit` actually blocks at the configured threshold

Tracked in [`TESTING.md`](./TESTING.md).
