"""testing

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-20 10:55:52.926659
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = '0005'
down_revision: str | None = '0004'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('test_case_counters',
    sa.Column('org_id', sa.Uuid(), nullable=False),
    sa.Column('last_number', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['org_id'], ['organizations.id'], name=op.f('fk_test_case_counters_org_id_organizations'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('org_id', name=op.f('pk_test_case_counters'))
    )
    op.create_table('test_suites',
    sa.Column('org_id', sa.Uuid(), nullable=False),
    sa.Column('project_id', sa.Uuid(), nullable=False),
    sa.Column('name', sa.String(length=80), nullable=False),
    sa.Column('description', sa.String(length=1000), nullable=False),
    sa.Column('component_id', sa.Uuid(), nullable=True),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['component_id'], ['components.id'], name=op.f('fk_test_suites_component_id_components'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['org_id'], ['organizations.id'], name=op.f('fk_test_suites_org_id_organizations'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['project_id'], ['projects.id'], name=op.f('fk_test_suites_project_id_projects'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_test_suites'))
    )
    op.create_index('ix_test_suites_org_project', 'test_suites', ['org_id', 'project_id'], unique=False)
    op.create_index('uq_test_suites_project_name_ci', 'test_suites', ['project_id', sa.literal_column('lower(name)')], unique=True, postgresql_where=sa.text('deleted_at IS NULL'))
    op.create_table('test_cases',
    sa.Column('org_id', sa.Uuid(), nullable=False),
    sa.Column('suite_id', sa.Uuid(), nullable=False),
    sa.Column('number', sa.Integer(), nullable=False),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('preconditions', sa.Text(), nullable=False),
    sa.Column('steps', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('tags', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('priority', sa.String(length=2), nullable=False),
    sa.Column('case_type', sa.String(length=10), nullable=False),
    sa.Column('ai_generated', sa.Boolean(), nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint("case_type IN ('positive', 'negative', 'edge', 'other')", name=op.f('ck_test_cases_case_type')),
    sa.CheckConstraint("priority IN ('p1', 'p2', 'p3', 'p4')", name=op.f('ck_test_cases_priority')),
    sa.ForeignKeyConstraint(['org_id'], ['organizations.id'], name=op.f('fk_test_cases_org_id_organizations'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['suite_id'], ['test_suites.id'], name=op.f('fk_test_cases_suite_id_test_suites'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_test_cases')),
    sa.UniqueConstraint('org_id', 'number', name='uq_test_cases_org_number')
    )
    op.create_index('ix_test_cases_org_suite', 'test_cases', ['org_id', 'suite_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_test_cases_org_suite', table_name='test_cases')
    op.drop_table('test_cases')
    op.drop_index('uq_test_suites_project_name_ci', table_name='test_suites', postgresql_where=sa.text('deleted_at IS NULL'))
    op.drop_index('ix_test_suites_org_project', table_name='test_suites')
    op.drop_table('test_suites')
    op.drop_table('test_case_counters')
