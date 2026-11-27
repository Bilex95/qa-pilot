"use client";

import { useQueries } from "@tanstack/react-query";
import Link from "next/link";

import { IconChevron } from "@/components/icons";
import { Avatar } from "@/components/ui/avatar";
import { useOrg } from "@/modules/shell/org-context";

import { componentsQuery, environmentsQuery } from "../hooks";
import { timeAgo, type Bug } from "../schemas";
import { PriorityTag, SeverityBadge, SlaBadge, StatusBadge } from "./bug-badges";

type Props = { items: Bug[]; sort: string; onSort: (sort: string) => void };

export function BugTable({ items, sort, onSort }: Props) {
  const org = useOrg();
  const projectIds = [...new Set(items.map((b) => b.project_id))];
  // Names for the component and environment under each title: one cached request per project on the page
  const comps = useQueries({ queries: projectIds.map((id) => componentsQuery(org.id, id)) });
  const envs = useQueries({ queries: projectIds.map((id) => environmentsQuery(org.id, id)) });
  const componentName = new Map(comps.flatMap((q) => q.data ?? []).map((c) => [c.id, c.name]));
  const environmentName = new Map(envs.flatMap((q) => q.data ?? []).map((e) => [e.id, e.name]));

  const header = (key: string, label: string) => {
    const active = sort.replace(/^-/, "") === key.replace(/^-/, "");
    return (
      <th aria-sort={active ? (sort.startsWith("-") ? "descending" : "ascending") : undefined}>
        <button type="button" onClick={() => onSort(key)} aria-label={`Sort by ${label}`}>
          {label}
          {active ? <IconChevron width={12} height={12} /> : null}
        </button>
      </th>
    );
  };

  return (
    <div className="table-wrap">
      <table className="t stackable">
        <thead>
          <tr>
            <th>Key</th>
            <th>Title</th>
            <th>Status</th>
            {header("severity", "Severity")}
            {header("priority", "Priority")}
            <th>Assignee</th>
            {header("-updated_at", "Updated")}
          </tr>
        </thead>
        <tbody>
          {items.map((b) => {
            const place = [b.component_id ? componentName.get(b.component_id) : undefined,
              b.environment_id ? environmentName.get(b.environment_id) : undefined].filter(Boolean).join(", ");
            return (
              <tr key={b.id}>
                <td data-label="Key" className="no-label"><span className="mono muted">{b.key}</span></td>
                <td className="title-cell">
                  <Link href={`/o/${org.slug}/bugs/${b.key}`} style={{ overflowWrap: "anywhere" }}>{b.title}</Link>
                  {place || b.labels.length ? (
                    <div className="xs muted" style={{ overflowWrap: "anywhere" }}>
                      {place}
                      {b.labels.length ? (
                        <span className="row" style={{ display: "inline-flex", marginLeft: place ? 8 : 0, gap: 4 }}>
                          {b.labels.map((l) => (
                            <span key={l.id} className="label-chip" title={l.name}
                              style={{ maxWidth: 160 }}>
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{l.name}</span>
                            </span>
                          ))}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </td>
                <td data-label="Status"><StatusBadge status={b.status} /></td>
                <td data-label="Severity"><SeverityBadge severity={b.severity} /></td>
                <td data-label="Priority"><PriorityTag priority={b.priority} /></td>
                <td data-label="Assignee">
                  {b.assignee_id ? (
                    <span className="who">
                      <Avatar id={b.assignee_id} name={b.assignee_name ?? ""} />
                      <span>{b.assignee_name}</span>
                    </span>
                  ) : (
                    <span className="muted">Unassigned</span>
                  )}
                </td>
                <td data-label="Updated">
                  <span className="small" title={new Date(b.updated_at).toLocaleString()}>{timeAgo(b.updated_at)}</span>
                  {b.sla_breached ? <> <SlaBadge severity={b.severity} /></> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
