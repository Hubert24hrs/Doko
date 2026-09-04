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
