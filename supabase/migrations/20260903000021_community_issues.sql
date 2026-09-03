-- Ezike Oba :: Phase 4 -- 021
-- Community issues: reporting what is broken.
--
-- A borehole that has stopped working, a road washed out, a transformer down,
-- a bridge that needs repair. The thing this LGA currently does by walking to
-- somebody's compound and telling them.
--
-- This is the first feature whose access model is genuinely SIMPLER than the
-- ones before it, and the simplifications are deliberate rather than
-- shortcuts:
--
--   1. NO VISIBILITY TIERS AND NO GROUPS. A broken borehole is not private
--      information. Posts, events, jobs and listings all carry a visibility
--      column and a group_id because somebody might reasonably want a narrower
--      audience; an issue exists to be seen by as many people as possible,
--      including whoever can fix it. There is nothing here to narrow, so there
--      is no `visibility` column to get wrong and no OR'd-policy leak to close.
--   2. geo_id IS REQUIRED. Everywhere else NULL means "the whole LGA", which
--      is a sensible default for a post and a meaningless one for a pothole.
--      An issue that is nowhere cannot be fixed, so the column is NOT NULL.
--   3. COMMUNITY ADMINS FINALLY MATTER. `administers_geo()` has existed since
--      migration 003 and no feature has used it: jobs, events and the
--      marketplace only ever needed platform-wide `is_staff()`. A community
--      admin's authority is inherently geographic, and an issue is inherently
--      located, so this is the feature that rule was written for.

do $$ begin
  create type public.issue_category as enum (
    'road', 'water', 'electricity', 'security', 'waste', 'health',
    'education', 'environment', 'other'
  );
exception when duplicate_object then null; end $$;

