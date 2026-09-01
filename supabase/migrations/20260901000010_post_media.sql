-- Ezike Oba :: Phase 2 -- 010
-- Images on posts.
--
-- Two separate problems, deliberately kept separate:
--
--   1. Where the bytes live and who may fetch them  -> storage.objects policies
--   2. What the platform knows about them           -> public.post_media rows
--
-- Storage RLS is a different discipline from row RLS. A row policy answers
-- "may this member read this record"; a storage policy answers "may this
-- member fetch this file", and the file has no natural link to a post unless
-- the path carries one. That is why the path layout below is load-bearing
-- rather than cosmetic.

-- ---------------------------------------------------------------------------
-- The bucket
--
-- PRIVATE, not public. A public bucket serves every object to anyone holding
-- the URL, with no policy consulted at all -- which would make a
-- community-scoped post's photograph readable by the whole internet as soon
-- as its URL leaked. Unguessable UUIDs are obscurity, not access control.
--
-- Access therefore goes through signed URLs minted server-side, and the
-- policies below decide who may mint one.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'post-media',
  'post-media',
  false,
  8388608,  -- 8 MB. Generous for a photograph, mean enough to matter on a
            -- Nigerian mobile data bundle, which is who this is for.
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- What the platform records about each image
-- ---------------------------------------------------------------------------

create table if not exists public.post_media (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts(id) on delete cascade,
  -- Object path inside the bucket: '<post_id>/<uuid>.<ext>'. The leading
  -- segment is what the storage policies read to find the owning post.
  storage_path text not null unique,
  mime_type   text not null,
  byte_size   integer not null,
  width       integer,
  height      integer,
  -- Alternative text. Nullable because a member may genuinely not supply one,
  -- and refusing the upload would cost us the photograph rather than gain us
  -- the description. The UI asks for it every time.
  alt_text    text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),

  constraint post_media_mime_allowed check (
    mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')
  ),
  constraint post_media_size_positive check (byte_size > 0 and byte_size <= 8388608),
  constraint post_media_alt_length check (alt_text is null or length(alt_text) <= 300),
  constraint post_media_dimensions check (
    (width is null and height is null) or (width > 0 and height > 0)
  )
);

create index if not exists post_media_post_idx
  on public.post_media (post_id, sort_order);

-- A post carries at most four images. Enforced in the database because the
-- limit protects storage cost and page weight, and a client-side check is a
-- suggestion.
create or replace function public.post_media_enforce_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_count integer;
begin
  select count(*) into v_count from public.post_media where post_id = new.post_id;
  if v_count >= 4 then
    raise exception 'A post can carry at most 4 images'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$fn$;

drop trigger if exists post_media_limit on public.post_media;
create trigger post_media_limit
  before insert on public.post_media
  for each row execute function public.post_media_enforce_limit();

-- ---------------------------------------------------------------------------
-- Row policies: an image is visible exactly when its post is
--
-- Same EXISTS pattern as comments and reactions. The posts policies remain the
-- single place visibility is decided.
-- ---------------------------------------------------------------------------

alter table public.post_media enable row level security;

drop policy if exists post_media_select on public.post_media;
create policy post_media_select
  on public.post_media for select
  to anon, authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));

drop policy if exists post_media_insert_own on public.post_media;
create policy post_media_insert_own
  on public.post_media for insert
  to authenticated
  with check (
    public.is_active_member()
    and exists (
      select 1 from public.posts p
       where p.id = post_id
         and p.author_id = auth.uid()
         and p.deleted_at is null
    )
  );

-- Only the author may detach an image, and only from their own live post.
-- Moderators remove the whole post instead: taking one image out of somebody
-- else's post is editing it, which moderation must never do.
drop policy if exists post_media_delete_own on public.post_media;
create policy post_media_delete_own
  on public.post_media for delete
  to authenticated
  using (
    exists (
      select 1 from public.posts p
       where p.id = post_id and p.author_id = auth.uid()
    )
  );

-- Alt text is the only editable field, and only by the author.
drop policy if exists post_media_update_own on public.post_media;
create policy post_media_update_own
  on public.post_media for update
  to authenticated
  using (
    exists (
      select 1 from public.posts p
       where p.id = post_id and p.author_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.posts p
       where p.id = post_id and p.author_id = auth.uid()
    )
  );

create or replace function public.post_media_guard_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  -- Everything except alt_text and sort_order is immutable once uploaded.
  -- Letting storage_path change would point a row at somebody else's file.
  new.id           := old.id;
  new.post_id      := old.post_id;
  new.storage_path := old.storage_path;
  new.mime_type    := old.mime_type;
  new.byte_size    := old.byte_size;
  new.width        := old.width;
  new.height       := old.height;
  new.created_at   := old.created_at;
  return new;
end;
$fn$;

drop trigger if exists post_media_guard on public.post_media;
create trigger post_media_guard
  before update on public.post_media
  for each row execute function public.post_media_guard_update();

-- ---------------------------------------------------------------------------
-- Storage policies
--
-- The object path is '<post_id>/<file>', so the first segment identifies the
-- owning post. `split_part(name, '/', 1)` extracts it, and the same visibility
-- question is asked of `posts` as everywhere else.
--
-- A malformed path yields a first segment that is not a UUID, so the cast
-- would raise. Everything is guarded by a regex test first, and a path that
-- does not match simply matches no policy -- which denies, because storage RLS
-- denies by default.
-- ---------------------------------------------------------------------------

create or replace function public.storage_path_post_id(object_name text)
returns uuid
language sql
immutable
as $fn$
  select case
    when split_part(object_name, '/', 1) ~
         '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then split_part(object_name, '/', 1)::uuid
    else null
  end;
$fn$;

-- Read: you may fetch the bytes exactly when you may read the post.
drop policy if exists post_media_objects_select on storage.objects;
create policy post_media_objects_select
  on storage.objects for select
  to anon, authenticated
  using (
    bucket_id = 'post-media'
    and public.storage_path_post_id(name) is not null
    and exists (
      select 1 from public.posts p
       where p.id = public.storage_path_post_id(name)
    )
  );

-- Write: only the post's author, only onto their own live post, and only
-- while their account is in good standing. This is the check a client-side
-- file picker cannot make.
drop policy if exists post_media_objects_insert on storage.objects;
create policy post_media_objects_insert
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'post-media'
    and public.storage_path_post_id(name) is not null
    and public.is_active_member()
    and exists (
      select 1 from public.posts p
       where p.id = public.storage_path_post_id(name)
         and p.author_id = auth.uid()
         and p.deleted_at is null
    )
  );

drop policy if exists post_media_objects_delete on storage.objects;
create policy post_media_objects_delete
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'post-media'
    and public.storage_path_post_id(name) is not null
    and exists (
      select 1 from public.posts p
       where p.id = public.storage_path_post_id(name)
         and p.author_id = auth.uid()
    )
  );

-- No UPDATE policy on objects: an uploaded file is replaced by deleting and
-- re-uploading, so an object's bytes can never change under a row that
-- describes them.

grant select on public.post_media to anon, authenticated;
grant insert, update, delete on public.post_media to authenticated;
