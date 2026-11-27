"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { IconPlus, IconRun } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/feedback";
import { can } from "@/lib/permissions";
import { isApiError } from "@/lib/api/errors";
import { timeAgo } from "@/modules/bugs/schemas";
import { useOrg } from "@/modules/shell/org-context";

import { NewRunDialog } from "./components/new-run-dialog";
import { ProgressBar } from "./components/progress-bar";
import { RESULT_KINDS, RESULT_LABEL, RUNS_PAGE_SIZE, executedCount, rateText, runStatusName } from "./runs";
import { useRuns } from "./runs-hooks";

/**
 * SCR-14 Test runs (API-101, API-102; REQ-032). Everyone reads; Org Admin, QA Lead and QA Engineer start runs (run.create). The page
 * is in the address. Filters by project, status and release are in the API and arrive with the screens that need them.
 */
export function RunsPage() {
  const org = useOrg();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [creating, setCreating] = useState(false);
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
  const runs = useRuns(page);
  const canCreate = can(org.role, "run.create");

  const start = canCreate ? (
    <Button variant="primary" onClick={() => setCreating(true)}>
      <IconPlus />
      New test run
    </Button>
  ) : undefined;
  const head = (
    <div className="page-head">
      <div className="grow">
        <h1>Test runs</h1>
        <p>Execute cases against an environment and track results.</p>
      </div>
      {start ? <div className="actions">{start}</div> : null}
    </div>
  );
  const dialog = creating ? (
    <NewRunDialog onClose={() => setCreating(false)} onCreated={(run) => router.push(`/o/${encodeURIComponent(org.slug)}/runs/${encodeURIComponent(run.key)}`)} />
  ) : null;

  if (runs.isPending) return <>{head}<TableSkeleton /></>;
  if (runs.isError || !runs.data) {
    return <>{head}<ErrorState what="test runs" onRetry={() => void runs.refetch()} requestId={isApiError(runs.error) ? runs.error.requestId : undefined} /></>;
  }
  const data = runs.data;
  if (data.total === 0) {
    return (
      <>
        {head}
        <EmptyState icon={IconRun} title="No test runs yet" action={start}>
          Start a run from one or more suites. Each run keeps a snapshot of the cases so results stay accurate.
        </EmptyState>
        {dialog}
      </>
    );
  }
  const first = (page - 1) * RUNS_PAGE_SIZE + 1;
  const last = Math.min(page * RUNS_PAGE_SIZE, data.total);
  const goPage = (p: number) => router.push(p > 1 ? `${pathname}?page=${p}` : pathname);

  return (
    <>
      {head}
      <div className="panel">
        <div className="filters">
          <div className="legend">
            {RESULT_KINDS.map((k) => <span key={k}><i style={{ background: `var(--res-${k})` }} />{k === "untested" ? "Untested" : RESULT_LABEL[k]}</span>)}
          </div>
        </div>
        <div className="table-wrap">
          <table className="t stackable">
            <thead>
              <tr>
                <th>Run</th><th>Status</th><th>Environment</th><th>Release</th><th style={{ width: "24%" }}>Progress</th><th>Pass rate</th><th>Started</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.id}>
                  <td className="title-cell">
                    <Link href={`/o/${encodeURIComponent(org.slug)}/runs/${encodeURIComponent(r.key)}`} style={{ overflowWrap: "anywhere" }}>{r.name}</Link>
                    <div className="xs muted mono">{r.key}</div>
                  </td>
                  <td data-label="Status"><span className={`badge ${r.status === "completed" ? "st-verified" : "st-in_progress"}`}>{runStatusName(r.status)}</span></td>
                  <td data-label="Environment">{r.environment ? <span className="mono small" style={{ overflowWrap: "anywhere" }}>{r.environment}</span> : <span className="muted">None</span>}</td>
                  <td data-label="Release">
                    {r.release_id ? <span style={{ overflowWrap: "anywhere" }}>{r.release_name}</span> : <span className="muted">None</span>}
                  </td>
                  <td data-label="Progress">
                    <ProgressBar counts={r.counts} />
                    <div className="xs muted" style={{ marginTop: 4 }}>{executedCount(r.counts)} of {r.total} executed</div>
                  </td>
                  <td data-label="Pass rate"><b>{rateText(r.pass_rate)}</b></td>
                  <td data-label="Started" className="small">
                    <span title={new Date(r.started_at).toLocaleString()}>{timeAgo(r.started_at)}</span> by {r.created_by_name.split(" ")[0]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.total > RUNS_PAGE_SIZE ? (
          <div className="pager">
            <span className="grow" role="status">Showing {first} to {last} of {data.total}</span>
            <Button size="sm" disabled={page <= 1} onClick={() => goPage(page - 1)}>Previous</Button>
            <Button size="sm" disabled={last >= data.total} onClick={() => goPage(page + 1)}>Next</Button>
          </div>
        ) : null}
      </div>
      {dialog}
    </>
  );
}
