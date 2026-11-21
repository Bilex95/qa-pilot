"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { Button, Spinner } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api, unwrap } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { useEnvironments } from "@/modules/bugs/hooks";
import { useOrg } from "@/modules/shell/org-context";

import { useProjectList, useSuites } from "../hooks";
import { RUN_NAME_MAX, RUN_NAME_MIN, type Run } from "../runs";

type Errors = Partial<Record<"name" | "project_id" | "suite_ids" | "environment_id", string>>;

/**
 * New test run (API-102, SCR-14). The prototype's fields plus a Project, because a run belongs to one project. The release field
 * arrives with the releases module (I-08). Every chosen suite adds all of its cases; the run copies them when it starts.
 */
export function NewRunDialog({ defaultProjectId, onClose, onCreated }: {
  defaultProjectId?: string;
  onClose: () => void;
  onCreated: (run: Run) => void;
}) {
  const org = useOrg();
  const qc = useQueryClient();
  const toast = useToast();
  const projects = useProjectList();
  const suites = useSuites();
  const [projectId, setProjectId] = useState(defaultProjectId ?? "");
  const [name, setName] = useState("");
  const [environmentId, setEnvironmentId] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const project = projectId || projects.data?.items[0]?.id || "";
  const environments = useEnvironments(project || undefined);
  const inProject = (suites.data?.items ?? []).filter((s) => s.project_id === project);
  const chosen = inProject.filter((s) => picked.includes(s.id));
  const caseCount = chosen.reduce((n, s) => n + s.case_count, 0);

  const create = useMutation({
    mutationFn: () =>
      unwrap(api.POST("/api/v1/orgs/{org_id}/test-runs", {
        params: { path: { org_id: org.id } },
        body: { project_id: project, name: name.trim(), environment_id: environmentId || null, suite_ids: chosen.map((s) => s.id), case_ids: [] },
      })),
    onSuccess: async (run) => {
      await qc.invalidateQueries({ queryKey: ["test-runs", org.id] });
      toast(`Run ${run.key} started`);
      onCreated(run);
    },
    onError: (err) => {
      const f = isApiError(err) ? err.fieldErrors() : {};
      if (Object.keys(f).length) setErrors({ name: f.name, project_id: f.project_id, suite_ids: f.suite_ids ?? f.case_ids, environment_id: f.environment_id });
      else toast("Could not start the run. Check your connection and try again.", "error");
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (create.isPending) return;
    const found: Errors = {};
    const trimmed = name.trim();
    if (trimmed.length < RUN_NAME_MIN) found.name = `Name must be at least ${RUN_NAME_MIN} characters.`;
    else if (trimmed.length > RUN_NAME_MAX) found.name = `Name must be ${RUN_NAME_MAX} characters or fewer.`;
    if (!project) found.project_id = "Choose a project.";
    if (caseCount === 0) found.suite_ids = "Choose at least one suite that has cases.";
    setErrors(found);
    if (Object.keys(found).length === 0) create.mutate();
  }

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <Dialog
      title="New test run"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="run-form" disabled={create.isPending}>
            {create.isPending ? <Spinner /> : null}
            Start run with {caseCount} {caseCount === 1 ? "case" : "cases"}
          </Button>
        </>
      }
    >
      <form id="run-form" className="modal-body stack" onSubmit={submit} noValidate>
        <Field id="nr-p" label="Project" error={errors.project_id}>
          {(aria) => (
            <Select {...aria} value={project} onChange={(e) => { setProjectId(e.target.value); setPicked([]); setEnvironmentId(""); }}>
              {(projects.data?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          )}
        </Field>
        <Field id="nr-n" label="Name" error={errors.name}>
          {(aria) => (
            <Input {...aria} value={name} maxLength={RUN_NAME_MAX + 1} autoComplete="off" placeholder="WEB 2.4.0 regression, round 2"
              onChange={(e) => { setName(e.target.value); if (errors.name) setErrors({ ...errors, name: undefined }); }} />
          )}
        </Field>
        <Field id="nr-e" label="Environment" error={errors.environment_id}>
          {(aria) => (
            <Select {...aria} value={environmentId} onChange={(e) => setEnvironmentId(e.target.value)}>
              <option value="">None</option>
              {(environments.data ?? []).map((env) => <option key={env.id} value={env.id}>{env.name}</option>)}
            </Select>
          )}
        </Field>
        <div className="field">
          <span className="label" id="nr-s-l">Suites to include</span>
          {inProject.length === 0 ? <p className="hint">{suites.isPending ? "Loading suites." : "This project has no suites yet."}</p> : null}
          {/* Toggle buttons like the labels of the New bug form: a 44 px target on touch screens, unlike a bare checkbox */}
          <div className="row" role="group" aria-labelledby="nr-s-l" aria-describedby={errors.suite_ids ? "nr-s-e" : undefined} style={{ gap: 6 }}>
            {inProject.map((s) => {
              const on = picked.includes(s.id);
              return (
                <Button key={s.id} size="sm" variant={on ? "primary" : "default"} aria-pressed={on} disabled={s.case_count === 0}
                  title={`${s.name}, ${s.case_count} ${s.case_count === 1 ? "case" : "cases"}`}
                  style={{ maxWidth: "100%", whiteSpace: "normal", height: "auto", textAlign: "left", overflowWrap: "anywhere" }} onClick={() => toggle(s.id)}>
                  {s.name} ({s.case_count} {s.case_count === 1 ? "case" : "cases"})
                </Button>
              );
            })}
          </div>
          {errors.suite_ids ? <div className="err" id="nr-s-e">{errors.suite_ids}</div> : null}
        </div>
      </form>
    </Dialog>
  );
}
