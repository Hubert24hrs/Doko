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

export async function getCommunityPulseMembers(
  limit = 60,
): Promise<PulseMemberData[]> {
  try {
    const supabase = await createClient();

    // Call the security-definer RPC `get_community_pulse`
    const { data: rpcData, error } = await supabase.rpc("get_community_pulse", {
      p_limit: limit,
    });

    if (error) {
      console.error("[pulse.get_community_pulse] RPC error", error.message);
    }

    let items = (rpcData as CommunityPulseItem[] | null) ?? [];

    // Fallback: If no verified member has been active in the last 24h,
    // fetch verified non-suspended profiles to provide a populated preview
    if (items.length === 0) {
      const { data: fallbackProfiles } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_path, is_verified, verification_type, updated_at")
        .eq("is_verified", true)
        .eq("is_suspended", false)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(limit);

      if (fallbackProfiles && fallbackProfiles.length > 0) {
        items = fallbackProfiles.map((p) => ({
          user_id: p.id,
          username: p.username,
          full_name: p.full_name,
          avatar_path: p.avatar_path,
          is_verified: p.is_verified,
          verification_type: (p.verification_type as VerificationType) ?? "blue",
          last_activity_at: p.updated_at,
          latest_post_id: null,
        }));
      }
    }

    return items.map((item) => {
      const avatarUrl = item.avatar_path
        ? supabase.storage.from("avatars").getPublicUrl(item.avatar_path).data.publicUrl
        : `https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80`;

      return {
        id: item.user_id,
        userId: item.user_id,
        src: avatarUrl,
        alt: item.full_name,
        title: item.full_name,
        description: `@${item.username}`,
        verificationType: (item.verification_type as VerificationType) ?? null,
        username: item.username,
        fullName: item.full_name,
        lastActivityAt: item.last_activity_at,
        latestPostId: item.latest_post_id,
      };
    });
  } catch (cause) {
    console.error("[pulse.getCommunityPulseMembers] unavailable", cause);
    return [];
  }
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
