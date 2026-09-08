-- Ezike Oba :: verification tiers and delegation
--
-- Run either way:
--   * locally:  supabase test db
--   * hosted:   paste this whole file into the Supabase SQL Editor
--               (requires: create extension if not exists pgtap with schema extensions;)
--
-- Verification is a claim the platform makes ABOUT a member to everybody else,
-- so the two things worth proving are who can make it and how far that power
-- reaches.
--
-- Writing this found that delegation did not work at all. Migration 023 built
-- three parts -- the delegates table, can_verify_members(), and a branch in
-- the profiles guard trigger honouring it -- but never added an UPDATE policy
-- letting a non-admin verifier reach somebody else's profile row. RLS filtered
-- the row out before the trigger ran, so the trigger's whole verifier branch
-- was unreachable by the people it was written for, and because RLS refuses by
-- FILTERING rather than raising, the admin action reported success while
-- nothing changed. Migration 029 adds the way in; these assertions hold both
-- halves in place:
--
--   * a delegate CAN grant a badge, and
--   * a delegate still CANNOT suspend or delete the member they verified.
--
-- The second matters more. The policy admits verifiers to the row; only the
-- guard trigger stops them doing anything else once there.

begin;

set local search_path = public, extensions, pg_temp;
select plan(25);

create table public._tap_out (
  at   timestamptz not null default clock_timestamp(),
  line text
);
grant insert, select on public._tap_out to public;
alter table public._tap_out disable row level security;

-- ---------------------------------------------------------------------------
-- Fixtures: an admin, a delegate, a plain member, and a subject to verify.
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values
  ('a1110000-0000-1111-1111-111111111111'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'vf-admin@example.com', '{"username":"vf_admin","full_name":"Vf Admin"}'),
  ('a2220000-0000-2222-2222-222222222222'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'vf-del@example.com', '{"username":"vf_delegate","full_name":"Vf Delegate"}'),
  ('a3330000-0000-3333-3333-333333333333'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'vf-mem@example.com', '{"username":"vf_member","full_name":"Vf Member"}'),
  ('a4440000-0000-4444-4444-444444444444'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'vf-sub@example.com', '{"username":"vf_subject","full_name":"Vf Subject"}');

create or replace function pg_temp.become(user_id uuid)
returns void language plpgsql as $$
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims to %L',
    json_build_object('sub', user_id::text, 'role', 'authenticated')::text);
end $$;

insert into public.user_roles (user_id, role) values
  ('a1110000-0000-1111-1111-111111111111'::uuid, 'admin')
on conflict do nothing;

-- The delegate holds NO role at all. That is the point: their authority comes
-- from the delegates table and nowhere else.
insert into public.verification_delegates (user_id, delegated_by) values
  ('a2220000-0000-2222-2222-222222222222'::uuid,
   'a1110000-0000-1111-1111-111111111111'::uuid)
on conflict do nothing;

-- ===========================================================================
-- can_verify_members
-- ===========================================================================

insert into public._tap_out(line) select ok(
  public.can_verify_members('a1110000-0000-1111-1111-111111111111'::uuid),
  'an admin can verify members'
);

insert into public._tap_out(line) select ok(
  public.can_verify_members('a2220000-0000-2222-2222-222222222222'::uuid),
  'and so can a delegate, holding no role at all'
);

insert into public._tap_out(line) select ok(
  not public.can_verify_members('a3330000-0000-3333-3333-333333333333'::uuid),
  'an ordinary member cannot'
);

-- ===========================================================================
-- Nobody verifies themselves
-- ===========================================================================

select pg_temp.become('a3330000-0000-3333-3333-333333333333'::uuid);
update public.profiles
   set is_verified = true, verified_at = now(), verification_type = 'gold'
 where id = 'a3330000-0000-3333-3333-333333333333'::uuid;
reset role;

