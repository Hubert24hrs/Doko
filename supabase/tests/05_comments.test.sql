-- Ezike Oba :: comments, reactions and engagement counts
--
-- Run either way:
--   * locally:  supabase test db
--   * hosted:   paste this whole file into the Supabase SQL Editor
--               (requires: create extension if not exists pgtap with schema extensions;)
--
-- The rule under test: a comment or reaction is visible exactly when its post
-- is. If a reply under a community post leaks to someone outside that
-- community, the post's own visibility control is worthless.

begin;

set local search_path = public, extensions, pg_temp;
select plan(18);

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
  ('d1111111-1111-1111-1111-111111111111'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ca@example.com', '{"username":"cmt_a","full_name":"Cmt A"}'),
  ('d2222222-2222-2222-2222-222222222222'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'cb@example.com', '{"username":"cmt_b","full_name":"Cmt B"}'),
  -- Outside the village the community post is scoped to.
  ('d3333333-3333-3333-3333-333333333333'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'cc@example.com', '{"username":"cmt_c","full_name":"Cmt C"}'),
  ('d4444444-4444-4444-4444-444444444444'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'cm@example.com', '{"username":"cmt_mod","full_name":"Cmt Mod"}');

insert into public.user_roles (user_id, role)
values ('d4444444-4444-4444-4444-444444444444'::uuid, 'moderator');

insert into public.geo_entities (id, parent_id, kind, name, slug) values
  ('e0000000-0000-0000-0000-000000000001', null, 'lga', 'Cmt LGA', 'cmt-lga');
insert into public.geo_entities (id, parent_id, kind, name, slug) values
  ('e0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001', 'town', 'Cmt Town', 'cmt-town');
insert into public.geo_entities (id, parent_id, kind, name, slug) values
  ('e0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000002', 'village', 'Cmt Village One', 'cmt-village-one'),
  ('e0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000002', 'village', 'Cmt Village Two', 'cmt-village-two');

update public.profiles set village_id = 'e0000000-0000-0000-0000-000000000003',
                           town_id    = 'e0000000-0000-0000-0000-000000000002'
 where id in ('d1111111-1111-1111-1111-111111111111'::uuid,
              'd2222222-2222-2222-2222-222222222222'::uuid);
update public.profiles set village_id = 'e0000000-0000-0000-0000-000000000004',
                           town_id    = 'e0000000-0000-0000-0000-000000000002'
 where id = 'd3333333-3333-3333-3333-333333333333'::uuid;

insert into public.posts (id, author_id, body, geo_id, visibility) values
  ('f0000000-0000-0000-0000-000000000001',
   'd1111111-1111-1111-1111-111111111111', 'Public post', null, 'public'),
  ('f0000000-0000-0000-0000-000000000002',
   'd1111111-1111-1111-1111-111111111111', 'Village post',
   'e0000000-0000-0000-0000-000000000003', 'community');

-- A reply on each.
insert into public.comments (id, post_id, author_id, body) values
  ('a0000000-0000-0000-0000-000000000001',
   'f0000000-0000-0000-0000-000000000001',
   'd2222222-2222-2222-2222-222222222222', 'Reply on the public post'),
  ('a0000000-0000-0000-0000-000000000002',
   'f0000000-0000-0000-0000-000000000002',
   'd2222222-2222-2222-2222-222222222222', 'Reply on the village post');

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

-- ===========================================================================
-- Comment visibility follows post visibility
-- ===========================================================================

select pg_temp.become_anon();
insert into public._tap_out(line) select is(
  (select count(*)::int from public.comments
    where id = 'a0000000-0000-0000-0000-000000000001'::uuid),
  1, 'a signed-out visitor can read a reply on a public post'
);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.comments
    where id = 'a0000000-0000-0000-0000-000000000002'::uuid),
  0, 'a signed-out visitor CANNOT read a reply on a community post'
);
reset role;

-- Outside the village: the post is hidden, so the reply must be too.
select pg_temp.become('d3333333-3333-3333-3333-333333333333'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.comments
    where id = 'a0000000-0000-0000-0000-000000000002'::uuid),
  0, 'a member outside the village CANNOT read that reply'
);

-- ...and cannot add one either.
insert into public._tap_out(line) select throws_ok(
  $$insert into public.comments (post_id, author_id, body)
    values ('f0000000-0000-0000-0000-000000000002',
            'd3333333-3333-3333-3333-333333333333', 'Sneaking in')$$,
  '42501', null,
  'a member outside the village CANNOT reply to that post'
);
reset role;

select pg_temp.become('d2222222-2222-2222-2222-222222222222'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.comments
    where id = 'a0000000-0000-0000-0000-000000000002'::uuid),
  1, 'a member of the village CAN read the reply'
);

-- Authorship is not a client claim here either.
insert into public._tap_out(line) select throws_ok(
  $$insert into public.comments (post_id, author_id, body)
    values ('f0000000-0000-0000-0000-000000000001',
            'd1111111-1111-1111-1111-111111111111', 'Posted as someone else')$$,
  '42501', null,
  'a member CANNOT reply as somebody else'
);
reset role;

-- ===========================================================================
-- Moderation
-- ===========================================================================

select pg_temp.become('d4444444-4444-4444-4444-444444444444'::uuid);
update public.comments
   set deleted_at = now(), body = 'moderator rewrote this'
 where id = 'a0000000-0000-0000-0000-000000000001'::uuid;
reset role;

