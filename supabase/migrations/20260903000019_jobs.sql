-- Ezike Oba :: Phase 4 -- 019
-- Jobs and applications.
--
-- In Igbo-Eze North most work is found by word of mouth, so this is the
-- feature with the most direct economic value on the platform -- and the one
-- most attractive to abuse. Two decisions follow from that and are the reason
-- the schema is shaped the way it is.
--
--   1. CONTACT DETAILS ARE NOT PUBLIC. A job listing is a public, indexable
--      page, because that is how somebody finds work. The employer's phone
--      number is not, because a public page carrying phone numbers is a
--      harvesting ground within a week. The details live in their own table
--      with their own policy, readable by signed-in members only.
--   2. AN APPLICATION IS PRIVATE. Only the applicant and the employer may read
--      it. Staff get NO read policy, as with messages: staff can moderate the
--      POSTING, which is where fraud lives, without reading what applicants
--      wrote about themselves.

do $$ begin
  create type public.job_kind as enum (
    'full_time', 'part_time', 'contract', 'apprenticeship', 'casual',
    'volunteer', 'internship'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.job_category as enum (
    'teaching', 'healthcare', 'trade', 'agriculture', 'transport', 'retail',
    'security', 'domestic', 'admin', 'technology', 'construction', 'other'
  );
exception when duplicate_object then null; end $$;

-- Without a period a pay figure is meaningless: is 50,000 naira a day or a
-- month? The CHECK below refuses a figure with no period rather than letting
-- an ambiguous one be published.
do $$ begin
  create type public.pay_period as enum (
    'hour', 'day', 'week', 'month', 'year', 'once'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.application_status as enum (
    'sent', 'shortlisted', 'rejected', 'withdrawn'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Jobs
-- ---------------------------------------------------------------------------

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),

  title       text not null,
  description text not null,
  kind        public.job_kind not null default 'full_time',
  category    public.job_category not null default 'other',

  -- Who is hiring. The poster is always a real person; the organisation is a
  -- free-text name because most employers here are a school, a clinic or a
  -- shop rather than a registered entity with a profile.
  employer_id       uuid not null references public.profiles(id) on delete cascade,
  organization_name text,

  geo_id        uuid references public.geo_entities(id) on delete set null,
  location_text text,
  is_remote     boolean not null default false,

  -- Whole naira. Nobody advertises a salary in kobo, and an integer avoids
  -- every rounding argument a float would invite.
  pay_min bigint,
  pay_max bigint,
  pay_period public.pay_period,
  pay_is_negotiable boolean not null default false,

  -- Nullable means no deadline, which is the honest default: most of these
  -- close when somebody is found rather than on a date.
  closes_at timestamptz,
  filled_at timestamptz,

  group_id uuid references public.groups(id) on delete cascade,
  visibility public.event_visibility not null default 'public',

  application_count integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  edited_at  timestamptz,
  deleted_at timestamptz,

  constraint jobs_title_not_blank check (length(btrim(title)) > 0),
  constraint jobs_title_length check (length(title) <= 160),
  constraint jobs_description_not_blank check (length(btrim(description)) > 0),
  constraint jobs_description_length check (length(description) <= 8000),
  constraint jobs_organization_length
    check (organization_name is null or length(organization_name) <= 160),
  constraint jobs_location_length
    check (location_text is null or length(location_text) <= 200),

  -- A figure without a period is not a wage, it is a number.
  constraint jobs_pay_needs_period
    check ((pay_min is null and pay_max is null) or pay_period is not null),
  constraint jobs_pay_order check (pay_max is null or pay_min is null or pay_max >= pay_min),
  constraint jobs_pay_non_negative
    check ((pay_min is null or pay_min >= 0) and (pay_max is null or pay_max >= 0)),
  constraint jobs_application_count_non_negative check (application_count >= 0)
);

create index if not exists jobs_created_idx
  on public.jobs (created_at desc) where deleted_at is null;
create index if not exists jobs_category_idx
  on public.jobs (category) where deleted_at is null;
create index if not exists jobs_geo_idx
  on public.jobs (geo_id) where deleted_at is null;
create index if not exists jobs_group_idx
  on public.jobs (group_id) where deleted_at is null and group_id is not null;
create index if not exists jobs_employer_idx
  on public.jobs (employer_id) where deleted_at is null;

drop trigger if exists jobs_set_updated_at on public.jobs;
create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- How to reach the employer
--
-- A separate table for one reason: RLS grants rows, not columns. Keeping the
-- phone number on `jobs` would have meant either making the whole listing
-- members-only -- which defeats the point of a job board -- or publishing
-- contact details to every crawler on the internet.
--
-- Split, the listing stays public and indexable while the number behind it is
-- readable only by a signed-in, unsuspended member.
-- ---------------------------------------------------------------------------

create table if not exists public.job_contacts (
  job_id uuid primary key references public.jobs(id) on delete cascade,

  contact_name  text,
  contact_phone text,
  contact_email text,
  external_url  text,
  instructions  text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint job_contacts_phone_length
    check (contact_phone is null or length(contact_phone) <= 40),
  constraint job_contacts_email_length
    check (contact_email is null or length(contact_email) <= 200),
  constraint job_contacts_name_length
    check (contact_name is null or length(contact_name) <= 160),
  constraint job_contacts_instructions_length
    check (instructions is null or length(instructions) <= 2000),
  -- The same constraint the social links carry: `javascript:` must not be
  -- storable at all, rather than filtered on the way out.
  constraint job_contacts_url_scheme
    check (external_url is null or external_url ~* '^https?://')
);

drop trigger if exists job_contacts_set_updated_at on public.job_contacts;
create trigger job_contacts_set_updated_at
  before update on public.job_contacts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Applications
-- ---------------------------------------------------------------------------

create table if not exists public.job_applications (
  id uuid primary key default gen_random_uuid(),
  job_id       uuid not null references public.jobs(id) on delete cascade,
  applicant_id uuid not null references public.profiles(id) on delete cascade,

  message text,
  status  public.application_status not null default 'sent',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint job_applications_message_length
    check (message is null or length(message) <= 4000),
  -- One application per person per job. Somebody who wants to say more should
  -- edit what they wrote rather than send it again.
  unique (job_id, applicant_id)
);

create index if not exists job_applications_job_idx
  on public.job_applications (job_id, created_at desc);
create index if not exists job_applications_applicant_idx
  on public.job_applications (applicant_id, created_at desc);

drop trigger if exists job_applications_set_updated_at on public.job_applications;
create trigger job_applications_set_updated_at
  before update on public.job_applications
  for each row execute function public.set_updated_at();

create or replace function public.job_applications_maintain_count()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v_job uuid := coalesce(new.job_id, old.job_id);
begin
  update public.jobs j
     set application_count = (
           select count(*) from public.job_applications a
            where a.job_id = j.id and a.status <> 'withdrawn'
         )
   where j.id = v_job;
  return null;
end;
$fn$;

-- Recounted rather than incremented, as event RSVPs are: withdrawing changes a
-- status rather than removing a row, so a delta would have to know which
-- direction it was moving.
drop trigger if exists job_applications_count on public.job_applications;
create trigger job_applications_count
  after insert or update or delete on public.job_applications
  for each row execute function public.job_applications_maintain_count();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.can_see_job(
  target_job_id uuid,
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.jobs j
     where j.id = target_job_id
       and j.deleted_at is null
       and (
         j.employer_id = check_user_id
         or case
              when j.group_id is not null
                then public.can_see_group(j.group_id, check_user_id)
              when j.visibility = 'public' then true
              else public.member_of_geo(j.geo_id, check_user_id)
            end
       )
  );
$fn$;

create or replace function public.employs_for_job(
  target_job_id uuid,
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.jobs j
     where j.id = target_job_id and j.employer_id = check_user_id
  );
$fn$;

-- ---------------------------------------------------------------------------
-- Moderators may remove, never rewrite
-- ---------------------------------------------------------------------------

create or replace function public.jobs_guard_content()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if auth.uid() is not null and auth.uid() <> old.employer_id then
    new.title             := old.title;
    new.description       := old.description;
    new.organization_name := old.organization_name;
    new.kind              := old.kind;
    new.category          := old.category;
    new.geo_id            := old.geo_id;
    new.location_text     := old.location_text;
    new.is_remote         := old.is_remote;
    new.pay_min           := old.pay_min;
    new.pay_max           := old.pay_max;
    new.pay_period        := old.pay_period;
    new.pay_is_negotiable := old.pay_is_negotiable;
    new.employer_id       := old.employer_id;
    new.group_id          := old.group_id;
    new.visibility        := old.visibility;
    new.edited_at         := old.edited_at;
  elsif tg_op = 'UPDATE' and new.deleted_at is null
        and (new.title is distinct from old.title
             or new.description is distinct from old.description
             or new.pay_min is distinct from old.pay_min
             or new.pay_max is distinct from old.pay_max) then
    new.edited_at := now();
  end if;
  return new;
end;
$fn$;

drop trigger if exists jobs_guard on public.jobs;
create trigger jobs_guard
  before update on public.jobs
  for each row execute function public.jobs_guard_content();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.jobs enable row level security;
alter table public.job_contacts enable row level security;
alter table public.job_applications enable row level security;

-- Jobs ----------------------------------------------------------------------

-- `group_id is null` again, from the start. Permissive policies are OR'd, and
-- a job inside a private group carries visibility='public' by column default.
drop policy if exists jobs_select_public on public.jobs;
create policy jobs_select_public
  on public.jobs for select
  to anon, authenticated
  using (deleted_at is null and group_id is null and visibility = 'public');

drop policy if exists jobs_select_community on public.jobs;
create policy jobs_select_community
  on public.jobs for select
  to authenticated
  using (
    deleted_at is null
    and group_id is null
    and visibility = 'community'
    and public.member_of_geo(geo_id)
  );

drop policy if exists jobs_select_group on public.jobs;
create policy jobs_select_group
  on public.jobs for select
  to anon, authenticated
  using (
    deleted_at is null
    and group_id is not null
    and public.can_see_group(group_id)
  );

drop policy if exists jobs_select_own on public.jobs;
create policy jobs_select_own
  on public.jobs for select
  to authenticated
  using (employer_id = auth.uid());

drop policy if exists jobs_select_staff on public.jobs;
create policy jobs_select_staff
  on public.jobs for select
  to authenticated
  using (public.is_staff());

drop policy if exists jobs_insert_own on public.jobs;
create policy jobs_insert_own
  on public.jobs for insert
  to authenticated
  with check (
    employer_id = auth.uid()
    and public.is_active_member()
    and (group_id is null or public.is_group_member(group_id))
  );

drop policy if exists jobs_update_own on public.jobs;
create policy jobs_update_own
  on public.jobs for update
  to authenticated
  using (employer_id = auth.uid() and deleted_at is null)
  with check (employer_id = auth.uid());

drop policy if exists jobs_update_staff on public.jobs;
create policy jobs_update_staff
  on public.jobs for update
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- Contacts ------------------------------------------------------------------

-- NOTE the role list: `authenticated` only, with no anon policy at all. This
-- is the entire point of the separate table. The listing above is readable by
-- the whole internet; the phone number behind it is not, so the job board can
-- be indexed without becoming a directory of employers' phone numbers.
--
-- is_active_member() as well, so a suspended account cannot harvest them
-- either.
drop policy if exists job_contacts_select_members on public.job_contacts;
create policy job_contacts_select_members
  on public.job_contacts for select
  to authenticated
  using (public.is_active_member() and public.can_see_job(job_id));

drop policy if exists job_contacts_write_own on public.job_contacts;
create policy job_contacts_write_own
  on public.job_contacts for insert
  to authenticated
  with check (public.employs_for_job(job_id));

drop policy if exists job_contacts_update_own on public.job_contacts;
create policy job_contacts_update_own
  on public.job_contacts for update
  to authenticated
  using (public.employs_for_job(job_id))
  with check (public.employs_for_job(job_id));

drop policy if exists job_contacts_delete_own on public.job_contacts;
create policy job_contacts_delete_own
  on public.job_contacts for delete
  to authenticated
  using (public.employs_for_job(job_id));

-- Applications --------------------------------------------------------------

-- Two policies, deliberately narrow: the applicant sees their own, and the
-- employer sees the ones sent to their job. Nobody else sees any of it.
--
-- There is NO staff policy here, the same departure the messages table makes.
-- Job fraud is real and worth moderating, but what needs moderating is the
-- POSTING -- which staff can read in full -- not what applicants wrote about
-- themselves in order to get work.
drop policy if exists job_applications_select_own on public.job_applications;
create policy job_applications_select_own
  on public.job_applications for select
  to authenticated
  using (applicant_id = auth.uid());

drop policy if exists job_applications_select_employer on public.job_applications;
create policy job_applications_select_employer
  on public.job_applications for select
  to authenticated
  using (public.employs_for_job(job_id));

drop policy if exists job_applications_insert_own on public.job_applications;
create policy job_applications_insert_own
  on public.job_applications for insert
  to authenticated
  with check (
    applicant_id = auth.uid()
    and public.is_active_member()
    and public.can_see_job(job_id)
    -- You cannot apply to a job that is filled, closed, or your own.
    and not exists (
      select 1 from public.jobs j
       where j.id = job_id
         and (j.filled_at is not null
              or (j.closes_at is not null and j.closes_at < now())
              or j.employer_id = auth.uid())
    )
  );

-- An applicant may edit or withdraw their own application. They may NOT set
-- its status to shortlisted -- the guard below restores that for anybody who
-- is not the employer.
drop policy if exists job_applications_update_own on public.job_applications;
create policy job_applications_update_own
  on public.job_applications for update
  to authenticated
  using (applicant_id = auth.uid())
  with check (applicant_id = auth.uid());

drop policy if exists job_applications_update_employer on public.job_applications;
create policy job_applications_update_employer
  on public.job_applications for update
  to authenticated
  using (public.employs_for_job(job_id))
  with check (public.employs_for_job(job_id));

-- Neither side may edit the other's half of the row.
create or replace function public.job_applications_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  -- The employer decides the status and must never be able to rewrite what an
  -- applicant said about themselves.
  if auth.uid() is not null and auth.uid() <> old.applicant_id then
    new.message      := old.message;
    new.applicant_id := old.applicant_id;
    new.job_id       := old.job_id;
  end if;

  -- The applicant may withdraw and may not promote themselves.
  if auth.uid() is not null and auth.uid() = old.applicant_id
     and new.status is distinct from old.status
     and new.status <> 'withdrawn' then
    new.status := old.status;
  end if;

  return new;
end;
$fn$;

drop trigger if exists job_applications_guard_trigger on public.job_applications;
create trigger job_applications_guard_trigger
  before update on public.job_applications
  for each row execute function public.job_applications_guard();

grant select on public.jobs to anon, authenticated;
grant insert, update on public.jobs to authenticated;
grant select, insert, update, delete on public.job_contacts to authenticated;
grant select, insert, update on public.job_applications to authenticated;
