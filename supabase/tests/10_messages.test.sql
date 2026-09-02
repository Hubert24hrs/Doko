-- Ezike Oba :: direct messages
--
-- Run either way:
--   * locally:  supabase test db
--   * hosted:   paste this whole file into the Supabase SQL Editor
--               (requires: create extension if not exists pgtap with schema extensions;)
--
-- Two assertions here matter more than the rest.
--
--   1. A MODERATOR CANNOT READ PRIVATE MESSAGES. Every other table in this
--      schema grants staff a read policy. messages deliberately does not, and
--      the only way that stays true is for a test to fail the day somebody
--      adds one "for moderation".
--   2. The canonical pair key. Two people messaging each other at the same
--      moment must land in ONE conversation. Without the ordering inside the
--      key, (a,b) and (b,a) are different strings and the uniqueness is
--      decorative.

begin;

set local search_path = public, extensions, pg_temp;
select plan(38);

create table public._tap_out (
  at   timestamptz not null default clock_timestamp(),
  line text
);
grant insert, select on public._tap_out to public;
alter table public._tap_out disable row level security;

-- ---------------------------------------------------------------------------
-- Fixtures
--
-- alice and bob correspond; carol is an outsider; dave is private and so
-- cannot be messaged cold; erin is suspended; the moderator must stay locked
-- out of all of it.
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values
  ('f1110000-1111-1111-1111-111111111111'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'msg-a@example.com', '{"username":"msg_alice","full_name":"Msg Alice"}'),
  ('f2220000-2222-2222-2222-222222222222'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'msg-b@example.com', '{"username":"msg_bob","full_name":"Msg Bob"}'),
  ('f3330000-3333-3333-3333-333333333333'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'msg-c@example.com', '{"username":"msg_carol","full_name":"Msg Carol"}'),
  ('f4440000-4444-4444-4444-444444444444'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'msg-d@example.com', '{"username":"msg_dave","full_name":"Msg Dave"}'),
  ('f5550000-5555-5555-5555-555555555555'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'msg-e@example.com', '{"username":"msg_erin","full_name":"Msg Erin"}'),
  ('f6660000-6666-6666-6666-666666666666'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'msg-m@example.com', '{"username":"msg_mod","full_name":"Msg Mod"}'),
  ('f7770000-7777-7777-7777-777777777777'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'msg-x@example.com', '{"username":"msg_admin","full_name":"Msg Admin"}');

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

-- Deny by default: every fixture profile is private, and only the ones an
-- assertion needs are opened. Twice before, a new fixture inherited the
-- 'public' column default and quietly joined somebody else's count.
update public.profiles set visibility = 'private'
 where id in (
   'f1110000-1111-1111-1111-111111111111'::uuid,
   'f2220000-2222-2222-2222-222222222222'::uuid,
   'f3330000-3333-3333-3333-333333333333'::uuid,
   'f4440000-4444-4444-4444-444444444444'::uuid,
   'f5550000-5555-5555-5555-555555555555'::uuid,
   'f6660000-6666-6666-6666-666666666666'::uuid,
   'f7770000-7777-7777-7777-777777777777'::uuid
 );

-- Opened deliberately: alice, bob, carol and erin are reachable; dave stays
-- private, which is the case that must refuse.
update public.profiles set visibility = 'public'
 where id in (
   'f1110000-1111-1111-1111-111111111111'::uuid,
   'f2220000-2222-2222-2222-222222222222'::uuid,
   'f3330000-3333-3333-3333-333333333333'::uuid,
   'f5550000-5555-5555-5555-555555555555'::uuid
 );

insert into public.user_roles (user_id, role) values
  ('f6660000-6666-6666-6666-666666666666'::uuid, 'moderator'),
  ('f7770000-7777-7777-7777-777777777777'::uuid, 'admin')
on conflict do nothing;

-- Suspension has to be applied BY an admin. The guard trigger silently
-- restores is_suspended for anybody who is not one -- including for a plain
-- UPDATE with no JWT at all, which is how this fixture failed the first time
-- it was written.
select pg_temp.become('f7770000-7777-7777-7777-777777777777'::uuid);
update public.profiles set is_suspended = true
 where id = 'f5550000-5555-5555-5555-555555555555'::uuid;
reset role;

insert into public._tap_out(line) select is(
  (select is_suspended from public.profiles
    where id = 'f5550000-5555-5555-5555-555555555555'::uuid),
  true, 'fixture check: the suspended member really is suspended'
);

-- ===========================================================================
-- Opening a conversation
-- ===========================================================================

