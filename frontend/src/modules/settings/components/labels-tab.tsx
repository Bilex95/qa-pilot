"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { IconPlus, IconTrash } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingPanel } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { api, unwrap } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { useOrg } from "@/modules/shell/org-context";

import { LabelChip } from "./label-chip";
import { NewLabelDialog } from "./new-label-dialog";

/** SCR-20 Settings, Labels tab (API-052 to API-054, REQ-022). Only roles with label.manage see this tab. */
export function LabelsTab() {
  const org = useOrg();
  const qc = useQueryClient();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const key = ["labels", org.id];

  const labels = useQuery({
    queryKey: key,
    queryFn: () => unwrap(api.GET("/api/v1/orgs/{org_id}/labels", { params: { path: { org_id: org.id } } })),
  });

  const remove = useMutation({
    mutationFn: (labelId: string) =>
      unwrap(api.DELETE("/api/v1/orgs/{org_id}/labels/{label_id}", { params: { path: { org_id: org.id, label_id: labelId } } })),
    onSuccess: () => toast("Label deleted"),
    onError: (err) => {
      if (isApiError(err, "not_found")) toast("That label was already deleted.");
      else toast("Could not delete the label. Try again.", "error");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });

  if (labels.isLoading) return <LoadingPanel rows={5} />;
  if (labels.isError) return <ErrorState what="labels" onRetry={() => void labels.refetch()} />;
  const items = labels.data ?? [];

  const newButton = (
    <Button size="sm" onClick={() => setCreating(true)}>
      <IconPlus />
      New label
    </Button>
  );

  return (
    <>
      {items.length === 0 ? (
        <EmptyState icon={IconPlus} title="No labels yet" action={newButton}>
          Labels group bugs across projects, for example Regression or Payments. Add the first one.
        </EmptyState>
      ) : (
        <section className="panel">
          <div className="panel-head">
            <h2>Labels</h2>
            {newButton}
          </div>
          <div className="table-wrap">
            <table className="t">
              <tbody>
                {items.map((label) => (
                  <tr key={label.id}>
                    <td style={{ width: "100%", maxWidth: 0 }}>
                      <LabelChip name={label.name} />
                    </td>
                    <td className="small muted" style={{ whiteSpace: "nowrap" }}>
                      {label.bug_count} {label.bug_count === 1 ? "bug" : "bugs"}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="icon-btn"
                        aria-label={`Delete label ${label.name}`}
                        disabled={remove.isPending && remove.variables === label.id}
                        onClick={() => remove.mutate(label.id)}
                      >
                        <IconTrash />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {creating ? <NewLabelDialog onClose={() => setCreating(false)} /> : null}
    </>
  );
}
