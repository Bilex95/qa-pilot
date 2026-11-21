"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { IconReport } from "@/components/icons";
import { Button, Spinner } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingPanel } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { StatusBadge } from "@/modules/bugs/components/bug-badges";
import { useProjects } from "@/modules/bugs/hooks";
import { useOrg } from "@/modules/shell/org-context";

import { HBars, LineChart, TrendLegend, VBars } from "./components/charts";
import { useSummary, useTrend, type Range } from "./hooks";

const PRESETS = [["30", "Last 30 days"], ["7", "Last 7 days"], ["90", "Last 90 days"], ["custom", "Custom range"]] as const;
const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

function presetRange(days: number): Range {
  const to = new Date();
  return { from: iso(new Date(to.getTime() - (days - 1) * DAY)), to: iso(to) };
}

const longDate = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/**
 * SCR-18 Reports (API-131 to API-133; REQ-039 to REQ-041): the trend, the pass rate per run, bugs by status and open bugs per person for
 * the chosen project and dates (at most 366 days), and the CSV export of the project's bugs. Dates are UTC days.
 */
export function ReportsPage() {
  const org = useOrg();
  const toast = useToast();
  const projects = useProjects();
  const [project, setProject] = useState("");
  const [preset, setPreset] = useState<(typeof PRESETS)[number][0]>("30");
  const [custom, setCustom] = useState<Range>(presetRange(30));
  const range = preset === "custom" ? custom : presetRange(Number(preset));
  const days = Math.round((new Date(`${range.to}T00:00:00Z`).getTime() - new Date(`${range.from}T00:00:00Z`).getTime()) / DAY) + 1;
  const badRange = !range.from || !range.to || range.to < range.from ? "The end date is before the start date." : days > 366 ? "Pick at most 366 days." : null;
  const usable: Range = badRange ? presetRange(30) : range;
  const trend = useTrend(project, usable);
  const summary = useSummary(project, usable);

  const exportCsv = useMutation({
    mutationFn: async () => {
      const { data, response, error } = await api.GET("/api/v1/orgs/{org_id}/reports/bugs.csv", {
        params: { path: { org_id: org.id }, query: { project_id: project || undefined } }, parseAs: "blob",
      });
      if (error !== undefined || !response.ok || !data) throw new Error("export failed");
      const url = URL.createObjectURL(data as Blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "bugs.csv";
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    },
    onSuccess: () => toast("Exported to CSV"),
    onError: () => toast("Could not export the bugs. Try again.", "error"),
  });

  const head = (
    <div className="page-head">
      <div className="grow">
        <h1>Reports</h1>
        <p>Trends and workload for the period you choose.</p>
      </div>
      <div className="actions">
        <Button onClick={() => exportCsv.mutate()} disabled={exportCsv.isPending}>
          {exportCsv.isPending ? <Spinner /> : null}
          Export CSV
        </Button>
      </div>
    </div>
  );
  const filters = (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div className="filters" style={{ border: 0 }}>
        <label className="sr-only" htmlFor="rp-p">Project</label>
        <Select id="rp-p" value={project} onChange={(e) => setProject(e.target.value)}>
          <option value="">All projects</option>
          {(projects.data?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <label className="sr-only" htmlFor="rp-r">Date range</label>
        <Select id="rp-r" value={preset} onChange={(e) => setPreset(e.target.value as typeof preset)}>
          {PRESETS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
        {preset === "custom" ? (
          <>
            <label className="sr-only" htmlFor="rp-f">From</label>
            <Input id="rp-f" type="date" style={{ width: "auto" }} value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} aria-invalid={badRange ? true : undefined} />
            <label className="sr-only" htmlFor="rp-t">To</label>
            <Input id="rp-t" type="date" style={{ width: "auto" }} value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} aria-invalid={badRange ? true : undefined} />
          </>
        ) : null}
        <span className="small muted">{longDate(usable.from)} to {longDate(usable.to)}</span>
        {badRange ? <span className="small" role="alert" style={{ color: "var(--danger)" }}>{badRange} Showing the last 30 days.</span> : null}
      </div>
    </div>
  );

  if (trend.isPending || summary.isPending) return <>{head}{filters}<LoadingPanel rows={8} /></>;
  const failure = trend.error ?? summary.error;
  if (trend.isError || summary.isError || !trend.data || !summary.data) {
    return (
      <>
        {head}{filters}
        <ErrorState what="reports" onRetry={() => { void trend.refetch(); void summary.refetch(); }} requestId={isApiError(failure) ? failure.requestId : undefined} />
      </>
    );
  }
  const t = trend.data;
  const s = summary.data;
  const quiet = s.total === 0 && t.every((p) => p.opened === 0 && p.closed === 0) && s.run_pass_rate.length === 0;
  if (quiet) {
    return (
      <>
        {head}{filters}
        <EmptyState icon={IconReport} title="No activity in this range"
          action={preset !== "90" ? <Button onClick={() => setPreset("90")}>Show last 90 days</Button> : undefined}>
          No bugs were opened or closed and no runs were executed between these dates. Pick a wider range.
        </EmptyState>
      </>
    );
  }
  return (
    <>
      {head}{filters}
      <div className="grid g2">
        <section className="panel">
          <div className="panel-head"><h2>Opened and closed per day</h2><TrendLegend /></div>
          <div className="panel-body">
            <LineChart points={t} label={`Bugs opened and closed per day, ${t.length} days`} />
            <details className="small" style={{ marginTop: 8 }}>
              <summary>Show as table</summary>
              <div className="table-wrap">
                <table className="t">
                  <thead><tr><th>Day</th><th>Opened</th><th>Closed</th><th>Open at the end</th></tr></thead>
                  <tbody>
                    {t.slice(-14).map((p) => <tr key={p.date}><td>{longDate(p.date)}</td><td>{p.opened}</td><td>{p.closed}</td><td>{p.open_total}</td></tr>)}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Pass rate per run</h2></div>
          <div className="panel-body">
            {s.run_pass_rate.length ? <VBars label="Pass rate per run" rows={s.run_pass_rate.map((r) => ({ key: r.key, name: r.name, value: r.pass_rate }))} />
              : <p className="small muted">No run with a decided result started in this range.</p>}
          </div>
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Bugs by status</h2></div>
          <div className="panel-body">
            <HBars label="Bugs by status" rows={s.by_status.map((x) => ({ key: x.status, label: <StatusBadge status={x.status} />, text: x.status, value: x.count }))} />
          </div>
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Open bugs per person</h2></div>
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Assignee</th><th>Open</th><th>Critical</th><th>Past SLA</th></tr></thead>
              <tbody>
                {s.by_assignee.map((r) => (
                  <tr key={r.user_id ?? "none"}>
                    <td style={{ overflowWrap: "anywhere" }}>{r.user_id ? r.name : <span className="muted">Unassigned</span>}</td>
                    <td>{r.open}</td><td>{r.critical}</td><td>{r.sla_breached}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