insert into public._tap_out(line) select ok(
  (select deleted_at is not null from public.comments
    where id = 'a0000000-0000-0000-0000-000000000001'::uuid),
  'a moderator can remove a reply'
);
insert into public._tap_out(line) select is(
  (select body from public.comments
    where id = 'a0000000-0000-0000-0000-000000000001'::uuid),
  'Reply on the public post',
  'but CANNOT rewrite it'
);

-- ===========================================================================
-- Engagement counts
-- ===========================================================================

-- The public post had one reply, then it was removed: back to zero.
insert into public._tap_out(line) select is(
  (select comment_count from public.posts
    where id = 'f0000000-0000-0000-0000-000000000001'::uuid),
  0, 'removing a reply decrements the post comment count'
);

-- The village post still has its reply.
insert into public._tap_out(line) select is(
  (select comment_count from public.posts
    where id = 'f0000000-0000-0000-0000-000000000002'::uuid),
  1, 'a live reply is counted'
);

-- ===========================================================================
-- Reactions
-- ===========================================================================

select pg_temp.become('d2222222-2222-2222-2222-222222222222'::uuid);
insert into public.reactions (post_id, user_id, kind)
values ('f0000000-0000-0000-0000-000000000002',
        'd2222222-2222-2222-2222-222222222222', 'celebrate');
reset role;

insert into public._tap_out(line) select is(
  (select reaction_count from public.posts
    where id = 'f0000000-0000-0000-0000-000000000002'::uuid),
  1, 'reacting increments the post reaction count'
);

-- One reaction per person per post: a second is refused by the unique index,
-- so changing your mind must be an update rather than another row.
select pg_temp.become('d2222222-2222-2222-2222-222222222222'::uuid);
insert into public._tap_out(line) select throws_ok(
  $$insert into public.reactions (post_id, user_id, kind)
    values ('f0000000-0000-0000-0000-000000000002',
            'd2222222-2222-2222-2222-222222222222', 'like')$$,
  '23505', null,
  'a member cannot react twice to the same post'
);

-- Changing the kind does not change the total.
update public.reactions set kind = 'support'
 where post_id = 'f0000000-0000-0000-0000-000000000002'::uuid
   and user_id = 'd2222222-2222-2222-2222-222222222222'::uuid;
reset role;

insert into public._tap_out(line) select is(
  (select reaction_count from public.posts
    where id = 'f0000000-0000-0000-0000-000000000002'::uuid),
  1, 'changing which reaction you gave does not change the total'
);

-- Withdrawing a reaction is a real delete, unlike posts and comments: it is a
-- signal, not speech, and a tombstone would misstate what the member thinks.
select pg_temp.become('d2222222-2222-2222-2222-222222222222'::uuid);
delete from public.reactions
 where post_id = 'f0000000-0000-0000-0000-000000000002'::uuid
   and user_id = 'd2222222-2222-2222-2222-222222222222'::uuid;
reset role;

insert into public._tap_out(line) select is(
  (select reaction_count from public.posts
    where id = 'f0000000-0000-0000-0000-000000000002'::uuid),
  0, 'withdrawing a reaction decrements the count'
);

-- A member outside the village cannot react to a post they cannot see.
select pg_temp.become('d3333333-3333-3333-3333-333333333333'::uuid);
insert into public._tap_out(line) select throws_ok(
  $$insert into public.reactions (post_id, user_id, kind)
    values ('f0000000-0000-0000-0000-000000000002',
            'd3333333-3333-3333-3333-333333333333', 'like')$$,
  '42501', null,
  'a member outside the village CANNOT react to that post'
);
reset role;

-- ===========================================================================
-- Counter repair
-- ===========================================================================

-- Deliberately corrupt a counter, then prove the repair function fixes it.
update public.posts set comment_count = 99
 where id = 'f0000000-0000-0000-0000-000000000002'::uuid;

select public.recount_post_engagement('f0000000-0000-0000-0000-000000000002'::uuid);

insert into public._tap_out(line) select is(
  (select comment_count from public.posts
    where id = 'f0000000-0000-0000-0000-000000000002'::uuid),
  1, 'recount_post_engagement repairs a drifted counter'
);

-- ===========================================================================
-- Embeddability
--
-- PostgREST can only embed across a foreign key whose target is in the exposed
-- schema. Pointing author_id at auth.users made `author:author_id(...)` fail
-- with PGRST200 and took the entire feed query down -- not just the author's
-- name. Nothing in the SQL layer complained, because the key itself was valid.
-- These assertions make that mistake impossible to reintroduce quietly.
-- ===========================================================================

insert into public._tap_out(line) select is(
  (select confrelid::regclass::text from pg_constraint
    where conrelid = 'public.posts'::regclass and contype = 'f'
      and conkey = array[(select attnum from pg_attribute
                           where attrelid = 'public.posts'::regclass
                             and attname = 'author_id')]),
  'profiles',
  'posts.author_id references profiles, so the author can be embedded'
);

insert into public._tap_out(line) select is(
  (select confrelid::regclass::text from pg_constraint
    where conrelid = 'public.comments'::regclass and contype = 'f'
      and conkey = array[(select attnum from pg_attribute
                           where attrelid = 'public.comments'::regclass
                             and attname = 'author_id')]),
  'profiles',
  'comments.author_id references profiles for the same reason'
);

insert into public._tap_out(line) select * from finish();

select coalesce(
  (select string_agg(line, chr(10) order by at)
     from public._tap_out
    where line not like 'ok %'),
  'ALL ASSERTIONS PASSED'
) as result;
rollback;
