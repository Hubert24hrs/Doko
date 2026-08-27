-- Ezike Oba :: Seed data
-- The Igbo-Eze North geographic tree.
--
-- SOURCES (recorded so this can be corrected against better authority later):
--   * Igbo Eze North LGA — 2 towns (Enugu-Ezike, Ette), 20 INEC council wards,
--     293 km^2, 259,431 at the 2006 census, postal code 413.
--     https://en.wikipedia.org/wiki/Igbo_Eze_North
--   * Village-to-district mapping for Enugu-Ezike:
--     https://www.enuguezike.org/villages
--   * Igbo-Eze North LGA official site: https://igboezenorthlga.en.gov.ng/about/
--
-- ACCURACY CAVEAT: sources disagree on the exact village count. The heritage
-- source lists 31 villages across four districts while describing 33, and
-- secondary sources cite 38 autonomous communities without naming them. This
-- seed encodes only what is attributable. It is a STARTING POINT that admins
-- are expected to correct in-app — which is why every entity is editable,
-- aliasable and movable rather than hard-coded in the UI.
--
-- Idempotent: re-running updates names in place and never duplicates.

begin;

-- ---------------------------------------------------------------------------
-- Level 0 :: Local Government Area
-- ---------------------------------------------------------------------------

insert into public.geo_entities (parent_id, kind, name, slug, description, latitude, longitude, sort_order)
values (
  null,
  'lga',
  'Igbo-Eze North',
  'igbo-eze-north',
  'Local Government Area in the north of Enugu State, Nigeria. Created in 1991 from the old Igbo-Eze LGA. Home to the Enugu-Ezike and Ette peoples. Area 293 km2; population 259,431 at the 2006 census; postal code 413.',
  6.9333,
  7.4000,
  0
)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Level 1 :: Towns
-- ---------------------------------------------------------------------------

with lga as (
  select id from public.geo_entities where kind = 'lga' and slug = 'igbo-eze-north'
)
insert into public.geo_entities (parent_id, kind, name, slug, aliases, description, sort_order)
select lga.id, 'town', t.name, public.slugify(t.name)::citext, t.aliases, t.description, t.sort_order
  from lga,
       (values
         ('Enugu-Ezike', array['Enugu Ezike','Enugwu-Ezike','Enugwu Ezike'],
          'The headquarters town of Igbo-Eze North and one of the largest towns in Enugu State, organised into four traditional districts.', 0),
         ('Ette', array['Etteh'],
          'Town in the north-west of Igbo-Eze North, on the Enugu State border with Kogi State.', 1)
       ) as t(name, aliases, description, sort_order)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Level 2 :: Districts of Enugu-Ezike
-- ---------------------------------------------------------------------------

with town as (
  select id from public.geo_entities where kind = 'town' and slug = 'enugu-ezike'
)
insert into public.geo_entities (parent_id, kind, name, slug, aliases, description, sort_order)
select town.id, 'district', d.name, public.slugify(d.name)::citext, d.aliases, d.description, d.sort_order
  from town,
       (values
         ('Umuitodo', array['Itodo','Umu Itodo'], 'One of the four traditional districts of Enugu-Ezike.', 0),
         ('Umuozzi',  array['Ozzi','Umu Ozzi'],   'The largest of the four traditional districts of Enugu-Ezike, returning ten council wards.', 1),
         ('Essodo',   array['Esodo'],             'One of the four traditional districts of Enugu-Ezike.', 2),
         ('Ezzodo',   array['Ezodo'],             'One of the four traditional districts of Enugu-Ezike.', 3)
       ) as d(name, aliases, description, sort_order)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Level 3 :: Villages, by district
-- ---------------------------------------------------------------------------

