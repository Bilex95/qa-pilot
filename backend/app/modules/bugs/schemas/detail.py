"""Comments, attachments and activity of a bug (I-05, API-069 to API-077)."""

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import StringConstraints

from app.core.schemas import ApiModel

# Plain text with line breaks, 1 to 5,000 characters after trimming (REQ-023)
CommentBody = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5000)]

ActivityKind = Literal["created", "field_changed", "status_changed", "assigned", "commented", "attachment_added",
                       "attachment_removed", "linked_release"]


class CommentIn(ApiModel):
    body: CommentBody


class CommentOut(ApiModel):
    id: uuid.UUID
    bug_id: uuid.UUID
    author_id: uuid.UUID
    author_name: str
    body: str
    created_at: datetime
    edited_at: datetime | None


class AttachmentOut(ApiModel):
    id: uuid.UUID
    bug_id: uuid.UUID
    filename: str
    content_type: str
    size_bytes: int
    uploaded_by_id: uuid.UUID
    uploaded_by_name: str
    created_at: datetime


class ActivityOut(ApiModel):
    id: uuid.UUID
    kind: ActivityKind
    actor_id: uuid.UUID
    actor_name: str
    field: str | None
    old_value: str | None
    new_value: str | None
    created_at: datetime
