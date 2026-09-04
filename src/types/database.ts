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

export type EventKind =
  | "festival"
  | "funeral"
  | "wedding"
  | "meeting"
  | "religious"
  | "market"
  | "sport"
  | "fundraiser"
  | "other";

/**
 * Deliberately not post_visibility: that carries 'followers', which for an
 * event would be a tier nobody could satisfy.
 */
export type EventVisibility = "public" | "community";

export type RsvpStatus = "going" | "interested" | "not_going";

export type JobKind =
  | "full_time"
  | "part_time"
  | "contract"
  | "apprenticeship"
  | "casual"
  | "volunteer"
  | "internship";

export type JobCategory =
  | "teaching"
  | "healthcare"
  | "trade"
  | "agriculture"
  | "transport"
  | "retail"
  | "security"
  | "domestic"
  | "admin"
  | "technology"
  | "construction"
  | "other";

export type PayPeriod = "hour" | "day" | "week" | "month" | "year" | "once";

export type ApplicationStatus =
  | "sent"
  | "shortlisted"
  | "rejected"
  | "withdrawn";

export type ListingCategory =
  | "electronics"
  | "furniture"
  | "clothing_fashion"
  | "vehicles"
  | "phones_computers"
  | "appliances"
  | "tools_equipment"
  | "books_stationery"
  | "baby_kids"
  | "sports_hobbies"
  | "agriculture"
  | "building_materials"
  | "food_produce"
  | "services"
  | "other";

/** Nullable on the row: a service or fresh produce genuinely has none. */
export type ListingCondition = "new" | "like_new" | "good" | "fair" | "for_parts";

export type ListingStatus = "available" | "reserved" | "sold";

export type IssueCategory =
  | "road"
  | "water"
  | "electricity"
  | "security"
  | "waste"
  | "health"
  | "education"
  | "environment"
  | "other";

/** Not a boolean: 'nobody has looked' and 'somebody is on it' differ. */
export type IssueStatus =
  | "reported"
  | "acknowledged"
  | "in_progress"
  | "resolved"
  | "declined";

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

export type VerificationType = "blue" | "gold";

export type AdPlacement = "feed_sponsored" | "marketplace_banner" | "community_sidebar";
export type AdStatus = "pending" | "approved" | "rejected" | "active" | "paused" | "completed";

export type AdCampaignRow = {
  id: string;
  advertiser_id: string;
  title: string;
  description: string;
  target_url: string | null;
  image_url: string | null;
  placement: AdPlacement;
  status: AdStatus;
  target_village_id: string | null;
  budget_naira: number;
  impressions_count: number;
  clicks_count: number;
  rejection_reason: string | null;
  starts_at: string;
  ends_at: string;
  created_at: string;
  updated_at: string;
};

export type SponsoredAdItem = {
  id: string;
  advertiser_id: string;
  title: string;
  description: string;
  target_url: string | null;
  image_url: string | null;
  placement: AdPlacement;
  status: AdStatus;
  target_village_id: string | null;
  budget_naira: number;
  impressions_count: number;
  clicks_count: number;
  starts_at: string;
  ends_at: string;
  created_at: string;
  advertiser_name: string;
  advertiser_avatar: string | null;
  advertiser_is_verified: boolean;
  advertiser_verification_type: VerificationType | null;
};

export type VerificationDelegateRow = {
  user_id: string;
  delegated_by: string | null;
  delegated_at: string;
  notes: string | null;
};

export type CommunityPulseItem = {
  user_id: string;
  username: string;
  full_name: string;
  avatar_path: string | null;
  is_verified: boolean;
  verification_type: VerificationType | null;
  last_activity_at: string;
  latest_post_id: string | null;
};

export type VerificationRequestRow = {
  id: string;
  user_id: string;
  tier: VerificationType;
  organization: string | null;
  role_title: string | null;
  notes: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
};

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
  verification_type: VerificationType | null;
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
  /** Set for a group conversation. Exactly one of dm_key / group_id is set. */
  group_id: string | null;
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
  /** Null for a group conversation: there is no single other person. */
  other_user_id: string | null;
  group_id: string | null;
  group_name: string | null;
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