-- Umuitodo
with district as (
  select id from public.geo_entities where kind = 'district' and slug = 'umuitodo'
)
insert into public.geo_entities (parent_id, kind, name, slug, sort_order)
select district.id, 'village', v.name, public.slugify(v.name)::citext, v.ord
  from district,
       (values
         ('Amachalla', 0), ('Amufie', 1), ('Igbele', 2), ('Ikpuiga', 3),
         ('Imufu', 4), ('Olido', 5), ('Umuida', 6), ('Uroshi', 7)
       ) as v(name, ord)
on conflict do nothing;

-- Umuozzi
with district as (
  select id from public.geo_entities where kind = 'district' and slug = 'umuozzi'
)
insert into public.geo_entities (parent_id, kind, name, slug, sort_order)
select district.id, 'village', v.name, public.slugify(v.name)::citext, v.ord
  from district,
       (values
         ('Igogoro', 0), ('Ogrute', 1), ('Amaja', 2), ('Ekposhi', 3),
         ('Ezillo', 4), ('Ikpamodo', 5), ('Nkpamute', 6), ('Okpo', 7),
         ('Onicha-Enugu', 8), ('Umuogbo Ekposhi', 9)
       ) as v(name, ord)
on conflict do nothing;

-- Essodo
with district as (
  select id from public.geo_entities where kind = 'district' and slug = 'essodo'
)
insert into public.geo_entities (parent_id, kind, name, slug, sort_order)
select district.id, 'village', v.name, public.slugify(v.name)::citext, v.ord
  from district,
       (values
         ('Aguibeje', 0), ('Amube', 1), ('Ogbodu', 2), ('Okata', 3), ('Ufodo', 4)
       ) as v(name, ord)
on conflict do nothing;

-- Ezzodo
with district as (
  select id from public.geo_entities where kind = 'district' and slug = 'ezzodo'
)
insert into public.geo_entities (parent_id, kind, name, slug, sort_order)
select district.id, 'village', v.name, public.slugify(v.name)::citext, v.ord
  from district,
       (values
         ('Aji', 0), ('Inyi', 1), ('Owerre Eze', 2), ('Uda-Enugwu-Ezike', 3),
         ('Umuagada', 4), ('Umuogbo Agu', 5), ('Umuogbo Ulo', 6), ('Umuogbo Uno', 7)
       ) as v(name, ord)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- INEC council wards, recorded as 'area' entities under their town.
-- Wards are an electoral overlay, not the traditional hierarchy, so they hang
-- off the town rather than pretending to be districts.
-- ---------------------------------------------------------------------------

with town as (
  select id from public.geo_entities where kind = 'town' and slug = 'enugu-ezike'
)
insert into public.geo_entities (parent_id, kind, name, slug, description, sort_order)
select town.id, 'area', w.name, public.slugify(w.name)::citext, 'INEC council ward.', w.ord
  from town,
       (values
         ('Essodo I', 0), ('Essodo II', 1), ('Essodo III', 2),
         ('Umuitodo I', 3), ('Umuitodo II', 4), ('Umuitodo III', 5),
         ('Ezzodo', 6),
         ('Umuozzi I', 7), ('Umuozzi II', 8), ('Umuozzi III', 9),
         ('Umuozzi IV', 10), ('Umuozzi V', 11), ('Umuozzi VI', 12),
         ('Umuozzi VII', 13), ('Umuozzi VIII', 14), ('Umuozzi IX', 15),
         ('Umuozzi X', 16)
       ) as w(name, ord)
on conflict do nothing;

with town as (
  select id from public.geo_entities where kind = 'town' and slug = 'ette'
)
insert into public.geo_entities (parent_id, kind, name, slug, description, sort_order)
select town.id, 'area', w.name, public.slugify(w.name)::citext, 'INEC council ward.', w.ord
  from town,
       (values
         ('Ette I', 0), ('Ette II', 1), ('Ette Central', 2)
       ) as w(name, ord)
on conflict do nothing;

commit;

-- Sanity check: surface the shape of what was seeded.
select kind, count(*) as seeded
  from public.geo_entities
 where deleted_at is null
 group by kind
 order by kind;
