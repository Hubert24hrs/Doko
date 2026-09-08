-- Ezike Oba :: community issues
--
-- Run either way:
--   * locally:  supabase test db
--   * hosted:   paste this whole file into the Supabase SQL Editor
--               (requires: create extension if not exists pgtap with schema extensions;)
--
-- A broken borehole, a washed-out road, a transformer down. This is the first
-- feature in the schema whose access model is genuinely SIMPLER than the ones
-- before it -- no visibility tiers, no groups, one audience -- so most of the
-- assertions here are not about who may READ.
--
-- They are about who may say what. Three parties touch an issue and each owns
-- a different half of it: the reporter owns the description of the problem, an
-- administrator owns its status, and everybody else may only confirm they see
-- it. Migration 021's guard trigger splits those, and a split that is not
-- tested is a split that quietly stops holding.
--
-- The assertion this suite exists for is #13. `administers_geo()` has been in
-- the schema since migration 003 and NOTHING has ever used it -- events, jobs
-- and the marketplace all needed only platform-wide is_staff(). It walks
-- geo_ancestors(), so an admin scoped to a TOWN is meant to cover every
-- village beneath it without being listed against each one. That walk has
-- never been exercised by anything. docs/TESTING.md has carried
-- "Still to write: community_admin subtree scoping" since Phase 1.

begin;

set local search_path = public, extensions, pg_temp;
select plan(26);

create table public._tap_out (
  at   timestamptz not null default clock_timestamp(),
  line text
);
grant insert, select on public._tap_out to public;
alter table public._tap_out disable row level security;

-- ---------------------------------------------------------------------------
-- Fixtures
--
-- A reporter, a neighbour, a community_admin scoped to one TOWN, and a second
-- community_admin scoped to a different town who must not be able to touch the
-- first town's issues.
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values
  ('11110000-0000-1111-1111-111111111111'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'is-r@example.com', '{"username":"is_reporter","full_name":"Is Reporter"}'),
  ('22220000-0000-2222-2222-222222222222'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'is-n@example.com', '{"username":"is_neighbour","full_name":"Is Neighbour"}'),
  ('33330000-0000-3333-3333-333333333333'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'is-a@example.com', '{"username":"is_admin_a","full_name":"Is AdminA"}'),
  ('44440000-0000-4444-4444-444444444444'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'is-b@example.com', '{"username":"is_admin_b","full_name":"Is AdminB"}');

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

-- `reset role` restores the ROLE and leaves `set local request.jwt.claims` in
-- place, so auth.uid() keeps answering with whoever was last impersonated.
-- Every guard in this file branches on auth.uid(), so a fixture that only
-- resets the role would keep testing the last member's branch. See
-- docs/SECURITY.md, "And the defect in the test that hid it".
create or replace function pg_temp.become_platform()
returns void language plpgsql as $bp$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $bp$;

-- A small geography of our own, hung off the real LGA root. Built here rather
-- than picked out of the seed so the suite asserts the ANCESTOR WALK rather
-- than whatever shape the seed happens to have today.
--
--   LGA
--    +- Tap Town A
--    |    +- Tap Village A1   <- the issue lives here
--    +- Tap Town B
--         +- Tap Village B1
insert into public.geo_entities (id, parent_id, kind, name, slug)
values
  ('9a000000-0000-0000-0000-00000000000a',
   (select id from public.geo_entities where kind = 'lga' limit 1),
   'town', 'Tap Town A', 'tap-town-a'),
  ('9a000000-0000-0000-0000-00000000000b',
   (select id from public.geo_entities where kind = 'lga' limit 1),
   'town', 'Tap Town B', 'tap-town-b');

insert into public.geo_entities (id, parent_id, kind, name, slug)
values
  ('9b000000-0000-0000-0000-0000000000a1',
   '9a000000-0000-0000-0000-00000000000a', 'village', 'Tap Village A1', 'tap-village-a1'),
  ('9b000000-0000-0000-0000-0000000000b1',
   '9a000000-0000-0000-0000-00000000000b', 'village', 'Tap Village B1', 'tap-village-b1');

-- Scoped to the TOWNS, deliberately. The issue is reported in a VILLAGE.
insert into public.user_roles (user_id, role, scope_id) values
  ('33330000-0000-3333-3333-333333333333'::uuid, 'community_admin',
   '9a000000-0000-0000-0000-00000000000a'),
  ('44440000-0000-4444-4444-444444444444'::uuid, 'community_admin',
   '9a000000-0000-0000-0000-00000000000b');