select pg_temp.become('f1110000-1111-1111-1111-111111111111'::uuid);

insert into public._tap_out(line) select ok(
  public.open_direct_conversation('f2220000-2222-2222-2222-222222222222'::uuid)
    is not null,
  'a member can open a conversation with a reachable member'
);

-- Idempotent: "open", not "create".
insert into public._tap_out(line) select is(
  public.open_direct_conversation('f2220000-2222-2222-2222-222222222222'::uuid),
  public.open_direct_conversation('f2220000-2222-2222-2222-222222222222'::uuid),
  'opening the same conversation twice returns the same one'
);

insert into public._tap_out(line) select throws_ok(
  $$select public.open_direct_conversation('f1110000-1111-1111-1111-111111111111')$$,
  '42501', null,
  'nobody can open a conversation with themselves'
);

-- A private profile cannot be messaged cold. This is the anti-harassment
-- property, and it is the SAME rule that hides the profile -- not a second
-- one written out again here.
insert into public._tap_out(line) select throws_ok(
  $$select public.open_direct_conversation('f4440000-4444-4444-4444-444444444444')$$,
  '42501', null,
  'a private profile cannot be messaged'
);

insert into public._tap_out(line) select throws_ok(
  $$select public.open_direct_conversation('f5550000-5555-5555-5555-555555555555')$$,
  '42501', null,
  'a suspended member cannot be messaged'
);

insert into public._tap_out(line) select ok(
  public.can_message('f2220000-2222-2222-2222-222222222222'::uuid),
  'can_message agrees for a reachable member'
);

insert into public._tap_out(line) select ok(
  not public.can_message('f4440000-4444-4444-4444-444444444444'::uuid),
  'can_message refuses a private profile'
);

reset role;

-- The pair key is canonical: bob asking for a conversation with alice must
-- get ALICE'S conversation, not a second one. Without the least/greatest
-- ordering these are two different keys and each would see half the history.
select pg_temp.become('f2220000-2222-2222-2222-222222222222'::uuid);
insert into public._tap_out(line) select is(
  public.open_direct_conversation('f1110000-1111-1111-1111-111111111111'::uuid),
  (select id from public.conversations
    where dm_key = least('f1110000-1111-1111-1111-111111111111',
                         'f2220000-2222-2222-2222-222222222222') || ':' ||
                   greatest('f1110000-1111-1111-1111-111111111111',
                            'f2220000-2222-2222-2222-222222222222')),
  'the other side opens the SAME conversation, not a second one'
);
reset role;

insert into public._tap_out(line) select is(
  (select count(*)::int from public.conversations
    where created_by in ('f1110000-1111-1111-1111-111111111111'::uuid,
                         'f2220000-2222-2222-2222-222222222222'::uuid)),
  1, 'so exactly one conversation exists between the pair'
);

insert into public._tap_out(line) select is(
  (select count(*)::int from public.conversation_members m
     join public.conversations c on c.id = m.conversation_id
    where c.created_by = 'f1110000-1111-1111-1111-111111111111'::uuid),
  2, 'and both people are in it'
);

-- The conversation id, parked where RLS does not reach.
--
-- The outsider assertions below have to NAME the conversation, and an outsider
-- cannot SELECT it -- that is the whole point of them. Written as
-- INSERT ... SELECT ... FROM public.conversations, the select returned zero
-- rows for her, the insert inserted nothing, no exception was raised, and the
-- assertion failed having never reached the write policy at all. A test that
-- passes by doing nothing is worse than one that fails.
create table public._tap_fixture (
  name  text primary key,
  value uuid,
  ts    timestamptz
);
grant select on public._tap_fixture to public;
alter table public._tap_fixture disable row level security;

insert into public._tap_fixture (name, value)
select 'conversation', id from public.conversations
 where created_by = 'f1110000-1111-1111-1111-111111111111'::uuid;

-- ===========================================================================
-- Who can see a conversation
-- ===========================================================================

select pg_temp.become('f3330000-3333-3333-3333-333333333333'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.conversations),
  0, 'an outsider sees no conversation at all'
);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.conversation_members),
  0, 'nor who is in one'
);
reset role;

select pg_temp.become_anon();
insert into public._tap_out(line) select is(
  (select count(*)::int from public.conversations),
  0, 'a signed-out visitor sees none either'
);
reset role;

select pg_temp.become('f1110000-1111-1111-1111-111111111111'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.conversations),
  1, 'a participant sees their own conversation'
);

