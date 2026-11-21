"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { can, type Action } from "@/lib/permissions";
import { useOrg } from "@/modules/shell/org-context";

import { AuditTab } from "./components/audit-tab";
import { LabelsTab } from "./components/labels-tab";
import { OrganizationTab } from "./components/organization-tab";
import { ProfileTab } from "./components/profile-tab";

type Tab = { key: string; label: string; requires?: Action; render: () => React.ReactNode };

/** Order from the locked prototype (SCR-20): Organization, Labels, Audit log, My profile. */
const TABS: Tab[] = [
  { key: "org", label: "Organization", requires: "org.update_settings", render: () => <OrganizationTab /> },
  { key: "labels", label: "Labels", requires: "label.manage", render: () => <LabelsTab /> },
  { key: "audit", label: "Audit log", requires: "audit.read", render: () => <AuditTab /> },
  { key: "profile", label: "My profile", render: () => <ProfileTab /> },
];

/**
 * SCR-20 Settings (REQ-011, REQ-012). Org Admin sees every tab, QA Lead sees Labels and My profile, everyone else sees
 * only My profile. The tab is in the address (`?tab=audit`) so the account menu can open My profile; a tab the role may not
 * use falls back to My profile. The API refuses what a role may not do whatever the screen shows (D-003).
 */
export function SettingsPage() {
  const org = useOrg();
  const router = useRouter();
  const pathname = usePathname();
  const asked = useSearchParams().get("tab");
  const tabs = TABS.filter((t) => !t.requires || can(org.role, t.requires));
  const active = (asked ? tabs.find((t) => t.key === asked) : tabs[0]) ?? tabs[tabs.length - 1]!;
  const admin = can(org.role, "org.update_settings");

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <h1>Settings</h1>
          <p>{admin ? "Workspace settings, labels, audit log and your profile." : "Your profile and the settings your role can manage."}</p>
        </div>
      </div>
      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className="tab"
            role="tab"
            id={`settings-tab-${t.key}`}
            aria-selected={t.key === active.key}
            aria-controls="settings-panel"
            onClick={() => router.replace(`${pathname}?tab=${t.key}`, { scroll: false })}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="settings-panel" aria-labelledby={`settings-tab-${active.key}`}>
        {active.render()}
      </div>
    </>
  );
}
