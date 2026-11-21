"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { IconBoard, IconPlus } from "@/components/icons";
import { EmptyState, ErrorState } from "@/components/ui/feedback";
import { Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api, unwrap } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { can } from "@/lib/permissions";
import { useSession } from "@/lib/session/session-provider";
import { StatusBadge } from "@/modules/bugs/components/bug-badges";
import { useProjects } from "@/modules/bugs/hooks";
import { STATUS_NAME } from "@/modules/bugs/schemas";
import { useOrg } from "@/modules/shell/org-context";

import { BoardCard } from "./components/board-card";
import { useWorkflow } from "./hooks";
import { allowedTargets, moveCard, whyNot, type Board, type BoardBug } from "./workflow";

const PER_COLUMN = 50; // the API sends the first 50 cards of each column

/**
 * SCR-09 Board (API-065 to API-068; REQ-019, REQ-028). One column per status. A card moves by drag and drop or with the
 * keyboard through its Move to menu; both go through the same function. The move shows at once and is rolled back with a
 * message when the server refuses (D-025).
 */
export function BoardPage() {
  const org = useOrg();
  const { me } = useSession();
  const toast = useToast();
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const asked = useSearchParams().get("project") ?? "";
  const projects = useProjects();
  const workflow = useWorkflow();
  const [dragging, setDragging] = useState<BoardBug | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const project = projects.data?.items.some((p) => p.id === asked) ? asked : "";
  const key = ["board", org.id, project || "all"];
  const board = useQuery({
    queryKey: key,
    placeholderData: keepPreviousData,
    queryFn: () =>
      unwrap(api.GET("/api/v1/orgs/{org_id}/bugs/board", {
        params: { path: { org_id: org.id }, query: { project_id: project || undefined } },
      })),
  });
  const who = { role: org.role, userId: me?.user.id };
  const canMove = org.role !== "viewer";

  const move = useMutation({
    mutationFn: ({ bug, to }: { bug: BoardBug; to: string }) =>
      unwrap(api.POST("/api/v1/orgs/{org_id}/bugs/{bug_id}/transitions", {
        params: { path: { org_id: org.id, bug_id: bug.id } },
        body: { to_status: to as BoardBug["status"] },
      })),
    onMutate: async ({ bug, to }) => {
      await qc.cancelQueries({ queryKey: key });
      const before = qc.getQueryData<Board>(key);
      if (before) qc.setQueryData<Board>(key, moveCard(before, bug, to));
      return { before };
    },
    onSuccess: (_, { bug, to }) => toast(`${bug.key} moved to ${STATUS_NAME[to] ?? to}`),
    onError: (err, { bug, to }, ctx) => {
      if (ctx?.before) qc.setQueryData<Board>(key, ctx.before); // the card goes back where it was
      if (isApiError(err, "invalid_transition")) toast(`${bug.key} cannot move to ${STATUS_NAME[to] ?? to} any more. The board was out of date and is refreshed.`, "error");
      else if (isApiError(err, "forbidden")) toast(err.message, "error");
      else if (isApiError(err, "not_found")) toast(`${bug.key} was deleted by someone else.`, "error");
      else toast(`Could not move ${bug.key}. Check your connection and try again.`, "error");
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["board", org.id] });
      void qc.invalidateQueries({ queryKey: ["bugs", org.id] });
    },
  });

  /** The one way a card moves (drag or menu): the screen refuses what the workflow does not allow, with the reason. */
  function attempt(bug: BoardBug, to: string) {
    if (bug.status === to || move.isPending) return;
    if (!allowedTargets(workflow.data, bug, who).includes(to)) {
      toast(whyNot(bug, to, who), "error");
      return;
    }
    move.mutate({ bug, to });
  }

  const head = (
    <div className="page-head">
      <div className="grow">
        <h1>Board</h1>
        <p>Drag a card to change its status. Only moves allowed for your role are accepted.</p>
      </div>
      <div className="actions">
        <label className="sr-only" htmlFor="b-proj">Project</label>
        <Select id="b-proj" style={{ width: "auto" }} value={project}
          onChange={(e) => router.replace(e.target.value ? `${pathname}?project=${e.target.value}` : pathname)}>
          <option value="">All projects</option>
          {(projects.data?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </div>
    </div>
  );

  if (board.isPending || workflow.isPending) {
    return (
      <>
        {head}
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading</span>
          <div className="board" aria-hidden="true">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="col" style={{ padding: 12 }}>
                <div className="sk" style={{ height: 14, width: "50%" }} />
                {[1, 2, 3].map((j) => <div key={j} className="sk" style={{ height: 84, marginTop: 10 }} />)}
              </div>
            ))}
          </div>
        </div>
      </>
    );
  }
  const data = board.data;
  if (!data || !workflow.data) {
    const error = board.error ?? workflow.error;
    return (
      <>
        {head}
        <ErrorState what="the board" onRetry={() => { void board.refetch(); void workflow.refetch(); }}
          requestId={isApiError(error) ? error.requestId : undefined} />
      </>
    );
  }
  if (data.columns.every((c) => c.total === 0)) {
    const report = can(org.role, "bug.create") ? (
      <Link className="btn primary" href={`/o/${org.slug}/bugs/new`}><IconPlus />Report bug</Link>
    ) : undefined;
    return (
      <>
        {head}
        <EmptyState icon={IconBoard} title="The board is empty" action={report}>
          There are no bugs in this project yet. Reported bugs appear in the New column.
        </EmptyState>
      </>
    );
  }

  const dropOk = dragging ? allowedTargets(workflow.data, dragging, who) : [];
  const search = project ? `&project=${project}` : "";

  return (
    <>
      {head}
      <div className="board" id="board">
        {data.columns.map((col) => {
          const name = STATUS_NAME[col.status] ?? col.status;
          const hover = dragging && over === col.status && dragging.status !== col.status;
          const cls = ["col", hover ? (dropOk.includes(col.status) ? "drop-ok" : "drop-no") : ""].filter(Boolean).join(" ");
          return (
            <section key={col.status} className={cls} data-col={col.status} aria-label={`${name}, ${col.total} bugs`}
              onDragOver={(e) => { if (dragging) { e.preventDefault(); setOver(col.status); } }}
              onDragLeave={() => setOver((o) => (o === col.status ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                const bug = dragging;
                setDragging(null);
                setOver(null);
                if (bug) attempt(bug, col.status);
              }}>
              <div className="col-head">
                <StatusBadge status={col.status} />
                <span className="n">{col.total}</span>
              </div>
              <div className="col-body">
                {col.items.length ? col.items.map((bug) => (
                  <BoardCard key={bug.id} bug={bug} canMove={canMove} allowed={allowedTargets(workflow.data, bug, who)}
                    dragging={dragging?.id === bug.id}
                    onDragStart={() => setDragging(bug)} onDragEnd={() => { setDragging(null); setOver(null); }}
                    onMove={(to) => attempt(bug, to)} />
                )) : <div className="col-empty">No bugs</div>}
                {col.total > col.items.length ? (
                  <div className="col-empty">
                    Showing {Math.min(col.items.length, PER_COLUMN)} of {col.total}.{" "}
                    <Link href={`/o/${org.slug}/bugs?status=${col.status}${search}`}>See all {name} bugs</Link>
                  </div>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
