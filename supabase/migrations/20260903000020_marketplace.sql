-- Ezike Oba :: Phase 4 -- 020
-- The marketplace: buying and selling between neighbours.
--
-- This is the closest sibling jobs has, and reuses its shape wherever the
-- reasoning still holds: a public, indexable listing with contact details
-- kept off it, moderators who may remove but never rewrite, `group_id is
-- null` narrowing from the start.
--
-- Two things are different, and both follow from what a marketplace actually
-- is.
--
--   1. PHOTOS ARE THE WHOLE POINT. Nobody buys a used refrigerator sight
--      unseen. Jobs needed no image table; a listing without one is not a
--      listing. listing_media mirrors post_media almost exactly -- same
--      private bucket, same path convention, same signed-URL discipline --
--      because the reasoning that shaped post_media (migration 010) is
--      exactly reusable here.
--   2. CONTACT DETAILS ARE OPTIONAL, NOT REQUIRED. A job posting with no way
--      to reach the employer is not a posting at all, so that schema refuses
--      to save one. A marketplace listing has a second route that did not
--      exist when jobs was built: messaging (Phase 3). A seller who would
--      rather not publish a phone number can rely on "Message the seller"
--      instead, so listing_contacts is genuinely optional here.

do $$ begin
  create type public.listing_category as enum (
    'electronics', 'furniture', 'clothing_fashion', 'vehicles',
    'phones_computers', 'appliances', 'tools_equipment', 'books_stationery',
    'baby_kids', 'sports_hobbies', 'agriculture', 'building_materials',
    'food_produce', 'services', 'other'
  );
exception when duplicate_object then null; end $$;

-- Nullable on the row, not absent from the enum: a service or fresh produce
-- genuinely has no "condition", and forcing a choice would mean every service
-- listing lying about being 'new'.
do $$ begin
  create type public.listing_condition as enum (
    'new', 'like_new', 'good', 'fair', 'for_parts'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.listing_status as enum ('available', 'reserved', 'sold');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Listings
-- ---------------------------------------------------------------------------

create table if not exists public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),

  title       text not null,
  description text not null,
  category    public.listing_category not null default 'other',
  condition   public.listing_condition,

  -- Whole naira, as a job's pay is. NULL means "ask" -- a price nobody has
  -- decided, not a price of zero.
  price bigint,
  price_is_negotiable boolean not null default false,
  can_deliver boolean not null default false,

  seller_id uuid not null references public.profiles(id) on delete cascade,
  geo_id    uuid references public.geo_entities(id) on delete set null,
  location_text text,

  group_id   uuid references public.groups(id) on delete cascade,
  -- Reuses event_visibility rather than a fourth near-identical enum. A
  -- listing is exactly as public-or-community as an event or a job, and a
  -- fourth copy of 'public' | 'community' would be a fourth thing to keep in
  -- step with the others.
  visibility public.event_visibility not null default 'public',

  status public.listing_status not null default 'available',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  edited_at  timestamptz,
  deleted_at timestamptz,

  constraint listings_title_not_blank check (length(btrim(title)) > 0),
  constraint listings_title_length check (length(title) <= 160),
  constraint listings_description_not_blank check (length(btrim(description)) > 0),
  -- Shorter than a job's 8000: "selling my fridge, works fine, collect in
  -- Ogrute" is the shape of a real listing, and the photos carry what a long
  -- description would otherwise have to describe.
  constraint listings_description_length check (length(description) <= 4000),
  constraint listings_location_length
    check (location_text is null or length(location_text) <= 200),
  constraint listings_price_positive check (price is null or price > 0)
);

create index if not exists listings_created_idx
  on public.marketplace_listings (created_at desc) where deleted_at is null;
create index if not exists listings_category_idx
  on public.marketplace_listings (category) where deleted_at is null;
create index if not exists listings_status_idx
  on public.marketplace_listings (status) where deleted_at is null;
create index if not exists listings_geo_idx
  on public.marketplace_listings (geo_id) where deleted_at is null;
create index if not exists listings_group_idx
  on public.marketplace_listings (group_id) where deleted_at is null and group_id is not null;
create index if not exists listings_seller_idx
  on public.marketplace_listings (seller_id) where deleted_at is null;

drop trigger if exists listings_set_updated_at on public.marketplace_listings;
create trigger listings_set_updated_at
  before update on public.marketplace_listings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- How to reach the seller -- OPTIONAL
--
-- Unlike job_contacts, there is no "give at least one way to reach you"
-- refusal here. A seller may leave this table empty entirely and rely on
-- "Message the seller", which needs nothing this migration adds -- it is the
-- same open_direct_conversation() every profile already offers.
-- ---------------------------------------------------------------------------

create table if not exists public.listing_contacts (
  listing_id uuid primary key references public.marketplace_listings(id) on delete cascade,

  contact_name  text,
  contact_phone text,
  contact_email text,
  external_url  text,
  instructions  text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint listing_contacts_phone_length
    check (contact_phone is null or length(contact_phone) <= 40),
  constraint listing_contacts_email_length
    check (contact_email is null or length(contact_email) <= 200),
  constraint listing_contacts_name_length
    check (contact_name is null or length(contact_name) <= 160),
  constraint listing_contacts_instructions_length
    check (instructions is null or length(instructions) <= 2000),
  constraint listing_contacts_url_scheme
    check (external_url is null or external_url ~* '^https?://')
);

