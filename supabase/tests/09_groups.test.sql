-- Ezike Oba :: groups
--
-- Run either way:
--   * locally:  supabase test db
--   * hosted:   paste this whole file into the Supabase SQL Editor
--               (requires: create extension if not exists pgtap with schema extensions;)
--
-- The assertions that matter most are the ones about a PRIVATE group. Multiple
-- permissive policies are OR'd together, so a post inside a private group had
-- to be excluded from posts_select_public explicitly -- otherwise a private
-- group's posts would have been readable by the entire internet while the
-- group itself looked properly locked.

begin;

set local search_path = public, extensions, pg_temp;
select plan(27);

create table public._tap_out (
  at   timestamptz not null default clock_timestamp(),
  line text
);
grant insert, select on public._tap_out to public;
alter table public._tap_out disable row level security;

-- ---------------------------------------------------------------------------
-- Fixtures: an owner, a member, and an outsider.
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values
  ('e1110000-1111-1111-1111-111111111111'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gro@example.com', '{"username":"grp_owner","full_name":"Grp Owner"}'),
  ('e2220000-2222-2222-2222-222222222222'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'grm@example.com', '{"username":"grp_member","full_name":"Grp Member"}'),
  ('e3330000-3333-3333-3333-333333333333'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gru@example.com', '{"username":"grp_outsider","full_name":"Grp Outsider"}');

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

-- Two groups, created by the owner.
select pg_temp.become('e1110000-1111-1111-1111-111111111111'::uuid);
insert into public.groups (id, name, slug, visibility, created_by) values
  ('e9990000-0000-0000-0000-000000000001', 'Open Group', 'open-group', 'public',
   'e1110000-1111-1111-1111-111111111111'),
  ('e9990000-0000-0000-0000-000000000002', 'Closed Group', 'closed-group', 'private',
   'e1110000-1111-1111-1111-111111111111');
reset role;

-- The creator must have been made owner by trigger, not by the application.
insert into public._tap_out(line) select is(
  (select role::text from public.group_members
    where group_id = 'e9990000-0000-0000-0000-000000000001'::uuid
      and user_id = 'e1110000-1111-1111-1111-111111111111'::uuid),
  'owner',
  'the creator is made owner automatically'
);

insert into public._tap_out(line) select is(
  (select member_count from public.groups
    where id = 'e9990000-0000-0000-0000-000000000001'::uuid),
  1, 'and the member count reflects it'
);

-- ===========================================================================
-- Seeing a group
-- ===========================================================================

select pg_temp.become_anon();
insert into public._tap_out(line) select is(
  (select count(*)::int from public.groups
    where id = 'e9990000-0000-0000-0000-000000000001'::uuid),
  1, 'a signed-out visitor can see a public group'
);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.groups
    where id = 'e9990000-0000-0000-0000-000000000002'::uuid),
  0, 'a signed-out visitor CANNOT see a private group'
);
reset role;

select pg_temp.become('e3330000-3333-3333-3333-333333333333'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.groups
    where id = 'e9990000-0000-0000-0000-000000000002'::uuid),
  0, 'a signed-in outsider CANNOT see a private group'
);
reset role;

select pg_temp.become('e1110000-1111-1111-1111-111111111111'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.groups
    where id = 'e9990000-0000-0000-0000-000000000002'::uuid),
  1, 'its own member CAN see it'
);
reset role;

-- ===========================================================================
-- Joining
-- ===========================================================================

select pg_temp.become('e2220000-2222-2222-2222-222222222222'::uuid);
insert into public._tap_out(line) select lives_ok(
  $$insert into public.group_members (group_id, user_id)
    values ('e9990000-0000-0000-0000-000000000001',
            'e2220000-2222-2222-2222-222222222222')$$,
  'anyone can join a public group'
);

-- A private group cannot be joined by walking up to it. That IS what makes it
-- private; an invitation flow would add rows through a definer function.
insert into public._tap_out(line) select throws_ok(
  $$insert into public.group_members (group_id, user_id)
    values ('e9990000-0000-0000-0000-000000000002',
            'e2220000-2222-2222-2222-222222222222')$$,
  '42501', null,
  'nobody can simply join a private group'
);

-- Membership is not a claim you make on somebody else's behalf.
insert into public._tap_out(line) select throws_ok(
  $$insert into public.group_members (group_id, user_id)
    values ('e9990000-0000-0000-0000-000000000001',
            'e3330000-3333-3333-3333-333333333333')$$,
  '42501', null,
  'a member CANNOT add somebody else to a group'
);
reset role;

insert into public._tap_out(line) select is(
  (select member_count from public.groups
    where id = 'e9990000-0000-0000-0000-000000000001'::uuid),
  2, 'joining increments the member count'
);

-- ===========================================================================
-- Posts inside a group
-- ===========================================================================

-- A post in the PRIVATE group. Note visibility is left at its default of
-- 'public', which is exactly the case that would leak if posts_select_public
-- had not been narrowed to non-group posts.
insert into public.posts (id, author_id, body, group_id) values
  ('ea000000-0000-0000-0000-000000000001',
   'e1110000-1111-1111-1111-111111111111', 'Something private', 'e9990000-0000-0000-0000-000000000002'),
  ('ea000000-0000-0000-0000-000000000002',
   'e1110000-1111-1111-1111-111111111111', 'Something open', 'e9990000-0000-0000-0000-000000000001');

select pg_temp.become_anon();
insert into public._tap_out(line) select is(
  (select count(*)::int from public.posts
    where id = 'ea000000-0000-0000-0000-000000000001'::uuid),
  0, 'a private group post is NOT readable by the public, despite visibility=public'
);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.posts
    where id = 'ea000000-0000-0000-0000-000000000002'::uuid),
  1, 'a public group post is readable by anyone'
);
reset role;

