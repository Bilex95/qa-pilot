"""Page based pagination (D-004): ?page=1&page_size=25, response {items, page, page_size, total}."""

from dataclasses import dataclass
from typing import Any

from fastapi import Query
from pydantic import BaseModel
from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session


@dataclass(frozen=True)
class PageParams:
    page: int
    page_size: int

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


def page_params(
    page: int = Query(1, ge=1, description="Page number, starting at 1"),
    page_size: int = Query(25, ge=1, le=100, description="Items per page, at most 100"),
) -> PageParams:
    return PageParams(page=page, page_size=page_size)


class Page[T](BaseModel):
    items: list[T]
    page: int
    page_size: int
    total: int


def paginate(db: Session, stmt: Select[Any], params: PageParams) -> tuple[list[Any], int]:
    """Run a select with offset and limit. Returns (rows, total)."""
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = list(db.scalars(stmt.offset(params.offset).limit(params.page_size)).unique())
    return rows, int(total)


def paginate_rows(db: Session, stmt: Select[Any], params: PageParams) -> tuple[list[Any], int]:
    """Like paginate, but returns full result rows (for selects of several entities or columns)."""
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = list(db.execute(stmt.offset(params.offset).limit(params.page_size)).all())
    return rows, int(total)
