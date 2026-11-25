"use client";

import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { IconCheck, IconSpark } from "@/components/icons";
import { Button, Spinner } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api, unwrap, type Schemas } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { useAiOutcome } from "@/modules/ai/hooks";
import { useOrg } from "@/modules/shell/org-context";

import { useRefreshReleases } from "../hooks";

type Suggestion = Schemas["ReleaseSummarySuggestion"];

const MAX = 4000;
const FALLBACK_TEXT = "AI could not write a summary. The text below comes from the readiness data, so you can still publish it or write your own.";
const RECOMMENDATION: Record<string, string> = { ship: "Ship", ship_with_caution: "Ship with caution", do_not_ship: "Do not ship" };

/** The text that is saved on the release: headline, summary, top risks and the recommendation (one text, shown as written). */
export function summaryText(s: Suggestion): string {
  const risks = s.top_risks.length ? `\n\nTop risks:\n${s.top_risks.map((r) => `- ${r}`).join("\n")}` : "";
  return `${s.headline}\n\n${s.summary}${risks}\n\nRecommendation: ${RECOMMENDATION[s.recommendation] ?? s.recommendation}`;
}

/**
 * Release Readiness Summary (REQ-048; AI_SPEC 3.6) for Org Admin and QA Lead. The server writes it from numbers it builds itself; nothing
 * is saved until the lead accepts, and accepting is the normal release update (API-113) with the AI call it came from.
 */
