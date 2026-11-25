"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import { IconLock, IconPlus } from "@/components/icons";
import { Button, Spinner } from "@/components/ui/button";
import { Banner, EmptyState } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api, unwrap } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { can } from "@/lib/permissions";
import { useSession } from "@/lib/session/session-provider";
import { AiBugWriter } from "@/modules/ai/components/ai-bug-writer";
import { DuplicatesBox } from "@/modules/ai/components/duplicates-box";
import { useAiEnabled, useOrg } from "@/modules/shell/org-context";

import { useComponents, useEnvironments, useLabelOptions, useMemberOptions, useProjects } from "./hooks";
import {
  buildCreateBody, EMPTY_BUG, LABEL_MAX, PRIORITY_OPTIONS, RESULT_MAX, SEVERITY_OPTIONS, STEP_MAX, validateNewBug,
  type FieldErrors, type NewBugValues, type Priority, type Severity,
} from "./schemas";

const FIELD_NAMES: Record<keyof FieldErrors, string> = {
  project_id: "project", title: "title", steps: "steps", expected_result: "expected result", actual_result: "actual result",
};

/**
 * SCR-11 New bug (API-061; REQ-017, D-032). With the AI Bug Writer beside the form and the duplicate warning under the title (I-15, D-071)
 * when AI is on for the workspace. Developers see severity and priority disabled and the request leaves them out entirely.
 */
