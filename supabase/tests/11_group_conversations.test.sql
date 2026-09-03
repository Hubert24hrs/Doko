-- Ezike Oba :: group conversations
--
-- Run either way:
--   * locally:  supabase test db
--   * hosted:   paste this whole file into the Supabase SQL Editor
--               (requires: create extension if not exists pgtap with schema extensions;)
--
-- The assertion this suite exists for is "leaving the group ends access even
-- though the read marker survives".
--
-- conversation_members rows are READ MARKERS. They are created when somebody
-- first opens a thread, and nothing deletes them when that person leaves the
-- group. The obvious implementation of in_conversation() -- "a membership row
-- exists OR you are in the group" -- would therefore let anybody who had ever
-- opened a group's chat go on reading it forever after leaving. So a group
-- conversation consults group_members and ignores the marker entirely, and the
-- test below leaves a marker behind on purpose.
--
-- Note also how little else is here. Every message policy asks
-- in_conversation(), so teaching that one function about groups gave reading,
-- writing and withdrawing their group rules without one of them being touched
-- -- the same inheritance that let comments and reactions pick up the
-- followers-only tier for free.

begin;

set local search_path = public, extensions, pg_temp;
select plan(29);

create table public._tap_out (
  at   timestamptz not null default clock_timestamp(),
  line text
);
grant insert, select on public._tap_out to public;
alter table public._tap_out disable row level security;

-- Ids that RLS must not be able to hide from an outsider who is asserting that
-- she cannot use them. See 10_messages: an INSERT ... SELECT over a table the
-- actor cannot read inserts nothing and throws nothing, and the assertion then
-- passes or fails without ever reaching the policy it names.
create table public._tap_fixture (
  name  text primary key,
  value uuid
);
grant select on public._tap_fixture to public;
alter table public._tap_fixture disable row level security;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values
  ('a1110000-1111-1111-1111-111111111111'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gc-o@example.com', '{"username":"gc_owner","full_name":"Gc Owner"}'),
  ('a2220000-2222-2222-2222-222222222222'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gc-m@example.com', '{"username":"gc_member","full_name":"Gc Member"}'),
  ('a3330000-3333-3333-3333-333333333333'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gc-u@example.com', '{"username":"gc_outsider","full_name":"Gc Outsider"}'),
  ('a4440000-4444-4444-4444-444444444444'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gc-x@example.com', '{"username":"gc_mod","full_name":"Gc Mod"}');

create or replace function pg_temp.become(user_id uuid)
returns void language plpgsql as $$
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims to %L',
    json_build_object('sub', user_id::text, 'role', 'authenticated')::text);
end $$;

create or replace function pg_temp.become_anon()
returns void language plpgsql as $$
begin
  execute 'set local role anon';
  execute 'set local request.jwt.claims to ''{"role":"anon"}''';
end $$;

update public.profiles set visibility = 'private'
 where id in (
   'a1110000-1111-1111-1111-111111111111'::uuid,
   'a2220000-2222-2222-2222-222222222222'::uuid,
   'a3330000-3333-3333-3333-333333333333'::uuid,
   'a4440000-4444-4444-4444-444444444444'::uuid
 );

insert into public.user_roles (user_id, role) values
  ('a4440000-4444-4444-4444-444444444444'::uuid, 'moderator')
on conflict do nothing;

-- A public group, so that the outsider assertions below are about MEMBERSHIP
-- rather than about the group being hidden. An outsider who can see the group
-- perfectly well must still be shut out of its conversation.
select pg_temp.become('a1110000-1111-1111-1111-111111111111'::uuid);
insert into public.groups (id, name, slug, visibility, created_by) values
  ('ab000000-0000-0000-0000-000000000001', 'Chat Group', 'chat-group', 'public',
   'a1110000-1111-1111-1111-111111111111');
reset role;

insert into public._tap_fixture (name, value)
values ('group', 'ab000000-0000-0000-0000-000000000001');

-- ===========================================================================
-- Opening
-- ===========================================================================

select pg_temp.become('a1110000-1111-1111-1111-111111111111'::uuid);

insert into public._tap_out(line) select ok(
  public.open_group_conversation('ab000000-0000-0000-0000-000000000001'::uuid)
    is not null,
  'a group member can open the group conversation'
);

insert into public._tap_out(line) select is(
  public.open_group_conversation('ab000000-0000-0000-0000-000000000001'::uuid),
  public.open_group_conversation('ab000000-0000-0000-0000-000000000001'::uuid),
  'and opening it twice returns the same one'
);
reset role;

insert into public._tap_fixture (name, value)
select 'conversation', id from public.conversations
 where group_id = 'ab000000-0000-0000-0000-000000000001'::uuid;

insert into public._tap_out(line) select is(
  (select count(*)::int from public.conversations
    where group_id = 'ab000000-0000-0000-0000-000000000001'::uuid),
  1, 'a group has exactly one conversation'
);

-- Reading a public group does not entitle you to its conversation, for the
-- same reason it does not entitle you to post in it.
select pg_temp.become('a3330000-3333-3333-3333-333333333333'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.groups
    where id = 'ab000000-0000-0000-0000-000000000001'::uuid),
  1, 'an outsider can see the public group itself'
);
insert into public._tap_out(line) select throws_ok(
  $$select public.open_group_conversation('ab000000-0000-0000-0000-000000000001')$$,
  '42501', null,
  'but CANNOT open its conversation'
);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.conversations),
  0, 'and cannot see that the conversation exists'
);
reset role;

