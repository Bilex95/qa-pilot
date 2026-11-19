import { z } from "zod";

import type { Role } from "@/lib/permissions";

export const ROLE_ORDER = ["org_admin", "qa_lead", "qa_engineer", "developer", "viewer"] as const satisfies readonly Role[];

/** Same limits as the API (InvitationIn). The server also checks that the person is not a member already. */
export const inviteSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Enter an email address.")
    .max(254, "Use 254 characters or fewer.")
    .pipe(z.email("Enter a valid email address.")),
  role: z.enum(ROLE_ORDER),
});

export const PAGE_SIZE = 100; // the API maximum (D-004); the screen has no pager yet (BL-012)

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
