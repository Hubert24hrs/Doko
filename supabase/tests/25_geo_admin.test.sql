-- Ezike Oba :: editing the community directory
--
-- Run either way:
--   * locally:  supabase test db
--   * hosted:   paste this whole file into the Supabase SQL Editor
--               (requires: create extension if not exists pgtap with schema extensions;)
--
-- /communities tells the public: "Administrators keep this directory accurate
-- -- if something is missing or misspelled, it can be corrected." /admin/
-- communities goes further: "Editing, moving and merging are enforced by
-- database policy -- a community admin can only change their own subtree."
--
-- The policies for that have existed since migration 005 and NOTHING in the
-- application had ever used them: there was not one write to geo_entities
-- anywhere in the codebase. The directory was read-only in practice while two
-- pages said otherwise.
--
-- Writing the editor found that the policy was also wider than its own comment.
-- geo_entities_update_admin admits `administers_geo(id)`, which grants the
-- WHOLE ROW -- so a community_admin scoped to one village could reparent it
-- under any district, or set kind='lga' with parent_id=null and promote it to a
-- second Local Government Area at the root of the tree, where /communities
-- renders it beside Igbo-Eze North. `administers_geo(id)` keeps passing,
-- because it is evaluated on the row's own id and the id never changes.
--
-- Migration 037 adds the guard. The assertions below hold both halves: a
-- community admin can still fix a misspelling in their own village, and cannot
-- move it, rename its URL, merge it away or delete it.

begin;

set local search_path = public, extensions, pg_temp;
select plan(17);

create table public._tap_out (
  at   timestamptz not null default clock_timestamp(),
  line text
);
grant insert, select on public._tap_out to public;
alter table public._tap_out disable row level security;

