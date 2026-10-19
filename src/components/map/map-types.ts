import type { IssueCategory, IssueStatus } from "@/types/database";

export interface MappedIssueItem {
  id: string;
  title: string;
  description: string;
  category: IssueCategory;
  status: IssueStatus;
  location_text: string | null;
  latitude: number;
  longitude: number;
  confirm_count: number;
  community?: { name: string; slug: string } | null;
  reporter?: { username: string; full_name: string } | null;
}

export interface CommunityLandmark {
  name: string;
  kind: string;
  latitude: number;
  longitude: number;
}

/**
 * Where the camera starts before any pins or places are fitted. A viewport
 * default, not a claim about a place.
 */
export const IGBO_EZE_NORTH_CENTER: [number, number] = [6.9833, 7.4500];
export const DEFAULT_MAP_ZOOM = 12;
