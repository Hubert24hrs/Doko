-- Ezike Oba :: followers-only posts
--
-- Run either way:
--   * locally:  supabase test db
--   * hosted:   paste this whole file into the Supabase SQL Editor
--               (requires: create extension if not exists pgtap with schema extensions;)
--
-- REQUIRES migrations 012 AND 013 to have been applied, in that order and as
-- separate statement batches.
--
-- The point of this suite is not only that followers-only works, but that
-- comments, reactions and media follow it WITHOUT having been touched. All
-- three ask an EXISTS against posts rather than restating the visibility
-- rules; if that pattern holds, a third tier arrives for free. If it does not,
-- a followers-only post's replies leak, which is worse than the post leaking
-- because nobody would think to look.

begin;

set local search_path = public, extensions, pg_temp;
select plan(13);

create table public._tap_out (
  at   timestamptz not null default clock_timestamp(),
  line text
);
grant insert, select on public._tap_out to public;
alter table public._tap_out disable row level security;

-- ---------------------------------------------------------------------------
-- Fixtures: an author, a follower, and a stranger.
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values
  ('c1110000-1111-1111-1111-111111111111'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'foa@example.com', '{"username":"fo_author","full_name":"Fo Author"}'),
  ('c2220000-2222-2222-2222-222222222222'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'fof@example.com', '{"username":"fo_follower","full_name":"Fo Follower"}'),
  ('c3330000-3333-3333-3333-333333333333'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'fos@example.com', '{"username":"fo_stranger","full_name":"Fo Stranger"}');

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

-- The follower follows the author. The stranger does not.
select pg_temp.become('c2220000-2222-2222-2222-222222222222'::uuid);
insert into public.follows (follower_id, following_id)
values ('c2220000-2222-2222-2222-222222222222',
        'c1110000-1111-1111-1111-111111111111');
reset role;

-- A followers-only post, plus a public one as a control.
insert into public.posts (id, author_id, body, visibility) values
  ('c9990000-0000-0000-0000-000000000001',
   'c1110000-1111-1111-1111-111111111111', 'Only my followers', 'followers'),
  ('c9990000-0000-0000-0000-000000000002',
   'c1110000-1111-1111-1111-111111111111', 'Anyone at all', 'public');

-- A reply and an image on the followers-only post, to prove they inherit.
insert into public.comments (id, post_id, author_id, body) values
  ('c8880000-0000-0000-0000-000000000001',
   'c9990000-0000-0000-0000-000000000001',
   'c1110000-1111-1111-1111-111111111111', 'A reply under a followers-only post');

insert into public.post_media (id, post_id, storage_path, mime_type, byte_size) values
  ('c7770000-0000-0000-0000-000000000001',
   'c9990000-0000-0000-0000-000000000001',
   'c9990000-0000-0000-0000-000000000001/aaaa1111-0000-0000-0000-000000000001.jpg',
   'image/jpeg', 4242);

-- ===========================================================================
-- The post itself
-- ===========================================================================

select pg_temp.become_anon();
insert into public._tap_out(line) select is(
  (select count(*)::int from public.posts
    where id = 'c9990000-0000-0000-0000-000000000001'::uuid),
  0, 'a signed-out visitor CANNOT read a followers-only post'
);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.posts
    where id = 'c9990000-0000-0000-0000-000000000002'::uuid),
  1, 'but the public control post is still readable'
);
reset role;

select pg_temp.become('c3330000-3333-3333-3333-333333333333'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.posts
    where id = 'c9990000-0000-0000-0000-000000000001'::uuid),
  0, 'a signed-in stranger who does not follow CANNOT read it'
);
reset role;

select pg_temp.become('c2220000-2222-2222-2222-222222222222'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.posts
    where id = 'c9990000-0000-0000-0000-000000000001'::uuid),
  1, 'a follower CAN read it'
);
reset role;

select pg_temp.become('c1110000-1111-1111-1111-111111111111'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.posts
    where id = 'c9990000-0000-0000-0000-000000000001'::uuid),
  1, 'the author can read their own, without following themselves'
);
reset role;

-- ===========================================================================
-- Inheritance: replies, reactions and images were NOT modified for this tier
-- ===========================================================================

select pg_temp.become_anon();
insert into public._tap_out(line) select is(
  (select count(*)::int from public.comments
    where id = 'c8880000-0000-0000-0000-000000000001'::uuid),
  0, 'a reply under a followers-only post is hidden from the public'
);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.post_media
    where id = 'c7770000-0000-0000-0000-000000000001'::uuid),
  0, 'and so is its image'
);
reset role;

select pg_temp.become('c3330000-3333-3333-3333-333333333333'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.comments
    where id = 'c8880000-0000-0000-0000-000000000001'::uuid),
  0, 'a non-follower cannot read the reply either'
);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.post_media
    where id = 'c7770000-0000-0000-0000-000000000001'::uuid),
  0, 'nor the image'
);

-- A non-follower must not be able to reply to what they cannot see.
insert into public._tap_out(line) select throws_ok(
  $$insert into public.comments (post_id, author_id, body)
    values ('c9990000-0000-0000-0000-000000000001',
            'c3330000-3333-3333-3333-333333333333', 'Sneaking in')$$,
  '42501', null,
  'a non-follower CANNOT reply to a followers-only post'
);
reset role;

select pg_temp.become('c2220000-2222-2222-2222-222222222222'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.comments
    where id = 'c8880000-0000-0000-0000-000000000001'::uuid),
  1, 'a follower CAN read the reply'
);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.post_media
    where id = 'c7770000-0000-0000-0000-000000000001'::uuid),
  1, 'and the image'
);
reset role;

-- ===========================================================================
-- Unfollowing revokes access, immediately and without any extra bookkeeping
-- ===========================================================================

select pg_temp.become('c2220000-2222-2222-2222-222222222222'::uuid);
delete from public.follows
 where follower_id = 'c2220000-2222-2222-2222-222222222222'::uuid
   and following_id = 'c1110000-1111-1111-1111-111111111111'::uuid;

insert into public._tap_out(line) select is(
  (select count(*)::int from public.posts
    where id = 'c9990000-0000-0000-0000-000000000001'::uuid),
  0, 'unfollowing immediately revokes access to the post'
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
