"use client";

import Link from "next/link";
import { useState } from "react";

import { IconDash, IconPlus } from "@/components/icons";
import { EmptyState, ErrorState, LoadingPanel } from "@/components/ui/feedback";
import { Select } from "@/components/ui/field";
import { isApiError } from "@/lib/api/errors";
import { can } from "@/lib/permissions";
import { useSession } from "@/lib/session/session-provider";
import { SeverityBadge } from "@/modules/bugs/components/bug-badges";
import { BugTable } from "@/modules/bugs/components/bug-table";
import { useProjects } from "@/modules/bugs/hooks";
import { SEVERITY_OPTIONS } from "@/modules/bugs/schemas";
import { ReadinessBadge } from "@/modules/releases/components/readiness-badge";
import { formatDate } from "@/modules/releases/releases";
import { useOrg } from "@/modules/shell/org-context";

import { HBars, LineChart, TrendLegend } from "./components/charts";
import { useDashboard, useMyOpenBugs } from "./hooks";

/**
 * SCR-05 Dashboard (API-130; REQ-038). Every figure comes from the server in one request; the project select narrows all of them.
 * Without a single bug the page shows the empty state, never charts filled with zeros.
 */
export function DashboardPage() {
  const org = useOrg();
  const { me } = useSession();
  const projects = useProjects();
  const [project, setProject] = useState("");
  const dash = useDashboard(project);
  const isDeveloper = org.role === "developer";
  const mine = useMyOpenBugs(me?.user.id, isDeveloper);
  const d = dash.data;

  const head = (
    <div className="page-head">
      <div className="grow">
        <h1>Dashboard</h1>
        <p>{isDeveloper && d ? `You have ${d.my_assigned_count} open ${d.my_assigned_count === 1 ? "bug" : "bugs"} assigned to you.` : `Quality across all projects in ${org.name}.`}</p>
      </div>
      <div className="actions">
        <label className="sr-only" htmlFor="d-proj">Project</label>
        <Select id="d-proj" style={{ width: "auto" }} value={project} onChange={(e) => setProject(e.target.value)}>
          <option value="">All projects</option>
          {(projects.data?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </div>
    </div>
  );

  if (dash.isPending) return <>{head}<LoadingPanel rows={8} /></>;
  if (dash.isError || !d) {
    return <>{head}<ErrorState what="the dashboard" onRetry={() => void dash.refetch()} requestId={isApiError(dash.error) ? dash.error.requestId : undefined} /></>;
  }
  if (!d.has_data) {
    return (
      <>
        {head}
        <EmptyState icon={IconDash} title="Nothing to measure yet"
          action={can(org.role, "project.create") ? <Link className="btn primary" href={`/o/${encodeURIComponent(org.slug)}/projects`}><IconPlus />Create a project</Link> : undefined}>
          Create a project and report the first bug. Charts fill in as your team works.
        </EmptyState>
      </>
    );
  }

  const s = d.open_by_severity;
  const week = d.trend.slice(-7);
  return (
    <>
      {head}
      <section className="readout" aria-label="Key numbers">
        <div><div className="num">{d.open_total}</div><div className="cap">Open bugs</div><div className="sub">{d.finished_total} resolved or closed</div></div>
        <div className={s.critical ? "alert" : ""}>
          <div className="num">{s.critical}</div><div className="cap">Open Critical</div><div className="sub">{d.critical_untriaged} not triaged yet</div>
        </div>
        <div className={d.sla_breached ? "alert" : ""}>
          <div className="num">{d.sla_breached}</div><div className="cap">Past SLA</div>
          <div className="sub"><Link href={`/o/${encodeURIComponent(org.slug)}/bugs?status=any&sla=1${project ? `&project=${encodeURIComponent(project)}` : ""}`}>See breaching bugs</Link></div>
        </div>
        <div>
          <div className="num">{d.pass_rate.last_7_days === null ? "n/a" : `${d.pass_rate.last_7_days}%`}</div>
          <div className="cap">Run pass rate, 7 days</div><div className="sub">{d.pass_rate.runs} {d.pass_rate.runs === 1 ? "run" : "runs"}</div>
        </div>
      </section>
      <div className="grid g2">
        <section className="panel">
          <div className="panel-head"><h2>Open bugs by severity</h2></div>
          <div className="panel-body">
            <HBars label="Open bugs by severity" rows={SEVERITY_OPTIONS.map(([k]) => ({
              key: k, label: <SeverityBadge severity={k} />, text: k, value: s[k] }))} />
          </div>
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Opened and closed, last 30 days</h2><TrendLegend /></div>
          <div className="panel-body">
            <LineChart points={d.trend} label="Bugs opened and closed per day, last 30 days" />
            <details className="small" style={{ marginTop: 8 }}>
              <summary>Show as table</summary>
              <div className="table-wrap">
                <table className="t">
                  <thead><tr><th>Day</th><th>Opened</th><th>Closed</th></tr></thead>
                  <tbody>
                    {week.map((p) => (
                      <tr key={p.date}><td>{new Date(`${p.date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}</td><td>{p.opened}</td><td>{p.closed}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Components with most open bugs</h2></div>
          <div className="panel-body">
            {d.top_components.length ? (
              <HBars label="Components with most open bugs" rows={d.top_components.map((c, i) => ({ key: `${i}-${c.name}`, label: c.name, text: c.name, value: c.open }))} />
            ) : <p className="small muted">No open bugs.</p>}
          </div>
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Release readiness</h2><Link className="small" href={`/o/${encodeURIComponent(org.slug)}/releases`}>All releases</Link></div>
          {d.releases.length === 0 ? <div className="panel-body small muted">No releases in progress.</div> : (
            <div className="table-wrap">
              <table className="t">
                <tbody>
                  {d.releases.map((r) => (
                    <tr key={r.id}>
                      <td className="title-cell">
                        <Link href={`/o/${encodeURIComponent(org.slug)}/releases/${encodeURIComponent(r.id)}`} style={{ overflowWrap: "anywhere" }}>{r.name}</Link>
                        <div className="xs muted">Target {r.target_date ? formatDate(r.target_date) : "not set"}</div>
                      </td>
                      <td><ReadinessBadge readiness={r.readiness} /></td>
                      <td className="small muted" style={{ overflowWrap: "anywhere" }}>{r.reasons[0]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
      {isDeveloper ? (
        <section className="panel" style={{ marginTop: 16 }}>
          <div className="panel-head"><h2>Assigned to you</h2></div>
          {mine.data && mine.data.items.length ? <BugTable items={mine.data.items} sort="-updated_at" onSort={() => undefined} />
            : <div className="panel-body small muted">{mine.isPending ? "Loading." : "Nothing is assigned to you."}</div>}
        </section>
      ) : null}
    </>
  );
}
