-- =============================================================================
-- Ezike Oba: Consolidated Schema Update (Migrations 023 -> 027)
-- Clean ASCII/UTF-8 without Byte Order Marks (BOM)
-- =============================================================================


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START: 20260904000023_verification_tiers_and_delegation.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- Ezike Oba :: Migration 023
-- Dual-Tier Verification System (Golden & Blue), Admin Delegation & Verification Requests

-- 1. Add verification_type column to profiles with check constraint
alter table public.profiles
  add column if not exists verification_type text check (verification_type in ('blue', 'gold'));

-- Backfill any existing verified profiles to regular 'blue' tier
update public.profiles
   set verification_type = 'blue'
 where is_verified = true
   and verification_type is null;

-- Update profiles_verified_check constraint to enforce consistency across is_verified, verified_at, and verification_type
alter table public.profiles
  drop constraint if exists profiles_verified_check;

alter table public.profiles
  add constraint profiles_verified_check check (
    (is_verified = false and verified_at is null and verification_type is null) or
    (is_verified = true and verified_at is not null and verification_type is not null)
  );

create index if not exists profiles_verification_idx
  on public.profiles (is_verified, verification_type);

-- 2. Verification Delegates Table
-- Tracks members who have been delegated verification authority by an admin
create table if not exists public.verification_delegates (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  delegated_by uuid references auth.users(id) on delete set null,
  delegated_at timestamptz not null default now(),
  notes        text
);

alter table public.verification_delegates enable row level security;

-- 3. Verification Requests Table
-- Allows registered unverified members to submit verification applications
create table if not exists public.verification_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  tier         text not null check (tier in ('blue', 'gold')),
  organization text,
  role_title   text,
  notes        text,
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at   timestamptz not null default now(),
  reviewed_by  uuid references auth.users(id) on delete set null,
  reviewed_at  timestamptz,
  review_notes text
);

create index if not exists verification_requests_user_idx
  on public.verification_requests (user_id, status);

create index if not exists verification_requests_status_idx
  on public.verification_requests (status, created_at desc);

alter table public.verification_requests enable row level security;

