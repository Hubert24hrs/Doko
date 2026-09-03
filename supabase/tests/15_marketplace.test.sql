-- Ezike Oba :: marketplace
--
-- Run either way:
--   * locally:  supabase test db
--   * hosted:   paste this whole file into the Supabase SQL Editor
--               (requires: create extension if not exists pgtap with schema extensions;)
--
-- Marketplace reuses jobs' shape almost entirely -- see 14_jobs for the
-- fuller reasoning behind the public-listing/private-contact split, which is
-- asserted again here rather than assumed to still hold. The one genuinely
-- new thing this suite has to prove is the leak migration 014 first found and
-- closed for posts, written correctly here from the start: a listing inside a
-- PRIVATE group, left at the column default visibility='public', must be
-- invisible to the public.

begin;

set local search_path = public, extensions, pg_temp;
select plan(32);

create table public._tap_out (
  at   timestamptz not null default clock_timestamp(),
  line text
);
grant insert, select on public._tap_out to public;
alter table public._tap_out disable row level security;

create table public._tap_fixture (
  name  text primary key,
  value uuid
);
grant select on public._tap_fixture to public;
alter table public._tap_fixture disable row level security;

-- ---------------------------------------------------------------------------
-- Fixtures: a seller, a buyer, an outsider, and a moderator.
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values
  ('d1110000-1111-1111-1111-111111111111'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'mk-s@example.com', '{"username":"mk_seller","full_name":"Mk Seller"}'),
  ('d2220000-2222-2222-2222-222222222222'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'mk-b@example.com', '{"username":"mk_buyer","full_name":"Mk Buyer"}'),
  ('d3330000-3333-3333-3333-333333333333'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'mk-o@example.com', '{"username":"mk_outsider","full_name":"Mk Outsider"}'),
  ('d4440000-4444-4444-4444-444444444444'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'mk-m@example.com', '{"username":"mk_mod","full_name":"Mk Mod"}');

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

update public.profiles set visibility = 'private'
 where id in (
   'd1110000-1111-1111-1111-111111111111'::uuid,
   'd2220000-2222-2222-2222-222222222222'::uuid,
   'd3330000-3333-3333-3333-333333333333'::uuid,
   'd4440000-4444-4444-4444-444444444444'::uuid
 );

insert into public.user_roles (user_id, role) values
  ('d4440000-4444-4444-4444-444444444444'::uuid, 'moderator')
on conflict do nothing;

-- A private group, for the leak assertion.
select pg_temp.become('d1110000-1111-1111-1111-111111111111'::uuid);
insert into public.groups (id, name, slug, visibility, created_by) values
  ('de000000-0000-0000-0000-000000000001', 'Traders Only', 'traders-only',
   'private', 'd1110000-1111-1111-1111-111111111111');
reset role;

insert into public._tap_fixture (name, value)
values ('group', 'de000000-0000-0000-0000-000000000001');

-- ===========================================================================
-- Posting
-- ===========================================================================

select pg_temp.become('d1110000-1111-1111-1111-111111111111'::uuid);

insert into public._tap_out(line) select lives_ok(
  $$insert into public.marketplace_listings
      (id, title, description, category, condition, seller_id)
    values ('de100000-0000-0000-0000-000000000001', 'Standing fan',
            'Barely used, two speeds, works perfectly.', 'appliances', 'good',
            'd1110000-1111-1111-1111-111111111111')$$,
  'a member can post a listing'
);

-- No CHECK requires a price. Unlike a job's pay figure, a listing with no
-- price at all is a normal listing: "ask" is a real answer here.
insert into public._tap_out(line) select ok(
  (select price is null from public.marketplace_listings
    where id = 'de100000-0000-0000-0000-000000000001'::uuid),
  'a listing needs no price at all'
);

insert into public._tap_out(line) select throws_ok(
  $$insert into public.marketplace_listings (title, description, seller_id, price)
    values ('Free item', 'Giving this away.',
            'd1110000-1111-1111-1111-111111111111', 0)$$,
  '23514', null,
  'but a price of zero cannot be stored -- a free item belongs in the title'
);

reset role;

insert into public._tap_fixture (name, value)
values ('listing', 'de100000-0000-0000-0000-000000000001');

select pg_temp.become('d2220000-2222-2222-2222-222222222222'::uuid);
insert into public._tap_out(line) select throws_ok(
  $$insert into public.marketplace_listings (title, description, seller_id)
    values ('Not mine', 'Posted in another member''s name.',
            'd1110000-1111-1111-1111-111111111111')$$,
  '42501', null,
  'a member cannot post a listing in somebody else''s name'
);
reset role;

-- ===========================================================================
-- Contact details are OPTIONAL here, unlike a job's
-- ===========================================================================

select pg_temp.become_anon();
insert into public._tap_out(line) select is(
  (select count(*)::int from public.marketplace_listings
    where id = 'de100000-0000-0000-0000-000000000001'::uuid),
  1, 'a signed-out visitor can read the listing itself'
);

