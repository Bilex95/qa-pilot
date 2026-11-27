"use client";

import Link from "next/link";
import { useState } from "react";

import { IconLock, IconMeter, IconSpark } from "@/components/icons";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Banner, EmptyState, ErrorState, LoadingPanel } from "@/components/ui/feedback";
import { Select } from "@/components/ui/field";
import { isApiError } from "@/lib/api/errors";
import { can, ROLE_NAMES } from "@/lib/permissions";
import { timeAgo } from "@/modules/bugs/schemas";
import { useOrg } from "@/modules/shell/org-context";

import { useUsageLog, useUsageSummary, type UsageRow } from "./hooks";

const FEATURES: Record<UsageRow["feature"], string> = {
  bug_writer: "Bug Writer", explain_log: "Explain log", triage: "Triage", duplicates: "Duplicate check",
  test_cases: "Test case generator", release_summary: "Release summary",
};
const OUTCOMES = { accepted: "Accepted", edited: "Edited", discarded: "Discarded" } as const;
const RANGES = [["30", "Last 30 days"], ["7", "Last 7 days"]] as const;
const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const num = (n: number) => n.toLocaleString("en-US");

/**
 * SCR-21 AI usage (API-146, API-147; REQ-051): the totals by feature and the request log of the workspace for the last 7 or 30 days.
 * Only metadata is kept, never the text. Org Admin and QA Lead.
 */
