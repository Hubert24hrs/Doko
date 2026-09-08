-- Ezike Oba :: notifications
--
-- Run either way:
--   * locally:  supabase test db
--   * hosted:   paste this whole file into the Supabase SQL Editor
--               (requires: create extension if not exists pgtap with schema extensions;)
--
-- A notification is the one thing on this platform that arrives unasked and is
-- read as coming from the platform itself. That makes the question "who can
-- put one there" the whole of its security.
--
-- Writing this suite found that ANYBODY could. Migration 022 shipped:
--
--     create policy notifications_insert_authenticated
--       on public.notifications for insert
--       to authenticated
--       with check (public.is_active_member());
--
-- with the comment "Triggers or system functions can insert". The check
-- constrains the INSERTER and says nothing whatever about `user_id`, so any
-- signed-in member could write into any other member's tray, choosing the
-- title, the body, the apparent sender and the link. Loop over the profile ids
-- and it is a broadcast channel nobody granted.
--
-- The policy was never needed either. Every notification here is written by a
-- SECURITY DEFINER trigger, which is not subject to RLS at all, and the
-- application only ever selects and marks read. Migration 033 drops the policy
-- and revokes INSERT, the way `audit_logs` and `conversations` already handled
-- rows written on somebody else's behalf.
--
-- The assertions come in pairs on purpose: for every "a member cannot", there
-- is a "but the trigger still does". A negative assertion on its own cannot
-- tell a closed hole from a broken feature -- which is precisely how migration
-- 030 broke the ad payment path and passed its suite.

begin;

set local search_path = public, extensions, pg_temp;
select plan(23);

create table public._tap_out (
  at   timestamptz not null default clock_timestamp(),
  line text
);
grant insert, select on public._tap_out to public;
alter table public._tap_out disable row level security;

-- ---------------------------------------------------------------------------
-- Fixtures: a reporter, a neighbour, and a moderator.
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values
  ('4a110000-0000-1111-1111-111111111111'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'nt-r@example.com', '{"username":"nt_reporter","full_name":"Nt Reporter"}'),
  ('4a220000-0000-2222-2222-222222222222'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'nt-n@example.com', '{"username":"nt_neighbour","full_name":"Nt Neighbour"}'),
  ('4a330000-0000-3333-3333-333333333333'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'nt-m@example.com', '{"username":"nt_mod","full_name":"Nt Mod"}');

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

-- Clears the claims as well as the role, so auth.uid() is genuinely NULL --
-- what the platform's own writes look like. `reset role` alone leaves the last
-- impersonation's claims in place and would run the guard's member branch.
create or replace function pg_temp.become_platform()
returns void language plpgsql as $bp$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $bp$;

insert into public.user_roles (user_id, role) values
  ('4a330000-0000-3333-3333-333333333333'::uuid, 'moderator')
on conflict do nothing;

insert into public.geo_entities (id, parent_id, kind, name, slug)
values ('9c000000-0000-0000-0000-0000000000c1',
        (select id from public.geo_entities where kind = 'lga' limit 1),
        'village', 'Tap Village C1', 'tap-village-c1');

select pg_temp.become('4a110000-0000-1111-1111-111111111111'::uuid);
insert into public.community_issues
  (id, reporter_id, title, description, category, geo_id)
values ('c1000000-0000-0000-0000-000000000001',
        '4a110000-0000-1111-1111-111111111111',
        'Transformer down at Umuida',
        'No light since the storm on Eke day.',
        'electricity',
        '9c000000-0000-0000-0000-0000000000c1');
reset role;

-- ===========================================================================
-- THE hole: planting a notification in somebody else's tray
-- ===========================================================================

select pg_temp.become('4a220000-0000-2222-2222-222222222222'::uuid);

insert into public._tap_out(line) select throws_ok(
  $$insert into public.notifications (user_id, actor_id, type, title, body, link)
    values ('4a110000-0000-1111-1111-111111111111',
            '4a330000-0000-3333-3333-333333333333',
            'system',
            'Your account will be suspended',
            'Confirm your details to keep your account.',
            '/settings')$$,
  '42501', null,
  'a member cannot plant a notification in somebody else''s tray'
);