insert into public._tap_out(line) select is(
  (select count(*)::int from public.listing_contacts
    where listing_id = 'de100000-0000-0000-0000-000000000001'::uuid),
  0, 'and there is no contact row to read yet, because none was given'
);
reset role;

-- The seller adds one later. Same split as job_contacts: no anon read at all.
select pg_temp.become('d1110000-1111-1111-1111-111111111111'::uuid);
insert into public.listing_contacts (listing_id, contact_phone)
values ('de100000-0000-0000-0000-000000000001', '0803 000 0000');
reset role;

select pg_temp.become_anon();
insert into public._tap_out(line) select is(
  (select count(*)::int from public.listing_contacts
    where listing_id = 'de100000-0000-0000-0000-000000000001'::uuid),
  0, 'a signed-out visitor still cannot read the phone number once one exists'
);

insert into public._tap_out(line) select is(
  (select count(*)::int
     from public.marketplace_listings l
     join public.listing_contacts c on c.listing_id = l.id
    where l.id = 'de100000-0000-0000-0000-000000000001'::uuid),
  0, 'nor reach it by joining from the listing they CAN read'
);
reset role;

select pg_temp.become('d2220000-2222-2222-2222-222222222222'::uuid);
insert into public._tap_out(line) select is(
  (select contact_phone from public.listing_contacts
    where listing_id = 'de100000-0000-0000-0000-000000000001'::uuid),
  '0803 000 0000', 'while a signed-in member CAN read it'
);
reset role;

-- Only the seller may write to it -- refused by the POLICY, not the primary
-- key, exactly the distinction 10_messages and 14_jobs both had to correct
-- for after getting it backwards the first time.
select pg_temp.become('d2220000-2222-2222-2222-222222222222'::uuid);
insert into public._tap_out(line) select throws_ok(
  $$insert into public.listing_contacts (listing_id, contact_phone)
    select value, '0000 000 0000' from public._tap_fixture where name = 'listing'$$,
  '42501', null,
  'a member who is not the seller cannot attach contact details'
);
reset role;

select pg_temp.become('d1110000-1111-1111-1111-111111111111'::uuid);
insert into public._tap_out(line) select throws_ok(
  $$insert into public.listing_contacts (listing_id, contact_phone)
    select value, '0000 000 0000' from public._tap_fixture where name = 'listing'$$,
  '23505', null,
  'and even the seller cannot attach a second set'
);
reset role;

-- ===========================================================================
-- THE leak assertion: a private group listing at the visibility DEFAULT
-- ===========================================================================

select pg_temp.become('d1110000-1111-1111-1111-111111111111'::uuid);
insert into public.marketplace_listings (id, title, description, seller_id, group_id)
values ('de100000-0000-0000-0000-000000000002', 'Traders-only tools',
        'Only for members of the trading group.',
        'd1110000-1111-1111-1111-111111111111',
        'de000000-0000-0000-0000-000000000001');
reset role;

insert into public._tap_fixture (name, value)
values ('private_listing', 'de100000-0000-0000-0000-000000000002');

select pg_temp.become_anon();
insert into public._tap_out(line) select is(
  (select count(*)::int from public.marketplace_listings
    where id = 'de100000-0000-0000-0000-000000000002'::uuid),
  0, 'a private group listing is NOT public, despite visibility=public'
);
reset role;

select pg_temp.become('d3330000-3333-3333-3333-333333333333'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.marketplace_listings
    where id = 'de100000-0000-0000-0000-000000000002'::uuid),
  0, 'nor visible to a signed-in outsider'
);

insert into public._tap_out(line) select throws_ok(
  $$insert into public.marketplace_listings (title, description, seller_id, group_id)
    select 'Gatecrash', 'Posted by an outsider.',
           'd3330000-3333-3333-3333-333333333333', value
      from public._tap_fixture where name = 'group'$$,
  '42501', null,
  'and an outsider cannot post into a group they are not in'
);
reset role;

select pg_temp.become('d1110000-1111-1111-1111-111111111111'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.marketplace_listings
    where id = 'de100000-0000-0000-0000-000000000002'::uuid),
  1, 'while its seller sees it fine'
);
reset role;

-- ===========================================================================
-- Photos
-- ===========================================================================

select pg_temp.become('d1110000-1111-1111-1111-111111111111'::uuid);
insert into public._tap_out(line) select lives_ok(
  $$insert into public.listing_media (listing_id, storage_path, mime_type, byte_size)
    select value, value || '/11111111-1111-1111-1111-111111111111.jpg',
           'image/jpeg', 1000
      from public._tap_fixture where name = 'listing'$$,
  'the seller can attach a photo'
);
reset role;

select pg_temp.become('d2220000-2222-2222-2222-222222222222'::uuid);
insert into public._tap_out(line) select throws_ok(
  $$insert into public.listing_media (listing_id, storage_path, mime_type, byte_size)
    select value, value || '/22222222-2222-2222-2222-222222222222.jpg',
           'image/jpeg', 1000
      from public._tap_fixture where name = 'listing'$$,
  '42501', null,
  'a buyer cannot attach a photo to the seller''s listing'
);
reset role;

