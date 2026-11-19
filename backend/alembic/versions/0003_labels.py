"""labels

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-19 12:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = '0003'
down_revision: str | None = '0002'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('labels',
    sa.Column('org_id', sa.Uuid(), nullable=False),
    sa.Column('name', sa.String(length=40), nullable=False),
    sa.Column('color', sa.String(length=20), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['org_id'], ['organizations.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_labels_org_id'), 'labels', ['org_id'], unique=False)
    op.create_index('uq_labels_org_name_ci', 'labels', ['org_id', sa.literal_column('lower(name)')], unique=True)


def downgrade() -> None:
    op.drop_index('uq_labels_org_name_ci', table_name='labels')
    op.drop_index(op.f('ix_labels_org_id'), table_name='labels')
    op.drop_table('labels')
