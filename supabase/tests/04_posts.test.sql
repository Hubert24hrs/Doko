-- Ezike Oba :: post Row Level Security
--
-- Run either way:
--   * locally:  supabase test db
--   * hosted:   paste this whole file into the Supabase SQL Editor
--               (requires: create extension if not exists pgtap with schema extensions;)
--
-- Everything the feed shows is decided by these policies. If a "community"
-- post is readable by someone outside that community, the visibility control
-- is decorative.

begin;

-- pgTAP installs into the `extensions` schema on hosted Supabase, which is not
-- on the SQL Editor's default search_path.
set local search_path = public, extensions, pg_temp;
select plan(22);

-- Assertion output is captured so failures arrive named. A real table, not
-- TEMP: assertions run under SET ROLE and reaching another role's temporary
-- schema is not dependable. Created inside the transaction, so the closing
-- rollback removes it.
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
  -- Two members of the SAME village.
  ('a1111111-1111-1111-1111-111111111111'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'pa@example.com', '{"username":"post_a","full_name":"Post A"}'),
  ('a2222222-2222-2222-2222-222222222222'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'pb@example.com', '{"username":"post_b","full_name":"Post B"}'),
  -- A member of a DIFFERENT village.
  ('a3333333-3333-3333-3333-333333333333'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'pc@example.com', '{"username":"post_c","full_name":"Post C"}'),
  -- A moderator.
  ('a4444444-4444-4444-4444-444444444444'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'pm@example.com', '{"username":"post_mod","full_name":"Post Mod"}'),
  -- A suspended member.
  ('a5555555-5555-5555-5555-555555555555'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ps@example.com', '{"username":"post_susp","full_name":"Post Susp"}'),
  -- An admin, whose only job is to carry out the suspension below.
  ('a6666666-6666-6666-6666-666666666666'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'pad@example.com', '{"username":"post_admin","full_name":"Post Admin"}');

insert into public.user_roles (user_id, role) values
  ('a4444444-4444-4444-4444-444444444444'::uuid, 'moderator'),
  ('a6666666-6666-6666-6666-666666666666'::uuid, 'admin');

-- Geography: one town, two villages beneath it.
insert into public.geo_entities (id, parent_id, kind, name, slug) values
  ('b0000000-0000-0000-0000-000000000001', null, 'lga',  'Post LGA',  'post-lga');
insert into public.geo_entities (id, parent_id, kind, name, slug) values
  ('b0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'town', 'Post Town', 'post-town');
insert into public.geo_entities (id, parent_id, kind, name, slug) values
  ('b0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000002', 'village', 'Village One', 'village-one'),
  ('b0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000002', 'village', 'Village Two', 'village-two');

update public.profiles set village_id = 'b0000000-0000-0000-0000-000000000003',
                           town_id    = 'b0000000-0000-0000-0000-000000000002'
 where id in ('a1111111-1111-1111-1111-111111111111'::uuid,
              'a2222222-2222-2222-2222-222222222222'::uuid);

update public.profiles set village_id = 'b0000000-0000-0000-0000-000000000004',
                           town_id    = 'b0000000-0000-0000-0000-000000000002'
 where id = 'a3333333-3333-3333-3333-333333333333'::uuid;

-- Suspension must be carried out BY AN ADMIN, not by raw SQL.
--
-- profiles_guard_privileged_columns() silently restores is_suspended for any
-- caller that is not an admin, and a statement run directly as postgres has no
-- auth.uid(), so is_admin() is false and the guard treats it as an ordinary
-- member. Suspending here without impersonating an admin looked like it
-- worked, changed nothing, and made the next assertion fail for a reason that
-- had nothing to do with posting.
--
-- The trigger is behaving correctly; the fixture was wrong. Doing it the way
-- the platform really does it also proves an admin CAN suspend, which is
-- asserted immediately below.

-- Posts: one public, one scoped to Village One.
insert into public.posts (id, author_id, body, geo_id, visibility) values
  ('c0000000-0000-0000-0000-000000000001',
   'a1111111-1111-1111-1111-111111111111', 'A public post', null, 'public'),
  ('c0000000-0000-0000-0000-000000000002',
   'a1111111-1111-1111-1111-111111111111', 'A village-only post',
   'b0000000-0000-0000-0000-000000000003', 'community');

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

-- Now suspend, as the admin.
select pg_temp.become('a6666666-6666-6666-6666-666666666666'::uuid);
update public.profiles set is_suspended = true
 where id = 'a5555555-5555-5555-5555-555555555555'::uuid;
reset role;

-- Confirm the suspension actually took. Without this, the guard silently
-- undoing it would surface later as an unrelated-looking failure.
insert into public._tap_out(line) select ok(
  (select is_suspended from public.profiles
    where id = 'a5555555-5555-5555-5555-555555555555'::uuid),
  'an admin can suspend a member, and the change persists'
);

-- ===========================================================================
-- Reading
-- ===========================================================================

select pg_temp.become_anon();
insert into public._tap_out(line) select is(
  (select count(*)::int from public.posts
    where id = 'c0000000-0000-0000-0000-000000000001'::uuid),
  1, 'a signed-out visitor can read a public post'
);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.posts
    where id = 'c0000000-0000-0000-0000-000000000002'::uuid),
  0, 'a signed-out visitor CANNOT read a community post'
);
reset role;

