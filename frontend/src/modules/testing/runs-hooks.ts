"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { api, unwrap } from "@/lib/api/client";
import { useOrg } from "@/modules/shell/org-context";

import { RUNS_PAGE_SIZE } from "./runs";

/** One page of runs, newest first (API-101). */
export function useRuns(page: number) {
  const org = useOrg();
  return useQuery({
    queryKey: ["test-runs", org.id, page],
    placeholderData: keepPreviousData,
    queryFn: () =>
      unwrap(api.GET("/api/v1/orgs/{org_id}/test-runs", { params: { path: { org_id: org.id }, query: { page, page_size: RUNS_PAGE_SIZE } } })),
  });
}

/** One run with its results, by key (R-31) or id (API-103). */
export function useRun(ref: string) {
  const org = useOrg();
  return useQuery({
    queryKey: ["test-run", org.id, ref],
    retry: (count, error) => !(error as { status?: number }).status && count < 1,
    queryFn: () => unwrap(api.GET("/api/v1/orgs/{org_id}/test-runs/{run_ref}", { params: { path: { org_id: org.id, run_ref: ref } } })),
  });
}
