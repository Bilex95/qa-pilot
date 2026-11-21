"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, unwrap } from "@/lib/api/client";
import { useOrg } from "@/modules/shell/org-context";

import { RELEASES_PAGE_SIZE } from "./releases";

/** One page of releases: unreleased first by target date, then the released ones (API-110). */
export function useReleases(page: number) {
  const org = useOrg();
  return useQuery({
    queryKey: ["releases", org.id, "list", page],
    placeholderData: keepPreviousData,
    queryFn: () =>
      unwrap(api.GET("/api/v1/orgs/{org_id}/releases", { params: { path: { org_id: org.id }, query: { page, page_size: RELEASES_PAGE_SIZE } } })),
  });
}

/** One release with its bugs, runs and readiness (API-112). */
export function useRelease(id: string) {
  const org = useOrg();
  return useQuery({
    queryKey: ["releases", org.id, "one", id],
    retry: (count, error) => !(error as { status?: number }).status && count < 1,
    queryFn: () => unwrap(api.GET("/api/v1/orgs/{org_id}/releases/{release_id}", { params: { path: { org_id: org.id, release_id: id } } })),
  });
}

/** The releases of one project, for the Release selects of the bug page and the New test run dialog. */
export function useProjectReleases(projectId: string | undefined) {
  const org = useOrg();
  return useQuery({
    queryKey: ["releases", org.id, "project", projectId],
    enabled: !!projectId,
    staleTime: 30_000,
    queryFn: () =>
      unwrap(api.GET("/api/v1/orgs/{org_id}/releases", {
        params: { path: { org_id: org.id }, query: { project_id: projectId as string, page: 1, page_size: 100 } },
      })),
  });
}

/** After a release, a link or a bug or run change that moves readiness: every list and page that shows a release. */
export function useRefreshReleases() {
  const org = useOrg();
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["releases", org.id] });
    void qc.invalidateQueries({ queryKey: ["bugs", org.id] });
    void qc.invalidateQueries({ queryKey: ["bug", org.id] });
    void qc.invalidateQueries({ queryKey: ["test-runs", org.id] });
    void qc.invalidateQueries({ queryKey: ["test-run", org.id] });
  };
}