export function UsagePage() {
  const org = useOrg();
  const allowed = can(org.role, "ai.usage_read");
  const [days, setDays] = useState<(typeof RANGES)[number][0]>("30");
  const [page, setPage] = useState(1);
  const to = new Date();
  const from = iso(new Date(to.getTime() - (Number(days) - 1) * DAY));
  const summary = useUsageSummary(from, iso(to), allowed);
  const log = useUsageLog(from, iso(to), page, allowed);

  const head = (
    <div className="page-head">
      <div className="grow">
        <h1>AI usage</h1>
        <p>Every AI request in this workspace. Only metadata is kept, never the text.</p>
      </div>
      {allowed ? (
        <div className="actions">
          <label className="sr-only" htmlFor="ai-r">Range</label>
          <Select id="ai-r" style={{ width: "auto" }} value={days} onChange={(e) => { setDays(e.target.value as typeof days); setPage(1); }}>
            {RANGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </div>
      ) : null}
    </div>
  );

  if (!allowed) {
    return (
      <>
        {head}
        <EmptyState icon={IconLock} title="You do not have access to AI usage">
          Your role is {ROLE_NAMES[org.role]}. Ask an Org Admin if you need access.
        </EmptyState>
      </>
    );
  }
  if (summary.isPending || log.isPending) return <>{head}<LoadingPanel rows={8} /></>;
  if (summary.isError || log.isError || !summary.data || !log.data) {
    const failure = summary.error ?? log.error;
    return (
      <>
        {head}
        <ErrorState what="AI usage" onRetry={() => { void summary.refetch(); void log.refetch(); }} requestId={isApiError(failure) ? failure.requestId : undefined} />
      </>
    );
  }

  const s = summary.data;
  const order = Object.keys(FEATURES);
  const rows = [...s.totals_by_feature].sort((a, b) => order.indexOf(a.feature) - order.indexOf(b.feature));
  const calls = rows.reduce((n, r) => n + r.calls, 0);
  if (calls === 0 && log.data.total === 0) {
    return (
      <>
        {head}
        <EmptyState icon={IconMeter} title="No AI requests yet"
          action={<Link className="btn" href={`/o/${org.slug}/bugs/new`}><IconSpark />Try the Bug Writer</Link>}>
          When people use the Bug Writer, triage, duplicate check, test case generator or release summary, each request appears here.
        </EmptyState>
      </>
    );
  }
  // Acceptance counts the features that track an outcome, weighted by their calls; the response time is the mean weighted the same way.
  const tracked = rows.filter((r) => r.acceptance_rate !== null && r.feature !== "duplicates");
  const trackedCalls = tracked.reduce((n, r) => n + r.calls, 0);
  const accepted = trackedCalls ? Math.round(tracked.reduce((n, r) => n + (r.acceptance_rate ?? 0) * r.calls, 0) / trackedCalls) : null;
  const avgMs = calls ? rows.reduce((n, r) => n + r.avg_latency_ms * r.calls, 0) / calls : 0;
  const mock = s.provider === "mock";
  const first = (page - 1) * 10 + 1;
  const last = first + log.data.items.length - 1;

  return (
    <>
      {head}
      <section className="readout" aria-label="Key numbers">
        <div><div className="num">{s.used_today}</div><div className="cap">Requests today</div><div className="sub">Limit {num(s.daily_limit)} per day</div></div>
        <div><div className="num">{num(calls)}</div><div className="cap">Requests, {days} days</div></div>
        <div>
          <div className="num">{accepted === null ? "n/a" : `${accepted}%`}</div><div className="cap">Suggestions accepted</div>
          <div className="sub">Accepted or edited, excluding duplicate checks</div>
        </div>
        <div><div className="num">{seconds(avgMs)}</div><div className="cap">Average response time</div></div>
      </section>
      <div style={{ marginBottom: 16 }}>
        <Banner kind="info">
          Provider <b>{mock ? "mock (offline)" : s.provider}</b>, model <span className="mono">{s.model}</span>.
          {mock ? " Token counts are estimates while the mock provider is active." : ""}
          {s.ai_enabled ? "" : " AI is switched off for this workspace."}
        </Banner>
      </div>
      <section className="panel">
        <div className="panel-head"><h2>By feature</h2></div>
        <div className="table-wrap">
          <table className="t stackable">
            <thead><tr><th>Feature</th><th>Requests</th><th>Input tokens</th><th>Output tokens</th><th>Avg time</th><th>Accepted</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.feature}>
                  <td className="title-cell"><b>{FEATURES[r.feature]}</b></td>
                  <td data-label="Requests">{num(r.calls)}</td>
                  <td data-label="Input tokens">{num(r.input_tokens)}</td>
                  <td data-label="Output tokens">{num(r.output_tokens)}</td>
                  <td data-label="Avg time">{seconds(r.avg_latency_ms)}</td>
                  <td data-label="Accepted">{r.feature === "duplicates" || r.acceptance_rate === null ? <span className="muted">Not tracked</span> : `${Math.round(r.acceptance_rate)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-head"><h2>Recent requests</h2></div>
        <div className="table-wrap">
          <table className="t stackable">
            <thead><tr><th>When</th><th>Person</th><th>Feature</th><th>Result</th><th>Tokens</th><th>Time</th><th>Outcome</th></tr></thead>
            <tbody>
              {log.data.items.map((r) => (
                <tr key={r.id}>
                  <td data-label="When" className="small">{timeAgo(r.created_at)}</td>
                  <td data-label="Person">
                    {r.user_id && r.user_name ? <span className="who"><Avatar id={r.user_id} name={r.user_name} /><span>{r.user_name}</span></span> : <span className="muted">Removed user</span>}
                  </td>
                  <td data-label="Feature">{FEATURES[r.feature]}</td>
                  <td data-label="Result">
                    <span className={`badge ${r.status === "ok" ? "ready" : "at_risk"}`}>{r.status === "ok" ? "OK" : r.status === "fallback" ? "Fallback used" : r.status === "rate_limited" ? "Limit reached" : "Failed"}</span>
                  </td>
                  <td data-label="Tokens">{num(r.input_tokens + r.output_tokens)}</td>
                  <td data-label="Time">{seconds(r.latency_ms)}</td>
                  <td data-label="Outcome" className="small">{r.outcome ? OUTCOMES[r.outcome] : <span className="muted">None</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pager">
          <span className="grow" role="status">{log.data.items.length ? `Showing ${first} to ${last} of ${log.data.total}` : "No requests in this range"}</span>
          <Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <Button size="sm" disabled={last >= log.data.total} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      </section>
    </>
  );
}
