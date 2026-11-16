/**
 * UI copy of the permission matrix (PERSONAS_AND_ROLES.md section 3), used only to hide or disable controls.
 * The backend enforces every rule again (docs/API_BOUNDARY.md rule 1).
 */
export type Role = "org_admin" | "qa_lead" | "qa_engineer" | "developer" | "viewer";

const ALL: Role[] = ["org_admin", "qa_lead", "qa_engineer", "developer", "viewer"];
const NOT_VIEWER: Role[] = ["org_admin", "qa_lead", "qa_engineer", "developer"];
const QA: Role[] = ["org_admin", "qa_lead", "qa_engineer"];
const LEADS: Role[] = ["org_admin", "qa_lead"];
const ADMIN: Role[] = ["org_admin"];

const MATRIX = {
  "org.read": ALL,
  "org.update_settings": ADMIN,
  "member.list": LEADS,
  "member.update_role": ADMIN,
  "invitation.create": ADMIN,
  "audit.read": ADMIN,
  "label.manage": LEADS,
  "project.create": LEADS,
  "bug.create": NOT_VIEWER,
  "bug.set_severity_priority": QA,
  "bug.delete": LEADS,
  "comment.create": ALL,
  "suite.manage": QA,
  "run.create": QA,
  "release.manage": LEADS,
  "ai.bug_writer": NOT_VIEWER,
  "ai.triage": QA,
  "ai.test_cases": QA,
  "ai.release_summary": LEADS,
  "ai.usage_read": LEADS,
  "ai.configure": ADMIN,
} as const satisfies Record<string, Role[]>;

export type Action = keyof typeof MATRIX;

export function can(role: Role | undefined, action: Action): boolean {
  return !!role && (MATRIX[action] as readonly Role[]).includes(role);
}

export const ROLE_NAMES: Record<Role, string> = {
  org_admin: "Org Admin",
  qa_lead: "QA Lead",
  qa_engineer: "QA Engineer",
  developer: "Developer",
  viewer: "Viewer",
};
