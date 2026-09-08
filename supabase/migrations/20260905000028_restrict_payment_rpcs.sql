-- Migration 028: close two holes in the money path
--
-- Both were found while writing the first pgTAP suite for payments, which is
-- the point of writing one.
--
-- ---------------------------------------------------------------------------
-- 1. THE CONFIRMING FUNCTIONS WERE CALLABLE BY ANY MEMBER
--
-- confirm_ad_payment() and confirm_project_donation() are SECURITY DEFINER,
-- and migrations 026 and 027 never revoked EXECUTE. PostgreSQL grants EXECUTE
-- to PUBLIC on a new function by default, so both were reachable over
-- PostgREST at /rest/v1/rpc/... by anybody holding an ordinary member session.
--
-- A member always knows their own payment reference -- the application gives
-- it to them to start the checkout -- so the attack was simply: call
-- confirm_ad_payment with your own pending reference and receive a campaign
-- marked paid, having paid nothing. Paystack is never consulted by the
-- database; it has no way to know whether money moved.
--
-- These functions exist to be called BY THE PLATFORM after Paystack has been
-- verified, which is exactly what the service role is for. Nobody else needs
-- to reach them, so nobody else may.
--
-- ---------------------------------------------------------------------------
-- 2. THE DONATION AMOUNT WAS TAKEN FROM THE CALLER
--
-- confirm_project_donation() added its `p_amount_naira` PARAMETER to
-- community_projects.raised_amount_naira, without ever comparing it to what
-- was actually charged. The payment row already records the amount in
-- amount_kobo, and that is the only figure with money behind it.
--
-- The parameter is kept so the existing call sites do not break, but it is now
-- CHECKED rather than trusted: the amount credited is derived from the payment
-- row, and a caller whose figure disagrees is refused rather than quietly
-- corrected. A mismatch means either a bug or an attack, and both are worth
-- surfacing rather than absorbing.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- The revocations
--
-- `from public` removes the default grant; anon and authenticated are named
-- explicitly as well, because a role that was granted EXECUTE directly keeps
-- it when only PUBLIC is revoked.
-- ---------------------------------------------------------------------------

revoke execute on function public.confirm_ad_payment(text, text, text, timestamptz)
  from public, anon, authenticated;

revoke execute on function public.confirm_project_donation(text, uuid, bigint, text, text, timestamptz)
  from public, anon, authenticated;

-- service_role is what the webhook and the server action use. It bypasses RLS
-- already, so granting it here adds no reach it did not have.
grant execute on function public.confirm_ad_payment(text, text, text, timestamptz)
  to service_role;

grant execute on function public.confirm_project_donation(text, uuid, bigint, text, text, timestamptz)
  to service_role;

-- ---------------------------------------------------------------------------
-- The donation amount, derived rather than trusted
-- ---------------------------------------------------------------------------

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
set search_path = public, pg_temp
as $$
declare
  v_payment record;
  v_amount_naira bigint;
begin
  select * into v_payment from public.payments
  where reference = p_payment_reference and status = 'pending'
  for update;

  if not found then
    return false;
  end if;

  -- The payment row is the only record with money behind it. Kobo to naira,
  -- rounded the same way the callers round it.
  v_amount_naira := round(v_payment.amount_kobo / 100.0);

  -- A caller disagreeing with the ledger is a bug or an attack. Refusing is
  -- the honest outcome; silently crediting the smaller figure would hide it.
  if p_amount_naira is distinct from v_amount_naira then
    raise exception 'Donation amount % does not match the payment of % naira',
      p_amount_naira, v_amount_naira
      using errcode = 'check_violation';
  end if;

  -- The payment must also belong to the project being credited, or a
  -- donation to one project could be used to inflate another.
  if v_payment.target_id is distinct from p_project_id then
    raise exception 'Payment % is not for project %',
      p_payment_reference, p_project_id
      using errcode = 'check_violation';
  end if;

  update public.payments
  set
    status = 'success',
    paystack_reference = p_paystack_ref,
    channel = p_channel,
    paid_at = coalesce(p_paid_at, now()),
    updated_at = now()
  where id = v_payment.id;

  update public.community_projects
  set
    raised_amount_naira = raised_amount_naira + v_amount_naira,
    donors_count = donors_count + 1,
    status = case
      when (raised_amount_naira + v_amount_naira) >= target_amount_naira
        then 'completed'::public.project_status
      else status
    end,
    updated_at = now()
  where id = p_project_id;

  return true;
end;
$$;

-- CREATE OR REPLACE resets the function's privileges to the default, so the
-- revocation has to be repeated after it. Leaving this out would have undone
-- the fix above in the same migration that made it.
revoke execute on function public.confirm_project_donation(text, uuid, bigint, text, text, timestamptz)
  from public, anon, authenticated;

grant execute on function public.confirm_project_donation(text, uuid, bigint, text, text, timestamptz)
  to service_role;
