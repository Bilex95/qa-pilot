"""Extension points other modules register with. The AI usage log (I-14, I-18) registers the check for `ai_usage_id`: an accepted release
summary must point at a real `release_summary` AI call of this workspace. Until a check is registered, `ai_usage_id` is refused (422)."""

import uuid
from collections.abc import Callable

from sqlalchemy.orm import Session

# (db, org_id, ai_usage_id) -> True when the usage row exists in the org, is a release summary call and was not refused
AiSummaryUsageExists = Callable[[Session, uuid.UUID, uuid.UUID], bool]

ai_summary_usage_exists: list[AiSummaryUsageExists] = []


def ai_summary_usage_accepted(db: Session, org_id: uuid.UUID, ai_usage_id: uuid.UUID) -> bool:
    return any(check(db, org_id, ai_usage_id) for check in ai_summary_usage_exists)
