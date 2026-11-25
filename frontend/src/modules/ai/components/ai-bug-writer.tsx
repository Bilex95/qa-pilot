"use client";

import { useRef, useState } from "react";

import { IconCheck, IconSpark } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { isApiError } from "@/lib/api/errors";
import { RESULT_MAX, SEVERITY_OPTIONS, type NewBugValues } from "@/modules/bugs/schemas";

import { useAiOutcome, useBugWriter, useExplainLog, type BugDraft, type LogExplanation, type Outcome } from "../hooks";

const NOTES_MAX = 12_000;
const SEVERITY_NAME = Object.fromEntries(SEVERITY_OPTIONS) as Record<string, string>;

type Suggestion = { draft: BugDraft; previous: NewBugValues; filled: Part[]; decided: Outcome | null };

/** The form fields a draft fills. Severity only for a person who may set it; the ids are the project's own (the server mapped the names). */
export function draftPatch(draft: BugDraft, setsSeverity: boolean): Partial<NewBugValues> {
  const patch: Partial<NewBugValues> = {
    title: draft.title,
    steps: draft.steps_to_reproduce.length ? draft.steps_to_reproduce : [""],
    expected_result: draft.expected_result,
    actual_result: draft.actual_result,
  };
  if (setsSeverity) patch.severity = draft.suggested_severity;
  if (draft.environment_id) patch.environment_id = draft.environment_id;
  if (draft.component_id) patch.component_id = draft.component_id;
  return patch;
}

type Part = { label: string; value?: string };

/** What a draft filled in, as the sentence of the suggestion: the values the person should look at are bold. */
function describe(draft: BugDraft, setsSeverity: boolean): Part[] {
  const n = draft.steps_to_reproduce.length;
  const parts: Part[] = [{ label: "title" }, { label: `${n} ${n === 1 ? "step" : "steps"}` }, { label: "expected and actual results" }];
  if (setsSeverity) parts.push({ label: "severity", value: SEVERITY_NAME[draft.suggested_severity] ?? draft.suggested_severity });
  if (draft.environment_id && draft.environment) parts.push({ label: "environment", value: draft.environment });
  if (draft.component_id && draft.component) parts.push({ label: "component", value: draft.component });
  return parts;
}

const FALLBACK_TEXT = "AI could not produce a suggestion. You can continue manually.";

/**
 * AI Bug Writer (REQ-043, REQ-044, REQ-049; AI_SPEC 3.1, 3.2): rough notes and an optional log become a draft that is filled into the form. It
 * is a suggestion only: the person accepts it, keeps it to edit, or discards it (the form goes back as it was), and what they did is reported
 * to the server (API-148). Nothing is saved until Save bug. Explain this log is a second, explicit action.
 */