export function NewBugPage() {
  const org = useOrg();
  const { me } = useSession();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const projects = useProjects();
  const members = useMemberOptions();
  const labels = useLabelOptions();
  const [values, setValues] = useState<NewBugValues>(EMPTY_BUG);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failed, setFailed] = useState(false);
  const set = (patch: Partial<NewBugValues>) => setValues((v) => ({ ...v, ...patch }));

  const projectId = values.project_id || projects.data?.items[0]?.id || "";
  const components = useComponents(projectId || undefined);
  const environments = useEnvironments(projectId || undefined);
  const canCreate = can(org.role, "bug.create");
  const setsSeverity = can(org.role, "bug.set_severity_priority");
  const aiOn = useAiEnabled();
  const titleRef = useRef<HTMLInputElement>(null);
  const [aiAssisted, setAiAssisted] = useState(false);

  // A bug drafted from a failed step of a test run (API-106): the form is filled once the draft arrives, nothing is saved until Save bug
  const params = useSearchParams();
  const fromRun = params.get("from_run");
  const fromResult = params.get("result");
  const draft = useQuery({
    queryKey: ["bug-draft", org.id, fromRun, fromResult],
    enabled: !!fromRun && !!fromResult && can(org.role, "run.bug_from_failure"),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: () =>
      unwrap(api.GET("/api/v1/orgs/{org_id}/test-runs/{run_id}/results/{result_id}/bug-draft", {
        params: { path: { org_id: org.id, run_id: fromRun as string, result_id: fromResult as string } },
      })),
  });
  const [prefilled, setPrefilled] = useState<string | null>(null);
  if (draft.data && prefilled !== draft.data.source_run_result_id) { // fill the form once when the draft arrives (state set while rendering)
    const d = draft.data;
    setPrefilled(d.source_run_result_id);
    setValues((v) => ({
      ...v, project_id: d.project_id, component_id: d.component_id ?? "", title: d.title,
      steps: d.steps_to_reproduce.length ? d.steps_to_reproduce : [""], expected_result: d.expected_result, actual_result: d.actual_result,
      environment_id: d.environment_id ?? "",
    }));
  }
  const source = draft.data ? { resultId: draft.data.source_run_result_id, releaseId: draft.data.release_id } : undefined;

  const create = useMutation({
    mutationFn: (v: NewBugValues) =>
      unwrap(api.POST("/api/v1/orgs/{org_id}/bugs", {
        params: { path: { org_id: org.id } }, body: { ...buildCreateBody(org.role, v, source), ai_assisted: aiAssisted },
      })),
    onSuccess: async (bug) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["bugs", org.id] }),
        qc.invalidateQueries({ queryKey: ["projects", org.id] }),
        qc.invalidateQueries({ queryKey: ["labels", org.id] }),
        qc.invalidateQueries({ queryKey: ["test-run", org.id] }),
      ]);
      toast(`Bug ${bug.key} reported`);
      router.push(source ? `/o/${org.slug}/bugs/${bug.key}` : `/o/${org.slug}/bugs`); // a bug from a run opens, to show its link back
    },
    onError: (err) => {
      const fields = isApiError(err) ? err.fieldErrors() : {};
      const next: FieldErrors = {};
      if (fields.project_id) next.project_id = fields.project_id;
      if (fields.title) next.title = fields.title;
      if (fields.steps_to_reproduce) next.steps = fields.steps_to_reproduce;
      if (fields.expected_result) next.expected_result = fields.expected_result;
      if (fields.actual_result) next.actual_result = fields.actual_result;
      if (Object.keys(next).length) {
        setErrors(next);
        setFailed(true);
      } else {
        toast("Could not save the bug. Try again.", "error");
      }
    },
  });

  if (!canCreate) {
    return (
      <>
        <Crumbs />
        <div className="page-head"><div className="grow"><h1>Report a bug</h1></div></div>
        <EmptyState icon={IconLock} title="Viewers cannot report bugs"
          action={<Link className="btn" href={`/o/${org.slug}/bugs`}>Back to bugs</Link>}>
          Ask a QA engineer or lead to report it, or comment on an existing bug.
        </EmptyState>
      </>
    );
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (create.isPending) return;
    const current = { ...values, project_id: projectId };
    const found = validateNewBug(current);
    setErrors(found);
    setFailed(Object.keys(found).length > 0);
    if (Object.keys(found).length === 0) create.mutate(current);
  }

  const errorCount = Object.keys(errors).length;
  const assignable = (members.data?.items ?? []).filter((m) => m.role !== "viewer");
  const toggleLabel = (id: string) =>
    set({ label_ids: values.label_ids.includes(id) ? values.label_ids.filter((x) => x !== id) : [...values.label_ids, id] });

  return (
    <>
      <Crumbs />
      <div className="page-head">
        <div className="grow">
          <h1>Report a bug</h1>
          <p>{aiOn ? "Write it yourself, or paste rough notes and let the AI Bug Writer draft it." : "Write what went wrong and how to see it. Saved bugs start as New."}</p>
        </div>
      </div>
      {projects.data && projects.data.items.length === 0 ? (
        <EmptyState icon={IconPlus} title="No projects yet"
          action={<Link className="btn" href={`/o/${org.slug}/projects`}>Go to projects</Link>}>
          A bug belongs to a project. Ask a QA Lead or an Org Admin to create one.
        </EmptyState>
      ) : (
        <div className="split">
        <form className="panel" style={aiOn ? undefined : { maxWidth: 860 }} onSubmit={submit} noValidate>
          <div className="panel-body stack">
            {draft.data ? (
              <Banner kind="info">
                Prefilled from a failed step of <b>{draft.data.case_key}</b> in run{" "}
                <Link href={`/o/${org.slug}/runs/${draft.data.run_key}`}>{draft.data.run_key}</Link>. Review before saving. The bug will link back to the run.
              </Banner>
            ) : draft.isError ? (
              <Banner kind="warn">
                {isApiError(draft.error, "result_not_failed") ? "That result is not failed any more, so there is nothing to prefill."
                  : "The failed step could not be loaded, so the form is empty."} You can still report the bug.
              </Banner>
            ) : null}
            {failed && errorCount > 0 ? (
              <Banner kind="error">
                Fix {errorCount} {errorCount === 1 ? "field" : "fields"} before saving:{" "}
                {(Object.keys(errors) as (keyof FieldErrors)[]).map((k) => FIELD_NAMES[k]).join(", ")}.
              </Banner>
            ) : null}
            <div className="grid g2">
              <Field id="n-proj" label="Project" error={errors.project_id}>
                {(aria) => (
                  <Select {...aria} value={projectId} onChange={(e) => set({ project_id: e.target.value, component_id: "", environment_id: "" })}>
                    {projectId ? null : <option value="">Choose a project</option>}
                    {(projects.data?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                )}
              </Field>
              <Field id="n-comp" label="Component">
                {(aria) => (
                  <Select {...aria} value={values.component_id} onChange={(e) => set({ component_id: e.target.value })}>
                    <option value="">None</option>
                    {(components.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                )}
              </Field>
            </div>
            <Field id="n-title" label="Title" error={errors.title}>
              {(aria) => (
                <Input {...aria} ref={titleRef} value={values.title} placeholder="What is wrong, where" autoComplete="off"
                  onChange={(e) => { set({ title: e.target.value }); if (errors.title) setErrors({ ...errors, title: undefined }); }} />
              )}
            </Field>
            <DuplicatesBox projectId={projectId} projectName={(projects.data?.items ?? []).find((p) => p.id === projectId)?.name ?? "this project"}
              title={values.title} actualResult={values.actual_result} />
            <div className="field">
              <label htmlFor="n-step-1">Steps to reproduce</label>
              <div className="stack" style={{ gap: 8 }}>
                {values.steps.map((s, i) => (
                  <div key={i} className="row" style={{ flexWrap: "nowrap" }}>
                    <span className="mono muted" style={{ width: 20, textAlign: "right" }}>{i + 1}</span>
                    <Input id={`n-step-${i + 1}`} aria-label={`Step ${i + 1}`} value={s} autoComplete="off"
                      onChange={(e) => set({ steps: values.steps.map((x, j) => (j === i ? e.target.value : x)) })} />
                  </div>
                ))}
                <div>
                  <Button size="sm" disabled={values.steps.length >= STEP_MAX} onClick={() => set({ steps: [...values.steps, ""] })}>
                    <IconPlus />
                    Add step
                  </Button>
                </div>
              </div>
              {errors.steps ? <div className="err">{errors.steps}</div> : null}
            </div>
            <div className="grid g2">
              <Field id="n-exp" label="Expected result" error={errors.expected_result}>
                {(aria) => <Textarea {...aria} value={values.expected_result} maxLength={RESULT_MAX + 1}
                  onChange={(e) => set({ expected_result: e.target.value })} />}
              </Field>
              <Field id="n-act" label="Actual result" error={errors.actual_result}>
                {(aria) => <Textarea {...aria} value={values.actual_result} maxLength={RESULT_MAX + 1}
                  onChange={(e) => set({ actual_result: e.target.value })} />}
              </Field>
            </div>
            <div className="grid g3">
              <div className="field">
                <label htmlFor="n-sev">Severity</label>
                <Select id="n-sev" value={setsSeverity ? values.severity : "medium"} disabled={!setsSeverity}
                  aria-describedby={setsSeverity ? undefined : "dev-note"} onChange={(e) => set({ severity: e.target.value as Severity })}>
                  {SEVERITY_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </Select>
              </div>
              <div className="field">
                <label htmlFor="n-pri">Priority</label>
                <Select id="n-pri" value={setsSeverity ? values.priority : "p3"} disabled={!setsSeverity}
                  aria-describedby={setsSeverity ? undefined : "dev-note"} onChange={(e) => set({ priority: e.target.value as Priority })}>
                  {PRIORITY_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </Select>
              </div>
              <div className="field">
                <label htmlFor="n-env">Environment</label>
                <Select id="n-env" value={values.environment_id} onChange={(e) => set({ environment_id: e.target.value })}>
                  <option value="">None</option>
                  {(environments.data ?? []).map((env) => <option key={env.id} value={env.id}>{env.name}</option>)}
                </Select>
              </div>
            </div>
            {setsSeverity ? null : (
              <p className="hint" id="dev-note">Developers report bugs as Medium and P3. A QA engineer or lead sets severity and priority at triage.</p>
            )}
            <div className="grid g2">
              <div className="field">
                <label htmlFor="n-asg">Assignee</label>
                <Select id="n-asg" value={values.assignee_id} onChange={(e) => set({ assignee_id: e.target.value })}>
                  <option value="">Unassigned</option>
                  {org.role !== "developer"
                    ? assignable.map((m) => <option key={m.user.id} value={m.user.id}>{m.user.full_name}</option>)
                    : me ? <option value={me.user.id}>Me ({me.user.full_name})</option> : null}
                </Select>
              </div>
              <div className="field">
                <span className="label" id="n-lab-l">Labels</span>
                <div className="row" role="group" aria-labelledby="n-lab-l" id="n-lab" style={{ gap: 6 }}>
                  {(labels.data ?? []).map((l) => {
                    const on = values.label_ids.includes(l.id);
                    return (
                      <Button key={l.id} size="sm" variant={on ? "primary" : "default"} aria-pressed={on} title={l.name}
                        disabled={!on && values.label_ids.length >= LABEL_MAX}
                        style={{ maxWidth: "100%", minWidth: 44, overflow: "hidden", textOverflow: "ellipsis" }} onClick={() => toggleLabel(l.id)}>
                        {l.name}
                      </Button>
                    );
                  })}
                  {labels.data && labels.data.length === 0 ? <span className="hint">No labels yet. A QA Lead or an Org Admin adds them in Settings.</span> : null}
                </div>
              </div>
            </div>
            <div className="row">
              <Button variant="primary" type="submit" disabled={create.isPending || (draft.isPending && draft.fetchStatus !== "idle")}>
                {create.isPending ? <Spinner /> : null}
                Save bug
              </Button>
              <Link className="btn ghost" href={`/o/${org.slug}/bugs`}>Cancel</Link>
            </div>
          </div>
        </form>
        {aiOn ? (
          <aside className="stack">
            <AiBugWriter projectId={projectId} values={{ ...values, project_id: projectId }} setsSeverity={setsSeverity}
              onFill={(patch) => set(patch)} onRestore={(previous) => setValues(previous)} onAssist={setAiAssisted} onFocusTitle={() => titleRef.current?.focus()}
              onActual={(text) => set({ actual_result: [values.actual_result.trim(), text].filter(Boolean).join("\n\n").slice(0, RESULT_MAX) })} />
          </aside>
        ) : null}
        </div>
      )}
    </>
  );
}

function Crumbs() {
  const org = useOrg();
  return (
    <div className="crumbs">
      <Link href={`/o/${org.slug}/bugs`}>Bugs</Link> / New
    </div>
  );
}
