-- Ezike Oba :: seed integrity tests
--
-- Run either way:
--   * locally:  supabase test db
--   * hosted:   paste this whole file into the Supabase SQL Editor
--
-- Unlike 01 and 02, this suite asserts against REAL SEEDED DATA rather than
-- fixtures, so it only passes on a database where supabase/seed.sql has been
-- applied. It exists because of a bug that shipped: 'Ezzodo' is both a
-- district and a council ward of Enugu-Ezike, both slugified to 'ezzodo'
-- under the same parent, and ON CONFLICT DO NOTHING silently discarded the
-- ward -- 19 loaded where 20 were expected. Nothing errored. Only counting
-- caught it.
--
-- Read-only: no begin/rollback needed, but wrapped anyway for symmetry.

begin;

-- pgTAP installs into the `extensions` schema on hosted Supabase, which is not
-- on the SQL Editor's default search_path. Without this line every assertion
-- fails with "function plan(integer) does not exist". `set local` reverts when
-- the surrounding transaction ends.
set local search_path = public, extensions, pg_temp;
select plan(9);

-- ---------------------------------------------------------------------------
-- Shape of the seeded tree
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from public.geo_entities where kind = 'lga' and deleted_at is null),
  1, 'exactly one LGA: Igbo-Eze North'
);

select is(
  (select count(*)::int from public.geo_entities where kind = 'town' and deleted_at is null),
  2, 'two towns: Enugu-Ezike and Ette'
);

select is(
  (select count(*)::int from public.geo_entities where kind = 'district' and deleted_at is null),
  4, 'four traditional districts of Enugu-Ezike'
);

select is(
  (select count(*)::int from public.geo_entities where kind = 'village' and deleted_at is null),
  31, 'thirty-one villages'
);

-- The assertion that would have caught the original bug.
select is(
  (select count(*)::int from public.geo_entities where kind = 'area' and deleted_at is null),
  20, 'twenty INEC council wards (17 Enugu-Ezike + 3 Ette)'
);

-- ---------------------------------------------------------------------------
-- The specific collision, now expected to coexist
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from public.geo_entities
    where name = 'Ezzodo' and deleted_at is null),
  2, 'Ezzodo exists twice: once as a district, once as a council ward'
);

select is(
  (select slug::text from public.geo_entities
    where name = 'Ezzodo' and kind = 'area' and deleted_at is null),
  'ward-ezzodo',
  'the Ezzodo ward is namespaced so it cannot collide with the district'
);

-- ---------------------------------------------------------------------------
-- The general rule, not just this one instance
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from (
     select parent_id, slug
       from public.geo_entities
      where deleted_at is null
      group by parent_id, slug
     having count(*) > 1
   ) duplicates),
  0,
  'no two live siblings share a slug'
);

-- Every ward slug is namespaced, so future ward names can repeat a district
-- name without being silently discarded.
select is(
  (select count(*)::int from public.geo_entities
    where kind = 'area' and deleted_at is null and slug not like 'ward-%'),
  0,
  'every council ward slug carries the ward- prefix'
);

-- The SQL Editor displays only the FINAL statement's result, and pgTAP's
-- finish() emits rows only when something failed -- so a clean run would show
-- nothing and be indistinguishable from a run whose output simply scrolled by.
-- Coalescing guarantees exactly one visible row either way: the failure
-- diagnostics, or an explicit all-clear.
select coalesce(
  (select string_agg(f, chr(10) order by n)
     from finish() with ordinality as t(f, n)),
  'ALL ASSERTIONS PASSED'
) as result;
rollback;
