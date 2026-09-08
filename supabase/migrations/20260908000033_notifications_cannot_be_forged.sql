-- Migration 033: a member cannot plant a notification in somebody else's tray
--
-- Migration 022 wrote this, with the comment "Triggers or system functions can
-- insert":
--
--     create policy notifications_insert_authenticated
--       on public.notifications for insert
--       to authenticated
--       with check (public.is_active_member());
--
-- The check constrains the INSERTER and says nothing at all about `user_id`.
-- Any signed-in member could therefore write a row into ANY member's
-- notification tray, choosing its `title`, its `body`, its `actor_id` and its
-- `link` -- a notification that appears to come from the Igwe, saying whatever
-- the sender likes, pointing wherever the sender likes. Send one to every
-- profile id and it is a broadcast channel nobody granted anyone.
--
-- The policy was not merely too wide; it was never needed. Every notification
-- in this schema is written by a trigger, and every one of those triggers is
-- SECURITY DEFINER -- notify_on_issue_confirmed() and
-- notify_on_issue_status_change() run as the owner and are not subject to RLS
-- at all. The application never inserts one either: src/features/notifications
-- only ever selects and marks read. The policy existed to permit something
-- that did not require permission, and granted forgery to everybody as the
-- price.
--
-- This is the same pattern `audit_logs` settled in migration 004 -- "no
-- INSERT/UPDATE/DELETE policy for anyone; rows arrive only through
-- log_admin_action()" -- and the same one `conversations` settled in 015. A
-- table whose rows are written on somebody else's behalf does not have a
-- member-facing INSERT policy.

drop policy if exists notifications_insert_authenticated on public.notifications;
revoke insert on public.notifications from authenticated, anon;

-- ---------------------------------------------------------------------------
-- The only legitimate update is marking one read
-- ---------------------------------------------------------------------------
--
-- notifications_update_own admits `user_id = auth.uid()`, which grants the
-- whole ROW and not the one column the feature needs. Without a guard a member
-- can rewrite the title, body and link of their own notifications -- which is
-- not a disclosure, since nobody else reads them, but it does mean a
-- notification is not evidence of anything. Every other table in this schema
-- that grants a self-owned UPDATE pairs it with a guard; this one did not.

create or replace function public.notifications_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  -- The platform itself: definer triggers and migrations, whose auth.uid() is
  -- NULL. SECURITY DEFINER changes the executing role, not auth.uid() -- the
  -- lesson migration 032 was written for.
  if auth.uid() is null then
    return new;
  end if;

  new.user_id    := old.user_id;
  new.actor_id   := old.actor_id;
  new.type       := old.type;
  new.title      := old.title;
  new.body       := old.body;
  new.link       := old.link;
  new.created_at := old.created_at;

  return new;
end;
$fn$;

drop trigger if exists notifications_guard_trigger on public.notifications;
create trigger notifications_guard_trigger
  before update on public.notifications
  for each row execute function public.notifications_guard();

-- ---------------------------------------------------------------------------
-- A notification's link is a place in this app, not a place on the internet
-- ---------------------------------------------------------------------------
--
-- `link` was plain text up to 300 characters with nothing constraining its
-- shape, so a forged row could carry an absolute URL and the notification list
-- would render it as a link the member has every reason to trust. The two
-- triggers only ever write '/issues/<id>', so the constraint costs nothing and
-- makes the intent structural -- the same discipline as the http(s) CHECK on
-- profile_social_links, which is why `javascript:` cannot be stored there at
-- all.
--
-- NOT VALID: this runs against a live table, and the constraint's job is to
-- refuse future rows rather than to fail the migration over a historical one.
-- Every row the triggers wrote already satisfies it.
do $$ begin
  alter table public.notifications
    add constraint notifications_link_relative
    check (
      link is null
      or (link like '/%' and link not like '//%' and link !~ '[[:cntrl:]]')
    )
    not valid;
exception when duplicate_object then null; end $$;
