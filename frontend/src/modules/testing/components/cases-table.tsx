import Link from "next/link";

import { PriorityTag } from "@/modules/bugs/components/bug-badges";
import { useOrg } from "@/modules/shell/org-context";

import { CASE_TYPE_NAME, type CaseSummary } from "../schemas";

/** The cases of the selected suite (SCR-12): ID, title, type, priority, step count and tags. */
export function CasesTable({ items }: { items: CaseSummary[] }) {
  const org = useOrg();
  return (
    <div className="table-wrap">
      <table className="t stackable">
        <thead>
          <tr>
            <th>ID</th>
            <th>Title</th>
            <th>Type</th>
            <th>Priority</th>
            <th>Steps</th>
            <th>Tags</th>
          </tr>
        </thead>
        <tbody>
          {items.map((c) => (
            <tr key={c.id}>
              <td data-label="ID" className="no-label"><span className="mono muted">{c.key}</span></td>
              <td className="title-cell">
                <Link href={`/o/${encodeURIComponent(org.slug)}/tests/cases/${encodeURIComponent(c.key)}`} style={{ overflowWrap: "anywhere" }}>{c.title}</Link>
              </td>
              <td data-label="Type"><span className="type-tag">{CASE_TYPE_NAME[c.case_type] ?? c.case_type}</span></td>
              <td data-label="Priority"><PriorityTag priority={c.priority} /></td>
              <td data-label="Steps">{c.step_count}</td>
              <td data-label="Tags">
                <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 4 }}>
                  {c.tags.map((t) => (
                    <span key={t} className="label-chip" title={t} style={{ maxWidth: 160 }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{t}</span>
                    </span>
                  ))}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
