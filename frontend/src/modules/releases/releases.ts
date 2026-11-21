import type { Schemas } from "@/lib/api/client";

export type ReleaseSummary = Schemas["ReleaseSummaryOut"];
export type Release = Schemas["ReleaseOut"];
export type LinkedBug = Schemas["LinkedBugOut"];
export type Readiness = ReleaseSummary["readiness"];

export const RELEASES_PAGE_SIZE = 25;
export const NAME_MIN = 2;
export const NAME_MAX = 60;
export const DESCRIPTION_MAX = 1000;

export const READINESS_NAME: Record<Readiness, string> = { ready: "Ready", at_risk: "At risk", blocked: "Blocked" };
export const STATUS_NAME: Record<ReleaseSummary["status"], string> = { planned: "Planned", in_progress: "In progress", released: "Released" };

/** "24 Nov 2026" from the API's plain date (2026-11-24), the same in every timezone. */
export function formatDate(day: string | null): string {
  if (!day) return "No target date";
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function validateName(value: string): string | null {
  const name = value.trim();
  if (name.length < NAME_MIN) return `Name must be at least ${NAME_MIN} characters.`;
  if (name.length > NAME_MAX) return `Name must be ${NAME_MAX} characters or fewer.`;
  return null;
}