-- Conversations are created ONLY by open_direct_conversation(). There is no
-- INSERT policy, because creating one means inserting a membership row for
-- somebody else.
insert into public._tap_out(line) select throws_ok(
  $$insert into public.conversations (dm_key) values (null)$$,
  '42501', null,
  'nobody can insert a conversation directly'
);

insert into public._tap_out(line) select throws_ok(
  $$insert into public.conversation_members (conversation_id, user_id)
    select id, 'f3330000-3333-3333-3333-333333333333'
      from public.conversations limit 1$$,
  '42501', null,
  'nobody can add themselves -- or anybody else -- to a conversation'
);
reset role;

-- ===========================================================================
-- Messages
-- ===========================================================================

select pg_temp.become('f1110000-1111-1111-1111-111111111111'::uuid);
insert into public._tap_out(line) select lives_ok(
  $$insert into public.messages (conversation_id, author_id, body)
    select id, 'f1110000-1111-1111-1111-111111111111', 'Good morning, Bob'
      from public.conversations limit 1$$,
  'a participant can send a message'
);

-- Membership is not authorship: you may write as yourself and nobody else.
insert into public._tap_out(line) select throws_ok(
  $$insert into public.messages (conversation_id, author_id, body)
    select id, 'f2220000-2222-2222-2222-222222222222', 'Forged'
      from public.conversations limit 1$$,
  '42501', null,
  'a participant cannot send a message as somebody else'
);
reset role;

select pg_temp.become('f3330000-3333-3333-3333-333333333333'::uuid);
insert into public._tap_out(line) select throws_ok(
  $$insert into public.messages (conversation_id, author_id, body)
    select value, 'f3330000-3333-3333-3333-333333333333', 'Butting in'
      from public._tap_fixture where name = 'conversation'$$,
  '42501', null,
  'an outsider cannot write into a conversation'
);

insert into public._tap_out(line) select is(
  (select count(*)::int from public.messages),
  0, 'and cannot read a single message in it'
);
reset role;

-- THE assertion. Every other table in this schema lets staff read everything.
-- A private message is not public speech, so this one does not -- and if
-- somebody adds a staff policy "for moderation", this fails.
select pg_temp.become('f6660000-6666-6666-6666-666666666666'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.messages),
  0, 'a MODERATOR cannot read private messages'
);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.conversations),
  0, 'nor see that the conversation exists'
);
reset role;

select pg_temp.become('f7770000-7777-7777-7777-777777777777'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.messages),
  0, 'an ADMIN cannot read private messages either'
);
reset role;

select pg_temp.become('f2220000-2222-2222-2222-222222222222'::uuid);
insert into public._tap_out(line) select is(
  (select count(*)::int from public.messages),
  1, 'the person it was sent to CAN read it'
);
reset role;

-- ===========================================================================
-- The trigger-maintained bookkeeping
-- ===========================================================================

insert into public._tap_out(line) select ok(
  (select last_message_at is not null from public.conversations
    where created_by = 'f1110000-1111-1111-1111-111111111111'::uuid),
  'sending a message moves the conversation to the top of the inbox'
);

-- Sending is reading: otherwise everyone would carry an unread count that
-- included their own messages, which reads as a bug even though the
-- arithmetic is right.
insert into public._tap_out(line) select is(
  (select count(*)::int
     from public.conversation_members m
     join public.messages msg
       on msg.conversation_id = m.conversation_id
      and msg.created_at > m.last_read_at
      and msg.author_id <> m.user_id
    where m.user_id = 'f1110000-1111-1111-1111-111111111111'::uuid),
  0, 'the sender has nothing unread of their own'
);

insert into public._tap_out(line) select is(
  (select count(*)::int
     from public.conversation_members m
     join public.messages msg
       on msg.conversation_id = m.conversation_id
      and msg.created_at > m.last_read_at
      and msg.author_id <> m.user_id
    where m.user_id = 'f2220000-2222-2222-2222-222222222222'::uuid),
  1, 'and the recipient has one unread'
);

select pg_temp.become('f2220000-2222-2222-2222-222222222222'::uuid);
insert into public._tap_out(line) select is(
  (select unread_count from public.my_conversation_summaries()),
  1, 'my_conversation_summaries() reports that unread count to the recipient'
);
insert into public._tap_out(line) select is(
  (select other_user_id from public.my_conversation_summaries()),
  'f1110000-1111-1111-1111-111111111111'::uuid,
  'and names the other person, not the caller'
);
reset role;

