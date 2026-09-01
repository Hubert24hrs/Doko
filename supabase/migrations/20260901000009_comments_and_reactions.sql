-- Ezike Oba :: Phase 2 -- 009
-- Comments and reactions.
--
-- The rule that shapes both: you can see a comment or a reaction exactly when
-- you can see the post it belongs to. That is expressed as an EXISTS against
-- posts, so the posts policies do the deciding. Restating the visibility
-- rules here would create a second copy to keep in sync, and the copy outside
-- the source of truth is the one that drifts.

-- ---------------------------------------------------------------------------
-- Repair: point posts.author_id at profiles.
--
-- Migration 008 pointed it at auth.users. The identity is identical, since
-- profiles.id IS the auth user id, but PostgREST will only embed across a
-- foreign key whose target is in the exposed schema. With the key on
-- auth.users, `author:author_id ( username, full_name )` fails with
--
--   PGRST200: Could not find a relationship between 'posts' and 'author_id'
--
-- which took the whole feed query down, not just the author's name. Deletion
-- still cascades, because profiles.id itself cascades from auth.users.
-- ---------------------------------------------------------------------------

alter table public.posts drop constraint if exists posts_author_id_fkey;
alter table public.posts
  add constraint posts_author_id_fkey
  foreign key (author_id) references public.profiles(id) on delete cascade;

-- ---------------------------------------------------------------------------
-- Reaction kinds
--
-- Chosen for this community rather than copied from a Western social network.
-- Funerals and festivals are both major community events in Igbo-Eze North, so
-- "sad" earns its place alongside "celebrate", and "support" covers the
-- condolence and solidarity cases that a bare thumbs-up handles badly.
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.reaction_kind as enum ('like', 'celebrate', 'support', 'sad');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------

create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts(id) on delete cascade,
  -- profiles, not auth.users -- see the note in 008. PostgREST can only embed
  -- across a foreign key whose target lives in the exposed schema.
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  edited_at  timestamptz,
  deleted_at timestamptz,

  constraint comments_body_not_blank check (length(btrim(body)) > 0),
  constraint comments_body_length check (length(body) <= 2000)
);

-- Comments read oldest-first under their post, which is the opposite of the
-- feed. The index carries that order so the common read needs no sort.
create index if not exists comments_post_idx
  on public.comments (post_id, created_at asc)
  where deleted_at is null;

create index if not exists comments_author_idx
  on public.comments (author_id, created_at desc)
  where deleted_at is null;

drop trigger if exists comments_set_updated_at on public.comments;
create trigger comments_set_updated_at
  before update on public.comments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Reactions
--
-- One per person per post. Changing your mind is an UPDATE of `kind`, not a
-- second row, which is what the unique constraint enforces.
-- ---------------------------------------------------------------------------

create table if not exists public.reactions (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       public.reaction_kind not null default 'like',
  created_at timestamptz not null default now(),

  constraint reactions_one_per_person unique (post_id, user_id)
);

create index if not exists reactions_post_idx on public.reactions (post_id);
create index if not exists reactions_user_idx on public.reactions (user_id);

-- ---------------------------------------------------------------------------
-- Denormalised counts
--
-- A feed page shows twenty posts. Counting comments and reactions per post at
-- read time is twenty aggregates per page, and it gets worse as the platform
-- grows. These columns are maintained by triggers instead, so the feed reads
-- them for free.
--
-- The trade-off is that a counter can drift if a trigger is ever missed;
-- public.recount_post_engagement() exists to repair that from the source rows.
-- ---------------------------------------------------------------------------

alter table public.posts
  add column if not exists comment_count integer not null default 0,
  add column if not exists reaction_count integer not null default 0;

alter table public.posts
  drop constraint if exists posts_counts_non_negative;
alter table public.posts
  add constraint posts_counts_non_negative
  check (comment_count >= 0 and reaction_count >= 0);

create or replace function public.comments_maintain_count()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'INSERT' then
    if new.deleted_at is null then
      update public.posts set comment_count = comment_count + 1 where id = new.post_id;
    end if;

  elsif tg_op = 'UPDATE' then
    -- Only a change in deleted-ness moves the count. An edit does not.
    if old.deleted_at is null and new.deleted_at is not null then
      update public.posts set comment_count = greatest(comment_count - 1, 0) where id = new.post_id;
    elsif old.deleted_at is not null and new.deleted_at is null then
      update public.posts set comment_count = comment_count + 1 where id = new.post_id;
    end if;

  elsif tg_op = 'DELETE' then
    if old.deleted_at is null then
      update public.posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
    end if;
  end if;

  return null;  -- AFTER trigger; the return value is ignored.
