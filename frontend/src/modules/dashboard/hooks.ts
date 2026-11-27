"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { api, unwrap } from "@/lib/api/client";
import { useOrg } from "@/modules/shell/org-context";

export function useDashboard(projectId: string) {
  const org = useOrg();
  return useQuery({
    queryKey: ["dashboard", org.id, projectId],
    placeholderData: keepPreviousData,
    queryFn: () => unwrap(api.GET("/api/v1/orgs/{org_id}/dashboard", { params: { path: { org_id: org.id }, query: { project_id: projectId || undefined } } })),
  });
}

export type Range = { from: string; to: string };

export function useTrend(projectId: string, range: Range) {
  const org = useOrg();
  return useQuery({
    queryKey: ["report-trend", org.id, projectId, range.from, range.to],
    placeholderData: keepPreviousData,
    queryFn: () =>
      unwrap(api.GET("/api/v1/orgs/{org_id}/reports/bug-trend", {
        params: { path: { org_id: org.id }, query: { project_id: projectId || undefined, from: range.from, to: range.to, interval: "day" } },
      })),
  });
}

export function useSummary(projectId: string, range: Range) {
  const org = useOrg();
  return useQuery({
    queryKey: ["report-summary", org.id, projectId, range.from, range.to],
    placeholderData: keepPreviousData,
    queryFn: () =>
      unwrap(api.GET("/api/v1/orgs/{org_id}/reports/summary", {
        params: { path: { org_id: org.id }, query: { project_id: projectId || undefined, from: range.from, to: range.to } },
      })),
  });
}

/** The open bugs assigned to the signed in person, for the Developer's "Assigned to you" panel. */
export function useMyOpenBugs(userId: string | undefined, enabled: boolean) {
  const org = useOrg();
  return useQuery({
    queryKey: ["bugs", org.id, "mine", userId],
    enabled: enabled && !!userId,
    queryFn: () =>
      unwrap(api.GET("/api/v1/orgs/{org_id}/bugs", {
        params: { path: { org_id: org.id }, query: { assignee_id: userId, open: true, page: 1, page_size: 25, sort: "-updated_at" } },
      })),
  });
}
