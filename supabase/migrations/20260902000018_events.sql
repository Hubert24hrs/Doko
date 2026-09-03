-- Ezike Oba :: Phase 4 -- 018
-- Community events.
--
-- The first Phase 4 feature, and the one most likely to be used immediately:
-- in Igbo-Eze North the calendar is funerals, festivals, weddings, town
-- meetings and market days, and all of them are currently organised by word of
-- mouth and WhatsApp forwards.
--
-- Two things here are easy to get wrong and are dealt with deliberately.
--
--   1. WHEN AN EVENT STOPS BEING UPCOMING. An event that started an hour ago
--      and runs all day is still happening. Ordering or filtering on
--      starts_at alone drops a funeral from the listing at the moment people
--      are most likely to be looking it up. See ends_at below.
--   2. TIME ZONES. Every instant is timestamptz, and every rendering is in
--      Africa/Lagos. Nigeria is UTC+1 with NO daylight saving, so a fixed
--      display zone is exactly right rather than an approximation -- there is
--      no half of the year when it is wrong.

do $$ begin
  create type public.event_kind as enum (
    'festival', 'funeral', 'wedding', 'meeting', 'religious',
    'market', 'sport', 'fundraiser', 'other'
  );
exception when duplicate_object then null; end $$;

-- Deliberately NOT post_visibility. That enum carries 'followers', which for
-- an event would be a value nobody could satisfy: an event is an invitation to
-- a place at a time, and "only my followers may know" is not a thing anybody
-- organising a village meeting means. A visibility nobody can satisfy is a
-- trap, and this schema has already been bitten by adding one early.
do $$ begin
  create type public.event_visibility as enum ('public', 'community');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.rsvp_status as enum ('going', 'interested', 'not_going');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),

  title       text not null,
  description text,
  kind        public.event_kind not null default 'other',

  -- Where, as a community. NULL means the whole LGA, as it does for a post.
  geo_id uuid references public.geo_entities(id) on delete set null,
  -- Where, as a place people can actually go. Free text on purpose: "St
  -- Mary's field, behind the market" is a real answer and no dropdown of
  -- venues will ever contain it.
  venue text,

  starts_at timestamptz not null,

  -- Never null after the trigger below. A null end is filled with the end of
  -- the event's own day in Africa/Lagos, because a funeral "on Saturday" runs
  -- until Saturday is over -- and because every query that asks "is this still
  -- upcoming" would otherwise have to re-derive that rule, and the copies
  -- would drift.
  ends_at timestamptz,

  is_all_day boolean not null default false,

  organizer_id uuid not null references public.profiles(id) on delete cascade,

  -- An event can belong to a group, and then the group governs who sees it --
  -- exactly as it does for a post. visibility is not consulted at all.
  group_id uuid references public.groups(id) on delete cascade,
  visibility public.event_visibility not null default 'public',

  -- Cancelled, not deleted. An event people have arranged their day around
  -- must not simply vanish: they need to be told, and the row is what tells
  -- them.
  cancelled_at timestamptz,
  cancellation_reason text,

  -- Trigger-maintained, as post engagement counts are: a listing page would
  -- otherwise run two aggregates per row.
  going_count      integer not null default 0,
  interested_count integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  edited_at  timestamptz,
  deleted_at timestamptz,

  constraint events_title_not_blank check (length(btrim(title)) > 0),
  constraint events_title_length check (length(title) <= 160),
  constraint events_description_length
    check (description is null or length(description) <= 8000),
  constraint events_venue_length check (venue is null or length(venue) <= 200),
  constraint events_reason_length
    check (cancellation_reason is null or length(cancellation_reason) <= 500),
  constraint events_ends_after_start check (ends_at is null or ends_at >= starts_at),
  constraint events_counts_non_negative
    check (going_count >= 0 and interested_count >= 0)
);

-- The listing is "what is still to come, soonest first", and the ORDER is by
-- start while the FILTER is on end. Both are indexed.
create index if not exists events_starts_idx
  on public.events (starts_at) where deleted_at is null;
create index if not exists events_ends_idx
  on public.events (ends_at) where deleted_at is null;
create index if not exists events_geo_idx
  on public.events (geo_id) where deleted_at is null;
