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