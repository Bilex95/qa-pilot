"""Per request context shared with logging."""

from contextvars import ContextVar

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")
user_id_var: ContextVar[str] = ContextVar("user_id", default="-")
org_id_var: ContextVar[str] = ContextVar("org_id", default="-")
client_ip_var: ContextVar[str] = ContextVar("client_ip", default="-")
