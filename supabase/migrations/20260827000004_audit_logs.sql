-- Ezike Oba :: Foundation 004
-- Administrative audit trail.
--
-- Every consequential admin action is recorded here. Ordinary users can never
-- read or write this table; even admins cannot UPDATE or DELETE rows, so the
-- trail stays trustworthy. Writes go through log_admin_action().

create table if not exists public.audit_logs (
  id             bigint generated always as identity primary key,
  actor_id       uuid references auth.users(id) on delete set null,
  actor_username citext,          -- denormalised: survives account deletion
  action         text not null,   -- e.g. 'geo_entity.update', 'user.suspend'
  entity_type    text not null,   -- e.g. 'geo_entities', 'profiles'
  entity_id      text,            -- text, not uuid: some entities key on bigint
  previous_state jsonb,
  new_state      jsonb,
  metadata       jsonb not null default '{}'::jsonb,
  ip_address     inet,
  user_agent     text,
  created_at     timestamptz not null default now(),

  constraint audit_logs_action_not_blank check (length(btrim(action)) > 0),
  constraint audit_logs_entity_type_not_blank check (length(btrim(entity_type)) > 0)
);

create index if not exists audit_logs_actor_idx   on public.audit_logs (actor_id, created_at desc);
create index if not exists audit_logs_entity_idx  on public.audit_logs (entity_type, entity_id, created_at desc);
create index if not exists audit_logs_action_idx  on public.audit_logs (action, created_at desc);
create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);

-- ---------------------------------------------------------------------------
-- The only supported way to write an audit row.
-- SECURITY DEFINER so the INSERT succeeds under the table's deny-all policy,
-- but it resolves the actor from auth.uid() and refuses anonymous calls, so a
-- caller cannot forge an actor.
-- ---------------------------------------------------------------------------

create or replace function public.log_admin_action(
  p_action         text,
  p_entity_type    text,
  p_entity_id      text default null,
  p_previous_state jsonb default null,
  p_new_state      jsonb default null,
  p_metadata       jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_actor uuid := auth.uid();
  v_username citext;
  v_id bigint;
begin
  if v_actor is null then
    raise exception 'log_admin_action: no authenticated actor'
      using errcode = 'insufficient_privilege';
  end if;

  select p.username into v_username from public.profiles p where p.id = v_actor;

  insert into public.audit_logs (
    actor_id, actor_username, action, entity_type, entity_id,
    previous_state, new_state, metadata
  )
  values (
    v_actor, v_username, p_action, p_entity_type, p_entity_id,
    p_previous_state, p_new_state, coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$fn$;

revoke all on function public.log_admin_action(text, text, text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.log_admin_action(text, text, text, jsonb, jsonb, jsonb) to authenticated;
