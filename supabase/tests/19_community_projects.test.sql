-- Ezike Oba :: community projects and diaspora crowdfunding
--
-- Run either way:
--   * locally:  supabase test db
--   * hosted:   paste this whole file into the Supabase SQL Editor
--               (requires: create extension if not exists pgtap with schema extensions;)
--
-- This is the feature where somebody in Houston sends money home for a
-- borehole they will never see. Everything they have to go on is what the page
-- says, so the assertions here are about whether the page can lie.
--
-- Writing it found that it could. community_projects_update admits
-- `creator_id = auth.uid()` and migration 027 added no guard trigger, so a
-- creator could set their own status to 'active' -- skipping review -- and
-- could type raised_amount_naira and donors_count in by hand. A progress bar
-- reading "4,800,000 naira raised by 190 donors" is the most persuasive thing
-- on a crowdfunding page, and it was writable by the person it persuades
-- people to pay.
--
-- Migration 031 closes it. Together with 028 -- which restricted
-- confirm_project_donation() to the service role and made it derive the amount
-- from the payments row instead of from its caller -- the tallies can now move
-- only when money actually arrived.

begin;

set local search_path = public, extensions, pg_temp;
select plan(24);

create table public._tap_out (
  at   timestamptz not null default clock_timestamp(),
  line text
);
grant insert, select on public._tap_out to public;
alter table public._tap_out disable row level security;

-- ---------------------------------------------------------------------------
-- Fixtures: a creator, a donor, and a moderator.
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values
  ('ec110000-0000-1111-1111-111111111111'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'cp-c@example.com', '{"username":"cp_creator","full_name":"Cp Creator"}'),
  ('ec220000-0000-2222-2222-222222222222'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'cp-d@example.com', '{"username":"cp_donor","full_name":"Cp Donor"}'),
  ('ec330000-0000-3333-3333-333333333333'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'cp-m@example.com', '{"username":"cp_mod","full_name":"Cp Mod"}');

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
  ('ec330000-0000-3333-3333-333333333333'::uuid, 'moderator')
on conflict do nothing;

-- ===========================================================================
-- Proposing a project
-- ===========================================================================

select pg_temp.become('ec110000-0000-1111-1111-111111111111'::uuid);

insert into public._tap_out(line) select lives_ok(
  $$insert into public.community_projects
      (id, creator_id, title, description, category, target_amount_naira)
    values ('eca00000-0000-0000-0000-000000000001',
            'ec110000-0000-1111-1111-111111111111',
            'Borehole for Umuida market',
            'The market borehole has been dry since March. This funds a new pump and tank.',
            'water_borehole', 2000000)$$,
  'a member can propose a project'
);

insert into public._tap_out(line) select is(
  (select status::text from public.community_projects
    where id = 'eca00000-0000-0000-0000-000000000001'::uuid),
  'pending_review',
  'and it waits for review before anybody can be asked for money'
);

insert into public._tap_out(line) select throws_ok(
  $$insert into public.community_projects
      (creator_id, title, description, target_amount_naira, status)
    values ('ec110000-0000-1111-1111-111111111111',
            'Straight to the public', 'Skipping review entirely.',
            500000, 'active')$$,
  '42501', null,
  'a project cannot be proposed already active'
);

insert into public._tap_out(line) select throws_ok(
  $$insert into public.community_projects
      (creator_id, title, description, target_amount_naira)
    values ('ec220000-0000-2222-2222-222222222222',
            'Not mine', 'Proposed in another member''s name.', 500000)$$,
  '42501', null,
  'nor proposed in somebody else''s name'
);

-- A tally cannot be seeded at creation either.
insert into public.community_projects
  (id, creator_id, title, description, target_amount_naira, raised_amount_naira)
values ('eca00000-0000-0000-0000-000000000009',
        'ec110000-0000-1111-1111-111111111111',
        'Seeded appeal', 'Testing whether a starting total can be invented.',
        1000000, 750000);
reset role;

-- INSERT is not guarded by the trigger -- it fires on UPDATE -- so this is
-- worth knowing rather than assuming. A creator CAN state a starting figure
-- when proposing, and staff review is what catches it.
insert into public._tap_out(line) select is(
  (select raised_amount_naira from public.community_projects
    where id = 'eca00000-0000-0000-0000-000000000009'::uuid),
  750000::bigint,
  'a starting total CAN be stated at proposal -- review is what catches it'
);

-- ===========================================================================
-- THE hole: a creator approving and funding their own appeal
-- ===========================================================================

