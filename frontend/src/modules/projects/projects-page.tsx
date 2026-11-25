"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { IconFolder, IconPlus } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/feedback";
import { isApiError } from "@/lib/api/errors";
import { can } from "@/lib/permissions";
import { ReadinessBadge } from "@/modules/releases/components/readiness-badge";
import { useOrg } from "@/modules/shell/org-context";

import { ProjectDialog } from "./components/project-dialog";
import { useProjectsPage } from "./hooks";
import { PROJECTS_PAGE_SIZE } from "./projects";

/**
 * SCR-06 Projects (API-040, API-041; REQ-013). Everyone reads; Org Admin and QA Lead create projects. Every figure of a row comes from
 * the server in the same request (open and Critical bugs, the newest run, the next release with its readiness).
 */
export function ProjectsPage() {
  const org = useOrg();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [creating, setCreating] = useState(false);
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
  const projects = useProjectsPage(page);
  const canCreate = can(org.role, "project.create");

  const create = canCreate ? (
    <Button variant="primary" onClick={() => setCreating(true)}>
      <IconPlus />
      New project
    </Button>
  ) : undefined;
  const head = (
    <div className="page-head">
      <div className="grow">
        <h1>Projects</h1>
        <p>Each project has its own bugs, components, environments and test suites.</p>
      </div>
      {create ? <div className="actions">{create}</div> : null}
    </div>
  );
  const dialog = creating ? (
    <ProjectDialog onClose={() => setCreating(false)} onSaved={(p) => router.push(`/o/${org.slug}/projects/${p.key}`)} />
  ) : null;

  if (projects.isPending) return <>{head}<TableSkeleton /></>;
  if (projects.isError || !projects.data) {
    return (
      <>
        {head}
        <ErrorState what="projects" onRetry={() => void projects.refetch()} requestId={isApiError(projects.error) ? projects.error.requestId : undefined} />
      </>
    );
  }
  const data = projects.data;
  if (data.total === 0) {
    return (
      <>
        {head}
        <EmptyState icon={IconFolder} title="No projects yet" action={create}>
          {canCreate ? "Create your first project to start tracking bugs and tests." : "An admin or QA lead creates projects. Once one exists it appears here."}
        </EmptyState>
        {dialog}
      </>
    );
  }
  const first = (page - 1) * PROJECTS_PAGE_SIZE + 1;
  const last = Math.min(page * PROJECTS_PAGE_SIZE, data.total);
  const goPage = (p: number) => router.push(p > 1 ? `${pathname}?page=${p}` : pathname);

  return (
    <>
      {head}
      <div className="panel">
        <div className="table-wrap">
          <table className="t stackable">
            <thead>
              <tr><th>Project</th><th>Key</th><th>Open bugs</th><th>Critical</th><th>Last run</th><th>Next release</th></tr>
            </thead>
            <tbody>
              {data.items.map((p) => (
                <tr key={p.id}>
                  <td className="title-cell">
                    <Link href={`/o/${org.slug}/projects/${p.key}`} style={{ overflowWrap: "anywhere" }}>{p.name}</Link>
                    {p.description ? <div className="xs muted" style={{ overflowWrap: "anywhere" }}>{p.description}</div> : null}
                  </td>
                  <td data-label="Key"><span className="mono">{p.key}</span></td>
                  <td data-label="Open bugs">{p.open_bug_count}</td>
                  <td data-label="Critical">{p.critical_bug_count}</td>
                  <td data-label="Last run">{p.last_run_pass_rate === null ? <span className="muted">None</span> : `${p.last_run_pass_rate}% pass`}</td>
                  <td data-label="Next release">
                    {p.next_release ? (
                      <span className="row" style={{ gap: 6 }}>
                        <Link href={`/o/${org.slug}/releases/${p.next_release.id}`} style={{ overflowWrap: "anywhere" }}>{p.next_release.name}</Link>
                        <ReadinessBadge readiness={p.next_release.readiness} />
                      </span>
                    ) : <span className="muted">None planned</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.total > PROJECTS_PAGE_SIZE ? (
          <div className="pager">
            <span className="grow" role="status">Showing {first} to {last} of {data.total}</span>
            <Button size="sm" disabled={page <= 1} onClick={() => goPage(page - 1)}>Previous</Button>
            <Button size="sm" disabled={last >= data.total} onClick={() => goPage(page + 1)}>Next</Button>
          </div>
        ) : null}
      </div>
      {dialog}
    </>
  );
}
