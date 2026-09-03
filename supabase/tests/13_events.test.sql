-- Ezike Oba :: events
--
-- Run either way:
--   * locally:  supabase test db
--   * hosted:   paste this whole file into the Supabase SQL Editor
--               (requires: create extension if not exists pgtap with schema extensions;)
--
-- Three things here are worth more than the rest.
--
--   1. An event in a PRIVATE group, left at the column default
--      visibility = 'public', must be invisible to the public. Permissive
--      policies are OR'd, and this is the leak migration 014 had to go back
--      and close for posts. It is written correctly here the first time, and
--      this suite is what keeps it that way.
--   2. ends_at is FILLED, not left null, and filled with the end of the
--      event's own day in Africa/Lagos. Everything about "what is still
--      upcoming" rests on it.
--   3. A moderator may remove or cancel an event and may NOT move it. Nobody
--      should be able to change where somebody's funeral is being held.

begin;

set local search_path = public, extensions, pg_temp;
select plan(34);

create table public._tap_out (
  at   timestamptz not null default clock_timestamp(),
  line text
);
grant insert, select on public._tap_out to public;
alter table public._tap_out disable row level security;

create table public._tap_fixture (
  name  text primary key,
  value uuid
);
grant select on public._tap_fixture to public;
alter table public._tap_fixture disable row level security;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values
  ('b1110000-1111-1111-1111-111111111111'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ev-o@example.com', '{"username":"ev_organiser","full_name":"Ev Organiser"}'),
  ('b2220000-2222-2222-2222-222222222222'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ev-g@example.com', '{"username":"ev_guest","full_name":"Ev Guest"}'),
  ('b3330000-3333-3333-3333-333333333333'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ev-m@example.com', '{"username":"ev_mod","full_name":"Ev Mod"}');

create or replace function pg_temp.become(user_id uuid)
returns void language plpgsql as $$
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims to %L',
    json_build_object('sub', user_id::text, 'role', 'authenticated')::text);
end $$;

create or replace function pg_temp.become_anon()
returns void language plpgsql as $$
begin
  execute 'set local role anon';
  execute 'set local request.jwt.claims to ''{"role":"anon"}''';
end $$;

update public.profiles set visibility = 'private'
 where id in (
   'b1110000-1111-1111-1111-111111111111'::uuid,
   'b2220000-2222-2222-2222-222222222222'::uuid,
   'b3330000-3333-3333-3333-333333333333'::uuid
 );

insert into public.user_roles (user_id, role) values
  ('b3330000-3333-3333-3333-333333333333'::uuid, 'moderator')
on conflict do nothing;

-- A private group, for the leak assertion.
select pg_temp.become('b1110000-1111-1111-1111-111111111111'::uuid);
insert into public.groups (id, name, slug, visibility, created_by) values
  ('bb000000-0000-0000-0000-000000000001', 'Closed Circle', 'closed-circle',
   'private', 'b1110000-1111-1111-1111-111111111111');
reset role;

insert into public._tap_fixture (name, value)
values ('group', 'bb000000-0000-0000-0000-000000000001');

-- ===========================================================================
-- Creating, and the filled end
-- ===========================================================================

select pg_temp.become('b1110000-1111-1111-1111-111111111111'::uuid);

insert into public._tap_out(line) select lives_ok(
  $$insert into public.events (id, title, kind, starts_at, organizer_id)
    values ('be000000-0000-0000-0000-000000000001', 'Village meeting', 'meeting',
            '2026-09-12 16:00:00+01', 'b1110000-1111-1111-1111-111111111111')$$,
  'a member can create an event'
);
reset role;

-- The end is filled with midnight ending the event's own LOCAL day. An event
-- at 4pm on the 12th stays listed for the whole of the 12th, which is the
-- whole reason "upcoming" filters on ends_at and not on starts_at.
insert into public._tap_out(line) select is(
  (select ends_at from public.events
    where id = 'be000000-0000-0000-0000-000000000001'::uuid),
  '2026-09-13 00:00:00+01'::timestamptz,
  'a missing end is filled with midnight ending the event''s own WAT day'
);

-- The one that would be silently wrong if the fill used UTC. 23:30 WAT on the
-- 12th is 22:30 UTC on the 12th -- but an event at 00:30 WAT on the 13th is
-- 23:30 UTC on the 12th, and a UTC-based fill would end it a day early.
select pg_temp.become('b1110000-1111-1111-1111-111111111111'::uuid);
insert into public.events (id, title, kind, starts_at, organizer_id)
values ('be000000-0000-0000-0000-000000000002', 'Night wake', 'funeral',
        '2026-09-13 00:30:00+01', 'b1110000-1111-1111-1111-111111111111');
reset role;

insert into public._tap_out(line) select is(
  (select ends_at from public.events
    where id = 'be000000-0000-0000-0000-000000000002'::uuid),
  '2026-09-14 00:00:00+01'::timestamptz,
  'an event just after midnight belongs to the NEW day, not the old one'
);

-- An explicit end is left exactly as given.
select pg_temp.become('b1110000-1111-1111-1111-111111111111'::uuid);
insert into public.events (id, title, kind, starts_at, ends_at, organizer_id)
values ('be000000-0000-0000-0000-000000000003', 'Market day', 'market',
        '2026-09-14 06:00:00+01', '2026-09-14 18:00:00+01',
        'b1110000-1111-1111-1111-111111111111');
reset role;

insert into public._tap_out(line) select is(
  (select ends_at from public.events
    where id = 'be000000-0000-0000-0000-000000000003'::uuid),
  '2026-09-14 18:00:00+01'::timestamptz,
  'an end that was given is not overwritten'
);

insert into public._tap_out(line) select throws_ok(
  $$insert into public.events (title, kind, starts_at, ends_at, organizer_id)
    values ('Backwards', 'other', '2026-09-14 18:00:00+01',
            '2026-09-14 06:00:00+01', 'b1110000-1111-1111-1111-111111111111')$$,
  '23514', null,
  'an event cannot end before it starts'
);

-- Nobody organises an event on somebody else's behalf.
select pg_temp.become('b2220000-2222-2222-2222-222222222222'::uuid);
insert into public._tap_out(line) select throws_ok(
  $$insert into public.events (title, kind, starts_at, organizer_id)
    values ('Not mine', 'other', '2026-09-20 10:00:00+01',
            'b1110000-1111-1111-1111-111111111111')$$,
  '42501', null,
  'a member cannot create an event in somebody else''s name'
);
reset role;

-- ===========================================================================
-- Visibility
-- ===========================================================================

select pg_temp.become_anon();
insert into public._tap_out(line) select is(
  (select count(*)::int from public.events
    where id = 'be000000-0000-0000-0000-000000000001'::uuid),
  1, 'a signed-out visitor can see a public event'
);
reset role;

-- A community event needs a community shared, and these fixtures share none.
select pg_temp.become('b1110000-1111-1111-1111-111111111111'::uuid);
insert into public.events (id, title, kind, starts_at, organizer_id, visibility)
values ('be000000-0000-0000-0000-000000000004', 'Community only', 'meeting',
        '2026-09-15 10:00:00+01', 'b1110000-1111-1111-1111-111111111111',
        'community');
reset role;

select pg_temp.become_anon();
insert into public._tap_out(line) select is(
  (select count(*)::int from public.events
    where id = 'be000000-0000-0000-0000-000000000004'::uuid),
  0, 'and cannot see a community event'
);
reset role;

select pg_temp.become('b2220000-2222-2222-2222-222222222222'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.events
    where id = 'be000000-0000-0000-0000-000000000004'::uuid),
  0, 'nor can a member who shares no community with the organiser'
);
reset role;

select pg_temp.become('b1110000-1111-1111-1111-111111111111'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.events
    where id = 'be000000-0000-0000-0000-000000000004'::uuid),
  1, 'but the organiser always sees their own'
);
reset role;

