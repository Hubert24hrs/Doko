"use server";

import { createClient } from "@/lib/supabase/server";
import type { CommunityPulseItem, VerificationType } from "@/types/database";
import type { ImageData } from "@/components/ui/img-sphere";
import { getPostImages } from "@/features/posts/media-queries";

export interface PulseMemberData extends ImageData {
  userId: string;
  username: string;
  fullName: string;
  verificationType: VerificationType | null;
  lastActivityAt: string;
  latestPostId: string | null;
}

/** The pulse is a 24-hour window. Nothing older than this may appear in it. */
export const PULSE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** How long a signed avatar link stays valid. */
const AVATAR_URL_TTL_SECONDS = 60 * 60;

/** True when `timestamp` falls inside the 24-hour pulse window. */
export function isWithinPulseWindow(
  timestamp: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!timestamp) return false;
  const at = new Date(timestamp).getTime();
  if (Number.isNaN(at)) return false;
  // A clock-skewed future timestamp still counts: hiding somebody because a
  // server clock drifted forwards would be worse than showing them.
  return now - at < PULSE_WINDOW_MS;
}

/**
 * Members active in the community pulse in the last 24 hours.
 *
 * Three things were wrong here and all three mattered.
 *
 * The window was not enforced. When the RPC came back empty the fallback
 * listed any verified profile ordered by `updated_at` - when a profile was
 * last EDITED, not when anybody was active - so somebody who changed their
 * photograph months ago appeared under "active in the last 24 hours". It now
 * derives from posts actually written inside the window.
 *
 * Avatars were resolved with `getPublicUrl`, which only yields a working link
 * for a PUBLIC bucket. `avatars` is private, so every uploaded photograph has
 * been rendering broken on this page since the first one was saved. They are
 * signed in one batch now, the way post media already is.
 *
 * And a member with no photograph was drawn with a stock Unsplash portrait of
 * a stranger, presented as that member's face. Missing is now missing, and the
 * component falls back to initials.
 */
export async function getCommunityPulseMembers(
  limit = 60,
): Promise<PulseMemberData[]> {
  try {
    const supabase = await createClient();
    const cutoff = new Date(Date.now() - PULSE_WINDOW_MS).toISOString();

    // Call the security-definer RPC `get_community_pulse`
    const { data: rpcData, error } = await supabase.rpc("get_community_pulse", {
      p_limit: limit,
    });

    if (error) {
      console.error("[pulse.get_community_pulse] RPC error", error.message);
    }

    const items = ((rpcData as CommunityPulseItem[] | null) ?? []).filter((item) =>
      isWithinPulseWindow(item.last_activity_at),
    );

    // Fallback: who actually posted inside the window. Over-fetched because
    // one member may hold several of the newest posts and we want `limit`
    // distinct people, not `limit` rows.
    if (items.length === 0) {
      const { data: recentPosts } = await supabase
        .from("posts")
        .select(
          "id, author_id, created_at, author:author_id(id, username, full_name, avatar_path, is_verified, verification_type, is_suspended, deleted_at)",
        )
        .gte("created_at", cutoff)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(limit * 4);

      const seen = new Set<string>();
      for (const row of (recentPosts ?? []) as unknown as PulseFallbackRow[]) {
        const author = row.author;
        if (!author || author.is_suspended || author.deleted_at) continue;
        if (seen.has(author.id)) continue;
        seen.add(author.id);

        items.push({
          user_id: author.id,
          username: author.username,
          full_name: author.full_name,
          avatar_path: author.avatar_path,
          is_verified: author.is_verified,
          verification_type: (author.verification_type as VerificationType) ?? "blue",
          last_activity_at: row.created_at,
          latest_post_id: row.id,
        } as CommunityPulseItem);

        if (items.length >= limit) break;
      }
    }

    const urlByPath = await signAvatarPaths(
      supabase,
      items.map((item) => item.avatar_path),
    );

    return items.map((item) => ({
      id: item.user_id,
      userId: item.user_id,
      src: resolveAvatar(item.avatar_path, urlByPath),
      alt: item.full_name,
      title: item.full_name,
      description: "@" + item.username,
      verificationType: (item.verification_type as VerificationType) ?? null,
      username: item.username,
      fullName: item.full_name,
      lastActivityAt: item.last_activity_at,
      latestPostId: item.latest_post_id,
    }));
  } catch (cause) {
    console.error("[pulse.getCommunityPulseMembers] unavailable", cause);
    return [];
  }
}

