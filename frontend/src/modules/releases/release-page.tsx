"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { IconAlert, IconPlus, IconTrash } from "@/components/icons";
import { Avatar } from "@/components/ui/avatar";
import { Button, DANGER_FILL, Spinner } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ErrorState } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { api, unwrap } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { can } from "@/lib/permissions";
import { PriorityTag, SeverityBadge, SlaBadge, StatusBadge } from "@/modules/bugs/components/bug-badges";
import { timeAgo } from "@/modules/bugs/schemas";
import { useAiEnabled, useOrg } from "@/modules/shell/org-context";
import { ProgressBar } from "@/modules/testing/components/progress-bar";
import { rateText, runStatusName } from "@/modules/testing/runs";

import { LinkBugsDialog, LinkRunsDialog } from "./components/link-dialogs";
import { ReadinessBadge } from "./components/readiness-badge";
import { ReleaseDialog } from "./components/release-dialog";
import { ReleaseSummaryPanel } from "./components/release-summary-panel";
import { useRefreshReleases, useRelease } from "./hooks";
import { READINESS_NAME, STATUS_NAME, formatDate, type Release } from "./releases";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * SCR-17 Release detail (API-112 to API-119; REQ-035 to REQ-037): the readiness with its reasons, the linked bugs and runs, and the
 * release actions, and the AI release summary (I-18). `releaseId` is the id from the address.
 */
export function ReleasePage({ releaseId }: { releaseId: string }) {
  const org = useOrg();
  const release = useRelease(releaseId);
  const crumbs = (name: string) => (
    <div className="crumbs">
      <Link href={`/o/${encodeURIComponent(org.slug)}/releases`}>Releases</Link> / {name}
    </div>
  );
  if (release.isPending) {
    return (
      <>
        {crumbs("")}
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading</span>
          <div className="split" aria-hidden="true">
            <div className="panel panel-body">
              {[90, 70, 100, 60, 85, 40].map((w, i) => <div key={i} className="sk sk-line" style={{ width: `${w}%` }} />)}
              <div className="sk" style={{ height: 140, marginTop: 20 }} />
            </div>
            <div className="panel panel-body">{[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="sk sk-line" />)}</div>
          </div>
        </div>
      </>
    );
  }
  if (release.isError || !release.data) {
    const missing = isApiError(release.error, "not_found");
    return (
      <>
        {crumbs("")}
        {missing ? (
          <div className="panel">
            <div className="state-box error" role="alert">
              <IconAlert className="big" />
              <h2>This release was not found</h2>
              <p>It may have been deleted, or it belongs to a workspace you are not a member of.</p>
              <Link className="btn primary" href={`/o/${encodeURIComponent(org.slug)}/releases`}>Back to releases</Link>
            </div>
          </div>
        ) : (
          <ErrorState what="this release" onRetry={() => void release.refetch()} requestId={isApiError(release.error) ? release.error.requestId : undefined} />
        )}
      </>
    );
  }
  return <Loaded release={release.data} crumbs={crumbs(release.data.name)} />;
}

export const isReleaseId = (value: string) => UUID.test(value);

