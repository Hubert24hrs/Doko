-- Migration 037: a community admin edits their community, not the map
--
-- geo_entities_update_admin (migration 005) reads:
--
--     using (public.is_admin() or public.administers_geo(id))
--     with check (public.is_admin() or public.administers_geo(id))
--
-- and the comment above it says "a community_admin may edit only their own
-- subtree". The policy decides WHICH ROWS they may touch. It says nothing
-- about WHICH COLUMNS, and RLS grants the whole row -- so a community_admin
-- scoped to one village could:
--
--   * set `parent_id` to any other entity, moving their village into a
--     district they have no authority over. The WITH CHECK still passes,
--     because administers_geo(id) is evaluated on the row's OWN id and the id
--     never changes;
--   * set `kind = 'lga'` with `parent_id = null`, which the
--     geo_entities_root_only_lga CHECK permits -- promoting their village to a
--     second Local Government Area sitting at the root of the tree, where
--     /communities renders it beside Igbo-Eze North;
--   * set `merged_into_id`, which now redirects their community's page
--     somewhere else entirely;
--   * set `deleted_at`, removing their community from the directory; or
--   * take another community's slug, breaking its URL. (Migration 036's unique
--     index stops the collision, but not the theft of a freed one.)
--
-- This is the eighth table in this codebase where a self-owned UPDATE policy
-- was paired with a prose comment instead of a guard trigger, and the fix is
-- the one every other table already uses: restore the columns the caller does
-- not own, rather than raising. Restoring is quieter for a client that sends a
-- whole row back, and it cannot be bypassed by omitting a field.
--
-- WHAT A COMMUNITY ADMIN KEEPS is everything that describes the place --
-- name, aliases, description, coordinates, cover image, sort order. That is
-- the whole point of the role: the person in Umuida knows how Umuida is
-- spelled, and the seed's own provenance note says sources disagree and admins
-- correct it in-app.
--
-- WHAT ONLY A PLATFORM ADMIN MAY CHANGE is the SHAPE of the tree: parent_id,
-- kind, slug, merged_into_id, status, deleted_at. Moving, merging and removing
-- are structural acts with effects outside the mover's own community.

create or replace function public.geo_entities_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  -- The platform itself: migrations, definer functions, the seed. auth.uid()
  -- is NULL for all of them, and SECURITY DEFINER does not change that --
  -- the lesson migration 032 was written for.
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  -- Everyone else who reached this row did so through
  -- `administers_geo(id)`, i.e. a community_admin inside their own subtree.
  -- They describe the place; they do not move it.
  new.id             := old.id;
  new.parent_id      := old.parent_id;
  new.kind           := old.kind;
  new.slug           := old.slug;
  new.merged_into_id := old.merged_into_id;
  new.status         := old.status;
  new.deleted_at     := old.deleted_at;
  new.created_at     := old.created_at;

  return new;
end;
$fn$;

drop trigger if exists geo_entities_guard_trigger on public.geo_entities;
create trigger geo_entities_guard_trigger
  before update on public.geo_entities
  for each row execute function public.geo_entities_guard();

-- ---------------------------------------------------------------------------
-- One invariant that binds admins too
-- ---------------------------------------------------------------------------
--
-- geo_entities_root_only_lga enforces `kind = 'lga' <-> parent_id is null`,
-- which permits a SECOND lga at the root. This directory describes exactly one
-- Local Government Area; a second root is not a thing an admin means to create,
-- and /communities renders every root as a top-level branch, so the first
-- symptom would be the whole directory appearing twice.
--
-- Enforced as a trigger rather than a CHECK because a CHECK cannot see other
-- rows.

create or replace function public.geo_entities_single_root()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if new.kind = 'lga' and new.deleted_at is null then
    if exists (
      select 1 from public.geo_entities
       where kind = 'lga'
         and deleted_at is null
         and id <> new.id
    ) then
      raise exception
        'This directory holds one Local Government Area; % already exists',
        (select name from public.geo_entities
          where kind = 'lga' and deleted_at is null and id <> new.id limit 1)
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$fn$;

drop trigger if exists geo_entities_single_root_trigger on public.geo_entities;
create trigger geo_entities_single_root_trigger
  before insert or update on public.geo_entities
  for each row execute function public.geo_entities_single_root();
