"use client";

import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { Button, Spinner } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api, unwrap } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { useProjectList } from "@/modules/testing/hooks";
import { useOrg } from "@/modules/shell/org-context";

import { useRefreshReleases } from "../hooks";
import { DESCRIPTION_MAX, NAME_MAX, validateName, type Release } from "../releases";

type Errors = Partial<Record<"name" | "project_id" | "target_date" | "description", string>>;

/**
 * New release and Edit release (API-111, API-113). The prototype only shows a toast for New release, so the dialog follows the
 * other dialogs of the app. The project of an existing release cannot change, so Edit shows it as text.
 */
export function ReleaseDialog({ release, defaultProjectId, onClose, onSaved }: {
  release?: Release;
  defaultProjectId?: string;
  onClose: () => void;
  onSaved: (release: Release) => void;
}) {
  const org = useOrg();
  const toast = useToast();
  const refresh = useRefreshReleases();
  const projects = useProjectList();
  const editing = !!release;
  const [name, setName] = useState(release?.name ?? "");
  const [projectId, setProjectId] = useState(release?.project_id ?? defaultProjectId ?? "");
  const [targetDate, setTargetDate] = useState(release?.target_date ?? "");
  const [description, setDescription] = useState(release?.description ?? "");
  const [errors, setErrors] = useState<Errors>({});
  const project = projectId || projects.data?.items[0]?.id || "";

  const save = useMutation({
    mutationFn: () => {
      const common = { name: name.trim(), description: description.trim(), target_date: targetDate || null };
      return editing
        ? unwrap(api.PATCH("/api/v1/orgs/{org_id}/releases/{release_id}", { params: { path: { org_id: org.id, release_id: release.id } }, body: common }))
        : unwrap(api.POST("/api/v1/orgs/{org_id}/releases", { params: { path: { org_id: org.id } }, body: { project_id: project, ...common } }));
    },
    onSuccess: (saved) => {
      refresh();
      toast(editing ? `${saved.name} saved` : `${saved.name} planned`);
      onSaved(saved);
    },
    onError: (err) => {
      if (isApiError(err, "name_taken")) setErrors({ name: err.message });
      else if (isApiError(err) && Object.keys(err.fieldErrors()).length) {
        const f = err.fieldErrors();
        setErrors({ name: f.name, project_id: f.project_id, target_date: f.target_date, description: f.description });
      } else toast("Could not save the release. Check your connection and try again.", "error");
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (save.isPending) return;
    const found: Errors = {};
    const bad = validateName(name);
    if (bad) found.name = bad;
    if (!editing && !project) found.project_id = "Choose a project.";
    if (description.length > DESCRIPTION_MAX) found.description = `Use ${DESCRIPTION_MAX} characters or fewer.`;
    setErrors(found);
    if (Object.keys(found).length === 0) save.mutate();
  }

  const projectName = projects.data?.items.find((p) => p.id === release?.project_id)?.name;

  return (
    <Dialog
      title={editing ? "Edit release" : "New release"}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="release-form" disabled={save.isPending}>
            {save.isPending ? <Spinner /> : null}
            {editing ? "Save release" : "Plan release"}
          </Button>
        </>
      }
    >
      <form id="release-form" className="modal-body stack" onSubmit={submit} noValidate>
        {editing ? (
          <div className="field">
            <span className="label">Project</span>
            <span className="small" style={{ overflowWrap: "anywhere" }}>{projectName ?? "Archived project"}</span>
          </div>
        ) : (
          <Field id="rl-p" label="Project" error={errors.project_id}>
            {(aria) => (
              <Select {...aria} value={project} onChange={(e) => setProjectId(e.target.value)}>
                {(projects.data?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            )}
          </Field>
        )}
        <Field id="rl-n" label="Name" error={errors.name} hint={`The version, for example WEB 2.4.0. Up to ${NAME_MAX} characters, unique in the project.`}>
          {(aria) => (
            <Input {...aria} value={name} maxLength={NAME_MAX + 1} autoComplete="off" placeholder="WEB 2.4.0"
              onChange={(e) => { setName(e.target.value); if (errors.name) setErrors({ ...errors, name: undefined }); }} />
          )}
        </Field>
        <Field id="rl-t" label="Target date" error={errors.target_date}>
          {(aria) => <Input {...aria} type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />}
        </Field>
        <Field id="rl-d" label="Description" error={errors.description}>
          {(aria) => (
            <Textarea {...aria} value={description} maxLength={DESCRIPTION_MAX + 1} placeholder="What ships in this release"
              onChange={(e) => setDescription(e.target.value)} />
          )}
        </Field>
      </form>
    </Dialog>
  );
}
