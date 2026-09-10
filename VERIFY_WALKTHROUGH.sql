-- Ezike Oba :: what the walkthrough actually produced
--
-- Run this in the Supabase SQL Editor AFTER doing the two-window walkthrough.
-- It reads only; it changes nothing and needs no rollback.
--
-- ONE STATEMENT, ONE TABLE. The SQL Editor shows only the result of the LAST
-- statement in a script, so an earlier version of this file -- four separate
-- queries -- displayed only its directory checks and silently swallowed the
-- notification rules above them, which were the point.
--
-- FOUR KINDS OF ROW:
--
--   EXERCISED /     whether the walkthrough produced anything to check. A rule
--   NOT EXERCISED   such as "message notifications carry no body" PASSES
--                   VACUOUSLY when there are no message notifications at all.
--                   Read these first: a PASS beside NOT EXERCISED means nothing.
--
--   PASS / FAIL     a rule that must hold.
--
--   The FIRING rows are the ones that answer "is the feature working?". For
--   every comment, reaction, follow and direct message since the walkthrough
--   began, they ask whether the notification it SHOULD have produced exists.
--   That is the question a coverage count cannot answer: zero notifications
--   could mean nobody did anything, or that the trigger never fired.
--
-- THE WINDOW. Everything counts from 2026-09-09 00:00 WAT, the day after
-- migration 035 installed the comment, reaction, follow and message triggers.
-- Activity before that genuinely produced no notification. The first version
-- of this script used "the last six hours", which missed a walkthrough done
-- the day before it was run and reported everything as NOT EXERCISED.
--
-- ONE CAVEAT on the FIRING rows: a member may DISMISS a notification, which
-- deletes it. A dismissed notification reads here as one that never fired. If a
-- FIRING row fails, check you did not clear the notification tray first.

