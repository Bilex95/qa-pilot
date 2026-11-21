import { ROLE_NAMES, type Role } from "@/lib/permissions";

/** The groups offered by the Action filter: the API takes an exact action or a prefix such as "member" (API-150). */
export const ACTION_GROUPS: { value: string; label: string }[] = [
  { value: "", label: "All actions" },
  { value: "member", label: "Members" },
  { value: "invitation", label: "Invitations" },
  { value: "auth", label: "Sign in and passwords" },
  { value: "org", label: "Workspace settings" },
  { value: "ai", label: "AI controls" },
  { value: "bug", label: "Bugs" },
  { value: "comment", label: "Comments" },
  { value: "attachment", label: "Files" },
  { value: "label", label: "Labels" },
  { value: "project", label: "Projects" },
  { value: "suite", label: "Test suites" },
  { value: "case", label: "Test cases" },
];

type Data = Record<string, unknown>;

const FIELD_NAMES: Record<string, string> = {
  name: "Name",
  ai_enabled: "AI features",
  ai_daily_limit: "Daily AI limit",
  full_name: "Name",
};

function isChange(v: unknown): v is { from: unknown; to: unknown } {
  return typeof v === "object" && v !== null && "from" in v && "to" in v;
}

function show(v: unknown): string {
  if (typeof v === "boolean") return v ? "on" : "off";
  if (v === null || v === undefined || v === "") return "empty";
  if (typeof v === "string" && v in ROLE_NAMES) return ROLE_NAMES[v as Role];
  return String(v);
}

function changes(data: Data): string {
  return Object.entries(data)
    .filter(([, v]) => isChange(v))
    .map(([k, v]) => {
      const c = v as { from: unknown; to: unknown };
      return `${FIELD_NAMES[k] ?? k.replace(/_/g, " ")} ${show(c.from)} to ${show(c.to)}`;
    })
    .join(", ");
}

/** One readable line for an event. Never shows ids, tokens or passwords (the API does not send them). */
export function describeEvent(action: string, data: Data, target?: string | null): string {
  const text = (k: string) => (typeof data[k] === "string" ? (data[k] as string) : "");
  switch (action) {
    case "org.settings_updated":
      return changes(data) || "Workspace settings changed";
    case "ai.enabled":
      return "AI features turned on";
    case "ai.disabled":
      return "AI features turned off";
    case "ai.limit_changed":
      return `Daily limit ${show(data.from)} to ${show(data.to)}`;
    case "auth.password_changed":
      return "Changed their own password";
    case "auth.profile_updated":
      return changes(data) || "Changed their profile";
    case "auth.password_reset":
      return "Set a new password with a reset link";
    case "auth.reset_link_created":
      return `Created a password reset link for ${target ?? "a member"}`;
    case "member.role_changed":
      return `${target ?? "A member"}: role ${show(data.from)} to ${show(data.to)}`;
    case "member.removed":
      return `Removed ${target ?? "a member"} from the workspace`;
    case "invitation.created":
      return `${text("email")} as ${show(data.role)}`;
    case "invitation.accepted":
      return `Joined as ${show(data.role)}`;
    case "invitation.revoked":
      return "Revoked an invitation";
    case "label.created":
    case "label.deleted":
      return text("name");
    case "project.created":
      return [text("key"), text("name")].filter(Boolean).join(" ");
    case "project.archived":
      return text("key");
    case "bug.created":
    case "case.created":
    case "case.deleted":
      return [text("key"), text("title")].filter(Boolean).join(" ");
    case "bug.deleted":
    case "bug.assigned":
      return text("key");
    case "bug.status_changed":
      return `${text("key")}: status ${show(data.from).replace(/_/g, " ")} to ${show(data.to).replace(/_/g, " ")}`;
    case "attachment.uploaded":
    case "attachment.deleted":
      return [text("key"), text("filename")].filter(Boolean).join(" ");
    case "comment.deleted":
      return `A comment on ${text("key")}`;
    case "bug.updated":
    case "case.updated": {
      return [text("key"), changes((data.changes ?? {}) as Data)].filter(Boolean).join(": ");
    }
    case "suite.created":
      return text("name");
    case "suite.updated":
      return [text("name"), changes((data.changes ?? {}) as Data)].filter(Boolean).join(": ");
    case "suite.deleted":
      return `${text("name")}${typeof data.cases_deleted === "number" ? `, ${data.cases_deleted} cases deleted` : ""}`;
    default:
      return "";
  }
}

/** "just now", "10 min ago", "3 h ago", "2 d ago", then the date. The exact local time is the cell's title. */
export function ago(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)} h ago`;
  if (minutes < 60 * 24 * 7) return `${Math.floor(minutes / (60 * 24))} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** A calendar day chosen in the local timezone, as the UTC instants that bound it (the API compares in UTC, API-150). */
export function dayStartUtc(day: string): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0).toISOString() : undefined;
}

/** The last millisecond of that local day, so an event late in the evening still counts for the day the person picked. */
export function dayEndUtc(day: string): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999).toISOString() : undefined;
}