-- The guard trigger restores the columns rather than raising, so this is
-- silence rather than an error -- which is why the row is read back.
insert into public._tap_out(line) select is(
  (select is_verified from public.profiles
    where id = 'a3330000-0000-3333-3333-333333333333'::uuid),
  false, 'a member cannot grant themselves a badge'
);

insert into public._tap_out(line) select ok(
  (select verification_type is null from public.profiles
    where id = 'a3330000-0000-3333-3333-333333333333'::uuid),
  'nor choose their own tier'
);

-- Nor verify anybody else: RLS admits neither, so this is filtered entirely.
select pg_temp.become('a3330000-0000-3333-3333-333333333333'::uuid);
update public.profiles
   set is_verified = true, verified_at = now(), verification_type = 'blue'
 where id = 'a4440000-0000-4444-4444-444444444444'::uuid;
reset role;

insert into public._tap_out(line) select is(
  (select is_verified from public.profiles
    where id = 'a4440000-0000-4444-4444-444444444444'::uuid),
  false, 'and cannot verify somebody else'
);

-- ===========================================================================
-- THE assertion migration 029 exists for
-- ===========================================================================

select pg_temp.become('a2220000-0000-2222-2222-222222222222'::uuid);
update public.profiles
   set is_verified = true, verified_at = now(), verification_type = 'gold'
 where id = 'a4440000-0000-4444-4444-444444444444'::uuid;
reset role;

insert into public._tap_out(line) select is(
  (select is_verified from public.profiles
    where id = 'a4440000-0000-4444-4444-444444444444'::uuid),
  true,
  'a DELEGATE can actually grant a badge -- the policy migration 029 added'
);

insert into public._tap_out(line) select is(
  (select verification_type from public.profiles
    where id = 'a4440000-0000-4444-4444-444444444444'::uuid),
  'gold', 'including the golden tier'
);

insert into public._tap_out(line) select ok(
  (select verified_at is not null from public.profiles
    where id = 'a4440000-0000-4444-4444-444444444444'::uuid),
  'and the badge carries the moment it was granted'
);

-- ===========================================================================
-- ...and no further. The policy lets a verifier reach the row; only the guard
-- trigger stops them doing anything else once they are there.
-- ===========================================================================

select pg_temp.become('a2220000-0000-2222-2222-222222222222'::uuid);
update public.profiles
   set is_suspended = true, suspended_until = now() + interval '30 days'
 where id = 'a4440000-0000-4444-4444-444444444444'::uuid;
reset role;

insert into public._tap_out(line) select is(
  (select is_suspended from public.profiles
    where id = 'a4440000-0000-4444-4444-444444444444'::uuid),
  false,
  'a delegate CANNOT suspend the member they just verified'
);

insert into public._tap_out(line) select ok(
  (select suspended_until is null from public.profiles
    where id = 'a4440000-0000-4444-4444-444444444444'::uuid),
  'nor set a suspension date'
);

select pg_temp.become('a2220000-0000-2222-2222-222222222222'::uuid);
update public.profiles set deleted_at = now()
 where id = 'a4440000-0000-4444-4444-444444444444'::uuid;
reset role;

insert into public._tap_out(line) select ok(
  (select deleted_at is null from public.profiles
    where id = 'a4440000-0000-4444-4444-444444444444'::uuid),
  'nor delete their account'
);

-- An admin may do all of it, which is the difference between the two branches
-- of the guard.
select pg_temp.become('a1110000-0000-1111-1111-111111111111'::uuid);
update public.profiles set is_suspended = true
 where id = 'a4440000-0000-4444-4444-444444444444'::uuid;
reset role;

insert into public._tap_out(line) select is(
  (select is_suspended from public.profiles
    where id = 'a4440000-0000-4444-4444-444444444444'::uuid),
  true, 'while an ADMIN can suspend'
);

-- Put it back, so the constraint assertions below are not testing a suspended
-- row by accident.
select pg_temp.become('a1110000-0000-1111-1111-111111111111'::uuid);
update public.profiles set is_suspended = false
 where id = 'a4440000-0000-4444-4444-444444444444'::uuid;
