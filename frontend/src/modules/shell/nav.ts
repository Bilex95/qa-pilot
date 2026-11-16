import type { ComponentType, SVGProps } from "react";

import {
  IconBoard,
  IconBug,
  IconDash,
  IconFolder,
  IconGear,
  IconMeter,
  IconRelease,
  IconReport,
  IconRun,
  IconSuite,
  IconUsers,
} from "@/components/icons";
import type { Action } from "@/lib/permissions";

export type NavItem = {
  key: string;
  label: string;
  path: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  requires?: Action;
};

/** Navigation per role (PERSONAS_AND_ROLES.md section 4); order and groups from the locked prototype. */
export const NAV: { group: string | null; items: NavItem[] }[] = [
  {
    group: null,
    items: [
      { key: "dashboard", label: "Dashboard", path: "dashboard", icon: IconDash },
      { key: "projects", label: "Projects", path: "projects", icon: IconFolder },
    ],
  },
  {
    group: "Bugs",
    items: [
      { key: "bugs", label: "All bugs", path: "bugs", icon: IconBug },
      { key: "board", label: "Board", path: "board", icon: IconBoard },
    ],
  },
  {
    group: "Testing",
    items: [
      { key: "tests", label: "Test suites", path: "tests", icon: IconSuite },
      { key: "runs", label: "Test runs", path: "runs", icon: IconRun },
    ],
  },
  {
    group: "Delivery",
    items: [
      { key: "releases", label: "Releases", path: "releases", icon: IconRelease },
      { key: "reports", label: "Reports", path: "reports", icon: IconReport },
    ],
  },
  {
    group: "Workspace",
    items: [
      { key: "members", label: "Members", path: "members", icon: IconUsers, requires: "member.list" },
      { key: "ai-usage", label: "AI usage", path: "ai-usage", icon: IconMeter, requires: "ai.usage_read" },
      { key: "settings", label: "Settings", path: "settings", icon: IconGear },
    ],
  },
];

export const SECTION_TITLES: Record<string, string> = Object.fromEntries(
  NAV.flatMap((g) => g.items.map((i) => [i.path, i.label === "All bugs" ? "Bugs" : i.label])),
);
