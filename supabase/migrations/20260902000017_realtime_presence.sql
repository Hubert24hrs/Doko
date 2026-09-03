-- Ezike Oba :: Phase 3 -- 017
-- Presence and typing, and the authorization that makes them private.
--
-- Presence is deliberately NOT a table.
--
-- "Who is online" is worthless sixty seconds later, and storing it would mean
-- a database write per member per heartbeat -- a permanent stream of writes to
-- keep a fact nobody will ever read twice. It lives in Realtime, where it
-- disappears with the connection, which is exactly the lifetime the fact has.
--
-- What this migration DOES do is stop it being public.
--
-- Broadcast and presence channels are not access-controlled by default: anyone
-- holding a channel name can join it and watch. The channel name here contains
-- a conversation id, which is not guessable and which a non-member cannot
-- obtain (the page 404s for them) -- but "they would have to already know the
-- id" is obscurity, not access control, and the same argument was rejected for
-- the media bucket in migration 010.
--
-- So the presence topic is authorised by the same in_conversation() that
-- guards the messages themselves. One rule, applied in one more place.

-- ---------------------------------------------------------------------------
-- Reading the conversation id out of a topic name
--
-- Its own function so the cast can never raise. A policy that throws on a
-- malformed topic would turn a nonsense channel name into an error instead of
-- a refusal, and the regex and the cast must not be two separate steps that
-- the planner is free to reorder.
-- ---------------------------------------------------------------------------

create or replace function public.conversation_from_presence_topic(topic text)
returns uuid
language sql
immutable
set search_path = public, pg_temp
as $fn$
  select case
    when topic ~ '^presence:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then substring(topic from 10)::uuid
  end;
$fn$;

-- ---------------------------------------------------------------------------
-- Realtime authorization
--
-- Wrapped, because `realtime.messages` is owned by the Realtime extension and
-- a project that has not enabled Realtime Authorization will not have it.
-- Failing the whole migration over presence would be the wrong trade: the
-- messaging schema underneath it is what matters.
--
-- If this is skipped, the client's private channel simply refuses to subscribe
-- and the thread shows no presence at all. That is the safe direction -- it
-- degrades to the behaviour of yesterday rather than to an open channel.
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('realtime.messages') is null then
    raise notice 'realtime.messages not present; presence authorization skipped';
    return;
  end if;

  execute $p$drop policy if exists conversation_presence_read on realtime.messages$p$;
  execute $p$
    create policy conversation_presence_read
      on realtime.messages for select
      to authenticated
      using (
        realtime.messages.extension in ('presence', 'broadcast')
        and public.in_conversation(
              public.conversation_from_presence_topic(realtime.topic())
            )
      )
  $p$;

  execute $p$drop policy if exists conversation_presence_write on realtime.messages$p$;
  execute $p$
    create policy conversation_presence_write
      on realtime.messages for insert
      to authenticated
      with check (
        realtime.messages.extension in ('presence', 'broadcast')
        and public.in_conversation(
              public.conversation_from_presence_topic(realtime.topic())
            )
      )
  $p$;

exception
  when insufficient_privilege then
    raise notice 'no privilege to police realtime.messages; presence authorization skipped';
  when undefined_function then
    raise notice 'realtime.topic() not available; presence authorization skipped';
end $$;
