import type { ReactNode } from "react";

import type { BugActivity } from "../detail-hooks";
import { SEVERITY_NAME } from "../schemas";
import { StatusBadge } from "./bug-badges";

const LONG_TEXT_NAME: Record<string, string> = {
  description: "the description",
  steps_to_reproduce: "the steps to reproduce",
  expected_result: "the expected result",
  actual_result: "the actual result",
};

const b = (text: string) => <b style={{ overflowWrap: "anywhere" }}>{text}</b>;

/** "from X to Y", "to Y" or "(was X)", whichever the old and new values allow. */
function change(old: string | null, next: string | null, show: (v: string) => ReactNode = b): ReactNode {
  if (old && next) return <>from {show(old)} to {show(next)}</>;
  if (next) return <>to {show(next)}</>;
  if (old) return <>to <b>none</b> (was {show(old)})</>;
  return null;
}

/**
 * The sentence after the person's name in one timeline entry (REQ-025). Old and new values are what the API stored at that
 * moment: status, severity and priority as keys, people, components, environments and labels as the names they had then.
 */
export function ActivityText({ entry }: { entry: BugActivity }): ReactNode {
  const { kind, field, old_value: old, new_value: next } = entry;
  switch (kind) {
    case "created":
      return <>created this bug</>;
    case "status_changed":
      return <>changed status {old && next ? <>from <StatusBadge status={old} /> to <StatusBadge status={next} /></> : null}</>;
    case "assigned":
      if (next && old) return <>reassigned this bug from {b(old)} to {b(next)}</>;
      if (next) return <>assigned this bug to {b(next)}</>;
      return <>unassigned this bug{old ? <> (was {b(old)})</> : null}</>;
    case "attachment_added":
      return <>attached {b(next ?? "a file")}</>;
    case "attachment_removed":
      return <>removed {b(old ?? "a file")}</>;
    case "commented":
      return <>commented</>;
    case "linked_release":
      return next ? <>linked this bug to a release</> : <>unlinked this bug from its release</>;
    case "field_changed": {
      if (field && LONG_TEXT_NAME[field]) return <>edited {LONG_TEXT_NAME[field]}</>;
      if (field === "severity") return <>changed severity {change(old, next, (v) => b(SEVERITY_NAME[v] ?? v))}</>;
      if (field === "priority") return <>changed priority {change(old, next, (v) => b(v.toUpperCase()))}</>;
      if (field === "title") return <>changed the title {change(old, next, (v) => <b style={{ overflowWrap: "anywhere" }}>“{v}”</b>)}</>;
      if (field === "labels") return <>changed the labels {change(old, next)}</>;
      if (field === "component" || field === "environment") return <>changed the {field} {change(old, next)}</>;
      return <>changed {field ? field.replace(/_/g, " ") : "a field"}</>;
    }
    default:
      return <>changed this bug</>;
  }
}
