import type { Schemas } from "@/lib/api/client";
import type { Role } from "@/lib/permissions";
import { STATUS_NAME } from "@/modules/bugs/schemas";

export type Workflow = Schemas["WorkflowOut"];
export type BoardBug = Schemas["BugSummaryOut"];
export type Board = Schemas["BoardOut"];

/** The button and menu wording of each move (from the locked prototype). */
export const TRANSITION_LABEL: Record<string, string> = {
  triaged: "Mark triaged",
  in_progress: "Start work",
  fixed: "Mark fixed",
  ready_for_retest: "Ready for retest",
  verified: "Verify fix",
  closed: "Close",
  reopened: "Reopen",
  wont_fix: "Won't fix",
};

type Person = { role: Role | undefined; userId: string | undefined };

/**
 * The statuses this person may move this bug to: the moves of the workflow definition (API-067) that list their role, and for a
 * Developer only a bug assigned to them or to nobody (D-006). It only decides what the screen offers: the server checks again
 * and its answer wins (D-025).
 */
export function allowedTargets(workflow: Workflow | undefined, bug: Pick<BoardBug, "status" | "assignee_id">, who: Person): string[] {
  if (!workflow || !who.role || who.role === "viewer") return [];
  if (who.role === "developer" && bug.assignee_id !== null && bug.assignee_id !== who.userId) return [];
  const role = who.role;
  return workflow.transitions.filter((t) => t.from === bug.status && t.roles.includes(role)).map((t) => t.to);
}

/** Why a move is refused, in the words the card shows (the prototype's wording). */
export function whyNot(bug: Pick<BoardBug, "key" | "status" | "assignee_id" | "assignee_name">, to: string, who: Person): string {
  if (who.role === "viewer") return "Viewers cannot change bugs.";
  if (who.role === "developer" && bug.assignee_id && bug.assignee_id !== who.userId) {
    return `${bug.key} is assigned to ${bug.assignee_name ?? "someone else"}. Only the assignee can move it.`;
  }
  return `${STATUS_NAME[bug.status] ?? bug.status} cannot move to ${STATUS_NAME[to] ?? to} for your role.`;
}

/** The board with one card moved to another column, for the optimistic update (counts follow; nothing else changes). */
export function moveCard(board: Board, bug: BoardBug, to: string): Board {
  const moved: BoardBug = { ...bug, status: to as BoardBug["status"] };
  return {
    columns: board.columns.map((c) => {
      if (c.status === bug.status) return { ...c, total: Math.max(0, c.total - 1), items: c.items.filter((b) => b.id !== bug.id) };
      if (c.status === to) return { ...c, total: c.total + 1, items: [moved, ...c.items] };
      return c;
    }),
  };
}