-- A member moves their OWN read marker and nobody else's. RLS refuses an
-- UPDATE by FILTERING, not by raising, so the refusal is silence -- which is
-- why this compares the value before and after instead of expecting a throw.
--
-- It has to compare ALICE'S timestamp, too. Checking Bob's unread count after
-- Bob tried to move Alice's marker would have been a test of nothing: his
-- count is 1 whether the update was filtered or not.
insert into public._tap_fixture (name, ts)
select 'alice_read', last_read_at from public.conversation_members
 where user_id = 'f1110000-1111-1111-1111-111111111111'::uuid;

select pg_temp.become('f2220000-2222-2222-2222-222222222222'::uuid);
update public.conversation_members set last_read_at = now()
 where user_id = 'f1110000-1111-1111-1111-111111111111'::uuid;
reset role;

insert into public._tap_out(line) select is(
  (select last_read_at from public.conversation_members
    where user_id = 'f1110000-1111-1111-1111-111111111111'::uuid),
  (select ts from public._tap_fixture where name = 'alice_read'),
  'one member cannot mark another member''s conversation as read'
);

-- And the positive half, without which the assertion above would also pass if
-- the read marker could not be moved by anybody at all.
select pg_temp.become('f2220000-2222-2222-2222-222222222222'::uuid);
update public.conversation_members set last_read_at = now()
 where user_id = 'f2220000-2222-2222-2222-222222222222'::uuid;
reset role;

insert into public._tap_out(line) select is(
  (select count(*)::int
     from public.conversation_members m
     join public.messages msg
       on msg.conversation_id = m.conversation_id
      and msg.created_at > m.last_read_at
      and msg.author_id <> m.user_id
    where m.user_id = 'f2220000-2222-2222-2222-222222222222'::uuid),
  0, 'but CAN mark their own, which clears their unread count'
);

-- ===========================================================================
-- Editing and withdrawing
-- ===========================================================================

select pg_temp.become('f2220000-2222-2222-2222-222222222222'::uuid);
update public.messages set body = 'Rewritten by the recipient';
reset role;

insert into public._tap_out(line) select is(
  (select body from public.messages where author_id = 'f1110000-1111-1111-1111-111111111111'::uuid),
  'Good morning, Bob',
  'the recipient cannot rewrite the sender''s message'
);

select pg_temp.become('f1110000-1111-1111-1111-111111111111'::uuid);
update public.messages set body = 'Good morning, Bob!'
 where author_id = 'f1110000-1111-1111-1111-111111111111'::uuid;
reset role;

insert into public._tap_out(line) select ok(
  (select edited_at is not null from public.messages where author_id = 'f1110000-1111-1111-1111-111111111111'::uuid),
  'an author can edit their own message, and the edit is recorded'
);

-- Withdrawal takes the words with it IN THE DATABASE, not in the UI: a stale
-- client, a cached payload or a realtime event must not still be carrying the
-- text of a message somebody withdrew.
select pg_temp.become('f1110000-1111-1111-1111-111111111111'::uuid);
update public.messages set deleted_at = now()
 where author_id = 'f1110000-1111-1111-1111-111111111111'::uuid;
reset role;

insert into public._tap_out(line) select is(
  (select body from public.messages where author_id = 'f1110000-1111-1111-1111-111111111111'::uuid),
  '', 'withdrawing a message blanks its body in the database'
);

insert into public._tap_out(line) select ok(
  (select deleted_at is not null from public.messages where author_id = 'f1110000-1111-1111-1111-111111111111'::uuid),
  'and the row keeps its place in the thread rather than vanishing'
);

-- A withdrawn message stays withdrawn.
select pg_temp.become('f1110000-1111-1111-1111-111111111111'::uuid);
update public.messages set body = 'Actually, never mind', deleted_at = null;
reset role;

insert into public._tap_out(line) select is(
  (select body from public.messages where author_id = 'f1110000-1111-1111-1111-111111111111'::uuid),
  '', 'a withdrawn message cannot be restored or rewritten'
);

-- No DELETE policy exists for anybody, so a conversation cannot be silently
-- rewritten by removing rows from it.
select pg_temp.become('f1110000-1111-1111-1111-111111111111'::uuid);
delete from public.messages;
reset role;

insert into public._tap_out(line) select is(
  (select count(*)::int from public.messages where author_id = 'f1110000-1111-1111-1111-111111111111'::uuid),
  1, 'nobody can hard-delete a message, not even its author'
);

insert into public._tap_out(line) select * from finish();

select coalesce(
  (select string_agg(line, chr(10) order by at)
     from public._tap_out
    where line not like 'ok %'),
  'ALL ASSERTIONS PASSED'
) as result;
rollback;