export function ReleaseSummaryPanel({ releaseId, hasSummary }: { releaseId: string; hasSummary: boolean }) {
  const org = useOrg();
  const toast = useToast();
  const refresh = useRefreshReleases();
  const outcome = useAiOutcome();
  const [shown, setShown] = useState<Suggestion | null>(null);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [decided, setDecided] = useState<string | null>(null);
  const [textError, setTextError] = useState<string | undefined>();
  const run = useRef(0); // a cancelled or replaced request is ignored when it answers

  const draft = useMutation({
    mutationFn: () => unwrap(api.POST("/api/v1/orgs/{org_id}/ai/release-summary", { params: { path: { org_id: org.id } }, body: { release_id: releaseId } })),
  });
  const publish = useMutation({
    mutationFn: (v: { body: string; usageId: string }) =>
      unwrap(api.PATCH("/api/v1/orgs/{org_id}/releases/{release_id}", {
        params: { path: { org_id: org.id, release_id: releaseId } }, body: { ai_summary: v.body, ai_usage_id: v.usageId },
      })),
    onSuccess: (_, v) => {
      const changed = shown ? v.body !== summaryText(shown) : false;
      outcome.mutate({ usageId: v.usageId, outcome: changed ? "edited" : "accepted" });
      toast("Summary published to the release page");
      setShown(null);
      setEditing(false);
      setDecided(null);
      refresh();
    },
    onError: (err) => {
      if (isApiError(err, "forbidden")) toast(err.message, "error");
      else if (isApiError(err, "not_found")) toast("This release was deleted by someone else.", "error");
      else if (isApiError(err, "validation_error")) setTextError(err.fieldErrors().ai_summary ?? "The summary is not valid. Draft it again.");
      else toast("Could not publish the summary. Check your connection and try again.", "error");
    },
  });

  function ask() {
    const token = ++run.current;
    setShown(null);
    setEditing(false);
    setDecided(null);
    setTextError(undefined);
    draft.mutate(undefined, {
      onSuccess: (s) => { if (token === run.current) { setShown(s); setText(summaryText(s)); } },
      onError: (err) => {
        if (token !== run.current) return;
        if (isApiError(err, "ai_disabled")) toast("AI is turned off for this workspace.", "error");
        else if (isApiError(err, "rate_limited") || isApiError(err, "daily_limit")) toast(err.message, "error");
        else if (isApiError(err, "not_found")) toast("This release was deleted by someone else.", "error");
        else toast("AI could not write a summary. Try again in a moment.", "error");
      },
    });
  }

  function cancel() { run.current++; draft.reset(); }

  function accept() {
    if (!shown) return;
    const body = (editing ? text : summaryText(shown)).trim();
    if (!body) { setTextError("Write a summary or discard this one."); return; }
    if (body.length > MAX) { setTextError(`Use ${MAX} characters or fewer.`); return; }
    setTextError(undefined);
    publish.mutate({ body, usageId: shown.usage_id });
  }

  function discard() {
    if (shown) outcome.mutate({ usageId: shown.usage_id, outcome: "discarded" });
    setShown(null);
    setEditing(false);
    setDecided("Discarded.");
  }

  const thinking = draft.isPending;
  return (
    <section className="ai-panel" aria-label="Release Readiness Summary">
      <div className="panel-head"><IconSpark /><h3>Release Readiness Summary</h3></div>
      <div className="panel-body">
        {thinking ? (
          <div className="thinking" role="status">
            <span>Reading the readiness data</span>
            <div className="bar" />
            <Button variant="ghost" size="sm" onClick={cancel}>Cancel</Button>
          </div>
        ) : shown ? (
          <div className="suggest" aria-label="AI suggestion, not saved">
            <div className="suggest-tag"><IconSpark />AI suggestion, not saved</div>
            {shown.fallback ? <p className="small" role="status">{FALLBACK_TEXT}</p> : null}
            {editing ? (
              <Field id="rs-text" label="Summary to publish" error={textError}>
                {(aria) => (
                  <Textarea {...aria} value={text} rows={12} maxLength={MAX + 1} disabled={publish.isPending}
                    onChange={(e) => { setText(e.target.value); if (textError) setTextError(undefined); }} />
                )}
              </Field>
            ) : (
              <>
                <p style={{ overflowWrap: "anywhere" }}><b>{shown.headline}</b></p>
                <p className="small" style={{ marginTop: 8, overflowWrap: "anywhere" }}>{shown.summary}</p>
                {shown.top_risks.length ? (
                  <>
                    <p className="label" style={{ marginTop: 12 }}>Top risks</p>
                    <ul className="small" style={{ margin: "4px 0 0", paddingLeft: 18, listStyle: "disc" }}>
                      {shown.top_risks.map((r) => <li key={r} style={{ overflowWrap: "anywhere" }}>{r}</li>)}
                    </ul>
                  </>
                ) : null}
                <p className="small" style={{ marginTop: 12 }}>Recommendation: <b>{RECOMMENDATION[shown.recommendation]}</b></p>
                {textError ? <p className="small" role="alert" style={{ color: "var(--danger-text)" }}>{textError}</p> : null}
              </>
            )}
            <div className="suggest-actions">
              <Button variant="primary" size="sm" disabled={publish.isPending} onClick={accept}>
                {publish.isPending ? <Spinner /> : <IconCheck />}Accept and publish
              </Button>
              {editing ? null : <Button size="sm" disabled={publish.isPending} onClick={() => setEditing(true)}>Edit</Button>}
              <Button variant="ghost" size="sm" disabled={publish.isPending} onClick={discard}>Discard</Button>
            </div>
          </div>
        ) : (
          <>
            <p className="small muted">
              {hasSummary ? "Draft a new summary to replace the published one. " : ""}
              Draft a plain English risk summary for stakeholders from the readiness data above. Only the numbers shown here are used.
            </p>
            {decided ? <p className="small muted" role="status" style={{ marginTop: 8 }}>{decided}</p> : null}
            <Button style={{ marginTop: 12 }} onClick={ask}><IconSpark />{hasSummary || decided ? "Draft again" : "Draft summary"}</Button>
          </>
        )}
        <p className="ai-note" style={{ marginTop: 12 }}>Viewers see the summary only after a lead accepts it.</p>
      </div>
    </section>
  );
}
