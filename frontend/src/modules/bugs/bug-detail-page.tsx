"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { IconAlert, IconTrash } from "@/components/icons";
import { Button, DANGER_FILL, Spinner } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ErrorState } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { api, unwrap } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { can } from "@/lib/permissions";
import { useSession } from "@/lib/session/session-provider";
import { TRANSITION_LABEL, allowedTargets } from "@/modules/board/workflow";
import { useWorkflow } from "@/modules/board/hooks";
import { useOrg } from "@/modules/shell/org-context";

import { PriorityTag, SeverityBadge, SlaBadge, StatusBadge } from "./components/bug-badges";
import { BugDetailsPanel } from "./components/bug-details-panel";
import { BugFiles } from "./components/bug-files";
import { BugTimeline } from "./components/bug-timeline";
import { useBug, useRefreshBug, type BugDetail } from "./detail-hooks";
import { STATUS_NAME, timeAgo } from "./schemas";

/**
 * SCR-10 Bug detail (API-063, API-065, API-066; REQ-018 and REQ-019): the bug, its status buttons, its files, its thread and its
 * details. The AI triage panel arrives with I-16. `bugRef` is the key from the address (WEB-42).
 */
export function BugDetailPage({ bugRef }: { bugRef: string }) {
  const org = useOrg();
  const bug = useBug(bugRef);
  const crumbs = (
    <div className="crumbs">
      <Link href={`/o/${org.slug}/bugs`}>Bugs</Link> / <span className="mono" style={{ fontSize: "1em" }}>{bugRef.toUpperCase()}</span>
    </div>
  );

  if (bug.isPending) {
    return (
      <>
        {crumbs}
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading</span>
          <div className="split" aria-hidden="true">
            <div className="panel panel-body">
              {[90, 70, 100, 60, 85, 40].map((w, i) => <div key={i} className="sk sk-line" style={{ width: `${w}%` }} />)}
              <div className="sk" style={{ height: 140, marginTop: 20 }} />
            </div>
            <div className="panel panel-body">
              {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="sk sk-line" />)}
            </div>
          </div>
        </div>
      </>
    );
  }
  if (bug.isError || !bug.data) {
    const missing = isApiError(bug.error, "not_found");
    return (
      <>
        {crumbs}
        {missing ? (
          <div className="panel">
            <div className="state-box error" role="alert">
              <IconAlert className="big" />
              <h2>Bug {bugRef.toUpperCase()} was not found</h2>
              <p>It may have been deleted, or it belongs to a workspace you are not a member of.</p>
              <Link className="btn primary" href={`/o/${org.slug}/bugs`}>Back to bugs</Link>
            </div>
          </div>
        ) : (
          <ErrorState what={`bug ${bugRef.toUpperCase()}`} onRetry={() => void bug.refetch()}
            requestId={isApiError(bug.error) ? bug.error.requestId : undefined} />
        )}
      </>
    );
  }
  return <Loaded bug={bug.data} crumbs={crumbs} />;
}

