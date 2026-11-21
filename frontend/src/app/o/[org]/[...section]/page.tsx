"use client";

import { useParams } from "next/navigation";

import { IconCompass, IconLock } from "@/components/icons";
import { EmptyState } from "@/components/ui/feedback";
import { can, ROLE_NAMES } from "@/lib/permissions";
import { NAV, SECTION_TITLES } from "@/modules/shell/nav";
import { NotFoundScreen } from "@/modules/shell/not-found-screen";
import { useOrg } from "@/modules/shell/org-context";

/**
 * Sections whose screens arrive in Stage 4 (see docs/issues/DAG.md). Known sections show a placeholder in the
 * locked empty state style; unknown paths show the 404 screen (REQ-058).
 */
export default function SectionPage() {
  const { section } = useParams<{ section: string[] }>();
  const org = useOrg();
  const key = section[0] ?? "";
  const item = NAV.flatMap((g) => g.items).find((i) => i.path === key);
  if (!item || section.length > 1) return <NotFoundScreen home={`/o/${org.slug}/dashboard`} />;
  if (item.requires && !can(org.role, item.requires)) {
    return (
      <EmptyState icon={IconLock} title={`You do not have access to ${item.label}`}>
        Your role is {ROLE_NAMES[org.role]}. Ask an Org Admin if you need access.
      </EmptyState>
    );
  }
  const title = SECTION_TITLES[key] ?? item.label;
  return (
    <>
      <div className="page-head">
        <div className="grow">
          <h1>{title}</h1>
        </div>
      </div>
      <EmptyState icon={IconCompass} title={`${title} is on its way`}>
        This part of QA Pilot is being built and will appear here in the next release.
      </EmptyState>
    </>
  );
}
