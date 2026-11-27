"use client";

import Link from "next/link";

import { IconMove } from "@/components/icons";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PriorityTag, SeverityBadge } from "@/modules/bugs/components/bug-badges";
import { SLA_TEXT, STATUS_OPTIONS, SEVERITY_NAME } from "@/modules/bugs/schemas";
import { useOrg } from "@/modules/shell/org-context";

import type { BoardBug } from "../workflow";

type Props = {
  bug: BoardBug;
  canMove: boolean;
  allowed: string[]; // the statuses this person may move the card to
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: (to: string) => void;
};

/** A card from the locked design. The Move to menu is the keyboard way to do what dragging does (SCR-09, REQ-028). */
export function BoardCard({ bug, canMove, allowed, dragging, onDragStart, onDragEnd, onMove }: Props) {
  const org = useOrg();
  return (
    <article
      className={`card${dragging ? " dragging" : ""}`}
      draggable={canMove}
      data-key={bug.key}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", bug.key);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
    >
      <div className="row between">
        <span className="k mono">{bug.key}</span>
        {canMove ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="icon-btn" style={{ width: 26, height: 26 }}
                aria-label={`Move ${bug.key} to another status`}>
                <IconMove />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Move {bug.key} to</DropdownMenuLabel>
              {STATUS_OPTIONS.filter(([status]) => status !== bug.status).map(([status, name]) => {
                const ok = allowed.includes(status);
                return (
                  <DropdownMenuItem key={status} disabled={!ok} aria-disabled={!ok} onSelect={() => onMove(status)}>
                    {name}
                    {ok ? "" : " (not allowed)"}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      <div className="ttl">
        <Link href={`/o/${encodeURIComponent(org.slug)}/bugs/${encodeURIComponent(bug.key)}`} draggable={false} style={{ overflowWrap: "anywhere" }}>{bug.title}</Link>
      </div>
      <div className="meta">
        <SeverityBadge severity={bug.severity} />
        <PriorityTag priority={bug.priority} />
        {bug.sla_breached ? (
          <span className="badge sla" title={`Not fixed within ${SLA_TEXT[bug.severity] ?? "its limit"} of being reported (${SEVERITY_NAME[bug.severity] ?? bug.severity})`}>SLA</span>
        ) : null}
        {bug.assignee_id ? <Avatar id={bug.assignee_id} name={bug.assignee_name ?? ""} /> : null}
      </div>
    </article>
  );
}
