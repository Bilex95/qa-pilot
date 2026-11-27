"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { IconSuite, IconTrash } from "@/components/icons";
import { Button, Spinner } from "@/components/ui/button";
import { Banner, EmptyState, ErrorState, LoadingPanel } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api, unwrap } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { can } from "@/lib/permissions";
import { useAiEnabled, useOrg } from "@/modules/shell/org-context";

import { CaseGenerator } from "./components/case-generator";
import { DeleteCaseDialog } from "./components/delete-dialogs";
import { groupSuites } from "./components/suite-list";
import { StepEditor } from "./components/step-editor";
import { useProjectList, useSuites, useTestCase } from "./hooks";
import {
  CASE_TYPES, createBody, EMPTY_CASE, PRECONDITIONS_MAX, PRIORITIES, stepsBody, valuesFromCase, validateCase, parseTags,
  type CaseErrors, type CasePriority, type CaseType, type CaseValues, type Suite, type TestCaseFull,
} from "./schemas";

const FIELD_NAMES: Record<keyof CaseErrors, string> = {
  title: "title", suite_id: "suite", preconditions: "preconditions", steps: "steps", tags: "tags",
};

/**
 * SCR-13 Test case editor (API-096 to API-099; REQ-031). Org Admin, QA Lead and QA Engineer edit (case.manage); everyone else
 * reads the same screen with every field disabled. The AI Test Case Generator panel (I-17, API-144 and API-100) sits beside the form.
 * `caseRef` is a key like TC-103 or a UUID; without it the screen writes a new case (`?suite=` picks the suite).
 */
export function CaseEditorPage({ caseRef }: { caseRef?: string }) {
  const org = useOrg();
  const suites = useSuites();
  const projects = useProjectList();
  const existing = useTestCase(caseRef);
  const back = `/o/${encodeURIComponent(org.slug)}/tests`;

  if (caseRef) {
    if (existing.isPending || suites.isPending) return <><Header title="Test case" /><LoadingPanel rows={8} /></>;
    if (!existing.data) {
      if (isApiError(existing.error, "not_found")) {
        return (
          <>
            <Header title="Test case" />
            <EmptyState icon={IconSuite} title="This test case does not exist"
              action={<Link className="btn" href={back}>Back to test suites</Link>}>
              It may have been deleted, or the link is wrong.
            </EmptyState>
          </>
        );
      }
      return (
        <>
          <Header title="Test case" />
          <ErrorState what="this test case" onRetry={() => void existing.refetch()}
            requestId={isApiError(existing.error) ? existing.error.requestId : undefined} />
        </>
      );
    }
  } else if (suites.isPending) {
    return <><Header title="New test case" /><LoadingPanel rows={8} /></>;
  }
  if (!suites.data) {
    return (
      <>
        <Header title={caseRef ? "Test case" : "New test case"} />
        <ErrorState what="test suites" onRetry={() => void suites.refetch()}
          requestId={isApiError(suites.error) ? suites.error.requestId : undefined} />
      </>
    );
  }
  return <CaseForm key={existing.data?.id ?? "new"} existing={existing.data} suites={suites.data.items} projects={projects.data?.items ?? []} />;
}

function Header({ title }: { title: string }) {
  const org = useOrg();
  return (
    <>
      <div className="crumbs"><Link href={`/o/${encodeURIComponent(org.slug)}/tests`}>Test suites</Link> / {title}</div>
      <div className="page-head"><div className="grow"><h1>{title}</h1></div></div>
    </>
  );
}

