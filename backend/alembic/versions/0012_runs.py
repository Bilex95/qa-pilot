"""test runs and results (I-07)

Revision ID: 0012
Revises: 0011
Create Date: 2026-11-22 12:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = '0012'
down_revision: str | None = '0011'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('test_run_counters',
    sa.Column('org_id', sa.Uuid(), nullable=False),
    sa.Column('last_number', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['org_id'], ['organizations.id'], name=op.f('fk_test_run_counters_org_id_organizations'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('org_id', name=op.f('pk_test_run_counters'))
    )
    op.create_table('test_runs',
    sa.Column('org_id', sa.Uuid(), nullable=False),
    sa.Column('project_id', sa.Uuid(), nullable=False),
    sa.Column('number', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=120), nullable=False),
    sa.Column('environment_id', sa.Uuid(), nullable=True),
    sa.Column('release_id', sa.Uuid(), nullable=True),
    sa.Column('status', sa.String(length=12), nullable=False),
    sa.Column('created_by_id', sa.Uuid(), nullable=False),
    sa.Column('started_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint("status IN ('in_progress', 'completed')", name=op.f('ck_test_runs_status')),
    sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], name=op.f('fk_test_runs_created_by_id_users')),
    sa.ForeignKeyConstraint(['environment_id'], ['environments.id'], name=op.f('fk_test_runs_environment_id_environments'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['org_id'], ['organizations.id'], name=op.f('fk_test_runs_org_id_organizations'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['project_id'], ['projects.id'], name=op.f('fk_test_runs_project_id_projects'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_test_runs')),
    sa.UniqueConstraint('org_id', 'number', name='uq_test_runs_org_number')
    )
    op.create_index('ix_test_runs_org_project_started', 'test_runs', ['org_id', 'project_id', sa.literal_column('started_at DESC')], unique=False)
    op.create_table('test_run_results',
    sa.Column('org_id', sa.Uuid(), nullable=False),
    sa.Column('run_id', sa.Uuid(), nullable=False),
    sa.Column('case_id', sa.Uuid(), nullable=False),
    sa.Column('suite_id', sa.Uuid(), nullable=False),
    sa.Column('position', sa.Integer(), nullable=False),
    sa.Column('case_key', sa.String(length=16), nullable=False),
    sa.Column('case_title', sa.String(length=200), nullable=False),
    sa.Column('preconditions', sa.Text(), nullable=False),
    sa.Column('steps', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('result', sa.String(length=10), nullable=False),
    sa.Column('failed_step_index', sa.Integer(), nullable=True),
    sa.Column('actual_result', sa.Text(), nullable=False),
    sa.Column('note', sa.Text(), nullable=False),
    sa.Column('executed_by_id', sa.Uuid(), nullable=True),
    sa.Column('executed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.CheckConstraint("result IN ('untested', 'pass', 'fail', 'blocked', 'skipped')", name=op.f('ck_test_run_results_result')),
    sa.ForeignKeyConstraint(['case_id'], ['test_cases.id'], name=op.f('fk_test_run_results_case_id_test_cases')),
    sa.ForeignKeyConstraint(['executed_by_id'], ['users.id'], name=op.f('fk_test_run_results_executed_by_id_users')),
    sa.ForeignKeyConstraint(['org_id'], ['organizations.id'], name=op.f('fk_test_run_results_org_id_organizations'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['run_id'], ['test_runs.id'], name=op.f('fk_test_run_results_run_id_test_runs'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_test_run_results'))
    )
    op.create_index('ix_test_run_results_run_position', 'test_run_results', ['run_id', 'position'], unique=False)
    op.create_index('ix_test_run_results_suite', 'test_run_results', ['suite_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_test_run_results_suite', table_name='test_run_results')
    op.drop_index('ix_test_run_results_run_position', table_name='test_run_results')
    op.drop_table('test_run_results')
    op.drop_index('ix_test_runs_org_project_started', table_name='test_runs')
    op.drop_table('test_runs')
    op.drop_table('test_run_counters')