-- Same village as the author.
select pg_temp.become('a2222222-2222-2222-2222-222222222222'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.posts
    where id = 'c0000000-0000-0000-0000-000000000002'::uuid),
  1, 'a member of the same village CAN read a community post'
);
reset role;

-- Different village, same town. The post is scoped to Village One, so a
-- Village Two member must not see it.
select pg_temp.become('a3333333-3333-3333-3333-333333333333'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.posts
    where id = 'c0000000-0000-0000-0000-000000000002'::uuid),
  0, 'a member of a different village CANNOT read that community post'
);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.posts
    where id = 'c0000000-0000-0000-0000-000000000001'::uuid),
  1, 'but they can still read the public post'
);
reset role;

-- The author always sees their own work.
select pg_temp.become('a1111111-1111-1111-1111-111111111111'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.posts
    where author_id = 'a1111111-1111-1111-1111-111111111111'::uuid),
  2, 'an author sees both of their own posts'
);
reset role;

-- ===========================================================================
-- Writing
-- ===========================================================================

select pg_temp.become('a2222222-2222-2222-2222-222222222222'::uuid);
insert into public._tap_out(line) select lives_ok(
  $$insert into public.posts (author_id, body)
    values ('a2222222-2222-2222-2222-222222222222', 'My own post')$$,
  'an active member can post as themselves'
);

-- Authorship is not a claim the client gets to make.
insert into public._tap_out(line) select throws_ok(
  $$insert into public.posts (author_id, body)
    values ('a1111111-1111-1111-1111-111111111111', 'Posted as someone else')$$,
  '42501', null,
  'a member CANNOT post as somebody else'
);
reset role;

-- A suspended account keeps its session but must not be able to post.
select pg_temp.become('a5555555-5555-5555-5555-555555555555'::uuid);
insert into public._tap_out(line) select throws_ok(
  $$insert into public.posts (author_id, body)
    values ('a5555555-5555-5555-5555-555555555555', 'Post while suspended')$$,
  '42501', null,
  'a suspended member CANNOT post'
);
reset role;

-- ===========================================================================
-- Editing and removal
-- ===========================================================================

-- Someone else's post is invisible to UPDATE, so the write affects no rows
-- rather than raising.
create or replace function pg_temp.rows_updated_by_other()
returns integer language plpgsql as $$
declare n integer;
begin
  update public.posts set body = 'hijacked'
   where id = 'c0000000-0000-0000-0000-000000000001'::uuid;
  get diagnostics n = row_count;
  return n;
end $$;

