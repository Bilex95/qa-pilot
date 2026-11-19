"use client";

import { useState } from "react";

import { IconCompass } from "@/components/icons";
import { EmptyState } from "@/components/ui/feedback";
import { can, type Action } from "@/lib/permissions";
import { useOrg } from "@/modules/shell/org-context";

import { LabelsTab } from "./components/labels-tab";

type Tab = { key: string; label: string; requires?: Action; render: () => React.ReactNode };

/**
 * SCR-20 Settings shell. I-02 delivers the Labels tab; I-11 adds Organization, Audit log and My profile by
 * appending to TABS (order from the locked prototype: Organization, Labels, Audit log, My profile).
 */
const TABS: Tab[] = [{ key: "labels", label: "Labels", requires: "label.manage", render: () => <LabelsTab /> }];

export function SettingsPage() {
  const org = useOrg();
  const tabs = TABS.filter((t) => !t.requires || can(org.role, t.requires));
  const [selected, setSelected] = useState<string>();
  const active = tabs.find((t) => t.key === selected) ?? tabs[0];

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <h1>Settings</h1>
          <p>Your profile and the settings your role can manage.</p>
        </div>
      </div>
      {active ? (
        <>
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
                onClick={() => setSelected(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div role="tabpanel" id="settings-panel" aria-labelledby={`settings-tab-${active.key}`}>
            {active.render()}
          </div>
        </>
      ) : (
        <EmptyState icon={IconCompass} title="Settings are on their way">
          Your profile and workspace settings will appear here in the next release.
        </EmptyState>
      )}
    </>
  );
}
