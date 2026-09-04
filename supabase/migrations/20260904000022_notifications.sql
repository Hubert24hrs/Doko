-- Ezike Oba :: Phase 5 -- 022
-- In-app notifications and activity triggers.
--
-- Notifies members when:
--   1. An issue they reported is confirmed by a neighbour ("I see this too").
--   2. An issue they reported or confirmed moves to a new status (e.g. in_progress, resolved).
--   3. A member comments on their post or replies to their comment.
--   4. A member follows their profile.
--   5. A direct message arrives.
--
-- RLS: A member reads and marks read ONLY their own notifications.
-- Staff do not read other people's notifications.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  type text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now(),

  constraint notifications_type_check check (
    type in (
      'issue_confirmed',
      'issue_status',
      'comment',
      'reaction',
      'follow',
      'message',
      'system'
    )
  ),
  constraint notifications_title_not_blank check (length(btrim(title)) > 0),
  constraint notifications_title_length check (length(title) <= 200),
  constraint notifications_body_length check (body is null or length(body) <= 1000),
  constraint notifications_link_length check (link is null or length(link) <= 300)
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id) where read_at is null;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.notifications enable row level security;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own
  on public.notifications for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own
  on public.notifications for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own
  on public.notifications for delete
  to authenticated
  using (user_id = auth.uid());

-- Triggers or system functions can insert
drop policy if exists notifications_insert_authenticated on public.notifications;
create policy notifications_insert_authenticated
  on public.notifications for insert
  to authenticated
  with check (public.is_active_member());

grant select, update, delete on public.notifications to authenticated;
grant insert on public.notifications to authenticated;

-- ---------------------------------------------------------------------------
-- Issue notification triggers
-- ---------------------------------------------------------------------------

-- 1. Notify reporter when an issue is confirmed
create or replace function public.notify_on_issue_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_reporter_id uuid;
  v_title text;
  v_actor_name text;
begin
  select reporter_id, title into v_reporter_id, v_title
    from public.community_issues
   where id = new.issue_id and deleted_at is null;

  if v_reporter_id is not null and v_reporter_id <> new.user_id then
    select coalesce(full_name, username) into v_actor_name
      from public.profiles where id = new.user_id;

    insert into public.notifications (user_id, actor_id, type, title, body, link)
    values (
      v_reporter_id,
      new.user_id,
      'issue_confirmed',
      'Someone confirmed your report',
      coalesce(v_actor_name, 'A neighbour') || ' confirmed they see "' || left(v_title, 60) || '" too.',
      '/issues/' || new.issue_id
    );
  end if;
  return new;
end;
$fn$;

drop trigger if exists issue_confirmations_notify on public.issue_confirmations;
create trigger issue_confirmations_notify
  after insert on public.issue_confirmations
  for each row execute function public.notify_on_issue_confirmed();

-- 2. Notify reporter and confirmers when issue status moves
create or replace function public.notify_on_issue_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_status_label text;
  v_note_text text;
begin
  if old.status is distinct from new.status and new.deleted_at is null then
    v_status_label := case new.status
      when 'acknowledged' then 'acknowledged by leadership'
      when 'in_progress' then 'marked as in progress'
      when 'resolved' then 'marked as resolved / fixed'
      when 'declined' then 'not being taken up'
      else 'updated'
    end;

    v_note_text := case
      when new.status_note is not null and length(new.status_note) > 0
      then 'Note: "' || left(new.status_note, 120) || '"'
      else null
    end;

    -- Notify reporter
    insert into public.notifications (user_id, actor_id, type, title, body, link)
    values (
      new.reporter_id,
      new.status_changed_by,
      'issue_status',
      'Issue status updated: ' || initcap(replace(new.status::text, '_', ' ')),
      'Your report "' || left(new.title, 50) || '" was ' || v_status_label || '.' || coalesce(' ' || v_note_text, ''),
      '/issues/' || new.id
    );

    -- Notify all confirmers
    insert into public.notifications (user_id, actor_id, type, title, body, link)
    select c.user_id,
           new.status_changed_by,
           'issue_status',
           'Issue update: ' || initcap(replace(new.status::text, '_', ' ')),
           'An issue you confirmed ("' || left(new.title, 50) || '") was ' || v_status_label || '.',
           '/issues/' || new.id
      from public.issue_confirmations c
     where c.issue_id = new.id
       and c.user_id <> new.reporter_id;
  end if;
  return new;
end;
$fn$;

drop trigger if exists issues_status_notify on public.community_issues;
create trigger issues_status_notify
  after update on public.community_issues
  for each row execute function public.notify_on_issue_status_change();
