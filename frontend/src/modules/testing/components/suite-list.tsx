import Link from "next/link";
import { Fragment } from "react";

import { useOrg } from "@/modules/shell/org-context";

import type { Suite } from "../schemas";

export type SuiteGroup = { key: string; name: string; suites: Suite[] };

/** Suites grouped by project, projects by name. Suites of a project that is not in the list (archived) share one group. */
export function groupSuites(suites: Suite[], projects: { id: string; name: string }[]): SuiteGroup[] {
  const byProject = new Map<string, Suite[]>();
  for (const s of suites) byProject.set(s.project_id, [...(byProject.get(s.project_id) ?? []), s]);
  const known = [...projects].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  const groups: SuiteGroup[] = known.filter((p) => byProject.has(p.id)).map((p) => ({ key: p.id, name: p.name, suites: byProject.get(p.id) ?? [] }));
  const rest = suites.filter((s) => !known.some((p) => p.id === s.project_id));
  if (rest.length) groups.push({ key: "archived", name: "Archived projects", suites: rest });
  return groups;
}

/** The suite navigation of SCR-12: projects as small headings, each suite with its case count. */
export function SuiteList({ groups, selectedId }: { groups: SuiteGroup[]; selectedId: string | undefined }) {
  const org = useOrg();
  return (
    <nav className="panel" aria-label="Suites">
      <ul className="suite-list">
        {groups.map((g) => (
          <Fragment key={g.key}>
            <li className="proj" style={{ overflowWrap: "anywhere" }}>{g.name}</li>
            {g.suites.map((s) => (
              <li key={s.id}>
                <Link href={`/o/${org.slug}/tests?suite=${s.id}`} aria-current={s.id === selectedId}>
                  <b style={{ overflowWrap: "anywhere" }}>{s.name}</b>
                  <span className="xs muted">{s.case_count} {s.case_count === 1 ? "case" : "cases"}</span>
                </Link>
              </li>
            ))}
          </Fragment>
        ))}
      </ul>
    </nav>
  );
}