create index if not exists events_group_idx
  on public.events (group_id) where deleted_at is null and group_id is not null;
create index if not exists events_organizer_idx
  on public.events (organizer_id) where deleted_at is null;

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- When an event ends
--
-- Filled here rather than computed at read time so that "still upcoming" is
-- one indexed comparison instead of a rule restated in every query that asks.
-- `timestamptz AT TIME ZONE 'Africa/Lagos'` is only STABLE, so this cannot be
-- a generated column -- which is precisely why it is a trigger.
-- ---------------------------------------------------------------------------

create or replace function public.events_fill_ends_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  if new.ends_at is null then
    -- Midnight at the end of the event's own local day. An event on Saturday
    -- stays listed for the whole of Saturday, however early it started.
    new.ends_at :=
      (date_trunc('day', new.starts_at at time zone 'Africa/Lagos')
        + interval '1 day') at time zone 'Africa/Lagos';
  end if;

  if tg_op = 'UPDATE' and new.deleted_at is null
     and (new.title is distinct from old.title
          or new.description is distinct from old.description
          or new.starts_at is distinct from old.starts_at
          or new.venue is distinct from old.venue) then
    new.edited_at := now();
  end if;

  return new;
end;
$fn$;

drop trigger if exists events_fill_ends on public.events;
create trigger events_fill_ends
  before insert or update on public.events
  for each row execute function public.events_fill_ends_at();

-- ---------------------------------------------------------------------------
-- Moderators may remove, never rewrite
--
-- The same rule as posts and comments, and for the same reason: moderation
-- must never be able to put words in a member's mouth, or move somebody's
-- funeral to a different day.
-- ---------------------------------------------------------------------------

create or replace function public.events_guard_content()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if auth.uid() is not null and auth.uid() <> old.organizer_id then
    new.title       := old.title;
    new.description := old.description;
    new.starts_at   := old.starts_at;
    new.ends_at     := old.ends_at;
    new.venue       := old.venue;
    new.geo_id      := old.geo_id;
    new.kind        := old.kind;
    new.visibility  := old.visibility;
    new.group_id    := old.group_id;
    new.organizer_id := old.organizer_id;
    new.edited_at   := old.edited_at;
  end if;
  return new;
end;
$fn$;

drop trigger if exists events_guard on public.events;
create trigger events_guard
  before update on public.events
  for each row execute function public.events_guard_content();

-- ---------------------------------------------------------------------------
-- Who is coming
-- ---------------------------------------------------------------------------

create table if not exists public.event_attendees (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  status   public.rsvp_status not null default 'going',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (event_id, user_id)
);

create index if not exists event_attendees_user_idx
  on public.event_attendees (user_id);

drop trigger if exists event_attendees_set_updated_at on public.event_attendees;
create trigger event_attendees_set_updated_at
  before update on public.event_attendees
  for each row execute function public.set_updated_at();

create or replace function public.event_attendees_maintain_counts()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_event uuid := coalesce(new.event_id, old.event_id);
begin
  update public.events e
     set going_count = (
           select count(*) from public.event_attendees a
            where a.event_id = e.id and a.status = 'going'
         ),
         interested_count = (
           select count(*) from public.event_attendees a
            where a.event_id = e.id and a.status = 'interested'
         )
   where e.id = v_event;
  return null;
end;
$fn$;

-- Recounted rather than incremented, because an RSVP is UPDATED as well as
-- inserted and deleted -- 'interested' becoming 'going' has to move a person
-- between two counters, and a pair of deltas gets that wrong far more easily
-- than a pair of counts gets it slow.
drop trigger if exists event_attendees_counts on public.event_attendees;
create trigger event_attendees_counts
  after insert or update or delete on public.event_attendees
  for each row execute function public.event_attendees_maintain_counts();

