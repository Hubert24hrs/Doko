# Deployment

Frontend on **Vercel**, backend on **Supabase**.

---

## Environments

| Environment | Frontend | Supabase project | Purpose |
|---|---|---|---|
| Development | localhost:3000 | local stack or a dev project | day-to-day work |
| Staging | Vercel preview | separate staging project | verify migrations before production |
| Production | Vercel production | production project | live |

**Use a separate Supabase project per environment.** Sharing one between
staging and production means a bad migration takes down real members.

---

## First production deploy

### 1. Supabase

1. Create the production project. Record the database password somewhere safe;
   it is shown once.
2. Apply migrations:

```bash
npx supabase link --project-ref <prod-ref>
npm run db:push
```

3. Apply `supabase/seed.sql` (SQL editor, or `supabase db execute`).
4. Confirm every table reports RLS enabled in Database > Tables. **Do not
   proceed if any exposed table has RLS off.**
5. Auth > URL Configuration:
   * Site URL: `https://your-domain.com`
   * Redirect URL: `https://your-domain.com/auth/callback`

### 2. Vercel

1. Import the GitHub repository.
2. Framework preset: Next.js. Defaults are correct.
3. Environment variables (Production **and** Preview):

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | production project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | production anon key |
| `NEXT_PUBLIC_SITE_URL` | `https://your-domain.com` (no trailing slash) |
| `SUPABASE_SERVICE_ROLE_KEY` | only if a privileged task needs it |

`NEXT_PUBLIC_SITE_URL` must match the Supabase Site URL exactly, or
confirmation links will break.

4. Deploy.

### 3. Create the first super admin

```sql
insert into public.user_roles (user_id, role)
select id, 'super_admin' from auth.users where email = 'you@example.com';
```

---

## Release checklist

Before every production deploy:

```bash
git status            # clean?
npm run verify        # typecheck + lint + test
npm run build         # production build
```

Then:

* [ ] migrations applied to staging and exercised there first
* [ ] no secret in the diff (`git diff --staged | grep -iE "key|secret|token"`)
* [ ] RLS confirmed on every new table
* [ ] `CLAUDE.md` and docs updated in the same commit
* [ ] pushed to GitHub and the push verified

---

## Migrations in production

* **Forward-only.** Write a new migration; never edit one that has run.
* Migrations must be idempotent -- `if not exists`, `or replace`,
  `drop policy if exists` before `create policy`.
* Apply to staging first.
* Additive changes are safe. Destructive ones (dropping a column, tightening a
  constraint) need a two-step: deploy code tolerating both shapes, then
  migrate.
* Never hard-delete geography. Soft-delete or merge, or historical references
  break.

## Rollback

* **Frontend:** Vercel > Deployments > promote the previous build. Instant.
* **Database:** no automatic rollback. Forward-fix with a new migration.
  Supabase point-in-time recovery is the last resort and loses data written
  since the restore point.

Because the database cannot be rolled back cheaply, a deploy that pairs a
migration with code should ship the migration **first**, in a backward-
compatible form.

---

## After deploying

Check:

* `/` renders and the community counts are real (not em dashes -- those mean
  the database is unreachable)
* `/communities` lists the seeded hierarchy
* register -> confirmation email -> sign in works end to end
* `/admin` is refused for a non-staff account
* Supabase logs show no RLS policy violations from ordinary use

## Not yet in place

* No CI pipeline. `npm run verify && npm run build` should run on every PR
  before this goes live.
* No error monitoring (Sentry or equivalent).
* No uptime or performance monitoring.
* No backup verification -- Supabase backs up automatically, but a restore has
  never been tested. An untested backup is not a backup.