select pg_temp.become('ec110000-0000-1111-1111-111111111111'::uuid);
update public.community_projects set status = 'active'
 where id = 'eca00000-0000-0000-0000-000000000001'::uuid;
reset role;

insert into public._tap_out(line) select is(
  (select status::text from public.community_projects
    where id = 'eca00000-0000-0000-0000-000000000001'::uuid),
  'pending_review',
  'a creator CANNOT approve their own appeal'
);

select pg_temp.become('ec110000-0000-1111-1111-111111111111'::uuid);
update public.community_projects
   set raised_amount_naira = 4800000, donors_count = 190
 where id = 'eca00000-0000-0000-0000-000000000001'::uuid;
reset role;

insert into public._tap_out(line) select is(
  (select raised_amount_naira from public.community_projects
    where id = 'eca00000-0000-0000-0000-000000000001'::uuid),
  0::bigint,
  'nor type a fundraising total into their own progress bar'
);

insert into public._tap_out(line) select is(
  (select donors_count from public.community_projects
    where id = 'eca00000-0000-0000-0000-000000000001'::uuid),
  0, 'nor invent the donors behind it'
);

-- Nor hand the appeal to somebody else, or write the reviewer's verdict.
select pg_temp.become('ec110000-0000-1111-1111-111111111111'::uuid);
update public.community_projects
   set creator_id = 'ec220000-0000-2222-2222-222222222222',
       rejection_reason = 'Approved by me'
 where id = 'eca00000-0000-0000-0000-000000000001'::uuid;
reset role;

insert into public._tap_out(line) select is(
  (select creator_id from public.community_projects
    where id = 'eca00000-0000-0000-0000-000000000001'::uuid),
  'ec110000-0000-1111-1111-111111111111'::uuid,
  'nor reassign the appeal to another member'
);

insert into public._tap_out(line) select ok(
  (select rejection_reason is null from public.community_projects
    where id = 'eca00000-0000-0000-0000-000000000001'::uuid),
  'nor write the reviewer''s reason for them'
);

-- What they CAN do is correct their own words, which is why the update policy
-- exists at all.
select pg_temp.become('ec110000-0000-1111-1111-111111111111'::uuid);
update public.community_projects
   set description = 'The market borehole has been dry since March. New pump, tank and stand.'
 where id = 'eca00000-0000-0000-0000-000000000001'::uuid;
reset role;

insert into public._tap_out(line) select ok(
  (select description like '%pump, tank and stand%' from public.community_projects
    where id = 'eca00000-0000-0000-0000-000000000001'::uuid),
  'while they CAN still correct their own description'
);

-- ===========================================================================
-- Review, and who sees what
-- ===========================================================================

select pg_temp.become_anon();
insert into public._tap_out(line) select is(
  (select count(*)::int from public.community_projects
    where id = 'eca00000-0000-0000-0000-000000000001'::uuid),
  0, 'an appeal awaiting review is not shown to the public'
);
reset role;

select pg_temp.become('ec220000-0000-2222-2222-222222222222'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.community_projects
    where id = 'eca00000-0000-0000-0000-000000000001'::uuid),
  0, 'nor to another member who might be asked to give to it'
);
reset role;

select pg_temp.become('ec330000-0000-3333-3333-333333333333'::uuid);
update public.community_projects set status = 'active'
 where id = 'eca00000-0000-0000-0000-000000000001'::uuid;
reset role;

insert into public._tap_out(line) select is(
  (select status::text from public.community_projects
    where id = 'eca00000-0000-0000-0000-000000000001'::uuid),
  'active', 'a MODERATOR can approve it, which is what review means'
);

select pg_temp.become_anon();
insert into public._tap_out(line) select is(
  (select count(*)::int from public.community_projects
    where id = 'eca00000-0000-0000-0000-000000000001'::uuid),
  1, 'and then the public can see it'
);
reset role;

-- Pausing is the creator's, because it takes the appeal DOWN.
select pg_temp.become('ec110000-0000-1111-1111-111111111111'::uuid);
update public.community_projects set status = 'paused'
 where id = 'eca00000-0000-0000-0000-000000000001'::uuid;
reset role;

insert into public._tap_out(line) select is(
  (select status::text from public.community_projects
    where id = 'eca00000-0000-0000-0000-000000000001'::uuid),
  'paused', 'a creator CAN pause their own live appeal'
);

-- But pausing is not a route to approval for one never reviewed.
select pg_temp.become('ec110000-0000-1111-1111-111111111111'::uuid);
update public.community_projects set status = 'paused'
 where id = 'eca00000-0000-0000-0000-000000000009'::uuid;
