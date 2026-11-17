"""Read only projections shared across modules (docs/API_BOUNDARY.md).

Some queries must join another module's table for sorting and search (for example
member lists sorted by user name). Instead of importing another module's models,
modules use these minimal, read only table projections. Writes always go through
the owning module's application service.
"""

from sqlalchemy import Boolean, Column, String, Uuid, table

users_view = table(
    "users",
    Column("id", Uuid),
    Column("email", String),
    Column("full_name", String),
    Column("is_active", Boolean),
)
