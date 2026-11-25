"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { IconCheck, IconSpark } from "@/components/icons";
import { Button, Spinner } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api, unwrap, type Schemas } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { useAiOutcome, useGenerateCases, type GeneratedCase, type GeneratedCases } from "@/modules/ai/hooks";
import { useOrg } from "@/modules/shell/org-context";

import { CASE_TYPE_NAME, type CaseValues } from "../schemas";

const STORY_MIN = 20;
const STORY_MAX = 12000;
const COUNTS = [6, 8, 12];
const FALLBACK_TEXT = "AI could not produce test cases. You can write the cases yourself.";

type Props = {
  projectId: string | undefined;
  suiteId: string;
  suiteName: string;
  /** Called with the first picked case when the person chooses "Edit first" (new case only). */
  onEditFirst?: (values: Partial<CaseValues>) => void;
};

/** A generated case as the bulk endpoint takes it (API-100). */
function toInput(c: GeneratedCase): Schemas["CaseIn"] {
  return {
    title: c.title, preconditions: c.preconditions, case_type: c.case_type, priority: c.priority, tags: c.tags,
    steps: c.steps.map((s) => ({ action: s.action, expected: s.expected })),
  } as Schemas["CaseIn"];
}

/**
 * Test Case Generator (REQ-047; AI_SPEC 3.5). The person pastes a story, picks how many cases, ticks the ones to keep and adds
 * them to the open suite in one bulk call. Nothing is saved before that.
 */
