"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api, unwrap } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { ROLE_NAMES } from "@/lib/permissions";
import { useOrg } from "@/modules/shell/org-context";

import { formatDate } from "../schemas";

/**
 * Pending invitations (API-028, API-029). Org Admin and QA Lead can read them (invitation.list); only the Org Admin can
 * revoke (invitation.revoke). The invitation list never carries the link: it is shown once, when it is created.
 */
export function PendingInvitations({ canRevoke }: { canRevoke: boolean }) {
  const org = useOrg();
  const qc = useQueryClient();
  const toast = useToast();
  const key = ["invitations", org.id];

  const invitations = useQuery({
    queryKey: key,
    queryFn: () => unwrap(api.GET("/api/v1/orgs/{org_id}/invitations", { params: { path: { org_id: org.id }, query: { status: "pending" } } })),
  });

  const revoke = useMutation({
    mutationFn: (invitationId: string) =>
      unwrap(api.DELETE("/api/v1/orgs/{org_id}/invitations/{invitation_id}", { params: { path: { org_id: org.id, invitation_id: invitationId } } })),
    onSuccess: () => toast("Invitation revoked"),
    onError: (err) => {
      if (isApiError(err, "not_found")) toast("That invitation is already gone.");
      else toast("Could not revoke the invitation. Try again.", "error");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });

  return (
    <section className="panel" style={{ marginTop: 16 }}>
      <div className="panel-head">
        <h2>Pending invitations</h2>
      </div>
      {invitations.isPending ? (
        <div role="status" className="panel-body">
          <span className="sr-only">Loading</span>
          <div className="sk sk-line" aria-hidden="true" style={{ width: "70%" }} />
          <div className="sk sk-line" aria-hidden="true" style={{ width: "55%" }} />
        </div>
      ) : invitations.isError ? (
        <div className="panel-body" role="alert">
          <p>Could not load the pending invitations.</p>
          <Button size="sm" onClick={() => void invitations.refetch()}>Try again</Button>
        </div>
      ) : invitations.data.length === 0 ? (
        <p className="panel-body muted">No pending invitations.</p>
      ) : (
        <div className="table-wrap">
          <table className="t stackable">
            <tbody>
              {invitations.data.map((inv) => (
                <tr key={inv.id}>
                  <td className="title-cell" style={{ overflowWrap: "anywhere" }}>{inv.email}</td>
                  <td data-label="Role">{ROLE_NAMES[inv.role]}</td>
                  <td data-label="Expires" className="small">Expires {formatDate(inv.expires_at)}</td>
                  <td className="no-label">
                    {canRevoke ? (
                      <Button variant="ghost" size="sm" aria-label={`Revoke the invitation for ${inv.email}`}
                        disabled={revoke.isPending && revoke.variables === inv.id} onClick={() => revoke.mutate(inv.id)}>
                        Revoke
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