drop trigger if exists listing_contacts_set_updated_at on public.listing_contacts;
create trigger listing_contacts_set_updated_at
  before update on public.listing_contacts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Photos
--
-- Mirrors post_media (migration 010) closely enough that the reasoning there
-- is not repeated in full here: private bucket, signed URLs, the object path
-- carrying the owning row's id because storage RLS has no other way to ask
-- "may this member read this file".
--
-- Six per listing rather than four. A post is a moment; a listing is an item
-- somebody is deciding whether to travel for, and a buyer reasonably wants to
-- see more than one angle.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'listing-media',
  'listing-media',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.listing_media (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.marketplace_listings(id) on delete cascade,
  storage_path text not null unique,
  mime_type   text not null,
  byte_size   integer not null,
  width       integer,
  height      integer,
  alt_text    text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),

  constraint listing_media_mime_allowed check (
    mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')
  ),
  constraint listing_media_size_positive check (byte_size > 0 and byte_size <= 8388608),
  constraint listing_media_alt_length check (alt_text is null or length(alt_text) <= 300),
  constraint listing_media_dimensions check (
    (width is null and height is null) or (width > 0 and height > 0)
  )
);

create index if not exists listing_media_listing_idx
  on public.listing_media (listing_id, sort_order);

create or replace function public.listing_media_enforce_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v_count integer;
begin
  select count(*) into v_count from public.listing_media where listing_id = new.listing_id;
  if v_count >= 6 then
    raise exception 'A listing can carry at most 6 photos'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$fn$;

drop trigger if exists listing_media_limit on public.listing_media;
create trigger listing_media_limit
  before insert on public.listing_media
  for each row execute function public.listing_media_enforce_limit();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.can_see_listing(
  target_listing_id uuid,
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.marketplace_listings l
     where l.id = target_listing_id
       and l.deleted_at is null
       and (
         l.seller_id = check_user_id
         or case
              when l.group_id is not null
                then public.can_see_group(l.group_id, check_user_id)
              when l.visibility = 'public' then true
              else public.member_of_geo(l.geo_id, check_user_id)
            end
       )
  );
$fn$;

create or replace function public.owns_listing(
  target_listing_id uuid,
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.marketplace_listings l
     where l.id = target_listing_id and l.seller_id = check_user_id
  );
$fn$;

-- ---------------------------------------------------------------------------
-- Moderators may remove, never rewrite
--
-- Status is restored here too, alongside the content fields. Marking
-- something sold is the seller's call to make, not moderation's -- a
-- moderator's only lever over a listing is deleted_at.
-- ---------------------------------------------------------------------------

create or replace function public.listings_guard_content()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if auth.uid() is not null and auth.uid() <> old.seller_id then
    new.title                := old.title;
    new.description          := old.description;
    new.category             := old.category;
    new.condition             := old.condition;
    new.price                := old.price;
    new.price_is_negotiable   := old.price_is_negotiable;
    new.can_deliver           := old.can_deliver;
    new.seller_id             := old.seller_id;
    new.geo_id                := old.geo_id;
    new.location_text         := old.location_text;
    new.group_id               := old.group_id;
    new.visibility             := old.visibility;
    new.status                 := old.status;
    new.edited_at              := old.edited_at;
  elsif tg_op = 'UPDATE' and new.deleted_at is null
        and (new.title is distinct from old.title
             or new.description is distinct from old.description
             or new.price is distinct from old.price
             or new.condition is distinct from old.condition) then
    new.edited_at := now();
  end if;
  return new;
end;
$fn$;

drop trigger if exists listings_guard on public.marketplace_listings;
create trigger listings_guard
  before update on public.marketplace_listings
  for each row execute function public.listings_guard_content();

-- ---------------------------------------------------------------------------
-- RLS: listings
-- ---------------------------------------------------------------------------

alter table public.marketplace_listings enable row level security;
alter table public.listing_contacts enable row level security;
alter table public.listing_media enable row level security;

-- `group_id is null` from the start, as jobs and events now both are. A
-- listing inside a private group carries visibility='public' by column
-- default, and permissive policies are OR'd.
drop policy if exists listings_select_public on public.marketplace_listings;
create policy listings_select_public
  on public.marketplace_listings for select
  to anon, authenticated
  using (deleted_at is null and group_id is null and visibility = 'public');

drop policy if exists listings_select_community on public.marketplace_listings;
create policy listings_select_community
  on public.marketplace_listings for select
  to authenticated
  using (
    deleted_at is null
    and group_id is null
    and visibility = 'community'
    and public.member_of_geo(geo_id)
  );

drop policy if exists listings_select_group on public.marketplace_listings;
create policy listings_select_group
  on public.marketplace_listings for select
  to anon, authenticated
  using (
    deleted_at is null
    and group_id is not null
    and public.can_see_group(group_id)
  );