-- ===========================================================================
-- Reporting
-- ===========================================================================

select pg_temp.become('11110000-0000-1111-1111-111111111111'::uuid);

insert into public._tap_out(line) select lives_ok(
  $$insert into public.community_issues
      (id, reporter_id, title, description, category, geo_id, location_text)
    values ('c0000000-0000-0000-0000-000000000001',
            '11110000-0000-1111-1111-111111111111',
            'Borehole at the market has stopped',
            'The pump has not run since Nkwo. Women are walking to the stream.',
            'water',
            '9b000000-0000-0000-0000-0000000000a1',
            'Beside the lock-up shops, Nkwo market')$$,
  'a member can report an issue'
);

-- Not a boolean "resolved": a community has to be able to tell "nobody has
-- looked at this" from "somebody is on it".
insert into public._tap_out(line) select is(
  (select status::text from public.community_issues
    where id = 'c0000000-0000-0000-0000-000000000001'::uuid),
  'reported', 'and it starts at reported, with nobody yet on it'
);

insert into public._tap_out(line) select throws_ok(
  $$insert into public.community_issues
      (reporter_id, title, description, geo_id)
    values ('22220000-0000-2222-2222-222222222222',
            'Not mine', 'Filed in another member''s name.',
            '9b000000-0000-0000-0000-0000000000a1')$$,
  '42501', null,
  'but not in somebody else''s name'
);

-- Everywhere else in this schema a NULL geo_id means "the whole LGA", which is
-- a sensible default for a post and a meaningless one for a pothole. An issue
-- that is nowhere cannot be fixed.
insert into public._tap_out(line) select throws_ok(
  $$insert into public.community_issues
      (reporter_id, title, description, geo_id)
    values ('11110000-0000-1111-1111-111111111111',
            'Nowhere in particular', 'An issue with no community at all.',
            null)$$,
  '23502', null,
  'and never with no community at all -- geo_id is NOT NULL here'
);

-- Half a pin puts a marker where longitude 0 meets a real latitude, which is
-- the Gulf of Guinea.
insert into public._tap_out(line) select throws_ok(
  $$insert into public.community_issues
      (reporter_id, title, description, geo_id, latitude)
    values ('11110000-0000-1111-1111-111111111111',
            'Half a pin', 'A latitude with no longitude.',
            '9b000000-0000-0000-0000-0000000000a1', 6.83)$$,
  '23514', null,
  'a coordinate without its pair is refused rather than mapped to the sea'
);

insert into public._tap_out(line) select throws_ok(
  $$insert into public.community_issues
      (reporter_id, title, description, geo_id, latitude, longitude)
    values ('11110000-0000-1111-1111-111111111111',
            'Off the planet', 'A latitude no point on earth has.',
            '9b000000-0000-0000-0000-0000000000a1', 118.4, 7.4)$$,
  '23514', null,
  'and a latitude of 118 is refused outright'
);
reset role;

-- ===========================================================================
-- Who can see it: everybody, and that is the point
-- ===========================================================================

select pg_temp.become_anon();
insert into public._tap_out(line) select is(
  (select count(*)::int from public.community_issues
    where id = 'c0000000-0000-0000-0000-000000000001'::uuid),
  1, 'a signed-out visitor can read the issue -- there are no tiers here'
);
reset role;

-- ===========================================================================
-- The guard: the reporter owns the problem, not the verdict
-- ===========================================================================

select pg_temp.become('11110000-0000-1111-1111-111111111111'::uuid);
update public.community_issues
   set description = 'The pump has not run since Nkwo. The tank is empty too.'
 where id = 'c0000000-0000-0000-0000-000000000001'::uuid;
reset role;

insert into public._tap_out(line) select is(
  (select description from public.community_issues
    where id = 'c0000000-0000-0000-0000-000000000001'::uuid),
  'The pump has not run since Nkwo. The tank is empty too.',
  'the reporter can correct what they wrote'
);

insert into public._tap_out(line) select isnt(
  (select edited_at from public.community_issues
    where id = 'c0000000-0000-0000-0000-000000000001'::uuid),
  null, 'and the correction is stamped, so nobody has to take it on trust'
);

-- "Somebody said it is fixed" and "the person responsible says it is fixed"
-- are different claims, and only the second is worth showing.
select pg_temp.become('11110000-0000-1111-1111-111111111111'::uuid);
update public.community_issues set status = 'resolved'
 where id = 'c0000000-0000-0000-0000-000000000001'::uuid;
reset role;

