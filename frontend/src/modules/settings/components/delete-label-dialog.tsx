"use client";

import { Button, Spinner } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

/**
 * Confirm before deleting a label. The count comes from the API (`bug_count`, real since I-03): deleting a label takes
 * it off every bug that has it. Undo is BL-011.
 */
export function DeleteLabelDialog({ name, bugCount, pending, onConfirm, onClose }: {
  name: string;
  bugCount: number;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      title={`Delete the label "${name}"?`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" style={{ background: "var(--danger)", borderColor: "var(--danger)" }}
            disabled={pending} onClick={onConfirm}>
            {pending ? <Spinner /> : null}
            Delete label
          </Button>
        </>
      }
    >
      <div className="modal-body">
        <p id="delete-label-count" style={{ overflowWrap: "anywhere" }}>
          {bugCount === 0
            ? "No bugs have this label."
            : `It will be removed from ${bugCount} ${bugCount === 1 ? "bug" : "bugs"}. The ${bugCount === 1 ? "bug itself stays" : "bugs themselves stay"}.`}
        </p>
        <p className="small muted">This cannot be undone.</p>
      </div>
    </Dialog>
  );
}
