/**
 * Every profile column EXCEPT `email`, `phone` and `date_of_birth`.
 *
 * Those three are revoked from both `anon` and `authenticated` at column
 * level, because RLS filters rows and not columns: the row policies correctly
 * limited WHICH profiles were visible and then handed over every field of
 * them. Any holder of the publishable key — which ships in the mobile app and
 * is visible in this site's JavaScript — could read every member's email
 * address without signing in.
 *
 * `select("*")` would now fail outright rather than silently omitting them, so
 * every profile read uses this list. A member reads their OWN three through
 * `getMyContact()`.
 */
export const PROFILE_FIELDS = `
  id, username, full_name, avatar_path, bio, occupation, website, gender,
  town_id, community_id, village_id, visibility, is_verified, verified_at,
  verification_type, is_suspended, suspended_until, onboarded_at,
  created_at, updated_at, deleted_at, follower_count, following_count
`;
