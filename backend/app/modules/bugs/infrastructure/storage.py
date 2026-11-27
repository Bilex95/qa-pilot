"""Attachment files on the local upload volume (D-009). Files have a random name, sit in a folder per organization and are
never served from a public path: the only way out is the authenticated download endpoint."""

import contextlib
import os
import uuid
from pathlib import Path

from app.core.config import get_settings


def _root() -> Path:
    return Path(get_settings().upload_dir)


def upload_root() -> Path:
    return _root()


def path_for(org_id: uuid.UUID, storage_key: str) -> Path:
    return _root() / str(org_id) / storage_key


def save(org_id: uuid.UUID, data: bytes) -> str:
    """Write the file under a new random key and return the key. The file appears whole or not at all."""
    key = uuid.uuid4().hex
    target = path_for(org_id, key)
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_name(key + ".part")
    partial.write_bytes(data)
    os.replace(partial, target)
    return key


def remove(org_id: uuid.UUID, storage_key: str) -> None:
    with contextlib.suppress(FileNotFoundError):
        path_for(org_id, storage_key).unlink()
