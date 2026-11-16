"use client";

import { createContext, useContext } from "react";

import type { Role } from "@/lib/permissions";
import type { Me } from "@/lib/session/session-provider";

export type CurrentOrg = Me["memberships"][number]["org"] & { role: Role };

export const OrgContext = createContext<CurrentOrg | null>(null);

/** The org from the URL slug, resolved against /auth/me (D-029). */
export function useOrg(): CurrentOrg {
  const org = useContext(OrgContext);
  if (!org) throw new Error("useOrg must be used inside an org route");
  return org;
}
