---
name: qa-pilot-ui-checks
description: Use when adding or changing a QA Pilot screen or popup: layout check states, parity screenshot capture, layout run batching and memory limits, responsive rule, globals.css generation.
---

# QA Pilot UI checks

## Responsive standing rule (D-044)
Every page, component and popup fits 360, 390, 768, 1024, 1280, 1440, 1920, 2560 px and 200% zoom: no horizontal scroll, text at least 12 px, tap targets 44 px on touch widths, popups fully inside the viewport, long text truncates or wraps. Add each new screen and popup to `e2e/scripts/check-app-layout.mjs` (runs in CI).

## While working (local)
Run only the screens you changed, at 390 and 1440. Do not run the full browser suites locally; CI does (jobs split by width batch, flows, parity, axe, D-068).

## Parity capture
Locked design: `design/reference/approved.html` and `design/screenshots/`. Do not redesign. Capture scripts: `e2e/scripts/capture-*-parity.mjs`, output in `e2e/parity/stage4/<issue>/`. Compare against the locked screenshot, fix real differences, record accepted ones in the issue's review section in `docs/reviews/STAGE_4_REVIEW.md`. Put before and after screenshots at each width in the stage review.

## Styles
`frontend/src/app/globals.css` is generated: change `design/reference/approved.html`, then `python scripts/build_globals_css.py` (CI fails on drift).

## Full layout run (only when asked or CI cannot cover it)
Use `scripts/layout-check.ps1`: it does `wsl --shutdown`, brings containers up, runs nothing else at the same time. If killed for memory, retry once with fewer parallel pages; on a second kill log it in PROGRESS and move on. Fixtures are cleaned in `finally`.
