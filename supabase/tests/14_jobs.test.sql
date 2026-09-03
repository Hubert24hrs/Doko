-- Ezike Oba :: jobs and applications
--
-- Run either way:
--   * locally:  supabase test db
--   * hosted:   paste this whole file into the Supabase SQL Editor
--               (requires: create extension if not exists pgtap with schema extensions;)
--
-- The two assertions this suite exists for:
--
--   1. A SIGNED-OUT READER SEES THE JOB AND NOT THE PHONE NUMBER. The listing
--      has to be public and indexable, because that is how somebody finds
--      work; the employer's number must not be, or the board becomes a
--      harvesting ground within a week. RLS grants rows and not columns, which
--      is why the contact details live in their own table -- and that split is
--      only worth anything if a test holds it in place.
--   2. NOBODY BUT THE APPLICANT AND THE EMPLOYER READS AN APPLICATION. Not
--      other applicants, and not staff. Job fraud is real and worth
--      moderating, but what needs moderating is the POSTING, which staff can
--      read in full.

begin;

set local search_path = public, extensions, pg_temp;
select plan(34);

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
-- Fixtures: an employer, two applicants, and a moderator.
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values
  ('c1110000-1111-1111-1111-111111111111'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'jb-e@example.com', '{"username":"jb_employer","full_name":"Jb Employer"}'),
  ('c2220000-2222-2222-2222-222222222222'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'jb-a@example.com', '{"username":"jb_applicant","full_name":"Jb Applicant"}'),
  ('c3330000-3333-3333-3333-333333333333'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'jb-b@example.com', '{"username":"jb_other","full_name":"Jb Other"}'),
  ('c4440000-4444-4444-4444-444444444444'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'jb-m@example.com', '{"username":"jb_mod","full_name":"Jb Mod"}');

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
   'c1110000-1111-1111-1111-111111111111'::uuid,
   'c2220000-2222-2222-2222-222222222222'::uuid,
   'c3330000-3333-3333-3333-333333333333'::uuid,
   'c4440000-4444-4444-4444-444444444444'::uuid
 );

insert into public.user_roles (user_id, role) values
  ('c4440000-4444-4444-4444-444444444444'::uuid, 'moderator')
on conflict do nothing;

-- ===========================================================================
-- Posting
-- ===========================================================================

select pg_temp.become('c1110000-1111-1111-1111-111111111111'::uuid);

insert into public._tap_out(line) select lives_ok(
  $$insert into public.jobs (id, title, description, category, employer_id)
    values ('cf000000-0000-0000-0000-000000000001', 'Mathematics teacher',
            'Teaching SS1 to SS3 at a community secondary school.',
            'teaching', 'c1110000-1111-1111-1111-111111111111')$$,
  'a member can post a job'
);

insert into public._tap_out(line) select lives_ok(
  $$insert into public.job_contacts (job_id, contact_phone, contact_name)
    values ('cf000000-0000-0000-0000-000000000001', '0803 000 0000', 'Mr Eze')$$,
  'and add contact details to it'
);

-- A figure with no period is not a wage, it is a number.
insert into public._tap_out(line) select throws_ok(
  $$insert into public.jobs (title, description, employer_id, pay_min)
    values ('Driver', 'Driving the school bus each morning.',
            'c1110000-1111-1111-1111-111111111111', 50000)$$,
  '23514', null,
  'a pay figure cannot be stored without a period'
);

insert into public._tap_out(line) select lives_ok(
  $$insert into public.jobs (title, description, employer_id, pay_min, pay_period)
    values ('Driver', 'Driving the school bus each morning.',
            'c1110000-1111-1111-1111-111111111111', 50000, 'month')$$,
  'and can be stored with one'
);

insert into public._tap_out(line) select throws_ok(
  $$insert into public.jobs (title, description, employer_id,
                             pay_min, pay_max, pay_period)
    values ('Backwards', 'Pay range the wrong way round.',
            'c1110000-1111-1111-1111-111111111111', 80000, 50000, 'month')$$,
  '23514', null,
  'a pay range cannot run backwards'
);

insert into public._tap_out(line) select throws_ok(
  $$insert into public.job_contacts (job_id, external_url)
    values ('cf000000-0000-0000-0000-000000000001', 'javascript:alert(1)')$$,
  '23514', null,
  'a javascript: address cannot be stored at all'
);
reset role;

insert into public._tap_fixture (name, value)
values ('job', 'cf000000-0000-0000-0000-000000000001');

