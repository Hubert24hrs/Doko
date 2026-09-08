-- Ezike Oba :: community slugs
--
-- Run either way:
--   * locally:  supabase test db
--   * hosted:   paste this whole file into the Supabase SQL Editor
--               (requires: create extension if not exists pgtap with schema extensions;)
--
-- /communities/[slug] rests entirely on a slug naming exactly one place, and
-- migration 002's unique index does not provide that: it is scoped to the
-- PARENT, which is correct for a tree and useless for a URL. Two entities under
-- different parents may hold the same slug, legally.
--
-- The seeded directory does NOT currently collide, and the reason is the point.
-- `Ezzodo` is both a district of Enugu-Ezike and one of its INEC council wards,
-- both under the same town -- so they DID collide, the ward was silently dropped
-- by ON CONFLICT DO NOTHING, and 19 wards loaded instead of 20 on the first real
-- run. The fix was to prefix every ward slug with `ward-`, and seed.sql records
-- the whole episode.
--
-- So the guarantee this page needs is currently held by A NAMING CONVENTION in
-- one file, arrived at through a bug. An admin adding a village named after a
-- district through /admin/communities is not bound by it.
--
-- Assertion 1 is the one that matters: it asks the LIVE DIRECTORY, not a
-- fixture, whether any two communities share a slug. A suite that only tested
-- its own fixtures would never notice the day that stopped being true.

begin;

set local search_path = public, extensions, pg_temp;
select plan(12);

create table public._tap_out (
  at   timestamptz not null default clock_timestamp(),
  line text
);
grant insert, select on public._tap_out to public;
alter table public._tap_out disable row level security;

create or replace function pg_temp.become_anon()
returns void language plpgsql as $$
begin
  execute 'set local role anon';
  execute 'set local request.jwt.claims to ''{"role":"anon"}''';
end $$;

-- ===========================================================================
-- The real directory, not a fixture
-- ===========================================================================

insert into public._tap_out(line) select is(
  (select count(*)::int
     from (
       select lower(slug::text) as s
         from public.geo_entities
        where deleted_at is null
        group by lower(slug::text)
       having count(*) > 1
     ) dupes),
  0, 'no two live communities share a slug'
);

-- The two Ezzodos, held apart today by the seed's `ward-` prefix rather than by
-- the database. Both must resolve, and to different places.
insert into public._tap_out(line) select is(
  (select kind::text from public.geo_entities
    where lower(slug::text) = 'ezzodo' and deleted_at is null),
  'district', 'ezzodo resolves to the district'
);

insert into public._tap_out(line) select is(
  (select count(*)::int from public.geo_entities
    where lower(slug::text) = 'ward-ezzodo' and deleted_at is null),
  1, 'and the council ward of the same name resolves separately'
);

insert into public._tap_out(line) select is(
  (select name from public.geo_entities
    where lower(slug::text) = 'ward-ezzodo' and deleted_at is null),
  'Ezzodo', 'both are genuinely called Ezzodo -- only their URLs differ'
);

-- ===========================================================================
-- The index refuses a new collision
-- ===========================================================================

insert into public.geo_entities (id, parent_id, kind, name, slug)
values ('8a000000-0000-0000-0000-0000000000a1',
        (select id from public.geo_entities where kind = 'lga' limit 1),
        'town', 'Tap Slug Town', 'tap-slug-town');

insert into public._tap_out(line) select throws_ok(
  $$insert into public.geo_entities (parent_id, kind, name, slug)
    values ((select id from public.geo_entities where kind = 'town'
              and slug = 'tap-slug-town'),
            'village', 'Somewhere Else', 'tap-slug-town')$$,
  '23505', null,
  'a second community cannot take a slug already in use'
);

-- Under a DIFFERENT parent, which the old per-parent index allowed and this one
-- does not. The Ezzodo pair happened to share a parent, so the old index caught
-- it -- loudly enough to lose a ward. Nothing caught this case at all.
insert into public._tap_out(line) select throws_ok(
  $$insert into public.geo_entities (parent_id, kind, name, slug)
    values ((select id from public.geo_entities where kind = 'lga' limit 1),
            'town', 'Somewhere Else Again', 'tap-slug-town')$$,
  '23505', null,
  'not even under a different parent, which is how Ezzodo happened'
);

-- A soft-deleted entity keeps its slug so historical references stay
-- resolvable -- the same reasoning as merged_into_id -- and must not hold the
-- name against a live community.
update public.geo_entities set deleted_at = now()
 where lower(slug::text) = 'tap-slug-town';

insert into public._tap_out(line) select lives_ok(
  $$insert into public.geo_entities (parent_id, kind, name, slug)
    values ((select id from public.geo_entities where kind = 'lga' limit 1),
            'town', 'Tap Slug Town Again', 'tap-slug-town')$$,
  'a withdrawn community does not hold its slug against a live one'
);

-- ===========================================================================
-- geo_free_slug: ask for a free name rather than discover it is taken
-- ===========================================================================

insert into public._tap_out(line) select is(
  public.geo_free_slug('Completely Unused Place Name')::text,
  'completely-unused-place-name',
  'an unused name slugifies straight through'
);

insert into public._tap_out(line) select is(
  public.geo_free_slug('Ezzodo')::text,
  'ezzodo-2', 'a taken name comes back numbered, the way usernames already do'
);

-- Renaming a community to what it is already called must not append -2 to its
-- own slug on every save.
insert into public._tap_out(line) select is(
  public.geo_free_slug(
    'Ezzodo',
    (select id from public.geo_entities
      where lower(slug::text) = 'ezzodo' and deleted_at is null)
  )::text,
  'ezzodo', 'and a community editing itself keeps the slug it already has'
);

insert into public._tap_out(line) select throws_ok(
  $$select public.geo_free_slug('   ')$$,
  '23514', null,
  'a name that slugifies to nothing is refused rather than stored blank'
);

-- ===========================================================================
-- Who may ask
--
-- /communities is an anonymous page, so reading the geography is public. Said
-- out loud rather than left at the PUBLIC default -- the habit migration 028
-- exists to establish.
-- ===========================================================================

select pg_temp.become_anon();
insert into public._tap_out(line) select lives_ok(
  $$select public.geo_free_slug('Anonymous Reader Place')$$,
  'a signed-out visitor can resolve a slug, because the directory is public'
);
reset role;

insert into public._tap_out(line) select * from finish();

select coalesce(
  (select string_agg(line, chr(10) order by at)
     from public._tap_out
    where line not like 'ok %'),
  'ALL ASSERTIONS PASSED'
) as result;
rollback;
