"""Fail fast, with a clear message, when the database host does not resolve (I-24).

Run before migrations in the backend container command. A container started without its network cannot resolve `db`;
without this check it dies in a loop with a driver error that does not say why. The check retries for about 30 seconds
(a restart after a Docker restart can beat the network by a moment) and only then exits, so `restart: unless-stopped`
does not turn into a crash loop.

    python -m app.core.db_preflight
"""

import os
import socket
import sys
import time
from collections.abc import Callable

from sqlalchemy.engine import make_url

WAIT_SECONDS = 30.0
INTERVAL_SECONDS = 1.0

FIX = (
    "The container is probably running without its network, or the db service is not running. "
    "Fix: docker compose up -d --force-recreate db backend (data stays in the named volumes)."
)


def wait_for_host(
    host: str,
    port: int,
    *,
    wait: float = WAIT_SECONDS,
    interval: float = INTERVAL_SECONDS,
    resolve: Callable[..., object] = socket.getaddrinfo,
    sleep: Callable[[float], None] = time.sleep,
    clock: Callable[[], float] = time.monotonic,
) -> tuple[bool, int]:
    """Try to resolve `host` until it works or `wait` seconds have passed. Returns (resolved, attempts)."""
    deadline = clock() + wait
    attempts = 0
    while True:
        attempts += 1
        try:
            resolve(host, port)
            return True, attempts
        except OSError:
            if clock() >= deadline:
                return False, attempts
            sleep(interval)


def main() -> int:
    url = os.environ.get("DATABASE_URL", "")
    try:
        parsed = make_url(url)
    except Exception:  # an unusable URL is its own clear failure
        print("db_preflight: DATABASE_URL is missing or not a valid database URL.", file=sys.stderr)
        return 1
    host, port = parsed.host, parsed.port or 5432
    if not host:
        print("db_preflight: DATABASE_URL has no host.", file=sys.stderr)
        return 1
    resolved, attempts = wait_for_host(host, port)
    if not resolved:
        print(f"db_preflight: host '{host}' does not resolve after {WAIT_SECONDS:.0f} s ({attempts} tries). {FIX}", file=sys.stderr)
        return 1
    if attempts > 1:
        print(f"db_preflight: host '{host}' resolved after {attempts} tries.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
