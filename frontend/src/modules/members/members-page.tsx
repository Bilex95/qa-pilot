"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { IconLock, IconPlus } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api, unwrap, type Schemas } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { can, ROLE_NAMES, type Role } from "@/lib/permissions";
import { useSession } from "@/lib/session/session-provider";
import { useOrg } from "@/modules/shell/org-context";

import { InviteDialog } from "./components/invite-dialog";
import { MembersTable } from "./components/members-table";
import { PendingInvitations } from "./components/pending-invitations";
import { RemoveMemberDialog } from "./components/remove-member-dialog";
import { PAGE_SIZE, ROLE_ORDER } from "./schemas";

type Member = Schemas["MemberOut"];

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/**
 * SCR-19 Members and roles (API-024 to API-029; REQ-006, REQ-009). Org Admin manages; QA Lead reads (member.list and
 * invitation.list in PERSONAS_AND_ROLES.md); everyone else sees the no access state.
 */
export function MembersPage() {
  const org = useOrg();
  const { me } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const allowed = can(org.role, "member.list");
  const manage = can(org.role, "member.update_role");
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim(), 250);
  const [roleFilter, setRoleFilter] = useState<"" | Role>("");
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);

  const members = useQuery({
    queryKey: ["members", org.id, { q, role: roleFilter }],
    enabled: allowed,
    placeholderData: keepPreviousData, // keep the table (and the search box focus) while a new search loads
    queryFn: () =>
      unwrap(api.GET("/api/v1/orgs/{org_id}/members", {
        params: { path: { org_id: org.id }, query: { page: 1, page_size: PAGE_SIZE, q: q || undefined, role: roleFilter || undefined } },
      })),
  });

  // Only an Org Admin has controls, and a sole Org Admin is always the signed in person: this only picks the explanation
  const admins = useQuery({
    queryKey: ["members", org.id, "admins"],
    enabled: allowed && manage,
    queryFn: () =>
      unwrap(api.GET("/api/v1/orgs/{org_id}/members", {
        params: { path: { org_id: org.id }, query: { page: 1, page_size: 1, role: "org_admin" } },
      })),
  });

  const remove = useMutation({
    mutationFn: (member: Member) =>
      unwrap(api.DELETE("/api/v1/orgs/{org_id}/members/{membership_id}", {
        params: { path: { org_id: org.id, membership_id: member.membership_id } },
      })),
    onSuccess: (_, member) => {
      toast(`${member.user.full_name} removed`);
      setRemoving(null);
    },
    onError: (err) => {
      setRemoving(null);
      if (isApiError(err, "last_admin")) toast("The last Org Admin cannot be removed. Make someone else an Org Admin first.", "error");
      else if (isApiError(err, "not_found")) toast("That person is already gone from this workspace.");
      else toast("Could not remove the member. Try again.", "error");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["members", org.id] }),
  });

  if (!allowed) {
    return (
      <EmptyState icon={IconLock} title="You do not have access to Members">
        Your role is {ROLE_NAMES[org.role]}. Ask an Org Admin if you need access.
      </EmptyState>
    );
  }

  const data = members.data;
  const filtered = q !== "" || roleFilter !== "";

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <h1>Members and roles</h1>
          <p>{manage ? "Invite people and choose what each person can do." : "People in this workspace. Only an Org Admin can change roles."}</p>
        </div>
        {manage ? (
          <div className="actions">
            <Button variant="primary" onClick={() => setInviting(true)}>
              <IconPlus />
              Invite people
            </Button>
          </div>
        ) : null}
      </div>

      {members.isPending ? (
        <TableSkeleton />
      ) : !data ? (
        <ErrorState what="members" onRetry={() => void members.refetch()}
          requestId={isApiError(members.error) ? members.error.requestId : undefined} />
      ) : (
        <>
          <section className="panel">
            <div className="filters">
              <label className="sr-only" htmlFor="m-q">Search members</label>
              <Input id="m-q" className="search-f" type="search" placeholder="Search by name or email" value={search}
                autoComplete="off" onChange={(e) => setSearch(e.target.value)} />
              <label className="sr-only" htmlFor="m-r">Role</label>
              <Select id="m-r" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as "" | Role)}>
                <option value="">All roles</option>
                {ROLE_ORDER.map((r) => <option key={r} value={r}>{ROLE_NAMES[r]}</option>)}
              </Select>
            </div>
            {data.items.length === 0 ? (
              <p className="panel-body muted" role="status">
                {filtered ? "No one matches your search or role filter." : "No members yet."}
              </p>
            ) : (
              <MembersTable items={data.items} manage={manage} myUserId={me?.user.id} soleAdmin={admins.data?.total === 1}
                onRemove={setRemoving} />
            )}
            {data.total > data.items.length ? (
              <p className="panel-body small muted" role="status">
                Showing the first {data.items.length} of {data.total} members. Search or filter by role to find the rest.
              </p>
            ) : null}
          </section>
          <PendingInvitations canRevoke={manage} />
        </>
      )}

      {inviting ? <InviteDialog onClose={() => setInviting(false)} /> : null}
      {removing ? (
        <RemoveMemberDialog name={removing.user.full_name} orgName={org.name} pending={remove.isPending}
          onConfirm={() => remove.mutate(removing)} onClose={() => setRemoving(null)} />
      ) : null}
    </>
  );
}
