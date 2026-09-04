# Ezike Oba

The digital home of **Igbo-Eze North Local Government Area, Enugu State,
Nigeria** — one place where citizens can find each other, discover their
communities, share what matters, find opportunities and build together.

**Live: <https://doko-delta.vercel.app>**

> **Status: Phases 1 through 5 complete.** Deployed and running
> against a hosted Supabase project. 249 unit tests (18 test files) pass;
> typecheck, lint and the production build are clean.
>
> **Before sharing the link publicly:** registration currently verifies
> nothing — email confirmation is off and no identity provider is enabled, so
> a member can register with an address they do not control. See
> [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) §6.

---

## What exists today

* Public landing page and a communities directory covering the real
  Igbo-Eze North hierarchy — 2 towns, 4 districts, 31 villages, 20 council
  wards, seeded from cited sources and editable by administrators
* Registration, sign-in, and profile settings with village affiliation and
  privacy controls
* Community feed: posts scoped to a village, a town or the whole LGA, with
  public, community-only, or followers-only visibility
* Replies, threaded discussions, and four culturally resonant reactions
* Multi-image uploads on posts with signed URLs and private storage policies
* Member profiles, follower relationships, and filtered following feeds
* Community groups (public and private) with membership controls
* Direct messaging, group chats, presence, and typing indicators
* Community events & calendar with WAT timezone alignment
* Local job board & applications with applicant privacy guards
* Community marketplace with multi-image listings and seller messaging
* **Community Issues Board & Geolocation Map**: Civic infrastructure reporting
  across 33+ villages, status lifecycle, citizen confirmations, and Leaflet map
* **Trust & Verification Consoles**: Administrative member verification,
  suspension controls, and append-only audit trail logging
* **Unified In-App Notifications**: Real-time alerts for issue confirmations,
  status updates, unread badges, and bulk mark-all-read
* Role-based access control enforced in PostgreSQL RLS, not client code
* Modern, accessible design system with dark/light themes and reduced motion

## What exists today (cont.)

* **Oba AI Assistant & Civic Intelligence Engine**: Dedicated /ai console and floating
  assistant widget grounded in 33+ autonomous communities, traditional institutions
  (Onyishi, Igwe, Umuada), Omabe masquerade festival, market days, and dialect glossary
* **Community Projects & Diaspora Crowdfunding**: Crowdfunding directory (/projects)
  for local infrastructure with progress bars and Paystack checkout
* **Advertising & Promotion Engine**: Sponsored Feed Cards, Marketplace Banners,
  impression/click counters, and admin moderation queue (/admin/ads)
* **Dual-Tier Verification System**: Golden badges (traditional leaders, elders) and
  Blue badges (citizens, artisans) with admin delegation controls
* **Realtime Chat & Audio Hardening**: Web Audio API harmonic notification chimes,
  live WebSocket status indicator, and mute toggle

## Operational Launch Tasks

1. **Google OAuth & Verification**: Enable Google Sign-In or turn on email confirmation in Supabase
2. **Production Paystack Keys**: Add `PAYSTACK_SECRET_KEY` and `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` in Vercel
3. **Gemini AI API Key**: Add `GEMINI_API_KEY` in Vercel to unlock dynamic LLM reasoning for Oba AI
4. **Supabase Auth URL Configuration**: Confirm `https://doko-delta.vercel.app/auth/callback` is in Redirect URLs

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in your Supabase values
npm run dev
```

The app runs without credentials — data pages show an honest "unavailable"
state instead of crashing, which is deliberate: a misconfigured deploy should
still serve public content. To connect a database, see
[`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md).

Database changes are applied by hand through the Supabase SQL Editor. Every
migration and test is written in portable SQL for that reason — no psql
meta-commands.

## Commands

```bash
npm run dev        # dev server
npm run build      # production build
npm run verify     # typecheck + lint + test
npm run test       # unit tests
```

## Documentation

| Document | Contents |
|---|---|
| [`CLAUDE.md`](./CLAUDE.md) | engineering memory: status, decisions, gotchas |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | how it fits together and why |
| [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md) | setup, workflow, traps |
| [`docs/TESTING.md`](./docs/TESTING.md) | what is tested, what is not |
| [`docs/SECURITY.md`](./docs/SECURITY.md) | threat model and trade-offs |
| [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) | Vercel + Supabase release process |

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Supabase
(Postgres, Auth, Storage, Realtime) · zod · Vitest

## Community data

The geographic hierarchy in `supabase/seed.sql` is compiled from public
sources, cited inline. Sources disagree on the exact village count, so the
seed is an attributable starting point that administrators correct in-app —
which is why the hierarchy is editable data rather than a hard-coded list.
