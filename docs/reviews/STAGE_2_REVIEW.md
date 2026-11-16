# Stage 2 Review: HTML first prototype and design lock

**Branch:** `stage/2-prototype` | **Date:** 2026-11-16 | **Playbook gates:** 2 (prototype, design lock) and the screenshot part of handoff

## 1. Summary

One self contained, navigable prototype covers all 22 screens in the inventory, with hash routing, a **View as** role switcher for the 5 roles, and a prototype toolbar to show every state (default, empty, loading, error, plus named states such as the AI suggestion, a failed run step and the invite dialog). Design tokens are documented. 100 screenshots were captured with Playwright and validated. Per your mid stage instruction (D-035), the prototype is checked automatically at 320, 360, 375, 390, 412, 430, 768, 1024 and 1440 px for sideways scrolling, elements wider than the screen, clipped or overlapping text and 44 px tap targets. The roles, accessibility (axe) and Mermaid diagrams are checked too. Everything passes.

Also done in this stage, at your request: the private GitHub repo `Bilex95/qa-pilot` with the PR based gate flow (D-034).

## 2. What was built

| File | Contents |
|---|---|
| `design/reference/approved.html` | The prototype: 22 screens, synthetic data for the fictional "Lumen Freight", permission matrix and bug workflow implemented in the page, working filters, search, saved views, sorting, Kanban drag and drop with a keyboard "Move to" menu, dialogs with focus trap, toasts, tooltips on charts |
| `design/TOKENS.md` | Colour, type, spacing, radius, elevation, breakpoints and touch sizing, component list for Stage 3 |
| `design/screenshots/*.png` (100) | Desktop 1440x900 and mobile 390x844, names from the screen inventory |
| `design/screenshots/INDEX.md` | Generated contact sheet with links and thumbnails |
| `docs/requirements/SCREEN_INVENTORY.md` | New section 4: final requirement, route, role and screenshot mapping |
| `e2e/scripts/capture-design.mjs` | Captures the screenshots from the inventory list and writes the contact sheet |
| `e2e/scripts/check-prototype.mjs` | Render matrix, role rules, layout at 9 widths, tap targets, axe |
| `e2e/scripts/check-mermaid.mjs` | Renders the Stage 1 Mermaid diagrams (the gap noted in the Stage 1 review) |
| `scripts/validate-design.ps1` | One command for all Stage 2 checks |
| `docs/DECISIONS.md` | D-033 (Stage 1 feedback), D-034 (GitHub), D-035 (phone sizes) |

### Design direction (summary of `design/TOKENS.md`)

* Built for people who scan dense lists all day: cool paper background, slate ink, instrument teal for actions, bordered tables instead of card stacks, small radii, almost no shadow.
* Type: Atkinson Hyperlegible (made for legibility) for everything; IBM Plex Mono only for real ids such as `WEB-142`.
* The one bold element: **AI output looks like an editor's proof mark**: dashed outline, highlighter wash, a tag that says "AI suggestion, not saved", and Accept, Edit, Discard. Highlighter amber is used for nothing else, so users always know which text a machine wrote.
* Severity, status and readiness always carry a text label, never colour alone.

## 3. How to review in under 15 minutes

1. **Open the prototype:** double click `design/reference/approved.html` (it opens in your browser; fonts load from Google Fonts, and offline it falls back to system fonts). Any email signs you in.
2. **(5 min) Main flows as QA Engineer:** set **View as** to QA Engineer in the header.
   * Report bug, then **Write the report** in the AI Bug Writer panel: see the proof mark suggestion and the duplicate warning.
   * Test runs, then *WEB 2.4.0 regression*, then expand TC-103: a failed step with **Create bug from failed step**, which opens a prefilled bug.
3. **(3 min) Roles:** switch **View as** to Viewer (no Report bug, can comment, nothing else editable), then Developer (open `WEB-141`: **Assign to me**; open `WEB-137`: no status buttons because it is assigned to someone else), then Org Admin (Members, AI usage, Settings with the AI switch).
4. **(2 min) Board:** drag a card. Drops your role may not make are refused with a message; the arrow on each card is the keyboard alternative.
5. **(2 min) States:** the dashed **Prototype** box at the bottom right switches the current screen between default, empty, loading, error and its named states.
6. **(2 min) Phone sizes:** in Chrome, F12 then the device toolbar; try 320 px and 412 px.
7. **Screenshots:** `design/screenshots/INDEX.md` (VS Code markdown preview or GitHub shows thumbnails).
8. **Rerun every check yourself (about 6 minutes):**
   ```powershell
   cd e2e; npm ci; npx playwright install chromium; cd ..
   powershell -ExecutionPolicy Bypass -File scripts/validate-design.ps1
   ```

## 4. Evidence

### Full validation (real output)

