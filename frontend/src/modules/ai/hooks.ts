"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { api, unwrap, type Schemas } from "@/lib/api/client";
import { useOrg } from "@/modules/shell/org-context";

export type BugDraft = Schemas["BugWriterOut"];
export type LogExplanation = Schemas["LogExplanationOut"];
export type DuplicateCandidate = Schemas["DuplicateCandidateOut"];
export type Outcome = "accepted" | "edited" | "discarded";

/** The same value after it stopped changing for `ms` milliseconds (the duplicate check waits 600 ms, AI_SPEC 3.4). */
export function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

/** API-140: rough notes (and a log) to a draft. A suggestion only; nothing is saved. */
export function useBugWriter() {
  const org = useOrg();
  return useMutation({
    mutationFn: (body: { project_id: string; notes: string; log?: string }) =>
      unwrap(api.POST("/api/v1/orgs/{org_id}/ai/bug-writer", { params: { path: { org_id: org.id } }, body })),
  });
}

export type TriageSuggestion = Schemas["TriageOut"];

/** API-142: severity, priority and component for a saved bug. A suggestion only; accepting it is the normal bug update. */
export function useTriage() {
  const org = useOrg();
  return useMutation({
    mutationFn: (bugId: string) =>
      unwrap(api.POST("/api/v1/orgs/{org_id}/ai/triage", { params: { path: { org_id: org.id } }, body: { bug_id: bugId } })),
  });
}

export type GeneratedCases = Schemas["GenerateCasesOut"];
export type GeneratedCase = GeneratedCases["cases"][number];

/** API-144: positive, negative and edge cases for a story. Suggestions only; cases are created later through the bulk endpoint. */
export function useGenerateCases() {
  const org = useOrg();
  return useMutation({
    mutationFn: (body: { project_id: string; story: string; count: number }) =>
      unwrap(api.POST("/api/v1/orgs/{org_id}/ai/test-cases", { params: { path: { org_id: org.id } }, body })),
  });
}

/** API-141: what a log shows. */
export function useExplainLog() {
  const org = useOrg();
  return useMutation({
    mutationFn: (log: string) => unwrap(api.POST("/api/v1/orgs/{org_id}/ai/explain-log", { params: { path: { org_id: org.id } }, body: { log } })),
  });
}

/** API-143: open bugs of the project that look like this one. No model is asked; the call is free. Off until `enabled`. */
export function useDuplicates(input: { projectId: string; title: string; actualResult: string }, enabled: boolean) {
  const org = useOrg();
  return useQuery({
    queryKey: ["ai-duplicates", org.id, input.projectId, input.title, input.actualResult],
    enabled: enabled && !!input.projectId,
    retry: false,
    staleTime: 60_000,
    queryFn: () =>
      unwrap(api.POST("/api/v1/orgs/{org_id}/ai/duplicates", {
        params: { path: { org_id: org.id } },
        body: { project_id: input.projectId, title: input.title, ...(input.actualResult.trim() ? { actual_result: input.actualResult.trim() } : {}) },
      })),
  });
}

export type UsageSummary = Schemas["UsageSummaryOut"];
export type UsageRow = Schemas["UsageOut"];

/** API-147: totals by feature, the provider and model, and today's calls against the daily limit, for the last `days` days. */
export function useUsageSummary(from: string, to: string, enabled = true) {
  const org = useOrg();
  return useQuery({
    enabled,
    queryKey: ["ai-usage-summary", org.id, from, to],
    queryFn: () => unwrap(api.GET("/api/v1/orgs/{org_id}/ai/usage/summary", { params: { path: { org_id: org.id }, query: { from, to } } })),
  });
}

/** API-146: the request log, newest first, one page at a time. */
export function useUsageLog(from: string, to: string, page: number, enabled = true) {
  const org = useOrg();
  return useQuery({
    enabled,
    queryKey: ["ai-usage-log", org.id, from, to, page],
    placeholderData: (previous) => previous,
    queryFn: () => unwrap(api.GET("/api/v1/orgs/{org_id}/ai/usage", { params: { path: { org_id: org.id }, query: { from, to, page, page_size: 10 } } })),
  });
}

/** API-148: what the person did with a suggestion. Best effort: a failure never gets in the way of the form. */
export function useAiOutcome() {
  const org = useOrg();
  return useMutation({
    mutationFn: ({ usageId, outcome }: { usageId: string; outcome: Outcome }) =>
      unwrap(api.POST("/api/v1/orgs/{org_id}/ai/usage/{usage_id}/outcome", { params: { path: { org_id: org.id, usage_id: usageId } }, body: { outcome } })),
  });
}
