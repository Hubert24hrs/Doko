-- Ezike Oba :: the notification triggers
--
-- Run either way:
--   * locally:  supabase test db
--   * hosted:   paste this whole file into the Supabase SQL Editor
--               (requires: create extension if not exists pgtap with schema extensions;)
--
-- Migration 022 promised five kinds of notification and delivered two. The
-- CHECK constraint admitted 'comment', 'reaction', 'follow' and 'message', and
-- notification-list.tsx drew an icon for each -- so the type existed, the UI
-- was ready, and nothing had ever produced one. Migration 035 writes the
-- triggers.
--
-- Two of the assertions below are the reason this file exists rather than
-- three lines in 21_notifications:
--
--   * a message notification must NEVER carry the message body. `messages` is
--     the one table with no staff read policy, and withdrawing a message
--     BLANKS ITS BODY IN THE DATABASE so that no stale copy survives. A
--     notification quoting it would be exactly such a copy, and nothing would
--     blank it.
--
--   * a group message must not notify somebody who has LEFT the group.
--     `conversation_members` rows are read markers and nothing deletes them on
--     departure -- the distinction migration 016 turned on. A notification is
--     precisely the sort of thing that reintroduces that leak by the back
--     door: telling somebody who left that there is a new message tells them
--     the group is still talking.

begin;

set local search_path = public, extensions, pg_temp;
select plan(15);

create table public._tap_out (
  at   timestamptz not null default clock_timestamp(),
  line text
);
grant insert, select on public._tap_out to public;
alter table public._tap_out disable row level security;

-- Created here rather than with `create table ... as select` further down: that
-- would run while the role is `authenticated`, which has no CREATE on schema
-- public.
create table public._tap_conv (dm_id uuid);
grant insert, select on public._tap_conv to public;
alter table public._tap_conv disable row level security;

