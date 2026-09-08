-- Ezike Oba :: payments
--
-- Run either way:
--   * locally:  supabase test db
--   * hosted:   paste this whole file into the Supabase SQL Editor
--               (requires: create extension if not exists pgtap with schema extensions;)
--
-- The first suite to cover money, and the one that found two holes by being
-- written. Both are fixed in migration 028 and asserted here so they cannot
-- come back:
--
--   1. confirm_ad_payment() and confirm_project_donation() are SECURITY
--      DEFINER, and migrations 026 and 027 never revoked EXECUTE. Postgres
--      grants EXECUTE to PUBLIC by default, so ANY MEMBER could call them
--      over PostgREST -- marking their own pending payment successful and
--      their own advert paid, having paid nothing. The database cannot tell
--      whether Paystack was consulted; only the platform can, so only the
--      platform may say so.
--   2. confirm_project_donation() credited its `p_amount_naira` PARAMETER to
--      a project's total without comparing it to what was actually charged.
--      Any figure the caller chose became fundraising the project claimed to
--      have received.
--
-- If a future migration re-grants either function, or takes the amount from
-- the caller again, the assertions below fail rather than the hole reopening
-- quietly.

begin;

set local search_path = public, extensions, pg_temp;
select plan(26);

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
-- Fixtures: a payer, a bystander, and a moderator.
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values
  ('e1110000-1111-1111-1111-111111111111'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'pay-a@example.com', '{"username":"pay_payer","full_name":"Pay Payer"}'),
  ('e2220000-2222-2222-2222-222222222222'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'pay-b@example.com', '{"username":"pay_other","full_name":"Pay Other"}'),
  ('e3330000-3333-3333-3333-333333333333'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'pay-m@example.com', '{"username":"pay_mod","full_name":"Pay Mod"}');

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


update public.profiles set visibility = 'private'
 where id in (
   'e1110000-1111-1111-1111-111111111111'::uuid,
   'e2220000-2222-2222-2222-222222222222'::uuid,
   'e3330000-3333-3333-3333-333333333333'::uuid
 );

insert into public.user_roles (user_id, role) values
  ('e3330000-3333-3333-3333-333333333333'::uuid, 'moderator')
on conflict do nothing;

-- ===========================================================================
-- Recording a payment
-- ===========================================================================

select pg_temp.become('e1110000-1111-1111-1111-111111111111'::uuid);

insert into public._tap_out(line) select lives_ok(
  $$insert into public.payments (id, user_id, reference, amount_kobo, purpose)
    values ('ef000000-0000-0000-0000-000000000001',
            'e1110000-1111-1111-1111-111111111111',
            'EZK-TEST-REFERENCE-0001', 500000, 'ad_campaign')$$,
  'a member can start a payment for themselves'
);

-- A payment may only ever be created 'pending'. Anything else would be a
-- member declaring their own money received.
insert into public._tap_out(line) select throws_ok(
  $$insert into public.payments (user_id, reference, amount_kobo, purpose, status)
    values ('e1110000-1111-1111-1111-111111111111',
            'EZK-TEST-REFERENCE-0002', 500000, 'ad_campaign', 'success')$$,
  '42501', null,
  'and cannot create one already marked successful'
);

insert into public._tap_out(line) select throws_ok(
  $$insert into public.payments (user_id, reference, amount_kobo, purpose)
    values ('e2220000-2222-2222-2222-222222222222',
            'EZK-TEST-REFERENCE-0003', 500000, 'ad_campaign')$$,
  '42501', null,
  'nor start one in somebody else''s name'
);

insert into public._tap_out(line) select throws_ok(
  $$insert into public.payments (user_id, reference, amount_kobo, purpose)
    values ('e1110000-1111-1111-1111-111111111111',
            'EZK-TEST-REFERENCE-0004', 0, 'ad_campaign')$$,
  '23514', null,
  'a payment of zero is not a payment'
);

insert into public._tap_out(line) select throws_ok(
  $$insert into public.payments (user_id, reference, amount_kobo, purpose)
    values ('e1110000-1111-1111-1111-111111111111',
            'short', 500000, 'ad_campaign')$$,
  '23514', null,
  'and a reference too short to be a real one is refused'
);
reset role;

