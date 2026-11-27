import type { Schemas } from "@/lib/api/client";

export type RunSummary = Schemas["RunSummaryOut"];
export type Run = Schemas["RunOut"];
export type RunResult = Schemas["RunResultOut"];
export type ResultKind = RunResult["result"];

export const RUNS_PAGE_SIZE = 25;
export const RUN_NAME_MIN = 3;
export const RUN_NAME_MAX = 120;

/** The five results in the order the legend and the progress bar use them. */
export const RESULT_KINDS: ResultKind[] = ["pass", "fail", "blocked", "skipped", "untested"];
export const RESULT_LABEL: Record<ResultKind, string> = { pass: "Pass", fail: "Fail", blocked: "Blocked", skipped: "Skipped", untested: "Not run" };
/** The label on the button that sets a result (the prototype says "Skip", not "Skipped"). */
export const RESULT_BUTTON: Record<Exclude<ResultKind, "untested">, string> = { pass: "Pass", fail: "Fail", blocked: "Blocked", skipped: "Skip" };

export const runStatusName = (status: string) => (status === "completed" ? "Completed" : "In progress");

/** How many of the cases have a result other than "not run". */
export function executedCount(counts: RunSummary["counts"]): number {
  return counts.pass + counts.fail + counts.blocked + counts.skipped;
}

/** The pass rate the API gives, or "n/a" when nothing was decided yet. */
export const rateText = (rate: number | null) => (rate === null ? "n/a" : `${rate}%`);
