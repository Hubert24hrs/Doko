-- Ezike Oba :: post media
--
-- Run either way:
--   * locally:  supabase test db
--   * hosted:   paste this whole file into the Supabase SQL Editor
--               (requires: create extension if not exists pgtap with schema extensions;)
--
-- Images inherit their post's visibility, and only the post's author may
-- attach or remove one. A moderator removes the whole post instead: taking one
-- image out of somebody else's post is editing it, which moderation must never
-- do.

begin;

set local search_path = public, extensions, pg_temp;
select plan(19);

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
  ('11110000-1111-1111-1111-111111111111'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ma@example.com', '{"username":"med_a","full_name":"Med A"}'),
  ('22220000-2222-2222-2222-222222222222'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'mb@example.com', '{"username":"med_b","full_name":"Med B"}'),
  -- Outside the village the community post is scoped to.
  ('33330000-3333-3333-3333-333333333333'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'mc@example.com', '{"username":"med_c","full_name":"Med C"}'),
  ('44440000-4444-4444-4444-444444444444'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'mm@example.com', '{"username":"med_mod","full_name":"Med Mod"}');

insert into public.user_roles (user_id, role)
values ('44440000-4444-4444-4444-444444444444'::uuid, 'moderator');

insert into public.geo_entities (id, parent_id, kind, name, slug) values
  ('55550000-0000-0000-0000-000000000001', null, 'lga', 'Med LGA', 'med-lga');
insert into public.geo_entities (id, parent_id, kind, name, slug) values
  ('55550000-0000-0000-0000-000000000002', '55550000-0000-0000-0000-000000000001', 'town', 'Med Town', 'med-town');
insert into public.geo_entities (id, parent_id, kind, name, slug) values
  ('55550000-0000-0000-0000-000000000003', '55550000-0000-0000-0000-000000000002', 'village', 'Med Village One', 'med-village-one'),
  ('55550000-0000-0000-0000-000000000004', '55550000-0000-0000-0000-000000000002', 'village', 'Med Village Two', 'med-village-two');

update public.profiles set village_id = '55550000-0000-0000-0000-000000000003',
                           town_id    = '55550000-0000-0000-0000-000000000002'
 where id in ('11110000-1111-1111-1111-111111111111'::uuid,
              '22220000-2222-2222-2222-222222222222'::uuid);
update public.profiles set village_id = '55550000-0000-0000-0000-000000000004',
                           town_id    = '55550000-0000-0000-0000-000000000002'
 where id = '33330000-3333-3333-3333-333333333333'::uuid;

insert into public.posts (id, author_id, body, geo_id, visibility) values
  ('66660000-0000-0000-0000-000000000001',
   '11110000-1111-1111-1111-111111111111', 'Public post with photos', null, 'public'),
  ('66660000-0000-0000-0000-000000000002',
   '11110000-1111-1111-1111-111111111111', 'Village post with photos',
   '55550000-0000-0000-0000-000000000003', 'community');

insert into public.post_media (id, post_id, storage_path, mime_type, byte_size, alt_text) values
  ('77770000-0000-0000-0000-000000000001',
   '66660000-0000-0000-0000-000000000001',
   '66660000-0000-0000-0000-000000000001/aaaa0000-0000-0000-0000-000000000001.jpg',
   'image/jpeg', 12345, 'The village square'),
  ('77770000-0000-0000-0000-000000000002',
   '66660000-0000-0000-0000-000000000002',
   '66660000-0000-0000-0000-000000000002/aaaa0000-0000-0000-0000-000000000002.jpg',
   'image/jpeg', 23456, 'Village meeting');

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
-- Visibility follows the post
-- ===========================================================================

select pg_temp.become_anon();
insert into public._tap_out(line) select is(
  (select count(*)::int from public.post_media
    where id = '77770000-0000-0000-0000-000000000001'::uuid),
  1, 'a signed-out visitor can see an image on a public post'
);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.post_media
    where id = '77770000-0000-0000-0000-000000000002'::uuid),
  0, 'a signed-out visitor CANNOT see an image on a community post'
);
reset role;

