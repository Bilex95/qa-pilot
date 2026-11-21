"""releases (I-08)

Revision ID: 0013
Revises: 0012
Create Date: 2026-11-22 15:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '0013'
down_revision: str | None = '0012'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('releases',
    sa.Column('org_id', sa.Uuid(), nullable=False),
    sa.Column('project_id', sa.Uuid(), nullable=False),
    sa.Column('name', sa.String(length=60), nullable=False),
    sa.Column('description', sa.String(length=1000), nullable=False),
    sa.Column('target_date', sa.Date(), nullable=True),
    sa.Column('status', sa.String(length=12), nullable=False),
    sa.Column('released_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('ai_summary', sa.Text(), nullable=True),
    sa.Column('ai_summary_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('ai_summary_by_id', sa.Uuid(), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint("status IN ('planned', 'in_progress', 'released')", name=op.f('ck_releases_status')),
    sa.ForeignKeyConstraint(['ai_summary_by_id'], ['users.id'], name=op.f('fk_releases_ai_summary_by_id_users'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['org_id'], ['organizations.id'], name=op.f('fk_releases_org_id_organizations'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['project_id'], ['projects.id'], name=op.f('fk_releases_project_id_projects'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_releases'))
    )
    op.create_index('ix_releases_org_project', 'releases', ['org_id', 'project_id'], unique=False)
    op.create_index('uq_releases_project_name_ci', 'releases', ['project_id', sa.literal_column('lower(name)')], unique=True)
    # The release ids that bugs and runs have carried since I-03 and I-07 now point at a real table. Nothing could set one before
    # (the API refused every id), so no row needs cleaning first.
    op.create_foreign_key(op.f('fk_bugs_release_id_releases'), 'bugs', 'releases', ['release_id'], ['id'], ondelete='SET NULL')
    op.create_foreign_key(op.f('fk_test_runs_release_id_releases'), 'test_runs', 'releases', ['release_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    op.drop_constraint(op.f('fk_test_runs_release_id_releases'), 'test_runs', type_='foreignkey')
    op.drop_constraint(op.f('fk_bugs_release_id_releases'), 'bugs', type_='foreignkey')
    op.drop_index('uq_releases_project_name_ci', table_name='releases')
    op.drop_index('ix_releases_org_project', table_name='releases')
    op.drop_table('releases')