create or replace function public.recount_event_attendance(p_event_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v_rows integer;
begin
  update public.events e
     set going_count = (
           select count(*) from public.event_attendees a
            where a.event_id = e.id and a.status = 'going'
         ),
         interested_count = (
           select count(*) from public.event_attendees a
            where a.event_id = e.id and a.status = 'interested'
         )
   where p_event_id is null or e.id = p_event_id;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$fn$;

revoke all on function public.recount_event_attendance(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Can this caller see this event?
--
-- One definer helper, so that event_attendees can ask the question without
-- restating the rules -- exactly as comments and reactions ask an EXISTS
-- against posts rather than carrying a second copy of post visibility.
-- ---------------------------------------------------------------------------

create or replace function public.can_see_event(
  target_event_id uuid,
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.events e
     where e.id = target_event_id
       and e.deleted_at is null
       and (
         e.organizer_id = check_user_id
         or case
              when e.group_id is not null
                then public.can_see_group(e.group_id, check_user_id)
              when e.visibility = 'public' then true
              else public.member_of_geo(e.geo_id, check_user_id)
            end
       )
  );
$fn$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.events enable row level security;
alter table public.event_attendees enable row level security;

-- NOTE the `group_id is null` on the first two. Permissive policies are OR'd,
-- so without it an event inside a PRIVATE group, carrying the column default
-- visibility = 'public', would be readable by the whole internet while the
-- group looked locked. That is exactly the leak migration 014 had to go back
-- and close for posts; it is written correctly here the first time.
drop policy if exists events_select_public on public.events;
create policy events_select_public
  on public.events for select
  to anon, authenticated
  using (deleted_at is null and group_id is null and visibility = 'public');

drop policy if exists events_select_community on public.events;
create policy events_select_community
  on public.events for select
  to authenticated
  using (
    deleted_at is null
    and group_id is null
    and visibility = 'community'
    and public.member_of_geo(geo_id)
  );

drop policy if exists events_select_group on public.events;
create policy events_select_group
  on public.events for select
  to anon, authenticated
  using (
    deleted_at is null
    and group_id is not null
    and public.can_see_group(group_id)
  );

-- An organiser sees their own event even after it is removed, so that they can
-- tell it was removed rather than watch it vanish.
drop policy if exists events_select_own on public.events;
create policy events_select_own
  on public.events for select
  to authenticated
  using (organizer_id = auth.uid());

drop policy if exists events_select_staff on public.events;
create policy events_select_staff
  on public.events for select
  to authenticated
  using (public.is_staff());

drop policy if exists events_insert_own on public.events;
create policy events_insert_own
  on public.events for insert
  to authenticated
  with check (
    organizer_id = auth.uid()
    and public.is_active_member()
    and (group_id is null or public.is_group_member(group_id))
  );

drop policy if exists events_update_own on public.events;
create policy events_update_own
  on public.events for update
  to authenticated
  using (organizer_id = auth.uid() and deleted_at is null)
  with check (organizer_id = auth.uid());

-- Staff may remove or cancel; the guard trigger above restores everything
-- else, so this cannot become a licence to rewrite somebody's event.
drop policy if exists events_update_staff on public.events;
create policy events_update_staff
  on public.events for update
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- No DELETE policy for anyone. Removal is deleted_at, as for posts.

-- Attendees ------------------------------------------------------------------

-- Visible exactly when the event is. An EXISTS against events rather than a
-- restatement of the rules, so a new visibility tier is inherited rather than
-- needing a second edit here.
drop policy if exists event_attendees_select on public.event_attendees;
create policy event_attendees_select
  on public.event_attendees for select
  to anon, authenticated
  using (public.can_see_event(event_id));

drop policy if exists event_attendees_write_own on public.event_attendees;
create policy event_attendees_write_own
  on public.event_attendees for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.is_active_member()
    and public.can_see_event(event_id)
  );

drop policy if exists event_attendees_update_own on public.event_attendees;
create policy event_attendees_update_own
  on public.event_attendees for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- An RSVP is a current intention, not speech. Withdrawing it should leave
-- nothing behind -- a tombstone would misstate who is coming, which is the one
-- thing this table exists to answer. Same reasoning as unfollowing and as
-- withdrawing a reaction.
drop policy if exists event_attendees_delete_own on public.event_attendees;
create policy event_attendees_delete_own
  on public.event_attendees for delete
  to authenticated
  using (user_id = auth.uid());

grant select on public.events to anon, authenticated;
grant insert, update on public.events to authenticated;
grant select on public.event_attendees to anon, authenticated;
grant insert, update, delete on public.event_attendees to authenticated;