insert into public._tap_out(line) select is(
  (select status::text from public.community_issues
    where id = 'c0000000-0000-0000-0000-000000000001'::uuid),
  'reported', 'the reporter CANNOT declare their own report fixed'
);

-- An ordinary neighbour has no say in the status at all.
select pg_temp.become('22220000-0000-2222-2222-222222222222'::uuid);
update public.community_issues set status = 'declined'
 where id = 'c0000000-0000-0000-0000-000000000001'::uuid;
reset role;

insert into public._tap_out(line) select is(
  (select status::text from public.community_issues
    where id = 'c0000000-0000-0000-0000-000000000001'::uuid),
  'reported', 'nor can a passing member decline it'
);

-- ===========================================================================
-- The one this suite was written for: the ancestor walk
--
-- The admin is scoped to Tap Town A. The issue is in Tap Village A1, one level
-- below it, and the admin is listed against the village nowhere at all.
-- ===========================================================================

select pg_temp.become('33330000-0000-3333-3333-333333333333'::uuid);
update public.community_issues
   set status = 'in_progress',
       status_note = 'The council has sent for a part.',
       -- Deliberately claiming somebody else did it. The guard must overwrite
       -- this with the caller, or the record of who acted is forgeable.
       status_changed_by = '11110000-0000-1111-1111-111111111111'
 where id = 'c0000000-0000-0000-0000-000000000001'::uuid;
reset role;

insert into public._tap_out(line) select is(
  (select status::text from public.community_issues
    where id = 'c0000000-0000-0000-0000-000000000001'::uuid),
  'in_progress',
  'a community_admin of the TOWN can act on an issue in a village beneath it'
);

insert into public._tap_out(line) select is(
  (select status_changed_by from public.community_issues
    where id = 'c0000000-0000-0000-0000-000000000001'::uuid),
  '33330000-0000-3333-3333-333333333333'::uuid,
  'and who acted is stamped by the database, not accepted from the client'
);

-- The other town's admin is a community_admin too, with exactly the same role
-- and a different scope. If the walk were "is a community_admin" rather than
-- "administers THIS place", this would go through.
select pg_temp.become('44440000-0000-4444-4444-444444444444'::uuid);
update public.community_issues set status = 'declined'
 where id = 'c0000000-0000-0000-0000-000000000001'::uuid;
reset role;

insert into public._tap_out(line) select is(
  (select status::text from public.community_issues
    where id = 'c0000000-0000-0000-0000-000000000001'::uuid),
  'in_progress',
  'a community_admin of a DIFFERENT town cannot touch it'
);

-- The same rule that stops a moderator moving somebody's funeral.
select pg_temp.become('33330000-0000-3333-3333-333333333333'::uuid);
update public.community_issues
   set description = 'Actually there is nothing wrong with the borehole.'
 where id = 'c0000000-0000-0000-0000-000000000001'::uuid;
reset role;

insert into public._tap_out(line) select is(
  (select description from public.community_issues
    where id = 'c0000000-0000-0000-0000-000000000001'::uuid),
  'The pump has not run since Nkwo. The tank is empty too.',
  'and an administrator cannot rewrite what the reporter said was wrong'
);

-- Resolving is the one status that carries a timestamp of its own, because
-- "when was it fixed" is a question people ask months later.
select pg_temp.become('33330000-0000-3333-3333-333333333333'::uuid);
update public.community_issues set status = 'resolved'
 where id = 'c0000000-0000-0000-0000-000000000001'::uuid;
reset role;

insert into public._tap_out(line) select isnt(
  (select resolved_at from public.community_issues
    where id = 'c0000000-0000-0000-0000-000000000001'::uuid),
  null, 'resolving fills resolved_at without the client sending it'
);

-- ===========================================================================
-- "I see this too"
-- ===========================================================================

select pg_temp.become('22220000-0000-2222-2222-222222222222'::uuid);

insert into public._tap_out(line) select lives_ok(
  $$insert into public.issue_confirmations (issue_id, user_id)
    values ('c0000000-0000-0000-0000-000000000001',
            '22220000-0000-2222-2222-222222222222')$$,
  'a neighbour can confirm they see the same problem'
);

insert into public._tap_out(line) select throws_ok(
  $$insert into public.issue_confirmations (issue_id, user_id)
    values ('c0000000-0000-0000-0000-000000000001',
            '22220000-0000-2222-2222-222222222222')$$,
  '23505', null,
  'and cannot confirm the same one twice to inflate it'
);

