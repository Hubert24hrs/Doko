-- Ezike Oba :: Phase 3 -- 016
-- Group conversations.
--
-- Slice 2 of messaging. Almost all of this is absorbed by shapes that already
-- exist: a conversation gains a `group_id`, exactly as a post did, and
-- `in_conversation()` learns to answer for it. Every message policy asks
-- `in_conversation()` and therefore inherits group access without being
-- touched -- the same property that let comments, reactions and media inherit
-- the followers-only tier without a single change.
--
-- The one thing that genuinely had to be got right is at the top of the
-- helper below: a read marker is not an access grant.

-- ---------------------------------------------------------------------------
-- A conversation can belong to a group
-- ---------------------------------------------------------------------------

alter table public.conversations
  add column if not exists group_id uuid references public.groups(id) on delete cascade;

-- One conversation per group. Partial, because a direct conversation has no
-- group and several of those must coexist.
create unique index if not exists conversations_group_uniq
  on public.conversations (group_id) where group_id is not null;

-- A conversation is a pair OR a group, never both and never neither. Without
-- this a row could carry a dm_key and a group_id and satisfy two different
-- access rules at once, which is the sort of thing that is discovered late.
do $$ begin
  alter table public.conversations
    add constraint conversations_pair_or_group
    check (
      (dm_key is not null and group_id is null)
      or (dm_key is null and group_id is not null)
    );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Access
--
-- A GROUP conversation's membership is the GROUP's membership, and nothing
-- else. This is not a preference; it is the whole security property.
--
-- The obvious implementation -- "you are in the conversation if a
-- conversation_members row exists, OR you are in the group" -- is wrong, and
-- wrong in the direction that leaks. conversation_members rows are read
-- markers: they are created when somebody first opens a thread and they are
-- not removed when that person leaves the group. Accepting one as proof of
-- access would mean leaving a group left you able to read its chat forever.
--
-- So a group conversation consults group_members ONLY, and the read marker is
-- ignored for the purposes of access.
-- ---------------------------------------------------------------------------

create or replace function public.in_conversation(
  target_conversation_id uuid,
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.conversations c
     where c.id = target_conversation_id
       and case
             when c.group_id is not null
               then public.is_group_member(c.group_id, check_user_id)
             else exists (
               select 1 from public.conversation_members m
                where m.conversation_id = c.id
                  and m.user_id = check_user_id
             )
           end
  );
$fn$;

-- ---------------------------------------------------------------------------
-- Opening a group conversation
--
-- Idempotent, like the direct one, and for the same reason: a group has one
-- chat, and pressing the button is a request to be in it rather than a request
-- to make another.
--
-- Unlike the direct one it inserts NO membership rows. A group of five hundred
-- must not materialise five hundred read markers the moment somebody opens the
-- chat; the markers are created lazily, by the people who actually read.
-- ---------------------------------------------------------------------------