interface PulseFallbackRow {
  id: string;
  created_at: string;
  author: {
    id: string;
    username: string;
    full_name: string;
    avatar_path: string | null;
    is_verified: boolean;
    verification_type: string | null;
    is_suspended: boolean;
    deleted_at: string | null;
  } | null;
}

/**
 * Signs the storage paths among `paths` in one request.
 *
 * `avatar_path` holds two different things, as migration 7 says: an absolute
 * https URL for an OAuth account, or a Storage path for an uploaded
 * photograph. Only the second kind is signed - passing an absolute URL to the
 * storage API would mangle it by prefixing the storage base.
 */
async function signAvatarPaths(
  supabase: Awaited<ReturnType<typeof createClient>>,
  paths: (string | null)[],
): Promise<Map<string, string>> {
  const urlByPath = new Map<string, string>();

  const storagePaths = [
    ...new Set(
      paths.filter(
        (path): path is string =>
          !!path && !path.startsWith("http://") && !path.startsWith("https://"),
      ),
    ),
  ];
  if (storagePaths.length === 0) return urlByPath;

  const { data: signed, error } = await supabase.storage
    .from("avatars")
    .createSignedUrls(storagePaths, AVATAR_URL_TTL_SECONDS);

  if (error) {
    console.error("[pulse.signAvatarPaths] signing failed", error.message);
    return urlByPath;
  }

  for (const entry of signed ?? []) {
    // Per-item errors are reported rather than failing the batch, so one
    // unreadable object does not cost the whole bar its photographs.
    if (entry.error || !entry.signedUrl || !entry.path) continue;
    urlByPath.set(entry.path, entry.signedUrl);
  }

  return urlByPath;
}

/** An absolute URL as-is, a signed storage link, or "" for no photograph. */
function resolveAvatar(path: string | null, urlByPath: Map<string, string>): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return urlByPath.get(path) ?? "";
}

export interface PulsePostDetail {
  id: string;
  author: {
    id: string;
    username: string;
    full_name: string;
    avatar_path: string | null;
    is_verified: boolean;
    verification_type: VerificationType | null;
  };
  body: string;
  created_at: string;
  reaction_count: number;
  comment_count: number;
  images: { id: string; url: string; alt_text: string | null }[];
}

export async function getPulsePostDetail(
  postId: string,
): Promise<PulsePostDetail | null> {
  try {
    const supabase = await createClient();

    const { data: post, error } = await supabase
      .from("posts")
      .select(`
        id,
        body,
        created_at,
        reaction_count,
        comment_count,
        author:author_id ( id, username, full_name, avatar_path, is_verified, verification_type )
      `)
      .eq("id", postId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error || !post || !post.author) return null;

    const imagesMap = await getPostImages([post.id]);
    const images = imagesMap.get(post.id) ?? [];

    return {
      id: post.id,
      author: {
        id: (post.author as unknown as { id: string }).id,
        username: (post.author as unknown as { username: string }).username,
        full_name: (post.author as unknown as { full_name: string }).full_name,
        avatar_path: (post.author as unknown as { avatar_path: string | null }).avatar_path,
        is_verified: (post.author as unknown as { is_verified: boolean }).is_verified,
        verification_type: (post.author as unknown as { verification_type: VerificationType | null }).verification_type,
      },
      body: post.body,
      created_at: post.created_at,
      reaction_count: post.reaction_count,
      comment_count: post.comment_count,
      images: images.map((img) => ({
        id: img.id,
        url: img.url ?? "",
        alt_text: img.altText,
      })),
    };
  } catch (cause) {
    console.error("[pulse.getPulsePostDetail] unavailable", cause);
    return null;
  }
}
