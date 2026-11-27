"use client";

import { useQuery } from "@tanstack/react-query";

import { api, unwrap } from "@/lib/api/client";
import { useOrg } from "@/modules/shell/org-context";

/** The workflow definition (API-067): the same for everyone in the workspace, so it is fetched once and kept for ten minutes. */
export function useWorkflow() {
  const org = useOrg();
  return useQuery({
    queryKey: ["bug-workflow", org.id],
    staleTime: 10 * 60_000,
    queryFn: () => unwrap(api.GET("/api/v1/orgs/{org_id}/bug-workflow", { params: { path: { org_id: org.id } } })),
  });
}
