import type { RunSummary } from "../runs";

/** The stacked bar of a run: one colour per result, with the counts in the label for screen readers (locked design). */
export function ProgressBar({ counts }: { counts: RunSummary["counts"] }) {
  const total = counts.pass + counts.fail + counts.blocked + counts.skipped + counts.untested;
  const parts = (["pass", "fail", "blocked", "skipped"] as const).filter((k) => counts[k] > 0);
  return (
    <div className="progress" role="img"
      aria-label={`${counts.pass} pass, ${counts.fail} fail, ${counts.blocked} blocked, ${counts.skipped} skipped, ${counts.untested} untested`}>
      {parts.map((k) => (
        <i key={k} style={{ width: `${(100 * counts[k]) / total}%`, background: `var(--res-${k})` }} title={`${counts[k]} ${k}`} />
      ))}
    </div>
  );
}