drop policy if exists listings_select_own on public.marketplace_listings;
create policy listings_select_own
  on public.marketplace_listings for select
  to authenticated
  using (seller_id = auth.uid());

drop policy if exists listings_select_staff on public.marketplace_listings;
create policy listings_select_staff
  on public.marketplace_listings for select
  to authenticated
  using (public.is_staff());

drop policy if exists listings_insert_own on public.marketplace_listings;
create policy listings_insert_own
  on public.marketplace_listings for insert
  to authenticated
  with check (
    seller_id = auth.uid()
    and public.is_active_member()
    and (group_id is null or public.is_group_member(group_id))
  );

drop policy if exists listings_update_own on public.marketplace_listings;
create policy listings_update_own
  on public.marketplace_listings for update
  to authenticated
  using (seller_id = auth.uid() and deleted_at is null)
  with check (seller_id = auth.uid());

drop policy if exists listings_update_staff on public.marketplace_listings;
create policy listings_update_staff
  on public.marketplace_listings for update
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- No DELETE policy for anyone. Removal is deleted_at, as everywhere else.

-- Contacts --------------------------------------------------------------

-- Same shape as job_contacts: no anon policy at all, and is_active_member()
-- on top of ordinary visibility, so a suspended account cannot harvest a
-- phone number either.
drop policy if exists listing_contacts_select_members on public.listing_contacts;
create policy listing_contacts_select_members
  on public.listing_contacts for select
  to authenticated
  using (public.is_active_member() and public.can_see_listing(listing_id));

drop policy if exists listing_contacts_write_own on public.listing_contacts;
create policy listing_contacts_write_own
  on public.listing_contacts for insert
  to authenticated
  with check (public.owns_listing(listing_id));

drop policy if exists listing_contacts_update_own on public.listing_contacts;
create policy listing_contacts_update_own
  on public.listing_contacts for update
  to authenticated
  using (public.owns_listing(listing_id))
  with check (public.owns_listing(listing_id));

drop policy if exists listing_contacts_delete_own on public.listing_contacts;
create policy listing_contacts_delete_own
  on public.listing_contacts for delete
  to authenticated
  using (public.owns_listing(listing_id));

-- Media -----------------------------------------------------------------

-- An image is visible exactly when its listing is, same EXISTS pattern as
-- post_media -- can_see_listing() already covers the group/community/public
-- split, so it is asked rather than restated.
drop policy if exists listing_media_select on public.listing_media;
create policy listing_media_select
  on public.listing_media for select
  to anon, authenticated
  using (public.can_see_listing(listing_id));

drop policy if exists listing_media_insert_own on public.listing_media;
create policy listing_media_insert_own
  on public.listing_media for insert
  to authenticated
  with check (public.is_active_member() and public.owns_listing(listing_id));

drop policy if exists listing_media_delete_own on public.listing_media;
create policy listing_media_delete_own
  on public.listing_media for delete
  to authenticated
  using (public.owns_listing(listing_id));

drop policy if exists listing_media_update_own on public.listing_media;
create policy listing_media_update_own
  on public.listing_media for update
  to authenticated
  using (public.owns_listing(listing_id))
  with check (public.owns_listing(listing_id));

create or replace function public.listing_media_guard_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  new.id           := old.id;
  new.listing_id   := old.listing_id;
  new.storage_path := old.storage_path;
  new.mime_type    := old.mime_type;
  new.byte_size    := old.byte_size;
  new.width        := old.width;
  new.height       := old.height;
  new.created_at   := old.created_at;
  return new;
end;
$fn$;

drop trigger if exists listing_media_guard on public.listing_media;
create trigger listing_media_guard
  before update on public.listing_media
  for each row execute function public.listing_media_guard_update();

-- ---------------------------------------------------------------------------
-- Storage policies
-- ---------------------------------------------------------------------------

create or replace function public.storage_path_listing_id(object_name text)
returns uuid
language sql
immutable
as $fn$
  select case
    when split_part(object_name, '/', 1) ~
         '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then split_part(object_name, '/', 1)::uuid
    else null
  end;
$fn$;

drop policy if exists listing_media_objects_select on storage.objects;
create policy listing_media_objects_select
  on storage.objects for select
  to anon, authenticated
  using (
    bucket_id = 'listing-media'
    and public.storage_path_listing_id(name) is not null
    and public.can_see_listing(public.storage_path_listing_id(name))
  );

drop policy if exists listing_media_objects_insert on storage.objects;
create policy listing_media_objects_insert
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'listing-media'
    and public.storage_path_listing_id(name) is not null
    and public.is_active_member()
    and public.owns_listing(public.storage_path_listing_id(name))
  );

drop policy if exists listing_media_objects_delete on storage.objects;
create policy listing_media_objects_delete
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'listing-media'
    and public.storage_path_listing_id(name) is not null
    and public.owns_listing(public.storage_path_listing_id(name))
  );

grant select on public.marketplace_listings to anon, authenticated;
grant insert, update on public.marketplace_listings to authenticated;
grant select, insert, update, delete on public.listing_contacts to authenticated;
grant select on public.listing_media to anon, authenticated;
grant insert, update, delete on public.listing_media to authenticated;
