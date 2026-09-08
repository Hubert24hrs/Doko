-- Ezike Oba :: community pulse
--
-- Run either way:
--   * locally:  supabase test db
--   * hosted:   paste this whole file into the Supabase SQL Editor
--               (requires: create extension if not exists pgtap with schema extensions;)
--
-- The pulse is a sphere of faces on /feed: verified members who did something
-- in the last 24 hours. It is drawn by ONE function, get_community_pulse(),
-- and that function is SECURITY DEFINER -- so every table it touches is read
-- with row level security switched off.
--
-- That is the whole of this suite. A definer function is a hole in RLS that
-- somebody has promised to fill by hand, and migration 024 did not fill it:
--
--   * it returned username, full_name and avatar_path for any verified member,
--     ignoring profiles.visibility entirely -- so a member who set their
--     profile to 'private' was still drawn on the feed, by name, for everyone;
--   * it chose latest_post_id from `posts` with NO visibility predicate, so
--     the id it handed out could belong to a followers-only post or to one
--     inside a PRIVATE GROUP. The post page still refuses to render it, but
--     this schema is deliberate that an invisible post 404s rather than 403s
--     precisely so its existence is not confirmed -- and an id confirms it;
--   * it counted activity inside private groups, so the sphere reported that
--     somebody had been busy somewhere nobody was entitled to know about;
--   * and, like the payment RPCs before migration 028, its EXECUTE was left at
--     the PostgreSQL default of PUBLIC, so a signed-out caller could ask.
--
-- Migration 034 writes the visibility rules the function was bypassing into
-- the function itself. The assertions below are those rules.

begin;

set local search_path = public, extensions, pg_temp;
select plan(14);

create table public._tap_out (
  at   timestamptz not null default clock_timestamp(),
  line text
);
grant insert, select on public._tap_out to public;
alter table public._tap_out disable row level security;

-- ---------------------------------------------------------------------------
-- Fixtures: one of each kind of member the function has to decide about, plus
-- two viewers who differ only in which village they are in.
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values
  ('d0110000-0000-1111-1111-111111111111'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'pu-admin@example.com', '{"username":"pu_admin","full_name":"Pu Admin"}'),
  ('d0220000-0000-2222-2222-222222222222'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'pu-pub@example.com', '{"username":"pu_public","full_name":"Pu Public"}'),
  ('d0330000-0000-3333-3333-333333333333'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'pu-comm@example.com', '{"username":"pu_community","full_name":"Pu Community"}'),
  ('d0440000-0000-4444-4444-444444444444'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'pu-priv@example.com', '{"username":"pu_private","full_name":"Pu Private"}'),
  ('d0550000-0000-5555-5555-555555555555'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'pu-unver@example.com', '{"username":"pu_unverified","full_name":"Pu Unverified"}'),
  ('d0660000-0000-6666-6666-666666666666'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'pu-susp@example.com', '{"username":"pu_suspended","full_name":"Pu Suspended"}'),
  ('d0770000-0000-7777-7777-777777777777'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'pu-grp@example.com', '{"username":"pu_grouponly","full_name":"Pu Grouponly"}'),
  ('d0880000-0000-8888-8888-888888888888'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'pu-stale@example.com', '{"username":"pu_stale","full_name":"Pu Stale"}'),
  ('d0990000-0000-9999-9999-999999999999'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'pu-vin@example.com', '{"username":"pu_viewer_in","full_name":"Pu ViewerIn"}'),
  ('d0aa0000-0000-aaaa-aaaa-aaaaaaaaaaaa'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'pu-vout@example.com', '{"username":"pu_viewer_out","full_name":"Pu ViewerOut"}');

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

-- Clears the claims as well as the role. get_community_pulse() reads
-- auth.uid() through shares_community_with(), so a fixture that only reset the
-- role would keep answering as whoever was last impersonated.
create or replace function pg_temp.become_platform()
returns void language plpgsql as $bp$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $bp$;

insert into public.user_roles (user_id, role) values
  ('d0110000-0000-1111-1111-111111111111'::uuid, 'admin')
on conflict do nothing;

-- Two villages. shares_community_with() compares village, community and town
-- ids, so equal village ids puts two people in one community and unequal ones
-- keeps them apart.
insert into public.geo_entities (id, parent_id, kind, name, slug)
values
  ('9d000000-0000-0000-0000-0000000000d1',
   (select id from public.geo_entities where kind = 'lga' limit 1),
   'village', 'Tap Village D1', 'tap-village-d1'),
  ('9d000000-0000-0000-0000-0000000000d2',
   (select id from public.geo_entities where kind = 'lga' limit 1),
   'village', 'Tap Village D2', 'tap-village-d2');

