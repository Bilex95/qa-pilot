"""ai usage log (I-14)

Revision ID: 0014
Revises: 0013
Create Date: 2026-11-25 12:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '0014'
down_revision: str | None = '0013'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('ai_usage',
    sa.Column('org_id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=True),
    sa.Column('feature', sa.String(length=20), nullable=False),
    sa.Column('provider', sa.String(length=20), nullable=False),
    sa.Column('model', sa.String(length=80), nullable=False),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('input_tokens', sa.Integer(), nullable=False),
    sa.Column('output_tokens', sa.Integer(), nullable=False),
    sa.Column('latency_ms', sa.Integer(), nullable=False),
    sa.Column('outcome', sa.String(length=10), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint("feature IN ('bug_writer', 'explain_log', 'triage', 'duplicates', 'test_cases', 'release_summary')", name=op.f('ck_ai_usage_feature')),
    sa.CheckConstraint("status IN ('ok', 'invalid_output', 'error', 'rate_limited', 'fallback')", name=op.f('ck_ai_usage_status')),
    sa.CheckConstraint("outcome IS NULL OR outcome IN ('accepted', 'edited', 'discarded')", name=op.f('ck_ai_usage_outcome')),
    sa.ForeignKeyConstraint(['org_id'], ['organizations.id'], name=op.f('fk_ai_usage_org_id_organizations'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_ai_usage_user_id_users'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_ai_usage'))
    )
    op.create_index('ix_ai_usage_org_created', 'ai_usage', ['org_id', 'created_at'], unique=False)
    op.create_index('ix_ai_usage_org_feature', 'ai_usage', ['org_id', 'feature'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_ai_usage_org_feature', table_name='ai_usage')
    op.drop_index('ix_ai_usage_org_created', table_name='ai_usage')
    op.drop_table('ai_usage')