-- ---------------------------------------------------------------------------
-- Fixtures: an author, a reader, and somebody who leaves a group.
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values
  ('5b110000-0000-1111-1111-111111111111'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ng-a@example.com', '{"username":"ng_author","full_name":"Ng Author"}'),
  ('5b220000-0000-2222-2222-222222222222'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ng-b@example.com', '{"username":"ng_reader","full_name":"Ng Reader"}'),
  ('5b330000-0000-3333-3333-333333333333'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ng-c@example.com', '{"username":"ng_leaver","full_name":"Ng Leaver"}');

create or replace function pg_temp.become(user_id uuid)
returns void language plpgsql as $$
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims to %L',
    json_build_object('sub', user_id::text, 'role', 'authenticated')::text);
end $$;

create or replace function pg_temp.become_platform()
returns void language plpgsql as $bp$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $bp$;

-- ===========================================================================
-- Comments
-- ===========================================================================

select pg_temp.become('5b110000-0000-1111-1111-111111111111'::uuid);
insert into public.posts (id, author_id, body, visibility)
values ('b0000000-0000-0000-0000-000000000001',
        '5b110000-0000-1111-1111-111111111111',
        'The road to Umuozzi is being graded this week.', 'public');
reset role;

select pg_temp.become('5b220000-0000-2222-2222-222222222222'::uuid);
insert into public.comments (post_id, author_id, body)
values ('b0000000-0000-0000-0000-000000000001',
        '5b220000-0000-2222-2222-222222222222',
        'They started at the junction on Monday.');
reset role;
select pg_temp.become_platform();

insert into public._tap_out(line) select is(
  (select count(*)::int from public.notifications
    where user_id = '5b110000-0000-1111-1111-111111111111'::uuid
      and type = 'comment'),
  1, 'commenting on a post notifies its author'
);

-- A post is public speech, so the notification may quote it. A private message
-- is not, and further down it does not.
insert into public._tap_out(line) select is(
  (select body from public.notifications
    where user_id = '5b110000-0000-1111-1111-111111111111'::uuid
      and type = 'comment'),
  'They started at the junction on Monday.',
  'and carries what was said, because a comment is public speech'
);

select pg_temp.become('5b110000-0000-1111-1111-111111111111'::uuid);
insert into public.comments (post_id, author_id, body)
values ('b0000000-0000-0000-0000-000000000001',
        '5b110000-0000-1111-1111-111111111111',
        'Replying to myself here.');
reset role;
select pg_temp.become_platform();

insert into public._tap_out(line) select is(
  (select count(*)::int from public.notifications
    where user_id = '5b110000-0000-1111-1111-111111111111'::uuid
      and type = 'comment'),
  1, 'but commenting on your own post notifies nobody'
);

-- ===========================================================================
-- Reactions
-- ===========================================================================

select pg_temp.become('5b220000-0000-2222-2222-222222222222'::uuid);
insert into public.reactions (post_id, user_id, kind)
values ('b0000000-0000-0000-0000-000000000001',
        '5b220000-0000-2222-2222-222222222222', 'celebrate');
reset role;
select pg_temp.become_platform();

insert into public._tap_out(line) select is(
  (select count(*)::int from public.notifications
    where user_id = '5b110000-0000-1111-1111-111111111111'::uuid
      and type = 'reaction'),
  1, 'a reaction notifies the post''s author'
);

select pg_temp.become('5b110000-0000-1111-1111-111111111111'::uuid);
insert into public.reactions (post_id, user_id, kind)
values ('b0000000-0000-0000-0000-000000000001',
        '5b110000-0000-1111-1111-111111111111', 'like');
reset role;
select pg_temp.become_platform();

insert into public._tap_out(line) select is(
  (select count(*)::int from public.notifications
    where user_id = '5b110000-0000-1111-1111-111111111111'::uuid
      and type = 'reaction'),
  1, 'and reacting to your own post notifies nobody'
);

-- ===========================================================================
-- Follows
-- ===========================================================================

select pg_temp.become('5b220000-0000-2222-2222-222222222222'::uuid);
insert into public.follows (follower_id, following_id)
values ('5b220000-0000-2222-2222-222222222222',
        '5b110000-0000-1111-1111-111111111111');
reset role;
select pg_temp.become_platform();

insert into public._tap_out(line) select is(
  (select count(*)::int from public.notifications
    where user_id = '5b110000-0000-1111-1111-111111111111'::uuid
      and type = 'follow'),
  1, 'a new follower is announced to the person followed'
);

-- Pointing at the FOLLOWER, because the useful thing to do with "somebody
-- followed you" is to go and look at who they are.
insert into public._tap_out(line) select is(
  (select link from public.notifications
    where user_id = '5b110000-0000-1111-1111-111111111111'::uuid
      and type = 'follow'),
  '/members/ng_reader',
  'and it links to the follower''s profile, not to your own'
);

-- Unfollowing hard-deletes, and there is no DELETE trigger: withdrawing a
-- follow is not an event anybody needs telling about.
select pg_temp.become('5b220000-0000-2222-2222-222222222222'::uuid);
delete from public.follows
 where follower_id = '5b220000-0000-2222-2222-222222222222'::uuid
   and following_id = '5b110000-0000-1111-1111-111111111111'::uuid;
reset role;
select pg_temp.become_platform();

insert into public._tap_out(line) select is(
  (select count(*)::int from public.notifications
    where user_id = '5b110000-0000-1111-1111-111111111111'::uuid
      and type = 'follow'),
  1, 'and unfollowing announces nothing'
);

-- ===========================================================================
-- Direct messages
--
-- Sent BY THE MEMBER on purpose. auth.uid() inside the trigger is then the
-- sender rather than NULL, which is the state in which notifications_guard is
-- live -- and the reason the dedupe below deletes and re-inserts instead of
-- updating. Inserting these as the platform would have tested the wrong
-- branch, exactly as `reset role` alone did in 18_advertising.
-- ===========================================================================

select pg_temp.become('5b110000-0000-1111-1111-111111111111'::uuid);
insert into public._tap_conv
  select public.open_direct_conversation('5b220000-0000-2222-2222-222222222222'::uuid);

insert into public.messages (conversation_id, author_id, body)
values ((select dm_id from public._tap_conv),
        '5b110000-0000-1111-1111-111111111111',
        'The money for the borehole has cleared.');
reset role;
select pg_temp.become_platform();

insert into public._tap_out(line) select is(
  (select count(*)::int from public.notifications
    where user_id = '5b220000-0000-2222-2222-222222222222'::uuid
      and type = 'message'),
  1, 'a direct message notifies the person it was sent to'
);

-- THE assertion. A withdrawn message blanks its body in the database so that
-- no stale copy of the words survives anywhere; a notification quoting them
-- would be exactly such a copy, and nothing would ever blank it.
insert into public._tap_out(line) select is(
  (select body from public.notifications
    where user_id = '5b220000-0000-2222-2222-222222222222'::uuid
      and type = 'message'),
  null, 'and NEVER carries a single word of what it said'
);

insert into public._tap_out(line) select is(
  (select count(*)::int from public.notifications
    where user_id = '5b110000-0000-1111-1111-111111111111'::uuid
      and type = 'message'),
  0, 'the sender is not told about their own message'
);

-- A thread of two hundred messages must not put two hundred rows in a tray.
select pg_temp.become('5b110000-0000-1111-1111-111111111111'::uuid);
insert into public.messages (conversation_id, author_id, body)
values ((select dm_id from public._tap_conv),
        '5b110000-0000-1111-1111-111111111111', 'And the pump is ordered.');
insert into public.messages (conversation_id, author_id, body)
values ((select dm_id from public._tap_conv),
        '5b110000-0000-1111-1111-111111111111', 'Arriving on Orie.');
reset role;
select pg_temp.become_platform();

insert into public._tap_out(line) select is(
  (select count(*)::int from public.notifications
    where user_id = '5b220000-0000-2222-2222-222222222222'::uuid
      and type = 'message'),
  1, 'three messages in one conversation leave ONE unread notification'
);

-- ...but once it has been read, the next message is news again. Only unread
-- ones are collapsed.
select pg_temp.become('5b220000-0000-2222-2222-222222222222'::uuid);
update public.notifications set read_at = now()
 where user_id = '5b220000-0000-2222-2222-222222222222'::uuid and type = 'message';
reset role;

select pg_temp.become('5b110000-0000-1111-1111-111111111111'::uuid);
insert into public.messages (conversation_id, author_id, body)
values ((select dm_id from public._tap_conv),
        '5b110000-0000-1111-1111-111111111111', 'It has arrived.');
reset role;
select pg_temp.become_platform();

insert into public._tap_out(line) select is(
  (select count(*)::int from public.notifications
    where user_id = '5b220000-0000-2222-2222-222222222222'::uuid
      and type = 'message' and read_at is null),
  1, 'and a message after that one was read is news again'
);

-- ===========================================================================
-- Group messages, and the member who left
-- ===========================================================================

insert into public.groups (id, name, slug, visibility, created_by)
values ('9f000000-0000-0000-0000-0000000000f1',
        'Tap Notify Group', 'tap-notify-group', 'public',
        '5b110000-0000-1111-1111-111111111111');

insert into public.group_members (group_id, user_id, role)
values ('9f000000-0000-0000-0000-0000000000f1',
        '5b220000-0000-2222-2222-222222222222', 'member'),
       ('9f000000-0000-0000-0000-0000000000f1',
        '5b330000-0000-3333-3333-333333333333', 'member')
on conflict do nothing;

insert into public.conversations (id, group_id)
values ('9f000000-0000-0000-0000-0000000000f2',
        '9f000000-0000-0000-0000-0000000000f1');

-- ng_leaver opens the chat -- which creates their read marker -- and then
-- leaves the group. The marker survives, deliberately: nothing deletes it.
insert into public.conversation_members (conversation_id, user_id)
values ('9f000000-0000-0000-0000-0000000000f2',
        '5b330000-0000-3333-3333-333333333333')
on conflict do nothing;

delete from public.group_members
 where group_id = '9f000000-0000-0000-0000-0000000000f1'
   and user_id = '5b330000-0000-3333-3333-333333333333';

select pg_temp.become('5b110000-0000-1111-1111-111111111111'::uuid);
insert into public.messages (conversation_id, author_id, body)
values ('9f000000-0000-0000-0000-0000000000f2',
        '5b110000-0000-1111-1111-111111111111',
        'Meeting on Afor at the town hall.');
reset role;
select pg_temp.become_platform();

insert into public._tap_out(line) select is(
  (select count(*)::int from public.notifications
    where user_id = '5b220000-0000-2222-2222-222222222222'::uuid
      and type = 'message'
      and link = '/messages/9f000000-0000-0000-0000-0000000000f2'),
  1, 'a group message notifies the members of the group'
);

-- The one that matters. Membership of the GROUP is the access rule; a read
-- marker is not an access grant, and telling somebody who left that there is a
-- new message tells them the group is still talking.
insert into public._tap_out(line) select is(
  (select count(*)::int from public.notifications
    where user_id = '5b330000-0000-3333-3333-333333333333'::uuid),
  0, 'and tells NOBODY who left the group, stale read marker and all'
);

insert into public._tap_out(line) select * from finish();

select coalesce(
  (select string_agg(line, chr(10) order by at)
     from public._tap_out
    where line not like 'ok %'),
  'ALL ASSERTIONS PASSED'
) as result;
rollback;
