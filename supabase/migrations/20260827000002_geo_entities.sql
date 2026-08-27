-- Ezike Oba :: Foundation 002
-- The Igbo-Eze North geographic tree.
--
-- DESIGN DECISION (see docs/ARCHITECTURE.md):
-- One adjacency-list table with a `kind` discriminator instead of separate
-- towns/districts/villages tables. Admins must be able to move a village to a
-- different parent, merge duplicates, reorder siblings and mark entities
-- historical. Those operations are trivial on one tree and painful across five
-- tables with cross-table foreign keys. Read-side ergonomics are restored with
-- the views at the bottom of this file.

create table if not exists public.geo_entities (
  id            uuid primary key default gen_random_uuid(),
  parent_id     uuid references public.geo_entities(id) on delete restrict,
  kind          public.geo_kind not null,
  name          text not null,
  slug          citext not null,
  aliases       text[] not null default '{}',
  description   text,
  latitude      double precision,
  longitude     double precision,
  cover_image_path text,
  sort_order    integer not null default 0,
  status        public.geo_status not null default 'active',
  -- Set when an entity is merged into another; keeps historical references
  -- resolvable instead of breaking them.
  merged_into_id uuid references public.geo_entities(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,

  constraint geo_entities_name_not_blank check (length(btrim(name)) > 0),
  constraint geo_entities_lat_range check (latitude is null or latitude between -90 and 90),
  constraint geo_entities_lng_range check (longitude is null or longitude between -180 and 180),
  -- An LGA is the root of the tree; everything else must hang off a parent.
  constraint geo_entities_root_only_lga check (
    (kind = 'lga' and parent_id is null) or (kind <> 'lga' and parent_id is not null)
  ),
  constraint geo_entities_no_self_parent check (parent_id is null or parent_id <> id),
  constraint geo_entities_no_self_merge check (merged_into_id is null or merged_into_id <> id)
);

-- Slug is unique per parent, so "Umuogbo" can exist under two districts.
create unique index if not exists geo_entities_parent_slug_key
  on public.geo_entities (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), slug)
  where deleted_at is null;

create index if not exists geo_entities_parent_idx on public.geo_entities (parent_id) where deleted_at is null;
create index if not exists geo_entities_kind_idx   on public.geo_entities (kind) where deleted_at is null;
create index if not exists geo_entities_status_idx on public.geo_entities (status) where deleted_at is null;
create index if not exists geo_entities_name_trgm_idx on public.geo_entities using gin (name gin_trgm_ops);
create index if not exists geo_entities_aliases_idx on public.geo_entities using gin (aliases);

drop trigger if exists geo_entities_set_updated_at on public.geo_entities;
create trigger geo_entities_set_updated_at
  before update on public.geo_entities
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Cycle guard: a move must never create a loop in the tree.
-- ---------------------------------------------------------------------------

create or replace function public.geo_entities_prevent_cycle()
returns trigger
language plpgsql
as $$
declare
  ancestor uuid := new.parent_id;
  hops int := 0;
begin
  while ancestor is not null loop
    if ancestor = new.id then
      raise exception 'geo_entities: cycle detected — % cannot be a descendant of itself', new.id
        using errcode = 'check_violation';
    end if;
    hops := hops + 1;
    if hops > 32 then
      raise exception 'geo_entities: tree deeper than 32 levels, aborting'
        using errcode = 'check_violation';
    end if;
    select parent_id into ancestor from public.geo_entities where id = ancestor;
  end loop;
  return new;
end;
$$;

drop trigger if exists geo_entities_cycle_guard on public.geo_entities;
create trigger geo_entities_cycle_guard
  before insert or update of parent_id on public.geo_entities
  for each row execute function public.geo_entities_prevent_cycle();

-- ---------------------------------------------------------------------------
-- Read helpers
-- ---------------------------------------------------------------------------

-- Full ancestor path for breadcrumbs, e.g. Igbo-Eze North > Enugu-Ezike > Ozzi > Ogrute
create or replace function public.geo_ancestors(entity_id uuid)
returns table (id uuid, kind public.geo_kind, name text, slug citext, depth int)
language sql
stable
as $$
  with recursive up as (
    select e.id, e.parent_id, e.kind, e.name, e.slug, 0 as depth
      from public.geo_entities e
     where e.id = entity_id
    union all
    select p.id, p.parent_id, p.kind, p.name, p.slug, up.depth + 1
      from public.geo_entities p
      join up on p.id = up.parent_id
  )
  select up.id, up.kind, up.name, up.slug, up.depth from up order by up.depth desc;
$$;

-- All descendants of an entity (used for "everything in this town" queries).
create or replace function public.geo_descendants(entity_id uuid)
returns table (id uuid, kind public.geo_kind, name text, slug citext, depth int)
language sql
stable
as $$
  with recursive down as (
    select e.id, e.kind, e.name, e.slug, 0 as depth
      from public.geo_entities e
     where e.id = entity_id
    union all
    select c.id, c.kind, c.name, c.slug, down.depth + 1
      from public.geo_entities c
      join down on c.parent_id = down.id
     where c.deleted_at is null
  )
  select down.id, down.kind, down.name, down.slug, down.depth from down;
$$;

create or replace view public.v_towns as
  select * from public.geo_entities where kind = 'town' and deleted_at is null;

create or replace view public.v_districts as
  select * from public.geo_entities where kind = 'district' and deleted_at is null;

create or replace view public.v_villages as
  select * from public.geo_entities where kind = 'village' and deleted_at is null;

create or replace view public.v_autonomous_communities as
  select * from public.geo_entities where kind = 'autonomous_community' and deleted_at is null;
