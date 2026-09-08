-- Migration 035: the four notifications that were promised and never delivered
--
-- Migration 022's own header lists five things a member is notified about:
--
--     1. An issue they reported is confirmed by a neighbour.
--     2. An issue they reported or confirmed moves to a new status.
--     3. A member comments on their post or replies to their comment.
--     4. A member follows their profile.
--     5. A direct message arrives.
--
-- It implemented 1 and 2. Half of 3 does not exist to implement -- comments
-- are flat, with no parent_id and no reply concept in the app -- so what is
-- added below is: a comment on your post, a reaction to it, a new follower,
-- and a message.
--
-- The `notifications_type_check` CHECK admits
-- 'comment', 'reaction', 'follow' and 'message', and
-- src/features/notifications/components/notification-list.tsx draws an icon
-- for each of them -- so the type exists, the UI is ready for it, and nothing
-- has ever produced one. Comment on somebody's post, follow them, react to
-- what they wrote, or send them a message, and they are told nothing.
--
-- The same shape as the rest of this audit, one step further along: not a rule
-- written as a comment instead of a mechanism, but a FEATURE written as a
-- comment instead of a mechanism.
--
-- ---------------------------------------------------------------------------
-- Two things these triggers must get right
-- ---------------------------------------------------------------------------
--
-- 1. A NOTIFICATION MUST NOT CARRY THE WORDS OF A PRIVATE MESSAGE.
--
--    `messages` is the one table in this schema with no staff read policy, and
--    withdrawing a message BLANKS ITS BODY IN THE DATABASE -- deliberately, so
--    that "a stale client, a cached payload or a realtime event must not still
--    be carrying the words of a message somebody withdrew." A notification row
--    quoting the body would be exactly such a copy, and nothing would blank
--    it. So the message notification says that a message arrived and who from,
--    and never what it said. The issue and comment notifications quote freely,
--    because a post and an issue are public speech.
--
-- 2. auth.uid() INSIDE THESE TRIGGERS IS THE ACTING MEMBER, NOT NULL.
--
--    SECURITY DEFINER changes the executing role, not auth.uid() -- the lesson
--    migration 032 was written for, arriving from the other direction this
--    time. `notifications_guard` (migration 033) restores every column but
--    `read_at` whenever auth.uid() is not null, so a trigger that tried to
--    UPDATE an existing notification would have its change silently undone.
--    That is why the message dedupe below DELETES and re-inserts rather than
--    updating: DELETE has no guard, and INSERT is not what the guard defends.

-- ---------------------------------------------------------------------------
-- 3. Comments, and replies to comments
-- ---------------------------------------------------------------------------

create or replace function public.notify_on_comment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_post_author uuid;
  v_actor_name text;
  v_excerpt text;
begin
  select coalesce(full_name, username) into v_actor_name
    from public.profiles where id = new.author_id;
  v_actor_name := coalesce(v_actor_name, 'Someone');

  v_excerpt := left(btrim(new.body), 120);

  select author_id into v_post_author
    from public.posts where id = new.post_id and deleted_at is null;

  -- The author of the post, unless they are the one commenting.
  if v_post_author is not null and v_post_author <> new.author_id then
    insert into public.notifications (user_id, actor_id, type, title, body, link)
    values (v_post_author, new.author_id, 'comment',
            v_actor_name || ' commented on your post',
            v_excerpt,
            '/posts/' || new.post_id);
  end if;

  -- Migration 022's header also promised "or replies to their comment". There
  -- is no such thing to notify about: `comments` has no parent_id and the
  -- comments feature has no reply concept -- they are flat, one level under a
  -- post. Writing the branch would have failed at runtime on every comment
  -- with "record new has no field parent_id", since plpgsql resolves that only
  -- when the trigger actually fires. If threading is ever added, this is where
  -- the second notification goes.

  return new;
end;
$fn$;

drop trigger if exists comments_notify on public.comments;
create trigger comments_notify
  after insert on public.comments
  for each row execute function public.notify_on_comment();

-- ---------------------------------------------------------------------------
-- 4. Reactions
--
-- One row per person per post, so this fires once per person however many
-- times they change their mind -- a reaction is UPDATEd in place, and this is
-- an INSERT trigger.
-- ---------------------------------------------------------------------------

