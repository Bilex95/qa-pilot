"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { Button, Spinner } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api, unwrap } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { useOrg } from "@/modules/shell/org-context";

import { useProjectComponents, useProjectList } from "../hooks";
import { SUITE_DESCRIPTION_MAX, SUITE_NAME_MAX, suiteNameSchema, type Suite } from "../schemas";

type Errors = Partial<Record<"name" | "description" | "project_id" | "component_id", string>>;

/**
 * New suite and Edit suite (API-091, API-093). The prototype only shows a toast for New suite, so the dialog follows the
 * other dialogs of the app. The project of an existing suite cannot change, so Edit shows it as text.
 */
export function SuiteDialog({ suite, defaultProjectId, onClose, onSaved }: {
  suite?: Suite;
  defaultProjectId?: string;
  onClose: () => void;
  onSaved: (suite: Suite) => void;
}) {
  const org = useOrg();
  const qc = useQueryClient();
  const toast = useToast();
  const projects = useProjectList();
  const [name, setName] = useState(suite?.name ?? "");
  const [description, setDescription] = useState(suite?.description ?? "");
  const [projectId, setProjectId] = useState(suite?.project_id ?? defaultProjectId ?? "");
  const [componentId, setComponentId] = useState(suite?.component_id ?? "");
  const [errors, setErrors] = useState<Errors>({});
  const effectiveProject = projectId || projects.data?.items[0]?.id || "";
  const components = useProjectComponents(effectiveProject || undefined);
  const editing = !!suite;

  const save = useMutation({
    mutationFn: () => {
      const component_id = componentId || null;
      return editing
        ? unwrap(api.PATCH("/api/v1/orgs/{org_id}/test-suites/{suite_id}", {
            params: { path: { org_id: org.id, suite_id: suite.id } },
            body: { name: name.trim(), description: description.trim(), component_id },
          }))
        : unwrap(api.POST("/api/v1/orgs/{org_id}/test-suites", {
            params: { path: { org_id: org.id } },
            body: { project_id: effectiveProject, name: name.trim(), description: description.trim(), component_id },
          }));
    },
    onSuccess: async (saved) => {
      await qc.invalidateQueries({ queryKey: ["test-suites", org.id] });
      toast(editing ? `Suite "${saved.name}" saved` : `Suite "${saved.name}" created`);
      onSaved(saved);
    },
    onError: (err) => {
      if (isApiError(err, "name_taken")) setErrors({ name: err.message });
      else if (isApiError(err) && Object.keys(err.fieldErrors()).length) {
        const f = err.fieldErrors();
        setErrors({ name: f.name, description: f.description, project_id: f.project_id, component_id: f.component_id });
      } else setErrors({ name: "Could not save the suite. Try again." });
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (save.isPending) return;
    const parsed = suiteNameSchema.safeParse(name);
    const found: Errors = {};
    if (!parsed.success) found.name = parsed.error.issues[0]?.message;
    if (!editing && !effectiveProject) found.project_id = "Choose a project.";
    if (description.length > SUITE_DESCRIPTION_MAX) found.description = `Use ${SUITE_DESCRIPTION_MAX} characters or fewer.`;
    setErrors(found);
    if (Object.keys(found).length === 0) save.mutate();
  }

  const projectName = projects.data?.items.find((p) => p.id === suite?.project_id)?.name;

  return (
    <Dialog
      title={editing ? "Edit suite" : "New suite"}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="suite-form" disabled={save.isPending}>
            {save.isPending ? <Spinner /> : null}
            {editing ? "Save suite" : "Create suite"}
          </Button>
        </>
      }
    >
      <form id="suite-form" className="modal-body stack" onSubmit={submit} noValidate>
        <Field id="suite-name" label="Name" error={errors.name} hint={`Up to ${SUITE_NAME_MAX} characters. Unique in the project, not case sensitive.`}>
          {(aria) => (
            <Input {...aria} value={name} maxLength={SUITE_NAME_MAX} autoComplete="off" placeholder="Checkout"
              onChange={(e) => { setName(e.target.value); if (errors.name) setErrors({ ...errors, name: undefined }); }} />
          )}
        </Field>
        {editing ? (
          <div className="field">
            <span className="label">Project</span>
            <span className="small" style={{ overflowWrap: "anywhere" }}>{projectName ?? "Archived project"}</span>
          </div>
        ) : (
          <Field id="suite-project" label="Project" error={errors.project_id}>
            {(aria) => (
              <Select {...aria} value={effectiveProject} onChange={(e) => { setProjectId(e.target.value); setComponentId(""); }}>
                {(projects.data?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            )}
          </Field>
        )}
        <Field id="suite-component" label="Component" error={errors.component_id}>
          {(aria) => (
            <Select {...aria} value={componentId} onChange={(e) => setComponentId(e.target.value)}>
              <option value="">None</option>
              {(components.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          )}
        </Field>
        <Field id="suite-description" label="Description" error={errors.description}>
          {(aria) => (
            <Textarea {...aria} value={description} maxLength={SUITE_DESCRIPTION_MAX + 1} placeholder="What this suite covers"
              onChange={(e) => setDescription(e.target.value)} />
          )}
        </Field>
      </form>
    </Dialog>
  );
}
