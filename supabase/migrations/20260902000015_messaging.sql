-- Ezike Oba :: Phase 3 -- 015
-- Direct messages.
--
-- The first slice of messaging: one-to-one conversations only. Group
-- conversations lean on group_members and come next; nothing here forecloses
-- them, which is why the table is called `conversations` and not `dms`.
--
-- Three things shape the design:
--
--   * A pair of people must have exactly ONE conversation. If two people
--     message each other at the same moment and each creates a conversation,
--     they end up with half the history each and no error anywhere. The
--     canonical pair key below makes that impossible rather than unlikely.
--   * Creating a conversation means inserting a membership row for SOMEBODY
--     ELSE. No RLS policy can safely allow that -- groups already refuses it
--     -- so conversations are opened through a SECURITY DEFINER function and
--     have no INSERT policy at all.
--   * A private message is not public speech. Staff have NO read policy here,
--     deliberately, and that is the one place this schema departs from
--     "staff moderate everything".

-- ---------------------------------------------------------------------------
-- Conversations
-- ---------------------------------------------------------------------------

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),

  -- The canonical pair, as least(a,b) || ':' || greatest(a,b). Ordering the
  -- pair is what makes it canonical: without the ordering, (a,b) and (b,a) are
  -- two different keys and the uniqueness buys nothing.
  --
  -- NULL is reserved for a conversation that is not a pair -- a group
  -- conversation, next slice. The unique index is partial for that reason.
  dm_key text,

  created_by uuid references public.profiles(id) on delete set null,

  -- Denormalised for inbox ordering, trigger-maintained, exactly as the post
  -- engagement counts are: ordering an inbox by a correlated subquery over
  -- messages gets slower with every message ever sent.
  last_message_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint conversations_dm_key_shape
    check (dm_key is null or dm_key ~ '^[0-9a-f-]{36}:[0-9a-f-]{36}$')
);

create unique index if not exists conversations_dm_key_uniq
  on public.conversations (dm_key) where dm_key is not null;

create index if not exists conversations_last_message_idx
  on public.conversations (last_message_at desc nulls last);

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Who is in a conversation
--
-- last_read_at lives here rather than in a per-message receipts table. One row
-- per person per conversation answers "how many unread" just as well as one
-- row per person per message, and does not grow with the conversation.
-- ---------------------------------------------------------------------------

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  last_read_at    timestamptz not null default now(),
  joined_at       timestamptz not null default now(),

  primary key (conversation_id, user_id)
);

-- The inbox query starts from the person, so user_id leads.
create index if not exists conversation_members_user_idx
  on public.conversation_members (user_id, conversation_id);

-- ---------------------------------------------------------------------------
-- Messages
-- ---------------------------------------------------------------------------

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,

  -- profiles, not auth.users. PostgREST embeds only across a foreign key whose
  -- target is in the exposed schema; pointing this at auth.users broke the
  -- whole feed query once and would break the whole thread query here.
  author_id uuid not null references public.profiles(id) on delete cascade,

  body text not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  edited_at  timestamptz,
  deleted_at timestamptz,

  constraint messages_body_not_blank check (deleted_at is not null or length(btrim(body)) > 0),
  constraint messages_body_length check (length(body) <= 4000)
);

-- Reading a thread is always newest-first within one conversation.
create index if not exists messages_conversation_idx
  on public.messages (conversation_id, created_at desc);

drop trigger if exists messages_set_updated_at on public.messages;
create trigger messages_set_updated_at
  before update on public.messages
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Helpers
--
-- SECURITY DEFINER for the usual reason: the conversations policy asks about
-- membership and the membership policy asks about the conversation. Without a
-- definer boundary those two recurse into each other, exactly as a policy on
-- profiles that selects from profiles does.
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
    select 1 from public.conversation_members m
     where m.conversation_id = target_conversation_id
       and m.user_id = check_user_id
  );
$fn$;

