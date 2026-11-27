"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { IconAlert, IconBug, IconChevron } from "@/components/icons";
import { Button, Spinner } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ErrorState } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api, unwrap } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { can } from "@/lib/permissions";
import { useOrg } from "@/modules/shell/org-context";

import { ProgressBar } from "./components/progress-bar";
import {
  RESULT_BUTTON, RESULT_KINDS, RESULT_LABEL, runStatusName, type ResultKind, type Run, type RunResult, type RunSummary,
} from "./runs";
import { useRun } from "./runs-hooks";

const ACTUAL_MAX = 5000;

function countsOf(results: RunResult[]): RunSummary["counts"] {
  const c = { pass: 0, fail: 0, blocked: 0, skipped: 0, untested: 0 };
  for (const r of results) c[r.result]++;
  return c;
}

/** Pass over decided (pass, fail, blocked), halves rounded up, as the API and the prototype do. */
function rateOf(c: RunSummary["counts"]): number | null {
  const decided = c.pass + c.fail + c.blocked;
  return decided ? Math.round((100 * c.pass) / decided) : null;
}

/**
 * SCR-15 Test run (API-103 to API-106; REQ-032 to REQ-034). Set a result per case, say where a failure happened, start a bug from a
 * failed step, and complete the run. A completed run is read only. `runRef` is the key from the address (R-31).
 */
export function RunPage({ runRef }: { runRef: string }) {
  const org = useOrg();
  const run = useRun(runRef);
  const crumbs = (
    <div className="crumbs">
      <Link href={`/o/${encodeURIComponent(org.slug)}/runs`}>Test runs</Link> / <span className="mono" style={{ fontSize: "1em" }}>{runRef.toUpperCase()}</span>
    </div>
  );
  if (run.isPending) {
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
            <div className="panel panel-body">{[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="sk sk-line" />)}</div>
          </div>
        </div>
      </>
    );
  }
  if (run.isError || !run.data) {
    const missing = isApiError(run.error, "not_found");
    return (
      <>
        {crumbs}
        {missing ? (
          <div className="panel">
            <div className="state-box error" role="alert">
              <IconAlert className="big" />
              <h2>Run {runRef.toUpperCase()} was not found</h2>
              <p>It may belong to a workspace you are not a member of.</p>
              <Link className="btn primary" href={`/o/${encodeURIComponent(org.slug)}/runs`}>Back to test runs</Link>
            </div>
          </div>
        ) : (
          <ErrorState what="this run" onRetry={() => void run.refetch()} requestId={isApiError(run.error) ? run.error.requestId : undefined} />
        )}
      </>
    );
  }
  return <Loaded run={run.data} runRef={runRef} crumbs={crumbs} />;
}

