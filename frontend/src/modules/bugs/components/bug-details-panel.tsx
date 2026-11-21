"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { IconUser } from "@/components/icons";
import { Avatar } from "@/components/ui/avatar";
import { Button, Spinner } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api, unwrap, type Schemas } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { can } from "@/lib/permissions";
import { useSession } from "@/lib/session/session-provider";
import { useOrg } from "@/modules/shell/org-context";

import { useRefreshBug, type BugDetail } from "../detail-hooks";
import { useComponents, useEnvironments, useMemberOptions } from "../hooks";
import { PRIORITY_OPTIONS, SEVERITY_OPTIONS } from "../schemas";
import { StatusBadge } from "./bug-badges";

type Changes = Schemas["BugUpdateIn"];

/**
 * The Details panel of the bug page (API-063; REQ-018). Every select saves on change. What a role may change follows the
 * permission matrix and the Developer record rules; the API checks again and a refusal puts the old value back.
 */
export function BugDetailsPanel({ bug }: { bug: BugDetail }) {
  const org = useOrg();
  const { me } = useSession();
  const toast = useToast();
  const refresh = useRefreshBug();
  const members = useMemberOptions();
  const components = useComponents(bug.project_id);
  const environments = useEnvironments(bug.project_id);
  const [pending, setPending] = useState<Changes>({});

  const patch = useMutation({
    mutationFn: (changes: Changes) =>
      unwrap(api.PATCH("/api/v1/orgs/{org_id}/bugs/{bug_id}", { params: { path: { org_id: org.id, bug_id: bug.id } }, body: changes })),
    onSettled: () => {
      setPending({});
      refresh(bug.id);
    },
    onError: (err) => {
      if (isApiError(err, "forbidden")) toast(err.message, "error");
      else if (isApiError(err, "validation_error")) toast("That value is not valid any more. The page is refreshed.", "error");
      else if (isApiError(err, "not_found")) toast(`${bug.key} was deleted by someone else.`, "error");
      else toast("Could not save the change. Check your connection and try again.", "error");
    },
  });

  const change = (changes: Changes) => {
    setPending(changes);
    patch.mutate(changes);
  };
  // What the selects show while a change is on its way: the new value at once, the saved one if the save is refused
  const shown = {
    severity: pending.severity ?? bug.severity,
    priority: pending.priority ?? bug.priority,
    assignee_id: pending.assignee_id !== undefined ? pending.assignee_id : bug.assignee_id,
    component_id: pending.component_id !== undefined ? pending.component_id : bug.component_id,
    environment_id: pending.environment_id !== undefined ? pending.environment_id : bug.environment_id,
  };
  const role = org.role;
  const mine = me?.user.id;
  const canSevPri = can(role, "bug.set_severity_priority");
  const canEdit = can(role, "bug.update_fields") && (role !== "developer" || bug.reporter_id === mine);
  const takesIt = role === "developer" && bug.assignee_id === null && !!mine; // a Developer takes an unassigned bug (D-006)
  const canAssign = can(role, "bug.assign") && role !== "developer";
  const busy = patch.isPending;

  const people = (members.data?.items ?? []).filter((m) => m.role !== "viewer");
  const assigneeId = shown.assignee_id ?? "";
  const hasAssignee = !assigneeId || people.some((m) => m.user.id === assigneeId);
  const sel = (id: string, label: string) => <label className="sr-only" htmlFor={id}>{label}</label>;

  return (
    <section className="panel">
      <div className="panel-head"><h3>Details</h3></div>
      <div className="panel-body">
        <dl className="dl" aria-busy={busy}>
          <dt>Status</dt>
          <dd><StatusBadge status={bug.status} /></dd>
          <dt>Severity</dt>
          <dd>
            {sel("d-sev", "Severity")}
            <Select id="d-sev" value={shown.severity} disabled={!canSevPri || busy} onChange={(e) => change({ severity: e.target.value as Changes["severity"] })}>
              {SEVERITY_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
          </dd>
          <dt>Priority</dt>
          <dd>
            {sel("d-pri", "Priority")}
            <Select id="d-pri" value={shown.priority} disabled={!canSevPri || busy} onChange={(e) => change({ priority: e.target.value as Changes["priority"] })}>
              {PRIORITY_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
          </dd>
          <dt>Assignee</dt>
          <dd>
            {takesIt ? (
              <Button size="sm" disabled={busy} onClick={() => change({ assignee_id: mine })}>
                {busy ? <Spinner /> : <IconUser />}
                Assign to me
              </Button>
            ) : (
              <>
                {sel("d-asg", "Assignee")}
                <Select id="d-asg" value={assigneeId} disabled={!canAssign || busy}
                  onChange={(e) => change({ assignee_id: e.target.value || null })}>
                  <option value="">Unassigned</option>
                  {hasAssignee ? null : <option value={assigneeId}>{bug.assignee_name ?? "Former member"}</option>}
                  {people.map((m) => <option key={m.user.id} value={m.user.id}>{m.user.full_name}</option>)}
                </Select>
              </>
            )}
          </dd>
          <dt>Component</dt>
          <dd>
            {sel("d-comp", "Component")}
            <Select id="d-comp" value={shown.component_id ?? ""} disabled={!canEdit || busy}
              onChange={(e) => change({ component_id: e.target.value || null })}>
              <option value="">None</option>
              {(components.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </dd>
          <dt>Environment</dt>
          <dd>
            {sel("d-env", "Environment")}
            <Select id="d-env" value={shown.environment_id ?? ""} disabled={!canEdit || busy}
              onChange={(e) => change({ environment_id: e.target.value || null })}>
              <option value="">None</option>
              {(environments.data ?? []).map((env) => <option key={env.id} value={env.id}>{env.name}</option>)}
            </Select>
          </dd>
          <dt>Release</dt>
          <dd><span className="muted">{bug.release_id ? "Linked" : "None"}</span></dd>
          <dt>Labels</dt>
          <dd>
            {bug.labels.length ? (
              <span className="row" style={{ gap: 4 }}>
                {bug.labels.map((l) => (
                  <span key={l.id} className="label-chip" title={l.name} style={{ maxWidth: 160 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{l.name}</span>
                  </span>
                ))}
              </span>
            ) : <span className="muted">None</span>}
          </dd>
          <dt>Reporter</dt>
          <dd>
            <span className="who">
              <Avatar id={bug.reporter_id} name={bug.reporter_name} />
              <span style={{ overflowWrap: "anywhere" }}>{bug.reporter_name}</span>
            </span>
          </dd>
        </dl>
      </div>
    </section>
  );
}