-- Nobody posts a job in somebody else's name.
select pg_temp.become('c2220000-2222-2222-2222-222222222222'::uuid);
insert into public._tap_out(line) select throws_ok(
  $$insert into public.jobs (title, description, employer_id)
    values ('Not mine', 'Posted in another member''s name.',
            'c1110000-1111-1111-1111-111111111111')$$,
  '42501', null,
  'a member cannot post a job in somebody else''s name'
);
reset role;

-- ===========================================================================
-- THE split: public listing, private contact details
-- ===========================================================================

select pg_temp.become_anon();

insert into public._tap_out(line) select is(
  (select count(*)::int from public.jobs
    where id = 'cf000000-0000-0000-0000-000000000001'::uuid),
  1, 'a signed-out visitor CAN read the job itself'
);

insert into public._tap_out(line) select is(
  (select count(*)::int from public.job_contacts
    where job_id = 'cf000000-0000-0000-0000-000000000001'::uuid),
  0, 'and CANNOT read the contact details'
);

-- Belt and braces: the number must not be reachable by any route, including a
-- join from the row they can read.
insert into public._tap_out(line) select is(
  (select count(*)::int
     from public.jobs j
     join public.job_contacts c on c.job_id = j.id
    where j.id = 'cf000000-0000-0000-0000-000000000001'::uuid),
  0, 'nor reach them by joining from the job they can read'
);
reset role;

select pg_temp.become('c2220000-2222-2222-2222-222222222222'::uuid);
insert into public._tap_out(line) select is(
  (select contact_phone from public.job_contacts
    where job_id = 'cf000000-0000-0000-0000-000000000001'::uuid),
  '0803 000 0000',
  'while a signed-in member CAN read them'
);

-- Only the employer may change them.
insert into public._tap_out(line) select throws_ok(
  $$insert into public.job_contacts (job_id, contact_phone)
    select value, '0000 000 0000' from public._tap_fixture where name = 'job'$$,
  '23505', null,
  'and cannot add a second set of details'
);

update public.job_contacts set contact_phone = '0999 999 9999'
 where job_id = 'cf000000-0000-0000-0000-000000000001'::uuid;
reset role;

insert into public._tap_out(line) select is(
  (select contact_phone from public.job_contacts
    where job_id = 'cf000000-0000-0000-0000-000000000001'::uuid),
  '0803 000 0000',
  'nor rewrite the employer''s phone number'
);

-- ===========================================================================
-- Applications
-- ===========================================================================

select pg_temp.become('c2220000-2222-2222-2222-222222222222'::uuid);
insert into public._tap_out(line) select lives_ok(
  $$insert into public.job_applications (job_id, applicant_id, message)
    values ('cf000000-0000-0000-0000-000000000001',
            'c2220000-2222-2222-2222-222222222222', 'I have taught for six years.')$$,
  'a member can apply for a job'
);

insert into public._tap_out(line) select throws_ok(
  $$insert into public.job_applications (job_id, applicant_id, message)
    values ('cf000000-0000-0000-0000-000000000001',
            'c2220000-2222-2222-2222-222222222222', 'Again')$$,
  '23505', null,
  'and cannot apply for the same one twice'
);
reset role;

insert into public._tap_out(line) select is(
  (select application_count from public.jobs
    where id = 'cf000000-0000-0000-0000-000000000001'::uuid),
  1, 'applying increments the count'
);

-- An employer does not apply for their own job.
select pg_temp.become('c1110000-1111-1111-1111-111111111111'::uuid);
insert into public._tap_out(line) select throws_ok(
  $$insert into public.job_applications (job_id, applicant_id)
    values ('cf000000-0000-0000-0000-000000000001',
            'c1110000-1111-1111-1111-111111111111')$$,
  '42501', null,
  'an employer cannot apply for their own job'
);
reset role;

-- THE second assertion. Another applicant sees nothing.
select pg_temp.become('c3330000-3333-3333-3333-333333333333'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.job_applications),
  0, 'another member cannot read anybody else''s application'
);
reset role;

select pg_temp.become('c4440000-4444-4444-4444-444444444444'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.job_applications),
  0, 'a MODERATOR cannot read applications either'
);
-- ...while still being able to moderate the posting itself, which is where
-- fraud actually lives.
insert into public._tap_out(line) select is(
  (select count(*)::int from public.jobs
    where id = 'cf000000-0000-0000-0000-000000000001'::uuid),
  1, 'though a moderator CAN read the job posting'
);
reset role;

select pg_temp.become('c1110000-1111-1111-1111-111111111111'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.job_applications),
  1, 'the employer reads the applications sent to their job'
);
reset role;