function Loaded({ bug, crumbs }: { bug: BugDetail; crumbs: React.ReactNode }) {
  const org = useOrg();
  const { me } = useSession();
  const router = useRouter();
  const toast = useToast();
  const refresh = useRefreshBug();
  const workflow = useWorkflow();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const who = { role: org.role, userId: me?.user.id };
  const targets = allowedTargets(workflow.data, bug, who);

  const move = useMutation({
    mutationFn: (to: string) =>
      unwrap(api.POST("/api/v1/orgs/{org_id}/bugs/{bug_id}/transitions", {
        params: { path: { org_id: org.id, bug_id: bug.id } },
        body: { to_status: to as BugDetail["status"] },
      })),
    onSuccess: (_, to) => toast(`${bug.key} moved to ${STATUS_NAME[to] ?? to}`),
    onError: (err, to) => {
      if (isApiError(err, "invalid_transition")) toast(`${bug.key} cannot move to ${STATUS_NAME[to] ?? to} any more. The page is refreshed.`, "error");
      else if (isApiError(err, "forbidden")) toast(err.message, "error");
      else if (isApiError(err, "not_found")) toast(`${bug.key} was deleted by someone else.`, "error");
      else toast(`Could not move ${bug.key}. Check your connection and try again.`, "error");
    },
    onSettled: () => refresh(bug.id),
  });

  const remove = useMutation({
    mutationFn: () => unwrap(api.DELETE("/api/v1/orgs/{org_id}/bugs/{bug_id}", { params: { path: { org_id: org.id, bug_id: bug.id } } })),
    onSuccess: () => {
      toast(`${bug.key} deleted`);
      refresh(bug.id, { activity: false, bug: false });
      router.push(`/o/${org.slug}/bugs`);
    },
    onError: (err) => {
      setConfirmDelete(false);
      if (isApiError(err, "not_found")) router.push(`/o/${org.slug}/bugs`);
      else toast("Could not delete the bug. Try again.", "error");
    },
  });

  const note = org.role === "viewer" ? "Viewers can comment but cannot change bugs."
    : org.role === "developer" && bug.assignee_id !== null && bug.assignee_id !== me?.user.id ? "Only the assignee can move this bug."
    : "No status changes available.";
  const steps = bug.steps_to_reproduce;

  return (
    <>
      {crumbs}
      <div className="page-head">
        <div className="grow">
          <div className="row" style={{ marginBottom: 8 }}>
            <span className="mono muted">{bug.key}</span>
            <StatusBadge status={bug.status} />
            <SeverityBadge severity={bug.severity} />
            <PriorityTag priority={bug.priority} />
            {bug.sla_breached ? <SlaBadge severity={bug.severity} /> : null}
          </div>
          <h1 style={{ overflowWrap: "anywhere" }}>{bug.title}</h1>
          <p>
            Reported by {bug.reporter_name} {timeAgo(bug.created_at)}. Updated {timeAgo(bug.updated_at)}.
          </p>
        </div>
        <div className="actions" aria-busy={move.isPending}>
          {workflow.isPending ? null : targets.length ? targets.map((t, i) => (
            <Button key={t} variant={i === 0 ? "primary" : "default"} disabled={move.isPending} onClick={() => move.mutate(t)}>
              {move.isPending && move.variables === t ? <Spinner /> : null}
              {TRANSITION_LABEL[t] ?? STATUS_NAME[t] ?? t}
            </Button>
          )) : <span className="small muted">{note}</span>}
          {can(org.role, "bug.delete") ? (
            <Button variant="ghost" size="icon" aria-label="Delete bug" onClick={() => setConfirmDelete(true)}>
              <IconTrash />
            </Button>
          ) : null}
        </div>
      </div>
      <div className="split">
        <div className="stack">
          <section className="panel">
            <div className="panel-body prose">
              <h3>Description</h3>
              {bug.description ? <p style={{ whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{bug.description}</p> : <p className="muted">No description.</p>}
              <h3>Steps to reproduce</h3>
              {steps.length ? (
                <ol style={{ listStyle: "decimal" }}>{steps.map((s, i) => <li key={i} style={{ overflowWrap: "anywhere" }}>{s}</li>)}</ol>
              ) : <p className="muted">No steps recorded.</p>}
              <h3>Expected and actual</h3>
              <div className="ea">
                <div className="exp">
                  <div className="ea-title">Expected</div>
                  <span style={{ whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{bug.expected_result || <span className="muted">Not provided.</span>}</span>
                </div>
                <div className="act">
                  <div className="ea-title">Actual</div>
                  <span style={{ whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{bug.actual_result || <span className="muted">Not provided.</span>}</span>
                </div>
              </div>
              <BugFiles bug={bug} />
            </div>
          </section>
          <section className="panel">
            <div className="panel-body">
              <BugTimeline bug={bug} />
            </div>
          </section>
        </div>
        <aside className="stack">
          <BugDetailsPanel bug={bug} />
        </aside>
      </div>
      {confirmDelete ? (
        <Dialog
          title={`Delete ${bug.key}?`}
          onClose={() => setConfirmDelete(false)}
          footer={
            <>
              <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
              <Button variant="primary" style={DANGER_FILL} disabled={remove.isPending} onClick={() => remove.mutate()}>
                {remove.isPending ? <Spinner /> : null}
                Delete bug
              </Button>
            </>
          }
        >
          <div className="modal-body">
            <p style={{ overflowWrap: "anywhere" }}>{bug.title}</p>
            <p className="small muted">The bug leaves every list and the board. Its key is never reused. This cannot be undone from the app.</p>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}
