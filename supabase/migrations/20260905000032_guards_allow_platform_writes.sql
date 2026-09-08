-- Migration 032: let the platform through its own guards
--
-- Migrations 030 and 031 added guard triggers to ad_campaigns and
-- community_projects. Both were written on a false assumption, stated plainly
-- in 031's own comment:
--
--     "Written only by confirm_project_donation(), which runs as the definer
--      and is therefore not subject to this branch."
--
-- That is wrong. SECURITY DEFINER changes the EXECUTING ROLE; it does not
-- change auth.uid(), which reads the JWT claim off the session. When
-- confirm_project_donation() or confirm_ad_payment() runs -- from the webhook
-- with the service role, or from the SQL editor -- auth.uid() is NULL, so
-- is_staff() is false, so both guards took their member branch and restored
-- exactly the columns the payment had just written.
--
-- The effect was that migrations 030 and 031 broke the two paths they existed
-- to protect:
--
--   * a confirmed donation did not credit raised_amount_naira, and
--   * a confirmed ad payment did not set payment_status = 'paid'.
--
-- 19_community_projects caught the first. Nothing caught the second, because
-- 18_advertising asserted only that an ADVERTISER could not set payment_status
-- and never that the platform could -- a rule with no test, which is the exact
-- failure this whole exercise exists to find. An assertion for it is added to
-- that suite alongside this migration.
--
-- The fix is one condition. A NULL auth.uid() means nobody is acting as a
-- member: it is the service role, a definer function, or a migration. Members
-- always carry a uid, and an anon caller cannot reach either table's UPDATE
-- policy at all -- both require `= auth.uid()` or is_staff(), and NULL
-- satisfies neither -- so letting a NULL uid through the guard grants nothing
-- that RLS has not already allowed.

create or replace function public.ad_campaigns_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  -- The platform itself: service role, definer functions, migrations. RLS has
  -- already decided this caller may reach the row; the guard exists to stop
  -- MEMBERS writing what is not theirs, and there is no member here.
  if auth.uid() is null or public.is_staff() then
    return new;
  end if;

  new.impressions_count := old.impressions_count;
  new.clicks_count      := old.clicks_count;
  new.payment_status    := old.payment_status;
  new.rejection_reason  := old.rejection_reason;
  new.advertiser_id     := old.advertiser_id;

  if new.status is distinct from old.status then
    if (old.status = 'active' and new.status = 'paused')
       or (old.status = 'paused' and new.status = 'active') then
      null;
    else
      new.status := old.status;
    end if;
  end if;

  return new;
end;
$fn$;

create or replace function public.community_projects_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if auth.uid() is null or public.is_staff() then
    return new;
  end if;

  new.raised_amount_naira := old.raised_amount_naira;
  new.donors_count        := old.donors_count;
  new.creator_id          := old.creator_id;
  new.rejection_reason    := old.rejection_reason;

  if new.status is distinct from old.status then
    if (old.status = 'active' and new.status = 'paused')
       or (old.status = 'paused' and new.status = 'active') then
      null;
    else
      new.status := old.status;
    end if;
  end if;

  if old.raised_amount_naira > 0
     and new.target_amount_naira is distinct from old.target_amount_naira then
    new.target_amount_naira := old.target_amount_naira;
  end if;

  return new;
end;
$fn$;