-- Deliberately not a boolean "resolved". A community needs to see the
-- difference between "nobody has looked at this" and "somebody is on it",
-- because the second is what stops five people reporting the same thing.
do $$ begin
  create type public.issue_status as enum (
    'reported', 'acknowledged', 'in_progress', 'resolved', 'declined'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Issues
-- ---------------------------------------------------------------------------

create table if not exists public.community_issues (
  id uuid primary key default gen_random_uuid(),

  title       text not null,
  description text not null,
  category    public.issue_category not null default 'other',

  -- NOT NULL, unlike every other geo_id in this schema. See the header.
  geo_id uuid not null references public.geo_entities(id) on delete restrict,
  -- Where exactly, in the words somebody would actually use to direct you.
  location_text text,

  -- Optional precise pin, for the map. Nullable because most reports will be
  -- filed from a phone that was nowhere near the problem at the time, and
  -- refusing those would cost the community the report.
  latitude  double precision,
  longitude double precision,

  reporter_id uuid not null references public.profiles(id) on delete cascade,

  status public.issue_status not null default 'reported',
  -- Why it moved to its current status. The whole point of 'declined' is that
  -- it can carry a reason; a status change with no explanation is worse than
  -- no status change at all.
  status_note text,
  status_changed_by uuid references public.profiles(id) on delete set null,
  status_changed_at timestamptz,
  resolved_at timestamptz,

  -- Trigger-maintained, as every other count in this schema is.
  confirm_count integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  edited_at  timestamptz,
  deleted_at timestamptz,

  constraint issues_title_not_blank check (length(btrim(title)) > 0),
  constraint issues_title_length check (length(title) <= 160),
  constraint issues_description_not_blank check (length(btrim(description)) > 0),
  constraint issues_description_length check (length(description) <= 4000),
  constraint issues_location_length
    check (location_text is null or length(location_text) <= 200),
  constraint issues_status_note_length
    check (status_note is null or length(status_note) <= 1000),
  constraint issues_confirm_count_non_negative check (confirm_count >= 0),

  -- Either both coordinates or neither: half a pin puts a marker in the Gulf
  -- of Guinea, which is where longitude 0 and a real latitude meet.
  constraint issues_coords_paired check (
    (latitude is null and longitude is null)
    or (latitude is not null and longitude is not null)
  ),
  constraint issues_latitude_range
    check (latitude is null or (latitude >= -90 and latitude <= 90)),
  constraint issues_longitude_range
    check (longitude is null or (longitude >= -180 and longitude <= 180))
);

create index if not exists issues_created_idx
  on public.community_issues (created_at desc) where deleted_at is null;
create index if not exists issues_geo_idx
  on public.community_issues (geo_id) where deleted_at is null;
create index if not exists issues_status_idx
  on public.community_issues (status) where deleted_at is null;
create index if not exists issues_category_idx
  on public.community_issues (category) where deleted_at is null;
create index if not exists issues_reporter_idx
  on public.community_issues (reporter_id) where deleted_at is null;
-- The map reads only the pinned ones, so they get their own partial index.
create index if not exists issues_located_idx
  on public.community_issues (latitude, longitude)
  where deleted_at is null and latitude is not null;

drop trigger if exists issues_set_updated_at on public.community_issues;
create trigger issues_set_updated_at
  before update on public.community_issues
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- "I see this too"
--
-- One row per person per issue, hard-deleted on withdrawal -- the same shape
-- as a reaction and an RSVP, and for the same reason: a confirmation is a
-- current statement of fact, not speech. A tombstone would misstate how many
-- people are still seeing the problem, which is the one question the count
-- exists to answer.
-- ---------------------------------------------------------------------------

create table if not exists public.issue_confirmations (
  issue_id uuid not null references public.community_issues(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (issue_id, user_id)
);

create index if not exists issue_confirmations_user_idx
  on public.issue_confirmations (user_id);

create or replace function public.issue_confirmations_maintain_count()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v_issue uuid := coalesce(new.issue_id, old.issue_id);
begin
  update public.community_issues i
     set confirm_count = (
           select count(*) from public.issue_confirmations c
            where c.issue_id = i.id
         )
   where i.id = v_issue;
  return null;
end;
$fn$;

drop trigger if exists issue_confirmations_count on public.issue_confirmations;
create trigger issue_confirmations_count
  after insert or delete on public.issue_confirmations
  for each row execute function public.issue_confirmations_maintain_count();

-- ---------------------------------------------------------------------------
-- Photos
--
-- The fourth media stack in this schema, and the reasoning is unchanged from
-- post_media (migration 010): private bucket, signed URLs, the object path
-- carrying its owning row's id because storage RLS has no other way to ask
-- who may read a file.
--
-- Four per issue rather than a listing's six. A photograph of a broken
-- borehole is evidence, not a shop window -- one clear picture usually
-- settles it.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'issue-media',
  'issue-media',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.issue_media (
  id           uuid primary key default gen_random_uuid(),
  issue_id     uuid not null references public.community_issues(id) on delete cascade,
  storage_path text not null unique,
  mime_type    text not null,
  byte_size    integer not null,
  width        integer,
  height       integer,
  alt_text     text,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),

  constraint issue_media_mime_allowed check (
    mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')
  ),
  constraint issue_media_size_positive check (byte_size > 0 and byte_size <= 8388608),
  constraint issue_media_alt_length check (alt_text is null or length(alt_text) <= 300),
  constraint issue_media_dimensions check (
    (width is null and height is null) or (width > 0 and height > 0)
  )
);

create index if not exists issue_media_issue_idx
  on public.issue_media (issue_id, sort_order);

create or replace function public.issue_media_enforce_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v_count integer;
begin
  select count(*) into v_count from public.issue_media where issue_id = new.issue_id;
  if v_count >= 4 then
    raise exception 'An issue can carry at most 4 photos'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$fn$;

drop trigger if exists issue_media_limit on public.issue_media;
create trigger issue_media_limit
  before insert on public.issue_media
  for each row execute function public.issue_media_enforce_limit();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

/**
 * Who may move an issue's status.
 *
 * Platform staff anywhere, or a community_admin whose scope CONTAINS the
 * issue's community -- administers_geo() walks the ancestors, so an admin
 * scoped to a town covers every village beneath it without being listed
 * against each one.
 */
create or replace function public.administers_issue(
  target_issue_id uuid,
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.community_issues i
     where i.id = target_issue_id
       and (
         public.is_staff(check_user_id)
         or public.administers_geo(i.geo_id, check_user_id)
       )
  );
$fn$;

create or replace function public.reported_issue(
  target_issue_id uuid,
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.community_issues i
     where i.id = target_issue_id and i.reporter_id = check_user_id
  );
$fn$;

-- ---------------------------------------------------------------------------
-- The guard: who may change what
--
-- Three parties touch an issue and each may change a different half.
--
--   * The REPORTER owns the description of the problem. They may correct what
--     they wrote and withdraw the report; they may NOT declare it resolved,
--     because "somebody said it is fixed" and "the person responsible says it
--     is fixed" are different claims and the second is the one worth showing.
--   * An ADMINISTRATOR owns the status. They may acknowledge, progress,
--     resolve or decline it with a note; they may NOT rewrite what the
--     reporter said was wrong -- the same rule that stops a moderator moving
--     somebody's funeral.
--   * Everybody else may confirm they see it, and nothing more.
-- ---------------------------------------------------------------------------

create or replace function public.issues_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_is_reporter boolean := auth.uid() is not null and auth.uid() = old.reporter_id;
  v_administers boolean := auth.uid() is not null
    and (public.is_staff() or public.administers_geo(old.geo_id));
begin
  -- Content belongs to the reporter.
  if not v_is_reporter then
    new.title         := old.title;
    new.description   := old.description;
    new.category      := old.category;
    new.geo_id        := old.geo_id;
    new.location_text := old.location_text;
    new.latitude      := old.latitude;
    new.longitude     := old.longitude;
    new.reporter_id   := old.reporter_id;
    new.edited_at     := old.edited_at;
  elsif new.deleted_at is null
        and (new.title is distinct from old.title
             or new.description is distinct from old.description
             or new.location_text is distinct from old.location_text) then
    new.edited_at := now();
  end if;

  -- Status belongs to whoever administers the place it is in.
  if not v_administers then
    new.status            := old.status;
    new.status_note       := old.status_note;
    new.status_changed_by := old.status_changed_by;
    new.status_changed_at := old.status_changed_at;
    new.resolved_at       := old.resolved_at;
  elsif new.status is distinct from old.status then
    -- Stamped here rather than trusted from the client, so the record of who
    -- moved it and when cannot be forged by sending different columns.
    new.status_changed_by := auth.uid();
    new.status_changed_at := now();
    new.resolved_at := case when new.status = 'resolved' then now() else null end;
  end if;

  return new;
end;
$fn$;

drop trigger if exists issues_guard_trigger on public.community_issues;
create trigger issues_guard_trigger
  before update on public.community_issues
  for each row execute function public.issues_guard();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.community_issues enable row level security;
alter table public.issue_confirmations enable row level security;
alter table public.issue_media enable row level security;

-- One SELECT policy, for everybody, because there is genuinely one audience.
-- No group narrowing is needed here and none should be added: an issue with a
-- restricted audience is a private complaint, which is a different feature.
drop policy if exists issues_select_all on public.community_issues;
create policy issues_select_all
  on public.community_issues for select
  to anon, authenticated
  using (deleted_at is null);

-- A reporter still sees their own after it is removed, so a withdrawal reads
-- as a withdrawal rather than as the report having never existed.
drop policy if exists issues_select_own on public.community_issues;
create policy issues_select_own
  on public.community_issues for select
  to authenticated
  using (reporter_id = auth.uid());

drop policy if exists issues_select_staff on public.community_issues;
create policy issues_select_staff
  on public.community_issues for select
  to authenticated
  using (public.is_staff());

drop policy if exists issues_insert_own on public.community_issues;
create policy issues_insert_own
  on public.community_issues for insert
  to authenticated
  with check (reporter_id = auth.uid() and public.is_active_member());

drop policy if exists issues_update_own on public.community_issues;
create policy issues_update_own
  on public.community_issues for update
  to authenticated
  using (reporter_id = auth.uid() and deleted_at is null)
  with check (reporter_id = auth.uid());

-- The administrator's route in. The guard above decides what they may
-- actually change once they are here.
drop policy if exists issues_update_admin on public.community_issues;
create policy issues_update_admin
  on public.community_issues for update
  to authenticated
  using (public.is_staff() or public.administers_geo(geo_id))
  with check (public.is_staff() or public.administers_geo(geo_id));

-- No DELETE policy for anyone. Removal is deleted_at.

-- Confirmations ---------------------------------------------------------

drop policy if exists issue_confirmations_select on public.issue_confirmations;
create policy issue_confirmations_select
  on public.issue_confirmations for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.community_issues i
       where i.id = issue_id and i.deleted_at is null
    )
  );