-- ---------------------------------------------------------------------------
-- Fixtures: a platform admin, a community admin of ONE village, and an
-- ordinary member.
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values
  ('6c110000-0000-1111-1111-111111111111'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ge-a@example.com', '{"username":"ge_admin","full_name":"Ge Admin"}'),
  ('6c220000-0000-2222-2222-222222222222'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ge-c@example.com', '{"username":"ge_chief","full_name":"Ge Chief"}'),
  ('6c330000-0000-3333-3333-333333333333'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ge-m@example.com', '{"username":"ge_member","full_name":"Ge Member"}');

create or replace function pg_temp.become(user_id uuid)
returns void language plpgsql as $$
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims to %L',
    json_build_object('sub', user_id::text, 'role', 'authenticated')::text);
end $$;

create or replace function pg_temp.become_platform()
returns void language plpgsql as $bp$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $bp$;

-- A town of our own with two villages, so "move it somewhere else" has a
-- somewhere else to be moved to.
insert into public.geo_entities (id, parent_id, kind, name, slug)
values ('7a000000-0000-0000-0000-0000000000a1',
        (select id from public.geo_entities where kind = 'lga' and deleted_at is null),
        'town', 'Tap Admin Town', 'tap-admin-town');

insert into public.geo_entities (id, parent_id, kind, name, slug, description)
values
  ('7b000000-0000-0000-0000-0000000000b1',
   '7a000000-0000-0000-0000-0000000000a1', 'village', 'Tap Chief Village',
   'tap-chief-village', 'Spelled wrongly on purpose.'),
  ('7b000000-0000-0000-0000-0000000000b2',
   '7a000000-0000-0000-0000-0000000000a1', 'village', 'Tap Other Village',
   'tap-other-village', 'Not the chief''s village.');

insert into public.user_roles (user_id, role) values
  ('6c110000-0000-1111-1111-111111111111'::uuid, 'admin')
on conflict do nothing;

insert into public.user_roles (user_id, role, scope_id) values
  ('6c220000-0000-2222-2222-222222222222'::uuid, 'community_admin',
   '7b000000-0000-0000-0000-0000000000b1')
on conflict do nothing;

-- ===========================================================================
-- An ordinary member changes nothing
-- ===========================================================================

select pg_temp.become('6c330000-0000-3333-3333-333333333333'::uuid);
update public.geo_entities set name = 'Renamed By A Stranger'
 where id = '7b000000-0000-0000-0000-0000000000b1'::uuid;
reset role;
select pg_temp.become_platform();

insert into public._tap_out(line) select is(
  (select name from public.geo_entities
    where id = '7b000000-0000-0000-0000-0000000000b1'::uuid),
  'Tap Chief Village', 'an ordinary member cannot rename a community'
);

select pg_temp.become('6c330000-0000-3333-3333-333333333333'::uuid);
insert into public._tap_out(line) select throws_ok(
  $$insert into public.geo_entities (parent_id, kind, name, slug)
    values ('7a000000-0000-0000-0000-0000000000a1',
            'village', 'Invented By A Member', 'invented-by-a-member')$$,
  '42501', null,
  'nor add one'
);
reset role;

-- ===========================================================================
-- The community admin CAN fix their own village -- the half that must work
-- ===========================================================================

select pg_temp.become('6c220000-0000-2222-2222-222222222222'::uuid);
update public.geo_entities
   set name = 'Tap Chief Village (correct spelling)',
       description = 'Corrected by the person who lives there.',
       aliases = array['Tap Chief', 'Chief Village'],
       latitude = 6.8321,
       longitude = 7.4102,
       sort_order = 3
 where id = '7b000000-0000-0000-0000-0000000000b1'::uuid;
reset role;
select pg_temp.become_platform();

insert into public._tap_out(line) select is(
  (select name from public.geo_entities
    where id = '7b000000-0000-0000-0000-0000000000b1'::uuid),
  'Tap Chief Village (correct spelling)',
  'a community admin CAN correct the name of their own village'
);

insert into public._tap_out(line) select is(
  (select description from public.geo_entities
    where id = '7b000000-0000-0000-0000-0000000000b1'::uuid),
  'Corrected by the person who lives there.', 'and its description'
);

insert into public._tap_out(line) select is(
  (select array_length(aliases, 1) from public.geo_entities
    where id = '7b000000-0000-0000-0000-0000000000b1'::uuid),
  2, 'and record what else it is called'
);

insert into public._tap_out(line) select is(
  (select latitude from public.geo_entities
    where id = '7b000000-0000-0000-0000-0000000000b1'::uuid),
  6.8321::double precision, 'and put it on the map'
);

insert into public._tap_out(line) select is(
  (select sort_order from public.geo_entities
    where id = '7b000000-0000-0000-0000-0000000000b1'::uuid),
  3, 'and set where it sits among its siblings'
);

-- ===========================================================================
-- ...and cannot reshape the tree. THE reason this migration exists.
-- ===========================================================================

-- Moving their village out from under the town they were scoped within.
select pg_temp.become('6c220000-0000-2222-2222-222222222222'::uuid);
update public.geo_entities
   set parent_id = (select id from public.geo_entities
                     where kind = 'lga' and deleted_at is null)
 where id = '7b000000-0000-0000-0000-0000000000b1'::uuid;
reset role;
select pg_temp.become_platform();

insert into public._tap_out(line) select is(
  (select parent_id from public.geo_entities
    where id = '7b000000-0000-0000-0000-0000000000b1'::uuid),
  '7a000000-0000-0000-0000-0000000000a1'::uuid,
  'a community admin CANNOT move their village to another parent'
);

-- Promoting it to a second Local Government Area at the root of the tree,
-- which geo_entities_root_only_lga permits and /communities would render
-- beside Igbo-Eze North.
select pg_temp.become('6c220000-0000-2222-2222-222222222222'::uuid);
update public.geo_entities set kind = 'lga', parent_id = null
 where id = '7b000000-0000-0000-0000-0000000000b1'::uuid;
reset role;
select pg_temp.become_platform();

insert into public._tap_out(line) select is(
  (select kind::text from public.geo_entities
    where id = '7b000000-0000-0000-0000-0000000000b1'::uuid),
  'village', 'nor promote it to a Local Government Area'
);

-- Taking a different URL, which breaks every link anybody has written down.
select pg_temp.become('6c220000-0000-2222-2222-222222222222'::uuid);
update public.geo_entities set slug = 'somewhere-entirely-different'
 where id = '7b000000-0000-0000-0000-0000000000b1'::uuid;
reset role;
select pg_temp.become_platform();

insert into public._tap_out(line) select is(
  (select slug::text from public.geo_entities
    where id = '7b000000-0000-0000-0000-0000000000b1'::uuid),
  'tap-chief-village', 'nor change its address'
);

-- Merging it away, which would redirect its page somewhere else entirely.
select pg_temp.become('6c220000-0000-2222-2222-222222222222'::uuid);
update public.geo_entities
   set merged_into_id = '7b000000-0000-0000-0000-0000000000b2'
 where id = '7b000000-0000-0000-0000-0000000000b1'::uuid;
reset role;
select pg_temp.become_platform();

insert into public._tap_out(line) select is(
  (select merged_into_id from public.geo_entities
    where id = '7b000000-0000-0000-0000-0000000000b1'::uuid),
  null, 'nor merge it into another community'
);

-- Removing it from the directory.
select pg_temp.become('6c220000-0000-2222-2222-222222222222'::uuid);
update public.geo_entities set deleted_at = now()
 where id = '7b000000-0000-0000-0000-0000000000b1'::uuid;
reset role;
select pg_temp.become_platform();

insert into public._tap_out(line) select is(
  (select deleted_at from public.geo_entities
    where id = '7b000000-0000-0000-0000-0000000000b1'::uuid),
  null, 'nor remove it from the directory'
);

-- And nothing at all about a village that is not theirs. Refused by the
-- POLICY here rather than the guard, which is a different mechanism reaching
-- the same answer -- so it is asserted separately.
select pg_temp.become('6c220000-0000-2222-2222-222222222222'::uuid);
update public.geo_entities set name = 'Reached Across The Fence'
 where id = '7b000000-0000-0000-0000-0000000000b2'::uuid;
reset role;
select pg_temp.become_platform();

insert into public._tap_out(line) select is(
  (select name from public.geo_entities
    where id = '7b000000-0000-0000-0000-0000000000b2'::uuid),
  'Tap Other Village', 'and nothing whatever about the next village along'
);

-- ===========================================================================
-- A platform admin reshapes the tree, which is the whole point of the role
-- ===========================================================================

select pg_temp.become('6c110000-0000-1111-1111-111111111111'::uuid);
update public.geo_entities
   set parent_id = '7b000000-0000-0000-0000-0000000000b2'
 where id = '7b000000-0000-0000-0000-0000000000b1'::uuid;
reset role;
select pg_temp.become_platform();

insert into public._tap_out(line) select is(
  (select parent_id from public.geo_entities
    where id = '7b000000-0000-0000-0000-0000000000b1'::uuid),
  '7b000000-0000-0000-0000-0000000000b2'::uuid,
  'a platform admin CAN move a community, which is what the role is for'
);

select pg_temp.become('6c110000-0000-1111-1111-111111111111'::uuid);
insert into public._tap_out(line) select lives_ok(
  $$insert into public.geo_entities (parent_id, kind, name, slug)
    values ('7a000000-0000-0000-0000-0000000000a1',
            'village', 'Tap Added Village', 'tap-added-village')$$,
  'and add one'
);
reset role;

-- ===========================================================================
-- One invariant that binds admins too
-- ===========================================================================

select pg_temp.become('6c110000-0000-1111-1111-111111111111'::uuid);
insert into public._tap_out(line) select throws_ok(
  $$insert into public.geo_entities (parent_id, kind, name, slug)
    values (null, 'lga', 'A Second Local Government Area', 'second-lga')$$,
  '23514', null,
  'not even an admin can create a second Local Government Area'
);
reset role;

-- The cycle guard from migration 002 is what stops an admin folding the tree
-- into itself. Asserted here because moving entities is now something the
-- application actually does, rather than something only migrations did.
select pg_temp.become('6c110000-0000-1111-1111-111111111111'::uuid);
insert into public._tap_out(line) select throws_ok(
  $$update public.geo_entities
       set parent_id = '7b000000-0000-0000-0000-0000000000b1'
     where id = '7a000000-0000-0000-0000-0000000000a1'$$,
  null, null,
  'nor make a town a child of a village inside it'
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
