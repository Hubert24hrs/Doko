-- Ezike Oba :: advertising
--
-- Run either way:
--   * locally:  supabase test db
--   * hosted:   paste this whole file into the Supabase SQL Editor
--               (requires: create extension if not exists pgtap with schema extensions;)
--
-- An advert is the one thing on this platform a member pays to put in front of
-- everybody else, so the question worth asking is who decides that it runs.
--
-- Writing this found that the advertiser did. ad_campaigns_update admits
-- `advertiser_id = auth.uid()` and migration 025 added no guard trigger, so an
-- advertiser could set status = 'active' on their own row over PostgREST --
-- putting an unapproved, unpaid advert into the feed and making both the
-- moderation queue and the payment gate decorative. The migration's own
-- comment said advertisers may only update "non-status fields or pause active
-- ads"; nothing enforced it.
--
-- Migration 030 adds the trigger. The assertions below hold both halves: an
-- advertiser may still pause and resume their own advert, and may not approve
-- it, pay for it, or type in its own view count.

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
-- Fixtures: an advertiser, a bystander, and a moderator.
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values
  ('ad110000-0000-1111-1111-111111111111'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ad-a@example.com', '{"username":"ad_advertiser","full_name":"Ad Advertiser"}'),
  ('ad220000-0000-2222-2222-222222222222'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ad-b@example.com', '{"username":"ad_other","full_name":"Ad Other"}'),
  ('ad330000-0000-3333-3333-333333333333'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ad-m@example.com', '{"username":"ad_mod","full_name":"Ad Mod"}');

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

-- `reset role` restores the ROLE and nothing else. `set local
-- request.jwt.claims` survives it, so after pg_temp.become(somebody) auth.uid()
-- keeps answering with that somebody for the rest of the transaction -- even
-- once the role is back to the editor's.
--
-- That matters here because the guard triggers on ad_campaigns and
-- community_projects branch on auth.uid(). The platform's own calls carry no
-- `sub` claim at all: the Paystack webhook uses the service role, whose JWT has
-- no subject, so auth.uid() is NULL. A suite that only resets the role runs the
-- platform's RPCs through the guard's MEMBER branch while reading as though it
-- had tested the platform one -- which is how "the advert is marked paid" failed
-- against a migration that was, in fact, correct.
create or replace function pg_temp.become_platform()
returns void language plpgsql as $bp$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $bp$;


insert into public.user_roles (user_id, role) values
  ('ad330000-0000-3333-3333-333333333333'::uuid, 'moderator')
on conflict do nothing;

-- ===========================================================================
-- Creating a campaign
-- ===========================================================================

select pg_temp.become('ad110000-0000-1111-1111-111111111111'::uuid);

insert into public._tap_out(line) select lives_ok(
  $$insert into public.ad_campaigns
      (id, advertiser_id, title, description, placement)
    values ('ada00000-0000-0000-0000-000000000001',
            'ad110000-0000-1111-1111-111111111111',
            'Okeke Electronics', 'Fridges, fans and generators at fair prices.',
            'feed_sponsored')$$,
  'a member can create an ad campaign'
);

-- Every advert starts in the queue. Creating one already active would skip
-- moderation at the door.
insert into public._tap_out(line) select is(
  (select status from public.ad_campaigns
    where id = 'ada00000-0000-0000-0000-000000000001'::uuid),
  'pending', 'and it starts pending, in the moderation queue'
);

insert into public._tap_out(line) select throws_ok(
  $$insert into public.ad_campaigns
      (advertiser_id, title, description, placement, status)
    values ('ad110000-0000-1111-1111-111111111111',
            'Straight to air', 'Skipping the queue entirely.',
            'feed_sponsored', 'active')$$,
  '42501', null,
  'a campaign cannot be created already active'
);

insert into public._tap_out(line) select throws_ok(
  $$insert into public.ad_campaigns
      (advertiser_id, title, description, placement)
    values ('ad220000-0000-2222-2222-222222222222',
            'Not mine', 'Posted in another member''s name.',
            'feed_sponsored')$$,
  '42501', null,
  'nor created in somebody else''s name'
);

insert into public._tap_out(line) select throws_ok(
  $$insert into public.ad_campaigns
      (advertiser_id, title, description, placement, target_url)
    values ('ad110000-0000-1111-1111-111111111111',
            'Bad link', 'Carrying a javascript: address.',
            'feed_sponsored', 'javascript:alert(1)')$$,
  '23514', null,
  'and a javascript: target cannot be stored at all'
);
reset role;

-- ===========================================================================
-- THE hole: an advertiser approving their own advert
-- ===========================================================================

select pg_temp.become('ad110000-0000-1111-1111-111111111111'::uuid);
update public.ad_campaigns set status = 'active'
 where id = 'ada00000-0000-0000-0000-000000000001'::uuid;
reset role;

insert into public._tap_out(line) select is(
  (select status from public.ad_campaigns
    where id = 'ada00000-0000-0000-0000-000000000001'::uuid),
  'pending',
  'an advertiser CANNOT approve their own advert'
);

select pg_temp.become('ad110000-0000-1111-1111-111111111111'::uuid);
update public.ad_campaigns set status = 'approved'
 where id = 'ada00000-0000-0000-0000-000000000001'::uuid;
reset role;

insert into public._tap_out(line) select is(
  (select status from public.ad_campaigns
    where id = 'ada00000-0000-0000-0000-000000000001'::uuid),
  'pending', 'nor mark it approved'
);

-- Nor pay for it by declaring it paid.
select pg_temp.become('ad110000-0000-1111-1111-111111111111'::uuid);
update public.ad_campaigns set payment_status = 'paid'
 where id = 'ada00000-0000-0000-0000-000000000001'::uuid;
reset role;
select pg_temp.become_platform();

insert into public._tap_out(line) select is(
  (select payment_status from public.ad_campaigns
    where id = 'ada00000-0000-0000-0000-000000000001'::uuid),
  'unpaid', 'nor declare it paid for'
);

-- ...but the PLATFORM must still be able to, and this assertion is here
-- because its absence hid a defect. Migration 030's guard restored
-- payment_status for anybody whose auth.uid() was not staff -- and a service
-- role's auth.uid() is NULL, so confirm_ad_payment() was silently prevented
-- from marking an advert paid. The suite asserted only that an advertiser
-- COULD NOT, never that the platform COULD, which is a rule with no test:
-- exactly the shape this whole exercise exists to find. Migration 032 fixed
-- the guard; this holds it fixed.
insert into public.payments (user_id, reference, amount_kobo, purpose, target_id)
values ('ad110000-0000-1111-1111-111111111111', 'ad-payment-0001', 500000,
        'ad_campaign', 'ada00000-0000-0000-0000-000000000001');

insert into public._tap_out(line) select ok(
  public.confirm_ad_payment('ad-payment-0001', 'ps-ad-ref', 'card', now()),
  'the platform can confirm an advert''s payment'
);

insert into public._tap_out(line) select is(
  (select payment_status from public.ad_campaigns
    where id = 'ada00000-0000-0000-0000-000000000001'::uuid),
  'paid', 'and the advert is marked paid when it does'
);

-- Nor invent an audience for it.
select pg_temp.become('ad110000-0000-1111-1111-111111111111'::uuid);
update public.ad_campaigns
   set impressions_count = 50000, clicks_count = 4000
 where id = 'ada00000-0000-0000-0000-000000000001'::uuid;
reset role;

insert into public._tap_out(line) select is(
  (select impressions_count from public.ad_campaigns
    where id = 'ada00000-0000-0000-0000-000000000001'::uuid),
  0, 'nor type in its view count'
);

insert into public._tap_out(line) select is(
  (select clicks_count from public.ad_campaigns
    where id = 'ada00000-0000-0000-0000-000000000001'::uuid),
  0, 'nor its clicks'
);

-- Nor write the queue's verdict for it.
select pg_temp.become('ad110000-0000-1111-1111-111111111111'::uuid);
update public.ad_campaigns set rejection_reason = 'Approved by me'
 where id = 'ada00000-0000-0000-0000-000000000001'::uuid;
reset role;

insert into public._tap_out(line) select ok(
  (select rejection_reason is null from public.ad_campaigns
    where id = 'ada00000-0000-0000-0000-000000000001'::uuid),
  'nor write the moderator''s reason for them'
);

-- What they CAN still do is edit their own copy, which is the whole point of
-- the update policy existing at all.
select pg_temp.become('ad110000-0000-1111-1111-111111111111'::uuid);
update public.ad_campaigns set title = 'Okeke Electronics, Ogrute'
 where id = 'ada00000-0000-0000-0000-000000000001'::uuid;
reset role;

insert into public._tap_out(line) select is(
  (select title from public.ad_campaigns
    where id = 'ada00000-0000-0000-0000-000000000001'::uuid),
  'Okeke Electronics, Ogrute',
  'while they CAN still edit their own advert''s wording'
);

-- ===========================================================================
-- Moderation, and pausing
-- ===========================================================================

select pg_temp.become('ad330000-0000-3333-3333-333333333333'::uuid);
update public.ad_campaigns set status = 'active'
 where id = 'ada00000-0000-0000-0000-000000000001'::uuid;
reset role;

insert into public._tap_out(line) select is(
  (select status from public.ad_campaigns
    where id = 'ada00000-0000-0000-0000-000000000001'::uuid),
  'active', 'a MODERATOR can approve it, which is what the queue is for'
);

-- Pausing is the one status change an advertiser keeps: it takes the advert
-- DOWN, which needs no permission, and it was the documented intent.
select pg_temp.become('ad110000-0000-1111-1111-111111111111'::uuid);
update public.ad_campaigns set status = 'paused'
 where id = 'ada00000-0000-0000-0000-000000000001'::uuid;
reset role;

insert into public._tap_out(line) select is(
  (select status from public.ad_campaigns
    where id = 'ada00000-0000-0000-0000-000000000001'::uuid),
  'paused', 'an advertiser CAN pause their own running advert'
);

-- And resume it, because that only returns it to a state staff already
-- approved it into.
select pg_temp.become('ad110000-0000-1111-1111-111111111111'::uuid);
update public.ad_campaigns set status = 'active'
 where id = 'ada00000-0000-0000-0000-000000000001'::uuid;
reset role;

insert into public._tap_out(line) select is(
  (select status from public.ad_campaigns
    where id = 'ada00000-0000-0000-0000-000000000001'::uuid),
  'active', 'and resume it afterwards'
);

-- But resuming is not a back door to approval: a PENDING advert paused and
-- resumed must not come out active.
select pg_temp.become('ad110000-0000-1111-1111-111111111111'::uuid);
insert into public.ad_campaigns
  (id, advertiser_id, title, description, placement)
values ('ada00000-0000-0000-0000-000000000002',
        'ad110000-0000-1111-1111-111111111111',
        'Second advert', 'Testing the pause route into approval.',
        'feed_sponsored');
update public.ad_campaigns set status = 'paused'
 where id = 'ada00000-0000-0000-0000-000000000002'::uuid;
update public.ad_campaigns set status = 'active'
 where id = 'ada00000-0000-0000-0000-000000000002'::uuid;
reset role;

insert into public._tap_out(line) select is(
  (select status from public.ad_campaigns
    where id = 'ada00000-0000-0000-0000-000000000002'::uuid),
  'pending',
  'a pending advert cannot reach active by way of paused'
);

-- ===========================================================================
-- Who sees an advert
-- ===========================================================================

select pg_temp.become_anon();
insert into public._tap_out(line) select is(
  (select count(*)::int from public.ad_campaigns
    where id = 'ada00000-0000-0000-0000-000000000001'::uuid),
  1, 'a signed-out visitor sees an ACTIVE advert'
);

insert into public._tap_out(line) select is(
  (select count(*)::int from public.ad_campaigns
    where id = 'ada00000-0000-0000-0000-000000000002'::uuid),
  0, 'and does not see one still waiting in the queue'
);
reset role;

select pg_temp.become('ad220000-0000-2222-2222-222222222222'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.ad_campaigns
    where id = 'ada00000-0000-0000-0000-000000000002'::uuid),
  0, 'nor does another member'
);
reset role;

select pg_temp.become('ad110000-0000-1111-1111-111111111111'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.ad_campaigns
    where id = 'ada00000-0000-0000-0000-000000000002'::uuid),
  1, 'while its own advertiser can watch it wait'
);
reset role;

select pg_temp.become('ad330000-0000-3333-3333-333333333333'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.ad_campaigns
    where id = 'ada00000-0000-0000-0000-000000000002'::uuid),
  1, 'and a moderator can, or there would be no queue to work'
);
reset role;