-- Six is the limit -- five more, to reach it exactly.
select pg_temp.become('d1110000-1111-1111-1111-111111111111'::uuid);
insert into public.listing_media (listing_id, storage_path, mime_type, byte_size)
select value, value || '/' || gen_random_uuid()::text || '.jpg', 'image/jpeg', 1000
  from public._tap_fixture, generate_series(1, 5)
 where name = 'listing';
reset role;

insert into public._tap_out(line) select is(
  (select count(*)::int from public.listing_media
    where listing_id = 'de100000-0000-0000-0000-000000000001'::uuid),
  6, 'a listing can carry six photos'
);

select pg_temp.become('d1110000-1111-1111-1111-111111111111'::uuid);
insert into public._tap_out(line) select throws_ok(
  $$insert into public.listing_media (listing_id, storage_path, mime_type, byte_size)
    select value, value || '/33333333-3333-3333-3333-333333333333.jpg',
           'image/jpeg', 1000
      from public._tap_fixture where name = 'listing'$$,
  '23514', null,
  'but not a seventh'
);
reset role;

select pg_temp.become_anon();
insert into public._tap_out(line) select is(
  (select count(*)::int from public.listing_media
    where listing_id = 'de100000-0000-0000-0000-000000000001'::uuid),
  6, 'a signed-out visitor can see the photos on a public listing'
);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.listing_media
    where listing_id = 'de100000-0000-0000-0000-000000000002'::uuid),
  0, 'but not the photos on a private group listing'
);
reset role;

-- ===========================================================================
-- Status, and the guard trigger
-- ===========================================================================

select pg_temp.become('d1110000-1111-1111-1111-111111111111'::uuid);
update public.marketplace_listings set status = 'sold'
 where id = 'de100000-0000-0000-0000-000000000001'::uuid;
reset role;

insert into public._tap_out(line) select is(
  (select status::text from public.marketplace_listings
    where id = 'de100000-0000-0000-0000-000000000001'::uuid),
  'sold', 'the seller can mark their listing sold'
);

select pg_temp.become_anon();
insert into public._tap_out(line) select is(
  (select count(*)::int from public.marketplace_listings
    where id = 'de100000-0000-0000-0000-000000000001'::uuid),
  1, 'and a sold listing stays visible, unlike a removed one'
);
reset role;

-- A moderator may remove, never rewrite -- and never decide something is
-- sold on the seller's behalf either. The only lever moderation has is
-- deleted_at.
select pg_temp.become('d4440000-4444-4444-4444-444444444444'::uuid);
update public.marketplace_listings
   set title = 'Moderator rewrote this',
       price = 1,
       status = 'available',
       deleted_at = now()
 where id = 'de100000-0000-0000-0000-000000000001'::uuid;
reset role;

insert into public._tap_out(line) select is(
  (select title from public.marketplace_listings
    where id = 'de100000-0000-0000-0000-000000000001'::uuid),
  'Standing fan', 'a moderator cannot rewrite a listing'
);

insert into public._tap_out(line) select ok(
  (select price is null from public.marketplace_listings
    where id = 'de100000-0000-0000-0000-000000000001'::uuid),
  'nor invent a price for it'
);

insert into public._tap_out(line) select is(
  (select status::text from public.marketplace_listings
    where id = 'de100000-0000-0000-0000-000000000001'::uuid),
  'sold', 'nor reopen it as available'
);

insert into public._tap_out(line) select ok(
  (select deleted_at is not null from public.marketplace_listings
    where id = 'de100000-0000-0000-0000-000000000001'::uuid),
  'but CAN take it down, which is what moderation is for'
);

select pg_temp.become_anon();
insert into public._tap_out(line) select is(
  (select count(*)::int from public.marketplace_listings
    where id = 'de100000-0000-0000-0000-000000000001'::uuid),
  0, 'and a removed listing disappears for the public'
);
reset role;

select pg_temp.become('d1110000-1111-1111-1111-111111111111'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.marketplace_listings
    where id = 'de100000-0000-0000-0000-000000000001'::uuid),
  1, 'while its seller still sees that it was removed'
);
reset role;

-- ===========================================================================
-- Helpers
-- ===========================================================================

select pg_temp.become('d3330000-3333-3333-3333-333333333333'::uuid);
insert into public._tap_out(line) select ok(
  public.can_see_listing('de100000-0000-0000-0000-000000000002'::uuid) = false,
  'can_see_listing refuses an outsider for a private group listing'
);
insert into public._tap_out(line) select ok(
  public.owns_listing('de100000-0000-0000-0000-000000000002'::uuid) = false,
  'and owns_listing agrees the outsider owns nothing'
);
reset role;

select pg_temp.become('d1110000-1111-1111-1111-111111111111'::uuid);
insert into public._tap_out(line) select ok(
  public.owns_listing('de100000-0000-0000-0000-000000000002'::uuid),
  'while the seller owns their own'
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
