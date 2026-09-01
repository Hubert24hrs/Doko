-- Ezike Oba :: schema and integrity tests
--
-- Run either way:
--   * locally:  supabase test db
--   * hosted:   paste this whole file into the Supabase SQL Editor
-- Requires pgTAP, which the Supabase local stack enables automatically.
--
-- These verify the structural guarantees the application relies on. If any
-- of these fail, the corresponding claim in docs/ARCHITECTURE.md is false.

begin;

-- pgTAP installs into the `extensions` schema on hosted Supabase, which is not
-- on the SQL Editor's default search_path. Without this line every assertion
-- fails with "function plan(integer) does not exist". `set local` reverts when
-- the surrounding transaction ends.
set local search_path = public, extensions, pg_temp;
select plan(38);

-- ---------------------------------------------------------------------------
-- Extensions and enums
-- ---------------------------------------------------------------------------

select has_extension('pgcrypto');
select has_extension('citext');
select has_extension('pg_trgm');

select has_type('public', 'app_role', 'app_role enum exists');
select has_type('public', 'geo_kind', 'geo_kind enum exists');
select has_type('public', 'geo_status', 'geo_status enum exists');
select has_type('public', 'profile_visibility', 'profile_visibility enum exists');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

select has_table('public', 'geo_entities', 'geo_entities exists');
select has_table('public', 'profiles', 'profiles exists');
select has_table('public', 'profile_social_links', 'profile_social_links exists');
select has_table('public', 'user_roles', 'user_roles exists');
select has_table('public', 'audit_logs', 'audit_logs exists');
select has_table('public', 'rate_limit_counters', 'rate_limit_counters exists');

-- ---------------------------------------------------------------------------
-- RLS must be enabled on every exposed table. This is the single most
-- important structural assertion in the suite.
-- ---------------------------------------------------------------------------

select ok(
  (select relrowsecurity from pg_class where oid = 'public.geo_entities'::regclass),
  'RLS enabled on geo_entities'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'RLS enabled on profiles'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.profile_social_links'::regclass),
  'RLS enabled on profile_social_links'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.user_roles'::regclass),
  'RLS enabled on user_roles'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.audit_logs'::regclass),
  'RLS enabled on audit_logs'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.rate_limit_counters'::regclass),
  'RLS enabled on rate_limit_counters'
);

-- audit_logs must have NO write policy for anyone, including admins.
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'audit_logs'
      and cmd in ('INSERT', 'UPDATE', 'DELETE')),
  0,
  'audit_logs has no INSERT/UPDATE/DELETE policy for any role'
);

-- rate_limit_counters must be unreachable through PostgREST.
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'rate_limit_counters'),
  0,
  'rate_limit_counters has no policies at all'
);

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

select has_function('public', 'has_role', 'has_role exists');
select has_function('public', 'is_staff', 'is_staff exists');
select has_function('public', 'is_admin', 'is_admin exists');
select has_function('public', 'is_super_admin', 'is_super_admin exists');
select has_function('public', 'administers_geo', 'administers_geo exists');
select has_function('public', 'shares_community_with', 'shares_community_with exists');
select has_function('public', 'log_admin_action', 'log_admin_action exists');
select has_function('public', 'consume_rate_limit', 'consume_rate_limit exists');
select has_function('public', 'geo_ancestors', 'geo_ancestors exists');
select has_function('public', 'geo_descendants', 'geo_descendants exists');

-- Every RBAC helper must be SECURITY DEFINER, or the RLS policies that call
-- them would recurse.
select ok(
  (select bool_and(p.prosecdef)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('has_role','is_staff','is_admin','is_super_admin',
                        'administers_geo','shares_community_with',
                        'log_admin_action','consume_rate_limit')),
  'all RBAC and privileged helpers are SECURITY DEFINER'
);

-- ...and must pin search_path, or a hostile schema could shadow their calls.
select ok(
  (select bool_and(p.proconfig::text like '%search_path%')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('has_role','is_staff','is_admin','is_super_admin',
                        'administers_geo','shares_community_with',
                        'log_admin_action','consume_rate_limit')),
  'all SECURITY DEFINER helpers pin search_path'
);

-- ---------------------------------------------------------------------------
-- Geographic integrity
-- ---------------------------------------------------------------------------

-- A non-LGA entity cannot be a root.
select throws_ok(
  $$insert into public.geo_entities (parent_id, kind, name, slug)
    values (null, 'village', 'Orphan Village', 'orphan-village')$$,
  '23514',
  null,
  'a village cannot exist without a parent'
);

-- An LGA cannot have a parent.
select lives_ok(
  $$insert into public.geo_entities (parent_id, kind, name, slug)
    values (null, 'lga', 'Test LGA', 'test-lga')$$,
  'an LGA may be a root'
);

-- Self-parenting is rejected.
select throws_ok(
  $$update public.geo_entities
       set parent_id = id
     where slug = 'test-lga'$$,
  null,
  null,
  'an entity cannot be its own parent'
);

-- Latitude range is enforced.
select throws_ok(
  $$insert into public.geo_entities (parent_id, kind, name, slug, latitude)
    select id, 'town', 'Bad Coords', 'bad-coords', 999
      from public.geo_entities where slug = 'test-lga'$$,
  '23514',
  null,
  'latitude outside -90..90 is rejected'
);

-- ---------------------------------------------------------------------------
-- Profile constraints
-- ---------------------------------------------------------------------------

-- Only http(s) social links may be STORED, not merely not rendered.
select throws_ok(
  $$insert into public.profile_social_links (profile_id, platform, url)
    values (gen_random_uuid(), 'website', 'javascript:alert(1)')$$,
  null,
  null,
  'a javascript: URL cannot be stored as a social link'
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
