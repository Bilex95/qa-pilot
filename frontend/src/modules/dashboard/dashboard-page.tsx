"use client";

import Link from "next/link";

import { IconDash, IconPlus } from "@/components/icons";
import { EmptyState } from "@/components/ui/feedback";
import { can } from "@/lib/permissions";
import { useOrg } from "@/modules/shell/org-context";

/** SCR-05 Dashboard. Stage 3 shows the locked empty state; Stage 4 issue I-14 adds the metrics (REQ-038). */
export function DashboardPage() {
  const org = useOrg();
  return (
    <>
      <div className="page-head">
        <div className="grow">
          <h1>Dashboard</h1>
          <p>Quality across all projects in {org.name}.</p>
        </div>
      </div>
      <EmptyState
        icon={IconDash}
        title="Nothing to measure yet"
        action={can(org.role, "project.create") ? (
          <Link className="btn primary" href={`/o/${org.slug}/projects`}>
            <IconPlus />
            Create a project
          </Link>
        ) : undefined}
      >
        Create a project and report the first bug. Charts fill in as your team works.
      </EmptyState>
    </>
  );
}