end;
$fn$;

drop trigger if exists comments_count on public.comments;
create trigger comments_count
  after insert or update or delete on public.comments
  for each row execute function public.comments_maintain_count();

create or replace function public.reactions_maintain_count()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'INSERT' then
    update public.posts set reaction_count = reaction_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.posts set reaction_count = greatest(reaction_count - 1, 0) where id = old.post_id;
  end if;
  -- An UPDATE only ever changes `kind`, which does not move the total.
  return null;
end;
$fn$;

drop trigger if exists reactions_count on public.reactions;
create trigger reactions_count
  after insert or delete on public.reactions
  for each row execute function public.reactions_maintain_count();

-- Repair counters from the source rows. Cheap insurance against drift.
create or replace function public.recount_post_engagement(p_post_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_rows integer;
begin
  update public.posts p
     set comment_count = (
           select count(*) from public.comments c
            where c.post_id = p.id and c.deleted_at is null
         ),
         reaction_count = (
           select count(*) from public.reactions r where r.post_id = p.id
         )
   where p_post_id is null or p.id = p_post_id;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$fn$;

revoke all on function public.recount_post_engagement(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.comments enable row level security;
alter table public.reactions enable row level security;

-- Readable exactly when the post is readable. The EXISTS runs against posts
-- with the caller's own privileges, so the posts policies decide, and there is
-- no second copy of the visibility rules to drift.
drop policy if exists comments_select on public.comments;
create policy comments_select
  on public.comments for select
  to anon, authenticated
  using (
    deleted_at is null
    and exists (select 1 from public.posts p where p.id = post_id)
  );

-- The author keeps sight of their own removed comment, as with posts.
drop policy if exists comments_select_own on public.comments;
create policy comments_select_own
  on public.comments for select
  to authenticated
  using (author_id = auth.uid());

drop policy if exists comments_select_staff on public.comments;
create policy comments_select_staff
  on public.comments for select
  to authenticated
  using (public.is_staff());

drop policy if exists comments_insert_own on public.comments;
create policy comments_insert_own
  on public.comments for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and public.is_active_member()
    -- You may only comment on a post you can actually see, and not on one
    -- that has been removed.
    and exists (
      select 1 from public.posts p
       where p.id = post_id and p.deleted_at is null
    )
  );

drop policy if exists comments_update_own on public.comments;
create policy comments_update_own
  on public.comments for update
  to authenticated
  using (author_id = auth.uid() and public.is_active_member())
  with check (author_id = auth.uid());

drop policy if exists comments_update_staff on public.comments;
create policy comments_update_staff
  on public.comments for update
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- No DELETE policy: removal is soft, as it is for posts.

-- Same guard as posts: a moderator may remove, never rewrite.
create or replace function public.comments_guard_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  new.author_id  := old.author_id;
  new.post_id    := old.post_id;
  new.created_at := old.created_at;

  if new.author_id = auth.uid() then
    if new.body is distinct from old.body then
      new.edited_at := now();
    end if;
  else
    new.body      := old.body;
    new.edited_at := old.edited_at;
  end if;

  return new;
end;
$fn$;

drop trigger if exists comments_guard on public.comments;
create trigger comments_guard
  before update on public.comments
  for each row execute function public.comments_guard_update();

-- Reactions ------------------------------------------------------------------

drop policy if exists reactions_select on public.reactions;
create policy reactions_select
  on public.reactions for select
  to anon, authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));

drop policy if exists reactions_insert_own on public.reactions;
create policy reactions_insert_own
  on public.reactions for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.is_active_member()
    and exists (
      select 1 from public.posts p
       where p.id = post_id and p.deleted_at is null
    )
  );

drop policy if exists reactions_update_own on public.reactions;
create policy reactions_update_own
  on public.reactions for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Reactions ARE hard-deletable, unlike posts and comments. A reaction is a
-- signal rather than speech: withdrawing one leaves nothing worth auditing,
-- and keeping a tombstone would misrepresent what the member currently thinks.
drop policy if exists reactions_delete_own on public.reactions;
create policy reactions_delete_own
  on public.reactions for delete
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant select on public.comments to anon, authenticated;
grant insert, update on public.comments to authenticated;

grant select on public.reactions to anon, authenticated;
grant insert, update, delete on public.reactions to authenticated;