-- THE assertion. Note visibility is left at its column default of 'public',
-- which is exactly the row that would leak if events_select_public had not
-- been narrowed to group_id is null.
select pg_temp.become('b1110000-1111-1111-1111-111111111111'::uuid);
insert into public.events (id, title, kind, starts_at, organizer_id, group_id)
values ('be000000-0000-0000-0000-000000000005', 'Private group event', 'meeting',
        '2026-09-16 10:00:00+01', 'b1110000-1111-1111-1111-111111111111',
        'bb000000-0000-0000-0000-000000000001');
reset role;

insert into public._tap_fixture (name, value)
values ('private_event', 'be000000-0000-0000-0000-000000000005');

select pg_temp.become_anon();
insert into public._tap_out(line) select is(
  (select count(*)::int from public.events
    where id = 'be000000-0000-0000-0000-000000000005'::uuid),
  0,
  'a private group event is NOT public, despite visibility=public'
);
reset role;

select pg_temp.become('b2220000-2222-2222-2222-222222222222'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.events
    where id = 'be000000-0000-0000-0000-000000000005'::uuid),
  0, 'nor visible to a signed-in outsider'
);

-- Nor can an outsider create one in a group they are not in.
insert into public._tap_out(line) select throws_ok(
  $$insert into public.events (title, kind, starts_at, organizer_id, group_id)
    select 'Gatecrash', 'other', '2026-09-17 10:00:00+01',
           'b2220000-2222-2222-2222-222222222222', value
      from public._tap_fixture where name = 'group'$$,
  '42501', null,
  'and an outsider cannot put an event into a group they are not in'
);
reset role;