-- And not in their own either. There is no member-facing INSERT policy at all
-- now, because a notification is never something you give yourself.
insert into public._tap_out(line) select throws_ok(
  $$insert into public.notifications (user_id, type, title)
    values ('4a220000-0000-2222-2222-222222222222', 'system', 'A note to self')$$,
  '42501', null,
  'nor write one into their own'
);
reset role;

-- ===========================================================================
-- ...but the triggers must still deliver. The half that was missing from
-- 18_advertising, written first this time.
-- ===========================================================================

select pg_temp.become('4a220000-0000-2222-2222-222222222222'::uuid);
insert into public.issue_confirmations (issue_id, user_id)
values ('c1000000-0000-0000-0000-000000000001',
        '4a220000-0000-2222-2222-222222222222');
reset role;
select pg_temp.become_platform();

insert into public._tap_out(line) select is(
  (select count(*)::int from public.notifications
    where user_id = '4a110000-0000-1111-1111-111111111111'::uuid),
  1, 'confirming an issue still notifies the person who reported it'
);

insert into public._tap_out(line) select is(
  (select type from public.notifications
    where user_id = '4a110000-0000-1111-1111-111111111111'::uuid),
  'issue_confirmed', 'and it is typed as a confirmation'
);

insert into public._tap_out(line) select is(
  (select actor_id from public.notifications
    where user_id = '4a110000-0000-1111-1111-111111111111'::uuid),
  '4a220000-0000-2222-2222-222222222222'::uuid,
  'naming the neighbour who confirmed it'
);

insert into public._tap_out(line) select is(
  (select link from public.notifications
    where user_id = '4a110000-0000-1111-1111-111111111111'::uuid),
  '/issues/c1000000-0000-0000-0000-000000000001',
  'and pointing at the issue, by a path inside this app'
);

-- Confirming your own report should tell you nothing you did not already know.
select pg_temp.become('4a110000-0000-1111-1111-111111111111'::uuid);
insert into public.issue_confirmations (issue_id, user_id)
values ('c1000000-0000-0000-0000-000000000001',
        '4a110000-0000-1111-1111-111111111111');
reset role;
select pg_temp.become_platform();

insert into public._tap_out(line) select is(
  (select count(*)::int from public.notifications
    where user_id = '4a110000-0000-1111-1111-111111111111'::uuid),
  1, 'confirming your own report notifies nobody'
);

-- ===========================================================================
-- Reading: your own, and nothing else -- not even for staff
-- ===========================================================================

select pg_temp.become('4a110000-0000-1111-1111-111111111111'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.notifications),
  1, 'a member reads their own notifications'
);
reset role;

select pg_temp.become('4a220000-0000-2222-2222-222222222222'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.notifications),
  0, 'and sees none of anybody else''s'
);
reset role;

-- `notifications` is the third table in this schema with no staff read policy,
-- after `messages` and `job_applications`. What lands in somebody's tray is a
-- record of who followed them, who wrote to them and what they reported; there
-- is nothing in it to moderate.
select pg_temp.become('4a330000-0000-3333-3333-333333333333'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.notifications),
  0, 'a MODERATOR reads exactly nothing -- there is no staff policy here'
);
reset role;

-- ===========================================================================
-- Status changes reach the reporter and everyone who confirmed
-- ===========================================================================

select pg_temp.become('4a330000-0000-3333-3333-333333333333'::uuid);
update public.community_issues
   set status = 'in_progress', status_note = 'A replacement is on order.'
 where id = 'c1000000-0000-0000-0000-000000000001'::uuid;
reset role;
select pg_temp.become_platform();

insert into public._tap_out(line) select is(
  (select count(*)::int from public.notifications
    where user_id = '4a110000-0000-1111-1111-111111111111'::uuid
      and type = 'issue_status'),
  1, 'moving the status tells the reporter'
);

insert into public._tap_out(line) select is(
  (select count(*)::int from public.notifications
    where user_id = '4a220000-0000-2222-2222-222222222222'::uuid
      and type = 'issue_status'),
  1, 'and everybody who said they saw it too'
);

-- The reporter confirmed their own issue earlier, so they are in
-- issue_confirmations as well. Without the `c.user_id <> new.reporter_id`
-- filter they would be told twice about the same change.
insert into public._tap_out(line) select is(
  (select count(*)::int from public.notifications
    where user_id = '4a110000-0000-1111-1111-111111111111'::uuid),
  2, 'and the reporter holds two notifications, not three -- being a confirmer of their own report does not tell them twice'
);

