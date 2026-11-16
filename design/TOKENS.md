# QA Pilot design tokens

Source of truth: the `:root` block at the top of `design/reference/approved.html`. Stage 3 copies these values into `frontend/tailwind.config.ts` and `globals.css` unchanged. Light theme only in v1.

## 1. Design direction

QA Pilot is an inspection instrument for people who scan dense lists all day. Quiet surfaces, bordered tables instead of stacks of identical cards, small radii, almost no shadow. Boldness is spent in one place: **AI output looks like an editor's proof mark** (dashed outline, highlighter wash, a "not saved" tag, Accept, Edit and Discard). Highlighter amber is reserved for AI and never used for anything else, so users always know which text a machine wrote.

## 2. Colour

### Base

| Token | Value | Use |
|---|---|---|
| `--paper` | `#F6F7F5` | App background (cool off white, not cream) |
| `--surface` | `#FFFFFF` | Panels, tables, inputs |
| `--surface-sunk` | `#EEF0ED` | Table headers, sunken areas, hover |
| `--ink` | `#18222F` | Primary text, sidebar background |
| `--ink-2` | `#435061` | Secondary text |
| `--ink-3` | `#5F6B7A` | Muted text (5.05:1 on paper, 5.4:1 on white) |
| `--line` | `#D9DDD8` | Borders and dividers |
| `--line-strong` | `#858E87` | Input and button borders (3.4:1 on white, 3.1:1 on paper, meets WCAG 1.4.11) |
| `--primary` | `#0C6B67` | Instrument teal: primary actions, links, focus ring (6.3:1 on white) |
| `--primary-hover` | `#095753` | Hover and pressed |
| `--primary-wash` | `#E3F1EF` | Selected rows, active tabs |
| `--sidebar`, `--sidebar-ink`, `--sidebar-active` | `#18222F`, `#C9D2DC`, `#253244` | Navigation |

### AI proof mark (reserved)

| Token | Value | Use |
|---|---|---|
| `--ai-wash` | `#FFF7D6` | Suggestion background |
| `--ai-mark` | `#F4D35E` | Highlighter tag and underline marks |
| `--ai-line` | `#9A7400` | Dashed suggestion border (4.0:1 against the wash) |
| `--ai-ink` | `#4D3A00` | Text on the tag and reason lines |

### Severity (always shown with a text label, never colour alone)

| Severity | Text `--sev-*` | Wash `--sev-*-wash` |
|---|---|---|
| Critical | `#B42318` | `#FDE8E6` |
| High | `#B5400B` | `#FDEBDD` |
| Medium | `#3E5BA9` | `#E6ECFA` |
| Low | `#4F6B5A` | `#E5EFE8` |

### Status badges (bug workflow)

| Status | Background | Text |
|---|---|---|
| New | `#E8ECF2` | `#2F3E52` |
| Triaged | `#E9E7F7` | `#44388F` |
| In progress | `#E5EEFC` | `#1C4E9E` |
| Fixed | `#E3F1EF` | `#095753` |
| Ready for retest | `#F1E6F7` | `#6A2F86` |
| Verified | `#E2F3E9` | `#17663F` |
| Closed | `#ECEEEC` | `#4A5560` |
| Reopened | `#FDEBDD` | `#96350A` |
| Won't fix | transparent, dashed border | `#5F6B7A` |

### Feedback, readiness and test results

| Token | Value | Use |
|---|---|---|
| `--ok`, `--ok-wash` | `#1E7F4F`, `#E2F3E9` | Success, Ready |
| `--warn`, `--warn-wash` | `#8A5300`, `#FCEFD9` | At risk, duplicate warning |
| `--danger`, `--danger-wash` | `#B42318`, `#FDE8E6` | Errors, Blocked, Past SLA |
| `--info`, `--info-wash` | `#2563C9`, `#E5EEFC` | Information banners |
| `--res-pass`, `--res-fail`, `--res-blocked`, `--res-skipped`, `--res-untested` | `#1E7F4F`, `#B42318`, `#6B5BB5`, `#7C8696`, `#D5DAD6` | Test result bars and buttons |

### Charts

| Token | Value | Use |
|---|---|---|
| `--series-1` | `#C2410C` | Opened (solid line) |
| `--series-2` | `#2563C9` | Closed (dashed line) |
| `--chart-bar` | `#0C6B67` | Single series bars |
| `--chart-grid` | `#E6E9E5` | Grid lines |

The two series colours were checked with the dataviz palette validator (lightness band, chroma floor, colour vision deficiency separation, normal vision separation, contrast): all checks pass on white. Series are also told apart by line style (solid vs dashed), a legend and direct end labels, and every chart has a hover tooltip; the trend chart has a "Show as table" view.

## 3. Type

| Token | Value |
|---|---|
| `--font-ui` | Atkinson Hyperlegible (Google Fonts), fallback Segoe UI, system UI. Chosen for legibility; its distinct letterforms (slashed zero, open shapes) suit reading bug ids and numbers |
| `--font-mono` | IBM Plex Mono 500. Used only for real identifiers (`WEB-142`, `TC-103`, environment names), never for labels |
| Scale | `--fs-xs` 12, `--fs-sm` 13, `--fs-md` 14 (body), `--fs-lg` 16, `--fs-xl` 20, `--fs-2xl` 26 (page title), `--fs-3xl` 34 (readout numbers, auth headline) |
| Line height | `--lh-tight` 1.2 headings, `--lh-body` 1.5 |
| Weights | 400 regular, 700 bold. No other weights |

Sentence case everywhere. No all caps labels.

## 4. Space, radius, elevation, layout

| Token | Value |
|---|---|
| Spacing | `--sp-1` 4, `--sp-2` 8, `--sp-3` 12, `--sp-4` 16, `--sp-5` 20, `--sp-6` 24, `--sp-8` 32, `--sp-10` 40, `--sp-12` 48 (px) |
| Radius | `--r-sm` 4 (controls), `--r-md` 8 (panels), `--r-lg` 12 (dialogs), `--r-pill` 999 (badges) |
| Shadow | `--shadow-float` for menus, dialogs and toasts only; `--shadow-drag` for a card being dragged. Panels use borders, not shadows |
| Layout | `--sidebar-w` 232, `--header-h` 56, `--content-max` 1280 |
| Focus | 2 px `--primary` outline with 2 px offset; inputs use a 3 px teal ring |

## 5. Breakpoints and touch sizing (D-035)

| Width | Behaviour |
|---|---|
| 1440 and up | Full layout, 36 px controls |
| 1024 and below | All controls, links used as targets, tabs, switches and menu items at least 44 by 44 px |
| Below 1024 | Sidebar becomes an off canvas drawer (hidden from keyboard while closed); two column layouts stack |
| Below 768 | Tables become stacked rows; forms single column; header search hidden |
| 400 and below | Tighter header and page padding |

Verified at 320, 360, 375, 390, 412, 430, 768, 1024 and 1440 px by `e2e/scripts/check-prototype.mjs`.

## 6. Components to build in Stage 3

Button (primary, default, ghost, danger, small, icon), input, select, textarea, switch, checkbox, badge (severity, status, readiness, SLA), priority tag, label chip, avatar, readout strip, panel, data table with stacked mobile mode, filter bar, saved view strip, tabs, dialog with focus trap, menu, toast, skeleton, empty state, error state, AI panel, AI suggestion (proof mark) with Accept, Edit, Discard, duplicate warning, Kanban column and card with "Move to" menu, test result button group, progress bar, horizontal bars, line chart, vertical bars.