with
  since as (select timestamptz '2026-09-09 00:00:00+01' as t),

  recent as (
    select n.* from public.notifications n, since s where n.created_at > s.t
  ),

  checks as (

    -- ---------------------------------------------------------------------
    -- Coverage: did the walkthrough reach each trigger at all?
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
           (select count(*) from public.audit_logs l, since s
             where l.entity_type = 'geo_entities' and l.created_at > s.t)

    -- ---------------------------------------------------------------------
    -- Firing: did each thing that SHOULD notify actually do so?
    -- ---------------------------------------------------------------------
    union all
    -- Migration 022 installed two triggers and 035 four more. A missing one is
    -- the simplest explanation for a notification that never arrived.
    select 10, 'rule', 'notification triggers installed (missing of 6)',
           6 - (select count(*) from pg_trigger
                 where not tgisinternal
                   and tgname in ('issue_confirmations_notify', 'issues_status_notify',
                                  'comments_notify', 'reactions_notify',
                                  'follows_notify', 'messages_notify'))
    union all
    select 11, 'rule', 'FIRING: comments on someone else''s post with no notification',
           (select count(*)
              from public.comments c
              join public.posts p on p.id = c.post_id, since s
             where c.created_at > s.t
               and c.deleted_at is null
               and p.deleted_at is null
               and c.author_id <> p.author_id
               and not exists (
                 select 1 from public.notifications n
                  where n.type = 'comment'
                    and n.user_id = p.author_id
                    and n.actor_id = c.author_id
                    and n.link = '/posts/' || c.post_id::text))
    union all
    select 12, 'rule', 'FIRING: reactions on someone else''s post with no notification',
           (select count(*)
              from public.reactions r
              join public.posts p on p.id = r.post_id, since s
             where r.created_at > s.t
               and p.deleted_at is null
               and r.user_id <> p.author_id
               and not exists (
                 select 1 from public.notifications n
                  where n.type = 'reaction'
                    and n.user_id = p.author_id
                    and n.actor_id = r.user_id
                    and n.link = '/posts/' || r.post_id::text))
    union all
    select 13, 'rule', 'FIRING: follows with no notification',
           (select count(*)
              from public.follows f, since s
             where f.created_at > s.t
               and not exists (
                 select 1 from public.notifications n
                  where n.type = 'follow'
                    and n.user_id = f.following_id
                    and n.actor_id = f.follower_id))
    union all
    -- One notification per conversation, not per message, so this asks whether
    -- each recipient of a direct message holds AT LEAST ONE for that thread.
    select 14, 'rule', 'FIRING: direct messages whose recipient has no notification',
           (select count(*) from (
              select distinct m.conversation_id, cm.user_id
                from public.messages m
                join public.conversations c on c.id = m.conversation_id
                join public.conversation_members cm
                  on cm.conversation_id = m.conversation_id
                 and cm.user_id <> m.author_id, since s
               where m.created_at > s.t
                 and c.dm_key is not null
                 and not exists (
                   select 1 from public.notifications n
                    where n.type = 'message'
                      and n.user_id = cm.user_id
                      and n.link = '/messages/' || m.conversation_id::text)) d)

    -- ---------------------------------------------------------------------
    -- Rules the notifications themselves must obey.
    -- ---------------------------------------------------------------------
    union all
    -- `messages` is the one table with no staff read policy, and withdrawal
    -- BLANKS the body in the database. A notification quoting it would be a
    -- copy that survives withdrawal, and nothing would ever blank it.
    select 20, 'rule', 'message notifications carry no message body',
           (select count(*) from public.notifications
             where type = 'message' and body is not null)
    union all
    -- A thread of two hundred messages must not put two hundred rows in a tray.
    select 21, 'rule', 'one unread message notification per conversation',
           (select count(*) from (
              select user_id, link from public.notifications
               where type = 'message' and read_at is null
               group by user_id, link having count(*) > 1) d)
    union all
    select 22, 'rule', 'nobody is notified about their own action',
           (select count(*) from public.notifications
             where actor_id is not null and actor_id = user_id)
    union all
    -- An absolute URL is a phishing surface: the list renders it as a link the
    -- member has every reason to trust. Migration 033 added the CHECK.
    select 23, 'rule', 'every notification link is a path inside this app',
           (select count(*) from public.notifications
             where link is not null
               and (link not like '/%' or link like '//%'))
    union all
    -- conversation_members rows survive a departure, so this is the check that
    -- catches a notification leaking to somebody who left the group.
    select 24, 'rule', 'no message notification for a departed group member',
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
    select 30, 'rule', 'exactly one Local Government Area',
           abs((select count(*) from public.geo_entities
                 where kind = 'lga' and deleted_at is null) - 1)
    union all
    select 31, 'rule', 'no two communities share a slug',
           (select count(*) from (
              select lower(slug::text) from public.geo_entities
               where deleted_at is null
               group by lower(slug::text) having count(*) > 1) d)
    union all
    select 32, 'rule', 'no community has a missing or deleted parent',
           (select count(*) from public.geo_entities c
             where c.deleted_at is null and c.parent_id is not null
               and not exists (select 1 from public.geo_entities p
                                where p.id = c.parent_id and p.deleted_at is null))
    union all
    select 33, 'info', 'live communities (58 = the seeded directory)',
           (select count(*) from public.geo_entities where deleted_at is null)

    -- ---------------------------------------------------------------------
    -- Raw activity since the window opened, so a FIRING row can be read in
    -- context: zero FIRING failures over zero comments is not evidence.
    -- ---------------------------------------------------------------------
    union all
    select 40, 'info', 'comments made since 9 Sep',
           (select count(*) from public.comments c, since s where c.created_at > s.t)
    union all
    select 41, 'info', 'reactions made since 9 Sep',
           (select count(*) from public.reactions r, since s where r.created_at > s.t)
    union all
    select 42, 'info', 'follows made since 9 Sep',
           (select count(*) from public.follows f, since s where f.created_at > s.t)
    union all
    select 43, 'info', 'messages sent since 9 Sep',
           (select count(*) from public.messages m, since s where m.created_at > s.t)
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
