"use client";

import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";

import { IconPlus, IconTrash } from "@/components/icons";
import { Button, Spinner } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api, unwrap, type Schemas } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { useOrg } from "@/modules/shell/org-context";

import { useRefreshBug, type BugDetail } from "../detail-hooks";
import { useLabelOptions } from "../hooks";
import { DESCRIPTION_MAX, LABEL_MAX, RESULT_MAX, STEP_LENGTH, STEP_MAX, TITLE_MAX, titleSchema } from "../schemas";

type Changes = Schemas["BugUpdateIn"];

/** One PATCH of the bug (API-063). The caller shows the field message from `error`; other failures are toasts. */
function useBugUpdate(bug: BugDetail, done: string, onSaved: () => void) {
  const org = useOrg();
  const toast = useToast();
  const refresh = useRefreshBug();
  return useMutation({
    mutationFn: (changes: Changes) =>
      unwrap(api.PATCH("/api/v1/orgs/{org_id}/bugs/{bug_id}", { params: { path: { org_id: org.id, bug_id: bug.id } }, body: changes })),
    onSuccess: () => {
      toast(done);
      refresh(bug.id);
      onSaved();
    },
    onError: (err) => {
      if (isApiError(err, "validation_error")) return; // shown next to the field
      if (isApiError(err, "forbidden")) toast(err.message, "error");
      else if (isApiError(err, "not_found")) toast(`${bug.key} was deleted by someone else.`, "error");
      else toast("Could not save the change. Check your connection and try again.", "error");
    },
  });
}

function fieldMessage(error: unknown, field: string): string | undefined {
  return isApiError(error, "validation_error") ? error.fieldErrors()[field] : undefined;
}

/** The status line, the title (editable) and the reporting line (SCR-10). */
export function BugHeadline({ bug, canEdit, badges, byline }: { bug: BugDetail; canEdit: boolean; badges: ReactNode; byline: ReactNode }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(bug.title);
  const [problem, setProblem] = useState<string | undefined>();
  const save = useBugUpdate(bug, "Title updated", () => setEditing(false));

  function open() {
    setValue(bug.title);
    setProblem(undefined);
    setEditing(true);
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    if (save.isPending) return;
    const parsed = titleSchema.safeParse(value);
    if (!parsed.success) return setProblem(parsed.error.issues[0]?.message);
    if (parsed.data === bug.title) return setEditing(false); // nothing changed: no request, no timeline entry
    setProblem(undefined);
    save.mutate({ title: parsed.data });
  }

  return (
    <div className="grow">
      <div className="row" style={{ marginBottom: 8 }}>
        {badges}
        {canEdit && !editing ? <Button variant="ghost" size="sm" onClick={open}>Edit title</Button> : null}
      </div>
      {editing ? (
        <form className="stack" style={{ gap: 8 }} onSubmit={submit} noValidate>
          <Field id="e-title" label={<span className="sr-only">Title</span>} error={problem ?? fieldMessage(save.error, "title")}>
            {(aria) => <Input {...aria} value={value} maxLength={TITLE_MAX + 1} autoComplete="off" autoFocus onChange={(e) => setValue(e.target.value)} />}
          </Field>
          <div className="row">
            <Button variant="primary" size="sm" type="submit" disabled={save.isPending}>
              {save.isPending ? <Spinner /> : null}
              Save title
            </Button>
            <Button size="sm" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </form>
      ) : (
        <h1 style={{ overflowWrap: "anywhere" }}>{bug.title}</h1>
      )}
      {byline}
    </div>
  );
}

