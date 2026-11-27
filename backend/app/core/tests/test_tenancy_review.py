"""Tenancy review guard (I-21, REQ-008, D-003).

Every function in an infrastructure module that builds a query must take the organization into account (`org_id` appears in
it). The functions below are the reviewed exceptions: each is either global by design (people, sign in tokens and links are
not tenant data) or is only ever given ids that the caller already loaded through an org scoped query. A new function that
queries without `org_id` fails this test until it is reviewed and added here with its reason.
"""

import re
from pathlib import Path

MODULES = Path(__file__).resolve().parents[2] / "modules"
QUERY = re.compile(r"select\(|\.get\(|\.query\(|delete\(|update\(")

REVIEWED = {
    # global by design: users, refresh tokens and reset links are looked up by their own secret or id
    "auth/infrastructure/repository.py": {
        "get_user", "get_user_by_email", "get_users", "get_refresh_token", "get_refresh_token_by_id", "get_reset_by_hash",
        "revoke_pending_resets", "claim_reset", "revoke_all_for_user",
    },
    # the workspace is resolved by slug and the caller then checks membership; invitations by the hash of a secret
    "orgs/infrastructure/repository.py": {"get_org_by_slug", "get_invitation_by_hash"},
    # called only with ids from a bug or project the caller loaded with its org_id
    "bugs/infrastructure/repository.py": {"label_ids_by_bug", "detail_counts"},
    "projects/infrastructure/repository.py": {"component_name_taken", "environment_name_taken", "next_environment_order"},
    "releases/infrastructure/repository.py": {"name_taken"},
    "testing/infrastructure/repository.py": {"suite_name_taken"},
    # the mock provider reads no database
    "ai/infrastructure/mock.py": {"complete_json"},
    "ai/infrastructure/mock_features.py": {"bug_writer", "explain_log", "triage", "test_cases"},
}


def _unscoped() -> dict[str, set[str]]:
    found: dict[str, set[str]] = {}
    for path in sorted(MODULES.glob("*/infrastructure/*.py")):
        text = path.read_text(encoding="utf8")
        for block in re.split(r"\n(?=def |    def |async def )", text):
            if QUERY.search(block) and "org_id" not in block:
                name = re.match(r"\s*(?:async )?def (\w+)", block)
                if name:
                    found.setdefault(path.relative_to(MODULES).as_posix(), set()).add(name.group(1))
    return found


def test_every_query_function_is_org_scoped_or_reviewed() -> None:
    assert _unscoped() == REVIEWED
