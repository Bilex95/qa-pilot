"""Traceability and prose checks for docs/requirements.

Run from the repo root:  python scripts/check_traceability.py
Exit code 0 when every check passes, 1 otherwise.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REQ_DIR = ROOT / "docs" / "requirements"
ID_RE = {
    "REQ": re.compile(r"REQ-\d{3}"),
    "SCR": re.compile(r"SCR-\d{2}"),
    "API": re.compile(r"API-\d{3}"),
    "ART": re.compile(r"ART-\d{2}"),
    "D": re.compile(r"\bD-\d{3}\b"),
}
errors: list[str] = []


def read(name: str) -> str:
    return (REQ_DIR / name).read_text(encoding="utf-8")


def rows(text: str, prefix: str) -> list[list[str]]:
    out = []
    for line in text.splitlines():
        if line.startswith(f"| {prefix}"):
            out.append([c.strip() for c in line.strip().strip("|").split("|")])
    return out


def expand_ranges(cell: str, kind: str) -> set[str]:
    """Expand 'REQ-018 to REQ-025' and plain lists into a set of ids."""
    ids = set(ID_RE[kind].findall(cell))
    for a, b in re.findall(rf"({kind}-\d+) to ({kind}-\d+)", cell):
        width = len(a.split("-")[1])
        for n in range(int(a.split("-")[1]), int(b.split("-")[1]) + 1):
            ids.add(f"{kind}-{n:0{width}d}")
    return ids


req_text = read("REQUIREMENTS.md")
register_part, trace_part = req_text.split("## 7. Traceability", 1)
register = {r[0]: r[3] for r in rows(register_part, "REQ-")}
trace = {r[0]: r for r in rows(trace_part, "REQ-")}
artifacts = {r[0] for r in rows(register_part, "ART-")}

scr_rows = rows(read("SCREEN_INVENTORY.md"), "SCR-")
screens = {r[0]: expand_ranges(r[4], "REQ") for r in scr_rows}
apis = {r[0] for r in rows(read("API_INVENTORY.md"), "API-")}
decisions = set(re.findall(r"^## (D-\d{3}) ", (ROOT / "docs" / "DECISIONS.md").read_text(encoding="utf-8"), re.M))

# 1. register and trace table contain the same REQs with the same priority
if set(register) != set(trace):
    errors.append(f"REQ mismatch register vs trace: {sorted(set(register) ^ set(trace))}")
for rid, pri in register.items():
    if rid in trace and trace[rid][1] != pri:
        errors.append(f"{rid}: priority {pri} in register but {trace[rid][1]} in trace table")

# 2. every Must REQ maps to a screen, endpoint or artifact; referenced ids exist
screen_to_reqs: dict[str, set[str]] = {s: set() for s in screens}
api_refs: set[str] = set()
for rid, (_, pri, scr_cell, api_cell, art_cell) in trace.items():
    scr_ids, api_ids, art_ids = (expand_ranges(scr_cell, "SCR"), expand_ranges(api_cell, "API"),
                                 expand_ranges(art_cell, "ART"))
    has_all = "All" in scr_cell or "All" in api_cell
    if pri == "Must" and not (scr_ids or api_ids or art_ids or has_all):
        errors.append(f"{rid} is Must but maps to nothing")
    for s in scr_ids - set(screens):
        errors.append(f"{rid} references unknown screen {s}")
    for a in api_ids - apis:
        errors.append(f"{rid} references unknown endpoint {a}")
    for a in art_ids - artifacts:
        errors.append(f"{rid} references unknown artifact {a}")
    targets = set(screens) if "All" in scr_cell else scr_ids
    for s in targets & set(screens):
        screen_to_reqs[s].add(rid)
    api_refs |= api_ids

# 3. every screen maps to at least one REQ, and inventory and trace agree
for s, inv_reqs in screens.items():
    specific = {r for r in screen_to_reqs[s] if "All" not in trace[r][2]}
    if not specific:
        errors.append(f"{s} has no specific requirement")
    for r in inv_reqs - set(register):
        errors.append(f"{s} lists unknown requirement {r}")
    for r in inv_reqs - specific:
        errors.append(f"{s} lists {r} in the inventory but the trace table does not map {r} to {s}")
    for r in specific - inv_reqs:
        errors.append(f"trace table maps {r} to {s} but the screen inventory row does not list it")

# 4. no orphan endpoints
for a in sorted(apis - api_refs):
    errors.append(f"{a} is not referenced by any requirement")

# 5. every id mentioned anywhere in the requirement docs exists
all_text = "\n".join(p.read_text(encoding="utf-8") for p in REQ_DIR.glob("*.md"))
known = {"REQ": set(register), "SCR": set(screens), "API": apis, "ART": artifacts, "D": decisions}
for kind, ids in known.items():
    for found in sorted(set(ID_RE[kind].findall(all_text)) - ids):
        errors.append(f"orphan id {found} mentioned but not defined")

# 6. prose rule: no em dashes, no spaced hyphens used as punctuation
prose_files = list(REQ_DIR.glob("*.md")) + [ROOT / "docs" / "DECISIONS.md"]
for p in prose_files:
    in_code = False
    for n, line in enumerate(p.read_text(encoding="utf-8").splitlines(), 1):
        if line.startswith("```"):
            in_code = not in_code
            continue
        if in_code:
            continue
        if "—" in line or "–" in line:
            errors.append(f"{p.name}:{n} contains an em or en dash")
        if re.search(r"\w - \w", line):
            errors.append(f"{p.name}:{n} uses a hyphen as punctuation")

# 7. planned screenshot count
shots = re.findall(r"`([a-z0-9-]+-(?:desktop|mobile)\.png)`", read("SCREEN_INVENTORY.md"))
must = [r for r, p in register.items() if p == "Must"]
print(f"Requirements: {len(register)} (Must {len(must)}, Should "
      f"{sum(p == 'Should' for p in register.values())}, Could {sum(p == 'Could' for p in register.values())})")
print(f"Screens: {len(screens)}  Endpoints: {len(apis)}  Artifacts: {len(artifacts)}  Decisions: {len(decisions)}")
print(f"Planned screenshots: {len(shots)} ({len(set(shots))} unique)")
if errors:
    print(f"FAIL: {len(errors)} problem(s)")
    for e in errors:
        print(f"  - {e}")
    sys.exit(1)
print("PASS: every screen maps to a REQ, every Must REQ maps to a screen, endpoint or artifact, no orphan ids, prose rule holds")
