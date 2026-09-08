-- Migration 034: the Community Pulse must not publish what RLS hides
--
-- get_community_pulse() (migration 024) is SECURITY DEFINER, so every table it
-- reads is read WITHOUT row level security. It then returns:
--
--   * `username`, `full_name` and `avatar_path` for any verified member with
--     recent activity, regardless of `profiles.visibility`. A member who set
--     their profile to 'community' or 'private' still appeared in the sphere,
--     to anybody. Everywhere else in this schema a profile that is not visible
--     404s -- "indistinguishable from one that does not exist, so probing
--     usernames reveals nothing" -- and the pulse published the same people by
--     name on the feed.
--
--   * `latest_post_id` chosen from `posts` with NO visibility predicate at
--     all: the member's most recent post, whether it is followers-only or
--     sitting inside a private group. The post page still refuses to render
--     it, so the words do not leak -- but the ID does, and this schema is
--     deliberate that an invisible post 404s rather than 403s precisely so
--     that its EXISTENCE is not confirmed. Handing out its id confirms it.
--
--   * activity drawn from every post, comment and reaction in the database,
--     so "was active in the last 24 hours" was derived partly from what
--     happened inside private groups.
--
-- And, as with the payment RPCs in migration 028, EXECUTE was granted to
-- PUBLIC by default, so a signed-out caller could ask for all of it.
--
-- The function stays SECURITY DEFINER: it aggregates across four tables and
-- running it under RLS would re-plan every one of those policies per row. What
-- changes is that the visibility rules it was bypassing are now written into
-- it explicitly, mirroring the policies rather than restating them loosely:
--
--   * profiles      -> profiles_select_visible: public, or 'community' where
--                      shares_community_with() says the caller belongs.
--   * posts         -> posts_select_public: public, not deleted, and
--                      `group_id is null`, the narrowing migration 014 had to
--                      add when a private group's posts turned out to be
--                      world-readable at the column default.
--
-- The pulse renders on /feed, which is authenticated, so this loses nothing a
-- member could not already see.

create or replace function public.get_community_pulse(p_limit int default 60)
returns table (
  user_id              uuid,
  username             citext,
  full_name            text,
  avatar_path          text,
  is_verified          boolean,
  verification_type    text,
  last_activity_at     timestamptz,
  latest_post_id       uuid
)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  with visible_posts as (
    -- The one definition of "a post this caller may be told about", used both
    -- for the activity window and for the post the sphere links to.
    select p.id, p.author_id, p.created_at
      from public.posts p
     where p.deleted_at is null
       and p.visibility = 'public'
       and p.group_id is null
  ),
  recent_activities as (
    select vp.author_id as user_id, vp.created_at as activity_at
      from visible_posts vp
     where vp.created_at >= (now() - interval '24 hours')

    union all

    -- A comment or a reaction is only evidence of activity if the thing it is
    -- on is itself public. Otherwise the sphere reports that somebody was busy
    -- inside a private group.
    select c.author_id, c.created_at
      from public.comments c
      join visible_posts vp on vp.id = c.post_id
     where c.created_at >= (now() - interval '24 hours')
       and c.deleted_at is null

    union all

    select r.user_id, r.created_at
      from public.reactions r
      join visible_posts vp on vp.id = r.post_id
     where r.created_at >= (now() - interval '24 hours')
  ),
  aggregated_users as (
    select ra.user_id, max(ra.activity_at) as last_activity_at
      from recent_activities ra
     group by ra.user_id
  )
  select
    pr.id,
    pr.username,
    pr.full_name,
    pr.avatar_path,
    pr.is_verified,
    pr.verification_type,
    au.last_activity_at,
    (
      select vp.id
        from visible_posts vp
       where vp.author_id = pr.id
       order by vp.created_at desc
       limit 1
    )
  from aggregated_users au
  join public.profiles pr on pr.id = au.user_id
 where pr.is_verified = true
   and pr.is_suspended = false
   and pr.deleted_at is null
   -- profiles_select_visible, written out because this function is the one
   -- place that policy is not consulted for us.
   and (
     pr.visibility = 'public'
     or (pr.visibility = 'community' and public.shares_community_with(pr.id))
     or pr.id = auth.uid()
   )
 order by au.last_activity_at desc
 limit p_limit;
$fn$;

-- The pulse is a signed-in feature. Left at the PostgreSQL default, EXECUTE
-- belongs to PUBLIC, which includes anon -- and shares_community_with() reads
-- auth.uid(), so for a signed-out caller the 'community' branch is simply
-- false rather than refused. Being explicit is cheaper than reasoning about
-- that every time somebody edits this file.
revoke execute on function public.get_community_pulse(int) from public, anon;
grant execute on function public.get_community_pulse(int) to authenticated, service_role;