function CaseForm({ existing, suites, projects }: { existing?: TestCaseFull; suites: Suite[]; projects: { id: string; name: string }[] }) {
  const org = useOrg();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const wanted = useSearchParams().get("suite");
  const aiOn = useAiEnabled();
  const editable = can(org.role, "case.manage");
  const groups = groupSuites(suites, projects);
  const firstSuite = groups[0]?.suites[0];
  const [values, setValues] = useState<CaseValues>(() =>
    existing ? valuesFromCase(existing) : { ...EMPTY_CASE, suite_id: suites.find((s) => s.id === wanted)?.id ?? firstSuite?.id ?? "" });
  const [errors, setErrors] = useState<CaseErrors>({});
  const [failed, setFailed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const set = (patch: Partial<CaseValues>) => setValues((v) => ({ ...v, ...patch }));
  const suiteOf = suites.find((s) => s.id === values.suite_id);
  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: ["test-cases", org.id] }),
    qc.invalidateQueries({ queryKey: ["test-suites", org.id] }),
    qc.invalidateQueries({ queryKey: ["test-case", org.id] }),
  ]);

  const save = useMutation({
    mutationFn: (v: CaseValues) =>
      existing
        ? unwrap(api.PATCH("/api/v1/orgs/{org_id}/test-cases/{case_id}", {
            params: { path: { org_id: org.id, case_id: existing.id } },
            body: {
              title: v.title.trim(), case_type: v.case_type, priority: v.priority, preconditions: v.preconditions,
              tags: parseTags(v.tags), steps: stepsBody(v.steps), ...(v.suite_id !== existing.suite_id ? { suite_id: v.suite_id } : {}),
            },
          }))
        : unwrap(api.POST("/api/v1/orgs/{org_id}/test-suites/{suite_id}/cases", {
            params: { path: { org_id: org.id, suite_id: v.suite_id } },
            body: createBody(v),
          })),
    onSuccess: async (saved) => {
      await refresh();
      toast(`Case ${saved.key} saved`);
      if (existing) setValues(valuesFromCase(saved)); // saved steps now have ids
      else router.replace(`/o/${encodeURIComponent(org.slug)}/tests/cases/${encodeURIComponent(saved.key)}`);
    },
    onError: (err) => {
      const f = isApiError(err) ? err.fieldErrors() : {};
      const next: CaseErrors = {};
      if (f.title) next.title = f.title;
      if (f.suite_id) next.suite_id = f.suite_id;
      if (f.preconditions) next.preconditions = f.preconditions;
      const stepMessage = f.steps ?? f.action ?? f.expected;
      if (stepMessage) next.steps = stepMessage;
      if (f.tags) next.tags = f.tags;
      if (Object.keys(next).length) {
        setErrors(next);
        setFailed(true);
      } else if (isApiError(err, "not_found")) {
        toast("This case no longer exists.", "error");
      } else toast("Could not save the case. Try again.", "error");
    },
  });

  const remove = useMutation({
    mutationFn: () =>
      unwrap(api.DELETE("/api/v1/orgs/{org_id}/test-cases/{case_id}", { params: { path: { org_id: org.id, case_id: (existing as TestCaseFull).id } } })),
    onSuccess: async () => {
      await refresh();
      toast(`Case ${existing?.key} deleted`);
      router.push(`/o/${encodeURIComponent(org.slug)}/tests?suite=${encodeURIComponent(String(existing?.suite_id))}`);
    },
    onError: (err) => {
      setDeleting(false);
      if (isApiError(err, "not_found")) toast("That case was already deleted.");
      else toast("Could not delete the case. Try again.", "error");
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!editable || save.isPending) return;
    const found = validateCase(values);
    setErrors(found);
    setFailed(Object.keys(found).length > 0);
    if (Object.keys(found).length === 0) save.mutate(values);
  }

  const errorCount = Object.keys(errors).length;
  const crumbTarget = `/o/${encodeURIComponent(org.slug)}/tests${suiteOf ? `?suite=${encodeURIComponent(suiteOf.id)}` : ""}`;
  // A saved case moves only inside its project (D-052); a new case can go into any suite
  const suiteGroups = existing ? groups.filter((g) => g.suites.some((s) => s.project_id === existing.project_id)) : groups;

  const form = (
    <form id="case-form" className="panel" onSubmit={submit} noValidate>
      <div className="panel-body stack">
        {failed && errorCount > 0 ? (
          <Banner kind="error">
            Fix {errorCount} {errorCount === 1 ? "field" : "fields"} before saving:{" "}
            {(Object.keys(errors) as (keyof CaseErrors)[]).map((k) => FIELD_NAMES[k]).join(", ")}.
          </Banner>
        ) : null}
        <Field id="c-title" label="Title" error={errors.title}>
          {(aria) => (
            <Input {...aria} value={values.title} disabled={!editable} placeholder="What the case checks" autoComplete="off"
              onChange={(e) => { set({ title: e.target.value }); if (errors.title) setErrors({ ...errors, title: undefined }); }} />
          )}
        </Field>
        <div className="grid g3">
          <Field id="c-suite" label="Suite" error={errors.suite_id}>
            {(aria) => (
              <Select {...aria} value={values.suite_id} disabled={!editable} onChange={(e) => set({ suite_id: e.target.value })}>
                {values.suite_id ? null : <option value="">Choose a suite</option>}
                {suiteGroups.map((g) => (
                  <optgroup key={g.key} label={g.name}>
                    {g.suites.filter((s) => !existing || s.project_id === existing.project_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </optgroup>
                ))}
              </Select>
            )}
          </Field>
          <Field id="c-type" label="Type">
            {(aria) => (
              <Select {...aria} value={values.case_type} disabled={!editable} onChange={(e) => set({ case_type: e.target.value as CaseType })}>
                {CASE_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </Select>
            )}
          </Field>
          <Field id="c-pri" label="Priority">
            {(aria) => (
              <Select {...aria} value={values.priority} disabled={!editable} onChange={(e) => set({ priority: e.target.value as CasePriority })}>
                {PRIORITIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </Select>
            )}
          </Field>
        </div>
        <Field id="c-pre" label="Preconditions" error={errors.preconditions}>
          {(aria) => (
            <Textarea {...aria} value={values.preconditions} disabled={!editable} maxLength={PRECONDITIONS_MAX + 1} placeholder="State the case needs before it starts"
              onChange={(e) => set({ preconditions: e.target.value })} />
          )}
        </Field>
        <StepEditor steps={values.steps} editable={editable} error={errors.steps} onChange={(steps) => set({ steps })} />
        <Field id="c-tags" label="Tags" error={errors.tags} hint={editable ? "Separate tags with commas. Up to 20 tags of 30 characters." : undefined}>
          {(aria) => (
            <Input {...aria} value={values.tags} disabled={!editable} autoComplete="off" placeholder="discounts, address"
              onChange={(e) => set({ tags: e.target.value })} />
          )}
        </Field>
      </div>
    </form>
  );

  return (
    <>
      <div className="crumbs"><Link href={crumbTarget}>Test suites</Link> / {existing ? existing.key : "New case"}</div>
      <div className="page-head">
        <div className="grow">
          <h1 style={{ overflowWrap: "anywhere" }}>
            {existing ? <><span className="mono muted" style={{ fontSize: 16 }}>{existing.key}</span> {existing.title}</> : "New test case"}
          </h1>
          <p>{existing ? `In suite ${suites.find((s) => s.id === existing.suite_id)?.name ?? ""}` : "Write the case with its steps and expected results."}</p>
        </div>
        {editable ? (
          <div className="actions">
            {existing ? (
              <Button variant="ghost" aria-label={`Delete case ${existing.key}`} onClick={() => setDeleting(true)}>
                <IconTrash />
                Delete case
              </Button>
            ) : null}
            <Button variant="primary" type="submit" form="case-form" disabled={save.isPending}>
              {save.isPending ? <Spinner /> : null}
              Save case
            </Button>
          </div>
        ) : null}
      </div>
      <div className="split">
        {form}
        <aside className="stack">
          {can(org.role, "ai.test_cases") && aiOn ? (
            <CaseGenerator projectId={suiteOf?.project_id} suiteId={values.suite_id} suiteName={suiteOf?.name ?? "the suite"}
              onEditFirst={existing ? undefined : (patch) => setValues((v) => ({ ...v, ...patch, steps: patch.steps ?? v.steps }))} />
          ) : !editable ? (
            <section className="panel panel-body small muted">Only QA roles can edit test cases.</section>
          ) : null}
        </aside>
      </div>
      {deleting && existing ? (
        <DeleteCaseDialog caseKey={existing.key} title={existing.title} pending={remove.isPending}
          onConfirm={() => remove.mutate()} onClose={() => setDeleting(false)} />
      ) : null}
    </>
  );
}
