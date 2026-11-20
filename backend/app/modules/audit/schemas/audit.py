import uuid
from datetime import datetime
from typing import Any

from app.core.schemas import ApiModel


class AuditEventOut(ApiModel):
    id: uuid.UUID
    created_at: datetime
    actor_id: uuid.UUID | None
    actor_name: str | None = None  # the person's name, also after they were removed from the workspace (the user record stays)
    action: str
    entity_type: str | None
    entity_id: str | None
    data: dict[str, Any]
    request_id: str | None
