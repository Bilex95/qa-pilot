"use client";

import { createContext, useContext } from "react";

import type { Role } from "@/lib/permissions";
import type { Me } from "@/lib/session/session-provider";

export type CurrentOrg = Me["memberships"][number]["org"] & { role: Role };

export const OrgContext = createContext<CurrentOrg | null>(null);

/**
 * Whether AI is on for this workspace (D-027). Every AI control reads this one hook and renders nothing when it is false,
 * so the Settings switch hides AI everywhere. It follows /auth/me, which the Settings save reloads.
 */
export function useAiEnabled(): boolean {
  return useOrg().ai_enabled;
}

/** The org from the URL slug, resolved against /auth/me (D-029). */
export function useOrg(): CurrentOrg {
  const org = useContext(OrgContext);
  if (!org) throw new Error("useOrg must be used inside an org route");
  return org;
}