-- 4. RBAC Helper: can_verify_members
-- Returns true if user is super_admin, admin, moderator, or in verification_delegates
create or replace function public.can_verify_members(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select public.is_admin(check_user_id)
    or exists (
      select 1 from public.verification_delegates d
       where d.user_id = check_user_id
    )
    or exists (
      select 1 from public.user_roles r
       where r.user_id = check_user_id
         and r.role in ('super_admin', 'admin', 'moderator')
         and (r.expires_at is null or r.expires_at > now())
    );
$fn$;

-- 5. Update profiles_guard_privileged_columns trigger to honor can_verify_members()
create or replace function public.profiles_guard_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  -- Super admins & admins have full modification capability
  if public.is_admin() then
    return new;
  end if;

  -- Delegated verifiers can only modify verification fields (not suspension or deletion)
  if public.can_verify_members() then
    new.is_suspended    := old.is_suspended;
    new.suspended_until := old.suspended_until;
    new.deleted_at      := old.deleted_at;
    new.created_at      := old.created_at;
    return new;
  end if;

  -- Regular members cannot self-verify or modify privileged columns
  new.is_verified       := old.is_verified;
  new.verified_at       := old.verified_at;
  new.verification_type := old.verification_type;
  new.is_suspended      := old.is_suspended;
  new.suspended_until   := old.suspended_until;
  new.deleted_at        := old.deleted_at;
  new.created_at        := old.created_at;
  return new;
end;
$fn$;

-- 6. RLS Policies for verification_delegates
drop policy if exists delegates_select_admin on public.verification_delegates;
create policy delegates_select_admin
  on public.verification_delegates for select
  to authenticated
  using (public.can_verify_members() or user_id = auth.uid());

drop policy if exists delegates_modify_admin on public.verification_delegates;
create policy delegates_modify_admin
  on public.verification_delegates for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 7. RLS Policies for verification_requests
drop policy if exists requests_select on public.verification_requests;
create policy requests_select
  on public.verification_requests for select
  to authenticated
  using (user_id = auth.uid() or public.can_verify_members());

drop policy if exists requests_insert_own on public.verification_requests;
create policy requests_insert_own
  on public.verification_requests for insert
  to authenticated
  with check (user_id = auth.uid() and status = 'pending');

drop policy if exists requests_update_verifier on public.verification_requests;
create policy requests_update_verifier
  on public.verification_requests for update
  to authenticated
  using (public.can_verify_members())
  with check (public.can_verify_members());


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START: 20260904000024_community_pulse.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- Ezike Oba :: Migration 024
-- Community Pulse: Verified Members Active Within the Last 24 Hours

create or replace function public.get_community_pulse(p_limit int default 60)
returns table (
  user_id              uuid,
  username             citext,
  full_name            text,
  avatar_path          text,
  is_verified          boolean,
  verification_type    text,
  last_activity_at     timestamptz,
  latest_post_id       uuid
)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  with recent_activities as (
    -- Posts created within the last 24 hours
    select author_id as user_id, created_at as activity_at, id as post_id
      from public.posts
     where created_at >= (now() - interval '24 hours')
       and deleted_at is null

    union all

    -- Comments created within the last 24 hours
    select c.author_id as user_id, c.created_at as activity_at, c.post_id as post_id
      from public.comments c
     where c.created_at >= (now() - interval '24 hours')
       and c.deleted_at is null

    union all

    -- Reactions created within the last 24 hours
    select r.user_id as user_id, r.created_at as activity_at, r.post_id as post_id
      from public.reactions r
     where r.created_at >= (now() - interval '24 hours')
  ),
  aggregated_users as (
    select
      ra.user_id,
      max(ra.activity_at) as last_activity_at
    from recent_activities ra
    group by ra.user_id
  )
  select
    pr.id as user_id,
    pr.username,
    pr.full_name,
    pr.avatar_path,
    pr.is_verified,
    pr.verification_type,
    au.last_activity_at,
    (
      select p.id
        from public.posts p
       where p.author_id = pr.id
         and p.deleted_at is null
       order by p.created_at desc
       limit 1
    ) as latest_post_id
  from aggregated_users au
  join public.profiles pr on pr.id = au.user_id
 where pr.is_verified = true
   and pr.is_suspended = false
   and pr.deleted_at is null
 order by au.last_activity_at desc
 limit p_limit;
$fn$;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START: 20260904000025_advertising.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- Migration 025: Advertising & Local Business Promotion Engine
-- Schema, RLS policies, impression/click counters, and security definer functions for sponsored ads.

-- 1. Create ad_campaigns table
create table if not exists public.ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  advertiser_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 3 and 120),
  description text not null check (char_length(trim(description)) between 5 and 500),
  target_url text check (target_url is null or target_url ~* '^https?://'),
  image_url text check (image_url is null or image_url ~* '^https?://'),
  placement text not null check (placement in ('feed_sponsored', 'marketplace_banner', 'community_sidebar')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'active', 'paused', 'completed')),
  target_village_id uuid references public.geo_entities(id) on delete set null,
  budget_naira bigint not null default 0 check (budget_naira >= 0),
  impressions_count integer not null default 0 check (impressions_count >= 0),
  clicks_count integer not null default 0 check (clicks_count >= 0),
  rejection_reason text,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Enable RLS
alter table public.ad_campaigns enable row level security;

-- 3. RLS Policies
-- Public/Members can select active approved campaigns within valid date range
drop policy if exists ad_campaigns_select_active on public.ad_campaigns;
create policy ad_campaigns_select_active on public.ad_campaigns
  for select
  using (
    (status = 'active' and starts_at <= now() and ends_at >= now())
    or advertiser_id = auth.uid()
    or public.is_staff()
  );

-- Members can create ad campaigns for themselves (starts as pending)
drop policy if exists ad_campaigns_insert_own on public.ad_campaigns;
create policy ad_campaigns_insert_own on public.ad_campaigns
  for insert
  with check (
    advertiser_id = auth.uid()
    and status = 'pending'
    and public.is_active_member()
  );

-- Advertisers can update non-status fields or pause active ads; staff can update anything
drop policy if exists ad_campaigns_update on public.ad_campaigns;
create policy ad_campaigns_update on public.ad_campaigns
  for update
  using (advertiser_id = auth.uid() or public.is_staff())
  with check (advertiser_id = auth.uid() or public.is_staff());

-- Staff or owner can delete campaigns
drop policy if exists ad_campaigns_delete on public.ad_campaigns;
create policy ad_campaigns_delete on public.ad_campaigns
  for delete
  using (advertiser_id = auth.uid() or public.is_staff());