function Loaded({ run, runRef, crumbs }: { run: Run; runRef: string; crumbs: React.ReactNode }) {
  const org = useOrg();
  const qc = useQueryClient();
  const toast = useToast();
  const key = ["test-run", org.id, runRef];
  const firstFailed = run.results.find((r) => r.result === "fail") ?? run.results[0];
  const [open, setOpen] = useState<string | null>(firstFailed?.id ?? null);
  const [confirm, setConfirm] = useState(false);
  const running = run.status === "in_progress";
  const canRun = can(org.role, "run.execute") && running;
  const counts = countsOf(run.results);
  const executed = counts.pass + counts.fail + counts.blocked + counts.skipped;

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["test-run", org.id] });
    void qc.invalidateQueries({ queryKey: ["test-runs", org.id] });
    void qc.invalidateQueries({ queryKey: ["test-suites", org.id] });
    void qc.invalidateQueries({ queryKey: ["releases", org.id] }); // results and completion move the readiness of the run's release
  };

  const mark = useMutation({
    mutationFn: ({ result, body }: { result: RunResult; body: { result: ResultKind; failed_step_index?: number; actual_result?: string } }) =>
      unwrap(api.PATCH("/api/v1/orgs/{org_id}/test-runs/{run_id}/results/{result_id}", {
        params: { path: { org_id: org.id, run_id: run.id, result_id: result.id } }, body,
      })),
    onMutate: async ({ result, body }) => {
      await qc.cancelQueries({ queryKey: key });
      const before = qc.getQueryData<Run>(key);
      if (before) {
        qc.setQueryData<Run>(key, {
          ...before,
          results: before.results.map((r) => (r.id !== result.id ? r : {
            ...r, result: body.result,
            failed_step_index: body.result === "fail" ? (body.failed_step_index ?? r.failed_step_index) : null,
            actual_result: body.result === "fail" ? (body.actual_result ?? r.actual_result) : "",
          })),
        });
      }
      return { before };
    },
    onError: (err, vars, ctx) => {
      if (ctx?.before) qc.setQueryData<Run>(key, ctx.before); // the old result comes back
      if (isApiError(err, "run_completed")) toast(`${run.key} was completed by someone else. Results are read only now.`, "error");
      else if (isApiError(err, "forbidden")) toast("Your role cannot record results.", "error");
      else toast(`Could not save the result for ${vars.result.case_key}. Try again.`, "error");
    },
    onSettled: refresh,
  });

  const complete = useMutation({
    mutationFn: () => unwrap(api.PATCH("/api/v1/orgs/{org_id}/test-runs/{run_id}", { params: { path: { org_id: org.id, run_id: run.id } }, body: { status: "completed" } })),
    onSuccess: () => toast("Run completed. Results are now read only."),
    onError: (err) => {
      if (isApiError(err, "run_completed")) toast(`${run.key} was already completed.`);
      else toast("Could not complete the run. Try again.", "error");
    },
    onSettled: () => {
      setConfirm(false);
      refresh();
    },
  });

  const rate = rateOf(counts);
  const envText = run.environment ? <span className="mono">{run.environment}</span> : null;

  return (
    <>
      {crumbs}
      <div className="page-head">
        <div className="grow">
          <h1 style={{ overflowWrap: "anywhere" }}>{run.name}</h1>
          <p>
            {runStatusName(run.status)}{envText ? <> on {envText}</> : null}.
            {run.release_id ? <> Linked to <Link href={`/o/${encodeURIComponent(org.slug)}/releases/${encodeURIComponent(run.release_id)}`}>{run.release_name}</Link>.</> : null} Started by {run.created_by_name}.
          </p>
        </div>
        {can(org.role, "run.complete") && running ? (
          <div className="actions"><Button onClick={() => setConfirm(true)}>Complete run</Button></div>
        ) : null}
      </div>
      <section className="readout" aria-label="Run progress">
        <div><div className="num">{rate === null ? "n/a" : `${rate}%`}</div><div className="cap">Pass rate</div></div>
        <div><div className="num">{counts.pass}</div><div className="cap">Pass</div></div>
        <div className={counts.fail ? "alert" : ""}><div className="num">{counts.fail}</div><div className="cap">Fail</div></div>
        <div>
          <div className="num">{counts.untested}</div><div className="cap">Not run yet</div>
          <div className="sub">{counts.blocked} blocked, {counts.skipped} skipped</div>
        </div>
      </section>
      <div style={{ marginBottom: 16 }}><ProgressBar counts={counts} /></div>
      <section className="panel" aria-label={`Cases of ${run.key}, ${executed} of ${run.results.length} executed`}>
        {run.results.map((r) => (
          <CaseRow key={r.id} run={run} result={r} open={open === r.id} canRun={canRun}
            onToggle={() => setOpen(open === r.id ? null : r.id)}
            onSet={(result, extra) => mark.mutate({ result: r, body: { result, ...extra } })} />
        ))}
      </section>
      {confirm ? (
        <Dialog
          title={`Complete ${run.key}?`}
          onClose={() => setConfirm(false)}
          footer={
            <>
              <Button onClick={() => setConfirm(false)}>Cancel</Button>
              <Button variant="primary" disabled={complete.isPending} onClick={() => complete.mutate()}>
                {complete.isPending ? <Spinner /> : null}
                Complete run
              </Button>
            </>
          }
        >
          <div className="modal-body">
            <p style={{ overflowWrap: "anywhere" }}>{run.name}</p>
            <p className="small muted">
              {counts.untested ? `${counts.untested} ${counts.untested === 1 ? "case has" : "cases have"} not been run. ` : ""}
              Results become read only and a run cannot be reopened.
            </p>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}

function CaseRow({ run, result: r, open, canRun, onToggle, onSet }: {
  run: Run;
  result: RunResult;
  open: boolean;
  canRun: boolean;
  onToggle: () => void;
  onSet: (result: ResultKind, extra?: { failed_step_index?: number; actual_result?: string }) => void;
}) {
  const org = useOrg();
  const [actual, setActual] = useState(r.actual_result);
  const [step, setStep] = useState<number | null>(r.failed_step_index); // what the person chose; every save sends both fields
  const failedStep = r.failed_step_index;
  const canBug = can(org.role, "run.bug_from_failure");
  const failed = r.result === "fail";

  return (
    <div className="case-row" data-case={r.case_key}>
      <div className="case-head">
        <button className="expander" type="button" aria-expanded={open} onClick={onToggle} style={{ minWidth: 0 }}>
          <IconChevron width={16} height={16} style={{ transform: open ? undefined : "rotate(-90deg)", flex: "none" }} />
          <span className="mono muted small">{r.case_key}</span>
          <span style={{ overflowWrap: "anywhere", textAlign: "left" }}>{r.case_title}</span>
        </button>
        <div className="row" style={{ gap: 8 }}>
          <span className={`res res-${r.result}`}>{RESULT_LABEL[r.result]}</span>
          {canRun ? (
            <div className="result-btns" role="group" aria-label={`Result for ${r.case_key}`}>
              {RESULT_KINDS.filter((k) => k !== "untested").map((k) => (
                <button key={k} type="button" className={k} aria-pressed={r.result === k}
                  onClick={() => (r.result === k ? onSet("untested") : onSet(k, k === "fail" ? { failed_step_index: failedStep ?? 0 } : undefined))}>
                  {RESULT_BUTTON[k as Exclude<ResultKind, "untested">]}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {open ? (
        <div className="case-detail">
          {r.preconditions ? <p className="small muted" style={{ marginBottom: 8, overflowWrap: "anywhere" }}><b>Preconditions:</b> {r.preconditions}</p> : null}
          <div className="table-wrap">
            <table className="steps-t">
              <thead><tr><th style={{ width: 36 }}>#</th><th>Action</th><th>Expected result</th></tr></thead>
              <tbody>
                {r.steps.map((s, i) => (
                  <tr key={s.id ?? i} className={failed && i === failedStep ? "failed" : ""}>
                    <td className="mono" style={{ fontSize: "1em" }}>{i + 1}</td>
                    <td style={{ overflowWrap: "anywhere" }}>{s.action}</td>
                    <td style={{ overflowWrap: "anywhere" }}>
                      {s.expected}
                      {failed && i === failedStep ? <div className="err" style={{ marginTop: 4 }}>Failed at this step</div> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {failed ? (
            <div className="failbox stack">
              <div className="grid g2">
                <div className="field">
                  <label htmlFor={`fs-${r.case_key}`}>Failed at step</label>
                  <Select id={`fs-${r.case_key}`} disabled={!canRun} value={failedStep ?? ""}
                    onChange={(e) => { setStep(Number(e.target.value)); onSet("fail", { failed_step_index: Number(e.target.value), actual_result: actual }); }}>
                    {failedStep === null ? <option value="" disabled>Choose a step</option> : null}
                    {r.steps.map((_, i) => <option key={i} value={i}>Step {i + 1}</option>)}
                  </Select>
                </div>
                <div className="field">
                  <label htmlFor={`fa-${r.case_key}`}>Actual result</label>
                  <Input id={`fa-${r.case_key}`} disabled={!canRun} value={actual} maxLength={ACTUAL_MAX} autoComplete="off"
                    placeholder="What happened instead" onChange={(e) => setActual(e.target.value)}
                    onBlur={() => { if (actual !== r.actual_result) onSet("fail", { failed_step_index: step ?? failedStep ?? 0, actual_result: actual }); }} />
                </div>
              </div>
              {r.bugs.length ? (
                <p className="small">
                  Linked {r.bugs.length === 1 ? "bug" : "bugs"}:{" "}
                  {r.bugs.map((b, i) => (
                    <span key={b.id}>{i ? ", " : ""}<Link className="mono" href={`/o/${encodeURIComponent(org.slug)}/bugs/${encodeURIComponent(b.key)}`}>{b.key}</Link></span>
                  ))}
                </p>
              ) : canBug ? (
                <div className="row">
                  <Link className="btn primary" href={`/o/${encodeURIComponent(org.slug)}/bugs/new?from_run=${encodeURIComponent(run.id)}&result=${encodeURIComponent(r.id)}`}>
                    <IconBug />
                    Create bug from failed step
                  </Link>
                  <span className="small muted">
                    Prefills title, steps up to step {(failedStep ?? 0) + 1}, expected and actual results, environment and component.
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