-- An advert whose run has ended stops showing without anybody changing it.
select pg_temp.become('ad330000-0000-3333-3333-333333333333'::uuid);
update public.ad_campaigns
   set starts_at = now() - interval '60 days',
       ends_at   = now() - interval '30 days'
 where id = 'ada00000-0000-0000-0000-000000000001'::uuid;
reset role;

select pg_temp.become_anon();
insert into public._tap_out(line) select is(
  (select count(*)::int from public.ad_campaigns
    where id = 'ada00000-0000-0000-0000-000000000001'::uuid),
  0, 'an advert past its end date stops showing on its own'
);
reset role;

-- ===========================================================================
-- The counters
-- ===========================================================================

-- These are SECURITY DEFINER and deliberately callable by ordinary viewers:
-- an impression is recorded when somebody's browser renders the advert, so
-- restricting EXECUTE would break the feature rather than secure it.
--
-- What they must not do is count an advert nobody is being shown.
select pg_temp.become('ad220000-0000-2222-2222-222222222222'::uuid);
select public.increment_ad_impressions('ada00000-0000-0000-0000-000000000002'::uuid);
reset role;

insert into public._tap_out(line) select is(
  (select impressions_count from public.ad_campaigns
    where id = 'ada00000-0000-0000-0000-000000000002'::uuid),
  0, 'a pending advert records no impressions'
);

insert into public._tap_out(line) select * from finish();

select coalesce(
  (select string_agg(line, chr(10) order by at)
     from public._tap_out
    where line not like 'ok %'),
  'ALL ASSERTIONS PASSED'
) as result;
rollback;