-- visibility and village_id are ordinary profile columns, so the platform can
-- set them directly. is_verified and is_suspended are NOT:
-- profiles_guard_privileged restores those for anybody who is not an admin,
-- and auth.uid() is NULL here.
update public.profiles set visibility = 'public',
                           village_id = '9d000000-0000-0000-0000-0000000000d1'
 where id in ('d0220000-0000-2222-2222-222222222222'::uuid,
              'd0550000-0000-5555-5555-555555555555'::uuid,
              'd0660000-0000-6666-6666-666666666666'::uuid,
              'd0770000-0000-7777-7777-777777777777'::uuid,
              'd0880000-0000-8888-8888-888888888888'::uuid,
              'd0990000-0000-9999-9999-999999999999'::uuid);

update public.profiles set visibility = 'community',
                           village_id = '9d000000-0000-0000-0000-0000000000d1'
 where id = 'd0330000-0000-3333-3333-333333333333'::uuid;

update public.profiles set visibility = 'private',
                           village_id = '9d000000-0000-0000-0000-0000000000d1'
 where id = 'd0440000-0000-4444-4444-444444444444'::uuid;

-- The outside viewer is in the other village and shares nothing else.
update public.profiles set visibility = 'public',
                           village_id = '9d000000-0000-0000-0000-0000000000d2'
 where id = 'd0aa0000-0000-aaaa-aaaa-aaaaaaaaaaaa'::uuid;

-- Badges, granted by somebody entitled to grant them.
select pg_temp.become('d0110000-0000-1111-1111-111111111111'::uuid);
update public.profiles
   set is_verified = true, verified_at = now(), verification_type = 'blue'
 where id in ('d0220000-0000-2222-2222-222222222222'::uuid,
              'd0330000-0000-3333-3333-333333333333'::uuid,
              'd0440000-0000-4444-4444-444444444444'::uuid,
              'd0660000-0000-6666-6666-666666666666'::uuid,
              'd0770000-0000-7777-7777-777777777777'::uuid,
              'd0880000-0000-8888-8888-888888888888'::uuid);
update public.profiles set is_suspended = true
 where id = 'd0660000-0000-6666-6666-666666666666'::uuid;
reset role;
select pg_temp.become_platform();

-- A private group. Rows are inserted as the platform on purpose: RLS is not
-- what is being tested here. The question is what the DEFINER FUNCTION does
-- with rows RLS would have hidden from the caller.
insert into public.groups (id, name, slug, visibility, created_by)
values ('9e000000-0000-0000-0000-0000000000e1',
        'Tap Private Group', 'tap-private-group', 'private',
        'd0220000-0000-2222-2222-222222222222');

insert into public.group_members (group_id, user_id, role)
values ('9e000000-0000-0000-0000-0000000000e1',
        'd0770000-0000-7777-7777-777777777777', 'member')
on conflict do nothing;

-- pu_public has three posts. The two NEWER ones are the ones a reader outside
-- the group has no business being told about -- which is exactly why the old
-- function, ordering by created_at with no predicate, would have picked one.
insert into public.posts (id, author_id, body, visibility, group_id, created_at)
values
  ('aa000000-0000-0000-0000-000000000001',
   'd0220000-0000-2222-2222-222222222222',
   'The Nkwo market repairs start on Monday.', 'public', null,
   now() - interval '3 hours'),
  ('aa000000-0000-0000-0000-000000000002',
   'd0220000-0000-2222-2222-222222222222',
   'For the people who follow me only.', 'followers', null,
   now() - interval '2 hours'),
  ('aa000000-0000-0000-0000-000000000003',
   'd0220000-0000-2222-2222-222222222222',
   'Said inside a private group.', 'public',
   '9e000000-0000-0000-0000-0000000000e1',
   now() - interval '1 hour'),

  ('aa000000-0000-0000-0000-000000000004',
   'd0330000-0000-3333-3333-333333333333',
   'A community-visible member posting publicly.', 'public', null,
   now() - interval '3 hours'),
  ('aa000000-0000-0000-0000-000000000005',
   'd0440000-0000-4444-4444-444444444444',
   'A private-profile member posting publicly.', 'public', null,
   now() - interval '3 hours'),
  ('aa000000-0000-0000-0000-000000000006',
   'd0550000-0000-5555-5555-555555555555',
   'An unverified member posting publicly.', 'public', null,
   now() - interval '3 hours'),
  ('aa000000-0000-0000-0000-000000000007',
   'd0660000-0000-6666-6666-666666666666',
   'A suspended member posting publicly.', 'public', null,
   now() - interval '3 hours'),

  -- Their ONLY activity, and it is inside the private group.
  ('aa000000-0000-0000-0000-000000000008',
   'd0770000-0000-7777-7777-777777777777',
   'Only ever spoke inside the private group.', 'public',
   '9e000000-0000-0000-0000-0000000000e1',
   now() - interval '1 hour'),

  -- Three days ago: real, public, and not news.
  ('aa000000-0000-0000-0000-000000000009',
   'd0880000-0000-8888-8888-888888888888',
   'Posted three days ago.', 'public', null,
   now() - interval '3 days');

-- ===========================================================================
-- Who is drawn on the sphere, seen from OUTSIDE the community
-- ===========================================================================

