"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { IconPlus, IconSuite, IconTrash } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { api, unwrap } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { can } from "@/lib/permissions";
import { useOrg } from "@/modules/shell/org-context";

import { CasesTable } from "./components/cases-table";
import { DeleteSuiteDialog } from "./components/delete-dialogs";
import { groupSuites, SuiteList } from "./components/suite-list";
import { SuiteDialog } from "./components/suite-dialog";
import { useProjectList, useSuiteCases, useSuites } from "./hooks";
import { PAGE_SIZE, type Suite } from "./schemas";

/**
 * SCR-12 Test suites (API-090 to API-095; REQ-030). Everyone reads; Org Admin, QA Lead and QA Engineer manage
 * (suite.manage). The selected suite and the page of its cases live in the URL. The AI "Generate cases" button of the
 * prototype arrives with I-17.
 */
export function SuitesPage() {
  const org = useOrg();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const qc = useQueryClient();
  const toast = useToast();
  const manage = can(org.role, "suite.manage");
  const suites = useSuites();
  const projects = useProjectList();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Suite | null>(null);
  const [deleting, setDeleting] = useState<Suite | null>(null);

  const groups = useMemo(() => groupSuites(suites.data?.items ?? [], projects.data?.items ?? []), [suites.data, projects.data]);
  const ordered = groups.flatMap((g) => g.suites);
  const wanted = params.get("suite");
  const selected = ordered.find((s) => s.id === wanted) ?? ordered[0];
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
  const cases = useSuiteCases(selected?.id, page);

  const remove = useMutation({
    mutationFn: (suite: Suite) =>
      unwrap(api.DELETE("/api/v1/orgs/{org_id}/test-suites/{suite_id}", { params: { path: { org_id: org.id, suite_id: suite.id } } })),
    onSuccess: (_, suite) => {
      toast(`Suite "${suite.name}" deleted`);
      router.replace(pathname);
    },
    onError: (err) => {
      if (isApiError(err, "not_found")) toast("That suite was already deleted.");
      else toast("Could not delete the suite. Try again.", "error");
    },
    onSettled: () => {
      setDeleting(null);
      void qc.invalidateQueries({ queryKey: ["test-cases", org.id] });
      return qc.invalidateQueries({ queryKey: ["test-suites", org.id] });
    },
  });

  const newCaseHref = `/o/${org.slug}/tests/cases/new${selected ? `?suite=${selected.id}` : ""}`;
  const newSuite = (
    <Button onClick={() => setCreating(true)}>
      <IconPlus />
      New suite
    </Button>
  );
  const head = (
    <div className="page-head">
      <div className="grow">
        <h1>Test suites</h1>
        <p>Group test cases by feature.</p>
      </div>
      {manage ? (
        <div className="actions">
          {newSuite}
          {selected ? (
            <Link className="btn primary" href={newCaseHref}>
              <IconPlus />
              New test case
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
  const dialogs = (
    <>
      {creating ? (
        <SuiteDialog defaultProjectId={selected?.project_id} onClose={() => setCreating(false)}
          onSaved={(s) => { setCreating(false); router.replace(`${pathname}?suite=${s.id}`); }} />
      ) : null}
      {editing ? <SuiteDialog suite={editing} onClose={() => setEditing(null)} onSaved={() => setEditing(null)} /> : null}
      {deleting ? (
        <DeleteSuiteDialog name={deleting.name} caseCount={deleting.case_count} pending={remove.isPending}
          onConfirm={() => remove.mutate(deleting)} onClose={() => setDeleting(null)} />
      ) : null}
    </>
  );

  if (suites.isPending) {
    return (
      <>
        {head}
        <TableSkeleton />
      </>
    );
  }
  if (!suites.data) {
    return (
      <>
        {head}
        <ErrorState what="test suites" onRetry={() => void suites.refetch()}
          requestId={isApiError(suites.error) ? suites.error.requestId : undefined} />
      </>
    );
  }
  if (!selected) {
    return (
      <>
        {head}
        <EmptyState icon={IconSuite} title="No test suites yet"
          action={manage ? <Button variant="primary" onClick={() => setCreating(true)}><IconPlus />New suite</Button> : undefined}>
          Create a suite for a feature, then add cases to it.
        </EmptyState>
        {dialogs}
      </>
    );
  }

  const data = cases.data;
  const first = (page - 1) * PAGE_SIZE + 1;
  const last = data ? first + data.items.length - 1 : 0;
  const goPage = (next: number) => router.push(`${pathname}?suite=${selected.id}${next > 1 ? `&page=${next}` : ""}`);

  return (
    <>
      {head}
      <div className="split left">
        <SuiteList groups={groups} selectedId={selected.id} />
        <section className="panel">
          <div className="panel-head">
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ overflowWrap: "anywhere" }}>{selected.name}</h2>
              <p className="small muted" style={{ overflowWrap: "anywhere" }}>
                {[selected.description, selected.component ? `Component ${selected.component}.` : null].filter(Boolean).join(" ")}
                {selected.last_run_pass_rate != null ? ` Last run ${Math.round(selected.last_run_pass_rate)}% pass.` : ""}
              </p>
            </div>
            {manage ? (
              <div className="row" style={{ gap: 8 }}>
                <Button size="sm" onClick={() => setEditing(selected)}>Edit suite</Button>
                <Button size="sm" variant="ghost" aria-label={`Delete suite ${selected.name}`} onClick={() => setDeleting(selected)}>
                  <IconTrash />
                  Delete suite
                </Button>
              </div>
            ) : null}
          </div>
          {cases.isPending ? (
            <TableSkeleton rows={4} />
          ) : !data ? (
            <ErrorState what="the cases of this suite" onRetry={() => void cases.refetch()}
              requestId={isApiError(cases.error) ? cases.error.requestId : undefined} />
          ) : data.items.length === 0 ? (
            <div className="state-box">
              <IconSuite className="big" />
              <h2>No cases in this suite yet</h2>
              <p>{manage ? "Add the first test case to this suite." : "Cases added by your QA team will appear here."}</p>
              {manage ? (
                <Link className="btn primary" href={newCaseHref}>
                  <IconPlus />
                  New test case
                </Link>
              ) : null}
            </div>
          ) : (
            <>
              <CasesTable items={data.items} />
              <div className="pager">
                <span className="grow" role="status">Showing {first} to {last} of {data.total}</span>
                <Button size="sm" disabled={page <= 1} onClick={() => goPage(page - 1)}>Previous</Button>
                <Button size="sm" disabled={last >= data.total} onClick={() => goPage(page + 1)}>Next</Button>
              </div>
            </>
          )}
        </section>
      </div>
      {dialogs}
    </>
  );
}
