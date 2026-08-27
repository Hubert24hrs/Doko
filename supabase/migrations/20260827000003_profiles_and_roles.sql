-- Ezike Oba :: Foundation 003
-- Profiles (real people) and database-enforced role-based access control.

create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  username        citext not null,
  full_name       text not null,
  email           citext,
  phone           text,
  avatar_path     text,
  bio             text,
  occupation      text,
  website         text,
  date_of_birth   date,
  gender          text,
  -- Community affiliation is OPTIONAL by product rule: a user may not know or
  -- may not wish to disclose their village.
  town_id         uuid references public.geo_entities(id) on delete set null,
  community_id    uuid references public.geo_entities(id) on delete set null,
  village_id      uuid references public.geo_entities(id) on delete set null,
  visibility      public.profile_visibility not null default 'public',
  is_verified     boolean not null default false,
  verified_at     timestamptz,
  is_suspended    boolean not null default false,
  suspended_until timestamptz,
  onboarded_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,

  constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,30}$'),
  constraint profiles_full_name_not_blank check (length(btrim(full_name)) > 0),
  constraint profiles_bio_length check (bio is null or length(bio) <= 500),
  constraint profiles_website_scheme check (website is null or website ~* '^https?://'),
  constraint profiles_verified_consistency check (
    (is_verified = false and verified_at is null) or (is_verified = true and verified_at is not null)
  )
);

create unique index if not exists profiles_username_key on public.profiles (username) where deleted_at is null;
create index if not exists profiles_village_idx  on public.profiles (village_id) where deleted_at is null;
create index if not exists profiles_town_idx     on public.profiles (town_id) where deleted_at is null;
create index if not exists profiles_name_trgm_idx on public.profiles using gin (full_name gin_trgm_ops);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Social links: separate table so platforms can be added without a migration.
-- ---------------------------------------------------------------------------

create table if not exists public.profile_social_links (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  platform    text not null,
  url         text not null,
  created_at  timestamptz not null default now(),

  constraint social_platform_allowed check (
    platform in ('facebook','instagram','tiktok','x','linkedin','youtube','website','other')
  ),
  -- Only http(s). Blocks javascript:/data: payloads at the database boundary,
  -- in addition to sanitising on render.
  constraint social_url_scheme check (url ~* '^https?://')
);

create unique index if not exists profile_social_links_unique
  on public.profile_social_links (profile_id, platform, url);
create index if not exists profile_social_links_profile_idx
  on public.profile_social_links (profile_id);

-- ---------------------------------------------------------------------------
-- Roles. Stored in their own table, never on the profile row, so a compromised
-- profile UPDATE can never escalate privilege.
-- ---------------------------------------------------------------------------

create table if not exists public.user_roles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        public.app_role not null,
  -- Scoped roles: a community_admin administers ONE geographic entity.
  scope_id    uuid references public.geo_entities(id) on delete cascade,
  granted_by  uuid references auth.users(id) on delete set null,
  granted_at  timestamptz not null default now(),
  expires_at  timestamptz,

  constraint user_roles_scope_rule check (
    (role = 'community_admin' and scope_id is not null)
    or (role <> 'community_admin')
  )
);

create unique index if not exists user_roles_unique
  on public.user_roles (
    user_id,
    role,
    coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
create index if not exists user_roles_user_idx on public.user_roles (user_id);
create index if not exists user_roles_role_idx on public.user_roles (role);

-- ---------------------------------------------------------------------------
-- RBAC helper functions.
--
-- SECURITY DEFINER with a locked search_path. These are called from RLS
-- policies on user_roles itself, so they must not re-enter RLS or the policies
-- would recurse infinitely.
-- ---------------------------------------------------------------------------

create or replace function public.has_role(check_user_id uuid, check_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.user_roles r
     where r.user_id = check_user_id
       and r.role = check_role
       and (r.expires_at is null or r.expires_at > now())
  );
$fn$;

-- Staff = platform-wide privilege. Deliberately excludes community_admin,
-- which is scoped to a single entity.
create or replace function public.is_staff(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.user_roles r
     where r.user_id = check_user_id
       and r.role in ('super_admin', 'admin', 'moderator')
       and (r.expires_at is null or r.expires_at > now())
  );
$fn$;

create or replace function public.is_admin(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.user_roles r
     where r.user_id = check_user_id
       and r.role in ('super_admin', 'admin')
       and (r.expires_at is null or r.expires_at > now())
  );
$fn$;

create or replace function public.is_super_admin(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select public.has_role(check_user_id, 'super_admin'::public.app_role);
$fn$;

-- Is the caller the community_admin of this entity or any of its ancestors?
create or replace function public.administers_geo(entity_id uuid, check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1
      from public.user_roles r
      join public.geo_ancestors(entity_id) a on a.id = r.scope_id
     where r.user_id = check_user_id
       and r.role = 'community_admin'
       and (r.expires_at is null or r.expires_at > now())
  );
$fn$;

-- ---------------------------------------------------------------------------
-- New auth user -> profile row.
-- Username and full_name arrive from signup metadata; both are validated
-- server-side before signup is called, and again by CHECK constraints here.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  candidate_username citext;
  base_username citext;
  suffix int := 0;
begin
  base_username := lower(coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'username'), ''),
    'user_' || substr(replace(new.id::text, '-', ''), 1, 12)
  ));

  -- Strip anything the CHECK constraint would reject, then pad if too short.
  base_username := regexp_replace(base_username::text, '[^a-z0-9_]', '', 'g');
  if length(base_username::text) < 3 then
    base_username := 'user_' || substr(replace(new.id::text, '-', ''), 1, 12);
  end if;
  base_username := substr(base_username::text, 1, 24);
  candidate_username := base_username;

  -- Guarantee uniqueness even under a race; the unique index remains the
  -- final authority.
  while exists (select 1 from public.profiles p where p.username = candidate_username) loop
    suffix := suffix + 1;
    candidate_username := (substr(base_username::text, 1, 24) || '_' || suffix::text)::citext;
  end loop;

  insert into public.profiles (id, username, full_name, email)
  values (
    new.id,
    candidate_username,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), 'Ezike Oba member'),
    new.email
  )
  on conflict (id) do nothing;

  -- Every real person starts as a citizen.
  insert into public.user_roles (user_id, role)
  values (new.id, 'citizen')
  on conflict do nothing;

  return new;
end;
$fn$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
