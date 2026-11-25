"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { IconAlert, IconBug, IconPlus } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/feedback";
import { isApiError } from "@/lib/api/errors";
import { can } from "@/lib/permissions";
import { BugTable } from "@/modules/bugs/components/bug-table";
import { useOrg } from "@/modules/shell/org-context";
import { ProgressBar } from "@/modules/testing/components/progress-bar";

import { ComponentsDialog, EnvironmentsDialog } from "./components/manage-dialogs";
import { ProjectDialog } from "./components/project-dialog";
import { useProjectBugs, useProjectByKey, useProjectRuns } from "./hooks";
import { rateText, type ProjectDetail } from "./projects";

/**
 * SCR-07 Project overview (API-042, API-044, API-048; REQ-013 to REQ-016): the project's figures, its newest bugs and runs, and its
 * components and environments. Org Admin and QA Lead edit the project and manage components and environments. `projectKey` is the
 * key from the address (the API works with ids, so the key is looked up first).
 */
export function ProjectPage({ projectKey }: { projectKey: string }) {
  const org = useOrg();
  const project = useProjectByKey(projectKey);
  const crumbs = (label: string) => (
    <div className="crumbs">
      <Link href={`/o/${org.slug}/projects`}>Projects</Link> / <span className="mono">{label}</span>
    </div>
  );
  if (project.isPending) {
    return (
      <>
        {crumbs(projectKey.toUpperCase())}
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading</span>
          <div aria-hidden="true">
            <div className="sk sk-line" style={{ width: "40%", height: 28 }} />
            <div className="sk" style={{ height: 96, margin: "16px 0" }} />
            <div className="split">
              <div className="panel panel-body">{[90, 70, 100, 60, 85].map((w, i) => <div key={i} className="sk sk-line" style={{ width: `${w}%` }} />)}</div>
              <div className="panel panel-body">{[1, 2, 3, 4].map((i) => <div key={i} className="sk sk-line" />)}</div>
            </div>
          </div>
        </div>
      </>
    );
  }
  if (project.notFound || isApiError(project.error, "not_found")) {
    return (
      <>
        {crumbs(projectKey.toUpperCase())}
        <div className="panel">
          <div className="state-box error" role="alert">
            <IconAlert className="big" />
            <h2>This project was not found</h2>
            <p>It may have been deleted, or it belongs to a workspace you are not a member of.</p>
            <Link className="btn primary" href={`/o/${org.slug}/projects`}>Back to projects</Link>
          </div>
        </div>
      </>
    );
  }
  if (project.isError || !project.data) {
    return (
      <>
        {crumbs(projectKey.toUpperCase())}
        <ErrorState what="this project" onRetry={project.refetch} requestId={isApiError(project.error) ? project.error.requestId : undefined} />
      </>
    );
  }
  return <Loaded project={project.data} crumbs={crumbs(project.data.key)} />;
}

