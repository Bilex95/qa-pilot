"""What may be attached to a bug (D-009): the allowed types, the check of the first bytes, and the file name clean up.
Pure functions, no database and no disk."""

import codecs
import re
from dataclasses import dataclass

MAX_FILES_PER_BUG = 10
SNIFF_BYTES = 8192

# extension -> content type served on download. The type always comes from here, never from what the browser sent.
TYPES: dict[str, str] = {
    "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "gif": "image/gif", "webp": "image/webp",
    "pdf": "application/pdf", "txt": "text/plain", "log": "text/plain", "json": "application/json", "csv": "text/csv",
    "zip": "application/zip", "mp4": "video/mp4", "webm": "video/webm",
}
TEXT_EXTENSIONS = frozenset({"txt", "log", "json", "csv"})


@dataclass(frozen=True)
class Checked:
    filename: str
    extension: str
    content_type: str


def clean_filename(raw: str) -> str:
    """The label shown to people: no folders, no control characters, at most 255 characters, the extension kept."""
    name = re.split(r"[\\/]", raw or "")[-1]
    name = "".join(ch for ch in name if ch.isprintable()).strip().strip(".")
    if len(name) > 255:
        stem, dot, ext = name.rpartition(".")
        name = (stem[: 255 - len(ext) - 1] + "." + ext) if dot else name[:255]
    return name


def extension_of(filename: str) -> str:
    stem, dot, ext = filename.rpartition(".")
    return ext.lower() if dot and stem else ""


def _is_text(head: bytes) -> bool:
    """UTF-8 text with no NUL byte. A multi byte character cut at the end of the sample is not an error."""
    if b"\x00" in head:
        return False
    try:
        codecs.getincrementaldecoder("utf-8")().decode(head, final=False)
    except UnicodeDecodeError:
        return False
    return True


def looks_like(extension: str, head: bytes) -> bool:
    """Do the first bytes agree with the extension?"""
    if extension == "png":
        return head.startswith(b"\x89PNG\r\n\x1a\n")
    if extension in ("jpg", "jpeg"):
        return head.startswith(b"\xff\xd8\xff")
    if extension == "gif":
        return head.startswith((b"GIF87a", b"GIF89a"))
    if extension == "webp":
        return head[:4] == b"RIFF" and head[8:12] == b"WEBP"
    if extension == "pdf":
        return head.startswith(b"%PDF-")
    if extension == "zip":
        return head.startswith((b"PK\x03\x04", b"PK\x05\x06"))
    if extension == "mp4":
        return head[4:8] == b"ftyp"
    if extension == "webm":
        return head.startswith(b"\x1a\x45\xdf\xa3")
    if extension in TEXT_EXTENSIONS:
        return _is_text(head)
    return False


def check(raw_filename: str, head: bytes) -> Checked | None:
    """None when the file is not allowed: unknown extension, or first bytes that do not match the extension."""
    filename = clean_filename(raw_filename)
    extension = extension_of(filename)
    if extension not in TYPES or not looks_like(extension, head[:SNIFF_BYTES]):
        return None
    return Checked(filename=filename, extension=extension, content_type=TYPES[extension])