drop policy if exists issue_confirmations_insert_own on public.issue_confirmations;
create policy issue_confirmations_insert_own
  on public.issue_confirmations for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.is_active_member()
    and exists (
      select 1 from public.community_issues i
       where i.id = issue_id and i.deleted_at is null
    )
  );

drop policy if exists issue_confirmations_delete_own on public.issue_confirmations;
create policy issue_confirmations_delete_own
  on public.issue_confirmations for delete
  to authenticated
  using (user_id = auth.uid());

-- Media -----------------------------------------------------------------

drop policy if exists issue_media_select on public.issue_media;
create policy issue_media_select
  on public.issue_media for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.community_issues i
       where i.id = issue_id and i.deleted_at is null
    )
  );

drop policy if exists issue_media_insert_own on public.issue_media;
create policy issue_media_insert_own
  on public.issue_media for insert
  to authenticated
  with check (public.is_active_member() and public.reported_issue(issue_id));

drop policy if exists issue_media_delete_own on public.issue_media;
create policy issue_media_delete_own
  on public.issue_media for delete
  to authenticated
  using (public.reported_issue(issue_id));

create or replace function public.issue_media_guard_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  new.id           := old.id;
  new.issue_id     := old.issue_id;
  new.storage_path := old.storage_path;
  new.mime_type    := old.mime_type;
  new.byte_size    := old.byte_size;
  new.width        := old.width;
  new.height       := old.height;
  new.created_at   := old.created_at;
  return new;