insert into public._tap_fixture (name, value)
values ('payment', 'ef000000-0000-0000-0000-000000000001');

-- ===========================================================================
-- Who may read a payment
-- ===========================================================================

select pg_temp.become('e1110000-1111-1111-1111-111111111111'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.payments
    where id = 'ef000000-0000-0000-0000-000000000001'::uuid),
  1, 'the payer reads their own payment'
);
reset role;

select pg_temp.become('e2220000-2222-2222-2222-222222222222'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.payments
    where id = 'ef000000-0000-0000-0000-000000000001'::uuid),
  0, 'another member reads NOTHING of it'
);
reset role;

select pg_temp.become_anon();
insert into public._tap_out(line) select is(
  (select count(*)::int from public.payments),
  0, 'and a signed-out visitor reads no payment at all'
);
reset role;

-- Staff DO get a read here, unlike messages and job applications. A payment
-- is a financial record the platform is accountable for, not correspondence:
-- somebody has to be able to answer "did this member's money arrive".
select pg_temp.become('e3330000-3333-3333-3333-333333333333'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.payments
    where id = 'ef000000-0000-0000-0000-000000000001'::uuid),
  1, 'staff CAN read payments, deliberately -- somebody must answer for money'
);
reset role;

-- ===========================================================================
-- Nobody marks their own payment as received
-- ===========================================================================

select pg_temp.become('e1110000-1111-1111-1111-111111111111'::uuid);
update public.payments set status = 'success', paid_at = now()
 where id = 'ef000000-0000-0000-0000-000000000001'::uuid;
reset role;
select pg_temp.become_platform();

-- payments_update asks is_staff(), and RLS refuses an UPDATE by FILTERING
-- rather than raising -- so this is silence, not an error, which is why the
-- assertion reads the row back instead of expecting a throw.
insert into public._tap_out(line) select is(
  (select status::text from public.payments
    where id = 'ef000000-0000-0000-0000-000000000001'::uuid),
  'pending',
  'a member cannot mark their own payment successful'
);

-- ===========================================================================
-- THE hole: the confirming functions were callable by anybody
-- ===========================================================================

-- Asserted as a PRIVILEGE fact rather than by calling the function, because a
-- call would also be refused for other reasons and could pass while the grant
-- was still wrong. This asks the catalogue directly.
insert into public._tap_out(line) select ok(
  not has_function_privilege(
    'authenticated',
    'public.confirm_ad_payment(text, text, text, timestamptz)',
    'execute'
  ),
  'confirm_ad_payment is NOT executable by an ordinary member'
);

insert into public._tap_out(line) select ok(
  not has_function_privilege(
    'anon',
    'public.confirm_ad_payment(text, text, text, timestamptz)',
    'execute'
  ),
  'nor by a signed-out visitor'
);

insert into public._tap_out(line) select ok(
  not has_function_privilege(
    'authenticated',
    'public.confirm_project_donation(text, uuid, bigint, text, text, timestamptz)',
    'execute'
  ),
  'confirm_project_donation is NOT executable by an ordinary member'
);

insert into public._tap_out(line) select ok(
  not has_function_privilege(
    'anon',
    'public.confirm_project_donation(text, uuid, bigint, text, text, timestamptz)',
    'execute'
  ),
  'nor by a signed-out visitor'
);

-- The platform still has to be able to do its job.
insert into public._tap_out(line) select ok(
  has_function_privilege(
    'service_role',
    'public.confirm_ad_payment(text, text, text, timestamptz)',
    'execute'
  ),
  'while the service role, which is what the webhook uses, still can'
);

insert into public._tap_out(line) select ok(
  has_function_privilege(
    'service_role',
    'public.confirm_project_donation(text, uuid, bigint, text, text, timestamptz)',
    'execute'
  ),
  'and can confirm a donation'
);

-- Both are SECURITY DEFINER, which is what made the missing revocation
-- dangerous rather than merely untidy.
insert into public._tap_out(line) select ok(
  (select p.prosecdef from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'confirm_ad_payment'),
  'confirm_ad_payment is SECURITY DEFINER, which is why the grant mattered'
);

