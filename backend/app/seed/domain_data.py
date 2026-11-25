"""Seed data for projects, bugs, tests and releases (I-12, REQ-060, D-066). Pure data; no database access.

Every age is a number of days (or hours) before the moment of seeding, so the results the screens show (past SLA, trend, pass rate in
the last 7 days, readiness) are the same on any day the seed runs. The rows are written through the services by `domain.py`, so the
timeline, the audit trail and the counters are the real ones.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class BugSpec:
    comp: str | None
    title: str
    severity: str
    status: str
    assignee: str | None  # a seed user key, or "dev" for the first Developer of the organization
    age_days: float
    done_hours: float | None = None  # hours from creation to the last move; default: part of the age, at most 4 days
    labels: tuple[str, ...] = ()


@dataclass(frozen=True)
class SuiteSpec:
    name: str
    component: str | None
    cases: tuple[str, ...]


@dataclass(frozen=True)
class RunSpec:
    name: str
    suites: tuple[str, ...]
    age_days: float
    results: tuple[tuple[str, int], ...]  # (result, how many cases), in case order; the rest stay untested
    completed: bool
    release: str | None = None


@dataclass(frozen=True)
class ReleaseSpec:
    name: str
    target_in_days: int
    status: str
    bug_rows: tuple[int, ...]  # indexes into the project's bugs
    description: str = ""


@dataclass(frozen=True)
class ProjectSpec:
    key: str
    name: str
    description: str
    components: tuple[str, ...]
    bugs: tuple[BugSpec, ...]
    suites: tuple[SuiteSpec, ...] = ()
    runs: tuple[RunSpec, ...] = ()
    releases: tuple[ReleaseSpec, ...] = ()


@dataclass(frozen=True)
class OrgData:
    projects: tuple[ProjectSpec, ...]
    labels: tuple[tuple[str, str], ...] = ()  # (name, color)


def b(comp: str | None, title: str, severity: str, status: str, assignee: str | None, age: float, *labels: str,
      done: float | None = None) -> BugSpec:
    return BugSpec(comp, title, severity, status, assignee, age, done, labels)


LABELS = (("Regression", "#c2410c"), ("Payments", "#0f766e"), ("Accessibility", "#1d4ed8"), ("Performance", "#7e22ce"))

# Lumen Freight: three projects, 60 bugs in every status and severity -------------------------------------------------------------

WEB_BUGS = (
    b("Checkout", "Checkout total ignores discount code after changing delivery address", "critical", "in_progress", "diego", 2, "Payments", "Regression"),  # 0
    b("Checkout", "Card payment fails with 3D Secure on the second attempt", "critical", "triaged", "mei", 3, "Payments"),  # 1
    b("Checkout", "Session expires during checkout without a warning", "high", "in_progress", "diego", 4),  # 2
    b("Checkout", "Promo banner overlaps the Pay button on small screens", "medium", "new", None, 1),  # 3
    b("Checkout", "Order confirmation email shows the wrong delivery date", "high", "ready_for_retest", "kwame", 9),  # 4
    b("Checkout", "Saved card is not offered after a failed payment", "medium", "fixed", "mei", 6, "Payments"),  # 5
    b("Checkout", "Shipping cost rounds down for parcels over 20 kg", "medium", "verified", "diego", 14),  # 6
    b("Checkout", "Address autocomplete suggests streets from another country", "low", "closed", "kwame", 25),  # 7
    b("Checkout", "Invoice PDF is missing the VAT number", "high", "verified", "mei", 12),  # 8
    b("Checkout", "Coupon field accepts spaces and then rejects the code", "low", "wont_fix", None, 18),  # 9
    b("Checkout", "Double click on Pay creates two orders", "critical", "reopened", "diego", 7, "Payments", "Regression"),  # 10
    b("Accounts", "Password reset link opens the login page instead of the form", "high", "triaged", "kwame", 5),  # 11
    b("Accounts", "Profile photo upload fails silently above 2 MB", "medium", "in_progress", "mei", 8),  # 12
    b("Accounts", "Two factor code field loses focus on mobile browsers", "medium", "new", None, 2),  # 13
    b("Accounts", "Account deletion keeps the saved addresses", "high", "fixed", "diego", 10),  # 14
    b("Accounts", "Email change does not ask for the password", "critical", "ready_for_retest", "kwame", 11),  # 15
    b("Accounts", "Display name with an accent is cut in the header", "low", "closed", "mei", 30),  # 16
    b("Accounts", "Language selector resets after login", "low", "verified", "diego", 16),  # 17
    b("Navigation", "Back button leaves the checkout flow", "medium", "triaged", None, 3),  # 18
    b("Navigation", "Menu does not close after choosing a page on tablets", "low", "new", None, 1),  # 19
    b("Navigation", "Breadcrumb shows the internal id instead of the name", "low", "closed", "kwame", 33),  # 20
    b("Navigation", "Footer links open in the same tab", "low", "wont_fix", None, 21),  # 21
    b("Search", "Search ignores accents in parcel names", "medium", "triaged", "mei", 6),  # 22
    b("Search", "Search results page is slow with more than 500 hits", "high", "in_progress", "diego", 5, "Performance"),  # 23
    b("Search", "Recent searches are shared between users on one device", "high", "reopened", "kwame", 13, "Regression"),  # 24
    b("Search", "Filter by date shows the previous day", "medium", "closed", "mei", 28),  # 25
    b("Search", "Empty search shows an error instead of all parcels", "low", "new", None, 2),  # 26
    b("Search", "Sorting by weight sorts as text", "medium", "verified", "kwame", 19),  # 27
)
API_BUGS = (
    b("Rates", "Quote endpoint returns 500 for zero weight", "high", "in_progress", "mei", 3),  # 0 (row 28)
    b("Rates", "Rates are cached across currencies", "critical", "fixed", "diego", 4, "Payments"),  # 1
    b("Rates", "Fuel surcharge is applied twice for express", "medium", "triaged", "kwame", 7),  # 2
    b("Rates", "Volume discount tier 3 is never reached", "medium", "new", None, 1),  # 3
    b("Rates", "Rate table export is missing the header row", "low", "closed", "mei", 27),  # 4
    b("Auth", "Token refresh returns 401 for a valid token after 24 hours", "high", "ready_for_retest", "diego", 8),  # 5
    b("Auth", "Rate limit header shows the wrong reset time", "low", "verified", "kwame", 15),  # 6
    b("Auth", "API key listing leaks the last used address of other users", "critical", "closed", "mei", 35),  # 7
    b("Auth", "Old API keys keep working after rotation", "high", "reopened", "diego", 9),  # 8
    b("Auth", "Error body differs between 401 and 403", "low", "new", None, 3),  # 9
    b("Tracking", "Tracking events arrive out of order", "medium", "in_progress", "kwame", 6),  # 10
    b("Tracking", "Webhook retries stop after the third attempt", "high", "triaged", "mei", 4),  # 11
    b("Tracking", "Delivered status is sent before the signature is stored", "medium", "verified", "diego", 17),  # 12
    b("Tracking", "Pagination skips one parcel at the page border", "medium", "closed", "kwame", 24),  # 13
    b("Tracking", "Bulk lookup times out above 200 numbers", "medium", "wont_fix", None, 20, "Performance"),  # 14
    b("Tracking", "Timezone of events is always UTC in the response", "low", "new", None, 2),  # 15
)
MOB_BUGS = (
    b("Navigation", "App crashes when rotating on the parcel list", "critical", "triaged", "diego", 2),  # 0 (row 44)
    b("Navigation", "Tab bar covers the last list item on small phones", "medium", "in_progress", "mei", 5),  # 1
    b("Navigation", "Deep link opens the home screen", "high", "new", None, 1),  # 2
    b("Navigation", "Swipe back closes the app on Android 12", "high", "ready_for_retest", "kwame", 7),  # 3
    b("Navigation", "Dark mode shows white flashes between screens", "low", "closed", "diego", 26),  # 4
    b("Navigation", "Settings icon has no accessible label", "low", "verified", "mei", 13, "Accessibility"),  # 5
    b("Navigation", "Landscape layout cuts the map controls", "medium", "closed", "kwame", 31),  # 6
    b("Notifications", "Push notification opens the wrong parcel", "high", "fixed", "mei", 9),  # 7
    b("Notifications", "Quiet hours are ignored on Sundays", "medium", "triaged", "diego", 8),  # 8
    b("Notifications", "Notification count badge does not clear", "low", "closed", "kwame", 22),  # 9
    b("Notifications", "Sound plays when the phone is on silent", "medium", "verified", "mei", 14),  # 10
    b("Notifications", "Notifications are duplicated after an app update", "high", "wont_fix", None, 19),  # 11
    b("Tracking", "Live map jumps to the wrong city on first load", "medium", "reopened", "diego", 10),  # 12
    b("Tracking", "Offline mode loses the last scan", "high", "in_progress", "kwame", 3),  # 13
    b("Tracking", "Barcode scanner needs two attempts in low light", "medium", "new", None, 2),  # 14
    b("Tracking", "Scan history is empty after logging out and in", "low", "closed", "mei", 29),  # 15
)

CHECKOUT_CASES = (
    "Pay with a saved card", "Pay with a new card", "Pay with 3D Secure", "Apply a discount code", "Remove a discount code",
    "Change the delivery address", "Choose express delivery", "Order a parcel over 20 kg", "See the order summary",
    "Receive the confirmation email", "Download the invoice", "Retry after a failed payment",
)
ACCOUNT_CASES = (
    "Register a new shipper", "Sign in with a valid password", "Sign in with a wrong password", "Reset a forgotten password",
    "Change the email address", "Change the display name", "Upload a profile photo", "Delete the account",
)
RATES_CASES = (
    "Quote a standard parcel", "Quote an express parcel", "Quote with zero weight", "Quote with a negative weight",
    "Quote in another currency", "Apply the fuel surcharge", "Apply a volume discount", "Export the rate table",
    "Refresh an access token", "Rotate an API key",
)
MOBILE_CASES = (
    "Open the parcel list", "Rotate the phone on the list", "Follow a deep link", "Swipe back on Android",
    "Switch to dark mode", "Open the settings", "Turn on quiet hours", "Open a push notification", "Scan a barcode",
    "Use the app offline",
)

LUMEN = OrgData(
    labels=LABELS,
    projects=(
        ProjectSpec(
            "WEB", "Web app", "The customer web app: checkout, accounts and parcel search.", ("Checkout", "Accounts", "Navigation", "Search"),
            WEB_BUGS,
            suites=(SuiteSpec("Checkout", "Checkout", CHECKOUT_CASES), SuiteSpec("Accounts", "Accounts", ACCOUNT_CASES)),
            runs=(
                RunSpec("WEB 2.4.0 regression", ("Checkout", "Accounts"), 1, (("pass", 10), ("fail", 4), ("blocked", 2)), False, "WEB 2.4.0"),
                RunSpec("WEB nightly", ("Checkout",), 8, (("pass", 11), ("fail", 1)), True),
            ),
            releases=(ReleaseSpec("WEB 2.4.0", 3, "in_progress", (0, 1, 2, 4, 6), "New checkout flow and saved payment methods."),),
        ),
        ProjectSpec(
            "API", "Public API", "The partner API for quotes, tracking and webhooks.", ("Rates", "Auth", "Tracking"), API_BUGS,
            suites=(SuiteSpec("Rates", "Rates", RATES_CASES),),
            runs=(
                RunSpec("API 1.9.0 smoke", ("Rates",), 2, (("pass", 9), ("fail", 1)), True, "API 1.9.0"),
                RunSpec("API nightly", ("Rates",), 3, (("pass", 10),), True),
            ),
            releases=(ReleaseSpec("API 1.9.0", 8, "in_progress", (0, 2, 5, 6, 7), "Quote changes and token fixes."),),
        ),
        ProjectSpec(
            "MOB", "Mobile app", "The driver and shipper apps for iOS and Android.", ("Navigation", "Notifications", "Tracking"), MOB_BUGS,
            suites=(SuiteSpec("Navigation", "Navigation", MOBILE_CASES),),
            runs=(RunSpec("MOB 3.1.0 full pass", ("Navigation",), 3, (("pass", 10),), True, "MOB 3.1.0"),),
            releases=(ReleaseSpec("MOB 3.1.0", 14, "planned", (4, 5, 6, 9, 10), "Dark mode and quiet hours."),),
        ),
    ),
)

# A small, complete dataset for the other organizations (every table has rows, every status appears once) -----------------------------

SMALL_STATUSES = ("new", "triaged", "in_progress", "fixed", "ready_for_retest", "verified", "closed", "wont_fix")
SMALL_SEVERITIES = ("high", "critical", "medium", "low", "high", "medium", "low", "low")


def small_org(key: str, name: str, description: str, components: tuple[str, str], release: str, subject: str) -> OrgData:
    """One project with eight bugs (one per status), one suite of four cases, one completed run at 75% and one release."""
    bugs = tuple(
        b(components[i % 2], f"{subject} problem number {i + 1}: {status.replace('_', ' ')}", SMALL_SEVERITIES[i], status,
          None if status in {"new", "wont_fix"} else "dev", 1 + i * 2.5)
        for i, status in enumerate(SMALL_STATUSES)
    )
    return OrgData(
        projects=(ProjectSpec(
            key, name, description, components, bugs,
            suites=(SuiteSpec(components[0], components[0], tuple(f"{subject} case {n}" for n in range(1, 5))),),
            runs=(RunSpec(f"{release} regression", (components[0],), 2, (("pass", 3), ("fail", 1)), True, release),),
            releases=(ReleaseSpec(release, 10, "in_progress", (3, 4, 5, 6), f"{subject} release."),),
        ),),
        labels=LABELS[:2],
    )


HARBOR = small_org("PTL", "Patient portal", "Appointments and records for patients.", ("Booking", "Records"), "PTL 1.2.0", "Portal")
TENANT = small_org("COR", "Core app", "The core product of this tenant.", ("Orders", "Billing"), "COR 1.0.0", "Core")

# sla-breach: bugs that are, and are not, past their SLA (D-019: Critical 24 h, High 72 h, Medium 14 days, Low 30 days) ---------------

SLA_BUGS = (
    b("Checkout", "Critical bug nobody has looked at for three days", "critical", "new", None, 3),  # past SLA
    b("Checkout", "High bug still waiting for triage after six days", "high", "triaged", "dev", 6),  # past SLA
    b("Checkout", "Medium bug in progress for twenty days", "medium", "in_progress", "dev", 20),  # past SLA
    b("Checkout", "Critical bug fixed within two hours", "critical", "fixed", "dev", 5, done=2),  # within SLA
    b("Checkout", "Low bug reported two days ago", "low", "new", None, 2),  # within SLA
    b("Checkout", "High bug fixed and verified inside two days", "high", "verified", "dev", 9, done=48),  # within SLA
    b("Checkout", "High bug closed, but fixed after four days", "high", "closed", "dev", 12, done=200),  # past SLA (fixed late)
)
SLA_PAST = (0, 1, 2, 6)
SLA = OrgData(
    labels=LABELS[:1],
    projects=(ProjectSpec("WEB", "Web app", "The customer web app.", ("Checkout",), SLA_BUGS),),
)

# release-blocked: WEB 2.4.0 is Blocked by two open Critical bugs and a 63% pass rate (D-014) ------------------------------------

BLOCKED_BUGS = (
    b("Checkout", "Checkout total ignores discount code after changing delivery address", "critical", "in_progress", "dev", 2),
    b("Checkout", "Card payment fails with 3D Secure on the second attempt", "critical", "triaged", "dev", 3),
    b("Checkout", "Session expires during checkout without a warning", "high", "triaged", None, 4),
    b("Checkout", "Notification preferences are not saved when toggled quickly", "medium", "new", None, 1),
    b("Checkout", "Shipping cost rounds down for parcels over 20 kg", "medium", "verified", "dev", 14),
)
BLOCKED = OrgData(
    labels=LABELS[:2],
    projects=(ProjectSpec(
        "WEB", "Web app", "The customer web app.", ("Checkout",), BLOCKED_BUGS,
        suites=(SuiteSpec("Checkout", "Checkout", CHECKOUT_CASES[:9]),),
        runs=(RunSpec("WEB 2.4.0 regression", ("Checkout",), 1, (("pass", 5), ("fail", 2), ("blocked", 1)), False, "WEB 2.4.0"),),
        releases=(ReleaseSpec("WEB 2.4.0", 3, "in_progress", (0, 1, 2, 3), "New checkout flow and saved payment methods."),),
    ),),
)

# scenario -> organization key -> data (an organization that is not listed gets no project data) ---------------------------------------

DATA: dict[str, dict[str, OrgData]] = {
    "baseline": {"lumen": LUMEN, "harbor": HARBOR},
    "empty": {},
    "sla-breach": {"lumen": SLA},
    "release-blocked": {"lumen": BLOCKED},
    "multi-tenant": {"tenant_a": TENANT, "tenant_b": TENANT},
}


@dataclass(frozen=True)
class Totals:
    projects: int = 0
    bugs: int = 0
    suites: int = 0
    cases: int = 0
    runs: int = 0
    releases: int = 0

    def __add__(self, other: "Totals") -> "Totals":
        return Totals(*(a + b_ for a, b_ in zip(self.as_tuple(), other.as_tuple(), strict=True)))

    def as_tuple(self) -> tuple[int, ...]:
        return (self.projects, self.bugs, self.suites, self.cases, self.runs, self.releases)

    def as_dict(self) -> dict[str, int]:
        return dict(zip(("projects", "bugs", "suites", "cases", "runs", "releases"), self.as_tuple(), strict=True))


def totals_of(project: ProjectSpec) -> Totals:
    return Totals(1, len(project.bugs), len(project.suites), sum(len(s.cases) for s in project.suites), len(project.runs),
                  len(project.releases))


def totals_for(scenario: str) -> Totals:
    total = Totals()
    for data in DATA[scenario].values():
        for project in data.projects:
            total = total + totals_of(project)
    return total