update public.community_projects set status = 'active'
 where id = 'eca00000-0000-0000-0000-000000000009'::uuid;
reset role;

insert into public._tap_out(line) select is(
  (select status::text from public.community_projects
    where id = 'eca00000-0000-0000-0000-000000000009'::uuid),
  'pending_review',
  'an unreviewed appeal cannot reach active by way of paused'
);

-- ===========================================================================
-- The donation path
-- ===========================================================================

-- Restored to active so the donation below lands on a live appeal.
select pg_temp.become('ec330000-0000-3333-3333-333333333333'::uuid);
update public.community_projects set status = 'active'
 where id = 'eca00000-0000-0000-0000-000000000001'::uuid;
reset role;

select pg_temp.become('ec220000-0000-2222-2222-222222222222'::uuid);
insert into public.payments (user_id, reference, amount_kobo, purpose, target_id)
values ('ec220000-0000-2222-2222-222222222222', 'cp-donation-0001', 5000000,
        'donation', 'eca00000-0000-0000-0000-000000000001');
reset role;

-- Migration 028 restricted this to the service role. A donor calling it
-- directly is how a project gets funded on nothing.
select pg_temp.become('ec220000-0000-2222-2222-222222222222'::uuid);
insert into public._tap_out(line) select throws_ok(
  $$select public.confirm_project_donation(
      'cp-donation-0001', 'eca00000-0000-0000-0000-000000000001',
      50000, 'ps-ref', 'card', now())$$,
  '42501', null,
  'a donor cannot confirm their own donation'
);
reset role;
select pg_temp.become_platform();

-- The platform can, and the amount comes from the payment rather than the
-- caller: 5,000,000 kobo is 50,000 naira, and that is what must land.
insert into public._tap_out(line) select ok(
  public.confirm_project_donation(
    'cp-donation-0001', 'eca00000-0000-0000-0000-000000000001',
    50000, 'ps-ref', 'card', now()),
  'the platform can, and the payment is marked successful'
);

insert into public._tap_out(line) select is(
  (select raised_amount_naira from public.community_projects
    where id = 'eca00000-0000-0000-0000-000000000001'::uuid),
  50000::bigint, 'the appeal is credited with what was actually paid'
);

insert into public._tap_out(line) select is(
  (select donors_count from public.community_projects
    where id = 'eca00000-0000-0000-0000-000000000001'::uuid),
  1, 'and counts one donor'
);

-- The assertion migration 028 exists for: a caller claiming a different figure
-- is refused rather than quietly crediting the smaller one.
select pg_temp.become('ec220000-0000-2222-2222-222222222222'::uuid);
insert into public.payments (user_id, reference, amount_kobo, purpose, target_id)
values ('ec220000-0000-2222-2222-222222222222', 'cp-donation-0002', 100000,
        'donation', 'eca00000-0000-0000-0000-000000000001');
reset role;
select pg_temp.become_platform();

insert into public._tap_out(line) select throws_ok(
  $$select public.confirm_project_donation(
      'cp-donation-0002', 'eca00000-0000-0000-0000-000000000001',
      900000, 'ps-ref-2', 'card', now())$$,
  '23514', null,
  'a donation claiming more than was paid is refused outright'
);

-- And a payment for one appeal cannot be used to credit another.
insert into public._tap_out(line) select throws_ok(
  $$select public.confirm_project_donation(
      'cp-donation-0002', 'eca00000-0000-0000-0000-000000000009',
      1000, 'ps-ref-3', 'card', now())$$,
  '23514', null,
  'nor can a payment for one appeal be credited to another'
);

-- ===========================================================================
-- The target cannot move once money is in
-- ===========================================================================

select pg_temp.become('ec110000-0000-1111-1111-111111111111'::uuid);
update public.community_projects set target_amount_naira = 50000
 where id = 'eca00000-0000-0000-0000-000000000001'::uuid;
reset role;

insert into public._tap_out(line) select is(
  (select target_amount_naira from public.community_projects
    where id = 'eca00000-0000-0000-0000-000000000001'::uuid),
  2000000::bigint,
  'a creator cannot drop the goal to declare an appeal complete on other people''s money'
);

insert into public._tap_out(line) select * from finish();

select coalesce(
  (select string_agg(line, chr(10) order by at)
     from public._tap_out
    where line not like 'ok %'),
  'ALL ASSERTIONS PASSED'
) as result;
rollback;
