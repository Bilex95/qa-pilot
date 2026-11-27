"""ai usage: attempts and fallback reason (D-085)

Revision ID: 0015
Revises: 0014
Create Date: 2026-11-27 12:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '0015'
down_revision: str | None = '0014'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('ai_usage', sa.Column('attempts', sa.Integer(), server_default='1', nullable=True))
    op.add_column('ai_usage', sa.Column('fallback_reason', sa.String(length=24), nullable=True))


def downgrade() -> None:
    op.drop_column('ai_usage', 'fallback_reason')
    op.drop_column('ai_usage', 'attempts')