function Loaded({ release, crumbs }: { release: Release; crumbs: React.ReactNode }) {
  const org = useOrg();
  const router = useRouter();
  const toast = useToast();
  const refresh = useRefreshReleases();
  const [dialog, setDialog] = useState<"bugs" | "runs" | "edit" | "release" | "delete" | null>(null);
  const canManage = can(org.role, "release.manage");
  const released = release.status === "released";
  const open = release.open_bug_count;

  const onFail = (err: unknown) => {
    if (isApiError(err, "not_found")) toast(`${release.name} was deleted by someone else.`, "error");
    else if (isApiError(err, "released")) toast(`${release.name} is released and cannot be deleted.`, "error");
    else if (isApiError(err, "forbidden")) toast("Your role cannot change releases.", "error");
    else toast("Could not save the change. Check your connection and try again.", "error");
  };

  const unlinkBug = useMutation({
    mutationFn: (bugId: string) =>
      unwrap(api.DELETE("/api/v1/orgs/{org_id}/releases/{release_id}/bugs/{bug_id}", { params: { path: { org_id: org.id, release_id: release.id, bug_id: bugId } } })),
    onSuccess: () => toast("Bug removed from the release"),
    onError: onFail,
    onSettled: refresh,
  });
  const unlinkRun = useMutation({
    mutationFn: (runId: string) =>
      unwrap(api.DELETE("/api/v1/orgs/{org_id}/releases/{release_id}/runs/{run_id}", { params: { path: { org_id: org.id, release_id: release.id, run_id: runId } } })),
    onSuccess: () => toast("Run removed from the release"),
    onError: onFail,
    onSettled: refresh,
  });
  const markReleased = useMutation({
    mutationFn: () => unwrap(api.PATCH("/api/v1/orgs/{org_id}/releases/{release_id}", { params: { path: { org_id: org.id, release_id: release.id } }, body: { status: "released" } })),
    onSuccess: () => toast(`${release.name} marked as released`),
    onError: onFail,
    onSettled: () => { setDialog(null); refresh(); },
  });
  const remove = useMutation({
    mutationFn: () => unwrap(api.DELETE("/api/v1/orgs/{org_id}/releases/{release_id}", { params: { path: { org_id: org.id, release_id: release.id } } })),
    onSuccess: () => {
      toast(`${release.name} deleted`);
      refresh();
      router.push(`/o/${encodeURIComponent(org.slug)}/releases`);
    },
    onError: (err) => { setDialog(null); onFail(err); },
  });

  const summary = release.ai_summary;
  const aiOn = useAiEnabled();
  const canSummarise = can(org.role, "ai.release_summary") && aiOn;

  return (
    <>
      {crumbs}
      <div className="page-head">
        <div className="grow">
          <h1 style={{ overflowWrap: "anywhere" }}>{release.name} <ReadinessBadge readiness={release.readiness} /></h1>
          <p style={{ overflowWrap: "anywhere" }}>
            {release.description ? `${release.description} ` : ""}{STATUS_NAME[release.status]}. Target {release.target_date ? formatDate(release.target_date) : "not set"}.
          </p>
        </div>
        {canManage ? (
          <div className="actions">
            <Button onClick={() => setDialog("bugs")}><IconPlus />Link bugs</Button>
            <Button onClick={() => setDialog("runs")}><IconPlus />Link run</Button>
            {released ? null : <Button variant="primary" onClick={() => setDialog("release")}>Mark released</Button>}
            <Button variant="ghost" onClick={() => setDialog("edit")}>Edit release</Button>
            {released ? null : <Button variant="ghost" size="icon" aria-label="Delete release" onClick={() => setDialog("delete")}><IconTrash /></Button>}
          </div>
        ) : null}
      </div>
      <div className="split">
        <div className="stack">
          <section className="panel">
            <div className="panel-head"><h2>Why it is {READINESS_NAME[release.readiness].toLowerCase()}</h2></div>
            <div className="panel-body">
              <ul style={{ margin: 0, paddingLeft: 20, listStyle: "disc" }}>
                {release.reasons.map((x) => <li key={x} style={{ overflowWrap: "anywhere" }}>{x}</li>)}
              </ul>
              <p className="xs muted" style={{ marginTop: 12 }}>
                Blocked: any open Critical bug, or pass rate under 80%. At risk: open High bugs, pass rate under 95%, runs in progress, or no runs.
              </p>
            </div>
          </section>
          <section className="panel">
            <div className="panel-head"><h2>Linked bugs</h2><span className="small muted">{open} open of {release.bugs.length}</span></div>
            {release.bugs.length === 0 ? <div className="panel-body muted">No bugs linked.</div> : (
              <div className="table-wrap">
                <table className="t stackable">
                  <thead>
                    <tr>
                      <th>Key</th><th>Title</th><th>Status</th><th>Severity</th><th>Priority</th><th>Assignee</th><th>Updated</th>
                      {canManage ? <th><span className="sr-only">Actions</span></th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {release.bugs.map((b) => (
                      <tr key={b.id}>
                        <td data-label="Key" className="no-label"><span className="mono muted">{b.key}</span></td>
                        <td className="title-cell"><Link href={`/o/${encodeURIComponent(org.slug)}/bugs/${encodeURIComponent(b.key)}`} style={{ overflowWrap: "anywhere" }}>{b.title}</Link></td>
                        <td data-label="Status"><StatusBadge status={b.status} /></td>
                        <td data-label="Severity"><SeverityBadge severity={b.severity} /></td>
                        <td data-label="Priority"><PriorityTag priority={b.priority} /></td>
                        <td data-label="Assignee">
                          {b.assignee_id ? (
                            <span className="who"><Avatar id={b.assignee_id} name={b.assignee_name ?? ""} /><span>{b.assignee_name}</span></span>
                          ) : <span className="muted">Unassigned</span>}
                        </td>
                        <td data-label="Updated">
                          <span className="small" title={new Date(b.updated_at).toLocaleString()}>{timeAgo(b.updated_at)}</span>
                          {b.sla_breached ? <> <SlaBadge severity={b.severity} /></> : null}
                        </td>
                        {canManage ? (
                          <td data-label="Actions">
                            <Button variant="ghost" size="sm" aria-label={`Remove ${b.key} from the release`} disabled={unlinkBug.isPending} onClick={() => unlinkBug.mutate(b.id)}>Remove</Button>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section className="panel">
            <div className="panel-head"><h2>Linked test runs</h2></div>
            {release.runs.length === 0 ? <div className="panel-body muted">No runs linked.</div> : (
              <div className="table-wrap">
                <table className="t stackable">
                  <tbody>
                    {release.runs.map((r) => (
                      <tr key={r.id}>
                        <td className="title-cell">
                          <Link href={`/o/${encodeURIComponent(org.slug)}/runs/${encodeURIComponent(r.key)}`} style={{ overflowWrap: "anywhere" }}>{r.name}</Link>
                          <div className="xs muted mono">{r.key}</div>
                        </td>
                        <td data-label="Status">{runStatusName(r.status)}</td>
                        <td data-label="Progress" style={{ width: "36%" }}><ProgressBar counts={r.counts} /></td>
                        <td data-label="Pass rate"><b>{rateText(r.pass_rate)}</b></td>
                        {canManage ? (
                          <td data-label="Actions">
                            <Button variant="ghost" size="sm" aria-label={`Remove ${r.key} from the release`} disabled={unlinkRun.isPending} onClick={() => unlinkRun.mutate(r.id)}>Remove</Button>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
        <aside className="stack">
          {canSummarise ? <ReleaseSummaryPanel releaseId={release.id} hasSummary={!!summary} /> : null}
          {summary || !canSummarise ? (
          <section className="panel">
            <div className="panel-head"><h3>Release summary</h3></div>
            <div className="panel-body">
              {summary ? (
                <>
                  <p className="small" style={{ whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{summary}</p>
                  <p className="xs muted" style={{ marginTop: 12 }}>
                    Accepted{release.ai_summary_by_name ? ` by ${release.ai_summary_by_name}` : ""}{release.ai_summary_at ? ` on ${new Date(release.ai_summary_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : ""}. Drafted with AI.
                  </p>
                </>
              ) : <p className="small muted">No summary yet. A QA lead publishes one before the release.</p>}
            </div>
          </section>
          ) : null}
        </aside>
      </div>
      {dialog === "bugs" ? <LinkBugsDialog release={release} onClose={() => setDialog(null)} /> : null}
      {dialog === "runs" ? <LinkRunsDialog release={release} onClose={() => setDialog(null)} /> : null}
      {dialog === "edit" ? <ReleaseDialog release={release} onClose={() => setDialog(null)} onSaved={() => setDialog(null)} /> : null}
      {dialog === "release" ? (
        <Dialog
          title={`Mark ${release.name} as released?`}
          onClose={() => setDialog(null)}
          footer={
            <>
              <Button onClick={() => setDialog(null)}>Cancel</Button>
              <Button variant="primary" disabled={markReleased.isPending} onClick={() => markReleased.mutate()}>
                {markReleased.isPending ? <Spinner /> : null}
                Mark released
              </Button>
            </>
          }
        >
          <div className="modal-body">
            {release.readiness === "ready" ? (
              <p className="small">The release is ready. It cannot be deleted or moved back once it is released.</p>
            ) : (
              <>
                <p className="small"><b>This release is {READINESS_NAME[release.readiness].toLowerCase()}.</b> Readiness is advice: a QA Lead may still release it, and the audit log records the readiness at this moment.</p>
                <ul className="small" style={{ margin: "8px 0 0", paddingLeft: 20, listStyle: "disc" }}>
                  {release.reasons.map((x) => <li key={x} style={{ overflowWrap: "anywhere" }}>{x}</li>)}
                </ul>
              </>
            )}
          </div>
        </Dialog>
      ) : null}
      {dialog === "delete" ? (
        <Dialog
          title={`Delete ${release.name}?`}
          onClose={() => setDialog(null)}
          footer={
            <>
              <Button onClick={() => setDialog(null)}>Cancel</Button>
              <Button variant="primary" style={DANGER_FILL} disabled={remove.isPending} onClick={() => remove.mutate()}>
                {remove.isPending ? <Spinner /> : null}
                Delete release
              </Button>
            </>
          }
        >
          <div className="modal-body">
            <p className="small">
              The {release.linked_bug_count} linked {release.linked_bug_count === 1 ? "bug" : "bugs"} and {release.linked_run_count} linked {release.linked_run_count === 1 ? "run" : "runs"} stay,
              without a release. This cannot be undone.
            </p>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}
