-- Migration 030: an advertiser cannot approve their own advert
--
-- ad_campaigns_update (migration 025) admits `advertiser_id = auth.uid()`,
-- and the migration's own comment describes the intent:
--
--     "Advertisers can update non-status fields or pause active ads;
--      staff can update anything"
--
-- Nothing enforced it. There is no guard trigger on ad_campaigns, so an
-- advertiser could PATCH their own row over PostgREST and set
-- status = 'active' directly -- putting an unapproved, unpaid advert into the
-- feed and making both the /admin/ads moderation queue and the payment gate
-- decorative.
--
-- This is the third time in the Phase 5 migrations that a rule was written as
-- a COMMENT rather than as a mechanism -- the same shape as the missing
-- EXECUTE revocations closed in 028 and the missing UPDATE policy closed in
-- 029. A comment describes what should happen; a trigger is what makes it so.
--
-- The trigger below follows the pattern every Phase 2-4 table already uses
-- (posts, events, jobs, marketplace listings): restore the columns the caller
-- does not own, rather than raising. Restoring is quieter for a client that
-- sends a whole row back, and it cannot be bypassed by omitting a field.
--
-- The one transition an advertiser DOES keep is pausing and resuming, because
-- that was the documented intent and it is not self-promotion: pausing takes
-- an advert down, and resuming only returns it to a state staff already
-- approved it into.

create or replace function public.ad_campaigns_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  -- Staff moderate; nothing below applies to them.
  if public.is_staff() then
    return new;
  end if;

  -- Counters are written only by increment_ad_impressions() and
  -- increment_ad_clicks(), which are SECURITY DEFINER and run as the owner --
  -- so they are not subject to this trigger's auth.uid() being a member.
  -- An advertiser editing their own row must not be able to type a number in.
  new.impressions_count := old.impressions_count;
  new.clicks_count      := old.clicks_count;

  -- Payment state belongs to the payment path (confirm_ad_payment, restricted
  -- to the service role in migration 028), never to the advertiser.
  new.payment_status := old.payment_status;

  -- The queue's verdict, and who the advert belongs to.
  new.rejection_reason := old.rejection_reason;
  new.advertiser_id    := old.advertiser_id;

  -- Status: pausing and resuming only. Every other change is restored, which
  -- is what stops an advertiser approving themselves.
  if new.status is distinct from old.status then
    if (old.status = 'active' and new.status = 'paused')
       or (old.status = 'paused' and new.status = 'active') then
      null;  -- allowed
    else
      new.status := old.status;
    end if;
  end if;

  return new;
end;
$fn$;

drop trigger if exists ad_campaigns_guard_trigger on public.ad_campaigns;
create trigger ad_campaigns_guard_trigger
  before update on public.ad_campaigns
  for each row execute function public.ad_campaigns_guard();
