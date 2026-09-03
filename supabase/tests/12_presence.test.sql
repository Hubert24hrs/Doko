-- Ezike Oba :: presence authorization
--
-- Run either way:
--   * locally:  supabase test db
--   * hosted:   paste this whole file into the Supabase SQL Editor
--               (requires: create extension if not exists pgtap with schema extensions;)
--
-- Presence itself is not stored anywhere, so there is nothing here about who
-- is online. What IS testable, and worth testing, is the function that decides
-- WHICH presence channel a caller may join -- because the whole privacy of
-- presence rests on a regular expression, and a regular expression is exactly
-- the sort of thing that is subtly wrong for a year.
--
-- The failure that matters: conversation_from_presence_topic() must return
-- NULL rather than raise for every topic that is not a conversation topic. A
-- cast that throws inside a policy turns a nonsense channel name into an
-- error, and an error in a policy is not a refusal.

begin;

set local search_path = public, extensions, pg_temp;
select plan(14);

create table public._tap_out (
  at   timestamptz not null default clock_timestamp(),
  line text
);
grant insert, select on public._tap_out to public;
alter table public._tap_out disable row level security;

-- ---------------------------------------------------------------------------
-- The topic parser
-- ---------------------------------------------------------------------------

insert into public._tap_out(line) select is(
  public.conversation_from_presence_topic(
    'presence:3f2504e0-4f89-41d3-9a0c-0305e82c3301'),
  '3f2504e0-4f89-41d3-9a0c-0305e82c3301'::uuid,
  'a conversation presence topic yields its conversation id'
);

-- Everything below must be NULL, and must not raise. NULL flows into
-- in_conversation(), which answers false -- so an unparseable topic is refused
-- rather than erroring.
insert into public._tap_out(line) select ok(
  public.conversation_from_presence_topic('presence:not-a-uuid') is null,
  'a topic whose tail is not a uuid yields null rather than raising'
);

insert into public._tap_out(line) select ok(
  public.conversation_from_presence_topic('presence:') is null,
  'an empty tail yields null'
);

insert into public._tap_out(line) select ok(
  public.conversation_from_presence_topic('') is null,
  'an empty topic yields null'
);

insert into public._tap_out(line) select ok(
  public.conversation_from_presence_topic(null) is null,
  'a null topic yields null'
);

-- The anchors matter. Without ^ and $ any of these would parse, and the last
-- one would hand a policy the id of a conversation the caller is entitled to
-- while subscribing them to a channel named something else entirely.
insert into public._tap_out(line) select ok(
  public.conversation_from_presence_topic(
    'xpresence:3f2504e0-4f89-41d3-9a0c-0305e82c3301') is null,
  'a topic that merely ENDS with a valid one is refused'
);

insert into public._tap_out(line) select ok(
  public.conversation_from_presence_topic(
    'presence:3f2504e0-4f89-41d3-9a0c-0305e82c3301:extra') is null,
  'and one with anything appended is refused'
);

insert into public._tap_out(line) select ok(
  public.conversation_from_presence_topic(
    'conversation:3f2504e0-4f89-41d3-9a0c-0305e82c3301') is null,
  'the message channel is not a presence channel'
);

insert into public._tap_out(line) select ok(
  public.conversation_from_presence_topic(
    'presence:3F2504E0-4F89-41D3-9A0C-0305E82C3301') is null,
  'an uppercase id is refused rather than silently accepted'
);

insert into public._tap_out(line) select ok(
  public.conversation_from_presence_topic(
    'presence:3f2504e04f8941d39a0c0305e82c3301') is null,
  'and so is one without its hyphens'
);

-- ---------------------------------------------------------------------------
-- What the policy does with the result
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values
  ('c1110000-1111-1111-1111-111111111111'::uuid, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'pr-a@example.com', '{"username":"pr_alice","full_name":"Pr Alice"}');

create or replace function pg_temp.become(user_id uuid)
returns void language plpgsql as $$
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims to %L',
    json_build_object('sub', user_id::text, 'role', 'authenticated')::text);
end $$;

select pg_temp.become('c1110000-1111-1111-1111-111111111111'::uuid);

-- The composition the policy actually performs. A null conversation id must
-- come back false, not null: a policy that evaluates to NULL does not admit,
-- but relying on that would be relying on an accident.
insert into public._tap_out(line) select is(
  public.in_conversation(public.conversation_from_presence_topic('presence:nonsense')),
  false,
  'an unparseable topic refuses the channel'
);

insert into public._tap_out(line) select is(
  public.in_conversation(
    public.conversation_from_presence_topic(
      'presence:3f2504e0-4f89-41d3-9a0c-0305e82c3301')),
  false,
  'and so does a well-formed id for a conversation the caller is not in'
);
reset role;

-- ---------------------------------------------------------------------------
-- The function itself
-- ---------------------------------------------------------------------------

insert into public._tap_out(line) select ok(
  (select p.provolatile = 'i'
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'conversation_from_presence_topic'),
  'the parser is IMMUTABLE, so a policy can use it freely'
);

-- Every definer helper in this schema pins its search_path. This one is not a
-- definer, but it is called from a policy, so it is held to the same rule.
insert into public._tap_out(line) select ok(
  (select p.proconfig::text like '%search_path%'
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'conversation_from_presence_topic'),
  'and pins its search_path, as everything reachable from a policy must'
);

insert into public._tap_out(line) select * from finish();

select coalesce(
  (select string_agg(line, chr(10) order by at)
     from public._tap_out
    where line not like 'ok %'),
  'ALL ASSERTIONS PASSED'
) as result;
rollback;
