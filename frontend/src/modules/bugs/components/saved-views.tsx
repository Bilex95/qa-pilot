"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { IconPlus, IconX } from "@/components/icons";
import { Button, Spinner } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api, unwrap, type Schemas } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { useSession } from "@/lib/session/session-provider";
import { useOrg } from "@/modules/shell/org-context";

import { builtInViews, fromViewFilters, sameFilters, toViewFilters, type FilterState } from "../schemas";

type SavedView = Schemas["SavedViewOut"];

const NAME_MAX = 60;

/**
 * The view tabs of SCR-08. The built in tabs are plain filters; saved views are private to the signed in person
 * (D-017). The prototype's Save view only shows a toast; here it saves the current filters (API-079). Deleting asks first.
 * There is no rename (needs a PATCH endpoint, BL-017).
 */
export function SavedViews({ filters, onApply }: { filters: FilterState; onApply: (next: FilterState) => void }) {
  const org = useOrg();
  const { me } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<SavedView | null>(null);
  const key = ["saved-views", org.id];

  const views = useQuery({
    queryKey: key,
    queryFn: () => unwrap(api.GET("/api/v1/orgs/{org_id}/saved-views", { params: { path: { org_id: org.id } } })),
  });

  const remove = useMutation({
    mutationFn: (view: SavedView) =>
      unwrap(api.DELETE("/api/v1/orgs/{org_id}/saved-views/{view_id}", { params: { path: { org_id: org.id, view_id: view.id } } })),
    onSuccess: (_, view) => toast(`View "${view.name}" deleted`),
    onError: (err) => {
      if (isApiError(err, "not_found")) toast("That view was already deleted.");
      else toast("Could not delete the view. Try again.", "error");
    },
    onSettled: () => {
      setDeleting(null);
      return qc.invalidateQueries({ queryKey: key });
    },
  });

  return (
    <>
      <div className="views" role="group" aria-label="Saved views">
        {builtInViews(me?.user.id).map((v) => (
          <button key={v.id} type="button" className="view-tab" aria-pressed={sameFilters(filters, v.filters)}
            onClick={() => onApply({ ...v.filters, sort: filters.sort })}>
            {v.name}
          </button>
        ))}
        {(views.data ?? []).map((v) => {
          const applied = fromViewFilters(v.filters);
          return (
            <span key={v.id} style={{ display: "inline-flex", alignItems: "center", flex: "none" }}>
              <button type="button" className="view-tab" aria-pressed={sameFilters(filters, applied)} title={v.name}
                style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }} onClick={() => onApply(applied)}>
                {v.name}
              </button>
              <button type="button" className="view-tab" aria-label={`Delete view ${v.name}`} style={{ padding: "6px 6px", minWidth: 44, textAlign: "center" }}
                onClick={() => setDeleting(v)}>
                <IconX width={14} height={14} style={{ verticalAlign: "-2px" }} />
              </button>
            </span>
          );
        })}
        <button type="button" className="view-tab" onClick={() => setSaving(true)}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, flex: "none" }}>
          <IconPlus width={14} height={14} />
          Save view
        </button>
      </div>
      {saving ? <SaveViewDialog filters={filters} onClose={() => setSaving(false)} /> : null}
      {deleting ? (
        <Dialog
          title={`Delete the view "${deleting.name}"?`}
          onClose={() => setDeleting(null)}
          footer={
            <>
              <Button onClick={() => setDeleting(null)}>Cancel</Button>
              <Button variant="primary" style={{ background: "var(--danger)", borderColor: "var(--danger)" }}
                disabled={remove.isPending} onClick={() => remove.mutate(deleting)}>
                {remove.isPending ? <Spinner /> : null}
                Delete view
              </Button>
            </>
          }
        >
          <div className="modal-body">
            <p>This removes the saved view for you only. No bugs are changed.</p>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}

function SaveViewDialog({ filters, onClose }: { filters: FilterState; onClose: () => void }) {
  const org = useOrg();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();

  const create = useMutation({
    mutationFn: (value: string) =>
      unwrap(api.POST("/api/v1/orgs/{org_id}/saved-views", {
        params: { path: { org_id: org.id } },
        body: { name: value, filters: toViewFilters(filters) },
      })),
    onSuccess: async (view) => {
      await qc.invalidateQueries({ queryKey: ["saved-views", org.id] });
      toast(`View "${view.name}" saved`);
      onClose();
    },
    onError: (err) => {
      if (isApiError(err, "name_taken")) setError(err.message);
      else if (isApiError(err) && err.fieldErrors().name) setError(err.fieldErrors().name);
      else setError("Could not save the view. Try again.");
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (create.isPending) return;
    const value = name.trim();
    if (!value) {
      setError("Enter a name for the view.");
      return;
    }
    if (value.length > NAME_MAX) {
      setError(`Use ${NAME_MAX} characters or fewer.`);
      return;
    }
    setError(undefined);
    create.mutate(value);
  }

  return (
    <Dialog
      title="Save view"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="save-view-form" disabled={create.isPending}>
            {create.isPending ? <Spinner /> : null}
            Save view
          </Button>
        </>
      }
    >
      <form id="save-view-form" className="modal-body" onSubmit={submit} noValidate>
        <Field id="view-name" label="Name" error={error}
          hint="Saves your current search, filters and sort. Only you can see it.">
          {(aria) => (
            <Input {...aria} value={name} maxLength={NAME_MAX} autoComplete="off" placeholder="Critical checkout bugs"
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(undefined);
              }} />
          )}
        </Field>
      </form>
    </Dialog>
  );
}
