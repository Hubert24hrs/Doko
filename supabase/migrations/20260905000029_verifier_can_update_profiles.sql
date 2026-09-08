-- Migration 029: let a delegated verifier actually verify somebody
--
-- Migration 023 built the delegation feature in three parts and connected two
-- of them.
--
--   * verification_delegates records who may verify.
--   * can_verify_members() answers the question, and includes moderators and
--     delegates as well as admins.
--   * profiles_guard_privileged_columns() has a branch FOR that answer: a
--     delegated verifier may set is_verified, verified_at and
--     verification_type, while suspension and deletion are restored from the
--     old row.
--
-- What was missing is the way in. RLS on `profiles` has only two UPDATE
-- policies -- profiles_update_own (id = auth.uid()) and profiles_update_admin
-- (is_admin()) -- so a moderator or delegate updating SOMEBODY ELSE'S profile
-- matched no policy at all. The row was filtered out before the trigger ever
-- ran, which means the trigger's whole can_verify_members() branch was
-- unreachable for exactly the people it was written for.
--
-- Worse, RLS refuses an UPDATE by FILTERING rather than raising, so nothing
-- errored. A delegate pressed Verify, the update affected zero rows, and the
-- action reported success. This is the same shape as the defect already
-- recorded in CLAUDE.md -- "post and reply editing was unreachable: policies,
-- guard triggers and the 'edited' label all existed with no way in".
--
-- The policy below is the way in. It is safe to admit them here BECAUSE the
-- guard trigger is the second layer: it restores is_suspended,
-- suspended_until, deleted_at and created_at for anybody who is not an admin,
-- so a verifier who reaches a row still cannot suspend or delete its owner.
-- 17_verification asserts both halves -- that they CAN verify, and that they
-- CANNOT suspend.

drop policy if exists profiles_update_verifier on public.profiles;
create policy profiles_update_verifier
  on public.profiles for update
  to authenticated
  using (public.can_verify_members() and deleted_at is null)
  with check (public.can_verify_members());