create or replace function public.open_group_conversation(target_group_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_me uuid := auth.uid();
  v_id uuid;
begin
  if v_me is null then
    raise exception 'Not signed in' using errcode = 'insufficient_privilege';
  end if;

  -- Membership is the access rule here as everywhere else about groups.
  -- Reading a public group does not entitle you to its conversation, for the
  -- same reason it does not entitle you to post in it.
  if not public.is_group_member(target_group_id, v_me)
     or not public.is_active_member(v_me) then
    raise exception 'You are not a member of that group'
      using errcode = 'insufficient_privilege';
  end if;

  select id into v_id from public.conversations where group_id = target_group_id;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.conversations (group_id, created_by)
  values (target_group_id, v_me)
  on conflict (group_id) where group_id is not null do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.conversations where group_id = target_group_id;
  end if;

  return v_id;
end;
$fn$;

revoke all on function public.open_group_conversation(uuid) from public, anon;
grant execute on function public.open_group_conversation(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Read markers, created on demand
--
-- A member may now create their OWN marker, but only in a conversation they
-- are already in. For a group conversation in_conversation() is satisfied by
-- group membership, so the row can be created. For a DIRECT conversation
-- in_conversation() is satisfied only by the very row being inserted, so this
-- policy can never admit anybody to a private conversation -- those still come
-- into existence exclusively through open_direct_conversation().
-- ---------------------------------------------------------------------------

drop policy if exists conversation_members_insert_own on public.conversation_members;
create policy conversation_members_insert_own
  on public.conversation_members for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.in_conversation(conversation_id)
  );

grant insert on public.conversation_members to authenticated;

-- ---------------------------------------------------------------------------
-- The inbox, now that a conversation may be a group
--
-- Dropped and recreated rather than replaced: the return type changes, and
-- CREATE OR REPLACE cannot do that.
-- ---------------------------------------------------------------------------

drop function if exists public.my_conversation_summaries();

create or replace function public.my_conversation_summaries()
returns table (
  conversation_id uuid,
  last_message_at timestamptz,
  last_read_at timestamptz,
  unread_count integer,
  other_user_id uuid,
  group_id uuid,
  group_name text,
  preview text,
  preview_author_id uuid,
  preview_withdrawn boolean
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $fn$
  with mine as (
    select
      c.id,
      c.dm_key,
      c.group_id,
      c.last_message_at,
      -- The effective read marker.
      --
      -- A group member who has never opened the chat has no marker, and the
      -- honest baseline is when they JOINED -- not the beginning of time,
      -- which would greet them with four thousand unread messages from before
      -- they arrived.
      --
      -- greatest() covers rejoining: an old marker from a previous membership
      -- must not resurrect everything said while they were away.
      case
        when c.group_id is not null
          then greatest(coalesce(cm.last_read_at, gm.joined_at), gm.joined_at)
        else cm.last_read_at
      end as effective_read
    from public.conversations c
    left join public.conversation_members cm
      on cm.conversation_id = c.id and cm.user_id = auth.uid()
    left join public.group_members gm
      on gm.group_id = c.group_id and gm.user_id = auth.uid()
    -- The same rule in_conversation() applies, restated here so the function
    -- does not lean on the policy for its correctness. It has to be the same
    -- rule, too: `cm.user_id is not null or gm.user_id is not null` would
    -- readmit somebody who left a group but still has the read marker they
    -- created while they were in it.
    where (c.group_id is null and cm.user_id is not null)
       or (c.group_id is not null and gm.user_id is not null)
  )
  select
    mine.id,
    mine.last_message_at,
    mine.effective_read,
    (
      select count(*)::integer
        from public.messages m
       where m.conversation_id = mine.id
         and m.created_at > mine.effective_read
         and m.author_id <> auth.uid()
         and m.deleted_at is null
    ),
    -- Only meaningful for a pair. A group conversation has read markers for
    -- everyone who has opened it, and picking one of them arbitrarily would
    -- label the group with whichever member happened to sort first.
    case when mine.dm_key is not null then (
      select o.user_id
        from public.conversation_members o
       where o.conversation_id = mine.id
         and o.user_id <> auth.uid()
       limit 1
    ) end,
    mine.group_id,
    g.name,
    last_msg.body,
    last_msg.author_id,
    last_msg.deleted_at is not null
  from mine
  left join public.groups g on g.id = mine.group_id
  left join lateral (
    select m.body, m.author_id, m.deleted_at
      from public.messages m
     where m.conversation_id = mine.id
     order by m.created_at desc
     limit 1
  ) last_msg on true
  order by mine.last_message_at desc nulls last;
$fn$;

revoke all on function public.my_conversation_summaries() from public, anon;
grant execute on function public.my_conversation_summaries() to authenticated;

-- The badge total, with the same baseline rule.
create or replace function public.my_unread_message_count()
returns integer
language sql
stable
security invoker
set search_path = public, pg_temp
as $fn$
  select coalesce(sum(s.unread_count)::integer, 0)
    from public.my_conversation_summaries() s;
$fn$;

revoke all on function public.my_unread_message_count() from public, anon;
grant execute on function public.my_unread_message_count() to authenticated;
