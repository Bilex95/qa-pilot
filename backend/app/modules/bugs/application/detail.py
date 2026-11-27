"""Comments, attachments and the timeline of a bug (I-05; REQ-023, REQ-024, REQ-025; D-007, D-009, D-059).

Every function takes the org id from the path and finds the bug (or the comment or attachment through its bug) inside that
org, so an id from another org is a 404. Writes commit once, at the end, with their activity entry and audit event."""

import uuid
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import utcnow
from app.core.errors import AppError, Conflict, Forbidden, NotFound, Unprocessable
from app.core.pagination import PageParams, paginate
from app.core.permissions import Role
from app.modules.audit.application import service as audit
from app.modules.auth.application import service as auth
from app.modules.bugs.application.service import Actor
from app.modules.bugs.domain import attachments as rules
from app.modules.bugs.infrastructure import repository as repo
from app.modules.bugs.infrastructure import storage
from app.modules.bugs.infrastructure.models import Attachment, Bug, BugActivity, Comment


def names_of(db: Session, ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
    """A person's name, also for someone who has left the workspace: their words and files stay named."""
    return {uid: user.full_name for uid, user in auth.get_users_by_ids(db, list(ids)).items()}


def _bug(db: Session, org_id: uuid.UUID, bug_id: uuid.UUID, *, lock: bool = False) -> Bug:
    bug = repo.get_bug(db, org_id, bug_id, lock=lock)
    if bug is None:
        raise NotFound("Bug not found.")
    return bug


# Timeline -----------------------------------------------------------------

def list_activity(db: Session, org_id: uuid.UUID, bug_id: uuid.UUID, params: PageParams) -> tuple[list[BugActivity], int]:
    _bug(db, org_id, bug_id)
    return paginate(db, repo.activity_query(org_id, bug_id), params)


# Comments -----------------------------------------------------------------

def list_comments(db: Session, org_id: uuid.UUID, bug_id: uuid.UUID, params: PageParams) -> tuple[list[Comment], int]:
    _bug(db, org_id, bug_id)
    return paginate(db, repo.comments_query(org_id, bug_id), params)


def add_comment(db: Session, org_id: uuid.UUID, actor: Actor, bug_id: uuid.UUID, body: str) -> Comment:
    bug = _bug(db, org_id, bug_id)
    now = utcnow()
    comment = Comment(org_id=org_id, bug_id=bug.id, author_id=actor.user_id, body=body)
    db.add(comment)
    repo.add_activity(db, org_id, bug.id, actor.user_id, "commented", at=now)
    bug.updated_at = now
    db.commit()
    return comment


def _comment(db: Session, org_id: uuid.UUID, comment_id: uuid.UUID) -> Comment:
    comment = repo.get_comment(db, org_id, comment_id, lock=True)
    if comment is None:
        raise NotFound("Comment not found.")
    return comment


def edit_comment(db: Session, org_id: uuid.UUID, actor: Actor, comment_id: uuid.UUID, body: str) -> Comment:
    comment = _comment(db, org_id, comment_id)
    if comment.author_id != actor.user_id:  # nobody edits another person's words, an Org Admin included (PERSONAS 3.3)
        raise Forbidden("You can only edit your own comments.", details={"action": "comment.update", "role": actor.role.value})
    if comment.body != body:
        comment.body = body
        comment.edited_at = utcnow()
        db.commit()
    return comment


def delete_comment(db: Session, org_id: uuid.UUID, actor: Actor, comment_id: uuid.UUID) -> None:
    comment = _comment(db, org_id, comment_id)
    if comment.author_id != actor.user_id and actor.role is not Role.ORG_ADMIN:
        raise Forbidden("You can only delete your own comments.",
                        details={"action": "comment.delete", "role": actor.role.value})
    bug = _bug(db, org_id, comment.bug_id)
    comment.deleted_at = utcnow()
    audit.record(db, "comment.deleted", actor_id=actor.user_id, org_id=org_id, entity_type="comment", entity_id=comment.id,
                 data={"key": bug.key, "bug_id": str(bug.id), "author_id": str(comment.author_id)})
    db.commit()


# Attachments --------------------------------------------------------------

def list_attachments(db: Session, org_id: uuid.UUID, bug_id: uuid.UUID) -> list[Attachment]:
    _bug(db, org_id, bug_id)
    return repo.attachments_of(db, org_id, bug_id)


def max_upload_bytes() -> int:
    return get_settings().max_upload_mb * 1024 * 1024


def add_attachment(db: Session, org_id: uuid.UUID, actor: Actor, bug_id: uuid.UUID, raw_filename: str,
                   data: bytes) -> Attachment:
    bug = _bug(db, org_id, bug_id, lock=True)  # the bug row lock keeps two uploads from both passing the count of 10
    if len(repo.attachments_of(db, org_id, bug.id)) >= rules.MAX_FILES_PER_BUG:
        raise Conflict(f"A bug holds at most {rules.MAX_FILES_PER_BUG} files.", code="too_many_files",
                       details={"max_files": rules.MAX_FILES_PER_BUG})
    if len(data) > max_upload_bytes():
        raise AppError(f"A file can be at most {get_settings().max_upload_mb} MB.", code="file_too_large", status_code=413,
                       details={"max_bytes": max_upload_bytes()})
    if not data:
        raise Unprocessable("Some fields are not valid.", details=[{"loc": ["body", "file"], "msg": "The file is empty."}])
    checked = rules.check(raw_filename, data[: rules.SNIFF_BYTES])
    if checked is None:
        raise AppError("This file type is not allowed, or the file is not what its name says.", code="unsupported_type",
                       status_code=415, details={"allowed": sorted(rules.TYPES)})
    key = storage.save(org_id, data)
    try:
        attachment = Attachment(org_id=org_id, bug_id=bug.id, uploaded_by_id=actor.user_id, filename=checked.filename,
                                content_type=checked.content_type, size_bytes=len(data), storage_key=key)
        db.add(attachment)
        now = utcnow()
        bug.updated_at = now
        repo.add_activity(db, org_id, bug.id, actor.user_id, "attachment_added", field="attachment",
                          new=checked.filename, at=now)
        db.flush()
        audit.record(db, "attachment.uploaded", actor_id=actor.user_id, org_id=org_id, entity_type="attachment",
                     entity_id=attachment.id,
                     data={"key": bug.key, "bug_id": str(bug.id), "filename": checked.filename, "size_bytes": len(data)})
        db.commit()
    except Exception:
        db.rollback()
        storage.remove(org_id, key)  # no row, so no file left behind
        raise
    return attachment


def _attachment(db: Session, org_id: uuid.UUID, attachment_id: uuid.UUID) -> Attachment:
    attachment = repo.get_attachment(db, org_id, attachment_id)
    if attachment is None:
        raise NotFound("Attachment not found.")
    return attachment


def delete_attachment(db: Session, org_id: uuid.UUID, actor: Actor, attachment_id: uuid.UUID) -> None:
    attachment = _attachment(db, org_id, attachment_id)
    if actor.role not in (Role.ORG_ADMIN, Role.QA_LEAD) and attachment.uploaded_by_id != actor.user_id:
        raise Forbidden("You can only delete files you uploaded.",
                        details={"action": "attachment.delete", "role": actor.role.value})
    bug = _bug(db, org_id, attachment.bug_id, lock=True)
    now = utcnow()
    bug.updated_at = now
    repo.add_activity(db, org_id, bug.id, actor.user_id, "attachment_removed", field="attachment",
                      old=attachment.filename, at=now)
    audit.record(db, "attachment.deleted", actor_id=actor.user_id, org_id=org_id, entity_type="attachment",
                 entity_id=attachment.id, data={"key": bug.key, "bug_id": str(bug.id), "filename": attachment.filename})
    key = attachment.storage_key
    db.delete(attachment)
    db.commit()
    storage.remove(org_id, key)  # after the commit: a failed commit must not cost the file


def open_attachment(db: Session, org_id: uuid.UUID, attachment_id: uuid.UUID) -> tuple[Attachment, Path]:
    attachment = _attachment(db, org_id, attachment_id)
    path = storage.path_for(org_id, attachment.storage_key)
    if not path.is_file():
        raise NotFound("The file is no longer available.")
    return attachment, path