-- ===========================================================================
-- A conversation is a pair or a group, never both and never neither
-- ===========================================================================

insert into public._tap_out(line) select throws_ok(
  $$insert into public.conversations (dm_key, group_id)
    values ('11111111-1111-1111-1111-111111111111:22222222-2222-2222-2222-222222222222',
            'ab000000-0000-0000-0000-000000000001')$$,
  '23514', null,
  'a conversation cannot be a pair AND a group'
);

insert into public._tap_out(line) select throws_ok(
  $$insert into public.conversations (dm_key, group_id) values (null, null)$$,
  '23514', null,
  'nor neither'
);

-- ===========================================================================
-- Messages inherit the group rule without any policy being touched
-- ===========================================================================

select pg_temp.become('a1110000-1111-1111-1111-111111111111'::uuid);
insert into public._tap_out(line) select lives_ok(
  $$insert into public.messages (conversation_id, author_id, body)
    select value, 'a1110000-1111-1111-1111-111111111111', 'Meeting on Saturday'
      from public._tap_fixture where name = 'conversation'$$,
  'a group member can write in the group conversation'
);
reset role;

select pg_temp.become('a3330000-3333-3333-3333-333333333333'::uuid);
insert into public._tap_out(line) select throws_ok(
  $$insert into public.messages (conversation_id, author_id, body)
    select value, 'a3330000-3333-3333-3333-333333333333', 'Butting in'
      from public._tap_fixture where name = 'conversation'$$,
  '42501', null,
  'an outsider cannot write in it'
);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.messages),
  0, 'nor read a single message in it'
);

-- An outsider cannot manufacture access by inserting their own read marker.
insert into public._tap_out(line) select throws_ok(
  $$insert into public.conversation_members (conversation_id, user_id)
    select value, 'a3330000-3333-3333-3333-333333333333'
      from public._tap_fixture where name = 'conversation'$$,
  '42501', null,
  'nor give themselves a read marker to get in with'
);
reset role;

-- Staff read nothing here either. A group conversation is no more public than
-- a private one.
select pg_temp.become('a4440000-4444-4444-4444-444444444444'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.messages),
  0, 'a moderator cannot read a group conversation'
);
reset role;

-- ===========================================================================
-- Joining, and the unread baseline
-- ===========================================================================

select pg_temp.become('a2220000-2222-2222-2222-222222222222'::uuid);
insert into public._tap_out(line) select lives_ok(
  $$insert into public.group_members (group_id, user_id)
    values ('ab000000-0000-0000-0000-000000000001',
            'a2220000-2222-2222-2222-222222222222')$$,
  'anyone can join the public group'
);

insert into public._tap_out(line) select is(
  (select count(*)::int from public.conversations),
  1, 'and joining the group is what admits them to its conversation'
);

insert into public._tap_out(line) select is(
  (select count(*)::int from public.messages),
  1, 'including the messages sent before they arrived'
);
reset role;

-- The baseline is when you JOINED, not the beginning of time.
--
-- The timestamps have to be moved by hand: now() does not advance inside a
-- transaction, so the first message and the join would otherwise carry the
-- identical value and any comparison between them would be testing the clock
-- rather than the rule.
update public.messages set created_at = now() - interval '2 hours'
 where conversation_id = (select value from public._tap_fixture where name = 'conversation');

update public.group_members set joined_at = now() - interval '1 hour'
 where group_id = 'ab000000-0000-0000-0000-000000000001'::uuid
   and user_id = 'a2220000-2222-2222-2222-222222222222'::uuid;