-- ===========================================================================
-- The donation amount comes from the ledger, not the caller
-- ===========================================================================

insert into public.community_projects
  (id, creator_id, title, description, target_amount_naira, status)
values
  ('ef000000-0000-0000-0000-0000000000a1',
   'e1110000-1111-1111-1111-111111111111',
   'Borehole for Umuida',
   'Repairing the borehole beside the market.',
   1000000, 'active');

insert into public.payments (id, user_id, reference, amount_kobo, purpose, target_id)
values ('ef000000-0000-0000-0000-000000000002',
        'e1110000-1111-1111-1111-111111111111',
        'EZK-TEST-DONATION-0001', 500000, 'donation',
        'ef000000-0000-0000-0000-0000000000a1');

-- 500000 kobo is 5000 naira. A caller claiming anything else is refused
-- rather than quietly credited, because a mismatch is a bug or an attack and
-- both are worth surfacing.
insert into public._tap_out(line) select throws_ok(
  $$select public.confirm_project_donation(
      'EZK-TEST-DONATION-0001',
      'ef000000-0000-0000-0000-0000000000a1',
      900000,
      'ps-ref', 'card', now())$$,
  '23514', null,
  'a donation crediting more than was paid is REFUSED'
);

insert into public._tap_out(line) select is(
  (select raised_amount_naira from public.community_projects
    where id = 'ef000000-0000-0000-0000-0000000000a1'::uuid),
  0::bigint,
  'and the project total is untouched by the attempt'
);

insert into public._tap_out(line) select is(
  (select status::text from public.payments
    where id = 'ef000000-0000-0000-0000-000000000002'::uuid),
  'pending',
  'the payment is not marked successful by a refused donation'
);

-- The payment must belong to the project being credited, or a donation to one
-- project could be used to inflate another.
insert into public.community_projects
  (id, creator_id, title, description, target_amount_naira, status)
values
  ('ef000000-0000-0000-0000-0000000000a2',
   'e1110000-1111-1111-1111-111111111111',
   'Culvert at Ogrute',
   'Rebuilding the culvert washed out by the rains.',
   2000000, 'active');

insert into public._tap_out(line) select throws_ok(
  $$select public.confirm_project_donation(
      'EZK-TEST-DONATION-0001',
      'ef000000-0000-0000-0000-0000000000a2',
      5000,
      'ps-ref', 'card', now())$$,
  '23514', null,
  'a payment cannot be credited to a project it was not for'
);

-- The honest figure goes through, and only once.
insert into public._tap_out(line) select ok(
  public.confirm_project_donation(
    'EZK-TEST-DONATION-0001',
    'ef000000-0000-0000-0000-0000000000a1',
    5000,
    'ps-ref', 'card', now()),
  'the amount that was actually paid IS credited'
);

insert into public._tap_out(line) select is(
  (select raised_amount_naira from public.community_projects
    where id = 'ef000000-0000-0000-0000-0000000000a1'::uuid),
  5000::bigint,
  'and the project total moves by exactly that'
);

insert into public._tap_out(line) select is(
  (select donors_count from public.community_projects
    where id = 'ef000000-0000-0000-0000-0000000000a1'::uuid),
  1, 'with one donor counted'
);

-- Replaying the same reference must not pay twice: the function only matches
-- a PENDING payment, and this one is now successful.
insert into public._tap_out(line) select ok(
  not public.confirm_project_donation(
    'EZK-TEST-DONATION-0001',
    'ef000000-0000-0000-0000-0000000000a1',
    5000,
    'ps-ref', 'card', now()),
  'the same payment cannot be confirmed twice'
);

insert into public._tap_out(line) select is(
  (select raised_amount_naira from public.community_projects
    where id = 'ef000000-0000-0000-0000-0000000000a1'::uuid),
  5000::bigint,
  'so a replayed webhook does not double the total'
);

insert into public._tap_out(line) select * from finish();

select coalesce(
  (select string_agg(line, chr(10) order by at)
     from public._tap_out
    where line not like 'ok %'),
  'ALL ASSERTIONS PASSED'
) as result;
rollback;
