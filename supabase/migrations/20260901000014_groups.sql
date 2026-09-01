-- Ezike Oba :: Phase 2 -- 014
-- Groups.
--
-- The last piece of the social core. A group is a place with a membership,
-- and posts can belong to one.
--
-- Two things shape the design:
--
--   * Membership is the unit of access. A private group's posts are readable
--     by its members and nobody else, which makes the membership table the
--     thing every other policy asks about.
--   * Groups anchor to geography OPTIONALLY. A village meeting group belongs
--     to a village; a professional network spans the whole LGA. Forcing a
--     geo_id would make the second impossible.

do $$ begin
  create type public.group_kind as enum (
    'community', 'village', 'interest', 'youth', 'professional',
    'organization', 'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.group_visibility as enum ('public', 'private');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.group_role as enum ('owner', 'moderator', 'member');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Groups
-- ---------------------------------------------------------------------------

create table if not exists public.groups (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  slug         citext not null,
  description  text,
  kind         public.group_kind not null default 'interest',

  -- Optional anchor. NULL means the group is not tied to one place.
  geo_id       uuid references public.geo_entities(id) on delete set null,

  -- 'public'  : anyone may read it and its posts, and join without asking.
  -- 'private' : only members may read it or its posts.
  -- There is no "request to join" tier yet. Adding one later means a
  -- join_requests table, not a third enum value, so it is not pre-empted here.
  visibility   public.group_visibility not null default 'public',

  created_by   uuid references public.profiles(id) on delete set null,
  member_count integer not null default 0,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,

  constraint groups_name_not_blank check (length(btrim(name)) > 0),
  constraint groups_name_length check (length(name) <= 120),
  constraint groups_description_length check (description is null or length(description) <= 2000),
  constraint groups_member_count_non_negative check (member_count >= 0)
);

create unique index if not exists groups_slug_key
  on public.groups (slug) where deleted_at is null;
create index if not exists groups_geo_idx
  on public.groups (geo_id) where deleted_at is null;
create index if not exists groups_kind_idx
  on public.groups (kind) where deleted_at is null;

drop trigger if exists groups_set_updated_at on public.groups;
create trigger groups_set_updated_at
  before update on public.groups
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Membership
-- ---------------------------------------------------------------------------

create table if not exists public.group_members (
  group_id  uuid not null references public.groups(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  role      public.group_role not null default 'member',
  joined_at timestamptz not null default now(),

  primary key (group_id, user_id)
);

create index if not exists group_members_user_idx
  on public.group_members (user_id);

-- ---------------------------------------------------------------------------
-- Helpers
--
-- SECURITY DEFINER, because the group policies ask about membership and the
-- membership policies ask about the group. Without a definer boundary those
-- two would recurse into each other.
-- ---------------------------------------------------------------------------

create or replace function public.is_group_member(
  target_group_id uuid,
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.group_members m
     where m.group_id = target_group_id and m.user_id = check_user_id
  );
$fn$;

-- Owners and moderators of a group. Distinct from platform staff: running a
-- village meeting group confers nothing outside it.
create or replace function public.leads_group(
  target_group_id uuid,
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.group_members m
     where m.group_id = target_group_id
       and m.user_id = check_user_id
       and m.role in ('owner', 'moderator')
  );
$fn$;

-- Can this caller see the group at all? Public groups are open; private ones
-- are members-only. Used by the group, membership and post policies alike, so
-- the rule exists once.
create or replace function public.can_see_group(
  target_group_id uuid,
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.groups g
     where g.id = target_group_id
       and g.deleted_at is null
       and (
         g.visibility = 'public'
         or public.is_group_member(g.id, check_user_id)
       )
  );
$fn$;

-- ---------------------------------------------------------------------------
-- Member counts, trigger-maintained as everywhere else
-- ---------------------------------------------------------------------------

create or replace function public.group_members_maintain_count()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'INSERT' then
    update public.groups set member_count = member_count + 1 where id = new.group_id;
  elsif tg_op = 'DELETE' then
    update public.groups set member_count = greatest(member_count - 1, 0) where id = old.group_id;
  end if;
  return null;
end;
$fn$;

drop trigger if exists group_members_count on public.group_members;
create trigger group_members_count
  after insert or delete on public.group_members
  for each row execute function public.group_members_maintain_count();

create or replace function public.recount_group_members(p_group_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v_rows integer;
begin
  update public.groups g
     set member_count = (
           select count(*) from public.group_members m where m.group_id = g.id
         )
   where p_group_id is null or g.id = p_group_id;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$fn$;

revoke all on function public.recount_group_members(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The creator becomes the owner
--
-- Done by trigger rather than by the application, so a group can never exist
-- without someone responsible for it -- including if it is created by a script
-- or a future admin tool.
-- ---------------------------------------------------------------------------

create or replace function public.groups_add_creator_as_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if new.created_by is not null then
    insert into public.group_members (group_id, user_id, role)
    values (new.id, new.created_by, 'owner')
    on conflict do nothing;
  end if;
  return null;
end;
$fn$;

drop trigger if exists groups_creator_owner on public.groups;
create trigger groups_creator_owner
  after insert on public.groups
  for each row execute function public.groups_add_creator_as_owner();

-- ---------------------------------------------------------------------------
-- Posts can belong to a group
-- ---------------------------------------------------------------------------

alter table public.posts
  add column if not exists group_id uuid references public.groups(id) on delete cascade;

create index if not exists posts_group_idx
  on public.posts (group_id, created_at desc)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.groups enable row level security;
alter table public.group_members enable row level security;

drop policy if exists groups_select_public on public.groups;
create policy groups_select_public
  on public.groups for select
  to anon, authenticated
  using (deleted_at is null and visibility = 'public');

drop policy if exists groups_select_member on public.groups;
create policy groups_select_member
  on public.groups for select
  to authenticated
  using (deleted_at is null and public.is_group_member(id));

drop policy if exists groups_select_staff on public.groups;
create policy groups_select_staff
  on public.groups for select
  to authenticated
  using (public.is_staff());

-- Any active member may start a group, but only as themselves.
drop policy if exists groups_insert_own on public.groups;
create policy groups_insert_own
  on public.groups for insert
  to authenticated
  with check (created_by = auth.uid() and public.is_active_member());

-- Only the group's own leadership may edit it. Platform staff can remove a
-- group, which is covered by the staff policy below.
drop policy if exists groups_update_leader on public.groups;
create policy groups_update_leader
  on public.groups for update
  to authenticated
  using (public.leads_group(id))
  with check (public.leads_group(id));

drop policy if exists groups_update_staff on public.groups;
create policy groups_update_staff
  on public.groups for update
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- No DELETE policy: removal is soft, as for posts and comments.

-- Membership ----------------------------------------------------------------

-- You can see who is in a group exactly when you can see the group.
drop policy if exists group_members_select on public.group_members;
create policy group_members_select
  on public.group_members for select
  to anon, authenticated
  using (public.can_see_group(group_id));

-- Your own memberships are always visible to you, so "am I in this group"
-- works even for a private group you have just left.
drop policy if exists group_members_select_own on public.group_members;
create policy group_members_select_own
  on public.group_members for select
  to authenticated
  using (user_id = auth.uid());

-- Joining: yourself only, only an active member, and only a group you can see.
-- A private group cannot be joined this way at all, which is what makes it
-- private -- an invitation flow would add rows through a definer function.
drop policy if exists group_members_join on public.group_members;
create policy group_members_join
  on public.group_members for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.is_active_member()
    and exists (
      select 1 from public.groups g
       where g.id = group_id
         and g.deleted_at is null
         and g.visibility = 'public'
    )
  );

-- Leaving: your own membership. Group leaders may also remove a member.
drop policy if exists group_members_leave on public.group_members;
create policy group_members_leave
  on public.group_members for delete
  to authenticated
  using (user_id = auth.uid() or public.leads_group(group_id));

-- Only leaders change roles, and the guard below stops the last owner going.
drop policy if exists group_members_update_leader on public.group_members;
create policy group_members_update_leader
  on public.group_members for update
  to authenticated
  using (public.leads_group(group_id))
  with check (public.leads_group(group_id));

-- A group must never be left without an owner: nobody could then edit it,
-- admit anyone, or close it down.
create or replace function public.group_members_protect_last_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_owners integer;
begin
  if tg_op = 'DELETE' and old.role = 'owner' then
    select count(*) into v_owners
      from public.group_members
     where group_id = old.group_id and role = 'owner';
    if v_owners <= 1 then
      raise exception 'A group must keep at least one owner'
        using errcode = 'check_violation';
    end if;
  elsif tg_op = 'UPDATE' and old.role = 'owner' and new.role <> 'owner' then
    select count(*) into v_owners
      from public.group_members
     where group_id = old.group_id and role = 'owner';
    if v_owners <= 1 then
      raise exception 'A group must keep at least one owner'
        using errcode = 'check_violation';
    end if;
  end if;
  return coalesce(new, old);
end;
$fn$;

drop trigger if exists group_members_last_owner on public.group_members;
create trigger group_members_last_owner
  before update or delete on public.group_members
  for each row execute function public.group_members_protect_last_owner();

-- ---------------------------------------------------------------------------
-- Posts inside a group
--
-- A post with a group_id is governed by the group, not by post visibility:
-- being in a private group IS the access rule, and applying both would mean a
-- member of a private group could still hide a post from the rest of it by
-- accident.
-- ---------------------------------------------------------------------------

-- CRITICAL: the existing post policies must be narrowed to non-group posts
-- first. Multiple permissive policies are OR'd together, so without this a
-- post inside a PRIVATE group but marked visibility='public' would still be
-- readable by the whole internet through posts_select_public -- and anyone
-- could post into a group they had never joined through posts_insert_own,
-- because that policy never looked at group_id.
--
-- Narrowing them means a group post matches exactly one policy: the group's.

drop policy if exists posts_select_public on public.posts;
create policy posts_select_public
  on public.posts for select
  to anon, authenticated
  using (deleted_at is null and group_id is null and visibility = 'public');

drop policy if exists posts_select_community on public.posts;
create policy posts_select_community
  on public.posts for select
  to authenticated
  using (
    deleted_at is null
    and group_id is null
    and visibility = 'community'
    and public.member_of_geo(geo_id)
  );

drop policy if exists posts_select_followers on public.posts;
create policy posts_select_followers
  on public.posts for select
  to authenticated
  using (
    deleted_at is null
    and group_id is null
    and visibility = 'followers'
    and public.follows_profile(author_id)
  );

drop policy if exists posts_insert_own on public.posts;
create policy posts_insert_own
  on public.posts for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and public.is_active_member()
    and group_id is null
  );

-- posts_select_own and posts_select_staff are deliberately NOT narrowed: an
-- author should still see their own post after leaving a group, and staff
-- moderate everything.

drop policy if exists posts_select_group on public.posts;
create policy posts_select_group
  on public.posts for select
  to anon, authenticated
  using (
    deleted_at is null
    and group_id is not null
    and public.can_see_group(group_id)
  );

-- Posting into a group requires membership, whatever the group's visibility.
-- Reading a public group does not entitle you to post in it.
drop policy if exists posts_insert_group on public.posts;
create policy posts_insert_group
  on public.posts for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and public.is_active_member()
    and group_id is not null
    and public.is_group_member(group_id)
  );

grant select on public.groups to anon, authenticated;
grant insert, update on public.groups to authenticated;
grant select on public.group_members to anon, authenticated;
grant insert, update, delete on public.group_members to authenticated;