export type EventRow = {
  id: string;
  title: string;
  description: string | null;
  kind: EventKind;
  /** NULL means the whole LGA rather than a specific community. */
  geo_id: string | null;
  venue: string | null;
  starts_at: string;
  /** Never null after the fill trigger: end of the event's own day in WAT. */
  ends_at: string;
  is_all_day: boolean;
  organizer_id: string;
  /** When set, the group governs visibility entirely. */
  group_id: string | null;
  visibility: EventVisibility;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  /** Maintained by trigger; see recount_event_attendance() for repair. */
  going_count: number;
  interested_count: number;
  created_at: string;
  updated_at: string;
  edited_at: string | null;
  deleted_at: string | null;
}

export type EventAttendeeRow = {
  event_id: string;
  user_id: string;
  status: RsvpStatus;
  created_at: string;
  updated_at: string;
}

export type JobRow = {
  id: string;
  title: string;
  description: string;
  kind: JobKind;
  category: JobCategory;
  employer_id: string;
  organization_name: string | null;
  geo_id: string | null;
  location_text: string | null;
  is_remote: boolean;
  /** Whole naira. Nobody advertises a salary in kobo. */
  pay_min: number | null;
  pay_max: number | null;
  /** Required whenever a figure is given: a wage without a period is a number. */
  pay_period: PayPeriod | null;
  pay_is_negotiable: boolean;
  closes_at: string | null;
  filled_at: string | null;
  group_id: string | null;
  visibility: EventVisibility;
  application_count: number;
  created_at: string;
  updated_at: string;
  edited_at: string | null;
  deleted_at: string | null;
}

/**
 * Kept out of `jobs` so the listing can be public while these are not: RLS
 * grants rows, not columns, and a public page carrying phone numbers becomes a
 * harvesting ground.
 */
export type JobContactRow = {
  job_id: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  external_url: string | null;
  instructions: string | null;
  created_at: string;
  updated_at: string;
}

export type JobApplicationRow = {
  id: string;
  job_id: string;
  applicant_id: string;
  message: string | null;
  status: ApplicationStatus;
  created_at: string;
  updated_at: string;
}

export type MarketplaceListingRow = {
  id: string;
  title: string;
  description: string;
  category: ListingCategory;
  /** Null: a service or fresh produce has no condition to state. */
  condition: ListingCondition | null;
  /** Whole naira. Null means "ask" -- a price nobody has set, not zero. */
  price: number | null;
  price_is_negotiable: boolean;
  can_deliver: boolean;
  seller_id: string;
  geo_id: string | null;
  location_text: string | null;
  group_id: string | null;
  visibility: EventVisibility;
  status: ListingStatus;
  created_at: string;
  updated_at: string;
  edited_at: string | null;
  deleted_at: string | null;
}

/**
 * Optional, unlike JobContactRow: a seller may rely entirely on in-app
 * messaging and leave this table empty.
 */
export type ListingContactRow = {
  listing_id: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  external_url: string | null;
  instructions: string | null;
  created_at: string;
  updated_at: string;
}

export type ListingMediaRow = {
  id: string;
  listing_id: string;
  /** '<listing_id>/<uuid>.<ext>' -- the first segment is read by storage policies. */
  storage_path: string;
  mime_type: string;
  byte_size: number;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  sort_order: number;
  created_at: string;
}

export type CommunityIssueRow = {
  id: string;
  title: string;
  description: string;
  category: IssueCategory;
  /** NOT NULL, unlike every other geo_id here: an issue that is nowhere cannot be fixed. */
  geo_id: string;
  location_text: string | null;
  /** Optional map pin. Both coordinates or neither -- a CHECK enforces the pair. */
  latitude: number | null;
  longitude: number | null;
  reporter_id: string;
  status: IssueStatus;
  status_note: string | null;
  status_changed_by: string | null;
  status_changed_at: string | null;
  resolved_at: string | null;
  confirm_count: number;
  created_at: string;
  updated_at: string;
  edited_at: string | null;
  deleted_at: string | null;
}

