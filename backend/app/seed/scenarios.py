"""Seed scenario definitions (REQ-060, BUILD_PLAN section 4). Pure data; no database access.

Organizations, people, memberships and invitations are defined here; projects, bugs, tests and releases per scenario are in
`domain_data.py` (I-12, D-066).
"""

import uuid
from dataclasses import dataclass, field

from app.seed.domain_data import totals_for

NAMESPACE = uuid.UUID("6f1d3c9a-2b47-4e58-9a1e-aa0000000001")  # fixed forever: changing it changes every seeded id


def sid(kind: str, key: str) -> uuid.UUID:
    """Stable id for a seeded record."""
    return uuid.uuid5(NAMESPACE, f"{kind}:{key}")


@dataclass(frozen=True)
class SeedUser:
    key: str
    email: str
    full_name: str

    @property
    def id(self) -> uuid.UUID:
        return sid("user", self.key)


@dataclass(frozen=True)
class SeedInvite:
    key: str
    email: str
    role: str


@dataclass
class SeedOrg:
    key: str
    slug: str
    name: str
    members: list[tuple[str, str]]  # (user key, role)
    invitations: list[SeedInvite] = field(default_factory=list)

    @property
    def id(self) -> uuid.UUID:
        return sid("org", self.key)


USERS: dict[str, SeedUser] = {u.key: u for u in [
    # Lumen Freight personas (PERSONAS_AND_ROLES.md and the locked prototype)
    SeedUser("amara", "amara@lumenfreight.test", "Amara Okafor"),
    SeedUser("lukas", "lukas@lumenfreight.test", "Lukas Weber"),
    SeedUser("priya", "priya@lumenfreight.test", "Priya Raman"),
    SeedUser("diego", "diego@lumenfreight.test", "Diego Alvarez"),
    SeedUser("hana", "hana@lumenfreight.test", "Hana Sato"),
    SeedUser("tomas", "tomas@lumenfreight.test", "Tomás Silva"),
    SeedUser("mei", "mei@lumenfreight.test", "Mei Chen"),
    SeedUser("kwame", "kwame@lumenfreight.test", "Kwame Mensah"),
    SeedUser("sofia", "sofia@lumenfreight.test", "Sofia Rossi"),
    SeedUser("arjun", "arjun@lumenfreight.test", "Arjun Mehta"),
    # Harbor Clinics, the second organization (tenant isolation, REQ-008)
    SeedUser("grace", "grace@harborclinics.test", "Grace Mwangi"),
    SeedUser("omar", "omar@harborclinics.test", "Omar Haddad"),
    SeedUser("lena", "lena@harborclinics.test", "Lena Novak"),
    SeedUser("kenji", "kenji@harborclinics.test", "Kenji Ito"),
    SeedUser("ruth", "ruth@harborclinics.test", "Ruth Mensah"),
    # empty scenario
    SeedUser("empty_admin", "admin@empty-workspace.test", "Elif Demir"),
    # multi-tenant scenario: one user per role in each of two orgs, nobody shared
    *[SeedUser(f"{t}_{r}", f"{r.replace('_', '.')}@tenant-{t}.test", f"{r.replace('_', ' ').title()} {t.upper()}")
      for t in ("a", "b") for r in ("org_admin", "qa_lead", "qa_engineer", "developer", "viewer")],
]}

LUMEN = SeedOrg(
    "lumen", "lumen", "Lumen Freight",
    members=[("amara", "org_admin"), ("lukas", "qa_lead"), ("arjun", "qa_lead"), ("priya", "qa_engineer"),
             ("tomas", "qa_engineer"), ("diego", "developer"), ("mei", "developer"), ("kwame", "developer"),
             ("hana", "viewer"), ("sofia", "viewer")],
    invitations=[SeedInvite("nadia", "nadia.haddad@lumenfreight.test", "developer"),
                 SeedInvite("ingrid", "ingrid.berg@lumenfreight.test", "qa_engineer")],
)
HARBOR = SeedOrg(
    "harbor", "harbor", "Harbor Clinics",
    members=[("grace", "org_admin"), ("omar", "qa_lead"), ("lena", "qa_engineer"), ("kenji", "developer"),
             ("ruth", "viewer"), ("priya", "viewer")],  # Priya belongs to two orgs (REQ-005)
)
EMPTY = SeedOrg("empty", "empty", "Empty Workspace", members=[("empty_admin", "org_admin")])
TENANT_A = SeedOrg("tenant_a", "tenant-a", "Tenant A",
                   members=[(f"a_{r}", r) for r in ("org_admin", "qa_lead", "qa_engineer", "developer", "viewer")])
TENANT_B = SeedOrg("tenant_b", "tenant-b", "Tenant B",
                   members=[(f"b_{r}", r) for r in ("org_admin", "qa_lead", "qa_engineer", "developer", "viewer")])

SCENARIOS: dict[str, list[SeedOrg]] = {
    "baseline": [LUMEN, HARBOR],
    "empty": [EMPTY],
    "sla-breach": [LUMEN, HARBOR],  # plus bugs past SLA (D-019) from Stage 4
    "release-blocked": [LUMEN, HARBOR],  # plus a blocked release (D-014) from Stage 4
    "multi-tenant": [TENANT_A, TENANT_B],
}
SCENARIO_NOTES = {
    "baseline": ("Two organizations with every role; Priya Raman belongs to both. Lumen Freight has 3 projects, 60 bugs in every "
                 "status, 4 suites with 40 cases, 5 runs and 3 releases (Blocked, At risk, Ready); Harbor Clinics has a small set."),
    "empty": "One organization with only its Org Admin; every screen shows its empty state.",
    "sla-breach": "Baseline people. One project with 7 bugs, 4 of them past their SLA (D-019): Critical 24 h, High 72 h.",
    "release-blocked": ("Baseline people. Release WEB 2.4.0 is Blocked by two open Critical bugs and a 63% pass rate (D-014), "
                        "the two reasons the screens show."),
    "multi-tenant": "Two organizations with one user per role each and nobody shared; the same small project in each, for isolation tests.",
}
ALL_ORGS = [LUMEN, HARBOR, EMPTY, TENANT_A, TENANT_B]


def users_for(orgs: list[SeedOrg]) -> list[SeedUser]:
    keys = list(dict.fromkeys(k for o in orgs for k, _ in o.members))
    return [USERS[k] for k in keys]


def expected_counts(scenario: str) -> dict[str, int]:
    orgs = SCENARIOS[scenario]
    return {
        "organizations": len(orgs),
        "users": len(users_for(orgs)),
        "memberships": sum(len(o.members) for o in orgs),
        "invitations": sum(len(o.invitations) for o in orgs),
        **totals_for(scenario).as_dict(),  # projects, bugs, suites, cases, runs, releases (domain_data.py)
    }