create or replace function public.notify_on_reaction()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_post_author uuid;
  v_actor_name text;
begin
  select author_id into v_post_author
    from public.posts where id = new.post_id and deleted_at is null;

  if v_post_author is null or v_post_author = new.user_id then
    return new;
  end if;

  select coalesce(full_name, username) into v_actor_name
    from public.profiles where id = new.user_id;

  insert into public.notifications (user_id, actor_id, type, title, body, link)
  values (v_post_author, new.user_id, 'reaction',
          coalesce(v_actor_name, 'Someone') || ' reacted to your post',
          null,
          '/posts/' || new.post_id);

  return new;
end;
$fn$;

drop trigger if exists reactions_notify on public.reactions;
create trigger reactions_notify
  after insert on public.reactions
  for each row execute function public.notify_on_reaction();

-- ---------------------------------------------------------------------------
-- 5. Follows
--
-- Links to the FOLLOWER's profile, not to your own: the useful thing to do
-- with "somebody followed you" is to go and look at who they are.
-- ---------------------------------------------------------------------------

create or replace function public.notify_on_follow()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_actor_name text;
  v_actor_username text;
begin
  select coalesce(full_name, username), username
    into v_actor_name, v_actor_username
    from public.profiles where id = new.follower_id;

  if v_actor_username is null then
    return new;
  end if;

  insert into public.notifications (user_id, actor_id, type, title, body, link)
  values (new.following_id, new.follower_id, 'follow',
          coalesce(v_actor_name, 'Someone') || ' started following you',
          null,
          '/members/' || v_actor_username);

  return new;
end;
$fn$;

drop trigger if exists follows_notify on public.follows;
create trigger follows_notify
  after insert on public.follows
  for each row execute function public.notify_on_follow();

-- ---------------------------------------------------------------------------
-- 6. Direct and group messages
--
-- Everybody in the conversation except the author, and -- for a group -- only
-- people who are still in the group, since `conversation_members` rows are
-- READ MARKERS and nothing deletes them when somebody leaves. That is the
-- distinction migration 016 turned on, and a notification is exactly the sort
-- of thing that would quietly reintroduce the leak: telling somebody who left
-- a group that there is a new message in it tells them the group is still
-- talking.
--
-- One unread notification per conversation, not one per message. A thread of
-- two hundred messages must not produce two hundred rows in a tray. The
-- previous unread one is DELETED and a fresh one inserted, because an UPDATE
-- would be reverted by notifications_guard -- auth.uid() inside this trigger
-- is the sender, not NULL.
-- ---------------------------------------------------------------------------

create or replace function public.notify_on_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_group_id uuid;
  v_actor_name text;
  v_recipient uuid;
begin
  select group_id into v_group_id
    from public.conversations where id = new.conversation_id;

  select coalesce(full_name, username) into v_actor_name
    from public.profiles where id = new.author_id;
  v_actor_name := coalesce(v_actor_name, 'Someone');

  for v_recipient in
    select m.user_id
      from public.conversation_members m
     where m.conversation_id = new.conversation_id
       and m.user_id <> new.author_id
    union
    select gm.user_id
      from public.group_members gm
     where v_group_id is not null
       and gm.group_id = v_group_id
       and gm.user_id <> new.author_id
  loop
    -- Membership of the GROUP is the access rule, not the presence of a read
    -- marker. Somebody who left keeps their marker and must be told nothing.
    if v_group_id is not null
       and not exists (select 1 from public.group_members gm
                        where gm.group_id = v_group_id
                          and gm.user_id = v_recipient) then
      continue;
    end if;

    delete from public.notifications
     where user_id = v_recipient
       and type = 'message'
       and read_at is null
       and link = '/messages/' || new.conversation_id;

    insert into public.notifications (user_id, actor_id, type, title, body, link)
    values (v_recipient, new.author_id, 'message',
            'New message from ' || v_actor_name,
            -- Never the body. See the header.
            null,
            '/messages/' || new.conversation_id);
  end loop;

  return new;
end;
$fn$;

drop trigger if exists messages_notify on public.messages;
create trigger messages_notify
  after insert on public.messages
  for each row execute function public.notify_on_message();
