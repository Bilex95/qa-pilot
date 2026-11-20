"""Extension points other modules register with. Test runs (I-07, in this module) register the last run pass rate; the AI
usage log (I-14) registers the check for `ai_usage_id`. Until a check is registered, `ai_usage_id` is refused with a 422."""

import uuid
from collections.abc import Callable

from sqlalchemy.orm import Session

# (db, org_id, suite_ids) -> {suite_id: pass rate 0 to 100 of the last completed run that touched the suite}
PassRates = Callable[[Session, uuid.UUID, list[uuid.UUID]], dict[uuid.UUID, float]]
# (db, org_id, ai_usage_id) -> True when the AI usage row exists in the org
AiUsageExists = Callable[[Session, uuid.UUID, uuid.UUID], bool]

last_run_pass_rates: list[PassRates] = []
ai_usage_exists: list[AiUsageExists] = []


def pass_rates(db: Session, org_id: uuid.UUID, suite_ids: list[uuid.UUID]) -> dict[uuid.UUID, float]:
    rates: dict[uuid.UUID, float] = {}
    for hook in last_run_pass_rates:
        rates.update(hook(db, org_id, suite_ids))
    return rates


def ai_usage_accepted(db: Session, org_id: uuid.UUID, ai_usage_id: uuid.UUID) -> bool:
    return any(check(db, org_id, ai_usage_id) for check in ai_usage_exists)
