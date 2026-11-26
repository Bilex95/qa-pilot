"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { Brand } from "@/components/brand";
import { IconChevron, IconLogout, IconMenu, IconPlus, IconSearch, IconUser } from "@/components/icons";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { can, ROLE_NAMES } from "@/lib/permissions";
import { useSession } from "@/lib/session/session-provider";
import { initials } from "@/lib/utils";

import { NAV } from "./nav";
import { useOrg } from "./org-context";

/** App shell from the locked prototype (sidebar, header, org switcher, user menu). Role aware (REQ-007). */
export function AppShell({ children }: { children: ReactNode }) {
  const org = useOrg();
  const { me, logout } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [navOpen, setNavOpen] = useState(false);
  const [navPath, setNavPath] = useState(pathname);
  if (navPath !== pathname) {
    // Close the mobile drawer after navigating (state adjusted during render, not in an effect)
    setNavPath(pathname);
    setNavOpen(false);
  }
  const base = `/o/${org.slug}`;
  const section = pathname.slice(base.length + 1).split("/")[0] ?? "";

  useEffect(() => {
    document.body.classList.toggle("nav-open", navOpen);
    return () => document.body.classList.remove("nav-open");
  }, [navOpen]);
  useEffect(() => {
    // A page change must not leave focus lost on the body (the control that was clicked may be gone): put it on the content area
    const a = document.activeElement;
    if (!a || a === document.body || !document.body.contains(a)) document.getElementById("main")?.focus({ preventScroll: true });
  }, [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setNavOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function signOut() {
    // RequireAuth sends a signed out user to /login exactly once; a second replace here would mount the
    // sign in page twice and wipe anything typed in between (found by the Stage 3 layout checks)
    await logout();
  }

  function onSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = String(new FormData(e.currentTarget).get("q") ?? "").trim();
    router.push(`${base}/bugs${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  }

  const user = me?.user;
  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Main navigation">
        <Brand href={`${base}/dashboard`} />
        <nav className="nav">
          {NAV.map(({ group, items }) => (
            <div key={group ?? "main"} style={{ display: "contents" }}>
              {group ? <div className="nav-group">{group}</div> : null}
              {items
                .filter((i) => !i.requires || can(org.role, i.requires))
                .map((i) => (
                  <Link key={i.key} href={`${base}/${i.path}`} aria-current={section === i.path ? "page" : undefined}>
                    <i.icon />
                    <span>{i.label}</span>
                  </Link>
                ))}
            </div>
          ))}
        </nav>
      </aside>
      <div className="scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />
      <div className="main">
        <header className="header">
          <Button variant="ghost" size="icon" className="menu-toggle" aria-label="Open navigation" aria-expanded={navOpen}
            onClick={() => setNavOpen(true)}>
            <IconMenu />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger className="org-switch" aria-label={`Switch organization, current ${org.name}`}>
              <span className="org-badge">{initials(org.name)}</span>
              <span className="hide-sm org-name" title={org.name}>{org.name}</span>
              <IconChevron width={14} height={14} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Your workspaces</DropdownMenuLabel>
              {me?.memberships.map((m) => (
                <DropdownMenuItem key={m.org.id} asChild>
                  <Link href={`/o/${m.org.slug}/dashboard`}>
                    {m.org.name}
                    {m.org.slug === org.slug ? " (current)" : ""}
                  </Link>
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem asChild>
                <Link href="/onboarding/org">
                  <IconPlus />
                  Create workspace
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <form className="search" role="search" onSubmit={onSearch}>
            <label className="sr-only" htmlFor="gsearch">Search bugs</label>
            <IconSearch />
            <input id="gsearch" name="q" className="input" placeholder="Search bugs by key or title" />
          </form>
          <div className="header-spacer" />
          {can(org.role, "bug.create") ? (
            <Link className="btn primary hide-sm" href={`${base}/bugs/new`}>
              <IconPlus />
              Report bug
            </Link>
          ) : null}
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="user-btn" aria-label={`Account menu for ${user.full_name}`}>
                <Avatar id={user.id} name={user.full_name} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>
                  {user.full_name}, {ROLE_NAMES[org.role]}
                </DropdownMenuLabel>
                <DropdownMenuItem asChild>
                  <Link href={`${base}/settings?tab=profile`}>
                    <IconUser />
                    My profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void signOut()}>
                  <IconLogout />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </header>
        <main id="main" className={`content${section === "board" ? " wide" : ""}`} tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
