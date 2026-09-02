/**
 * Database types for the Ezike Oba schema.
 *
 * Hand-maintained to match supabase/migrations. Once a Supabase project is
 * linked, regenerate with:
 *
 *   npm run db:types
 *
 * which overwrites this file from the live schema. Until then, keep this in
 * sync by hand whenever a migration changes a table.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type AppRole =
  | "super_admin"
  | "admin"
  | "moderator"
  | "community_admin"
  | "verified_leader"
  | "verified_business"
  | "verified_organization"
  | "citizen";

export type GeoKind =
  | "lga"
  | "town"
  | "autonomous_community"
  | "district"
  | "village"
  | "area";

export type GeoStatus = "active" | "historical" | "archived";

export type ProfileVisibility = "public" | "community" | "private";

export type PostVisibility = "public" | "community" | "followers";

export type ReactionKind = "like" | "celebrate" | "support" | "sad";

export type GroupKind =
  | "community"
  | "village"
  | "interest"
  | "youth"
  | "professional"
  | "organization"
  | "other";

export type GroupVisibility = "public" | "private";

export type GroupRole = "owner" | "moderator" | "member";

export type GeoEntityRow = {
  id: string;
  parent_id: string | null;
  kind: GeoKind;
  name: string;
  slug: string;
  aliases: string[];
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  cover_image_path: string | null;
  sort_order: number;
  status: GeoStatus;
  merged_into_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type ProfileRow = {
  id: string;
  username: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  avatar_path: string | null;
  bio: string | null;
  occupation: string | null;
  website: string | null;
  date_of_birth: string | null;
  gender: string | null;
  town_id: string | null;
  community_id: string | null;
  village_id: string | null;
  visibility: ProfileVisibility;
  is_verified: boolean;
  verified_at: string | null;
  is_suspended: boolean;
  suspended_until: string | null;
  onboarded_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  /** Maintained by trigger; see recount_follows() for repair. */
  follower_count: number;
  following_count: number;
}

export type ProfileSocialLinkRow = {
  id: string;
  profile_id: string;
  platform:
    | "facebook"
    | "instagram"
    | "tiktok"
    | "x"
    | "linkedin"
    | "youtube"
    | "website"
    | "other";
  url: string;
  created_at: string;
}

export type UserRoleRow = {
  id: string;
  user_id: string;
  role: AppRole;
  scope_id: string | null;
  granted_by: string | null;
  granted_at: string;
  expires_at: string | null;
}

