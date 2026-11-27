"use client";

import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { IconPlus, IconTrash } from "@/components/icons";
import { DANGER_FILL, Button, Spinner } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api, unwrap } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { useOrg } from "@/modules/shell/org-context";

import { useRefreshProjects } from "../hooks";
import { COMPONENT_DESCRIPTION_MAX, COMPONENT_NAME_MAX, ENVIRONMENT_NAME_MAX, type Component, type Environment, type ProjectDetail } from "../projects";

type Row = { id: string; name: string; description?: string; detail: string };

/**
 * One list that adds, renames and deletes named things of a project: the Components and the Environments dialogs differ only in their
 * words, their fields and their API calls. The rows are the live data of the page behind the dialog (it refreshes after every change).
 */
function ManageList({ title, noun, rows, withDescription, nameMax, onAdd, onSave, onRemove, onClose, deleteNote }: {
  title: string;
  noun: string;
  rows: Row[];
  withDescription: boolean;
  nameMax: number;
  onAdd: (name: string, description: string) => Promise<void>;
  onSave: (id: string, name: string, description: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onClose: () => void;
  deleteNote: (row: Row) => string;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [problem, setProblem] = useState<string | undefined>();
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editProblem, setEditProblem] = useState<string | undefined>();
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(job: () => Promise<void>, fail: (message: string) => void, done: () => void) {
    if (busy) return;
    setBusy(true);
    try {
      await job();
      done();
    } catch (err) {
      fail(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function add(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return setProblem(`Enter a ${noun} name.`);
    if (n.length > nameMax) return setProblem(`Use ${nameMax} characters or fewer.`);
    void run(() => onAdd(n, description.trim()), setProblem, () => { setName(""); setDescription(""); setProblem(undefined); });
  }
  function saveEdit(e: FormEvent) {
    e.preventDefault();
    const n = editName.trim();
    if (!n) return setEditProblem(`Enter a ${noun} name.`);
    if (n.length > nameMax) return setEditProblem(`Use ${nameMax} characters or fewer.`);
    void run(() => onSave(editId as string, n, editDescription.trim()), setEditProblem, () => setEditId(null));
  }

  return (
    <Dialog title={title} onClose={onClose} footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <div className="modal-body stack">
        <form className="stack" style={{ gap: 8 }} onSubmit={add} noValidate>
          <Field id="mg-n" label={`Add a ${noun}`} error={problem}>
            {(aria) => (
              <Input {...aria} value={name} maxLength={nameMax + 1} autoComplete="off" placeholder={noun === "component" ? "Checkout" : "staging"}
                onChange={(e) => { setName(e.target.value); setProblem(undefined); }} />
            )}
          </Field>
          {withDescription ? (
            <Field id="mg-d" label={<span className="sr-only">Description</span>}>
              {(aria) => (
                <Input {...aria} value={description} maxLength={COMPONENT_DESCRIPTION_MAX} autoComplete="off" placeholder="What it covers (optional)"
                  onChange={(e) => setDescription(e.target.value)} />
              )}
            </Field>
          ) : null}
          <div>
            <Button variant="primary" size="sm" type="submit" disabled={busy}>
              {busy && editId === null && removeId === null ? <Spinner /> : <IconPlus />}
              Add {noun}
            </Button>
          </div>
        </form>
        {rows.length === 0 ? <p className="small muted">No {noun}s yet.</p> : (
          <ul className="stack" style={{ gap: 0, listStyle: "none", margin: 0, padding: 0 }} aria-label={`${title} of the project`}>
            {rows.map((row) => (
              <li key={row.id} style={{ borderTop: "1px solid var(--line)", padding: "8px 0" }}>
                {editId === row.id ? (
                  <form className="stack" style={{ gap: 8 }} onSubmit={saveEdit} noValidate>
                    <Field id={`mg-en-${row.id}`} label={<span className="sr-only">Name</span>} error={editProblem}>
                      {(aria) => <Input {...aria} value={editName} maxLength={nameMax + 1} autoComplete="off" autoFocus onChange={(e) => { setEditName(e.target.value); setEditProblem(undefined); }} />}
                    </Field>
                    {withDescription ? (
                      <Field id={`mg-ed-${row.id}`} label={<span className="sr-only">Description</span>}>
                        {(aria) => <Input {...aria} value={editDescription} maxLength={COMPONENT_DESCRIPTION_MAX} autoComplete="off" onChange={(e) => setEditDescription(e.target.value)} />}
                      </Field>
                    ) : null}
                    <div className="row">
                      <Button variant="primary" size="sm" type="submit" disabled={busy}>{busy ? <Spinner /> : null}Save {noun}</Button>
                      <Button size="sm" onClick={() => setEditId(null)}>Cancel</Button>
                    </div>
                  </form>
                ) : removeId === row.id ? (
                  <div className="stack" style={{ gap: 8 }}>
                    <p className="small" style={{ overflowWrap: "anywhere" }}>Delete <b>{row.name}</b>? {deleteNote(row)}</p>
                    {editProblem ? <div className="err">{editProblem}</div> : null}
                    <div className="row">
                      <Button variant="primary" size="sm" style={DANGER_FILL} disabled={busy}
                        onClick={() => void run(() => onRemove(row.id), setEditProblem, () => { setRemoveId(null); setEditProblem(undefined); })}>
                        {busy ? <Spinner /> : null}Delete {noun}
                      </Button>
                      <Button size="sm" onClick={() => { setRemoveId(null); setEditProblem(undefined); }}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="row" style={{ flexWrap: "nowrap", justifyContent: "space-between" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ overflowWrap: "anywhere" }}>{row.name}</div>
                      <div className="xs muted" style={{ overflowWrap: "anywhere" }}>{row.detail}</div>
                    </div>
                    <div className="row" style={{ flexWrap: "nowrap", flexShrink: 0 }}>
                      <Button variant="ghost" size="sm" aria-label={`Edit ${row.name}`}
                        onClick={() => { setEditId(row.id); setEditName(row.name); setEditDescription(row.description ?? ""); setEditProblem(undefined); setRemoveId(null); }}>Edit</Button>
                      <Button variant="ghost" size="icon" aria-label={`Delete ${row.name}`} onClick={() => { setRemoveId(row.id); setEditId(null); setEditProblem(undefined); }}>
                        <IconTrash />
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}

/** Components of a project (API-045 to API-047): add, rename, describe, delete. A deleted component leaves its bugs without one. */
export function ComponentsDialog({ project, components, onClose }: { project: ProjectDetail; components: Component[]; onClose: () => void }) {
  const org = useOrg();
  const toast = useToast();
  const refresh = useRefreshProjects();
  const taken = (err: unknown): never => {
    if (isApiError(err, "name_taken")) throw new Error(err.message);
    if (isApiError(err) && err.fieldErrors().name) throw new Error(err.fieldErrors().name);
    throw new Error("Could not save the component. Check your connection and try again.");
  };
  const add = useMutation({
    mutationFn: ({ name, description }: { name: string; description: string }) =>
      unwrap(api.POST("/api/v1/orgs/{org_id}/projects/{project_id}/components", { params: { path: { org_id: org.id, project_id: project.id } }, body: { name, description } })),
  });
  const update = useMutation({
    mutationFn: ({ id, name, description }: { id: string; name: string; description: string }) =>
      unwrap(api.PATCH("/api/v1/orgs/{org_id}/components/{component_id}", { params: { path: { org_id: org.id, component_id: id } }, body: { name, description } })),
  });
  const remove = useMutation({
    mutationFn: (id: string) => unwrap(api.DELETE("/api/v1/orgs/{org_id}/components/{component_id}", { params: { path: { org_id: org.id, component_id: id } } })),
  });
  return (
    <ManageList
      title="Components" noun="component" withDescription nameMax={COMPONENT_NAME_MAX} onClose={onClose}
      rows={components.map((c) => ({ id: c.id, name: c.name, description: c.description, detail: `${c.open_bug_count} open${c.description ? `. ${c.description}` : ""}` }))}
      onAdd={async (name, description) => { try { await add.mutateAsync({ name, description }); toast(`${name} added`); refresh(); } catch (e) { taken(e); } }}
      onSave={async (id, name, description) => { try { await update.mutateAsync({ id, name, description }); toast(`${name} saved`); refresh(); } catch (e) { taken(e); } }}
      onRemove={async (id) => {
        try { await remove.mutateAsync(id); toast("Component deleted"); refresh(); } catch { throw new Error("Could not delete the component. Try again."); }
      }}
      deleteNote={(row) => `Its bugs stay but show no component (${row.detail.split(".")[0]}).`}
    />
  );
}

/** Environments of a project (API-049 to API-051): add, rename, delete. One that test runs use cannot be deleted (409 in_use). */
export function EnvironmentsDialog({ project, environments, onClose }: { project: ProjectDetail; environments: Environment[]; onClose: () => void }) {
  const org = useOrg();
  const toast = useToast();
  const refresh = useRefreshProjects();
  const fail = (err: unknown, what: string): never => {
    if (isApiError(err, "in_use")) throw new Error("Test runs use this environment, so it cannot be deleted.");
    if (isApiError(err, "name_taken")) throw new Error(err.message);
    if (isApiError(err) && err.fieldErrors().name) throw new Error(err.fieldErrors().name);
    throw new Error(`Could not ${what} the environment. Check your connection and try again.`);
  };
  const add = useMutation({
    mutationFn: (name: string) =>
      unwrap(api.POST("/api/v1/orgs/{org_id}/projects/{project_id}/environments", { params: { path: { org_id: org.id, project_id: project.id } }, body: { name } })),
  });
  const update = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      unwrap(api.PATCH("/api/v1/orgs/{org_id}/environments/{environment_id}", { params: { path: { org_id: org.id, environment_id: id } }, body: { name } })),
  });
  const remove = useMutation({
    mutationFn: (id: string) => unwrap(api.DELETE("/api/v1/orgs/{org_id}/environments/{environment_id}", { params: { path: { org_id: org.id, environment_id: id } } })),
  });
  return (
    <ManageList
      title="Environments" noun="environment" withDescription={false} nameMax={ENVIRONMENT_NAME_MAX} onClose={onClose}
      rows={environments.map((e) => ({ id: e.id, name: e.name, detail: `Position ${e.sort_order}` }))}
      onAdd={async (name) => { try { await add.mutateAsync(name); toast(`${name} added`); refresh(); } catch (e) { fail(e, "add"); } }}
      onSave={async (id, name) => { try { await update.mutateAsync({ id, name }); toast(`${name} saved`); refresh(); } catch (e) { fail(e, "save"); } }}
      onRemove={async (id) => { try { await remove.mutateAsync(id); toast("Environment deleted"); refresh(); } catch (e) { fail(e, "delete"); } }}
      deleteNote={() => "Runs that already use it keep it, so it is refused while one does."}
    />
  );
}
