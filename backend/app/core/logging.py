"""Structured JSON logs with request context. Never log secrets or bug content."""

import json
import logging
import sys
from datetime import UTC, datetime

from app.core.request_context import current as request_info


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        info = request_info()
        data = {
            "ts": datetime.now(UTC).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "request_id": info.request_id,
            "user_id": info.user_id,
            "org_id": info.org_id,
        }
        for key in ("method", "path", "status", "latency_ms"):
            if hasattr(record, key):
                data[key] = getattr(record, key)
        if record.exc_info:
            data["exc"] = self.formatException(record.exc_info)
        return json.dumps(data)


def configure_logging(level: str) -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level.upper())
    for noisy in ("uvicorn.access",):
        logging.getLogger(noisy).handlers = []
        logging.getLogger(noisy).propagate = False
