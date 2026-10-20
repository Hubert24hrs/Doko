import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Starts a realtime subscription only once the browser client is signed in.
 *
 * Found on the live site on 2026-10-20: a channel joined the moment a page
 * mounted, before the client had read the session from its cookie, so it
 * joined with the ANON key. Realtime evaluates RLS as whoever joined, `messages`
 * has no anon policy, and so the inbox received nothing -- while reporting
 * SUBSCRIBED and showing "Live Delivery". Nothing errors: RLS refuses by
 * filtering, here as everywhere. The session arriving a moment later does not
 * re-authorise a channel that has already joined.
 *
 * Proven side by side in one tab: a listener that loaded the session first
 * received every message; an identical one that subscribed immediately, and
 * the inbox itself, received none.
 *
 * `start` runs once the realtime connection carries the member's JWT and
 * returns its own cleanup. The returned function is the effect's cleanup and
 * is safe to call before `start` has run, which happens whenever a component
 * unmounts while the session is still loading.
 */
export function subscribeWhenAuthorised(
  supabase: SupabaseClient,
  start: () => () => void,
): () => void {
  let cancelled = false;
  let stop: (() => void) | null = null;

  void (async () => {
    // Reads the session from storage (the cookie, for @supabase/ssr) and, if
    // the access token has expired, refreshes it.
    await supabase.auth.getSession();
    if (cancelled) return;
    // No argument: take the token from supabase-js's accessToken callback,
    // which now has a session to return.
    await supabase.realtime.setAuth();
    if (cancelled) return;
    stop = start();
  })();

  return () => {
    cancelled = true;
    stop?.();
  };
}