```
> powershell -ExecutionPolicy Bypass -File scripts/validate-design.ps1
== Traceability
Requirements: 63 (Must 52, Should 9, Could 2)
Screens: 22  Endpoints: 97  Artifacts: 5  Decisions: 35
Planned screenshots: 100 (100 unique)
PASS: every screen maps to a REQ, every Must REQ maps to a screen, endpoint or artifact, no orphan ids, prose rule holds
== Prototype (roles, layout at 320 to 1440 px, tap targets, axe)
Layout checked: 39 screens and states at 320, 360, 375, 390, 412, 430, 768, 1024, 1440 px
Rendered 1000 route x role x state combinations; 10 axe scans
PASS: no script errors, role rules hold, no element wider than the screen, no clipped or overlapping text, 44 px tap targets up to 1024 px, no serious or critical axe violations
== Screenshot files
PASS: 100 valid local screenshots; GitHub links not checked
DESIGN VALIDATION PASSED
```

### The checks can fail (negative tests)

The layout check, run on the dashboard at 390 px with a planted 600 px wide element and a 30 px button:

```
FAIL: 3 problem(s)
  - at 390px: page scrolls sideways by 222px [/o/lumen/dashboard]
  - at 390px: wider than screen: div "planted wide element" spans 12 to 612 [/o/lumen/dashboard]
  - at 390px: tap target 30x30: button "x" [/o/lumen/dashboard]
exit=1
```

The first real run of the check also caught a genuine prototype bug (see fix 1 below).

### Mermaid diagrams from Stage 1

```
> node e2e/scripts/check-mermaid.mjs
OK   DOMAIN_MODEL.md#1 30737 bytes of SVG
OK   DOMAIN_MODEL.md#2 21706 bytes of SVG
PASS: 2 Mermaid diagrams render
```

### Chart palette (dataviz validator)

Trend series `#C2410C` (opened) and `#2563C9` (closed) on white: all checks pass (lightness band, chroma floor, colour vision deficiency separation, normal vision separation, contrast). The first choice, teal, failed the chroma floor and was replaced.

### Role rules verified automatically

Viewer: no Report bug, no Members or AI usage, can comment, no status buttons, severity read only, no AI triage. Developer: can self assign an unassigned bug and start it, cannot move or take a bug assigned to someone else, cannot set severity when reporting. QA Engineer: can set severity, cannot delete, cannot open Members, cannot draft a release summary. QA Lead: members read only, settings tabs are Labels and My profile. Board: the "Move to" menu disables moves the role may not make.

## 5. Size specific fixes (D-035)

The layout check reported 2,690 problems on its first run. Part of that came from the checker itself: it treated each Kanban column's vertical scroll as a sideways scroll container. I fixed the checker, then the CSS: 158 problems were left after the main pass, then 1, then 0.

| # | Problem found | Widths | Fix |
|---|---|---|---|
| 1 | Menus and dialogs stayed in the page after navigating, so a menu opened on the board made later pages scroll sideways | all, after using a menu | Menus and dialogs are removed on every navigation |
| 2 | The closed navigation drawer still counted as content and could take keyboard focus | 320 to 768 | Closed drawer is `visibility: hidden` |
| 3 | Buttons, inputs, selects, nav links, tabs, saved view tabs, result buttons, switches, menu items, disclosure toggles, table title links, breadcrumbs and panel links were 17 to 36 px tall | 320 to 1024 | 44 px minimum height and width at 1024 px and below; 1440 px desktop keeps 36 px |
| 4 | Bug detail scrolled sideways by 34 px: grid columns took their minimum width from the no wrap tab strip and the field selects | 320 | `min-width: 0` on grid and stack children; the field list uses `minmax(0, 1fr)` |
| 5 | Run step tables had no scroll container of their own (preventive; the checker had not flagged it) | 320 to 430 | Step table now scrolls inside its own container |
| 6 | "Sign in instead" in a form error was measured as a stand alone link | all | Error text is now one sentence, so the link counts as inline text (WCAG 2.5.8 exception) |
| 7 | Table sort buttons were 42 px wide | 768, 1024 | 44 px minimum width |
| 8 | Header too tight on the smallest phones | 320 to 400 | Tighter header padding and gaps, role switcher capped at 112 px, smaller readout numbers and page padding |
| | Rows 9 to 11 were found in my visual review of the screenshots, not by the checker | | |
| 9 | On stacked mobile rows the bug title and its component line sat side by side | 320 to 767 | Title cell stacks vertically |
| 10 | Mobile sign in pages had a half screen dark band | 320 to 767 | Auth layout rows set to content height |
| 11 | Bug keys wrapped ("WEB-" and "142") in narrow tables | 1440 in narrow columns | Ids never wrap |

Related accessibility fix: input and button borders (`--line-strong`) were 1.86:1 against white, below the WCAG 1.4.11 minimum of 3:1. They are now `#858E87`: 3.4:1 on white, 3.1:1 on paper.

## 6. Decisions made in this stage

| Decision | Summary |
|---|---|
| D-033 | Stage 1 feedback applied: developers self assign, viewers comment; SLA numbers still pending (see gaps) |
| D-034 | Private GitHub repo `Bilex95/qa-pilot`; push stage branch and open a PR at each gate; merge with a merge commit after approval |
| D-035 | Phone and tablet widths, 44 px tap targets up to 1024 px, automated layout checks |

