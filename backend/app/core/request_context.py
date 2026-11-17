"""Per request context shared with logging and audit.

Sync dependencies run in a worker thread with a copy of the context, so values they set on a ContextVar never
reach the middleware's access log. Instead the middleware puts one mutable RequestInfo per request into the
ContextVar; the copy shares the same object, so writes from any thread are visible to the log line.
"""

from contextvars import ContextVar
from dataclasses import dataclass


@dataclass
class RequestInfo:
    request_id: str = "-"
    user_id: str = "-"
    org_id: str = "-"
    client_ip: str = "-"


_info: ContextVar[RequestInfo | None] = ContextVar("request_info", default=None)


def start_request(info: RequestInfo) -> None:
    _info.set(info)


def current() -> RequestInfo:
    info = _info.get()
    if info is None:  # outside a request (CLI, tests calling services directly)
        info = RequestInfo()
        _info.set(info)
    return info
