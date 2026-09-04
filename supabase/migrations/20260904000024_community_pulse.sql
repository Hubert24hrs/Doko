-- Ezike Oba :: Migration 024
-- Community Pulse: Verified Members Active Within the Last 24 Hours

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
  with recent_activities as (
    -- Posts created within the last 24 hours
    select author_id as user_id, created_at as activity_at, id as post_id
      from public.posts
     where created_at >= (now() - interval '24 hours')
       and deleted_at is null

    union all

    -- Comments created within the last 24 hours
    select c.author_id as user_id, c.created_at as activity_at, c.post_id as post_id
      from public.comments c
     where c.created_at >= (now() - interval '24 hours')
       and c.deleted_at is null

    union all

    -- Reactions created within the last 24 hours
    select r.user_id as user_id, r.created_at as activity_at, r.post_id as post_id
      from public.reactions r
     where r.created_at >= (now() - interval '24 hours')
  ),
  aggregated_users as (
    select
      ra.user_id,
      max(ra.activity_at) as last_activity_at
    from recent_activities ra
    group by ra.user_id
  )
  select
    pr.id as user_id,
    pr.username,
    pr.full_name,
    pr.avatar_path,
    pr.is_verified,
    pr.verification_type,
    au.last_activity_at,
    (
      select p.id
        from public.posts p
       where p.author_id = pr.id
         and p.deleted_at is null
       order by p.created_at desc
       limit 1
    ) as latest_post_id
  from aggregated_users au
  join public.profiles pr on pr.id = au.user_id
 where pr.is_verified = true
   and pr.is_suspended = false
   and pr.deleted_at is null
 order by au.last_activity_at desc
 limit p_limit;
$fn$;
