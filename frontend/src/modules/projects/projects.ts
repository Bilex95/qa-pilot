import type { Schemas } from "@/lib/api/client";

export type Project = Schemas["ProjectOut"];
export type ProjectDetail = Schemas["ProjectDetailOut"];
export type Component = Schemas["ComponentOut"];
export type Environment = Schemas["EnvironmentOut"];

export const PROJECTS_PAGE_SIZE = 25;
export const NAME_MIN = 2;
export const NAME_MAX = 80;
export const KEY_MIN = 2;
export const KEY_MAX = 6;
export const DESCRIPTION_MAX = 1000;
export const COMPONENT_NAME_MAX = 60;
export const COMPONENT_DESCRIPTION_MAX = 500;
export const ENVIRONMENT_NAME_MAX = 40;

export function validateProjectName(name: string): string | undefined {
  const n = name.trim();
  if (n.length < NAME_MIN) return `Name must be at least ${NAME_MIN} characters.`;
  if (n.length > NAME_MAX) return `Use ${NAME_MAX} characters or fewer.`;
  return undefined;
}

/** The key as the API stores it: capital letters only, 2 to 6 of them (it appears in bug ids such as WEB-42). */
export function validateProjectKey(key: string): string | undefined {
  if (!/^[A-Za-z]+$/.test(key.trim())) return `Use ${KEY_MIN} to ${KEY_MAX} letters, for example WEB.`;
  if (key.trim().length < KEY_MIN || key.trim().length > KEY_MAX) return `Use ${KEY_MIN} to ${KEY_MAX} letters, for example WEB.`;
  return undefined;
}

/** A suggestion for the key while the name is typed: the capitals of the words, or the first letters of the first word. */
export function suggestKey(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const letters = words.length > 1 ? words.map((w) => w[0]).join("") : words[0]!;
  return letters.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
}

export function rateText(rate: number | null): string {
  return rate === null ? "None" : `${rate}%`;
}
