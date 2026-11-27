"""bugs

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-19 22:19:27.797260
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = '0004'
down_revision: str | None = '0003'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('saved_views',
    sa.Column('org_id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('name', sa.String(length=60), nullable=False),
    sa.Column('filters', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['org_id'], ['organizations.id'], name=op.f('fk_saved_views_org_id_organizations'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_saved_views_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_saved_views'))
    )
    op.create_index('ix_saved_views_org_user', 'saved_views', ['org_id', 'user_id'], unique=False)
    op.create_index('uq_saved_views_org_user_name_ci', 'saved_views', ['org_id', 'user_id', sa.literal_column('lower(name)')], unique=True)
    op.create_table('bugs',
    sa.Column('org_id', sa.Uuid(), nullable=False),
    sa.Column('project_id', sa.Uuid(), nullable=False),
    sa.Column('number', sa.Integer(), nullable=False),
    sa.Column('key', sa.String(length=12), nullable=False),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('description', sa.Text(), nullable=False),
    sa.Column('steps_to_reproduce', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('expected_result', sa.Text(), nullable=False),
    sa.Column('actual_result', sa.Text(), nullable=False),
    sa.Column('severity', sa.String(length=10), nullable=False),
    sa.Column('priority', sa.String(length=2), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('component_id', sa.Uuid(), nullable=True),
    sa.Column('environment_id', sa.Uuid(), nullable=True),
    sa.Column('reporter_id', sa.Uuid(), nullable=False),
    sa.Column('assignee_id', sa.Uuid(), nullable=True),
    sa.Column('release_id', sa.Uuid(), nullable=True),
    sa.Column('source_run_result_id', sa.Uuid(), nullable=True),
    sa.Column('ai_assisted', sa.Boolean(), nullable=False),
    sa.Column('status_changed_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('closed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint("priority IN ('p1', 'p2', 'p3', 'p4')", name=op.f('ck_bugs_priority')),
    sa.CheckConstraint("severity IN ('critical', 'high', 'medium', 'low')", name=op.f('ck_bugs_severity')),
    sa.CheckConstraint("status IN ('new', 'triaged', 'in_progress', 'fixed', 'ready_for_retest', 'verified', 'closed', 'reopened', 'wont_fix')", name=op.f('ck_bugs_status')),
    sa.ForeignKeyConstraint(['assignee_id'], ['users.id'], name=op.f('fk_bugs_assignee_id_users'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['component_id'], ['components.id'], name=op.f('fk_bugs_component_id_components'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['environment_id'], ['environments.id'], name=op.f('fk_bugs_environment_id_environments'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['org_id'], ['organizations.id'], name=op.f('fk_bugs_org_id_organizations'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['project_id'], ['projects.id'], name=op.f('fk_bugs_project_id_projects'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['reporter_id'], ['users.id'], name=op.f('fk_bugs_reporter_id_users')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_bugs')),
    sa.UniqueConstraint('org_id', 'key', name='uq_bugs_org_key'),
    sa.UniqueConstraint('project_id', 'number', name='uq_bugs_project_number')
    )
    op.create_index('ix_bugs_org_assignee', 'bugs', ['org_id', 'assignee_id'], unique=False)
    op.create_index('ix_bugs_org_project_status', 'bugs', ['org_id', 'project_id', 'status'], unique=False)
    op.create_index('ix_bugs_org_updated', 'bugs', ['org_id', sa.literal_column('updated_at DESC')], unique=False)
    op.create_table('bug_labels',
    sa.Column('bug_id', sa.Uuid(), nullable=False),
    sa.Column('label_id', sa.Uuid(), nullable=False),
    sa.Column('org_id', sa.Uuid(), nullable=False),
    sa.ForeignKeyConstraint(['bug_id'], ['bugs.id'], name=op.f('fk_bug_labels_bug_id_bugs'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['label_id'], ['labels.id'], name=op.f('fk_bug_labels_label_id_labels'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['org_id'], ['organizations.id'], name=op.f('fk_bug_labels_org_id_organizations'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('bug_id', 'label_id', name='pk_bug_labels')
    )
    op.create_index('ix_bug_labels_label', 'bug_labels', ['label_id'], unique=False)
    op.create_index('ix_bug_labels_org', 'bug_labels', ['org_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_bug_labels_org', table_name='bug_labels')
    op.drop_index('ix_bug_labels_label', table_name='bug_labels')
    op.drop_table('bug_labels')
    op.drop_index('ix_bugs_org_updated', table_name='bugs')
    op.drop_index('ix_bugs_org_project_status', table_name='bugs')
    op.drop_index('ix_bugs_org_assignee', table_name='bugs')
    op.drop_table('bugs')
    op.drop_index('uq_saved_views_org_user_name_ci', table_name='saved_views')
    op.drop_index('ix_saved_views_org_user', table_name='saved_views')
    op.drop_table('saved_views')