select pg_temp.become('33330000-3333-3333-3333-333333333333'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.post_media
    where id = '77770000-0000-0000-0000-000000000002'::uuid),
  0, 'a member outside the village CANNOT see that image'
);
reset role;

select pg_temp.become('22220000-2222-2222-2222-222222222222'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.post_media
    where id = '77770000-0000-0000-0000-000000000002'::uuid),
  1, 'a member of the village CAN see it'
);
reset role;

-- ===========================================================================
-- Only the author attaches
-- ===========================================================================

select pg_temp.become('11110000-1111-1111-1111-111111111111'::uuid);
insert into public._tap_out(line) select lives_ok(
  $$insert into public.post_media (post_id, storage_path, mime_type, byte_size)
    values ('66660000-0000-0000-0000-000000000001',
            '66660000-0000-0000-0000-000000000001/bbbb0000-0000-0000-0000-000000000001.png',
            'image/png', 5000)$$,
  'the author can attach an image to their own post'
);
reset role;

-- Someone who can READ the post still cannot add to it.
select pg_temp.become('22220000-2222-2222-2222-222222222222'::uuid);
insert into public._tap_out(line) select throws_ok(
  $$insert into public.post_media (post_id, storage_path, mime_type, byte_size)
    values ('66660000-0000-0000-0000-000000000001',
            '66660000-0000-0000-0000-000000000001/cccc0000-0000-0000-0000-000000000001.png',
            'image/png', 5000)$$,
  '42501', null,
  'another member CANNOT attach an image to somebody else''s post'
);
reset role;

-- Not even a moderator.
select pg_temp.become('44440000-4444-4444-4444-444444444444'::uuid);
insert into public._tap_out(line) select throws_ok(
  $$insert into public.post_media (post_id, storage_path, mime_type, byte_size)
    values ('66660000-0000-0000-0000-000000000001',
            '66660000-0000-0000-0000-000000000001/dddd0000-0000-0000-0000-000000000001.png',
            'image/png', 5000)$$,
  '42501', null,
  'a moderator CANNOT add an image to a member''s post'
);
reset role;

-- ===========================================================================
-- Only the author detaches
-- ===========================================================================

create or replace function pg_temp.rows_detached_by(target uuid)
returns integer language plpgsql as $$
declare n integer;
begin
  delete from public.post_media where id = target;
  get diagnostics n = row_count;
  return n;
end $$;

select pg_temp.become('22220000-2222-2222-2222-222222222222'::uuid);
insert into public._tap_out(line) select is(
  pg_temp.rows_detached_by('77770000-0000-0000-0000-000000000001'::uuid),
  0, 'another member cannot detach an image'
);
reset role;

-- A moderator removes the whole post, never one image from it: removing an
-- image is editing the post, and moderation must not rewrite a member.
select pg_temp.become('44440000-4444-4444-4444-444444444444'::uuid);
insert into public._tap_out(line) select is(
  pg_temp.rows_detached_by('77770000-0000-0000-0000-000000000001'::uuid),
  0, 'a moderator cannot detach a single image either'
);
reset role;

select pg_temp.become('11110000-1111-1111-1111-111111111111'::uuid);
insert into public._tap_out(line) select is(
  pg_temp.rows_detached_by('77770000-0000-0000-0000-000000000001'::uuid),
  1, 'the author CAN detach their own image'
);
reset role;

-- ===========================================================================
-- The guard: only alt text is editable
-- ===========================================================================

select pg_temp.become('11110000-1111-1111-1111-111111111111'::uuid);
update public.post_media
   set alt_text = 'Corrected description',
       storage_path = '66660000-0000-0000-0000-000000000002/hijacked.jpg',
       byte_size = 999
 where id = '77770000-0000-0000-0000-000000000002'::uuid;
