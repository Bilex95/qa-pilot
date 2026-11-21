import { z } from "zod";

import type { Schemas } from "@/lib/api/client";
import { can, type Role } from "@/lib/permissions";

export type Bug = Schemas["BugSummaryOut"];
export type ViewFilters = Schemas["SavedViewFilters"];

export const STATUS_OPTIONS = [
  ["new", "New"], ["triaged", "Triaged"], ["in_progress", "In progress"], ["fixed", "Fixed"],
  ["ready_for_retest", "Ready for retest"], ["verified", "Verified"], ["closed", "Closed"], ["reopened", "Reopened"],
  ["wont_fix", "Won't fix"],
] as const;
export type Status = (typeof STATUS_OPTIONS)[number][0];
export const STATUS_NAME: Record<string, string> = Object.fromEntries(STATUS_OPTIONS);

export const SEVERITY_OPTIONS = [["critical", "Critical"], ["high", "High"], ["medium", "Medium"], ["low", "Low"]] as const;
export type Severity = (typeof SEVERITY_OPTIONS)[number][0];
export const SEVERITY_NAME: Record<string, string> = Object.fromEntries(SEVERITY_OPTIONS);

export const PRIORITY_OPTIONS = [["p1", "P1 urgent"], ["p2", "P2 high"], ["p3", "P3 normal"], ["p4", "P4 low"]] as const;
export type Priority = (typeof PRIORITY_OPTIONS)[number][0];

/** D-019 thresholds, spelled out for the Past SLA tooltip. */
export const SLA_TEXT: Record<string, string> = { critical: "24 hours", high: "3 days", medium: "14 days", low: "30 days" };

export const PAGE_SIZE = 25;
export const TITLE_MIN = 5; // REQ-017: title 5 to 200 characters
export const TITLE_MAX = 200;
export const STEP_MAX = 50;
export const STEP_LENGTH = 1000;
export const RESULT_MAX = 5000;
export const LABEL_MAX = 20;
export const DESCRIPTION_MAX = 20000;
export const COMMENT_MAX = 5000; // REQ-023: 1 to 5,000 characters

/** The message to show when a comment cannot be sent, or null when it can (the API checks again). */
export function checkComment(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return "Write something first.";
  if (trimmed.length > COMMENT_MAX) return `Use ${COMMENT_MAX} characters or fewer.`;
  return null;
}

export const titleSchema = z
  .string()
  .trim()
  .min(TITLE_MIN, `Title must be at least ${TITLE_MIN} characters.`)
  .max(TITLE_MAX, `Title must be ${TITLE_MAX} characters or fewer.`);

// List filters -------------------------------------------------------------------------------------------------------

/**
 * The filter state of the bug list. It lives in the URL (so a refresh or a shared link keeps it) and is mapped to the
 * API query and to the stored filters of a saved view. `status` is "open" (the default: not Verified, Closed or
 * Won't fix), "any", or one status.
 */
export type FilterState = {
  q: string;
  project: string;
  status: string;
  severity: string;
  priority: string;
  assignee: string; // "" (anyone), "none" (unassigned) or a user id
  component: string;
  environment: string;
  label: string;
  sla: boolean;
  sort: string;
  page: number;
};

export const DEFAULT_FILTERS: FilterState = {
  q: "", project: "", status: "open", severity: "", priority: "", assignee: "", component: "", environment: "", label: "",
  sla: false, sort: "-updated_at", page: 1,
};

const SORTS = ["-updated_at", "updated_at", "-created_at", "created_at", "severity", "-severity", "priority", "-priority"];
const uuid = z.uuid();
const oneOf = (value: string | null, allowed: readonly string[]) => (value && allowed.includes(value) ? value : "");
const id = (value: string | null) => (value && uuid.safeParse(value).success ? value : "");

