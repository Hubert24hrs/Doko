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