select pg_temp.become('b1110000-1111-1111-1111-111111111111'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.events
    where id = 'be000000-0000-0000-0000-000000000005'::uuid),
  1, 'while the group member sees it'
);
reset role;

-- ===========================================================================
-- RSVPs
-- ===========================================================================

select pg_temp.become('b2220000-2222-2222-2222-222222222222'::uuid);
insert into public._tap_out(line) select lives_ok(
  $$insert into public.event_attendees (event_id, user_id, status)
    values ('be000000-0000-0000-0000-000000000001',
            'b2220000-2222-2222-2222-222222222222', 'going')$$,
  'anyone who can see an event can reply to it'
);

-- Replying is not something you do for somebody else.
insert into public._tap_out(line) select throws_ok(
  $$insert into public.event_attendees (event_id, user_id, status)
    values ('be000000-0000-0000-0000-000000000001',
            'b1110000-1111-1111-1111-111111111111', 'going')$$,
  '42501', null,
  'but not on another member''s behalf'
);

-- An event you cannot see is an event you cannot answer. The rule is an EXISTS
-- against events, not a second copy of the visibility rules.
insert into public._tap_out(line) select throws_ok(
  $$insert into public.event_attendees (event_id, user_id, status)
    select value, 'b2220000-2222-2222-2222-222222222222', 'going'
      from public._tap_fixture where name = 'private_event'$$,
  '42501', null,
  'and an invisible event cannot be replied to at all'
);
reset role;

insert into public._tap_out(line) select is(
  (select going_count from public.events
    where id = 'be000000-0000-0000-0000-000000000001'::uuid),
  1, 'replying increments the going count'
);

-- 'interested' becoming 'going' has to MOVE a person between two counters. A
-- pair of increment/decrement deltas gets this wrong far more easily than a
-- pair of recounts gets it slow, which is why the trigger recounts.
select pg_temp.become('b2220000-2222-2222-2222-222222222222'::uuid);
update public.event_attendees set status = 'interested'
 where event_id = 'be000000-0000-0000-0000-000000000001'::uuid
   and user_id = 'b2220000-2222-2222-2222-222222222222'::uuid;
reset role;

insert into public._tap_out(line) select is(
  (select going_count from public.events
    where id = 'be000000-0000-0000-0000-000000000001'::uuid),
  0, 'changing the answer moves the person out of the going count'
);
insert into public._tap_out(line) select is(
  (select interested_count from public.events
    where id = 'be000000-0000-0000-0000-000000000001'::uuid),
  1, 'and into the interested count'
);

-- Withdrawing leaves nothing behind: an RSVP is a current intention, not
-- speech, and a tombstone would misstate who is coming.
select pg_temp.become('b2220000-2222-2222-2222-222222222222'::uuid);
delete from public.event_attendees
 where event_id = 'be000000-0000-0000-0000-000000000001'::uuid
   and user_id = 'b2220000-2222-2222-2222-222222222222'::uuid;
reset role;

insert into public._tap_out(line) select is(
  (select interested_count from public.events
    where id = 'be000000-0000-0000-0000-000000000001'::uuid),
  0, 'withdrawing a reply leaves no row and no count'
);

-- ===========================================================================
-- Editing, cancelling, removing
-- ===========================================================================

select pg_temp.become('b1110000-1111-1111-1111-111111111111'::uuid);
update public.events set title = 'Village meeting (moved indoors)'
 where id = 'be000000-0000-0000-0000-000000000001'::uuid;
reset role;

insert into public._tap_out(line) select is(
  (select title from public.events
    where id = 'be000000-0000-0000-0000-000000000001'::uuid),
  'Village meeting (moved indoors)',
  'an organiser can edit their own event'
);

insert into public._tap_out(line) select ok(
  (select edited_at is not null from public.events
    where id = 'be000000-0000-0000-0000-000000000001'::uuid),
  'and the edit is recorded'
);

