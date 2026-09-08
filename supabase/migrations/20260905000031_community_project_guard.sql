-- Migration 031: a project creator cannot approve or fund their own appeal
--
-- community_projects_update (migration 027) admits `creator_id = auth.uid()`
-- and migration 027 added no guard trigger, so a creator could PATCH their own
-- row over PostgREST and:
--
--   * set status = 'active', putting an unreviewed fundraising appeal in front
--     of the community and skipping pending_review entirely; and
--   * set raised_amount_naira and donors_count to anything at all.
--
-- The second is the one that matters. A progress bar reading "4,800,000 naira
-- raised by 190 donors" is not a vanity metric -- it is the social proof that
-- persuades the next person to give, and on a diaspora crowdfunding page it is
-- the single most persuasive thing on the screen. A creator who can type that
-- number in can raise real money on a fabricated one.
--
-- Those two columns have exactly one legitimate writer: confirm_project_donation(),
-- which is SECURITY DEFINER and -- since migration 028 -- restricted to the
-- service role and made to derive the amount from the payments row rather than
-- from its caller. Between 028 and this migration, the tallies can now only
-- move when Paystack says money arrived.
--
-- This is the fourth Phase 5 table where the rule was written as a COMMENT and
-- not as a mechanism (see 028, 029, 030). The trigger below follows the same
-- restore-rather-than-raise pattern every Phase 2-4 table uses.

create or replace function public.community_projects_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  -- Staff moderate the queue; nothing below applies to them.
  if public.is_staff() then
    return new;
  end if;

  -- The money. Written only by confirm_project_donation(), which runs as the
  -- definer and is therefore not subject to this branch.
  new.raised_amount_naira := old.raised_amount_naira;
  new.donors_count        := old.donors_count;

  -- Whose appeal it is, and the queue's verdict on it.
  new.creator_id       := old.creator_id;
  new.rejection_reason := old.rejection_reason;

  -- A creator may take their own appeal down -- pausing asks nobody for
  -- anything -- and may put a paused one back to the state staff already
  -- approved. Every other status change is restored, which is what stops an
  -- appeal reaching 'active' without review.
  if new.status is distinct from old.status then
    if (old.status = 'active' and new.status = 'paused')
       or (old.status = 'paused' and new.status = 'active') then
      null;  -- allowed
    else
      new.status := old.status;
    end if;
  end if;

  -- The target cannot move once money is in. Lowering a goal after donations
  -- have arrived would flip an appeal to 'completed' on somebody else's money;
  -- raising it moves the finish line under people who already gave.
  if old.raised_amount_naira > 0
     and new.target_amount_naira is distinct from old.target_amount_naira then
    new.target_amount_naira := old.target_amount_naira;
  end if;

  return new;
end;
$fn$;

drop trigger if exists community_projects_guard_trigger on public.community_projects;
create trigger community_projects_guard_trigger
  before update on public.community_projects
  for each row execute function public.community_projects_guard();