insert into public._tap_out(line) select throws_ok(
  $$insert into public.issue_confirmations (issue_id, user_id)
    values ('c0000000-0000-0000-0000-000000000001',
            '11110000-0000-1111-1111-111111111111')$$,
  '42501', null,
  'nor confirm in somebody else''s name'
);
reset role;

insert into public._tap_out(line) select is(
  (select confirm_count from public.community_issues
    where id = 'c0000000-0000-0000-0000-000000000001'::uuid),
  1, 'the count is maintained by trigger, not by the client'
);

-- A confirmation is a current statement of fact, not speech: withdrawing it
-- leaves nothing behind, because a tombstone would misstate how many people
-- still see the problem.
select pg_temp.become('22220000-0000-2222-2222-222222222222'::uuid);
delete from public.issue_confirmations
 where issue_id = 'c0000000-0000-0000-0000-000000000001'::uuid
   and user_id = '22220000-0000-2222-2222-222222222222'::uuid;
reset role;

insert into public._tap_out(line) select is(
  (select confirm_count from public.community_issues
    where id = 'c0000000-0000-0000-0000-000000000001'::uuid),
  0, 'and withdrawing it takes the count back down'
);

-- ===========================================================================
-- Photographs
-- ===========================================================================

select pg_temp.become('11110000-0000-1111-1111-111111111111'::uuid);

insert into public._tap_out(line) select lives_ok(
  $$insert into public.issue_media
      (issue_id, storage_path, mime_type, byte_size)
    values ('c0000000-0000-0000-0000-000000000001',
            'c0000000-0000-0000-0000-000000000001/one.jpg', 'image/jpeg', 100000)$$,
  'the reporter can attach a photograph as evidence'
);

reset role;

-- The authorisation case goes FIRST, while the issue still has one photo.
--
-- Written the other way round it failed, and the failure is worth keeping in
-- the file: with four photos already attached, issue_media_enforce_limit is a
-- BEFORE INSERT trigger and raises 23514 before RLS evaluates the policy's
-- WITH CHECK at all. The assertion named authorisation and measured the photo
-- limit. 14_jobs hit exactly this -- a non-employer's insert expected to fail
-- on the primary key when the policy refuses it first -- and the answer is the
-- same: test each rule where it can actually fire.
select pg_temp.become('22220000-0000-2222-2222-222222222222'::uuid);
insert into public._tap_out(line) select throws_ok(
  $$insert into public.issue_media
      (issue_id, storage_path, mime_type, byte_size)
    values ('c0000000-0000-0000-0000-000000000001',
            'c0000000-0000-0000-0000-000000000001/theirs.jpg', 'image/jpeg', 100000)$$,
  '42501', null,
  'and nobody but the reporter can add one to their report'
);
reset role;

select pg_temp.become('11110000-0000-1111-1111-111111111111'::uuid);
insert into public.issue_media (issue_id, storage_path, mime_type, byte_size)
values
  ('c0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000001/two.jpg', 'image/jpeg', 100000),
  ('c0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000001/three.jpg', 'image/jpeg', 100000),
  ('c0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000001/four.jpg', 'image/jpeg', 100000);

-- Four, not a listing's six. A photograph of a broken borehole is evidence,
-- not a shop window.
insert into public._tap_out(line) select throws_ok(
  $$insert into public.issue_media
      (issue_id, storage_path, mime_type, byte_size)
    values ('c0000000-0000-0000-0000-000000000001',
            'c0000000-0000-0000-0000-000000000001/five.jpg', 'image/jpeg', 100000)$$,
  '23514', null,
  'and a fifth photograph is refused'
);
reset role;

-- ===========================================================================
-- Withdrawal
-- ===========================================================================

select pg_temp.become('11110000-0000-1111-1111-111111111111'::uuid);
update public.community_issues set deleted_at = now()
 where id = 'c0000000-0000-0000-0000-000000000001'::uuid;
reset role;

select pg_temp.become_anon();
insert into public._tap_out(line) select is(
  (select count(*)::int from public.community_issues
    where id = 'c0000000-0000-0000-0000-000000000001'::uuid),
  0, 'a withdrawn report leaves the public listing'
);
reset role;

-- The reporter keeps seeing it, so a withdrawal reads as a withdrawal rather
-- than as the report having never existed. Same rule as a deleted post.
select pg_temp.become('11110000-0000-1111-1111-111111111111'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.community_issues
    where id = 'c0000000-0000-0000-0000-000000000001'::uuid),
  1, 'but its reporter still sees their own'
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
