"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api, unwrap, type Schemas } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { ROLE_NAMES, type Role } from "@/lib/permissions";
import { useOrg } from "@/modules/shell/org-context";

import { formatDate, ROLE_ORDER } from "../schemas";

type Member = Schemas["MemberOut"];
type MemberPage = Schemas["Page_MemberOut_"];

type Props = {
  items: Member[];
  manage: boolean;
  myUserId: string | undefined;
  soleAdmin: boolean;
  onRemove: (member: Member) => void;
  onResetPassword: (member: Member) => void;
};

export function MembersTable({ items, manage, myUserId, soleAdmin, onRemove, onResetPassword }: Props) {
  return (
    <div className="table-wrap">
      <table className="t stackable">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Joined</th>
            <th><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {items.map((m) => (
            <MemberRow key={m.membership_id} member={m} manage={manage} isMe={m.user.id === myUserId} soleAdmin={soleAdmin}
              onRemove={onRemove} onResetPassword={onResetPassword} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MemberRow({ member, manage, isMe, soleAdmin, onRemove, onResetPassword }: {
  member: Member;
  manage: boolean;
  isMe: boolean;
  soleAdmin: boolean;
  onRemove: (member: Member) => void;
  onResetPassword: (member: Member) => void;
}) {
  const org = useOrg();
  const qc = useQueryClient();
  const toast = useToast();
  const name = member.user.full_name;
  const selectId = `role-${member.membership_id}`;
  const noteId = `${selectId}-note`;
  // Your own row is locked (D-049): the server still refuses demoting or removing the last Org Admin (409 last_admin)
  const note = soleAdmin
    ? "You are the only Org Admin. Make someone else an Org Admin first."
    : "You cannot change your own role.";

  const change = useMutation({
    mutationFn: (role: Role) =>
      unwrap(api.PATCH("/api/v1/orgs/{org_id}/members/{membership_id}", {
        params: { path: { org_id: org.id, membership_id: member.membership_id } },
        body: { role },
      })),
    onSuccess: (_, role) => {
      qc.setQueriesData<MemberPage>({ queryKey: ["members", org.id] }, (page) =>
        page ? { ...page, items: page.items.map((i) => (i.membership_id === member.membership_id ? { ...i, role } : i)) } : page);
      toast(`${name} is now ${ROLE_NAMES[role]}`);
    },
    onError: (err) => {
      // The select is controlled by the server's role, so it is back on the actual role as soon as the request fails
      toast(
        isApiError(err, "last_admin")
          ? "The last Org Admin cannot be demoted. Make someone else an Org Admin first."
          : "Could not change the role. Try again.",
        "error",
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["members", org.id] }),
  });

  const shownRole = change.isPending ? change.variables : member.role;

  return (
    <tr>
      <td className="title-cell">
        <span className="who">
          <Avatar id={member.user.id} name={name} />
          {name}
        </span>
      </td>
      <td data-label="Email" className="small" style={{ overflowWrap: "anywhere" }}>{member.user.email ?? ""}</td>
      <td data-label="Role">
        {manage ? (
          <>
            <label className="sr-only" htmlFor={selectId}>Role for {name}</label>
            <Select id={selectId} style={{ width: "auto", minWidth: 150 }} value={shownRole}
              disabled={isMe || change.isPending} title={isMe ? note : undefined} aria-describedby={isMe ? noteId : undefined}
              onChange={(e) => change.mutate(e.target.value as Role)}>
              {ROLE_ORDER.map((r) => <option key={r} value={r}>{ROLE_NAMES[r]}</option>)}
            </Select>
            {isMe ? <span className="sr-only" id={noteId}>{note}</span> : null}
          </>
        ) : (
          ROLE_NAMES[member.role]
        )}
      </td>
      <td data-label="Joined" className="small">{formatDate(member.joined_at)}</td>
      <td className="no-label">
        {manage && !isMe ? (
          <span className="row" style={{ gap: 4, flexWrap: "wrap" }}>
            <Button variant="ghost" size="sm" aria-label={`Reset the password of ${name}`} onClick={() => onResetPassword(member)}>
              Reset password
            </Button>
            <Button variant="danger" size="sm" className="ghost" aria-label={`Remove ${name}`} onClick={() => onRemove(member)}>
              Remove
            </Button>
          </span>
        ) : null}
      </td>
    </tr>
  );
}