end;
$fn$;

drop trigger if exists issue_media_guard on public.issue_media;
create trigger issue_media_guard
  before update on public.issue_media
  for each row execute function public.issue_media_guard_update();

drop policy if exists issue_media_update_own on public.issue_media;
create policy issue_media_update_own
  on public.issue_media for update
  to authenticated
  using (public.reported_issue(issue_id))
  with check (public.reported_issue(issue_id));

-- ---------------------------------------------------------------------------
-- Storage policies
-- ---------------------------------------------------------------------------

create or replace function public.storage_path_issue_id(object_name text)
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

drop policy if exists issue_media_objects_select on storage.objects;
create policy issue_media_objects_select
  on storage.objects for select
  to anon, authenticated
  using (
    bucket_id = 'issue-media'
    and public.storage_path_issue_id(name) is not null
    and exists (
      select 1 from public.community_issues i
       where i.id = public.storage_path_issue_id(name)
         and i.deleted_at is null
    )
  );

drop policy if exists issue_media_objects_insert on storage.objects;
create policy issue_media_objects_insert
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'issue-media'
    and public.storage_path_issue_id(name) is not null
    and public.is_active_member()
    and public.reported_issue(public.storage_path_issue_id(name))
  );

drop policy if exists issue_media_objects_delete on storage.objects;
create policy issue_media_objects_delete
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'issue-media'
    and public.storage_path_issue_id(name) is not null
    and public.reported_issue(public.storage_path_issue_id(name))
  );

grant select on public.community_issues to anon, authenticated;
grant insert, update on public.community_issues to authenticated;
grant select on public.issue_confirmations to anon, authenticated;
grant insert, delete on public.issue_confirmations to authenticated;
grant select on public.issue_media to anon, authenticated;
grant insert, update, delete on public.issue_media to authenticated;
