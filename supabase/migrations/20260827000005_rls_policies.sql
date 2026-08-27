-- Ezike Oba :: Foundation 005
-- Row Level Security.
--
-- RLS is enabled on every table exposed through PostgREST, with explicit
-- policies per command. There is no "enable RLS with no policy and hope";
-- there is also no policy that exists only to make a feature work.
--
-- Reminder: policies are the LAST line of defence, not the only one. Server
-- code validates input before it ever reaches the database.

-- ===========================================================================
-- geo_entities: world-readable reference data, staff-writable.
-- ===========================================================================

alter table public.geo_entities enable row level security;

drop policy if exists geo_entities_select_public on public.geo_entities;
create policy geo_entities_select_public
  on public.geo_entities for select
  to anon, authenticated
  using (deleted_at is null);

-- Staff see everything including soft-deleted rows (needed for restore).
drop policy if exists geo_entities_select_staff on public.geo_entities;
create policy geo_entities_select_staff
  on public.geo_entities for select
  to authenticated
  using (public.is_staff());

drop policy if exists geo_entities_insert_admin on public.geo_entities;
create policy geo_entities_insert_admin
  on public.geo_entities for insert
  to authenticated
  with check (public.is_admin());

-- Admins may edit any entity; a community_admin may edit only their own
-- subtree.
drop policy if exists geo_entities_update_admin on public.geo_entities;
create policy geo_entities_update_admin
  on public.geo_entities for update
  to authenticated
  using (public.is_admin() or public.administers_geo(id))
  with check (public.is_admin() or public.administers_geo(id));

-- Only a super_admin may hard-delete geography, and the ON DELETE RESTRICT
-- foreign key still blocks deleting a parent that has children.
drop policy if exists geo_entities_delete_super_admin on public.geo_entities;
create policy geo_entities_delete_super_admin
  on public.geo_entities for delete
  to authenticated
  using (public.is_super_admin());

-- ===========================================================================
-- profiles
-- ===========================================================================

alter table public.profiles enable row level security;

-- A policy ON profiles must never SELECT FROM profiles: Postgres re-applies
-- the same policy to that subquery and aborts with "infinite recursion
-- detected in policy for relation profiles". This SECURITY DEFINER helper
-- reads the caller's own affiliation with RLS bypassed, which is safe because
-- it exposes nothing beyond the caller's own row.
create or replace function public.shares_community_with(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1
      from public.profiles viewer
      join public.profiles target on target.id = target_profile_id
     where viewer.id = auth.uid()
       and (
         (viewer.village_id   is not null and viewer.village_id   = target.village_id)
         or (viewer.community_id is not null and viewer.community_id = target.community_id)
         or (viewer.town_id      is not null and viewer.town_id      = target.town_id)
       )
  );
$fn$;

-- Own profile, always.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

-- Public profiles are visible to signed-in members; 'community' profiles only
-- to people sharing a town/community/village; 'private' to nobody else.
drop policy if exists profiles_select_visible on public.profiles;
create policy profiles_select_visible
  on public.profiles for select
  to authenticated
  using (
    deleted_at is null
    and (
      visibility = 'public'
      or (visibility = 'community' and public.shares_community_with(id))
    )
  );

-- Signed-out visitors see only explicitly public, non-suspended profiles.
drop policy if exists profiles_select_anon on public.profiles;
create policy profiles_select_anon
  on public.profiles for select
  to anon
  using (deleted_at is null and visibility = 'public' and is_suspended = false);

drop policy if exists profiles_select_staff on public.profiles;
create policy profiles_select_staff
  on public.profiles for select
  to authenticated
  using (public.is_staff());

-- A user edits their own profile. The trigger below stops them from editing
-- the fields that confer status.
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles for update
  to authenticated
  using (id = auth.uid() and deleted_at is null)
  with check (id = auth.uid());

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- No INSERT policy: profiles are created only by the handle_new_user trigger.
-- No DELETE policy: account removal cascades from auth.users.

-- ---------------------------------------------------------------------------
-- Privilege fields are not self-editable.
-- ---------------------------------------------------------------------------

