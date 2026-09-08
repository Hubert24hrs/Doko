-- Migration 036: a community's slug identifies it on its own
--
-- `/communities/[slug]` needs a slug to name exactly one place. Today it does
-- not. The uniqueness index added in migration 002 is scoped to the PARENT:
--
--     create unique index geo_entities_parent_slug_key
--       on public.geo_entities (coalesce(parent_id, '000...'::uuid), slug);
--
-- which is the right constraint for a tree and the wrong one for a URL. Two
-- entities under different parents may hold the same slug, legally, and a flat
-- /communities/<slug> cannot then say which one it means.
--
-- THE SEED DOES NOT CURRENTLY COLLIDE, and it is worth being exact about why,
-- because the reason is the argument for this migration rather than against
-- it. `Ezzodo` is both a district of Enugu-Ezike and one of its INEC council
-- wards. Both hang off the same town, so they collided on the (parent_id, slug)
-- index and the ward was silently dropped by ON CONFLICT DO NOTHING -- 19 wards
-- loaded instead of 20 on the first real run. That was fixed by prefixing every
-- ward slug with `ward-`, and seed.sql records the whole episode.
--
-- So the guarantee /communities/<slug> needs is currently held by A NAMING
-- CONVENTION somebody remembered, in one file, discovered through a bug. An
-- admin adding a village named after a district through /admin/communities is
-- not bound by it. That is precisely the shape this audit has been closing all
-- week: a rule written as a comment rather than as a mechanism.
--
-- getGeoEntityBySlug() also used `.limit(1).maybeSingle()`, which would have
-- served whichever row came back first rather than failing. The `.limit(1)` is
-- now gone, so a duplicate raises instead of guessing -- and this index means
-- there can never be one.
--
-- WHY NOT A NESTED PATH. /communities/enugu-ezike/umuozzi/ogrute would also be
-- unambiguous, and it was rejected: admins move a village to a different
-- parent, merge duplicates and reorder siblings -- migration 002 exists to make
-- exactly that cheap -- and a path URL BREAKS on every such move. A flat slug
-- survives a village changing districts, which is the operation the schema was
-- designed around.
--
-- WHY NOT AN ID. It is unambiguous and unreadable, and these URLs are meant to
-- be said out loud and typed into a phone.

-- ---------------------------------------------------------------------------
-- 1. Resolve any existing collisions, deterministically
-- ---------------------------------------------------------------------------
--
-- On the seeded directory this loop finds NOTHING to do, and that is the
-- expected result -- the ward prefix already keeps every slug distinct. It is
-- here for entities an admin has added since, and for the next person who adds
-- a village named after a district without knowing about the `ward-` rule.
--
-- The row nearer the root keeps the bare slug, because it is the one a person
-- typing the name most likely means. Ties break on created_at then id, so this
-- produces the same result every time it is run -- and on a second run there
-- are no duplicates left to move.

do $$
declare
  r            record;
  v_candidate  citext;
  v_suffix     text;
  v_n          integer;
begin
  for r in
    with recursive tree as (
      select id, parent_id, 0 as depth
        from public.geo_entities
       where parent_id is null
      union all
      select e.id, e.parent_id, t.depth + 1
        from public.geo_entities e
        join tree t on e.parent_id = t.id
    ),
    live as (
      select e.id, e.slug, e.kind, e.created_at, t.depth
        from public.geo_entities e
        join tree t on t.id = e.id
       where e.deleted_at is null
    )
    select id, slug, kind
      from (
        select l.*,
               row_number() over (
                 partition by lower(l.slug::text)
                 order by l.depth asc, l.created_at asc, l.id asc
               ) as rn
          from live l
      ) ranked
     where rn > 1
     order by id
  loop
    -- 'area' is shown to people as "Ward", so that is what the URL should say.
    v_suffix := case r.kind::text when 'area' then 'ward' else r.kind::text end;
    v_candidate := (r.slug::text || '-' || v_suffix)::citext;

    v_n := 1;
    while exists (
      select 1 from public.geo_entities
       where deleted_at is null
         and lower(slug::text) = lower(v_candidate::text)
         and id <> r.id
    ) loop
      v_n := v_n + 1;
      v_candidate := (r.slug::text || '-' || v_suffix || '-' || v_n::text)::citext;
    end loop;

    update public.geo_entities set slug = v_candidate where id = r.id;
    raise notice 'geo slug collision: % -> %', r.slug, v_candidate;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Make it structural
-- ---------------------------------------------------------------------------
--
-- Partial on `deleted_at is null`: a soft-deleted entity keeps its slug so
-- historical references stay resolvable -- the same reasoning as
-- `merged_into_id` -- and it must not block a live entity from taking the name.
--
-- The per-parent index from migration 002 is left in place. It is now implied
-- by this one, but dropping it would be a change to the tree's own rules for
-- no benefit.

create unique index if not exists geo_entities_slug_unique
  on public.geo_entities (lower(slug::text))
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 3. Give the admin tools a way to pick a free slug
-- ---------------------------------------------------------------------------
--
-- With the index in place, an admin renaming two villages to the same name
-- would now get a bare constraint violation. `handle_new_user` already solves
-- this problem for usernames with a de-duplication loop; this is the same
-- answer for places, so the application can ASK for a free slug rather than
-- discovering it is not free by failing.

create or replace function public.geo_free_slug(
  desired_name text,
  self_id uuid default null
)
returns citext
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_base      text := public.slugify(desired_name);
  v_candidate citext;
  v_n         integer := 1;
begin
  if v_base is null or length(btrim(v_base)) = 0 then
    raise exception 'A community name must produce a usable slug'
      using errcode = 'check_violation';
  end if;

  v_candidate := v_base::citext;

  while exists (
    select 1 from public.geo_entities
     where deleted_at is null
       and lower(slug::text) = lower(v_candidate::text)
       and (self_id is null or id <> self_id)
  ) loop
    v_n := v_n + 1;
    v_candidate := (v_base || '-' || v_n::text)::citext;
  end loop;

  return v_candidate;
end;
$fn$;

-- Reading the geography is public -- /communities is an anonymous page -- so
-- this is readable by anyone. It discloses nothing that the directory does not
-- already show. Stated explicitly rather than left at the PUBLIC default,
-- which is the habit migration 028 was written to establish.
revoke execute on function public.geo_free_slug(text, uuid) from public;
grant execute on function public.geo_free_slug(text, uuid) to anon, authenticated, service_role;