select pg_temp.become('a1110000-1111-1111-1111-111111111111'::uuid);
insert into public.messages (conversation_id, author_id, body)
select value, 'a1110000-1111-1111-1111-111111111111', 'Bring your levy receipt'
  from public._tap_fixture where name = 'conversation';
reset role;

select pg_temp.become('a2220000-2222-2222-2222-222222222222'::uuid);
insert into public._tap_out(line) select is(
  (select unread_count from public.my_conversation_summaries()),
  1, 'a new member is unread only from when they joined, not from the start'
);

insert into public._tap_out(line) select is(
  (select group_name from public.my_conversation_summaries()),
  'Chat Group',
  'the inbox names the group rather than a person'
);

insert into public._tap_out(line) select ok(
  (select other_user_id is null from public.my_conversation_summaries()),
  'and does not label a group with whichever member sorted first'
);

-- The read marker is created on demand, not fanned out to every member when
-- the conversation is made.
insert into public._tap_out(line) select lives_ok(
  $$insert into public.conversation_members (conversation_id, user_id)
    select value, 'a2220000-2222-2222-2222-222222222222'
      from public._tap_fixture where name = 'conversation'$$,
  'a member can create their own read marker on demand'
);
reset role;

insert into public._tap_out(line) select is(
  (select count(*)::int from public.conversation_members
    where conversation_id = (select value from public._tap_fixture where name = 'conversation')),
  1, 'so a group conversation carries markers only for those who have read it'
);

-- ===========================================================================
-- Leaving
--
-- The assertion this whole suite is for.
-- ===========================================================================

select pg_temp.become('a2220000-2222-2222-2222-222222222222'::uuid);
delete from public.group_members
 where group_id = 'ab000000-0000-0000-0000-000000000001'::uuid
   and user_id = 'a2220000-2222-2222-2222-222222222222'::uuid;
reset role;

insert into public._tap_out(line) select is(
  (select count(*)::int from public.conversation_members
    where conversation_id = (select value from public._tap_fixture where name = 'conversation')
      and user_id = 'a2220000-2222-2222-2222-222222222222'::uuid),
  1, 'leaving the group leaves the read marker behind, as it must for this to mean anything'
);

select pg_temp.become('a2220000-2222-2222-2222-222222222222'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.conversations),
  0, 'yet a member who has LEFT can no longer see the conversation'
);

insert into public._tap_out(line) select is(
  (select count(*)::int from public.messages),
  0, 'nor read anything that was said in it'
);

insert into public._tap_out(line) select throws_ok(
  $$insert into public.messages (conversation_id, author_id, body)
    select value, 'a2220000-2222-2222-2222-222222222222', 'Still here'
      from public._tap_fixture where name = 'conversation'$$,
  '42501', null,
  'nor write into it'
);

insert into public._tap_out(line) select is(
  (select count(*)::int from public.my_conversation_summaries()),
  0, 'and it is gone from their inbox'
);

insert into public._tap_out(line) select ok(
  not public.in_conversation(
    (select value from public._tap_fixture where name = 'conversation')),
  'in_conversation() answers no, despite the surviving read marker'
);
reset role;

-- Something is said while they are away.
select pg_temp.become('a1110000-1111-1111-1111-111111111111'::uuid);
insert into public.messages (conversation_id, author_id, body)
select value, 'a1110000-1111-1111-1111-111111111111', 'Said while you were gone'
  from public._tap_fixture where name = 'conversation';
reset role;

-- The timestamps are arranged so that the greatest() in the baseline is the
-- only thing standing between the returning member and a pile of messages from
-- while they were not entitled to be here:
--
--   read marker  -30 min   (from their previous membership)
--   message      -10 min   (sent while they were away)
--   rejoined      now
--
-- Take greatest() out and the baseline falls back to the stale marker, the
-- message lands after it, and it is counted unread.
update public.messages set created_at = now() - interval '10 minutes'
 where body = 'Said while you were gone';

update public.conversation_members set last_read_at = now() - interval '30 minutes'
 where user_id = 'a2220000-2222-2222-2222-222222222222'::uuid;

select pg_temp.become('a2220000-2222-2222-2222-222222222222'::uuid);
insert into public.group_members (group_id, user_id)
values ('ab000000-0000-0000-0000-000000000001',
        'a2220000-2222-2222-2222-222222222222');

insert into public._tap_out(line) select is(
  (select count(*)::int from public.conversations),
  1, 'rejoining the group restores access to the conversation'
);

insert into public._tap_out(line) select is(
  (select unread_count from public.my_conversation_summaries()),
  0, 'and a stale read marker does not resurrect what was said while away'
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
