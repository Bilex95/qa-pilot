"use client";

import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, unwrap, type Schemas } from "@/lib/api/client";
import { useOrg } from "@/modules/shell/org-context";

export type BugDetail = Schemas["BugOut"];
export type BugComment = Schemas["CommentOut"];
export type BugFile = Schemas["AttachmentOut"];
export type BugActivity = Schemas["ActivityOut"];

const TIMELINE_PAGE = 25;

/** One bug by its key (WEB-42) or id (API-063). The cache key holds whatever the address used. */
export function useBug(ref: string) {
  const org = useOrg();
  return useQuery({
    queryKey: ["bug", org.id, ref],
    queryFn: () => unwrap(api.GET("/api/v1/orgs/{org_id}/bugs/{bug_ref}", { params: { path: { org_id: org.id, bug_ref: ref } } })),
    retry: (count, error) => !(error as { status?: number }).status && count < 1, // a 404 or 403 will not change: do not retry
  });
}

/** Comments, newest first, a page at a time (API-069). */
export function useComments(bugId: string | undefined) {
  const org = useOrg();
  return useInfiniteQuery({
    queryKey: ["bug-comments", org.id, bugId],
    enabled: !!bugId,
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      unwrap(api.GET("/api/v1/orgs/{org_id}/bugs/{bug_id}/comments", {
        params: { path: { org_id: org.id, bug_id: bugId ?? "" }, query: { page: pageParam, page_size: TIMELINE_PAGE } },
      })),
    getNextPageParam: (last) => (last.page * last.page_size < last.total ? last.page + 1 : undefined),
  });
}

/** Everything that changed on the bug, newest first, a page at a time (API-077). */
export function useActivity(bugId: string | undefined) {
  const org = useOrg();
  return useInfiniteQuery({
    queryKey: ["bug-activity", org.id, bugId],
    enabled: !!bugId,
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      unwrap(api.GET("/api/v1/orgs/{org_id}/bugs/{bug_id}/activity", {
        params: { path: { org_id: org.id, bug_id: bugId ?? "" }, query: { page: pageParam, page_size: TIMELINE_PAGE } },
      })),
    getNextPageParam: (last) => (last.page * last.page_size < last.total ? last.page + 1 : undefined),
  });
}

/** The files of a bug (API-073). */
export function useFiles(bugId: string | undefined) {
  const org = useOrg();
  return useQuery({
    queryKey: ["bug-files", org.id, bugId],
    enabled: !!bugId,
    queryFn: () => unwrap(api.GET("/api/v1/orgs/{org_id}/bugs/{bug_id}/attachments", { params: { path: { org_id: org.id, bug_id: bugId ?? "" } } })),
  });
}

/** After any change to a bug: the page itself, its timeline, and every list that shows it. */
export function useRefreshBug() {
  const org = useOrg();
  const qc = useQueryClient();
  return (bugId: string, parts: { bug?: boolean; comments?: boolean; activity?: boolean; files?: boolean } = {}) => {
    const { bug = true, comments = false, activity = true, files = false } = parts;
    if (bug) void qc.invalidateQueries({ queryKey: ["bug", org.id] });
    if (comments) void qc.invalidateQueries({ queryKey: ["bug-comments", org.id, bugId] });
    if (activity) void qc.invalidateQueries({ queryKey: ["bug-activity", org.id, bugId] });
    if (files) void qc.invalidateQueries({ queryKey: ["bug-files", org.id, bugId] });
    void qc.invalidateQueries({ queryKey: ["bugs", org.id] });
    void qc.invalidateQueries({ queryKey: ["board", org.id] });
  };
}
