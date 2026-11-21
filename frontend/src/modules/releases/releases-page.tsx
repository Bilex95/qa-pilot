"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { IconPlus, IconRelease } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/feedback";
import { isApiError } from "@/lib/api/errors";
import { can } from "@/lib/permissions";
import { useOrg } from "@/modules/shell/org-context";
import { useProjectList } from "@/modules/testing/hooks";

import { ReadinessBadge } from "./components/readiness-badge";
import { ReleaseDialog } from "./components/release-dialog";
import { useReleases } from "./hooks";
import { RELEASES_PAGE_SIZE, STATUS_NAME, formatDate } from "./releases";

/**
 * SCR-16 Releases (API-110, API-111; REQ-035, REQ-036). Everyone reads; Org Admin and QA Lead plan releases (release.manage).
 * Readiness comes from the server (D-014) with the reasons that fired.
 */
export function ReleasesPage() {
  const org = useOrg();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [creating, setCreating] = useState(false);
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
  const releases = useReleases(page);
  const projects = useProjectList();
  const projectName = new Map((projects.data?.items ?? []).map((p) => [p.id, p.name]));
  const canManage = can(org.role, "release.manage");

  const create = canManage ? (
    <Button variant="primary" onClick={() => setCreating(true)}>
      <IconPlus />
      New release
    </Button>
  ) : undefined;
  const head = (
    <div className="page-head">
      <div className="grow">
        <h1>Releases</h1>
        <p>Readiness is calculated from linked bugs and test runs.</p>
      </div>
      {create ? <div className="actions">{create}</div> : null}
    </div>
  );
  const dialog = creating ? (
    <ReleaseDialog onClose={() => setCreating(false)} onSaved={(r) => router.push(`/o/${org.slug}/releases/${r.id}`)} />
  ) : null;

  if (releases.isPending) return <>{head}<TableSkeleton /></>;
  if (releases.isError || !releases.data) {
    return (
      <>
        {head}
        <ErrorState what="releases" onRetry={() => void releases.refetch()} requestId={isApiError(releases.error) ? releases.error.requestId : undefined} />
      </>
    );
  }
  const data = releases.data;
  if (data.total === 0) {
    return (
      <>
        {head}
        <EmptyState icon={IconRelease} title="No releases planned" action={create}>
          Create a release, link the bugs and test runs that belong to it, and QA Pilot tells you if it is ready.
        </EmptyState>
        {dialog}
      </>
    );
  }
  const first = (page - 1) * RELEASES_PAGE_SIZE + 1;
  const last = Math.min(page * RELEASES_PAGE_SIZE, data.total);
  const goPage = (p: number) => router.push(p > 1 ? `${pathname}?page=${p}` : pathname);

  return (
    <>
      {head}
      <div className="panel">
        <div className="table-wrap">
          <table className="t stackable">
            <thead>
              <tr><th>Release</th><th>Project</th><th>Target date</th><th>Status</th><th>Readiness</th><th>Why</th></tr>
            </thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.id}>
                  <td className="title-cell">
                    <Link href={`/o/${org.slug}/releases/${r.id}`} style={{ overflowWrap: "anywhere" }}>{r.name}</Link>
                    {r.description ? <div className="xs muted" style={{ overflowWrap: "anywhere" }}>{r.description}</div> : null}
                  </td>
                  <td data-label="Project" style={{ overflowWrap: "anywhere" }}>{projectName.get(r.project_id) ?? "Archived project"}</td>
                  <td data-label="Target date">{r.target_date ? formatDate(r.target_date) : <span className="muted">None</span>}</td>
                  <td data-label="Status">{STATUS_NAME[r.status]}</td>
                  <td data-label="Readiness"><ReadinessBadge readiness={r.readiness} /></td>
                  <td data-label="Why" className="small muted" style={{ overflowWrap: "anywhere" }}>{r.reasons.join(". ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.total > RELEASES_PAGE_SIZE ? (
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