export function AiBugWriter({ projectId, values, setsSeverity, onFill, onRestore, onAssist, onActual, onFocusTitle }: {
  projectId: string;
  values: NewBugValues;
  setsSeverity: boolean;
  onFill: (patch: Partial<NewBugValues>) => void;
  onRestore: (previous: NewBugValues) => void;
  onAssist: (assisted: boolean) => void; // the bug saved from this form is marked as AI assisted while a draft is in the form

  onActual: (text: string) => void;
  onFocusTitle: () => void;
}) {
  const toast = useToast();
  const writer = useBugWriter();
  const explainer = useExplainLog();
  const outcome = useAiOutcome();
  const [notes, setNotes] = useState("");
  const [log, setLog] = useState("");
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [explained, setExplained] = useState<{ text: LogExplanation; decided: Outcome | null } | null>(null);
  const run = useRef(0); // a cancelled or replaced request is ignored when it answers

  const refused = (err: unknown) => {
    if (isApiError(err, "ai_disabled")) toast("AI is turned off for this workspace.", "error");
    else if (isApiError(err, "rate_limited") || isApiError(err, "daily_limit")) toast(err.message, "error");
    else toast(FALLBACK_TEXT, "error");
  };

  function write() {
    const token = ++run.current;
    const previous = values; // what Discard brings back
    setSuggestion(null);
    writer.mutate({ project_id: projectId, notes: notes.trim(), ...(log.trim() ? { log } : {}) }, {
      onSuccess: (draft) => {
        if (token !== run.current) return;
        if (draft.fallback) return setSuggestion({ draft, previous, filled: [], decided: null });
        onFill(draftPatch(draft, setsSeverity));
        onAssist(true);
        setSuggestion({ draft, previous, filled: describe(draft, setsSeverity), decided: null });
      },
      onError: (err) => { if (token === run.current) refused(err); },
    });
  }

  function cancel() {
    run.current++;
    writer.reset();
  }

  function decide(value: Outcome) {
    if (!suggestion) return;
    outcome.mutate({ usageId: suggestion.draft.usage_id, outcome: value });
    if (value === "discarded") {
      onRestore(suggestion.previous);
      onAssist(false);
    }
    if (value === "edited") onFocusTitle();
    toast(value === "accepted" ? "Draft accepted. Review the form and save." : value === "edited" ? "Draft kept. Edit it in the form." : "Draft discarded. The form is as it was.");
    setSuggestion({ ...suggestion, decided: value });
  }

  function explain() {
    setExplained(null);
    explainer.mutate(log, {
      onSuccess: (text) => setExplained({ text, decided: null }),
      onError: refused,
    });
  }

  function insertExplanation(text: LogExplanation) {
    const sentence = [text.summary, text.likely_cause].filter(Boolean).join(" ");
    onActual(sentence.slice(0, RESULT_MAX));
    outcome.mutate({ usageId: text.usage_id, outcome: "accepted" });
    toast("Explanation added to the actual result");
    setExplained({ text, decided: "accepted" });
  }

  const thinking = writer.isPending;
  const showRun = !thinking && (!suggestion || suggestion.draft.fallback || suggestion.decided !== null);

  return (
    <section className="ai-panel" aria-label="AI Bug Writer">
      <div className="panel-head"><IconSpark /><h3>AI Bug Writer</h3></div>
      <div className="panel-body stack">
        <Field id="w-notes" label="Rough notes">
          {(aria) => (
            <Textarea {...aria} value={notes} maxLength={NOTES_MAX} placeholder="Describe what happened in your own words" onChange={(e) => setNotes(e.target.value)} />
          )}
        </Field>
        <Field id="w-log" label="Log or stack trace (optional)">
          {(aria) => (
            <Textarea {...aria} className="mono" value={log} maxLength={NOTES_MAX} style={{ minHeight: 64, fontSize: 12 }}
              placeholder="Paste console or server output" onChange={(e) => setLog(e.target.value)} />
          )}
        </Field>
        {thinking ? (
          <div className="thinking" role="status">
            <span>Drafting the report</span>
            <div className="bar" />
            <Button variant="ghost" size="sm" onClick={cancel}>Cancel</Button>
          </div>
        ) : null}
        {suggestion ? (
          suggestion.draft.fallback ? (
            <div className="suggest" role="status"><p className="small">{FALLBACK_TEXT}</p></div>
          ) : (
            <div className="suggest">
              <div className="suggest-tag"><IconSpark />AI suggestion, not saved</div>
              <p className="small">
                Draft filled into the form:{" "}
                {suggestion.filled.map((p, i) => (
                  <span key={p.label}>{i ? ", " : ""}{p.value ? <>{p.label} <b>{p.value}</b></> : p.label}</span>
                ))}.
              </p>
              {suggestion.draft.missing_information.length ? (
                <p className="reason"><b>Missing information:</b> {suggestion.draft.missing_information.join(" ")}</p>
              ) : null}
              {suggestion.decided ? (
                <p className="small muted">{suggestion.decided === "accepted" ? "Accepted." : suggestion.decided === "edited" ? "Kept for editing." : "Discarded."}</p>
              ) : (
                <div className="suggest-actions">
                  <Button variant="primary" size="sm" onClick={() => decide("accepted")}><IconCheck />Accept</Button>
                  <Button size="sm" onClick={() => decide("edited")}>Edit</Button>
                  <Button variant="ghost" size="sm" onClick={() => decide("discarded")}>Discard</Button>
                </div>
              )}
            </div>
          )
        ) : null}
        {showRun ? (
          <Button disabled={!notes.trim() || !projectId} onClick={write}>
            <IconSpark />
            {suggestion ? "Write the report again" : "Write the report"}
          </Button>
        ) : null}
        {log.trim() && !thinking ? (
          <details className="small">
            <summary>Explain this log</summary>
            <div className="stack" style={{ marginTop: 8 }}>
              {explained ? (
                <div className="suggest">
                  <div className="suggest-tag"><IconSpark />AI suggestion, not saved</div>
                  {explained.text.fallback ? <p className="small">{FALLBACK_TEXT}</p> : (
                    <>
                      <p style={{ overflowWrap: "anywhere" }}>
                        {explained.text.error_type ? <b>{explained.text.error_type}: </b> : null}{explained.text.summary}
                      </p>
                      {explained.text.likely_cause ? <p className="small" style={{ overflowWrap: "anywhere" }}><b>Likely cause:</b> {explained.text.likely_cause}</p> : null}
                      {explained.text.key_lines.length ? (
                        <ul className="small mono" style={{ paddingLeft: 16, margin: 0, fontSize: 12, whiteSpace: "normal", overflowWrap: "anywhere" }}>
                          {explained.text.key_lines.map((l, i) => <li key={i}>{l}</li>)}
                        </ul>
                      ) : null}
                    </>
                  )}
                  {explained.decided ? <p className="small muted">Added to the actual result.</p> : explained.text.fallback ? null : (
                    <div className="suggest-actions">
                      <Button size="sm" onClick={() => insertExplanation(explained.text)}>Add to actual result</Button>
                    </div>
                  )}
                </div>
              ) : null}
              <div>
                <Button size="sm" disabled={explainer.isPending} onClick={explain}>
                  {explainer.isPending ? "Explaining" : explained ? "Explain again" : "Explain this log"}
                </Button>
              </div>
            </div>
          </details>
        ) : null}
        <p className="ai-note">Your notes are sent to the AI as data only. Nothing is saved until you choose Save bug.</p>
      </div>
    </section>
  );
}
