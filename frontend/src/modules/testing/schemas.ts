import { z } from "zod";

import type { Schemas } from "@/lib/api/client";

export type Suite = Schemas["SuiteOut"];
export type CaseSummary = Schemas["CaseSummaryOut"];
export type TestCaseFull = Schemas["CaseOut"];

export const CASE_TYPES = [["positive", "Positive"], ["negative", "Negative"], ["edge", "Edge"]] as const; // REQ-047
export type CaseType = (typeof CASE_TYPES)[number][0];
export const CASE_TYPE_NAME: Record<string, string> = Object.fromEntries(CASE_TYPES);

export const PRIORITIES = [["p1", "P1 urgent"], ["p2", "P2 high"], ["p3", "P3 normal"], ["p4", "P4 low"]] as const;
export type CasePriority = (typeof PRIORITIES)[number][0];

export const PAGE_SIZE = 25;
export const SUITE_NAME_MAX = 80;
export const SUITE_DESCRIPTION_MAX = 1000;
export const TITLE_MIN = 5; // as for bugs (D-052)
export const TITLE_MAX = 200;
export const STEP_MAX = 50;
export const STEP_LENGTH = 1000;
export const PRECONDITIONS_MAX = 2000;
export const TAG_MAX = 20;
export const TAG_LENGTH = 30;

export const suiteNameSchema = z.string().trim().min(1, "Enter a name for the suite.").max(SUITE_NAME_MAX, `Use ${SUITE_NAME_MAX} characters or fewer.`);
export const titleSchema = z
  .string()
  .trim()
  .min(TITLE_MIN, `Title must be at least ${TITLE_MIN} characters.`)
  .max(TITLE_MAX, `Title must be ${TITLE_MAX} characters or fewer.`);

/** One row of the steps editor. `id` is the id of a saved step and is sent back so that reordering keeps it. */
export type StepRow = { id?: string; action: string; expected: string };

export type CaseValues = {
  title: string;
  suite_id: string;
  case_type: CaseType;
  priority: CasePriority;
  preconditions: string;
  steps: StepRow[];
  tags: string; // comma separated, as typed
};

export const EMPTY_CASE: CaseValues = {
  title: "", suite_id: "", case_type: "positive", priority: "p3", preconditions: "", steps: [{ action: "", expected: "" }], tags: "",
};

export function valuesFromCase(c: TestCaseFull): CaseValues {
  return {
    title: c.title,
    suite_id: c.suite_id,
    case_type: c.case_type,
    priority: c.priority,
    preconditions: c.preconditions,
    steps: c.steps.map((s) => ({ id: s.id, action: s.action, expected: s.expected })),
    tags: c.tags.join(", "),
  };
}

/** Tags as the API stores them: trimmed, lower case, no blanks or repeats. */
export function parseTags(text: string): string[] {
  const seen = new Set<string>();
  for (const part of text.split(",")) {
    const tag = part.trim().toLowerCase();
    if (tag) seen.add(tag);
  }
  return [...seen];
}

/** Rows that were left completely empty are ignored; a row with only one of the two texts is an error. */
export function usedSteps(steps: StepRow[]): StepRow[] {
  return steps.filter((s) => s.action.trim() !== "" || s.expected.trim() !== "");
}

export type CaseErrors = Partial<Record<"title" | "suite_id" | "preconditions" | "steps" | "tags", string>>;

export function validateCase(v: CaseValues): CaseErrors {
  const errors: CaseErrors = {};
  const title = titleSchema.safeParse(v.title);
  if (!title.success) errors.title = title.error.issues[0]?.message ?? "Enter a title.";
  if (!v.suite_id) errors.suite_id = "Choose a suite.";
  if (v.preconditions.length > PRECONDITIONS_MAX) errors.preconditions = `Use ${PRECONDITIONS_MAX} characters or fewer.`;
  const steps = usedSteps(v.steps);
  if (steps.length === 0) errors.steps = "Add at least one step with an action and an expected result.";
  else if (steps.length > STEP_MAX) errors.steps = `Use ${STEP_MAX} steps or fewer.`;
  else if (steps.some((s) => s.action.trim() === "" || s.expected.trim() === "")) errors.steps = "Every step needs an action and an expected result.";
  else if (steps.some((s) => s.action.length > STEP_LENGTH || s.expected.length > STEP_LENGTH)) {
    errors.steps = `Each action and expected result can have up to ${STEP_LENGTH} characters.`;
  }
  const tags = parseTags(v.tags);
  if (tags.length > TAG_MAX) errors.tags = `Use ${TAG_MAX} tags or fewer.`;
  else if (tags.some((t) => t.length > TAG_LENGTH)) errors.tags = `Each tag can have up to ${TAG_LENGTH} characters.`;
  return errors;
}

export function stepsBody(steps: StepRow[]): { id?: string; action: string; expected: string }[] {
  return usedSteps(steps).map((s) => ({ ...(s.id ? { id: s.id } : {}), action: s.action.trim(), expected: s.expected.trim() }));
}

export function createBody(v: CaseValues): Schemas["CaseIn"] {
  return {
    title: v.title.trim(),
    preconditions: v.preconditions,
    steps: stepsBody(v.steps),
    tags: parseTags(v.tags),
    priority: v.priority,
    case_type: v.case_type,
    ai_generated: false,
  };
}
