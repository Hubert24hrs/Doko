-- Ezike Oba :: what the walkthrough actually produced
--
-- Run this in the Supabase SQL Editor AFTER doing the two-window walkthrough.
-- It reads only; it changes nothing and needs no rollback.
--
-- ONE STATEMENT, ONE TABLE. The SQL Editor shows only the result of the LAST
-- statement in a script, so the first version of this file -- four separate
-- queries -- displayed only its directory checks and silently swallowed the
-- notification rules above them, which were the point. Everything is now a
-- row in a single result.
--
-- THREE KINDS OF ROW:
--
--   PASS / FAIL    a rule that must hold.
--   EXERCISED /    whether the walkthrough actually produced anything for the
--   NOT EXERCISED  rules to check. A rule like "message notifications carry no
--                  body" PASSES VACUOUSLY when there are no message
--                  notifications at all -- it cannot tell a rule that holds
--                  from a feature nobody used. That is the lesson
--                  18_advertising taught this project: a negative assertion on
--                  its own cannot tell a closed hole from a broken feature.
--
-- Read the EXERCISED rows first. A PASS next to NOT EXERCISED means nothing.

with
  window_start as (select now() - interval '6 hours' as t),

  recent as (
    select n.* from public.notifications n, window_start w
     where n.created_at > w.t
  ),

  checks as (

    -- ---------------------------------------------------------------------
    -- Coverage: did the walkthrough reach each trigger?
    -- ---------------------------------------------------------------------
    select 1 as ord, 'coverage' as kind,
           'comment notifications written' as check_name,
           (select count(*) from recent where type = 'comment') as n
    union all
    select 2, 'coverage', 'reaction notifications written',
           (select count(*) from recent where type = 'reaction')
    union all
    select 3, 'coverage', 'follow notifications written',
           (select count(*) from recent where type = 'follow')
    union all
    select 4, 'coverage', 'message notifications written',
           (select count(*) from recent where type = 'message')
    union all
    select 5, 'coverage', 'issue-confirmed notifications written',
           (select count(*) from recent where type = 'issue_confirmed')
    union all
    select 6, 'coverage', 'community edits recorded in audit_logs',
           (select count(*) from public.audit_logs l, window_start w
             where l.entity_type = 'geo_entities' and l.created_at > w.t)

    -- ---------------------------------------------------------------------
    -- Rules: must all be zero.
    -- ---------------------------------------------------------------------
    union all
    -- `messages` is the one table with no staff read policy, and withdrawal
    -- BLANKS the body in the database. A notification quoting it would be a
    -- copy that survives withdrawal, and nothing would ever blank it.
    select 10, 'rule', 'message notifications carry no message body',
           (select count(*) from public.notifications
             where type = 'message' and body is not null)
    union all
    -- A thread of two hundred messages must not put two hundred rows in a tray.
    select 11, 'rule', 'one unread message notification per conversation',
           (select count(*) from (
              select user_id, link from public.notifications
               where type = 'message' and read_at is null
               group by user_id, link having count(*) > 1) d)
    union all
    select 12, 'rule', 'nobody is notified about their own action',
           (select count(*) from public.notifications
             where actor_id is not null and actor_id = user_id)
    union all
    -- An absolute URL is a phishing surface: the list renders it as a link the
    -- member has every reason to trust. Migration 033 added the CHECK.
    select 13, 'rule', 'every notification link is a path inside this app',
           (select count(*) from public.notifications
             where link is not null
               and (link not like '/%' or link like '//%'))
    union all
    -- conversation_members rows survive a departure, so this is the check that
    -- catches a notification leaking to somebody who left the group.
    select 14, 'rule', 'no message notification for a departed group member',
           (select count(*)
              from public.notifications n
              join public.conversations c on n.link = '/messages/' || c.id::text
             where n.type = 'message'
               and c.group_id is not null
               and not exists (select 1 from public.group_members gm
                                where gm.group_id = c.group_id
                                  and gm.user_id = n.user_id))

    -- ---------------------------------------------------------------------
    -- Directory: cheap invariants, worth re-asserting after a person has
    -- edited the tree by hand for the first time.
    -- ---------------------------------------------------------------------
    union all
    select 20, 'rule', 'exactly one Local Government Area',
           abs((select count(*) from public.geo_entities
                 where kind = 'lga' and deleted_at is null) - 1)
    union all
    select 21, 'rule', 'no two communities share a slug',
           (select count(*) from (
              select lower(slug::text) from public.geo_entities
               where deleted_at is null
               group by lower(slug::text) having count(*) > 1) d)
    union all
    select 22, 'rule', 'no community has a missing or deleted parent',
           (select count(*) from public.geo_entities c
             where c.deleted_at is null and c.parent_id is not null
               and not exists (select 1 from public.geo_entities p
                                where p.id = c.parent_id and p.deleted_at is null))
    union all
    select 23, 'info', 'live communities (58 = the seeded directory)',
           (select count(*) from public.geo_entities where deleted_at is null)
  )

select
  check_name,
  n as count,
  case
    when kind = 'coverage' and n > 0  then 'EXERCISED'
    when kind = 'coverage'            then 'NOT EXERCISED -- do this step'
    when kind = 'rule'     and n = 0  then 'PASS'
    when kind = 'rule'                then 'FAIL -- paste this row back'
    else '--'
  end as result
from checks
order by ord;