select pg_temp.become('d0aa0000-0000-aaaa-aaaa-aaaaaaaaaaaa'::uuid);

insert into public._tap_out(line) select is(
  (select count(*)::int from public.get_community_pulse(60)
    where user_id = 'd0220000-0000-2222-2222-222222222222'::uuid),
  1, 'a verified, publicly visible, recently active member is on the sphere'
);

insert into public._tap_out(line) select is(
  (select count(*)::int from public.get_community_pulse(60)
    where user_id = 'd0550000-0000-5555-5555-555555555555'::uuid),
  0, 'an unverified member is not -- the pulse is verified members only'
);

insert into public._tap_out(line) select is(
  (select count(*)::int from public.get_community_pulse(60)
    where user_id = 'd0660000-0000-6666-6666-666666666666'::uuid),
  0, 'nor a suspended one'
);

-- The defect. A member who set their profile to 'private' was still drawn
-- here, by name and photograph, for anybody who loaded the feed. Everywhere
-- else in this schema a profile that is not visible 404s.
insert into public._tap_out(line) select is(
  (select count(*)::int from public.get_community_pulse(60)
    where user_id = 'd0440000-0000-4444-4444-444444444444'::uuid),
  0, 'a PRIVATE profile is not published by the pulse'
);

insert into public._tap_out(line) select is(
  (select count(*)::int from public.get_community_pulse(60)
    where user_id = 'd0330000-0000-3333-3333-333333333333'::uuid),
  0, 'and a community-only profile is invisible outside its community'
);

-- Their only activity in the window happened inside a private group. Being
-- listed as "active" is itself a disclosure: it says something happened
-- somewhere the reader cannot see.
insert into public._tap_out(line) select is(
  (select count(*)::int from public.get_community_pulse(60)
    where user_id = 'd0770000-0000-7777-7777-777777777777'::uuid),
  0, 'activity inside a private group does not put somebody on the sphere'
);

insert into public._tap_out(line) select is(
  (select count(*)::int from public.get_community_pulse(60)
    where user_id = 'd0880000-0000-8888-8888-888888888888'::uuid),
  0, 'and a post from three days ago is not activity in the last 24 hours'
);

-- ===========================================================================
-- The post the sphere links to
-- ===========================================================================

-- pu_public's newest post is in a private group and the one before it is
-- followers-only. The pulse may name neither.
insert into public._tap_out(line) select is(
  (select latest_post_id from public.get_community_pulse(60)
    where user_id = 'd0220000-0000-2222-2222-222222222222'::uuid),
  'aa000000-0000-0000-0000-000000000001'::uuid,
  'the sphere links to the latest post the reader may actually open'
);

insert into public._tap_out(line) select isnt(
  (select latest_post_id from public.get_community_pulse(60)
    where user_id = 'd0220000-0000-2222-2222-222222222222'::uuid),
  'aa000000-0000-0000-0000-000000000003'::uuid,
  'never the id of a post inside a private group, which would confirm it exists'
);

insert into public._tap_out(line) select isnt(
  (select latest_post_id from public.get_community_pulse(60)
    where user_id = 'd0220000-0000-2222-2222-222222222222'::uuid),
  'aa000000-0000-0000-0000-000000000002'::uuid,
  'and never a followers-only one'
);

-- The limit is the caller's, and it is honoured. A sphere is a fixed number of
-- faces; an unbounded one is a different screen.
insert into public._tap_out(line) select ok(
  (select count(*)::int from public.get_community_pulse(1)) <= 1,
  'p_limit is honoured rather than decorative'
);
reset role;

-- ===========================================================================
-- Seen from INSIDE the community
-- ===========================================================================

select pg_temp.become('d0990000-0000-9999-9999-999999999999'::uuid);

insert into public._tap_out(line) select is(
  (select count(*)::int from public.get_community_pulse(60)
    where user_id = 'd0330000-0000-3333-3333-333333333333'::uuid),
  1, 'the same community-only profile IS on the sphere for a neighbour'
);
reset role;

-- A member always sees themselves, exactly as profiles_select_own allows.
-- Without this the pulse would tell a private member they had vanished.
select pg_temp.become('d0440000-0000-4444-4444-444444444444'::uuid);

insert into public._tap_out(line) select is(
  (select count(*)::int from public.get_community_pulse(60)
    where user_id = 'd0440000-0000-4444-4444-444444444444'::uuid),
  1, 'and a private member still sees their own face on it'
);
reset role;

-- ===========================================================================
-- Who may ask at all
--
-- Left at the PostgreSQL default, EXECUTE on a new function belongs to PUBLIC
-- -- the same default that made confirm_ad_payment() callable by anybody until
-- migration 028. The pulse renders on /feed, which is authenticated.
-- ===========================================================================

select pg_temp.become_anon();
insert into public._tap_out(line) select throws_ok(
  $$select * from public.get_community_pulse(60)$$,
  '42501', null,
  'a signed-out caller cannot run the pulse query at all'
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