-- 4. Impression and Click Counter RPCs
create or replace function public.increment_ad_impressions(p_ad_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.ad_campaigns
  set impressions_count = impressions_count + 1,
      updated_at = now()
  where id = p_ad_id
    and status = 'active';
end;
$$;

create or replace function public.increment_ad_clicks(p_ad_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.ad_campaigns
  set clicks_count = clicks_count + 1,
      updated_at = now()
  where id = p_ad_id
    and status = 'active';
end;
$$;

-- 5. RPC to fetch active sponsored ads
create or replace function public.get_active_sponsored_ads(
  p_placement text default 'feed_sponsored',
  p_limit integer default 5
)
returns table (
  id uuid,
  advertiser_id uuid,
  title text,
  description text,
  target_url text,
  image_url text,
  placement text,
  status text,
  target_village_id uuid,
  budget_naira bigint,
  impressions_count integer,
  clicks_count integer,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz,
  advertiser_name text,
  advertiser_avatar text,
  advertiser_is_verified boolean,
  advertiser_verification_type text
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select
    a.id,
    a.advertiser_id,
    a.title,
    a.description,
    a.target_url,
    a.image_url,
    a.placement,
    a.status,
    a.target_village_id,
    a.budget_naira,
    a.impressions_count,
    a.clicks_count,
    a.starts_at,
    a.ends_at,
    a.created_at,
    p.full_name as advertiser_name,
    p.avatar_url as advertiser_avatar,
    p.is_verified as advertiser_is_verified,
    p.verification_type as advertiser_verification_type
  from public.ad_campaigns a
  join public.profiles p on p.id = a.advertiser_id
  where a.placement = p_placement
    and a.status = 'active'
    and a.starts_at <= now()
    and a.ends_at >= now()
  order by a.created_at desc
  limit p_limit;
$$;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START: 20260904000026_payments.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- Migration 026: Paystack Payments & Transactions Ledger
-- Records all platform payments (sponsored ads, featured marketplace listings, community donations).

do $$ begin
  create type public.payment_status as enum (
    'pending', 'success', 'failed', 'abandoned'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_purpose as enum (
    'ad_campaign', 'featured_listing', 'donation'
  );
exception when duplicate_object then null; end $$;

-- 1. Create payments table
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  reference text not null unique check (char_length(trim(reference)) between 8 and 100),
  amount_kobo bigint not null check (amount_kobo > 0),
  currency text not null default 'NGN' check (currency in ('NGN', 'USD')),
  status public.payment_status not null default 'pending',
  purpose public.payment_purpose not null,
  target_id uuid,
  paystack_reference text,
  channel text,
  paid_at timestamptz,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for performance
create index if not exists idx_payments_reference on public.payments(reference);
create index if not exists idx_payments_user_id on public.payments(user_id);
create index if not exists idx_payments_target_id on public.payments(target_id);

-- 2. Enable RLS
alter table public.payments enable row level security;

-- 3. RLS Policies
-- Users can view their own payment transactions; staff can view all payments for audit
create policy payments_select on public.payments
  for select
  using (user_id = auth.uid() or public.is_staff());

-- Active members can initiate payments for themselves
create policy payments_insert_own on public.payments
  for insert
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and public.is_active_member()
  );

-- Only staff or service role can update payments
create policy payments_update on public.payments
  for update
  using (public.is_staff())
  with check (public.is_staff());

-- Add payment_status column to ad_campaigns if not exists
alter table public.ad_campaigns 
  add column if not exists payment_status text not null default 'unpaid' 
  check (payment_status in ('unpaid', 'paid', 'refunded'));

-- Function to confirm payment and mark ad active/paid
create or replace function public.confirm_ad_payment(
  p_payment_reference text,
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

  update public.payments
  set
    status = 'success',
    paystack_reference = p_paystack_ref,
    channel = p_channel,
    paid_at = coalesce(p_paid_at, now()),
    updated_at = now()
  where id = v_payment.id;

  if v_payment.purpose = 'ad_campaign' and v_payment.target_id is not null then
    update public.ad_campaigns
    set
      payment_status = 'paid',
      updated_at = now()
    where id = v_payment.target_id;
  end if;

  return true;
end;
$$;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START: 20260904000027_community_projects.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

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

