-- Ezike Oba :: Phase 2 -- 008
-- Posts: the first thing members actually create.
--
-- Text only for now. Media, comments and reactions arrive in later slices and
-- reference this table, so the decisions here -- who may see a post, how a
-- post is scoped to a community, what deletion means -- are the ones
-- everything else inherits.

-- ---------------------------------------------------------------------------
-- Visibility
--
-- Deliberately only two values. "public" is readable by signed-out visitors,
-- which is what makes community life discoverable and the public pages worth
-- indexing. "community" is readable by members of the post's own community.
-- A followers-only tier is not added until following exists, because a
-- visibility nobody can satisfy is a trap.
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.post_visibility as enum ('public', 'community');
exception when duplicate_object then null; end $$;

create table if not exists public.posts (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references auth.users(id) on delete cascade,
  body        text not null,

  -- Which community this post belongs to. NULL means the whole LGA, which is
  -- the right default: village affiliation is optional, so a member who never
  -- chose one must still be able to post.
  geo_id      uuid references public.geo_entities(id) on delete set null,

  visibility  public.post_visibility not null default 'public',

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Distinct from updated_at, which any trigger touch moves. This is set only
  -- when a member edits the body, so the UI can honestly show "edited".
  edited_at   timestamptz,
  deleted_at  timestamptz,

  constraint posts_body_not_blank check (length(btrim(body)) > 0),
  constraint posts_body_length check (length(body) <= 5000)
);

-- The feed reads newest-first among live posts, so the index carries the sort
-- order and excludes deleted rows rather than filtering them afterwards.
create index if not exists posts_feed_idx
  on public.posts (created_at desc)
  where deleted_at is null;

create index if not exists posts_author_idx
  on public.posts (author_id, created_at desc)
  where deleted_at is null;

create index if not exists posts_geo_idx
  on public.posts (geo_id, created_at desc)
  where deleted_at is null;

drop trigger if exists posts_set_updated_at on public.posts;
create trigger posts_set_updated_at
  before update on public.posts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Helpers
--
-- SECURITY DEFINER with a pinned search_path, like every other RBAC helper:
-- these are called from policies and must not re-enter RLS.
-- ---------------------------------------------------------------------------

-- May this account create content at all? A suspended or deleted member keeps
-- their session but must not be able to post. Checked in the INSERT policy so
-- the database enforces it, not the UI.
create or replace function public.is_active_member(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.profiles p
     where p.id = check_user_id
       and p.deleted_at is null
       and p.is_suspended = false
  );
$fn$;

-- Does the caller belong to this community, anywhere up its ancestry?
-- A post scoped to a village is visible to that village; a post scoped to a
-- town is visible to every village within it.
create or replace function public.member_of_geo(
  target_geo_id uuid,
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select case
    -- An LGA-wide post belongs to everyone.
    when target_geo_id is null then true
    else exists (
      select 1
        from public.profiles p
       where p.id = check_user_id
         and (
           p.village_id   = target_geo_id or
           p.community_id = target_geo_id or
           p.town_id      = target_geo_id
           -- Or the member sits somewhere beneath the post's community.
           or exists (
             select 1 from public.geo_ancestors(p.village_id)   a where a.id = target_geo_id
           )
           or exists (
             select 1 from public.geo_ancestors(p.community_id) a where a.id = target_geo_id
           )
           or exists (
             select 1 from public.geo_ancestors(p.town_id)      a where a.id = target_geo_id
           )
         )
    )
  end;
$fn$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.posts enable row level security;

-- Public posts are readable by anyone, signed in or not. This is what makes
-- community pages indexable and the platform discoverable.
drop policy if exists posts_select_public on public.posts;
create policy posts_select_public
  on public.posts for select
  to anon, authenticated
  using (deleted_at is null and visibility = 'public');

drop policy if exists posts_select_community on public.posts;
create policy posts_select_community
  on public.posts for select
  to authenticated
  using (
    deleted_at is null
    and visibility = 'community'
    and public.member_of_geo(geo_id)
  );

-- An author always sees their own posts, including while soft-deleted, so a
-- deletion can be explained rather than silently vanishing.
drop policy if exists posts_select_own on public.posts;
create policy posts_select_own
  on public.posts for select
  to authenticated
  using (author_id = auth.uid());

drop policy if exists posts_select_staff on public.posts;
create policy posts_select_staff
  on public.posts for select
  to authenticated
  using (public.is_staff());

-- A member may only create posts as themselves, and only while active.
drop policy if exists posts_insert_own on public.posts;
create policy posts_insert_own
  on public.posts for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and public.is_active_member()
  );

drop policy if exists posts_update_own on public.posts;
create policy posts_update_own
  on public.posts for update
  to authenticated
  using (author_id = auth.uid() and public.is_active_member())
  with check (author_id = auth.uid());

-- Moderators can take a post down. They cannot rewrite it: the guard trigger
-- below restores the body for anyone who is not the author, so moderation can
-- remove but never put words in a member's mouth.
drop policy if exists posts_update_staff on public.posts;
create policy posts_update_staff
  on public.posts for update
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- No DELETE policy for anyone. Removal is soft, via deleted_at, so moderation
-- decisions stay auditable and a member's own history is not silently rewritten.

-- ---------------------------------------------------------------------------
-- Guard: what an update may actually change
-- ---------------------------------------------------------------------------

create or replace function public.posts_guard_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  -- Authorship and creation time are never editable by anyone.
  new.author_id  := old.author_id;
  new.created_at := old.created_at;

  if new.author_id = auth.uid() then
    -- The author edited their own words: record that honestly.
    if new.body is distinct from old.body then
      new.edited_at := now();
    end if;
  else
    -- A moderator. They may set deleted_at and nothing else; the body,
    -- visibility and community scope are restored from the previous row.
    new.body       := old.body;
    new.visibility := old.visibility;
    new.geo_id     := old.geo_id;
    new.edited_at  := old.edited_at;
  end if;

  return new;
end;
$fn$;

drop trigger if exists posts_guard on public.posts;
create trigger posts_guard
  before update on public.posts
  for each row execute function public.posts_guard_update();

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant select on public.posts to anon, authenticated;
grant insert, update on public.posts to authenticated;