-- A guest cannot touch it at all: RLS filters the row away, so this is silence
-- rather than an error, which is why the assertion counts rather than throws.
select pg_temp.become('b2220000-2222-2222-2222-222222222222'::uuid);
update public.events set title = 'Cancelled, actually'
 where id = 'be000000-0000-0000-0000-000000000001'::uuid;
reset role;

insert into public._tap_out(line) select is(
  (select title from public.events
    where id = 'be000000-0000-0000-0000-000000000001'::uuid),
  'Village meeting (moved indoors)',
  'a guest cannot rewrite somebody else''s event'
);

-- A moderator MAY reach the row -- and still may not move the event. The guard
-- trigger restores every content column for anybody who is not the organiser,
-- so moderation can remove or cancel but never relocate a funeral.
select pg_temp.become('b3330000-3333-3333-3333-333333333333'::uuid);
update public.events
   set title = 'Moderator says this is a wedding',
       starts_at = '2027-01-01 10:00:00+01',
       cancelled_at = now(),
       cancellation_reason = 'Reported by several members'
 where id = 'be000000-0000-0000-0000-000000000001'::uuid;
reset role;

insert into public._tap_out(line) select is(
  (select title from public.events
    where id = 'be000000-0000-0000-0000-000000000001'::uuid),
  'Village meeting (moved indoors)',
  'a MODERATOR cannot rewrite the event either'
);

insert into public._tap_out(line) select is(
  (select starts_at from public.events
    where id = 'be000000-0000-0000-0000-000000000001'::uuid),
  '2026-09-12 16:00:00+01'::timestamptz,
  'nor move it to another day'
);

insert into public._tap_out(line) select ok(
  (select cancelled_at is not null from public.events
    where id = 'be000000-0000-0000-0000-000000000001'::uuid),
  'but CAN cancel it, which is what moderation is for'
);

insert into public._tap_out(line) select is(
  (select cancellation_reason from public.events
    where id = 'be000000-0000-0000-0000-000000000001'::uuid),
  'Reported by several members',
  'and can say why'
);

-- Cancelled is not deleted. People arranged their day around this; the row is
-- what tells them what happened.
select pg_temp.become_anon();
insert into public._tap_out(line) select is(
  (select count(*)::int from public.events
    where id = 'be000000-0000-0000-0000-000000000001'::uuid),
  1, 'a cancelled event stays visible rather than vanishing'
);
reset role;

-- Removal is soft, and there is no DELETE policy for anyone.
select pg_temp.become('b1110000-1111-1111-1111-111111111111'::uuid);
delete from public.events where id = 'be000000-0000-0000-0000-000000000003'::uuid;
reset role;

insert into public._tap_out(line) select is(
  (select count(*)::int from public.events
    where id = 'be000000-0000-0000-0000-000000000003'::uuid),
  1, 'nobody can hard-delete an event, not even its organiser'
);

select pg_temp.become('b1110000-1111-1111-1111-111111111111'::uuid);
update public.events set deleted_at = now()
 where id = 'be000000-0000-0000-0000-000000000003'::uuid;
reset role;

select pg_temp.become_anon();
insert into public._tap_out(line) select is(
  (select count(*)::int from public.events
    where id = 'be000000-0000-0000-0000-000000000003'::uuid),
  0, 'a removed event disappears for everybody else'
);
reset role;

select pg_temp.become('b1110000-1111-1111-1111-111111111111'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.events
    where id = 'be000000-0000-0000-0000-000000000003'::uuid),
  1,
  'while its organiser still sees it, so removal is visible rather than a vanishing'
);
reset role;

-- ===========================================================================
-- can_see_event, which the attendee policies delegate to
-- ===========================================================================

select pg_temp.become('b2220000-2222-2222-2222-222222222222'::uuid);
insert into public._tap_out(line) select ok(
  public.can_see_event('be000000-0000-0000-0000-000000000001'::uuid),
  'can_see_event admits a guest to a public event'
);
insert into public._tap_out(line) select ok(
  not public.can_see_event('be000000-0000-0000-0000-000000000005'::uuid),
  'and refuses one for a private group event'
);
reset role;

insert into public._tap_out(line) select * from finish();

select coalesce(
  (select string_agg(line, chr(10) order by at)
     from public._tap_out
    where line not like 'ok %'),
  'ALL ASSERTIONS PASSED'
) as result;
rollback;
