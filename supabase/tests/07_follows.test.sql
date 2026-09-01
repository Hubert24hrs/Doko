-- Ezike Oba :: following
--
-- Run either way:
--   * locally:  supabase test db
--   * hosted:   paste this whole file into the Supabase SQL Editor
--               (requires: create extension if not exists pgtap with schema extensions;)
--
-- Following is one-directional and needs no approval, so the rules that matter
-- are: you may only create follows as yourself, you may only unfollow your
-- own, you cannot follow yourself, and the counts stay honest.

begin;

set local search_path = public, extensions, pg_temp;
select plan(16);

create table public._tap_out (
  at   timestamptz not null default clock_timestamp(),
  line text
);
grant insert, select on public._tap_out to public;
alter table public._tap_out disable row level security;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values
  ('f0110000-1111-1111-1111-111111111111'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'fa@example.com', '{"username":"fol_a","full_name":"Fol A"}'),
  ('f0220000-2222-2222-2222-222222222222'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'fb@example.com', '{"username":"fol_b","full_name":"Fol B"}'),
  ('f0330000-3333-3333-3333-333333333333'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'fc@example.com', '{"username":"fol_c","full_name":"Fol C"}'),
  -- Suspended: keeps a session, must not be able to act.
  ('f0440000-4444-4444-4444-444444444444'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'fs@example.com', '{"username":"fol_susp","full_name":"Fol Susp"}'),
  -- An admin, because suspending is an admin act (see docs/SECURITY.md).
  ('f0550000-5555-5555-5555-555555555555'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'fad@example.com', '{"username":"fol_admin","full_name":"Fol Admin"}');

insert into public.user_roles (user_id, role)
values ('f0550000-5555-5555-5555-555555555555'::uuid, 'admin');

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

-- Suspend as an admin: a plain UPDATE is silently reverted by
-- profiles_guard_privileged_columns() when auth.uid() is null.
select pg_temp.become('f0550000-5555-5555-5555-555555555555'::uuid);
update public.profiles set is_suspended = true
 where id = 'f0440000-4444-4444-4444-444444444444'::uuid;
reset role;

insert into public._tap_out(line) select ok(
  (select is_suspended from public.profiles
    where id = 'f0440000-4444-4444-4444-444444444444'::uuid),
  'the suspension fixture actually took'
);

-- ===========================================================================
-- Creating a follow
-- ===========================================================================

select pg_temp.become('f0110000-1111-1111-1111-111111111111'::uuid);
insert into public._tap_out(line) select lives_ok(
  $$insert into public.follows (follower_id, following_id)
    values ('f0110000-1111-1111-1111-111111111111',
            'f0220000-2222-2222-2222-222222222222')$$,
  'a member can follow somebody'
);

-- Authorship of the relationship is not a client claim.
insert into public._tap_out(line) select throws_ok(
  $$insert into public.follows (follower_id, following_id)
    values ('f0330000-3333-3333-3333-333333333333',
            'f0220000-2222-2222-2222-222222222222')$$,
  '42501', null,
  'a member CANNOT make somebody else follow a third party'
);

-- Following yourself would inflate your own counts and duplicate your posts
-- in your own following feed.
insert into public._tap_out(line) select throws_ok(
  $$insert into public.follows (follower_id, following_id)
    values ('f0110000-1111-1111-1111-111111111111',
            'f0110000-1111-1111-1111-111111111111')$$,
  '23514', null,
  'nobody can follow themselves'
);

-- The primary key makes a duplicate follow impossible, which is what lets the
-- action treat "follow someone you already follow" as success rather than
-- error.
insert into public._tap_out(line) select throws_ok(
  $$insert into public.follows (follower_id, following_id)
    values ('f0110000-1111-1111-1111-111111111111',
            'f0220000-2222-2222-2222-222222222222')$$,
  '23505', null,
  'the same follow cannot be recorded twice'
);
reset role;

-- A suspended account keeps its session but must not act.
select pg_temp.become('f0440000-4444-4444-4444-444444444444'::uuid);
insert into public._tap_out(line) select throws_ok(
  $$insert into public.follows (follower_id, following_id)
    values ('f0440000-4444-4444-4444-444444444444',
            'f0220000-2222-2222-2222-222222222222')$$,
  '42501', null,
  'a suspended member CANNOT follow anyone'
);
reset role;