reset role;

-- ===========================================================================
-- A badge cannot be half-granted
-- ===========================================================================

-- profiles_verified_check requires all three columns to agree. Verified with
-- no timestamp, or a tier with no badge, is a state the UI would render
-- wrongly, so the database refuses to hold it at all.
insert into public._tap_out(line) select throws_ok(
  $$update public.profiles
       set is_verified = true, verified_at = null, verification_type = 'blue'
     where id = 'a3330000-0000-3333-3333-333333333333'$$,
  '23514', null,
  'a badge with no timestamp cannot be stored'
);

insert into public._tap_out(line) select throws_ok(
  $$update public.profiles
       set is_verified = false, verified_at = null, verification_type = 'gold'
     where id = 'a3330000-0000-3333-3333-333333333333'$$,
  '23514', null,
  'nor a tier on an unverified member'
);

insert into public._tap_out(line) select throws_ok(
  $$update public.profiles
       set is_verified = true, verified_at = now(), verification_type = 'platinum'
     where id = 'a3330000-0000-3333-3333-333333333333'$$,
  '23514', null,
  'and there are exactly two tiers, not three'
);

-- ===========================================================================
-- Delegation itself is admin-only
-- ===========================================================================

select pg_temp.become('a2220000-0000-2222-2222-222222222222'::uuid);
insert into public._tap_out(line) select throws_ok(
  $$insert into public.verification_delegates (user_id)
    values ('a3330000-0000-3333-3333-333333333333')$$,
  '42501', null,
  'a delegate cannot appoint further delegates'
);
reset role;

select pg_temp.become('a3330000-0000-3333-3333-333333333333'::uuid);
insert into public._tap_out(line) select throws_ok(
  $$insert into public.verification_delegates (user_id)
    values ('a3330000-0000-3333-3333-333333333333')$$,
  '42501', null,
  'and a member certainly cannot appoint themselves'
);

-- A delegate may see their own row; a member sees nothing.
insert into public._tap_out(line) select is(
  (select count(*)::int from public.verification_delegates),
  0, 'a member cannot even see who the delegates are'
);
reset role;

select pg_temp.become('a2220000-0000-2222-2222-222222222222'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.verification_delegates
    where user_id = 'a2220000-0000-2222-2222-222222222222'::uuid),
  1, 'while a delegate can see their own appointment'
);
reset role;

-- ===========================================================================
-- Requests
-- ===========================================================================

select pg_temp.become('a3330000-0000-3333-3333-333333333333'::uuid);
insert into public._tap_out(line) select lives_ok(
  $$insert into public.verification_requests (user_id, tier, notes)
    values ('a3330000-0000-3333-3333-333333333333', 'gold',
            'I am the village secretary.')$$,
  'a member can apply for verification'
);

-- Applying is not granting: a request may only ever be created pending.
insert into public._tap_out(line) select throws_ok(
  $$insert into public.verification_requests (user_id, tier, status)
    values ('a3330000-0000-3333-3333-333333333333', 'gold', 'approved')$$,
  '42501', null,
  'but cannot submit one already approved'
);

insert into public._tap_out(line) select throws_ok(
  $$insert into public.verification_requests (user_id, tier)
    values ('a4440000-0000-4444-4444-444444444444', 'blue')$$,
  '42501', null,
  'nor apply on somebody else''s behalf'
);
reset role;

-- Nobody but the applicant and a verifier reads it.
select pg_temp.become('a4440000-0000-4444-4444-444444444444'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.verification_requests),
  0, 'another member cannot read somebody''s application'
);
reset role;

select pg_temp.become('a2220000-0000-2222-2222-222222222222'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.verification_requests
    where user_id = 'a3330000-0000-3333-3333-333333333333'::uuid),
  1, 'while a delegate reviewing the queue can'
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
