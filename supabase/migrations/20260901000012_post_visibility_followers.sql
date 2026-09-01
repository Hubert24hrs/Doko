-- Ezike Oba :: Phase 2 -- 012
-- Add 'followers' to the post visibility enum.
--
-- THIS FILE DOES ONE THING, AND THAT IS WHY IT EXISTS SEPARATELY.
--
-- Postgres will not let a newly added enum value be USED in the same
-- transaction that adds it:
--
--   ERROR: unsafe use of new value "followers" of enum type post_visibility
--
-- The SQL Editor runs a pasted script as one transaction, so adding the value
-- and writing the policy that references it in a single file fails every
-- time. Migration 013 carries the policy and must be run afterwards, as a
-- separate statement batch.
--
-- Idempotent: `if not exists` means re-running is harmless.

alter type public.post_visibility add value if not exists 'followers';
