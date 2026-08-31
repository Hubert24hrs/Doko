-- Ezike Oba :: Row Level Security behaviour tests
--
-- Run either way:
--   * locally:  supabase test db
--   * hosted:   paste this whole file into the Supabase SQL Editor
--               (requires: create extension if not exists pgtap with schema extensions;)
--
-- Written in portable SQL only -- no psql meta-commands -- so the same file
-- works in both. The whole run is wrapped in begin/rollback, so it leaves
-- nothing behind even against a live database.
--
-- These are the tests that decide whether the authorization model actually
-- holds. Each one impersonates a real role via `set local role` plus a forged
-- JWT claim, exactly as PostgREST does, and asserts what that identity can
-- and cannot see or change.

begin;
select plan(24);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

-- Deterministic ids, written literally. The Supabase SQL Editor is not
-- psql, so backslash-set and :'var' meta-syntax cannot be used there.

-- auth.users rows. The handle_new_user trigger creates matching profiles and
-- a 'citizen' role for each.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values
  ('11111111-1111-1111-1111-111111111111'::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'a@example.com', '{"username":"citizen_a","full_name":"Citizen A"}'),
  ('22222222-2222-2222-2222-222222222222'::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'b@example.com', '{"username":"citizen_b","full_name":"Citizen B"}'),
  ('33333333-3333-3333-3333-333333333333'::uuid,  '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'c@example.com', '{"username":"outsider","full_name":"Outsider"}'),
  ('44444444-4444-4444-4444-444444444444'::uuid,  '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'admin@example.com', '{"username":"the_admin","full_name":"The Admin"}'),
  ('55555555-5555-5555-5555-555555555555'::uuid,  '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'super@example.com', '{"username":"the_super","full_name":"The Super"}');

-- The trigger should have created five profiles.
select is(
  (select count(*)::int from public.profiles),
  5,
  'handle_new_user created a profile for every new auth user'
);

select is(
  (select username::text from public.profiles where id = '11111111-1111-1111-1111-111111111111'::uuid),
  'citizen_a',
  'the signup trigger honours the requested username'
);

select is(
  (select count(*)::int from public.user_roles
    where user_id = '11111111-1111-1111-1111-111111111111'::uuid and role = 'citizen'),
  1,
  'every new member starts as a citizen'
);

-- Grant elevated roles.
insert into public.user_roles (user_id, role) values
  ('44444444-4444-4444-4444-444444444444'::uuid, 'admin'),
  ('55555555-5555-5555-5555-555555555555'::uuid, 'super_admin');

-- Geography, and shared community membership for A and B.
insert into public.geo_entities (id, parent_id, kind, name, slug)
values ('aaaaaaaa-0000-0000-0000-000000000001', null, 'lga', 'Test LGA', 'test-lga');
insert into public.geo_entities (id, parent_id, kind, name, slug)
values ('aaaaaaaa-0000-0000-0000-000000000002',
        'aaaaaaaa-0000-0000-0000-000000000001', 'town', 'Test Town', 'test-town');

update public.profiles
   set town_id = 'aaaaaaaa-0000-0000-0000-000000000002'
 where id in ('11111111-1111-1111-1111-111111111111'::uuid, '22222222-2222-2222-2222-222222222222'::uuid);

-- Visibility fixtures.
update public.profiles set visibility = 'public'    where id = '11111111-1111-1111-1111-111111111111'::uuid;
update public.profiles set visibility = 'community' where id = '22222222-2222-2222-2222-222222222222'::uuid;
update public.profiles set visibility = 'private'   where id = '33333333-3333-3333-3333-333333333333'::uuid;

-- Seed one audit row through the only supported path.
set local role authenticated;
set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select public.log_admin_action('test.action', 'geo_entities', 'aaaaaaaa-0000-0000-0000-000000000002');
reset role;

-- ---------------------------------------------------------------------------
-- Helper to impersonate a member
-- ---------------------------------------------------------------------------

create or replace function pg_temp.become(user_id uuid)
returns void language plpgsql as $$
begin
  execute 'set local role authenticated';
  execute format(
    'set local request.jwt.claims to %L',
    json_build_object('sub', user_id::text, 'role', 'authenticated')::text
  );
end $$;

create or replace function pg_temp.become_anon()
returns void language plpgsql as $$
begin
  execute 'set local role anon';
  execute 'set local request.jwt.claims to ''{"role":"anon"}''';
end $$;

-- ===========================================================================
-- audit_logs
-- ===========================================================================

select pg_temp.become('11111111-1111-1111-1111-111111111111'::uuid);
select is(
  (select count(*)::int from public.audit_logs),
  0,
  'a citizen cannot read audit_logs'
);
reset role;

select pg_temp.become('44444444-4444-4444-4444-444444444444'::uuid);
select ok(
  (select count(*) from public.audit_logs) > 0,
  'an admin can read audit_logs'
);
reset role;

-- Nobody may rewrite history -- not even a super_admin.
select pg_temp.become('55555555-5555-5555-5555-555555555555'::uuid);
select is(
  (with attempted as (
     update public.audit_logs set action = 'tampered' returning 1
   ) select count(*)::int from attempted),
  0,
  'not even a super_admin can UPDATE an audit row'
);
select is(
  (with attempted as (
     delete from public.audit_logs returning 1
   ) select count(*)::int from attempted),
  0,
  'not even a super_admin can DELETE an audit row'
);
reset role;

-- ===========================================================================
-- user_roles -- the privilege escalation boundary
-- ===========================================================================

select pg_temp.become('11111111-1111-1111-1111-111111111111'::uuid);
select throws_ok(
  $$insert into public.user_roles (user_id, role)
    values ('11111111-1111-1111-1111-111111111111', 'admin')$$,
  '42501',
  null,
  'a citizen cannot grant themselves admin'
);
select throws_ok(
  $$insert into public.user_roles (user_id, role)
    values ('11111111-1111-1111-1111-111111111111', 'moderator')$$,
  '42501',
  null,
  'a citizen cannot grant themselves moderator'
);
select is(
  (select count(*)::int from public.user_roles where user_id = '22222222-2222-2222-2222-222222222222'::uuid),
  0,
  'a citizen cannot read another member''s roles'
);
reset role;

-- An admin may appoint a moderator but NOT another admin.
select pg_temp.become('44444444-4444-4444-4444-444444444444'::uuid);
select lives_ok(
  $$insert into public.user_roles (user_id, role)
    values ('22222222-2222-2222-2222-222222222222', 'moderator')$$,
  'an admin can appoint a moderator'
);
select throws_ok(
  $$insert into public.user_roles (user_id, role)
    values ('22222222-2222-2222-2222-222222222222', 'admin')$$,
  '42501',
  null,
  'an admin CANNOT mint another admin'
);
reset role;

select pg_temp.become('55555555-5555-5555-5555-555555555555'::uuid);
select lives_ok(
  $$insert into public.user_roles (user_id, role)
    values ('33333333-3333-3333-3333-333333333333', 'admin')$$,
  'a super_admin can mint an admin'
);
reset role;

-- ===========================================================================
-- profiles -- visibility and self-escalation
-- ===========================================================================

-- A citizen cannot verify or unsuspend themselves; the guard trigger silently
-- restores the previous values rather than erroring.
select pg_temp.become('11111111-1111-1111-1111-111111111111'::uuid);
update public.profiles set is_verified = true, verified_at = now()
 where id = '11111111-1111-1111-1111-111111111111'::uuid;
reset role;

select is(
  (select is_verified from public.profiles where id = '11111111-1111-1111-1111-111111111111'::uuid),
  false,
  'a member cannot grant themselves a verified badge'
);

select pg_temp.become('11111111-1111-1111-1111-111111111111'::uuid);
update public.profiles set is_suspended = false where id = '11111111-1111-1111-1111-111111111111'::uuid;
update public.profiles set bio = 'I am from Enugu-Ezike' where id = '11111111-1111-1111-1111-111111111111'::uuid;
reset role;

select is(
  (select bio from public.profiles where id = '11111111-1111-1111-1111-111111111111'::uuid),
  'I am from Enugu-Ezike',
  'a member CAN still edit their own ordinary fields'
);

-- Visibility: outsider shares no community with B.
select pg_temp.become('33333333-3333-3333-3333-333333333333'::uuid);
select is(
  (select count(*)::int from public.profiles where id = '22222222-2222-2222-2222-222222222222'::uuid),
  0,
  'a community-only profile is hidden from someone outside the community'
);
select is(
  (select count(*)::int from public.profiles where id = '11111111-1111-1111-1111-111111111111'::uuid),
  1,
  'a public profile is visible to any signed-in member'
);
select is(
  (select count(*)::int from public.profiles where id = '33333333-3333-3333-3333-333333333333'::uuid),
  1,
  'a member can always see their own profile, even when private'
);
reset role;

-- A shares a town with B, so the community-only profile resolves.
select pg_temp.become('11111111-1111-1111-1111-111111111111'::uuid);
select is(
  (select count(*)::int from public.profiles where id = '22222222-2222-2222-2222-222222222222'::uuid),
  1,
  'a community-only profile IS visible within the same community'
);
reset role;

-- Anonymous visitors see only public, non-suspended profiles.
select pg_temp.become_anon();
select is(
  (select count(*)::int from public.profiles),
  1,
  'an anonymous visitor sees only the public profile'
);
reset role;

-- ===========================================================================
-- Rate limiting
-- ===========================================================================

-- Limit of 2 in one window: calls 1 and 2 pass, call 3 is refused.
select is(
  (select allowed from public.consume_rate_limit('test:bucket', 2, 60000)),
  true,
  'request 1 of 2 is allowed'
);
select is(
  (select allowed from public.consume_rate_limit('test:bucket', 2, 60000)),
  true,
  'request 2 of 2 is allowed'
);
select is(
  (select allowed from public.consume_rate_limit('test:bucket', 2, 60000)),
  false,
  'request 3 exceeds the limit and is refused'
);

-- A different bucket key is counted independently.
select is(
  (select allowed from public.consume_rate_limit('other:bucket', 2, 60000)),
  true,
  'a separate bucket has its own counter'
);

select * from finish();
rollback;