create or replace function public.profiles_guard_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if public.is_admin() then
    return new;
  end if;

  -- Silently preserving these is safer than raising: a client that sends a
  -- full row back should not be able to grant itself a badge.
  new.is_verified     := old.is_verified;
  new.verified_at     := old.verified_at;
  new.is_suspended    := old.is_suspended;
  new.suspended_until := old.suspended_until;
  new.deleted_at      := old.deleted_at;
  new.created_at      := old.created_at;
  return new;
end;
$fn$;

drop trigger if exists profiles_guard_privileged on public.profiles;
create trigger profiles_guard_privileged
  before update on public.profiles
  for each row execute function public.profiles_guard_privileged_columns();

-- ===========================================================================
-- profile_social_links
-- ===========================================================================

alter table public.profile_social_links enable row level security;

-- Readable exactly when the owning profile is readable, so visibility rules
-- are not duplicated here and cannot drift.
drop policy if exists social_links_select on public.profile_social_links;
create policy social_links_select
  on public.profile_social_links for select
  to anon, authenticated
  using (
    exists (select 1 from public.profiles p where p.id = profile_id)
  );

drop policy if exists social_links_write_own on public.profile_social_links;
create policy social_links_write_own
  on public.profile_social_links for all
  to authenticated
  using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());

-- ===========================================================================
-- user_roles: readable by the owner and staff, writable only by admins.
-- ===========================================================================

alter table public.user_roles enable row level security;

drop policy if exists user_roles_select_own on public.user_roles;
create policy user_roles_select_own
  on public.user_roles for select
  to authenticated
  using (user_id = auth.uid() or public.is_staff());

-- Admins grant roles, but only a super_admin can mint another super_admin or
-- an admin. This is the platform's privilege-escalation boundary.
drop policy if exists user_roles_insert_admin on public.user_roles;
create policy user_roles_insert_admin
  on public.user_roles for insert
  to authenticated
  with check (
    case
      when role in ('super_admin', 'admin') then public.is_super_admin()
      else public.is_admin()
    end
  );

drop policy if exists user_roles_update_admin on public.user_roles;
create policy user_roles_update_admin
  on public.user_roles for update
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists user_roles_delete_admin on public.user_roles;
create policy user_roles_delete_admin
  on public.user_roles for delete
  to authenticated
  using (
    case
      when role in ('super_admin', 'admin') then public.is_super_admin()
      else public.is_admin()
    end
  );

-- ===========================================================================
-- audit_logs: append-only, staff-readable.
-- ===========================================================================

alter table public.audit_logs enable row level security;

drop policy if exists audit_logs_select_staff on public.audit_logs;
create policy audit_logs_select_staff
  on public.audit_logs for select
  to authenticated
  using (public.is_staff());

-- No INSERT / UPDATE / DELETE policy anywhere, for anyone. Rows arrive only
-- through log_admin_action(), which is SECURITY DEFINER. Nobody edits history.

-- ===========================================================================
-- Grants. RLS filters rows; grants decide whether the table is reachable.
-- ===========================================================================

grant usage on schema public to anon, authenticated;

grant select on public.geo_entities to anon, authenticated;
grant insert, update, delete on public.geo_entities to authenticated;

grant select on public.v_towns, public.v_districts, public.v_villages,
               public.v_autonomous_communities to anon, authenticated;

grant select on public.profiles to anon, authenticated;
grant update on public.profiles to authenticated;

grant select on public.profile_social_links to anon, authenticated;
grant insert, update, delete on public.profile_social_links to authenticated;

grant select on public.user_roles to authenticated;
grant insert, update, delete on public.user_roles to authenticated;

grant select on public.audit_logs to authenticated;

-- Views run with the privileges of their owner by default. Force them to
-- respect the caller's RLS instead.
alter view public.v_towns set (security_invoker = on);
alter view public.v_districts set (security_invoker = on);
alter view public.v_villages set (security_invoker = on);
alter view public.v_autonomous_communities set (security_invoker = on);
