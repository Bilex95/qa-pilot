"use client";

import { IconArrowDown, IconArrowUp, IconPlus, IconTrash } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";

import { STEP_MAX, type StepRow } from "../schemas";

/**
 * The steps of SCR-13: action and expected result side by side, with move up, move down and remove. Saved steps keep their
 * `id` while they are moved, so reordering keeps the ids (API-098). Read only for roles that cannot edit.
 */
export function StepEditor({ steps, editable, error, onChange }: {
  steps: StepRow[];
  editable: boolean;
  error?: string;
  onChange: (steps: StepRow[]) => void;
}) {
  const update = (i: number, patch: Partial<StepRow>) => onChange(steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, by: -1 | 1) => {
    const next = [...steps];
    const target = i + by;
    const a = next[i];
    const b = next[target];
    if (!a || !b) return;
    next[i] = b;
    next[target] = a;
    onChange(next);
  };

  return (
    <div className={`field ${error ? "invalid" : ""}`}>
      <span className="label" id="steps-label">Steps</span>
      <div className="step-ed" style={{ borderBottom: "1px solid var(--line)", paddingTop: 0 }} aria-hidden="true">
        <span />
        <span className="xs muted">Action</span>
        <span className="xs muted exp-col">Expected result</span>
        <span />
      </div>
      <div role="group" aria-labelledby="steps-label">
        {steps.map((s, i) => (
          <div key={s.id ?? `new-${i}`} className="step-ed">
            <span className="n">{i + 1}</span>
            <Textarea aria-label={`Step ${i + 1} action`} value={s.action} disabled={!editable} placeholder="Action"
              onChange={(e) => update(i, { action: e.target.value })} />
            <Textarea className="exp-col" aria-label={`Step ${i + 1} expected result`} value={s.expected} disabled={!editable}
              placeholder="Expected result" onChange={(e) => update(i, { expected: e.target.value })} />
            {editable ? (
              <div className="stack" style={{ gap: 2 }}>
                <Button variant="ghost" size="icon" aria-label={`Move step ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                  <IconArrowUp />
                </Button>
                <Button variant="ghost" size="icon" aria-label={`Move step ${i + 1} down`} disabled={i === steps.length - 1} onClick={() => move(i, 1)}>
                  <IconArrowDown />
                </Button>
                <Button variant="ghost" size="icon" aria-label={`Remove step ${i + 1}`} disabled={steps.length === 1}
                  onClick={() => onChange(steps.filter((_, j) => j !== i))}>
                  <IconTrash />
                </Button>
              </div>
            ) : <span />}
          </div>
        ))}
      </div>
      {editable ? (
        <div style={{ marginTop: 8 }}>
          <Button size="sm" disabled={steps.length >= STEP_MAX} onClick={() => onChange([...steps, { action: "", expected: "" }])}>
            <IconPlus />
            Add step
          </Button>
        </div>
      ) : null}
      {error ? <div className="err">{error}</div> : null}
    </div>
  );
}