-- ===========================================================================
-- Counts
-- ===========================================================================

insert into public._tap_out(line) select is(
  (select following_count from public.profiles
    where id = 'f0110000-1111-1111-1111-111111111111'::uuid),
  1, 'following someone increments the follower''s following_count'
);

insert into public._tap_out(line) select is(
  (select follower_count from public.profiles
    where id = 'f0220000-2222-2222-2222-222222222222'::uuid),
  1, 'and the followed member''s follower_count'
);

-- ===========================================================================
-- Unfollowing
-- ===========================================================================

create or replace function pg_temp.rows_unfollowed(a uuid, b uuid)
returns integer language plpgsql as $$
declare n integer;
begin
  delete from public.follows where follower_id = a and following_id = b;
  get diagnostics n = row_count;
  return n;
end $$;

-- Somebody else's follow is invisible to DELETE, so the write affects nothing.
select pg_temp.become('f0330000-3333-3333-3333-333333333333'::uuid);
insert into public._tap_out(line) select is(
  pg_temp.rows_unfollowed('f0110000-1111-1111-1111-111111111111'::uuid,
                          'f0220000-2222-2222-2222-222222222222'::uuid),
  0, 'a member cannot unfollow on somebody else''s behalf'
);
reset role;

insert into public._tap_out(line) select is(
  (select count(*)::int from public.follows
    where follower_id = 'f0110000-1111-1111-1111-111111111111'::uuid),
  1, 'and the follow is still there'
);

select pg_temp.become('f0110000-1111-1111-1111-111111111111'::uuid);
insert into public._tap_out(line) select is(
  pg_temp.rows_unfollowed('f0110000-1111-1111-1111-111111111111'::uuid,
                          'f0220000-2222-2222-2222-222222222222'::uuid),
  1, 'the follower CAN unfollow'
);
reset role;

-- Unfollowing is a real delete, like withdrawing a reaction: a follow is a
-- current relationship, not speech, so a tombstone would misstate it.
insert into public._tap_out(line) select is(
  (select count(*)::int from public.follows
    where follower_id = 'f0110000-1111-1111-1111-111111111111'::uuid
      and following_id = 'f0220000-2222-2222-2222-222222222222'::uuid),
  0, 'the row is gone, not merely marked'
);

insert into public._tap_out(line) select is(
  (select follower_count from public.profiles
    where id = 'f0220000-2222-2222-2222-222222222222'::uuid),
  0, 'unfollowing decrements the count again'
);

-- ===========================================================================
-- Reading, and the helper the feed depends on
-- ===========================================================================

select pg_temp.become('f0110000-1111-1111-1111-111111111111'::uuid);
insert into public.follows (follower_id, following_id)
values ('f0110000-1111-1111-1111-111111111111',
        'f0330000-3333-3333-3333-333333333333');
reset role;

insert into public._tap_out(line) select ok(
  public.follows_profile('f0330000-3333-3333-3333-333333333333'::uuid,
                         'f0110000-1111-1111-1111-111111111111'::uuid),
  'follows_profile reports an existing follow'
);

insert into public._tap_out(line) select is(
  public.follows_profile('f0220000-2222-2222-2222-222222222222'::uuid,
                         'f0110000-1111-1111-1111-111111111111'::uuid),
  false,
  'and correctly reports one that was withdrawn'
);

-- Counter repair, as for post engagement.
update public.profiles set follower_count = 99
 where id = 'f0330000-3333-3333-3333-333333333333'::uuid;
select public.recount_follows('f0330000-3333-3333-3333-333333333333'::uuid);

insert into public._tap_out(line) select is(
  (select follower_count from public.profiles
    where id = 'f0330000-3333-3333-3333-333333333333'::uuid),
  1, 'recount_follows repairs a drifted counter'
);

insert into public._tap_out(line) select * from finish();

select coalesce(
  (select string_agg(line, chr(10) order by at)
     from public._tap_out
    where line not like 'ok %'),
  'ALL ASSERTIONS PASSED'
) as result;
rollback;
