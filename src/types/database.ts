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
          window_start: string;
        }[];
      };
    };
    Enums: {
      app_role: AppRole;
      geo_kind: GeoKind;
      geo_status: GeoStatus;
      profile_visibility: ProfileVisibility;
    };
    CompositeTypes: Record<never, never>;
  };
}
