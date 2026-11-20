"use client";

import { useQuery } from "@tanstack/react-query";

import { api, unwrap } from "@/lib/api/client";
import { useOrg } from "@/modules/shell/org-context";

const MINUTE = 60_000;

/** Projects for the filter and the form (archived ones are left out by the API). */
export function useProjects() {
  const org = useOrg();
  return useQuery({
    queryKey: ["projects", org.id, "options"],
    staleTime: MINUTE,
    queryFn: () =>
      unwrap(api.GET("/api/v1/orgs/{org_id}/projects", { params: { path: { org_id: org.id }, query: { page: 1, page_size: 100 } } })),
  });
}

/** Members for the assignee filter and the assignee select. Any role may read this list (member.list_basic). */
export function useMemberOptions() {
  const org = useOrg();
  return useQuery({
    queryKey: ["members", org.id, "options"],
    staleTime: MINUTE,
    queryFn: () =>
      unwrap(api.GET("/api/v1/orgs/{org_id}/members", { params: { path: { org_id: org.id }, query: { page: 1, page_size: 100 } } })),
  });
}

export function useLabelOptions() {
  const org = useOrg();
  return useQuery({
    queryKey: ["labels", org.id],
    staleTime: MINUTE,
    queryFn: () => unwrap(api.GET("/api/v1/orgs/{org_id}/labels", { params: { path: { org_id: org.id } } })),
  });
}

// Query option factories, so the filter, the form and the table share one cache entry per project
export function componentsQuery(orgId: string, projectId: string) {
  return {
    queryKey: ["components", orgId, projectId],
    staleTime: MINUTE,
    queryFn: () =>
      unwrap(api.GET("/api/v1/orgs/{org_id}/projects/{project_id}/components", {
        params: { path: { org_id: orgId, project_id: projectId } },
      })),
  };
}

export function environmentsQuery(orgId: string, projectId: string) {
  return {
    queryKey: ["environments", orgId, projectId],
    staleTime: MINUTE,
    queryFn: () =>
      unwrap(api.GET("/api/v1/orgs/{org_id}/projects/{project_id}/environments", {
        params: { path: { org_id: orgId, project_id: projectId } },
      })),
  };
}

export function useComponents(projectId: string | undefined) {
  const org = useOrg();
  return useQuery({ ...componentsQuery(org.id, projectId ?? ""), enabled: !!projectId });
}

export function useEnvironments(projectId: string | undefined) {
  const org = useOrg();
  return useQuery({ ...environmentsQuery(org.id, projectId ?? ""), enabled: !!projectId });
}
