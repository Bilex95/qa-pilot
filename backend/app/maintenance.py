"""Local and test maintenance commands. Refuses to run when APP_ENV=production, like the seed CLI.

  python -m app.maintenance orphan-uploads [--dry-run]

Removes files on the upload volume that no attachment row points to (left behind by a test run that was killed, or by a bug
that was soft deleted with its files in place before the scripts learned to delete them first).
"""

import argparse
import sys

from sqlalchemy import select

from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.modules.bugs.infrastructure.models import Attachment
from app.modules.bugs.infrastructure.storage import upload_root


def orphan_uploads(*, dry_run: bool = False) -> list[str]:
    """Paths (relative to the upload folder) of files without a row. They are deleted unless `dry_run`."""
    root = upload_root()
    if not root.is_dir():
        return []
    with get_sessionmaker()() as db:
        known = set(db.scalars(select(Attachment.storage_key)))
    found: list[str] = []
    for path in sorted(p for p in root.rglob("*") if p.is_file()):
        if path.name in known:
            continue
        found.append(str(path.relative_to(root)))
        if not dry_run:
            path.unlink()
    return found


def main(argv: list[str] | None = None) -> int:
    if get_settings().is_production:
        print("Refusing to run: APP_ENV=production", file=sys.stderr)
        return 2
    parser = argparse.ArgumentParser(prog="app.maintenance")
    sub = parser.add_subparsers(dest="command", required=True)
    orphans = sub.add_parser("orphan-uploads")
    orphans.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    if args.command == "orphan-uploads":
        removed = orphan_uploads(dry_run=args.dry_run)
        print(f"{'would remove' if args.dry_run else 'removed'} {len(removed)} orphaned upload(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