select pg_temp.become('e3330000-3333-3333-3333-333333333333'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.posts
    where id = 'ea000000-0000-0000-0000-000000000001'::uuid),
  0, 'nor by a signed-in outsider'
);

-- Reading a public group does not entitle you to write in it.
insert into public._tap_out(line) select throws_ok(
  $$insert into public.posts (author_id, body, group_id)
    values ('e3330000-3333-3333-3333-333333333333', 'Barging in',
            'e9990000-0000-0000-0000-000000000001')$$,
  '42501', null,
  'a non-member CANNOT post into a group they can read'
);
reset role;

select pg_temp.become('e2220000-2222-2222-2222-222222222222'::uuid);
insert into public._tap_out(line) select lives_ok(
  $$insert into public.posts (author_id, body, group_id)
    values ('e2220000-2222-2222-2222-222222222222', 'Hello group',
            'e9990000-0000-0000-0000-000000000001')$$,
  'a member CAN post into their group'
);
reset role;

select pg_temp.become('e1110000-1111-1111-1111-111111111111'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.posts
    where id = 'ea000000-0000-0000-0000-000000000001'::uuid),
  1, 'a member of the private group CAN read its posts'
);
reset role;

-- ===========================================================================
-- Replies inherit the group, without comments having been modified
-- ===========================================================================

insert into public.comments (id, post_id, author_id, body) values
  ('eb000000-0000-0000-0000-000000000001',
   'ea000000-0000-0000-0000-000000000001',
   'e1110000-1111-1111-1111-111111111111', 'A private reply');

select pg_temp.become_anon();
insert into public._tap_out(line) select is(
  (select count(*)::int from public.comments
    where id = 'eb000000-0000-0000-0000-000000000001'::uuid),
  0, 'a reply inside a private group is hidden from the public too'
);
reset role;

select pg_temp.become('e1110000-1111-1111-1111-111111111111'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.comments
    where id = 'eb000000-0000-0000-0000-000000000001'::uuid),
  1, 'and visible to a member'
);
reset role;

-- ===========================================================================
-- Leadership
-- ===========================================================================

create or replace function pg_temp.rows_group_updated(g uuid)
returns integer language plpgsql as $$
declare n integer;
begin
  update public.groups set description = 'changed' where id = g;
  get diagnostics n = row_count;
  return n;
end $$;

select pg_temp.become('e2220000-2222-2222-2222-222222222222'::uuid);
insert into public._tap_out(line) select is(
  pg_temp.rows_group_updated('e9990000-0000-0000-0000-000000000001'::uuid),
  0, 'an ordinary member cannot edit the group'
);
reset role;

select pg_temp.become('e1110000-1111-1111-1111-111111111111'::uuid);
insert into public._tap_out(line) select is(
  pg_temp.rows_group_updated('e9990000-0000-0000-0000-000000000001'::uuid),
  1, 'an owner can'
);
reset role;

-- ===========================================================================
-- The last owner cannot walk away
-- ===========================================================================

select pg_temp.become('e1110000-1111-1111-1111-111111111111'::uuid);
insert into public._tap_out(line) select throws_ok(
  $$delete from public.group_members
     where group_id = 'e9990000-0000-0000-0000-000000000001'
       and user_id = 'e1110000-1111-1111-1111-111111111111'$$,
  '23514', null,
  'the only owner CANNOT leave, which would orphan the group'
);

-- Demoting yourself is the same problem by another route.
insert into public._tap_out(line) select throws_ok(
  $$update public.group_members set role = 'member'
     where group_id = 'e9990000-0000-0000-0000-000000000001'
       and user_id = 'e1110000-1111-1111-1111-111111111111'$$,
  '23514', null,
  'nor demote themselves to member'
);

-- With a second owner in place, leaving is fine.
update public.group_members set role = 'owner'
 where group_id = 'e9990000-0000-0000-0000-000000000001'
   and user_id = 'e2220000-2222-2222-2222-222222222222';

insert into public._tap_out(line) select lives_ok(
  $$delete from public.group_members
     where group_id = 'e9990000-0000-0000-0000-000000000001'
       and user_id = 'e1110000-1111-1111-1111-111111111111'$$,
  'once another owner exists, the first may leave'
);
reset role;

-- ===========================================================================
-- Leaving, and counts
-- ===========================================================================

insert into public._tap_out(line) select is(
  (select member_count from public.groups
    where id = 'e9990000-0000-0000-0000-000000000001'::uuid),
  1, 'leaving decrements the member count'
);

update public.groups set member_count = 42
 where id = 'e9990000-0000-0000-0000-000000000001'::uuid;
select public.recount_group_members('e9990000-0000-0000-0000-000000000001'::uuid);

insert into public._tap_out(line) select is(
  (select member_count from public.groups
    where id = 'e9990000-0000-0000-0000-000000000001'::uuid),
  1, 'recount_group_members repairs a drifted count'
);

insert into public._tap_out(line) select ok(
  public.can_see_group('e9990000-0000-0000-0000-000000000001'::uuid,
                       'e3330000-3333-3333-3333-333333333333'::uuid),
  'can_see_group admits an outsider to a public group'
);

insert into public._tap_out(line) select is(
  public.can_see_group('e9990000-0000-0000-0000-000000000002'::uuid,
                       'e3330000-3333-3333-3333-333333333333'::uuid),
  false,
  'and refuses one for a private group'
);

insert into public._tap_out(line) select * from finish();

select coalesce(
  (select string_agg(line, chr(10) order by at)
     from public._tap_out
    where line not like 'ok %'),
  'ALL ASSERTIONS PASSED'
) as result;
rollback;
