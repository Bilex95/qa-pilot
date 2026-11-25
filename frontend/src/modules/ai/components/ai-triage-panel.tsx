"use client";

import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { IconCheck, IconSpark } from "@/components/icons";
import { Button, Spinner } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api, unwrap, type Schemas } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { PriorityTag, SeverityBadge } from "@/modules/bugs/components/bug-badges";
import { useRefreshBug, type BugDetail } from "@/modules/bugs/detail-hooks";
import { PRIORITY_OPTIONS, SEVERITY_NAME } from "@/modules/bugs/schemas";
import { useOrg } from "@/modules/shell/org-context";

import { useAiOutcome, useTriage, type Outcome, type TriageSuggestion } from "../hooks";

const FALLBACK_TEXT = "AI could not produce a suggestion. You can set severity, priority and component yourself.";
const CONFIDENCE: Record<string, string> = { low: "Low", medium: "Medium", high: "High" };
const PRIORITY_NAME = Object.fromEntries(PRIORITY_OPTIONS.map(([k, l]) => [k, l.split(" ")[0]])) as Record<string, string>;

type Shown = { suggestion: TriageSuggestion; decided: Outcome | null };

/** What the state of the panel needs: the page puts the panel above the Details when a suggestion is open (as the prototype does). */
export function useTriagePanel(bug: BugDetail) {
  const org = useOrg();
  const toast = useToast();
  const refresh = useRefreshBug();
  const triage = useTriage();
  const outcome = useAiOutcome();
  const [shown, setShown] = useState<Shown | null>(null);
  const run = useRef(0); // a cancelled or replaced request is ignored when it answers

  const apply = useMutation({
    mutationFn: (s: TriageSuggestion) => {
      const body: Schemas["BugUpdateIn"] = { severity: s.severity ?? undefined, priority: s.priority ?? undefined };
      if (s.component_id) body.component_id = s.component_id;
      return unwrap(api.PATCH("/api/v1/orgs/{org_id}/bugs/{bug_id}", { params: { path: { org_id: org.id, bug_id: bug.id } }, body }));
    },
    onSuccess: (_, s) => {
      outcome.mutate({ usageId: s.usage_id, outcome: "accepted" });
      refresh(bug.id);
      const parts = [SEVERITY_NAME[s.severity ?? ""], PRIORITY_NAME[s.priority ?? ""], s.component_id ? s.component : null].filter(Boolean);
      toast(`Triage applied: ${parts.join(", ")}`);
      setShown({ suggestion: s, decided: "accepted" });
    },
    onError: (err) => {
      if (isApiError(err, "forbidden")) toast(err.message, "error");
      else if (isApiError(err, "validation_error")) toast("That suggestion is not valid any more. Ask again.", "error");
      else if (isApiError(err, "not_found")) toast(`${bug.key} was deleted by someone else.`, "error");
      else toast("Could not apply the suggestion. Check your connection and try again.", "error");
    },
  });

  function ask() {
    const token = ++run.current;
    setShown(null);
    triage.mutate(bug.id, {
      onSuccess: (suggestion) => { if (token === run.current) setShown({ suggestion, decided: null }); },
      onError: (err) => {
        if (token !== run.current) return;
        if (isApiError(err, "ai_disabled")) toast("AI is turned off for this workspace.", "error");
        else if (isApiError(err, "rate_limited") || isApiError(err, "daily_limit")) toast(err.message, "error");
        else toast(FALLBACK_TEXT, "error");
      },
    });
  }

  function cancel() {
    run.current++;
    triage.reset();
  }

  function decide(value: Outcome) {
    if (!shown) return;
    if (value === "accepted") return apply.mutate(shown.suggestion);
    outcome.mutate({ usageId: shown.suggestion.usage_id, outcome: value });
    toast(value === "edited" ? "Suggestion kept. Change the values in Details." : "Suggestion discarded");
    if (value === "edited") document.getElementById("d-sev")?.focus();
    setShown({ ...shown, decided: value });
  }

  return { shown, thinking: triage.isPending, applying: apply.isPending, ask, cancel, decide, open: !!shown && !shown.suggestion.fallback && shown.decided === null };
}

/**
 * AI triage (REQ-045; AI_SPEC 3.3): a suggested severity, priority and component with a reason. Nothing changes until the person
 * accepts; accepting is the normal bug update, so its checks and its activity entries apply (API-063).
 */
export function AiTriagePanel({ panel }: { panel: ReturnType<typeof useTriagePanel> }) {
  const { shown, thinking, applying } = panel;
  const s = shown?.suggestion;
  return (
    <section className="ai-panel" aria-label="AI triage">
      <div className="panel-head"><IconSpark /><h3>AI triage</h3></div>
      <div className="panel-body">
        {thinking ? (
          <div className="thinking" role="status">
            <span>Reading the bug</span>
            <div className="bar" />
            <Button variant="ghost" size="sm" onClick={panel.cancel}>Cancel</Button>
          </div>
        ) : s && s.fallback ? (
          <div className="suggest" role="status"><p className="small">{FALLBACK_TEXT}</p></div>
        ) : s ? (
          <div className="suggest" aria-label="AI suggestion, not saved">
            <div className="suggest-tag"><IconSpark />AI suggestion, not saved</div>
            <dl className="dl">
              <dt>Severity</dt><dd>{s.severity ? <SeverityBadge severity={s.severity} /> : "None"}</dd>
              <dt>Priority</dt><dd>{s.priority ? <PriorityTag priority={s.priority} /> : "None"}</dd>
              <dt>Component</dt><dd style={{ overflowWrap: "anywhere" }}>{s.component ?? "None"}</dd>
              <dt>Confidence</dt><dd>{s.confidence ? CONFIDENCE[s.confidence] : "None"}</dd>
            </dl>
            <p className="reason" style={{ overflowWrap: "anywhere" }}>{s.reason}</p>
            {shown?.decided ? (
              <p className="small muted" style={{ marginTop: 12 }}>
                {shown.decided === "accepted" ? "Applied." : shown.decided === "edited" ? "Kept for editing." : "Discarded."}
              </p>
            ) : (
              <div className="suggest-actions">
                <Button variant="primary" size="sm" disabled={applying} onClick={() => panel.decide("accepted")}>
                  {applying ? <Spinner /> : <IconCheck />}Accept
                </Button>
                <Button size="sm" disabled={applying} onClick={() => panel.decide("edited")}>Edit</Button>
                <Button variant="ghost" size="sm" disabled={applying} onClick={() => panel.decide("discarded")}>Discard</Button>
              </div>
            )}
          </div>
        ) : (
          <p className="small muted">Get a suggested severity, priority and component with a short reason. Nothing changes until you accept.</p>
        )}
        {!thinking && (!s || s.fallback || shown?.decided) ? (
          <Button style={{ marginTop: 12 }} onClick={panel.ask}><IconSpark />{s ? "Suggest again" : "Suggest triage"}</Button>
        ) : null}
        <p className="ai-note" style={{ marginTop: 12 }}>Bug text is sent to the AI as data only.</p>
      </div>
    </section>
  );
}