-- May the caller start a conversation with this person?
--
-- The rule is deliberately the SAME one that decides whether the caller can
-- see the profile at all: public profiles are open, 'community' profiles only
-- to people who share a community, 'private' to nobody. Inventing a second
-- rule here would create a second copy to keep in sync -- and the copy outside
-- the source of truth is the one that drifts.
--
-- The practical effect is that a private profile cannot be messaged cold,
-- which is the anti-harassment property worth having.
--
-- This takes NO check_user_id parameter, unlike every other helper here. It
-- delegates to shares_community_with(), which reads auth.uid() directly as the
-- viewer. A can_message(target, someone_else) would therefore answer for the
-- CALLER while appearing to answer for someone_else -- a wrong answer that
-- looks right. Removing the parameter removes the trap.
create or replace function public.can_message(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select
    auth.uid() is not null
    and target_user_id <> auth.uid()
    and public.is_active_member(auth.uid())
    and exists (
      select 1 from public.profiles p
       where p.id = target_user_id
         and p.deleted_at is null
         and p.is_suspended = false
         and (
           p.visibility = 'public'
           or (
             p.visibility = 'community'
             and public.shares_community_with(p.id)
           )
         )
    );
$fn$;

-- ---------------------------------------------------------------------------
-- Opening a conversation
--
-- The ONLY way a direct conversation comes into existence. It has to be a
-- definer function because it inserts a membership row for the other person,
-- and no policy can safely allow one member to add another -- group_members
-- refuses exactly that, for exactly the same reason.
--
-- It is idempotent: "open", not "create". Asking twice returns the same
-- conversation, which is what the canonical pair key is for.
-- ---------------------------------------------------------------------------

create or replace function public.open_direct_conversation(other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_me uuid := auth.uid();
  v_key text;
  v_id uuid;
begin
  if v_me is null then
    raise exception 'Not signed in' using errcode = 'insufficient_privilege';
  end if;

  if not public.can_message(other_user_id) then
    -- One message for "no such person", "they are private" and "they are
    -- suspended" alike. Distinguishing them would turn this into a probe for
    -- who exists and who has hidden themselves.
    raise exception 'You cannot start a conversation with that member'
      using errcode = 'insufficient_privilege';
  end if;

  v_key := least(v_me::text, other_user_id::text) || ':' ||
           greatest(v_me::text, other_user_id::text);

  select id into v_id from public.conversations where dm_key = v_key;
  if v_id is not null then
    return v_id;
  end if;

  -- Two people pressing "Message" at the same instant race here. The unique
  -- index decides it, and the loser takes the winner's conversation rather
  -- than seeing an error, which is why this is ON CONFLICT.
  insert into public.conversations (dm_key, created_by)
  values (v_key, v_me)
  on conflict (dm_key) where dm_key is not null do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.conversations where dm_key = v_key;
    return v_id;
  end if;

  insert into public.conversation_members (conversation_id, user_id)
  values (v_id, v_me), (v_id, other_user_id)
  on conflict do nothing;

  return v_id;
end;
$fn$;

revoke all on function public.open_direct_conversation(uuid) from public, anon;
grant execute on function public.open_direct_conversation(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Inbox ordering, trigger-maintained
--
-- Sending a message also marks it read for its own author. Otherwise everyone
-- would carry an unread count that included their own messages, which reads as
-- a bug even though the arithmetic is right.
-- ---------------------------------------------------------------------------

create or replace function public.messages_touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  update public.conversations
     set last_message_at = new.created_at,
         updated_at = now()
   where id = new.conversation_id;

  update public.conversation_members
     set last_read_at = greatest(last_read_at, new.created_at)
   where conversation_id = new.conversation_id
     and user_id = new.author_id;

  return null;
end;
$fn$;

drop trigger if exists messages_touch on public.messages;
create trigger messages_touch
  after insert on public.messages
  for each row execute function public.messages_touch_conversation();

-- ---------------------------------------------------------------------------
-- An edit is recorded, and a withdrawal takes the words with it
--
-- Blanking the body in the DATABASE rather than in the UI matters: a stale
-- client, a cached payload or a realtime event must not be able to carry the
-- text of a message somebody withdrew.
-- ---------------------------------------------------------------------------

create or replace function public.messages_guard_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    new.body := '';
    new.edited_at := old.edited_at;
    return new;
  end if;

  -- A withdrawn message stays withdrawn: nobody may restore it or rewrite it.
  if old.deleted_at is not null then
    new.body := old.body;
    new.deleted_at := old.deleted_at;
    return new;
  end if;

  if new.body is distinct from old.body then
    new.edited_at := now();
  end if;

  return new;
end;
$fn$;

drop trigger if exists messages_guard on public.messages;
create trigger messages_guard
  before update on public.messages
  for each row execute function public.messages_guard_update();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

-- Conversations -------------------------------------------------------------

-- There is deliberately no INSERT, UPDATE or DELETE policy on conversations
-- for anybody. Rows arrive only through open_direct_conversation(), and
-- last_message_at is maintained by a definer trigger that these policies do
-- not constrain.
drop policy if exists conversations_select_member on public.conversations;
create policy conversations_select_member
  on public.conversations for select
  to authenticated
  using (public.in_conversation(id));

-- Members -------------------------------------------------------------------

drop policy if exists conversation_members_select on public.conversation_members;
create policy conversation_members_select
  on public.conversation_members for select
  to authenticated
  using (public.in_conversation(conversation_id));

-- The only thing a member may change is their own read marker. There is no
-- INSERT policy -- membership arrives with the conversation -- and no DELETE
-- policy: you do not "leave" a conversation between two people, you stop
-- replying to it.
drop policy if exists conversation_members_update_own on public.conversation_members;
create policy conversation_members_update_own
  on public.conversation_members for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Messages ------------------------------------------------------------------

-- Soft-deleted messages ARE returned. A hole in a thread is more confusing
-- than a tombstone, and every reply above it stops making sense. The row keeps
-- its place and loses its words.
drop policy if exists messages_select_member on public.messages;
create policy messages_select_member
  on public.messages for select
  to authenticated
  using (public.in_conversation(conversation_id));

-- NOTE: there is NO staff select policy here, and that is deliberate. A post
-- is public speech; a private message is not. A future report flow should
-- surface one reported message through a definer function that records who
-- looked at it, rather than granting blanket read access to everybody's
-- correspondence.

drop policy if exists messages_insert_own on public.messages;
create policy messages_insert_own
  on public.messages for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and public.in_conversation(conversation_id)
    and public.is_active_member()
  );

-- An author may edit or withdraw their own message. Nobody else may touch it
-- at all, so unlike posts there is no "moderators may remove, never rewrite"
-- case to guard: moderators cannot reach these rows.
drop policy if exists messages_update_own on public.messages;
create policy messages_update_own
  on public.messages for update
  to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

-- No DELETE policy anywhere: withdrawal is deleted_at, as for posts and
-- comments, so a conversation cannot be silently rewritten.

grant select on public.conversations to authenticated;
grant select, update on public.conversation_members to authenticated;
grant select, insert, update on public.messages to authenticated;

-- ---------------------------------------------------------------------------
-- The inbox, in one round trip
--
-- Every field here is per-conversation: the unread count, the preview of the
-- last message, and who the other person is. Fetching them from the
-- application would be three queries PER CONVERSATION, and an inbox is
-- precisely the screen where that adds up.
--
-- SECURITY INVOKER, deliberately. It reads only the caller's own rows because
-- RLS says so, not because the WHERE clause remembers to -- and the WHERE
-- clause is there as well.
--
-- other_user_id is valid while every conversation is a pair. When group
-- conversations arrive it becomes NULL for them, and the caller falls back to
-- the group's name; it does not become wrong.
-- ---------------------------------------------------------------------------

create or replace function public.my_conversation_summaries()
returns table (
  conversation_id uuid,
  last_message_at timestamptz,
  last_read_at timestamptz,
  unread_count integer,
  other_user_id uuid,
  preview text,
  preview_author_id uuid,
  preview_withdrawn boolean
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $fn$
  select
    c.id,
    c.last_message_at,
    me.last_read_at,
    (
      select count(*)::integer
        from public.messages m
       where m.conversation_id = c.id
         and m.created_at > me.last_read_at
         and m.author_id <> me.user_id
         and m.deleted_at is null
    ),
    (
      select o.user_id
        from public.conversation_members o
       where o.conversation_id = c.id
         and o.user_id <> me.user_id
       limit 1
    ),
    last_msg.body,
    last_msg.author_id,
    last_msg.deleted_at is not null
  from public.conversation_members me
  join public.conversations c on c.id = me.conversation_id
  left join lateral (
    select m.body, m.author_id, m.deleted_at
      from public.messages m
     where m.conversation_id = c.id
     order by m.created_at desc
     limit 1
  ) last_msg on true
  where me.user_id = auth.uid()
  order by c.last_message_at desc nulls last;
$fn$;

revoke all on function public.my_conversation_summaries() from public, anon;
grant execute on function public.my_conversation_summaries() to authenticated;

-- The one number the navigation needs. Separate from the summaries so a page
-- that only wants a badge does not fetch every preview to add them up.
create or replace function public.my_unread_message_count()
returns integer
language sql
stable
security invoker
set search_path = public, pg_temp
as $fn$
  select coalesce(count(*)::integer, 0)
    from public.conversation_members me
    join public.messages m
      on m.conversation_id = me.conversation_id
     and m.created_at > me.last_read_at
     and m.author_id <> me.user_id
     and m.deleted_at is null
   where me.user_id = auth.uid();
$fn$;

revoke all on function public.my_unread_message_count() from public, anon;
grant execute on function public.my_unread_message_count() to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
--
-- Postgres Changes are RLS-filtered, so a subscriber is only sent rows they
-- could have selected. The client still treats an event as a SIGNAL rather
-- than as data it can trust: see docs/ARCHITECTURE.md.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'messages'
    ) then
      alter publication supabase_realtime add table public.messages;
    end if;
  end if;
end $$;