-- ===========================================================================
-- The guard: read_at is the only thing a member may change
-- ===========================================================================

select pg_temp.become('4a110000-0000-1111-1111-111111111111'::uuid);
update public.notifications
   set title = 'You have won a generator',
       body  = 'Click to claim it.',
       link  = '/settings',
       actor_id = '4a330000-0000-3333-3333-333333333333'
 where type = 'issue_confirmed';
reset role;
select pg_temp.become_platform();

insert into public._tap_out(line) select is(
  (select title from public.notifications where type = 'issue_confirmed'),
  'Someone confirmed your report',
  'a member cannot rewrite the title of a notification, even their own'
);

insert into public._tap_out(line) select is(
  (select link from public.notifications where type = 'issue_confirmed'),
  '/issues/c1000000-0000-0000-0000-000000000001',
  'nor repoint its link'
);

insert into public._tap_out(line) select is(
  (select actor_id from public.notifications where type = 'issue_confirmed'),
  '4a220000-0000-2222-2222-222222222222'::uuid,
  'nor change who it appears to have come from'
);

-- Nor hand it to somebody else, which would put a row in a tray whose owner
-- never received anything.
select pg_temp.become('4a110000-0000-1111-1111-111111111111'::uuid);
update public.notifications
   set user_id = '4a220000-0000-2222-2222-222222222222'
 where type = 'issue_confirmed';
reset role;
select pg_temp.become_platform();

insert into public._tap_out(line) select is(
  (select user_id from public.notifications where type = 'issue_confirmed'),
  '4a110000-0000-1111-1111-111111111111'::uuid,
  'nor move it into somebody else''s tray'
);

-- The one update the feature actually needs.
select pg_temp.become('4a110000-0000-1111-1111-111111111111'::uuid);
update public.notifications set read_at = now() where type = 'issue_confirmed';
reset role;
select pg_temp.become_platform();

insert into public._tap_out(line) select isnt(
  (select read_at from public.notifications where type = 'issue_confirmed'),
  null, 'but marking it read is exactly what they may do'
);

-- ===========================================================================
-- Removal
-- ===========================================================================

select pg_temp.become('4a220000-0000-2222-2222-222222222222'::uuid);
delete from public.notifications
 where user_id = '4a110000-0000-1111-1111-111111111111'::uuid;
reset role;
select pg_temp.become_platform();

insert into public._tap_out(line) select is(
  (select count(*)::int from public.notifications
    where user_id = '4a110000-0000-1111-1111-111111111111'::uuid),
  2, 'a member cannot clear somebody else''s notifications'
);

select pg_temp.become('4a110000-0000-1111-1111-111111111111'::uuid);
delete from public.notifications where type = 'issue_confirmed';
reset role;
select pg_temp.become_platform();

insert into public._tap_out(line) select is(
  (select count(*)::int from public.notifications
    where user_id = '4a110000-0000-1111-1111-111111111111'::uuid),
  1, 'but can dismiss their own'
);

-- ===========================================================================
-- A link is a place in this app, not a place on the internet
--
-- These run as the platform, because a member cannot reach `link` at all now
-- -- the guard restores it before any CHECK is consulted. The constraint is
-- here so that a future trigger, or a hand-run UPDATE in the SQL editor,
-- cannot store something the notification list would render as a trusted link.
-- ===========================================================================

insert into public._tap_out(line) select throws_ok(
  $$update public.notifications set link = 'https://not-ezike-oba.example/login'
     where type = 'issue_status'$$,
  '23514', null,
  'an absolute URL cannot be stored in a notification link at all'
);

insert into public._tap_out(line) select throws_ok(
  $$update public.notifications set link = '//not-ezike-oba.example/login'
     where type = 'issue_status'$$,
  '23514', null,
  'and neither can a protocol-relative one, which a browser treats the same'
);

insert into public._tap_out(line) select throws_ok(
  $$insert into public.notifications (user_id, type, title)
    values ('4a110000-0000-1111-1111-111111111111', 'invented_type', 'Hello')$$,
  '23514', null,
  'a notification type outside the known list is refused'
);

insert into public._tap_out(line) select * from finish();

select coalesce(
  (select string_agg(line, chr(10) order by at)
     from public._tap_out
    where line not like 'ok %'),
  'ALL ASSERTIONS PASSED'
) as result;
rollback;
