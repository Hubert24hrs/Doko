-- Migration 027: Community Projects & Diaspora Crowdfunding Engine
-- Enables citizens and diaspora members to collaboratively fund civic infrastructure in Igbo-Eze North.

do $$ begin
  create type public.project_category as enum (
    'road', 'water_borehole', 'electricity_solar', 'school_education',
    'health_center', 'security', 'culture'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.project_status as enum (
    'pending_review', 'active', 'completed', 'paused', 'rejected'
  );
exception when duplicate_object then null; end $$;

-- 1. Create community_projects table
create table if not exists public.community_projects (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 5 and 140),
  description text not null check (char_length(trim(description)) between 10 and 2000),
  category public.project_category not null default 'road',
  target_village_id uuid references public.geo_entities(id) on delete set null,
  target_amount_naira bigint not null check (target_amount_naira >= 10000),
  raised_amount_naira bigint not null default 0 check (raised_amount_naira >= 0),
  donors_count integer not null default 0 check (donors_count >= 0),
  status public.project_status not null default 'pending_review',
  image_url text check (image_url is null or image_url ~* '^https?://'),
  rejection_reason text,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null default (now() + interval '90 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_projects_status on public.community_projects(status);
create index if not exists idx_projects_target_village on public.community_projects(target_village_id);
create index if not exists idx_projects_category on public.community_projects(category);

-- 2. Enable RLS
alter table public.community_projects enable row level security;

-- 3. Policies
drop policy if exists community_projects_select on public.community_projects;
create policy community_projects_select on public.community_projects
  for select
  using (
    status in ('active', 'completed')
    or creator_id = auth.uid()
    or public.is_staff()
  );

drop policy if exists community_projects_insert_own on public.community_projects;
create policy community_projects_insert_own on public.community_projects
  for insert
  with check (
    creator_id = auth.uid()
    and status = 'pending_review'
    and public.is_active_member()
  );

drop policy if exists community_projects_update on public.community_projects;
create policy community_projects_update on public.community_projects
  for update
  using (creator_id = auth.uid() or public.is_staff())
  with check (creator_id = auth.uid() or public.is_staff());

-- 4. Atomic donation confirmation RPC
create or replace function public.confirm_project_donation(
  p_payment_reference text,
  p_project_id uuid,
  p_amount_naira bigint,
  p_paystack_ref text,
  p_channel text,
  p_paid_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment record;
begin
  select * into v_payment from public.payments
  where reference = p_payment_reference and status = 'pending'
  for update;

  if not found then
    return false;
  end if;

  -- Update payment record
  update public.payments
  set
    status = 'success',
    paystack_reference = p_paystack_ref,
    channel = p_channel,
    paid_at = coalesce(p_paid_at, now()),
    updated_at = now()
  where id = v_payment.id;

  -- Update project tallies atomically
  update public.community_projects
  set
    raised_amount_naira = raised_amount_naira + p_amount_naira,
    donors_count = donors_count + 1,
    status = case
      when (raised_amount_naira + p_amount_naira) >= target_amount_naira then 'completed'::public.project_status
      else status
    end,
    updated_at = now()
  where id = p_project_id;

  return true;
end;
$$;