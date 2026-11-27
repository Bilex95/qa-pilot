"use client";

import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { DANGER_FILL, Button, Spinner } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api, unwrap } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { useOrg } from "@/modules/shell/org-context";

import { useRefreshProjects } from "../hooks";
import { DESCRIPTION_MAX, KEY_MAX, NAME_MAX, suggestKey, validateProjectKey, validateProjectName, type Project } from "../projects";

type Errors = Partial<Record<"name" | "key" | "description", string>>;

/**
 * New project (API-041) and Edit project (API-043). The key cannot change once the project exists (it is in every bug id), so Edit shows
 * it as text. Edit also archives the project after a confirmation: an archived project leaves the pickers, its bugs and tests stay readable.
 */
export function ProjectDialog({ project, onClose, onSaved, onArchived }: {
  project?: Project;
  onClose: () => void;
  onSaved: (project: Project) => void;
  onArchived?: () => void;
}) {
  const org = useOrg();
  const toast = useToast();
  const refresh = useRefreshProjects();
  const editing = !!project;
  const [name, setName] = useState(project?.name ?? "");
  const [key, setKey] = useState(project?.key ?? "");
  const [keyTouched, setKeyTouched] = useState(false);
  const [description, setDescription] = useState(project?.description ?? "");
  const [errors, setErrors] = useState<Errors>({});
  const [confirmArchive, setConfirmArchive] = useState(false);

  const save = useMutation({
    mutationFn: () => {
      const common = { name: name.trim(), description: description.trim() };
      return editing
        ? unwrap(api.PATCH("/api/v1/orgs/{org_id}/projects/{project_id}", { params: { path: { org_id: org.id, project_id: project.id } }, body: common }))
        : unwrap(api.POST("/api/v1/orgs/{org_id}/projects", { params: { path: { org_id: org.id } }, body: { ...common, key: key.trim().toUpperCase() } }));
    },
    onSuccess: (saved) => {
      refresh();
      toast(editing ? `${saved.name} saved` : `${saved.name} created`);
      onSaved(saved);
    },
    onError: (err) => {
      if (isApiError(err, "key_taken")) setErrors({ key: err.message });
      else if (isApiError(err) && Object.keys(err.fieldErrors()).length) {
        const f = err.fieldErrors();
        setErrors({ name: f.name, key: f.key, description: f.description });
      } else toast("Could not save the project. Check your connection and try again.", "error");
    },
  });

  const archive = useMutation({
    mutationFn: () => unwrap(api.PATCH("/api/v1/orgs/{org_id}/projects/{project_id}", {
      params: { path: { org_id: org.id, project_id: (project as Project).id } }, body: { archived: true } })),
    onSuccess: () => {
      refresh();
      toast(`${project?.name} archived`);
      onArchived?.();
    },
    onError: () => {
      setConfirmArchive(false);
      toast("Could not archive the project. Check your connection and try again.", "error");
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (save.isPending) return;
    const found: Errors = {};
    const badName = validateProjectName(name);
    if (badName) found.name = badName;
    if (!editing) {
      const badKey = validateProjectKey(key);
      if (badKey) found.key = badKey;
    }
    if (description.length > DESCRIPTION_MAX) found.description = `Use ${DESCRIPTION_MAX} characters or fewer.`;
    setErrors(found);
    if (Object.keys(found).length === 0) save.mutate();
  }

  if (confirmArchive && project) {
    return (
      <Dialog
        title={`Archive ${project.name}?`}
        onClose={onClose}
        footer={
          <>
            <Button onClick={() => setConfirmArchive(false)}>Cancel</Button>
            <Button variant="primary" style={DANGER_FILL} disabled={archive.isPending} onClick={() => archive.mutate()}>
              {archive.isPending ? <Spinner /> : null}
              Archive project
            </Button>
          </>
        }
      >
        <div className="modal-body">
          <p className="small">
            {project.key} leaves the project pickers and takes no new bugs, runs or releases. Its {project.open_bug_count} open{" "}
            {project.open_bug_count === 1 ? "bug" : "bugs"} and its tests stay readable. Archiving again later changes nothing.
          </p>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      title={editing ? "Edit project" : "New project"}
      onClose={onClose}
      footer={
        <>
          {editing ? (
            <Button variant="ghost" onClick={() => setConfirmArchive(true)} style={{ marginRight: "auto" }}>Archive project</Button>
          ) : null}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="project-form" disabled={save.isPending}>
            {save.isPending ? <Spinner /> : null}
            {editing ? "Save project" : "Create project"}
          </Button>
        </>
      }
    >
      <form id="project-form" className="modal-body stack" onSubmit={submit} noValidate>
        <Field id="np-n" label="Name" error={errors.name}>
          {(aria) => (
            <Input {...aria} value={name} maxLength={NAME_MAX + 1} autoComplete="off" placeholder="Warehouse scanner"
              onChange={(e) => {
                setName(e.target.value);
                if (!editing && !keyTouched) setKey(suggestKey(e.target.value));
                if (errors.name) setErrors({ ...errors, name: undefined });
              }} />
          )}
        </Field>
        {editing ? (
          <div className="field">
            <span className="label">Key</span>
            <span className="mono">{project.key}</span>
            <div className="hint">The key is part of every bug id and cannot change.</div>
          </div>
        ) : (
          <Field id="np-k" label="Key" error={errors.key} hint={`2 to ${KEY_MAX} letters. Used in bug ids like WHS-1.`}>
            {(aria) => (
              <Input {...aria} className="mono" value={key} maxLength={KEY_MAX} autoComplete="off" placeholder="WHS"
                onChange={(e) => { setKey(e.target.value.toUpperCase()); setKeyTouched(true); if (errors.key) setErrors({ ...errors, key: undefined }); }} />
            )}
          </Field>
        )}
        <Field id="np-d" label="Description" error={errors.description}>
          {(aria) => (
            <Textarea {...aria} value={description} maxLength={DESCRIPTION_MAX + 1} placeholder="What this project covers"
              onChange={(e) => setDescription(e.target.value)} />
          )}
        </Field>
        {editing ? null : <p className="hint">Environments dev, staging and prod are added for you.</p>}
      </form>
    </Dialog>
  );
}