select pg_temp.become('a3333333-3333-3333-3333-333333333333'::uuid);
insert into public._tap_out(line) select is(
  pg_temp.rows_updated_by_other(), 0,
  'a member cannot edit somebody else''s post'
);
reset role;

insert into public._tap_out(line) select is(
  (select body from public.posts where id = 'c0000000-0000-0000-0000-000000000001'::uuid),
  'A public post',
  'and the body is untouched'
);

-- The author edits their own post: allowed, and edited_at is stamped.
select pg_temp.become('a1111111-1111-1111-1111-111111111111'::uuid);
update public.posts set body = 'A public post, corrected'
 where id = 'c0000000-0000-0000-0000-000000000001'::uuid;
reset role;

insert into public._tap_out(line) select is(
  (select body from public.posts where id = 'c0000000-0000-0000-0000-000000000001'::uuid),
  'A public post, corrected',
  'an author can edit their own post'
);
insert into public._tap_out(line) select ok(
  (select edited_at is not null from public.posts
    where id = 'c0000000-0000-0000-0000-000000000001'::uuid),
  'editing stamps edited_at, so "edited" can be shown honestly'
);

-- A moderator may take a post down but must not rewrite it.
select pg_temp.become('a4444444-4444-4444-4444-444444444444'::uuid);
update public.posts
   set deleted_at = now(), body = 'moderator rewrote this'
 where id = 'c0000000-0000-0000-0000-000000000001'::uuid;
reset role;

insert into public._tap_out(line) select ok(
  (select deleted_at is not null from public.posts
    where id = 'c0000000-0000-0000-0000-000000000001'::uuid),
  'a moderator can remove a post'
);
insert into public._tap_out(line) select is(
  (select body from public.posts where id = 'c0000000-0000-0000-0000-000000000001'::uuid),
  'A public post, corrected',
  'but CANNOT put words in a member''s mouth'
);

-- Nobody may hard-delete: there is no DELETE policy for any role.
create or replace function pg_temp.rows_hard_deleted()
returns integer language plpgsql as $$
declare n integer;
begin
  delete from public.posts where id = 'c0000000-0000-0000-0000-000000000002'::uuid;
  get diagnostics n = row_count;
  return n;
end $$;

select pg_temp.become('a4444444-4444-4444-4444-444444444444'::uuid);
insert into public._tap_out(line) select is(
  pg_temp.rows_hard_deleted(), 0,
  'not even a moderator can hard-delete a post'
);
reset role;

-- A removed post leaves the public feed.
select pg_temp.become_anon();
insert into public._tap_out(line) select is(
  (select count(*)::int from public.posts
    where id = 'c0000000-0000-0000-0000-000000000001'::uuid),
  0, 'a removed post disappears from the public feed'
);
reset role;

-- ...but its author can still see it, so a removal can be explained rather
-- than a post silently vanishing.
select pg_temp.become('a1111111-1111-1111-1111-111111111111'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.posts
    where id = 'c0000000-0000-0000-0000-000000000001'::uuid),
  1, 'the author can still see their removed post'
);
reset role;

-- ===========================================================================
-- Community scoping helper
-- ===========================================================================

insert into public._tap_out(line) select ok(
  public.member_of_geo(null, 'a3333333-3333-3333-3333-333333333333'::uuid),
  'an LGA-wide post (geo_id null) belongs to everyone'
);

insert into public._tap_out(line) select ok(
  public.member_of_geo('b0000000-0000-0000-0000-000000000002'::uuid,
                       'a1111111-1111-1111-1111-111111111111'::uuid),
  'a town-scoped post reaches members of villages beneath it'
);

insert into public._tap_out(line) select is(
  public.is_active_member('a5555555-5555-5555-5555-555555555555'::uuid),
  false,
  'a suspended member is not an active member'
);

insert into public._tap_out(line) select * from finish();

select coalesce(
  (select string_agg(line, chr(10) order by at)
     from public._tap_out
    where line not like 'ok %'),
  'ALL ASSERTIONS PASSED'
) as result;
rollback;