export function parseFilters(sp: URLSearchParams): FilterState {
  const status = sp.get("status");
  const page = Number.parseInt(sp.get("page") ?? "1", 10);
  const assignee = sp.get("assignee");
  return {
    q: (sp.get("q") ?? "").slice(0, 200),
    project: id(sp.get("project")),
    status: status === "any" ? "any" : oneOf(status, STATUS_OPTIONS.map((s) => s[0])) || "open",
    severity: oneOf(sp.get("severity"), SEVERITY_OPTIONS.map((s) => s[0])),
    priority: oneOf(sp.get("priority"), PRIORITY_OPTIONS.map((p) => p[0])),
    assignee: assignee === "none" ? "none" : id(assignee),
    component: id(sp.get("component")),
    environment: id(sp.get("environment")),
    label: id(sp.get("label")),
    sla: sp.get("sla") === "1",
    sort: SORTS.includes(sp.get("sort") ?? "") ? (sp.get("sort") as string) : DEFAULT_FILTERS.sort,
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** Only values that differ from the default are written, so the plain list has a plain URL. */
export function toSearch(f: FilterState): string {
  const sp = new URLSearchParams();
  const set = (key: string, value: string, fallback = "") => { if (value !== fallback) sp.set(key, value); };
  set("q", f.q);
  set("project", f.project);
  set("status", f.status, "open");
  set("severity", f.severity);
  set("priority", f.priority);
  set("assignee", f.assignee);
  set("component", f.component);
  set("environment", f.environment);
  set("label", f.label);
  if (f.sla) sp.set("sla", "1");
  set("sort", f.sort, DEFAULT_FILTERS.sort);
  if (f.page > 1) sp.set("page", String(f.page));
  const text = sp.toString();
  return text ? `?${text}` : "";
}

export type BugQuery = {
  page: number; page_size: number; sort: string; q?: string; project_id?: string; status?: Status[]; open?: boolean;
  severity?: Severity[]; priority?: Priority[]; assignee_id?: string; unassigned?: boolean; component_id?: string;
  environment_id?: string; label_id?: string; sla_breached?: boolean;
};

export function toApiQuery(f: FilterState): BugQuery {
  const q: BugQuery = { page: f.page, page_size: PAGE_SIZE, sort: f.sort };
  if (f.q.trim()) q.q = f.q.trim();
  if (f.project) q.project_id = f.project;
  if (f.status === "open") q.open = true;
  else if (f.status !== "any") q.status = [f.status as Status];
  if (f.severity) q.severity = [f.severity as Severity];
  if (f.priority) q.priority = [f.priority as Priority];
  if (f.assignee === "none") q.unassigned = true;
  else if (f.assignee) q.assignee_id = f.assignee;
  if (f.component) q.component_id = f.component;
  if (f.environment) q.environment_id = f.environment;
  if (f.label) q.label_id = f.label;
  if (f.sla) q.sla_breached = true;
  return q;
}

/** Filters of a saved view (API-079, `version` 1): the same keys as the list endpoint. */
export function toViewFilters(f: FilterState): ViewFilters {
  const v: ViewFilters = { version: 1, sort: f.sort };
  if (f.q.trim()) v.q = f.q.trim();
  if (f.project) v.project_id = f.project;
  if (f.status === "open") v.open = true;
  else if (f.status !== "any") v.status = [f.status as Status];
  if (f.severity) v.severity = [f.severity as Severity];
  if (f.priority) v.priority = [f.priority as Priority];
  if (f.assignee === "none") v.unassigned = true;
  else if (f.assignee) v.assignee_id = f.assignee;
  if (f.component) v.component_id = f.component;
  if (f.environment) v.environment_id = f.environment;
  if (f.label) v.label_id = f.label;
  if (f.sla) v.sla_breached = true;
  return v;
}

export function fromViewFilters(v: ViewFilters): FilterState {
  return {
    ...DEFAULT_FILTERS,
    q: v.q ?? "",
    project: v.project_id ?? "",
    status: v.open ? "open" : (v.status?.[0] ?? "any"),
    severity: v.severity?.[0] ?? "",
    priority: v.priority?.[0] ?? "",
    assignee: v.unassigned ? "none" : (v.assignee_id ?? ""),
    component: v.component_id ?? "",
    environment: v.environment_id ?? "",
    label: v.label_id ?? "",
    sla: v.sla_breached === true,
    sort: v.sort ?? DEFAULT_FILTERS.sort,
  };
}

/** Two filter sets select the same bugs when everything but the sort order and the page agrees. */
export function sameFilters(a: FilterState, b: FilterState): boolean {
  return a.q.trim() === b.q.trim() && a.project === b.project && a.status === b.status && a.severity === b.severity &&
    a.priority === b.priority && a.assignee === b.assignee && a.component === b.component &&
    a.environment === b.environment && a.label === b.label && a.sla === b.sla;
}

export type BuiltInView = { id: string; name: string; filters: FilterState };

/** The built in tabs of the prototype, minus "Critical in prod" (BL-016): the others are plain filters. */
export function builtInViews(myUserId: string | undefined): BuiltInView[] {
  const views: BuiltInView[] = [{ id: "all", name: "All open", filters: DEFAULT_FILTERS }];
  if (myUserId) views.push({ id: "mine", name: "Assigned to me", filters: { ...DEFAULT_FILTERS, assignee: myUserId } });
  views.push(
    { id: "retest", name: "Ready for retest", filters: { ...DEFAULT_FILTERS, status: "ready_for_retest" } },
    { id: "sla", name: "Past SLA", filters: { ...DEFAULT_FILTERS, status: "any", sla: true } },
  );
  return views;
}

export function hasActiveFilters(f: FilterState): boolean {
  return !sameFilters(f, DEFAULT_FILTERS);
}

export function timeAgo(iso: string, now = Date.now()): string {
  const hours = (now - new Date(iso).getTime()) / 3_600_000;
  if (hours < 1) return "just now";
  if (hours < 24) return `${Math.round(hours)} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

// New bug form -------------------------------------------------------------------------------------------------------

export type NewBugValues = {
  project_id: string;
  component_id: string;
  title: string;
  steps: string[];
  expected_result: string;
  actual_result: string;
  severity: Severity;
  priority: Priority;
  environment_id: string;
  assignee_id: string;
  label_ids: string[];
};

export const EMPTY_BUG: NewBugValues = {
  project_id: "", component_id: "", title: "", steps: [""], expected_result: "", actual_result: "", severity: "medium",
  priority: "p3", environment_id: "", assignee_id: "", label_ids: [],
};

export type FieldErrors = Partial<Record<"project_id" | "title" | "steps" | "expected_result" | "actual_result", string>>;

export function validateNewBug(v: NewBugValues): FieldErrors {
  const errors: FieldErrors = {};
  if (!v.project_id) errors.project_id = "Choose a project.";
  const title = titleSchema.safeParse(v.title);
  if (!title.success) errors.title = title.error.issues[0]?.message ?? "Enter a title.";
  const steps = v.steps.map((s) => s.trim()).filter(Boolean);
  if (steps.length > STEP_MAX) errors.steps = `Use ${STEP_MAX} steps or fewer.`;
  else if (steps.some((s) => s.length > STEP_LENGTH)) errors.steps = `Each step can have up to ${STEP_LENGTH} characters.`;
  if (v.expected_result.length > RESULT_MAX) errors.expected_result = `Use ${RESULT_MAX} characters or fewer.`;
  if (v.actual_result.length > RESULT_MAX) errors.actual_result = `Use ${RESULT_MAX} characters or fewer.`;
  return errors;
}

/**
 * The request body for API-061. Developers may not send severity or priority at all: the API answers 403 even for the
 * default values (D-032, D-050), so for them the keys are left out and the server forces Medium and P3. A release and a
 * source run are never sent: those modules do not exist yet (I-08, I-07) and the API refuses their ids.
 */
export function buildCreateBody(role: Role, v: NewBugValues): Schemas["BugCreateIn"] {
  // The generated type marks the fields with server defaults as required, so the plain ones are always sent
  const body: Schemas["BugCreateIn"] = {
    project_id: v.project_id, title: v.title.trim(), description: "", expected_result: v.expected_result.trim(),
    actual_result: v.actual_result.trim(), ai_assisted: false,
  };
  const steps = v.steps.map((s) => s.trim()).filter(Boolean);
  if (steps.length) body.steps_to_reproduce = steps;
  if (v.component_id) body.component_id = v.component_id;
  if (v.environment_id) body.environment_id = v.environment_id;
  if (v.assignee_id) body.assignee_id = v.assignee_id;
  if (v.label_ids.length) body.label_ids = v.label_ids;
  if (can(role, "bug.set_severity_priority")) {
    body.severity = v.severity;
    body.priority = v.priority;
  }
  return body;
}
