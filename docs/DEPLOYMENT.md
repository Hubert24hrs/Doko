# Deployment

Vercel for the app, Supabase for the database. The database is already live;
this covers getting the app onto a real URL and pointing the two at each other.

---

## 1. What must be true before deploying

* `npm run verify` and `npm run build` both clean.
* No `.env*` file except `.env.example` is committed. `git check-ignore
  .env.local` should say it is ignored.
* Every migration in `supabase/migrations/` has been applied to the project.
* The pgTAP suites in `supabase/tests/` pass.

---

## 2. Import the repository

1. Sign in at <https://vercel.com> with GitHub.
2. **Add New → Project**, import `Hubert24hrs/Doko`.
3. Vercel detects Next.js. Leave the build settings alone — the defaults are
   correct, and there is no `vercel.json` precisely because none is needed.
4. **Do not deploy yet.** Add the environment variables first, or the first
   build ships without Supabase credentials.

---

## 3. Environment variables

Set these under **Settings → Environment Variables**, for Production, Preview
and Development.

| Variable | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` | Public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_…` | Public by design; RLS constrains it |
| `NEXT_PUBLIC_SITE_URL` | your production URL | See the note below |
| `NEXT_PUBLIC_OAUTH_PROVIDERS` | empty, or `google` | Empty renders no provider buttons |

`SUPABASE_SERVICE_ROLE_KEY` is **not required** and should be left unset.
Nothing in the codebase needs it. Add it only if a future privileged task
does, and then only in the Production environment.

### The NEXT_PUBLIC_SITE_URL ordering problem

`NEXT_PUBLIC_SITE_URL` is used for canonical URLs, Open Graph tags, the
sitemap and `robots.txt` — but you do not know the URL until Vercel has
assigned one. So:

1. Deploy once with `NEXT_PUBLIC_SITE_URL` set to a placeholder.
2. Note the assigned URL, e.g. `https://doko-xyz.vercel.app`.
3. Change the variable to that URL and **redeploy**.

The second deploy matters. `NEXT_PUBLIC_*` values are inlined into the bundle
at build time, so changing the variable without rebuilding changes nothing.

---

## 4. Point Supabase at the deployed URL

Supabase dashboard → **Authentication → URL Configuration**:

* **Site URL:** your production URL
* **Redirect URLs:** add **both**
  * `https://<your-domain>/auth/callback`
  * `http://localhost:3000/auth/callback` — keep this, or local development
    sign-in breaks

Without the production callback, confirmation and provider sign-in return to a
URL that cannot complete the session.

---

## 5. Verify the deployment

Check these on the real URL, not localhost:

| Check | Expected |
|---|---|
| `/` | landing page, live community counts |
| `/communities` | 2 towns, 4 districts, 31 villages, 20 wards |
| `/robots.txt` | production host, not localhost |
| `/sitemap.xml` | production URLs, and public posts listed |
| `/feed` signed out | redirects to `/login` |
| `/admin` as a citizen | redirects away |
| a public `/posts/<id>` signed out | renders |
| a community `/posts/<id>` signed out | 404 |
| page source | no `sb_secret_`, no `service_role` |

The last one matters most and is worth doing by hand: view source and search.

---

## 6. Before opening registration to the public

**Unresolved as of this writing.** Email confirmation is off and no identity
provider is enabled, so nothing verifies that a registered address belongs to
the person using it. That is acceptable while the members are people you know;
it is not acceptable on a public URL.

Resolve it one of two ways before sharing the link widely:

* Enable Google sign-in (free) — the provider has already verified the
  address; or
* Re-enable **Confirm email** under Authentication → Sign In / Providers.

Both together is better than either alone.

---

## 7. Ongoing

* Every push to `main` deploys to production; pull requests get preview URLs.
* Preview deployments share the production database. Treat them as live: a
  post created in a preview is a real post.
* Migrations are **not** applied by deployment. Apply them to Supabase
  yourself, before merging code that depends on them, or the deployed app will
  query columns that do not exist.
