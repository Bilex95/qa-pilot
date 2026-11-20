"use client";

import { Button, Spinner } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

const danger = { background: "var(--danger)", borderColor: "var(--danger)" } as const;

/** Confirm before deleting a suite. The cases go with it (D-052), so the count is part of the question. */
export function DeleteSuiteDialog({ name, caseCount, pending, onConfirm, onClose }: {
  name: string;
  caseCount: number;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      title={`Delete the suite "${name}"?`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" style={danger} disabled={pending} onClick={onConfirm}>
            {pending ? <Spinner /> : null}
            Delete suite
          </Button>
        </>
      }
    >
      <div className="modal-body">
        <p id="delete-suite-count" style={{ overflowWrap: "anywhere" }}>
          {caseCount === 0
            ? "This suite has no cases."
            : `Its ${caseCount} ${caseCount === 1 ? "case is" : "cases are"} deleted with it.`}
        </p>
        <p className="small muted">This cannot be undone.</p>
      </div>
    </Dialog>
  );
}

/** Confirm before deleting a case. The prototype has no delete; the confirmation is a deliberate addition (D-054). */
export function DeleteCaseDialog({ caseKey, title, pending, onConfirm, onClose }: {
  caseKey: string;
  title: string;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      title={`Delete ${caseKey}?`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" style={danger} disabled={pending} onClick={onConfirm}>
            {pending ? <Spinner /> : null}
            Delete case
          </Button>
        </>
      }
    >
      <div className="modal-body">
        <p style={{ overflowWrap: "anywhere" }}>{title}</p>
        <p className="small muted">The case is removed from its suite. Past test runs keep their own copy. This cannot be undone.</p>
      </div>
    </Dialog>
  );
}
