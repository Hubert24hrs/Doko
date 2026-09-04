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

export const IGBO_EZE_NORTH_CENTER: [number, number] = [6.9833, 7.4500];
export const DEFAULT_MAP_ZOOM = 12;

export const IGBO_EZE_NORTH_LANDMARKS: CommunityLandmark[] = [
  { name: "Ogrute (LGA HQ)", kind: "headquarters", latitude: 6.9833, longitude: 7.4500 },
  { name: "Enugu Ezike", kind: "town", latitude: 6.9800, longitude: 7.4450 },
  { name: "Umuida", kind: "village", latitude: 6.9720, longitude: 7.4250 },
  { name: "Imufu", kind: "village", latitude: 7.0150, longitude: 7.4600 },
  { name: "Amalla", kind: "village", latitude: 6.9550, longitude: 7.4900 },
  { name: "Olido", kind: "village", latitude: 6.9400, longitude: 7.4400 },
  { name: "Aji", kind: "village", latitude: 7.0200, longitude: 7.4350 },
  { name: "Uda", kind: "village", latitude: 6.9600, longitude: 7.4050 },
  { name: "Igugu", kind: "village", latitude: 7.0400, longitude: 7.4500 },
  { name: "Umuitodo", kind: "village", latitude: 6.9950, longitude: 7.4800 },
];
