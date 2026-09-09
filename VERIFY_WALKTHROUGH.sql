-- Ezike Oba :: what the walkthrough actually produced
--
-- Run this in the Supabase SQL Editor AFTER doing the two-window walkthrough.
-- It reads only; it changes nothing and needs no rollback.
--
-- The point is that "it looked right" and "it IS right" are different claims.
-- Two of the rules below cannot be checked by looking at the screen at all:
-- whether a message notification is carrying the message body, and whether a
-- departed group member was told about a message. Both are invisible in the UI
-- and both are the reason those rules exist.

-- ===========================================================================
-- 1. Everything the triggers wrote in the last two hours
-- ===========================================================================

select
  n.created_at,
  n.type,
  p.username                                   as sent_to,
  coalesce(a.username, '(platform)')           as from_whom,
  n.title,
  case
    when n.type = 'message' and n.body is not null
      then '*** DEFECT: a message notification is carrying the body ***'
    else coalesce(left(n.body, 70), '(no body -- correct for message/follow/reaction)')
  end                                          as body,
  n.link,
  n.read_at is null                            as still_unread
from public.notifications n
join public.profiles p on p.id = n.user_id
left join public.profiles a on a.id = n.actor_id
where n.created_at > now() - interval '2 hours'
order by n.created_at desc
limit 60;

-- ===========================================================================
-- 2. The rules, as pass/fail
--
-- Every one of these must read PASS. Anything else is a real defect: paste the
-- row back and it can be fixed.
-- ===========================================================================

with checks as (
  -- A message notification must never carry a word of the message. `messages`
  -- is the one table with no staff read policy, and withdrawing a message
  -- BLANKS ITS BODY in the database so no stale copy survives. A notification
  -- quoting it would be exactly such a copy, and nothing would blank it.
  select
    'message notifications carry no message body' as rule,
    count(*)                                      as offenders
    from public.notifications
   where type = 'message' and body is not null

  union all

  -- One unread notification per conversation, not one per message. A thread of
  -- two hundred messages must not put two hundred rows in a tray.
  select
    'one unread message notification per conversation',
    coalesce((
      select count(*) from (
        select user_id, link
          from public.notifications
         where type = 'message' and read_at is null
         group by user_id, link
        having count(*) > 1
      ) dupes
    ), 0)

  union all

  -- Nobody is ever notified about their own action.
  select
    'nobody is notified about their own action',
    count(*)
    from public.notifications
   where actor_id is not null and actor_id = user_id

  union all

  -- Every link is a path inside this app. An absolute URL here is a phishing
  -- surface, because the notification list renders it as a link the member has
  -- every reason to trust. Migration 033 added the CHECK; this proves it holds.
  select
    'every notification link is a path inside this app',
    count(*)
    from public.notifications
   where link is not null
     and (link not like '/%' or link like '//%')

  union all

  -- A notification pointing at a conversation may only exist for somebody who
  -- is STILL in the group. conversation_members rows survive a departure, so
  -- this is the check that catches a notification leaking to somebody who left.
  select
    'no message notification for a departed group member',
    count(*)
    from public.notifications n
    join public.conversations c
      on n.link = '/messages/' || c.id::text
   where n.type = 'message'
     and c.group_id is not null
     and not exists (
       select 1 from public.group_members gm
        where gm.group_id = c.group_id
          and gm.user_id = n.user_id
     )
)
select
  rule,
  offenders,
  case when offenders = 0 then 'PASS' else 'FAIL -- investigate' end as result
from checks
order by (offenders > 0) desc, rule;

-- ===========================================================================
-- 3. Did the community editing forms actually write?
--
-- Both shipped on 2026-09-09 and had never been used by a person. Every edit
-- is recorded in audit_logs, so this shows whether the writes landed and who
-- made them -- which is also the point of logging them.
-- ===========================================================================

select
  l.created_at,
  l.action,
  coalesce(p.username, '(unknown)') as who,
  l.entity_id,
  l.new_state ->> 'name'            as name_written,
  l.previous_state ->> 'name'       as name_before
from public.audit_logs l
left join public.profiles p on p.id = l.actor_id
where l.entity_type = 'geo_entities'
  and l.created_at > now() - interval '2 hours'
order by l.created_at desc
limit 20;

-- ===========================================================================
-- 4. And the directory still holds together
--
-- Cheap invariants worth re-asserting after a person has edited the tree by
-- hand for the first time.
-- ===========================================================================

select 'live communities'                  as measure, count(*)::text as value
  from public.geo_entities where deleted_at is null
union all
select 'Local Government Areas (must be 1)',
       count(*)::text
  from public.geo_entities where kind = 'lga' and deleted_at is null
union all
select 'duplicate slugs (must be 0)',
       coalesce((
         select count(*) from (
           select lower(slug::text)
             from public.geo_entities
            where deleted_at is null
            group by lower(slug::text)
           having count(*) > 1
         ) d
       ), 0)::text
union all
select 'orphans -- parent missing or deleted (must be 0)',
       count(*)::text
  from public.geo_entities c
 where c.deleted_at is null
   and c.parent_id is not null
   and not exists (
     select 1 from public.geo_entities p
      where p.id = c.parent_id and p.deleted_at is null
   );
