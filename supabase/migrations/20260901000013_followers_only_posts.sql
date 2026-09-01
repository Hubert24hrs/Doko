-- Ezike Oba :: Phase 2 -- 013
-- Followers-only posts.
--
-- RUN MIGRATION 012 FIRST, as a separate statement batch. This file uses the
-- 'followers' enum value, and Postgres refuses to use a newly added enum value
-- in the transaction that added it.
--
-- This visibility was deliberately left out when posts were first built,
-- because following did not exist yet and a visibility nobody could satisfy is
-- a trap. Following exists now, so it can be honoured.

-- ---------------------------------------------------------------------------
-- Who can read a followers-only post
--
-- Anyone who follows the author. Deliberately orthogonal to community scope:
-- "my followers" is a relationship, not a place, so a followers-only post
-- reaches the people who chose to hear from this member wherever they live.
--
-- The author's own access comes from posts_select_own, and staff access from
-- posts_select_staff, so neither is restated here.
-- ---------------------------------------------------------------------------

drop policy if exists posts_select_followers on public.posts;
create policy posts_select_followers
  on public.posts for select
  to authenticated
  using (
    deleted_at is null
    and visibility = 'followers'
    and public.follows_profile(author_id)
  );

-- Note there is no `to anon` counterpart, and that is the point: a signed-out
-- visitor follows nobody, so a followers-only post is invisible to the public
-- web and to crawlers without any extra rule being written.

-- ---------------------------------------------------------------------------
-- Comments, reactions and media need no change.
--
-- All three ask an EXISTS against posts rather than restating the visibility
-- rules, so they inherit this new case automatically. That was the reason for
-- the pattern, and this migration is where it pays: a third visibility tier
-- arrives and three other tables follow it without being touched.
-- ---------------------------------------------------------------------------