export type IssueConfirmationRow = {
  issue_id: string;
  user_id: string;
  created_at: string;
}

export type IssueMediaRow = {
  id: string;
  issue_id: string;
  storage_path: string;
  mime_type: string;
  byte_size: number;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  sort_order: number;
  created_at: string;
}

export type NotificationType =
  | 'issue_confirmed'
  | 'issue_status'
  | 'comment'
  | 'reaction'
  | 'follow'
  | 'message'
  | 'system';

export type NotificationRow = {
  id: string;
  user_id: string;
  actor_id: string | null;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

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
      events: {
        Row: EventRow;
        Insert: Insertable<
          EventRow,
          | "id"
          | "description"
          | "kind"
          | "geo_id"
          | "venue"
          | "ends_at"
          | "is_all_day"
          | "group_id"
          | "visibility"
          | "cancelled_at"
          | "cancellation_reason"
          | "going_count"
          | "interested_count"
          | "created_at"
          | "updated_at"
          | "edited_at"
          | "deleted_at"
        >;
        Update: Partial<EventRow>;
        Relationships: [];
      };
      event_attendees: {
        Row: EventAttendeeRow;
        Insert: Insertable<
          EventAttendeeRow,
          "status" | "created_at" | "updated_at"
        >;
        Update: Partial<EventAttendeeRow>;
        Relationships: [];
      };
      jobs: {
        Row: JobRow;
        Insert: Insertable<
          JobRow,
          | "id"
          | "kind"
          | "category"
          | "organization_name"
          | "geo_id"
          | "location_text"
          | "is_remote"
          | "pay_min"
          | "pay_max"
          | "pay_period"
          | "pay_is_negotiable"
          | "closes_at"
          | "filled_at"
          | "group_id"
          | "visibility"
          | "application_count"
          | "created_at"
          | "updated_at"
          | "edited_at"
          | "deleted_at"
        >;
        Update: Partial<JobRow>;
        Relationships: [];
      };
      job_contacts: {
        Row: JobContactRow;
        Insert: Insertable<
          JobContactRow,
          | "contact_name"
          | "contact_phone"
          | "contact_email"
          | "external_url"
          | "instructions"
          | "created_at"
          | "updated_at"
        >;
        Update: Partial<JobContactRow>;
        Relationships: [];
      };
      job_applications: {
        Row: JobApplicationRow;
        Insert: Insertable<
          JobApplicationRow,
          "id" | "message" | "status" | "created_at" | "updated_at"
        >;
        Update: Partial<JobApplicationRow>;
        Relationships: [];
      };
      marketplace_listings: {
        Row: MarketplaceListingRow;
        Insert: Insertable<
          MarketplaceListingRow,
          | "id"
          | "condition"
          | "price"
          | "price_is_negotiable"
          | "can_deliver"
          | "geo_id"
          | "location_text"
          | "group_id"
          | "visibility"
          | "status"
          | "created_at"
          | "updated_at"
          | "edited_at"
          | "deleted_at"
        >;
        Update: Partial<MarketplaceListingRow>;
        Relationships: [];
      };
      listing_contacts: {
        Row: ListingContactRow;
        Insert: Insertable<
          ListingContactRow,
          | "contact_name"
          | "contact_phone"
          | "contact_email"
          | "external_url"
          | "instructions"
          | "created_at"
          | "updated_at"
        >;
        Update: Partial<ListingContactRow>;
        Relationships: [];
      };
      listing_media: {
        Row: ListingMediaRow;
        Insert: Insertable<
          ListingMediaRow,
          "id" | "width" | "height" | "alt_text" | "sort_order" | "created_at"
        >;
        Update: Partial<ListingMediaRow>;
        Relationships: [];
      };
              verification_delegates: {
          Row: VerificationDelegateRow;
          Insert: Insertable<VerificationDelegateRow, "delegated_by" | "delegated_at" | "notes">;
          Update: Partial<VerificationDelegateRow>;
          Relationships: [];
        };
        verification_requests: {
          Row: VerificationRequestRow;
          Insert: Insertable<
            VerificationRequestRow,
            "id" | "organization" | "role_title" | "notes" | "status" | "created_at" | "reviewed_by" | "reviewed_at" | "review_notes"
          >;
          Update: Partial<VerificationRequestRow>;
          Relationships: [];
        };
        notifications: {
        Row: NotificationRow;
        Insert: Insertable<
          NotificationRow,
          'id' | 'actor_id' | 'body' | 'link' | 'read_at' | 'created_at'
        >;
        Update: Partial<NotificationRow>;
        Relationships: [];
      };
      community_issues: {
        Row: CommunityIssueRow;
        Insert: Insertable<
          CommunityIssueRow,
          | 'id'
          | 'category'
          | 'location_text'
          | 'latitude'
          | 'longitude'
          | 'status'
          | 'status_note'
          | 'status_changed_by'
          | 'status_changed_at'
          | 'resolved_at'
          | 'confirm_count'
          | 'created_at'
          | 'updated_at'
          | 'edited_at'
          | 'deleted_at'
        >;
        Update: Partial<CommunityIssueRow>;
        Relationships: [];
      };
      issue_confirmations: {
        Row: IssueConfirmationRow;
        Insert: Insertable<IssueConfirmationRow, 'created_at'>;
        Update: Partial<IssueConfirmationRow>;
        Relationships: [];
      };
      issue_media: {
        Row: IssueMediaRow;
        Insert: Insertable<
          IssueMediaRow,
          'id' | 'width' | 'height' | 'alt_text' | 'sort_order' | 'created_at'
        >;
        Update: Partial<IssueMediaRow>;
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
      ad_campaigns: {
        Row: AdCampaignRow;
        Insert: Insertable<
          AdCampaignRow,
          | "id"
          | "target_url"
          | "image_url"
          | "status"
          | "target_village_id"
          | "budget_naira"
          | "impressions_count"
          | "clicks_count"
          | "rejection_reason"
          | "starts_at"
          | "ends_at"
          | "created_at"
          | "updated_at"
        >;
        Update: Partial<AdCampaignRow>;
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
      get_active_sponsored_ads: {
        Args: { p_placement?: string; p_limit?: number };
        Returns: SponsoredAdItem[];
      };
      increment_ad_impressions: {
        Args: { p_ad_id: string };
        Returns: void;
      };
      increment_ad_clicks: {
        Args: { p_ad_id: string };
        Returns: void;
      };
      get_community_pulse: {
        Args: { p_limit?: number };
        Returns: CommunityPulseItem[];
      };
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
      can_see_event: {
        Args: { target_event_id: string; check_user_id?: string };
        Returns: boolean;
      };
      can_see_job: {
        Args: { target_job_id: string; check_user_id?: string };
        Returns: boolean;
      };
      employs_for_job: {
        Args: { target_job_id: string; check_user_id?: string };
        Returns: boolean;
      };
      can_see_listing: {
        Args: { target_listing_id: string; check_user_id?: string };
        Returns: boolean;
      };
      owns_listing: {
        Args: { target_listing_id: string; check_user_id?: string };
        Returns: boolean;
      };
      storage_path_listing_id: {
        Args: { object_name: string };
        Returns: string | null;
      };
      administers_issue: {
        Args: { target_issue_id: string; check_user_id?: string };
        Returns: boolean;
      };
      reported_issue: {
        Args: { target_issue_id: string; check_user_id?: string };
        Returns: boolean;
      };
      storage_path_issue_id: {
        Args: { object_name: string };
        Returns: string | null;
      };
      open_direct_conversation: {
        Args: { other_user_id: string };
        Returns: string;
      };
      open_group_conversation: {
        Args: { target_group_id: string };
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
      event_kind: EventKind;
      event_visibility: EventVisibility;
      rsvp_status: RsvpStatus;
      job_kind: JobKind;
      job_category: JobCategory;
      pay_period: PayPeriod;
      application_status: ApplicationStatus;
      listing_category: ListingCategory;
      listing_condition: ListingCondition;
      listing_status: ListingStatus;
      issue_category: IssueCategory;
      issue_status: IssueStatus;
    };
    CompositeTypes: Record<never, never>;
  };
}