Design choices recorded in `design/TOKENS.md`: palette, type, proof mark treatment for AI, borders over shadows, sentence case.

## 7. Known gaps and risks

* **SLA numbers still needed (D-019).** Your Stage 1 note gave the format but the values were placeholders ("X"). The prototype uses the working values (Critical 48 hours, High 5 days, Medium 14 days, Low 30 days). Send the four numbers and I will mark them confirmed.
* The prototype is a design artifact: data is in memory and resets on reload; most saves show a toast instead of saving. The bug detail page shows the same description and timeline for every bug.
* The **View as** role switcher and the dashed **Prototype** toolbar exist only in the prototype. Screenshots hide the toolbar but show the role switcher in the header; the real app will not have it, which the Stage 4 parity notes will mention.
* Fonts come from Google Fonts. Offline, the prototype falls back to system fonts. Stage 3 self hosts both fonts through `next/font`.
* Text overlap is checked automatically only between siblings in toolbars, rows and headers, and text clipping only where an element hides overflow. Free floating overlap elsewhere relied on my visual review of the screenshots.
* The 44 px rule is applied up to 1024 px wide. A touch laptop wider than 1024 px gets the 36 px desktop controls (D-035).
* Dark theme not built (optional in the brief).
* Interpretation to confirm: in D-035 I read "the validator" as the prototype checker, because the playbook's image validator only reads PNG files. Both run from `scripts/validate-design.ps1`.

## 8. Next stage

Stage 3: foundations. Docker Compose v2 (db, backend, frontend with healthchecks, run through WSL per D-001), FastAPI app with auth, tenancy, RBAC and audit, Alembic, Next.js app shell matching this design with the tokens above, seed CLI with the 5 scenarios, Postman collection, CI workflow, AGENTS.md, and the issue plan with its dependency graph for Stages 4 to 6.

**After you approve, the design is locked:** no redesign without your written permission.

## 9. Changes after feedback (Stage 2 gate, D-036)

| Note | What changed |
|---|---|
| SLAs confirmed: creation until Fixed, calendar time, Critical 24 h, High 3 d, Medium 14 d, Low 30 d | D-019 rewritten and marked **confirmed**. Cases the note did not cover were decided and written down: moving past Fixed keeps the clock stopped, Won't fix stops it, Reopened restarts it from creation, current severity applies. REQ-041, C-09 and RISK-11 updated. Prototype rule and tooltip updated; the seeded data now has 7 bugs past SLA instead of 4. `docs/BUILD_PLAN.md` still says the `sla-breach` scenario holds "old untouched critical bugs"; I left your plan unchanged and the Stage 3 seed will follow D-019. |
| No input or select on `--surface-sunk` with a 2.95:1 border | New audit in `check-prototype.mjs` covering 769 control and screen pairs. No control sits on `--surface-sunk`, but the 265 disabled pairs use it as their own fill, so their border was 2.95:1. You rejected a white fill (the grey fill is the disabled signal; touch screens have no cursor). Instead `--line-strong` is now `#828B84`: 3.51:1 on white, 3.27:1 on paper, 3.07:1 on the grey disabled fill. The checker holds disabled controls to 3:1 as well. `design/TOKENS.md` updated. |
| Route tag pushes through `safe-push.sh` | Done now instead of before Stage 6: `bash scripts/safe-push.sh --tag <name>` runs the same gates plus "tag is on origin/main" and "tag does not exist on origin yet". `CLAUDE.md` updated. |
| Merge PR #1 with a normal merge | Done after these changes were pushed (merge commit, not squash). |

Rerun after the changes (real output):

```
== Traceability
Requirements: 63 (Must 52, Should 9, Could 2)
Screens: 22  Endpoints: 97  Artifacts: 5  Decisions: 36
PASS: every screen maps to a REQ, every Must REQ maps to a screen, endpoint or artifact, no orphan ids, prose rule holds
== Prototype (roles, layout at 320 to 1440 px, tap targets, axe)
Form controls audited: 769 (control x screen), 265 disabled; lowest border contrast 3.27:1 against surroundings, 3.07:1 against own fill
Controls sitting on --surface-sunk (#EEF0ED): 0
Disabled controls under 3:1: 0
Layout checked: 39 screens and states at 320, 360, 375, 390, 412, 430, 768, 1024, 1440 px
Rendered 1000 route x role x state combinations; 10 axe scans
PASS: no script errors, role rules hold, no element wider than the screen, no clipped or overlapping text, 44 px tap targets up to 1024 px, no serious or critical axe violations
== Screenshot files
PASS: 100 valid local screenshots; GitHub links not checked
DESIGN VALIDATION PASSED
```

Negative tests: with the old border colour injected, the border audit failed with 14 problems on one screen (for example `n-proj border #B9C0BA is 1.86:1`). The tag gate blocked a tag not on main, a tag that already exists on origin, a missing tag, and branch plus tag given together; a new tag on main passed the dry run.
