-- Ezike Oba :: Foundation 001
-- Extensions, enums and shared helper primitives.
-- Idempotent: safe to re-run against an existing database.

create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "citext";        -- case-insensitive text (usernames, emails)
create extension if not exists "pg_trgm";       -- trigram indexes for keyword search

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- Platform roles. Enforced in the database, never trusted from the client.
do $$ begin
  create type public.app_role as enum (
    'super_admin',
    'admin',
    'moderator',
    'community_admin',
    'verified_leader',
    'verified_business',
    'verified_organization',
    'citizen'
  );
exception when duplicate_object then null; end $$;

-- Levels of the Igbo-Eze North geographic tree.
-- Modelled as one adjacency-list table (see 002) rather than one table per
-- level, because admins must be able to move/merge/reorder entities freely.
do $$ begin
  create type public.geo_kind as enum (
    'lga',
    'town',
    'autonomous_community',
    'district',
    'village',
    'area'
  );
exception when duplicate_object then null; end $$;

-- Soft lifecycle state. Geographic records are never hard-deleted because
-- posts, events and issues reference them historically.
do $$ begin
  create type public.geo_status as enum ('active', 'historical', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.profile_visibility as enum ('public', 'community', 'private');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at honest
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Text helpers (defined before slugify: Postgres validates SQL bodies at
-- CREATE time, so a callee must already exist).
-- ---------------------------------------------------------------------------

-- unaccent is not enabled by default on every Supabase plan; this passthrough
-- keeps slugify() portable across projects.
create or replace function public.unaccent_fallback(value text)
returns text
language sql
immutable
strict
as $$
  select translate(
    value,
    'àáâãäåèéêëìíîïòóôõöùúûüñçÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÑÇ',
    'aaaaaaeeeeiiiiooooouuuuncAAAAAAEEEEIIIIOOOOOUUUUNC'
  );
$$;

-- ---------------------------------------------------------------------------
-- Slug helper: deterministic, used by seeds and admin CRUD
-- ---------------------------------------------------------------------------

create or replace function public.slugify(value text)
returns text
language sql
immutable
strict
as $$
  select trim(both '-' from
    regexp_replace(
      regexp_replace(lower(public.unaccent_fallback(value)), '[^a-z0-9]+', '-', 'g'),
      '-{2,}', '-', 'g'
    )
  );
$$;