function Loaded({ project, crumbs }: { project: ProjectDetail; crumbs: React.ReactNode }) {
  const org = useOrg();
  const router = useRouter();
  const [dialog, setDialog] = useState<"edit" | "components" | "environments" | null>(null);
  const canManage = can(org.role, "project.manage");
  const bugs = useProjectBugs(project.id);
  const runs = useProjectRuns(project.id);
  const critical = project.critical_bug_count;
  const archived = project.archived_at !== null;

  return (
    <>
      {crumbs}
      <div className="page-head">
        <div className="grow">
          <h1 style={{ overflowWrap: "anywhere" }}>{project.name} <span className="mono muted" style={{ fontSize: 16 }}>{project.key}</span></h1>
          {project.description ? <p style={{ overflowWrap: "anywhere" }}>{project.description}</p> : null}
          {archived ? <p className="small muted">This project is archived. Its bugs and tests stay readable; it takes nothing new.</p> : null}
        </div>
        {canManage && !archived ? <div className="actions"><Button onClick={() => setDialog("edit")}>Edit project</Button></div> : null}
      </div>
      <section className="readout" aria-label="Project numbers">
        <div><div className="num">{project.open_bug_count}</div><div className="cap">Open bugs</div></div>
        <div className={critical ? "alert" : ""}><div className="num">{critical}</div><div className="cap">Open Critical</div></div>
        <div><div className="num">{project.pass_rate === null ? "None" : `${project.pass_rate}%`}</div><div className="cap">Pass rate, all runs</div></div>
        <div><div className="num">{project.suite_count}</div><div className="cap">Test suites</div></div>
      </section>
      <div className="split">
        <div className="stack">
          <section className="panel">
            <div className="panel-head"><h2>Recently updated bugs</h2><Link className="small" href={`/o/${org.slug}/bugs?project=${project.id}`}>All bugs</Link></div>
            {bugs.isPending ? <div className="panel-body">{[90, 70, 100].map((w, i) => <div key={i} className="sk sk-line" style={{ width: `${w}%` }} />)}</div>
              : bugs.isError ? <div className="panel-body"><ErrorState what="the bugs" onRetry={() => void bugs.refetch()} requestId={isApiError(bugs.error) ? bugs.error.requestId : undefined} /></div>
              : bugs.data.items.length ? <BugTable items={bugs.data.items} sort="-updated_at" onSort={() => undefined} />
              : (
                <div className="state-box">
                  <IconBug className="big" />
                  <h2>No bugs in {project.name}</h2>
                  <p>Bugs reported for this project will show up here.</p>
                  {can(org.role, "bug.create") && !archived ? <Link className="btn primary" href={`/o/${org.slug}/bugs/new`}><IconPlus />Report bug</Link> : null}
                </div>
              )}
          </section>
          <section className="panel">
            <div className="panel-head"><h2>Latest test runs</h2><Link className="small" href={`/o/${org.slug}/runs`}>All runs</Link></div>
            {runs.isPending ? <div className="panel-body">{[90, 70].map((w, i) => <div key={i} className="sk sk-line" style={{ width: `${w}%` }} />)}</div>
              : runs.isError ? <div className="panel-body small muted">Could not load the runs.</div>
              : runs.data.items.length ? (
                <div className="table-wrap">
                  <table className="t stackable">
                    <tbody>
                      {runs.data.items.map((r) => (
                        <tr key={r.id}>
                          <td className="title-cell"><Link href={`/o/${org.slug}/runs/${r.key}`} style={{ overflowWrap: "anywhere" }}>{r.name}</Link></td>
                          <td data-label="Progress" style={{ width: "40%" }}><ProgressBar counts={r.counts} /></td>
                          <td data-label="Pass rate">{rateText(r.pass_rate ?? null)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <div className="panel-body muted">No runs yet.</div>}
          </section>
        </div>
        <div className="stack">
          <section className="panel">
            <div className="panel-head">
              <h3>Components</h3>
              {canManage && !archived ? <Button size="sm" onClick={() => setDialog("components")}><IconPlus />Add</Button> : null}
            </div>
            {project.components.length ? (
              <div className="table-wrap">
                <table className="t">
                  <tbody>
                    {project.components.map((c) => (
                      <tr key={c.id}>
                        <td style={{ overflowWrap: "anywhere" }}>{c.name}</td>
                        <td style={{ textAlign: "right" }} className="muted small">{c.open_bug_count} open</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className="panel-body small muted">No components yet.</div>}
          </section>
          <section className="panel">
            <div className="panel-head">
              <h3>Environments</h3>
              {canManage && !archived ? <Button size="sm" onClick={() => setDialog("environments")}><IconPlus />Add</Button> : null}
            </div>
            <div className="panel-body row">
              {project.environments.length
                ? project.environments.map((e) => <span key={e.id} className="label-chip mono" style={{ overflowWrap: "anywhere" }}>{e.name}</span>)
                : <span className="small muted">No environments yet.</span>}
            </div>
          </section>
        </div>
      </div>
      {dialog === "edit" ? (
        <ProjectDialog project={project} onClose={() => setDialog(null)} onSaved={() => setDialog(null)} onArchived={() => router.push(`/o/${org.slug}/projects`)} />
      ) : null}
      {dialog === "components" ? <ComponentsDialog project={project} components={project.components} onClose={() => setDialog(null)} /> : null}
      {dialog === "environments" ? <EnvironmentsDialog project={project} environments={project.environments} onClose={() => setDialog(null)} /> : null}
    </>
  );
}
