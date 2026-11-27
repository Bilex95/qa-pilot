"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { Button, Spinner } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api, unwrap } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { useOrg } from "@/modules/shell/org-context";

import { labelNameSchema } from "../schemas";

/** New label (API-053). The prototype has no dialog for this, so it follows the New project dialog: one field. */
export function NewLabelDialog({ onClose }: { onClose: () => void }) {
  const org = useOrg();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();

  const create = useMutation({
    mutationFn: (value: string) =>
      unwrap(api.POST("/api/v1/orgs/{org_id}/labels", { params: { path: { org_id: org.id } }, body: { name: value, color: "neutral" } })),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["labels", org.id] });
      toast("Label added");
      onClose();
    },
    onError: (err) => {
      if (isApiError(err, "name_taken")) setError(err.message);
      else if (isApiError(err) && err.fieldErrors().name) setError(err.fieldErrors().name);
      else setError("Could not add the label. Try again.");
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (create.isPending) return;
    const parsed = labelNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a label name.");
      return;
    }
    setError(undefined);
    create.mutate(parsed.data);
  }

  return (
    <Dialog
      title="New label"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="new-label-form" disabled={create.isPending}>
            {create.isPending ? <Spinner /> : null}
            Add label
          </Button>
        </>
      }
    >
      <form id="new-label-form" className="modal-body" onSubmit={submit} noValidate>
        <Field id="label-name" label="Name" error={error} hint="Up to 40 characters. Names are not case sensitive.">
          {(aria) => (
            <Input
              {...aria}
              value={name}
              maxLength={40}
              autoComplete="off"
              placeholder="Regression"
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(undefined);
              }}
            />
          )}
        </Field>
      </form>
    </Dialog>
  );
}