reset role;

insert into public._tap_out(line) select is(
  (select alt_text from public.post_media
    where id = '77770000-0000-0000-0000-000000000002'::uuid),
  'Corrected description',
  'the author can correct alt text'
);
insert into public._tap_out(line) select is(
  (select storage_path from public.post_media
    where id = '77770000-0000-0000-0000-000000000002'::uuid),
  '66660000-0000-0000-0000-000000000002/aaaa0000-0000-0000-0000-000000000002.jpg',
  'but CANNOT repoint the row at a different file'
);
insert into public._tap_out(line) select is(
  (select byte_size from public.post_media
    where id = '77770000-0000-0000-0000-000000000002'::uuid),
  23456,
  'and cannot rewrite the recorded size'
);

-- ===========================================================================
-- Constraints
-- ===========================================================================

insert into public._tap_out(line) select throws_ok(
  $$insert into public.post_media (post_id, storage_path, mime_type, byte_size)
    values ('66660000-0000-0000-0000-000000000001',
            '66660000-0000-0000-0000-000000000001/eeee0000-0000-0000-0000-000000000001.svg',
            'image/svg+xml', 1000)$$,
  '23514', null,
  'SVG is refused: it is a document that can carry script, not a picture'
);

insert into public._tap_out(line) select throws_ok(
  $$insert into public.post_media (post_id, storage_path, mime_type, byte_size)
    values ('66660000-0000-0000-0000-000000000001',
            '66660000-0000-0000-0000-000000000001/ffff0000-0000-0000-0000-000000000001.jpg',
            'image/jpeg', 9999999)$$,
  '23514', null,
  'a file above the 8 MB cap is refused'
);

-- The four-image limit, enforced by trigger rather than trusted to the client.
insert into public.post_media (post_id, storage_path, mime_type, byte_size) values
  ('66660000-0000-0000-0000-000000000001',
   '66660000-0000-0000-0000-000000000001/1111aaaa-0000-0000-0000-000000000001.jpg', 'image/jpeg', 100),
  ('66660000-0000-0000-0000-000000000001',
   '66660000-0000-0000-0000-000000000001/2222aaaa-0000-0000-0000-000000000002.jpg', 'image/jpeg', 100),
  ('66660000-0000-0000-0000-000000000001',
   '66660000-0000-0000-0000-000000000001/3333aaaa-0000-0000-0000-000000000003.jpg', 'image/jpeg', 100);

insert into public._tap_out(line) select is(
  (select count(*)::int from public.post_media
    where post_id = '66660000-0000-0000-0000-000000000001'::uuid),
  4, 'four images are allowed'
);

insert into public._tap_out(line) select throws_ok(
  $$insert into public.post_media (post_id, storage_path, mime_type, byte_size)
    values ('66660000-0000-0000-0000-000000000001',
            '66660000-0000-0000-0000-000000000001/4444aaaa-0000-0000-0000-000000000004.jpg',
            'image/jpeg', 100)$$,
  '23514', null,
  'a fifth image is refused by the database, not merely by the interface'
);

-- ===========================================================================
-- The storage path helper
-- ===========================================================================

insert into public._tap_out(line) select is(
  public.storage_path_post_id('66660000-0000-0000-0000-000000000001/photo.jpg'),
  '66660000-0000-0000-0000-000000000001'::uuid,
  'the post id is read from the first path segment'
);

insert into public._tap_out(line) select ok(
  public.storage_path_post_id('not-a-uuid/photo.jpg') is null,
  'a malformed path yields null, so it matches no storage policy and is denied'
);

insert into public._tap_out(line) select * from finish();

select coalesce(
  (select string_agg(line, chr(10) order by at)
     from public._tap_out
    where line not like 'ok %'),
  'ALL ASSERTIONS PASSED'
) as result;
rollback;