/** The Description heading with its Edit button, and the text or the editor. */
export function BugDescription({ bug, canEdit }: { bug: BugDetail; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(bug.description);
  const save = useBugUpdate(bug, "Description updated", () => setEditing(false));
  const tooLong = value.length > DESCRIPTION_MAX;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (save.isPending || tooLong) return;
    if (value === bug.description) return setEditing(false);
    save.mutate({ description: value });
  }

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
        <h2 style={{ margin: 0, fontSize: "var(--fs-lg)" }}>Description</h2>
        {canEdit && !editing ? (
          <Button variant="ghost" size="sm" aria-label="Edit description" onClick={() => { setValue(bug.description); setEditing(true); }}>Edit</Button>
        ) : null}
      </div>
      {editing ? (
        <form className="stack" style={{ marginTop: 8 }} onSubmit={submit} noValidate>
          <Field id="e-desc" label={<span className="sr-only">Description</span>}
            error={tooLong ? `Use ${DESCRIPTION_MAX.toLocaleString("en-US")} characters or fewer.` : fieldMessage(save.error, "description")}
            hint={`Plain text. ${value.length.toLocaleString("en-US")} of ${DESCRIPTION_MAX.toLocaleString("en-US")} characters.`}>
            {(aria) => <Textarea {...aria} value={value} autoFocus style={{ minHeight: 140 }} onChange={(e) => setValue(e.target.value)} />}
          </Field>
          <div className="row">
            <Button variant="primary" size="sm" type="submit" disabled={save.isPending || tooLong}>
              {save.isPending ? <Spinner /> : null}
              Save description
            </Button>
            <Button size="sm" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </form>
      ) : bug.description ? (
        <p style={{ marginTop: 8, whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{bug.description}</p>
      ) : (
        <p className="muted" style={{ marginTop: 8 }}>No description.</p>
      )}
    </>
  );
}

/** The Steps to reproduce heading with its Edit button, and the numbered list or the step editor (empty steps are dropped on save). */
export function BugSteps({ bug, canEdit }: { bug: BugDetail; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);
  const save = useBugUpdate(bug, "Steps updated", () => setEditing(false));
  const kept = steps.map((s) => s.trim()).filter(Boolean);
  const problem = kept.length > STEP_MAX ? `Use ${STEP_MAX} steps or fewer.`
    : kept.some((s) => s.length > STEP_LENGTH) ? `Each step can have up to ${STEP_LENGTH.toLocaleString("en-US")} characters.` : undefined;
  const same = kept.join("\n") === bug.steps_to_reproduce.join("\n") && kept.length === bug.steps_to_reproduce.length;

  function open() {
    setSteps(bug.steps_to_reproduce.length ? [...bug.steps_to_reproduce] : [""]);
    setEditing(true);
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    if (save.isPending || problem) return;
    if (same) return setEditing(false); // nothing changed: no request, no timeline entry
    save.mutate({ steps_to_reproduce: kept });
  }

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
        <h2 style={{ margin: 0, fontSize: "var(--fs-lg)" }}>Steps to reproduce</h2>
        {canEdit && !editing ? <Button variant="ghost" size="sm" aria-label="Edit steps to reproduce" onClick={open}>Edit</Button> : null}
      </div>
      {editing ? (
        <form className="stack" style={{ marginTop: 8 }} onSubmit={submit} noValidate>
          {steps.map((s, i) => (
            <div key={i} className="row" style={{ flexWrap: "nowrap" }}>
              <span className="mono muted" style={{ width: 20, textAlign: "right" }}>{i + 1}</span>
              <Input id={`e-step-${i + 1}`} aria-label={`Step ${i + 1}`} value={s} autoComplete="off" autoFocus={i === 0}
                onChange={(e) => setSteps(steps.map((x, j) => (j === i ? e.target.value : x)))} />
              <Button variant="ghost" size="icon" aria-label={`Remove step ${i + 1}`} onClick={() => setSteps(steps.filter((_, j) => j !== i))}>
                <IconTrash />
              </Button>
            </div>
          ))}
          <div className="row">
            <Button size="sm" disabled={steps.length >= STEP_MAX} onClick={() => setSteps([...steps, ""])}>
              <IconPlus />
              Add step
            </Button>
            <span className="hint">Up to {STEP_MAX} steps of {STEP_LENGTH.toLocaleString("en-US")} characters.</span>
          </div>
          {problem ?? fieldMessage(save.error, "steps_to_reproduce") ? <div className="err">{problem ?? fieldMessage(save.error, "steps_to_reproduce")}</div> : null}
          <div className="row">
            <Button variant="primary" size="sm" type="submit" disabled={save.isPending || !!problem}>
              {save.isPending ? <Spinner /> : null}
              Save steps
            </Button>
            <Button size="sm" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </form>
      ) : bug.steps_to_reproduce.length ? (
        <ol style={{ listStyle: "decimal", marginTop: 8 }}>{bug.steps_to_reproduce.map((s, i) => <li key={i} style={{ overflowWrap: "anywhere" }}>{s}</li>)}</ol>
      ) : (
        <p className="muted" style={{ marginTop: 8 }}>No steps recorded.</p>
      )}
    </>
  );
}