export type AuditLogRow = {
  id: number;
  actor_id: string | null;
  actor_username: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  previous_state: Json | null;
  new_state: Json | null;
  metadata: Json;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export type PostRow = {
  id: string;
  author_id: string;
  body: string;
  /** NULL means the whole LGA rather than a specific community. */
  geo_id: string | null;
  visibility: PostVisibility;
  created_at: string;
  updated_at: string;
  /** Set only when the author edits the body, never by a trigger touch. */
  edited_at: string | null;
  deleted_at: string | null;
  /** Maintained by trigger; see recount_post_engagement() for repair. */
  comment_count: number;
  reaction_count: number;
  /**
   * When set, the group governs access entirely -- `visibility` is not
   * consulted, because being in the group IS the rule.
   */
  group_id: string | null;
}

export type CommentRow = {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  edited_at: string | null;
  deleted_at: string | null;
}

export type ReactionRow = {
  id: string;
  post_id: string;
  user_id: string;
  kind: ReactionKind;
  created_at: string;
}

export type PostMediaRow = {
  id: string;
  post_id: string;
  /** '<post_id>/<uuid>.<ext>' — the first segment is read by storage policies. */
  storage_path: string;
  mime_type: string;
  byte_size: number;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  sort_order: number;
  created_at: string;
}

export type GroupRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  kind: GroupKind;
  /** Optional geographic anchor; NULL means not tied to one place. */
  geo_id: string | null;
  visibility: GroupVisibility;
  created_by: string | null;
  member_count: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type GroupMemberRow = {
  group_id: string;
  user_id: string;
  role: GroupRole;
  joined_at: string;
}

export type FollowRow = {
  follower_id: string;
  following_id: string;
  created_at: string;
}

export type ConversationRow = {
  id: string;
  /**
   * Canonical pair key for a direct conversation, as
   * `least(a,b) || ':' || greatest(a,b)`. NULL is reserved for a conversation
   * that is not a pair.
   */
  dm_key: string | null;
  created_by: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ConversationMemberRow = {
  conversation_id: string;
  user_id: string;
  last_read_at: string;
  joined_at: string;
}

/** One row of my_conversation_summaries(); not a table. */
export type ConversationSummaryRow = {
  conversation_id: string;
  last_message_at: string | null;
  last_read_at: string;
  unread_count: number;
  /** NULL once a conversation can be something other than a pair. */
  other_user_id: string | null;
  preview: string | null;
  preview_author_id: string | null;
  preview_withdrawn: boolean | null;
}

export type MessageRow = {
  id: string;
  conversation_id: string;
  author_id: string;
  /** Blanked by trigger when the message is withdrawn. */
  body: string;
  created_at: string;
  updated_at: string;
  edited_at: string | null;
  deleted_at: string | null;
}

export type GeoTreeNodeRow = {
  id: string;
  kind: GeoKind;
  name: string;
  slug: string;
  depth: number;
}

type Insertable<T, Optional extends keyof T> = Omit<T, Optional> &
  Partial<Pick<T, Optional>>;

export interface Database {
  public: {
    Tables: {
      geo_entities: {
        Row: GeoEntityRow;
        Insert: Insertable<
          GeoEntityRow,
          | "id"
          | "aliases"
          | "description"
          | "latitude"
          | "longitude"
          | "cover_image_path"
          | "sort_order"
          | "status"
          | "merged_into_id"
          | "created_at"
          | "updated_at"
          | "deleted_at"
          | "parent_id"
        >;
        Update: Partial<GeoEntityRow>;
        Relationships: [];
      };
      profiles: {
        Row: ProfileRow;
        Insert: Insertable<
          ProfileRow,
          Exclude<keyof ProfileRow, "id" | "username" | "full_name">
        >;
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      profile_social_links: {
        Row: ProfileSocialLinkRow;
        Insert: Insertable<ProfileSocialLinkRow, "id" | "created_at">;
        Update: Partial<ProfileSocialLinkRow>;
        Relationships: [];
      };
      user_roles: {
        Row: UserRoleRow;
        Insert: Insertable<
          UserRoleRow,
          "id" | "scope_id" | "granted_by" | "granted_at" | "expires_at"
        >;
        Update: Partial<UserRoleRow>;
        Relationships: [];
      };
      posts: {
        Row: PostRow;
        Insert: Insertable<
          PostRow,
          | "id"
          | "geo_id"
          | "visibility"
          | "created_at"
          | "updated_at"
          | "edited_at"
          | "deleted_at"
          // Defaulted to 0 and maintained by trigger; never sent by a client.
          | "comment_count"
          | "reaction_count"
          | "group_id"
        >;
        Update: Partial<PostRow>;
        Relationships: [];
      };
      groups: {
        Row: GroupRow;
        Insert: Insertable<
          GroupRow,
          | "id"
          | "description"
          | "kind"
          | "geo_id"
          | "visibility"
          | "member_count"
          | "created_at"
          | "updated_at"
          | "deleted_at"
        >;
        Update: Partial<GroupRow>;
        Relationships: [];
      };
      group_members: {
        Row: GroupMemberRow;
        Insert: Insertable<GroupMemberRow, "role" | "joined_at">;
        Update: Partial<GroupMemberRow>;
        Relationships: [];
      };
      follows: {
        Row: FollowRow;
        Insert: Insertable<FollowRow, "created_at">;
        Update: Partial<FollowRow>;
        Relationships: [];
      };
      conversations: {
        Row: ConversationRow;
        /**
         * No INSERT/UPDATE policy exists for any role: rows arrive only
         * through open_direct_conversation(). As with audit_logs, these stay
         * object types — `never` here would degrade every table and RPC in
         * the client to `never`.
         */
        Insert: Partial<ConversationRow>;
        Update: Partial<ConversationRow>;
        Relationships: [];
      };
      conversation_members: {
        Row: ConversationMemberRow;
        Insert: Partial<ConversationMemberRow>;
        Update: Partial<ConversationMemberRow>;
        Relationships: [];
      };
      messages: {
        Row: MessageRow;
        Insert: Insertable<
          MessageRow,
          "id" | "created_at" | "updated_at" | "edited_at" | "deleted_at"
        >;
        Update: Partial<MessageRow>;
        Relationships: [];
      };
      post_media: {
        Row: PostMediaRow;
        Insert: Insertable<
          PostMediaRow,
          "id" | "width" | "height" | "alt_text" | "sort_order" | "created_at"
        >;
        Update: Partial<PostMediaRow>;
        Relationships: [];
      };
      comments: {
        Row: CommentRow;
        Insert: Insertable<
          CommentRow,
          "id" | "created_at" | "updated_at" | "edited_at" | "deleted_at"
        >;
        Update: Partial<CommentRow>;
        Relationships: [];
      };
      reactions: {
        Row: ReactionRow;
        Insert: Insertable<ReactionRow, "id" | "kind" | "created_at">;
        Update: Partial<ReactionRow>;
        Relationships: [];
      };
      audit_logs: {
        Row: AuditLogRow;
        /**
         * Append-only in practice: the table has no INSERT/UPDATE/DELETE
         * policy for any role, so these calls are rejected at runtime. Rows
         * arrive only through log_admin_action().
         *
         * These must still be object types — postgrest-js requires every
         * table's Insert/Update to extend Record<string, unknown>, and `never`
         * here silently invalidates the entire schema, degrading every table
         * and RPC in the client to `never`.
         */
        Insert: Partial<Omit<AuditLogRow, "id" | "created_at">>;
        Update: Partial<Omit<AuditLogRow, "id" | "created_at">>;
        Relationships: [];
      };
    };
    Views: {
      v_towns: { Row: GeoEntityRow; Relationships: [] };
      v_districts: { Row: GeoEntityRow; Relationships: [] };
      v_villages: { Row: GeoEntityRow; Relationships: [] };
      v_autonomous_communities: { Row: GeoEntityRow; Relationships: [] };
    };
    Functions: {
      geo_ancestors: {
        Args: { entity_id: string };
        Returns: GeoTreeNodeRow[];
      };
      geo_descendants: {
        Args: { entity_id: string };
        Returns: GeoTreeNodeRow[];
      };
      has_role: {
        Args: { check_user_id: string; check_role: AppRole };
        Returns: boolean;
      };
      is_staff: { Args: { check_user_id?: string }; Returns: boolean };
      is_admin: { Args: { check_user_id?: string }; Returns: boolean };
      is_super_admin: { Args: { check_user_id?: string }; Returns: boolean };
      administers_geo: {
        Args: { entity_id: string; check_user_id?: string };
        Returns: boolean;
      };
      shares_community_with: {
        Args: { target_profile_id: string };
        Returns: boolean;
      };
      is_active_member: { Args: { check_user_id?: string }; Returns: boolean };
      is_group_member: {
        Args: { target_group_id: string; check_user_id?: string };
        Returns: boolean;
      };
      leads_group: {
        Args: { target_group_id: string; check_user_id?: string };
        Returns: boolean;
      };
      can_see_group: {
        Args: { target_group_id: string; check_user_id?: string };
        Returns: boolean;
      };
      follows_profile: {
        Args: { target_profile_id: string; check_user_id?: string };
        Returns: boolean;
      };
      in_conversation: {
        Args: { target_conversation_id: string; check_user_id?: string };
        Returns: boolean;
      };
      /**
       * Deliberately has no check_user_id: it delegates to
       * shares_community_with(), which reads auth.uid() as the viewer.
       */
      can_message: { Args: { target_user_id: string }; Returns: boolean };
      open_direct_conversation: {
        Args: { other_user_id: string };
        Returns: string;
      };
      my_conversation_summaries: {
        Args: Record<never, never>;
        Returns: ConversationSummaryRow[];
      };
      my_unread_message_count: {
        Args: Record<never, never>;
        Returns: number;
      };
      storage_path_post_id: { Args: { object_name: string }; Returns: string | null };
      member_of_geo: {
        Args: { target_geo_id: string | null; check_user_id?: string };
        Returns: boolean;
      };
      log_admin_action: {
        Args: {
          p_action: string;
          p_entity_type: string;
          p_entity_id?: string | null;
          p_previous_state?: Json | null;
          p_new_state?: Json | null;
          p_metadata?: Json | null;
        };
        Returns: number;
      };
      slugify: { Args: { value: string }; Returns: string };
      consume_rate_limit: {
        Args: { p_bucket_key: string; p_limit: number; p_window_ms: number };
        Returns: {
          allowed: boolean;
          current_count: number;
          window_started_at: string;
        }[];
      };
    };
    Enums: {
      app_role: AppRole;
      geo_kind: GeoKind;
      geo_status: GeoStatus;
      profile_visibility: ProfileVisibility;
      post_visibility: PostVisibility;
      reaction_kind: ReactionKind;
      group_kind: GroupKind;
      group_visibility: GroupVisibility;
      group_role: GroupRole;
    };
    CompositeTypes: Record<never, never>;
  };
}