export function CaseGenerator({ projectId, suiteId, suiteName, onEditFirst }: Props) {
  const org = useOrg();
  const toast = useToast();
  const qc = useQueryClient();
  const generate = useGenerateCases();
  const outcome = useAiOutcome();
  const [story, setStory] = useState("");
  const [count, setCount] = useState(6);
  const [storyError, setStoryError] = useState<string | undefined>();
  const [result, setResult] = useState<GeneratedCases | null>(null);
  const [picked, setPicked] = useState<boolean[]>([]);
  const [decided, setDecided] = useState<string | null>(null);
  const run = useRef(0); // a cancelled or replaced request is ignored when it answers

  const add = useMutation({
    mutationFn: (cases: GeneratedCase[]) =>
      unwrap(api.POST("/api/v1/orgs/{org_id}/test-suites/{suite_id}/cases/bulk", {
        params: { path: { org_id: org.id, suite_id: suiteId } },
        body: { cases: cases.map(toInput), ai_usage_id: result?.usage_id },
      })),
    onSuccess: async (done) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["test-cases", org.id] }),
        qc.invalidateQueries({ queryKey: ["test-suites", org.id] }),
      ]);
      const n = done.created.length;
      toast(`${n} test ${n === 1 ? "case" : "cases"} added to ${suiteName}`);
      setDecided(`${n} added to ${suiteName}.`);
    },
    onError: (err) => {
      if (isApiError(err, "forbidden")) toast(err.message, "error");
      else if (isApiError(err, "validation_error")) toast("Some of the picked cases are not valid. Pick fewer or edit them first.", "error");
      else if (isApiError(err, "not_found")) toast("The suite was deleted by someone else.", "error");
      else toast("Could not add the cases. Check your connection and try again.", "error");
    },
  });

  function ask() {
    const text = story.trim();
    if (text.length < STORY_MIN) { setStoryError(`Write at least ${STORY_MIN} characters of the story or acceptance criteria.`); return; }
    if (text.length > STORY_MAX) { setStoryError(`Use ${STORY_MAX} characters or fewer.`); return; }
    if (!projectId) { setStoryError("Choose a suite first."); return; }
    setStoryError(undefined);
    setResult(null);
    setDecided(null);
    const token = ++run.current;
    generate.mutate({ project_id: projectId, story: text, count }, {
      onSuccess: (r) => { if (token !== run.current) return; setResult(r); setPicked(r.cases.map(() => true)); },
      onError: (err) => {
        if (token !== run.current) return;
        if (isApiError(err, "ai_disabled")) toast("AI is turned off for this workspace.", "error");
        else if (isApiError(err, "rate_limited") || isApiError(err, "daily_limit")) toast(err.message, "error");
        else if (isApiError(err, "validation_error")) setStoryError(err.fieldErrors().story ?? err.fieldErrors().project_id ?? "The story is not valid.");
        else toast(FALLBACK_TEXT, "error");
      },
    });
  }

  function cancel() { run.current++; generate.reset(); }

  const chosen = result ? result.cases.filter((_, i) => picked[i]) : [];
  const finish = (o: "edited" | "discarded", text: string) => {
    if (result) outcome.mutate({ usageId: result.usage_id, outcome: o });
    setDecided(text);
  };
  const thinking = generate.isPending;
  const showResult = !!result && !result.fallback && decided === null;

  return (
    <section className="ai-panel" aria-label="Test Case Generator">
      <div className="panel-head"><IconSpark /><h3>Test Case Generator</h3></div>
      <div className="panel-body stack">
        <Field id="g-story" label="User story or acceptance criteria" error={storyError}>
          {(aria) => (
            <Textarea {...aria} value={story} placeholder="As a shipper I want..." maxLength={STORY_MAX + 1} disabled={thinking}
              onChange={(e) => { setStory(e.target.value); if (storyError) setStoryError(undefined); }} />
          )}
        </Field>
        <Field id="g-count" label="How many cases">
          {(aria) => (
            <Select {...aria} value={String(count)} disabled={thinking} onChange={(e) => setCount(Number(e.target.value))}>
              {COUNTS.map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
          )}
        </Field>
        {thinking ? (
          <div className="thinking" role="status">
            <span>Writing cases</span>
            <div className="bar" />
            <Button variant="ghost" size="sm" onClick={cancel}>Cancel</Button>
          </div>
        ) : (
          <Button onClick={ask}><IconSpark />{result ? "Generate again" : "Generate cases"}</Button>
        )}
        {result?.fallback && !thinking ? <p className="small" role="status">{FALLBACK_TEXT}</p> : null}
        {decided ? <p className="small muted" role="status">{decided}</p> : null}
        {showResult && !thinking && result ? (
          <div className="suggest" aria-label="Suggested cases, not saved">
            <div className="suggest-tag"><IconSpark />{result.cases.length} suggested {result.cases.length === 1 ? "case" : "cases"}, not saved</div>
            {result.cases.map((c, i) => (
              <label className="gen-case" key={i}>
                <input type="checkbox" checked={!!picked[i]} aria-label={`Include ${c.title}`} disabled={add.isPending}
                  style={{ width: 16, height: 16, accentColor: "var(--primary)", marginTop: 3 }}
                  onChange={(e) => setPicked(picked.map((p, j) => (j === i ? e.target.checked : p)))} />
                <span style={{ minWidth: 0 }}>
                  <span className="type-tag">{CASE_TYPE_NAME[c.case_type] ?? c.case_type}</span>{" "}
                  <b className="small" style={{ overflowWrap: "anywhere" }}>{c.title}</b>
                  <span className="xs muted" style={{ display: "block" }}>{c.steps.length} {c.steps.length === 1 ? "step" : "steps"} with expected results</span>
                </span>
              </label>
            ))}
            {result.coverage_notes ? <p className="xs muted" style={{ overflowWrap: "anywhere" }}>{result.coverage_notes}</p> : null}
            <div className="suggest-actions">
              <Button variant="primary" size="sm" disabled={chosen.length === 0 || add.isPending || !suiteId} onClick={() => add.mutate(chosen)}>
                {add.isPending ? <Spinner /> : <IconCheck />}Add {chosen.length} to {suiteName}
              </Button>
              {onEditFirst ? (
                <Button size="sm" disabled={chosen.length === 0 || add.isPending} onClick={() => {
                  const c = chosen[0];
                  if (!c) return;
                  onEditFirst({
                    title: c.title, case_type: c.case_type, priority: c.priority, preconditions: c.preconditions, tags: c.tags.join(", "),
                    steps: c.steps.map((s) => ({ action: s.action, expected: s.expected })),
                  });
                  finish("edited", "The first picked case is in the editor.");
                }}>Edit first</Button>
              ) : null}
              <Button variant="ghost" size="sm" disabled={add.isPending} onClick={() => { finish("discarded", "Discarded."); setResult(null); }}>Discard</Button>
            </div>
          </div>
        ) : null}
        <p className="ai-note">Covers positive, negative and edge cases. You choose which ones to add. The story is sent to the AI as data only.</p>
      </div>
    </section>
  );
}
