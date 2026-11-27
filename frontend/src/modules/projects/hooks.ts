"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, unwrap } from "@/lib/api/client";
import { useOrg } from "@/modules/shell/org-context";

import { PROJECTS_PAGE_SIZE } from "./projects";

/** One page of projects with their figures (API-040). */
export function useProjectsPage(page: number) {
  const org = useOrg();
  return useQuery({
    queryKey: ["projects", org.id, "list", page],
    placeholderData: keepPreviousData,
    queryFn: () =>
      unwrap(api.GET("/api/v1/orgs/{org_id}/projects", { params: { path: { org_id: org.id }, query: { page, page_size: PROJECTS_PAGE_SIZE } } })),
  });
}

/**
 * A project by its key (the address uses the key, the API the id): the list with archived projects is searched, then the detail is read
 * (API-042). A key that matches nothing is `notFound`.
 */
export function useProjectByKey(key: string) {
  const org = useOrg();
  const wanted = key.toUpperCase();
  const all = useQuery({
    queryKey: ["projects", org.id, "all"],
    retry: (count, error) => !(error as { status?: number }).status && count < 1,
    queryFn: () =>
      unwrap(api.GET("/api/v1/orgs/{org_id}/projects", { params: { path: { org_id: org.id }, query: { page: 1, page_size: 100, include_archived: true } } })),
  });
  const id = all.data?.items.find((p) => p.key === wanted)?.id;
  const one = useQuery({
    queryKey: ["projects", org.id, "one", id],
    enabled: !!id,
    retry: (count, error) => !(error as { status?: number }).status && count < 1,
    queryFn: () => unwrap(api.GET("/api/v1/orgs/{org_id}/projects/{project_id}", { params: { path: { org_id: org.id, project_id: id as string } } })),
  });
  return {
    data: one.data,
    listed: all.data?.items.find((p) => p.key === wanted), // what the list already knows: the page head can stay when the detail fails
    isPending: all.isPending || (!!id && one.isPending),
    isError: all.isError || one.isError,
    error: all.error ?? one.error,
    notFound: all.isSuccess && !id,
    refetch: () => { void all.refetch(); void one.refetch(); },
  };
}

/** The open bugs of one project, last updated first (the overview shows five). */
export function useProjectBugs(projectId: string | undefined) {
  const org = useOrg();
  return useQuery({
    queryKey: ["bugs", org.id, "project-overview", projectId],
    enabled: !!projectId,
    queryFn: () =>
      unwrap(api.GET("/api/v1/orgs/{org_id}/bugs", {
        params: { path: { org_id: org.id }, query: { project_id: projectId as string, open: true, page: 1, page_size: 5, sort: "-updated_at" } },
      })),
  });
}

/** The newest runs of one project. */
export function useProjectRuns(projectId: string | undefined) {
  const org = useOrg();
  return useQuery({
    queryKey: ["test-runs", org.id, "project-overview", projectId],
    enabled: !!projectId,
    queryFn: () =>
      unwrap(api.GET("/api/v1/orgs/{org_id}/test-runs", {
        params: { path: { org_id: org.id }, query: { project_id: projectId as string, page: 1, page_size: 5 } },
      })),
  });
}

/** After a project, component or environment change: every list that shows them, including the pickers on other screens. */
export function useRefreshProjects() {
  const org = useOrg();
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["projects", org.id] });
    void qc.invalidateQueries({ queryKey: ["components", org.id] });
    void qc.invalidateQueries({ queryKey: ["environments", org.id] });
    void qc.invalidateQueries({ queryKey: ["bugs", org.id] });
  };
}
