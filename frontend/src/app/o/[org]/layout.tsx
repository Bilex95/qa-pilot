"use client";

import { useParams } from "next/navigation";
import type { ReactNode } from "react";

import { ErrorState, LoadingPanel } from "@/components/ui/feedback";
import { RequireAuth } from "@/lib/session/require-auth";
import { useSession } from "@/lib/session/session-provider";
import { AppShell } from "@/modules/shell/app-shell";
import { OrgContext } from "@/modules/shell/org-context";
import { NotFoundScreen } from "@/modules/shell/not-found-screen";

function OrgGate({ children }: { children: ReactNode }) {
  const { org: slug } = useParams<{ org: string }>();
  const { me, meLoading, reloadMe } = useSession();
  if (meLoading || !me) {
    return (
      <main id="main" className="content">
        {meLoading ? <LoadingPanel rows={4} /> : <ErrorState what="your workspace" onRetry={() => void reloadMe()} />}
      </main>
    );
  }
  const membership = me.memberships.find((m) => m.org.slug === slug);
  if (!membership) {
    // Same screen whether the workspace does not exist or belongs to someone else (D-003)
    return (
      <main id="main" className="content">
        <NotFoundScreen home={me.memberships[0] ? `/o/${me.memberships[0].org.slug}/dashboard` : "/onboarding/org"} />
      </main>
    );
  }
  return (
    <OrgContext.Provider value={{ ...membership.org, role: membership.role }}>
      <AppShell>{children}</AppShell>
    </OrgContext.Provider>
  );
}

export default function OrgLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth fallback={<main id="main" className="content"><LoadingPanel rows={4} /></main>}>
      <OrgGate>{children}</OrgGate>
    </RequireAuth>
  );
}
