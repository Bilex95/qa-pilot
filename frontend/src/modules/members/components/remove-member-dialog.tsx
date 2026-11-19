"use client";

import { Button, Spinner } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

/**
 * Confirm before removing a member. The locked prototype removes immediately; this confirmation is a deliberate
 * deviation because removal cuts off access at once (D-049). Role changes stay immediate.
 */
export function RemoveMemberDialog({ name, orgName, pending, onConfirm, onClose }: {
  name: string;
  orgName: string;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      title={`Remove ${name}?`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" style={{ background: "var(--danger)", borderColor: "var(--danger)" }}
            disabled={pending} onClick={onConfirm}>
            {pending ? <Spinner /> : null}
            Remove member
          </Button>
        </>
      }
    >
      <div className="modal-body">
        <p>{name} loses access to {orgName} right away. You can invite them again later.</p>
      </div>
    </Dialog>
  );
}