/** The Expected and actual heading with its Edit button, the two boxes or the two text areas (one request for both). */
export function BugResults({ bug, canEdit }: { bug: BugDetail; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [expected, setExpected] = useState(bug.expected_result);
  const [actual, setActual] = useState(bug.actual_result);
  const save = useBugUpdate(bug, "Results updated", () => setEditing(false));
  const expTooLong = expected.length > RESULT_MAX;
  const actTooLong = actual.length > RESULT_MAX;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (save.isPending || expTooLong || actTooLong) return;
    const changes: Changes = {};
    if (expected !== bug.expected_result) changes.expected_result = expected;
    if (actual !== bug.actual_result) changes.actual_result = actual;
    if (!Object.keys(changes).length) return setEditing(false); // nothing changed: no request, no timeline entry
    save.mutate(changes);
  }
  const hint = (v: string) => `Plain text. ${v.length.toLocaleString("en-US")} of ${RESULT_MAX.toLocaleString("en-US")} characters.`;

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
        <h2 style={{ margin: 0, fontSize: "var(--fs-lg)" }}>Expected and actual</h2>
        {canEdit && !editing ? (
          <Button variant="ghost" size="sm" aria-label="Edit expected and actual result"
            onClick={() => { setExpected(bug.expected_result); setActual(bug.actual_result); setEditing(true); }}>Edit</Button>
        ) : null}
      </div>
      {editing ? (
        <form className="stack" style={{ marginTop: 8 }} onSubmit={submit} noValidate>
          <div className="grid g2">
            <Field id="e-exp" label="Expected result" hint={hint(expected)}
              error={expTooLong ? `Use ${RESULT_MAX.toLocaleString("en-US")} characters or fewer.` : fieldMessage(save.error, "expected_result")}>
              {(aria) => <Textarea {...aria} value={expected} autoFocus onChange={(e) => setExpected(e.target.value)} />}
            </Field>
            <Field id="e-act" label="Actual result" hint={hint(actual)}
              error={actTooLong ? `Use ${RESULT_MAX.toLocaleString("en-US")} characters or fewer.` : fieldMessage(save.error, "actual_result")}>
              {(aria) => <Textarea {...aria} value={actual} onChange={(e) => setActual(e.target.value)} />}
            </Field>
          </div>
          <div className="row">
            <Button variant="primary" size="sm" type="submit" disabled={save.isPending || expTooLong || actTooLong}>
              {save.isPending ? <Spinner /> : null}
              Save results
            </Button>
            <Button size="sm" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </form>
      ) : (
        <div className="ea" style={{ marginTop: 8 }}>
          <div className="exp">
            <div className="ea-title">Expected</div>
            <span style={{ whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{bug.expected_result || <span className="muted">Not provided.</span>}</span>
          </div>
          <div className="act">
            <div className="ea-title">Actual</div>
            <span style={{ whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{bug.actual_result || <span className="muted">Not provided.</span>}</span>
          </div>
        </div>
      )}
    </>
  );
}

/** The Labels row of the Details panel: chips and an Edit button, or the toggle buttons of the New bug form. */
export function BugLabels({ bug, canEdit }: { bug: BugDetail; canEdit: boolean }) {
  const labels = useLabelOptions();
  const [editing, setEditing] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const save = useBugUpdate(bug, "Labels updated", () => setEditing(false));
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  if (editing) {
    const same = [...picked].sort().join() === bug.labels.map((l) => l.id).sort().join();
    return (
      <form className="stack" style={{ gap: 8 }} noValidate onSubmit={(e) => { e.preventDefault(); if (same) setEditing(false); else if (!save.isPending) save.mutate({ label_ids: picked }); }}>
        <div className="row" role="group" aria-label="Labels" style={{ gap: 6 }}>
          {(labels.data ?? []).map((l) => {
            const on = picked.includes(l.id);
            return (
              <Button key={l.id} size="sm" variant={on ? "primary" : "default"} aria-pressed={on} title={l.name}
                disabled={!on && picked.length >= LABEL_MAX}
                style={{ maxWidth: "100%", minWidth: 44, overflow: "hidden", textOverflow: "ellipsis" }} onClick={() => toggle(l.id)}>
                {l.name}
              </Button>
            );
          })}
          {labels.data && labels.data.length === 0 ? <span className="hint">No labels yet. A QA Lead or an Org Admin adds them in Settings.</span> : null}
        </div>
        {fieldMessage(save.error, "label_ids") ? <div className="err">{fieldMessage(save.error, "label_ids")}</div> : null}
        <div className="row">
          <Button variant="primary" size="sm" type="submit" disabled={save.isPending}>
            {save.isPending ? <Spinner /> : null}
            Save labels
          </Button>
          <Button size="sm" onClick={() => setEditing(false)}>Cancel</Button>
        </div>
      </form>
    );
  }
  return (
    <>
      {bug.labels.length ? (
        <span className="row" style={{ gap: 4, display: "inline-flex" }}>
          {bug.labels.map((l) => (
            <span key={l.id} className="label-chip" title={l.name} style={{ maxWidth: 160 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{l.name}</span>
            </span>
          ))}
        </span>
      ) : <span className="muted">None</span>}
      {canEdit ? (
        <>
          {" "}
          <Button variant="ghost" size="sm" aria-label="Edit labels" onClick={() => { setPicked(bug.labels.map((l) => l.id)); setEditing(true); }}>Edit</Button>
        </>
      ) : null}
    </>
  );
}
