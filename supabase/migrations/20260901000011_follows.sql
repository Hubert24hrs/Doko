-- Ezike Oba :: Phase 2 -- 011
-- Following.
--
-- Turns the feed from "everything on the platform" into "the people I care
-- about". The relationship is deliberately one-directional and needs no
-- approval: this is a community noticeboard, not a private network, and a
-- request-and-accept dance would be friction with no safety benefit while
-- profile visibility already controls who can see what.

create table if not exists public.follows (
  follower_id  uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),

  -- The pair IS the identity; there is no separate surrogate key, because a
  -- second row for the same pair would be meaningless.
  primary key (follower_id, following_id),

  -- Following yourself would inflate your own counts and put your posts in
  -- your own "following" feed twice.
  constraint follows_not_self check (follower_id <> following_id)
);

-- "Who do I follow" drives the feed and must be fast; the primary key already
-- serves it. "Who follows this person" needs its own index.
create index if not exists follows_following_idx
  on public.follows (following_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Denormalised counts, same reasoning as post engagement: a profile page and
-- a member list should not each run aggregates.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists follower_count integer not null default 0,
  add column if not exists following_count integer not null default 0;

alter table public.profiles
  drop constraint if exists profiles_follow_counts_non_negative;
alter table public.profiles
  add constraint profiles_follow_counts_non_negative
  check (follower_count >= 0 and following_count >= 0);

create or replace function public.follows_maintain_counts()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'INSERT' then
    update public.profiles set following_count = following_count + 1
     where id = new.follower_id;
    update public.profiles set follower_count = follower_count + 1
     where id = new.following_id;
  elsif tg_op = 'DELETE' then
    update public.profiles set following_count = greatest(following_count - 1, 0)
     where id = old.follower_id;
    update public.profiles set follower_count = greatest(follower_count - 1, 0)
     where id = old.following_id;
  end if;
  return null;
end;
$fn$;

drop trigger if exists follows_counts on public.follows;
create trigger follows_counts
  after insert or delete on public.follows
  for each row execute function public.follows_maintain_counts();

-- Repair, as for post engagement.
create or replace function public.recount_follows(p_profile_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_rows integer;
begin
  update public.profiles p
     set follower_count = (
           select count(*) from public.follows f where f.following_id = p.id
         ),
         following_count = (
           select count(*) from public.follows f where f.follower_id = p.id
         )
   where p_profile_id is null or p.id = p_profile_id;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$fn$;

revoke all on function public.recount_follows(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Does the caller follow this person?
--
-- SECURITY DEFINER so it can be called from a posts policy later without
-- re-entering RLS on follows.
-- ---------------------------------------------------------------------------

create or replace function public.follows_profile(
  target_profile_id uuid,
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.follows f
     where f.follower_id = check_user_id
       and f.following_id = target_profile_id
  );
$fn$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.follows enable row level security;

-- A follow is readable when the person being followed is readable. Same EXISTS
-- pattern as everywhere else: the profiles policies decide, and a private
-- profile's followers do not leak through this table.
drop policy if exists follows_select on public.follows;
create policy follows_select
  on public.follows for select
  to anon, authenticated
  using (
    exists (select 1 from public.profiles p where p.id = following_id)
  );

-- The caller's own follows are always visible to them, so "am I following
-- this person" works even where the target profile is not otherwise readable.
drop policy if exists follows_select_own on public.follows;
create policy follows_select_own
  on public.follows for select
  to authenticated
  using (follower_id = auth.uid());

drop policy if exists follows_insert_own on public.follows;
create policy follows_insert_own
  on public.follows for insert
  to authenticated
  with check (
    follower_id = auth.uid()
    and public.is_active_member()
    -- You may only follow somebody whose profile you can actually see.
    -- Without this, a private profile could be followed by anyone who guessed
    -- an id, and its follower count would betray its existence.
    and exists (
      select 1 from public.profiles p
       where p.id = following_id and p.deleted_at is null
    )
  );

-- Unfollowing is a real delete, like withdrawing a reaction. A follow is a
-- current relationship, not speech: keeping a tombstone would misstate who
-- someone follows today, and there is nothing to audit in having stopped.
drop policy if exists follows_delete_own on public.follows;
create policy follows_delete_own
  on public.follows for delete
  to authenticated
  using (follower_id = auth.uid());

-- No UPDATE policy: a follow has nothing to change. Following again is the
-- same row; unfollowing removes it.

grant select on public.follows to anon, authenticated;
grant insert, delete on public.follows to authenticated;
