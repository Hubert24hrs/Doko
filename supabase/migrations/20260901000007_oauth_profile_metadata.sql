-- Ezike Oba :: Foundation 007
-- Make handle_new_user() cope with OAuth sign-ups.
--
-- The original trigger assumed the metadata shape the email form sends, where
-- `username` and `full_name` are always present because the server validated
-- them. Identity providers send neither:
--
--   * Google  -> full_name, name, avatar_url, picture, email
--   * Apple   -> email, and a name ONLY on the very first authorisation;
--                on every later sign-in there is no name at all
--
-- Without this, a Google member would land as "Ezike Oba member" with a
-- username like user_9f2c1a7b4e03, which is not a name anyone would answer to.
--
-- Idempotent: replaces the function in place.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  candidate_username citext;
  base_username text;
  resolved_name text;
  suffix int := 0;
begin
  -- ---------------------------------------------------------------------
  -- Display name: the form's value, then the provider's, then a neutral
  -- fallback. Never an empty string.
  -- ---------------------------------------------------------------------
  resolved_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(btrim(concat_ws(' ',
      new.raw_user_meta_data ->> 'given_name',
      new.raw_user_meta_data ->> 'family_name')), ''),
    'Ezike Oba member'
  );

  -- ---------------------------------------------------------------------
  -- Username: the form's value, else derived from the email local part,
  -- else a stable id-based fallback. Providers never supply one.
  -- ---------------------------------------------------------------------
  base_username := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'username'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'preferred_username'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), '')
  );

  base_username := lower(coalesce(base_username, ''));

  -- Strip anything the CHECK constraint would reject. Email local parts often
  -- carry dots and plus-addressing, which are not permitted in a username.
  base_username := regexp_replace(base_username, '[^a-z0-9_]', '', 'g');

  if length(base_username) < 3 then
    base_username := 'user_' || substr(replace(new.id::text, '-', ''), 1, 12);
  end if;

  base_username := substr(base_username, 1, 24);
  candidate_username := base_username::citext;

  -- Deriving from an email guarantees collisions (two people can both be
  -- "hubert" at different domains), so this loop is now load-bearing rather
  -- than defensive. The unique index remains the final authority.
  while exists (select 1 from public.profiles p where p.username = candidate_username) loop
    suffix := suffix + 1;
    candidate_username := (substr(base_username, 1, 24) || '_' || suffix::text)::citext;
  end loop;

  insert into public.profiles (id, username, full_name, email, avatar_path)
  values (
    new.id,
    candidate_username,
    resolved_name,
    new.email,
    -- Providers give an absolute https URL; the column also holds Supabase
    -- Storage paths for uploaded avatars, so readers must handle both.
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'avatar_url'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'picture'), '')
    )
  )
  on conflict (id) do nothing;

  -- Every real person starts as a citizen, however they signed in.
  insert into public.user_roles (user_id, role)
  values (new.id, 'citizen')
  on conflict do nothing;

  return new;
end;
$fn$;
