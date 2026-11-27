"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { api, unwrap } from "@/lib/api/client";
import { useOrg } from "@/modules/shell/org-context";

import { PAGE_SIZE } from "./schemas";

/** Every suite of the workspace (the API maximum of 100 per page; the screen groups them by project). */
export function useSuites() {
  const org = useOrg();
  return useQuery({
    queryKey: ["test-suites", org.id],
    queryFn: () =>
      unwrap(api.GET("/api/v1/orgs/{org_id}/test-suites", { params: { path: { org_id: org.id }, query: { page: 1, page_size: 100 } } })),
  });
}

export function useSuiteCases(suiteId: string | undefined, page: number) {
  const org = useOrg();
  return useQuery({
    queryKey: ["test-cases", org.id, suiteId, page],
    enabled: !!suiteId,
    placeholderData: keepPreviousData, // keep the table while the next page loads
    queryFn: () =>
      unwrap(api.GET("/api/v1/orgs/{org_id}/test-suites/{suite_id}/cases", {
        params: { path: { org_id: org.id, suite_id: suiteId as string }, query: { page, page_size: PAGE_SIZE } },
      })),
  });
}

export function useTestCase(ref: string | undefined) {
  const org = useOrg();
  return useQuery({
    queryKey: ["test-case", org.id, ref],
    enabled: !!ref,
    retry: false,
    queryFn: () =>
      unwrap(api.GET("/api/v1/orgs/{org_id}/test-cases/{case_ref}", { params: { path: { org_id: org.id, case_ref: ref as string } } })),
  });
}

/** Projects, for grouping the suites and for the suite dialog (archived projects are left out by the API). */
export function useProjectList() {
  const org = useOrg();
  return useQuery({
    queryKey: ["projects", org.id, "options"],
    staleTime: 60_000,
    queryFn: () =>
      unwrap(api.GET("/api/v1/orgs/{org_id}/projects", { params: { path: { org_id: org.id }, query: { page: 1, page_size: 100 } } })),
  });
}

export function useProjectComponents(projectId: string | undefined) {
  const org = useOrg();
  return useQuery({
    queryKey: ["components", org.id, projectId],
    enabled: !!projectId,
    staleTime: 60_000,
    queryFn: () =>
      unwrap(api.GET("/api/v1/orgs/{org_id}/projects/{project_id}/components", {
        params: { path: { org_id: org.id, project_id: projectId as string } },
      })),
  });
}