select pg_temp.become('c2220000-2222-2222-2222-222222222222'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.job_applications),
  1, 'and the applicant reads their own'
);
reset role;

-- ===========================================================================
-- Neither side may edit the other's half
-- ===========================================================================

select pg_temp.become('c2220000-2222-2222-2222-222222222222'::uuid);
update public.job_applications set status = 'shortlisted'
 where applicant_id = 'c2220000-2222-2222-2222-222222222222'::uuid;
reset role;

insert into public._tap_out(line) select is(
  (select status::text from public.job_applications
    where applicant_id = 'c2220000-2222-2222-2222-222222222222'::uuid),
  'sent', 'an applicant cannot shortlist themselves'
);

select pg_temp.become('c1110000-1111-1111-1111-111111111111'::uuid);
update public.job_applications
   set status = 'shortlisted',
       message = 'Rewritten by the employer'
 where job_id = 'cf000000-0000-0000-0000-000000000001'::uuid;
reset role;

insert into public._tap_out(line) select is(
  (select status::text from public.job_applications
    where applicant_id = 'c2220000-2222-2222-2222-222222222222'::uuid),
  'shortlisted', 'the employer CAN shortlist'
);

insert into public._tap_out(line) select is(
  (select message from public.job_applications
    where applicant_id = 'c2220000-2222-2222-2222-222222222222'::uuid),
  'I have taught for six years.',
  'but cannot rewrite what the applicant said about themselves'
);

-- Withdrawing is the applicant's one status change.
select pg_temp.become('c2220000-2222-2222-2222-222222222222'::uuid);
update public.job_applications set status = 'withdrawn'
 where applicant_id = 'c2220000-2222-2222-2222-222222222222'::uuid;
reset role;

insert into public._tap_out(line) select is(
  (select status::text from public.job_applications
    where applicant_id = 'c2220000-2222-2222-2222-222222222222'::uuid),
  'withdrawn', 'an applicant CAN withdraw'
);

insert into public._tap_out(line) select is(
  (select application_count from public.jobs
    where id = 'cf000000-0000-0000-0000-000000000001'::uuid),
  0, 'and a withdrawn application stops being counted'
);

-- ===========================================================================
-- Filled, closed, removed
-- ===========================================================================

select pg_temp.become('c1110000-1111-1111-1111-111111111111'::uuid);
update public.jobs set filled_at = now()
 where id = 'cf000000-0000-0000-0000-000000000001'::uuid;
reset role;

select pg_temp.become('c3330000-3333-3333-3333-333333333333'::uuid);
insert into public._tap_out(line) select throws_ok(
  $$insert into public.job_applications (job_id, applicant_id)
    select value, 'c3330000-3333-3333-3333-333333333333'
      from public._tap_fixture where name = 'job'$$,
  '42501', null,
  'nobody can apply for a job that has been filled'
);

insert into public._tap_out(line) select is(
  (select count(*)::int from public.jobs
    where id = 'cf000000-0000-0000-0000-000000000001'::uuid),
  1, 'though a filled job stays readable, so applicants can see what happened'
);
reset role;

-- Moderators may remove, never rewrite.
select pg_temp.become('c4440000-4444-4444-4444-444444444444'::uuid);
update public.jobs
   set title = 'Moderator rewrote this',
       pay_min = 1,
       pay_period = 'hour',
       deleted_at = now()
 where id = 'cf000000-0000-0000-0000-000000000001'::uuid;
reset role;

insert into public._tap_out(line) select is(
  (select title from public.jobs
    where id = 'cf000000-0000-0000-0000-000000000001'::uuid),
  'Mathematics teacher',
  'a moderator cannot rewrite a job posting'
);

insert into public._tap_out(line) select ok(
  (select pay_min is null from public.jobs
    where id = 'cf000000-0000-0000-0000-000000000001'::uuid),
  'nor invent a wage for it'
);

insert into public._tap_out(line) select ok(
  (select deleted_at is not null from public.jobs
    where id = 'cf000000-0000-0000-0000-000000000001'::uuid),
  'but CAN take it down, which is what moderation is for'
);

select pg_temp.become_anon();
insert into public._tap_out(line) select is(
  (select count(*)::int from public.jobs
    where id = 'cf000000-0000-0000-0000-000000000001'::uuid),
  0, 'and a removed job disappears for the public'
);
reset role;

select pg_temp.become('c1110000-1111-1111-1111-111111111111'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.jobs
    where id = 'cf000000-0000-0000-0000-000000000001'::uuid),
  1, 'while its employer still sees that it was removed'
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
