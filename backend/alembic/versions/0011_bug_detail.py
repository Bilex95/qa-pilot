"""bug detail: comments, attachments and activity (I-05)

Revision ID: 0011
Revises: 0010
Create Date: 2026-11-22 09:10:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '0011'
down_revision: str | None = '0010'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

KINDS = ("created", "field_changed", "status_changed", "assigned", "commented", "attachment_added",
         "attachment_removed", "linked_release")


def upgrade() -> None:
    op.create_table('comments',
    sa.Column('org_id', sa.Uuid(), nullable=False),
    sa.Column('bug_id', sa.Uuid(), nullable=False),
    sa.Column('author_id', sa.Uuid(), nullable=False),
    sa.Column('body', sa.Text(), nullable=False),
    sa.Column('edited_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['author_id'], ['users.id'], name=op.f('fk_comments_author_id_users')),
    sa.ForeignKeyConstraint(['bug_id'], ['bugs.id'], name=op.f('fk_comments_bug_id_bugs'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['org_id'], ['organizations.id'], name=op.f('fk_comments_org_id_organizations'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_comments'))
    )
    op.create_index('ix_comments_bug_created', 'comments', ['bug_id', sa.literal_column('created_at DESC')], unique=False)
    op.create_table('attachments',
    sa.Column('org_id', sa.Uuid(), nullable=False),
    sa.Column('bug_id', sa.Uuid(), nullable=False),
    sa.Column('uploaded_by_id', sa.Uuid(), nullable=False),
    sa.Column('filename', sa.String(length=255), nullable=False),
    sa.Column('content_type', sa.String(length=100), nullable=False),
    sa.Column('size_bytes', sa.Integer(), nullable=False),
    sa.Column('storage_key', sa.String(length=64), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['bug_id'], ['bugs.id'], name=op.f('fk_attachments_bug_id_bugs'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['org_id'], ['organizations.id'], name=op.f('fk_attachments_org_id_organizations'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['uploaded_by_id'], ['users.id'], name=op.f('fk_attachments_uploaded_by_id_users')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_attachments')),
    sa.UniqueConstraint('storage_key', name=op.f('uq_attachments_storage_key'))
    )
    op.create_index('ix_attachments_bug', 'attachments', ['bug_id'], unique=False)
    op.create_table('bug_activity',
    sa.Column('org_id', sa.Uuid(), nullable=False),
    sa.Column('bug_id', sa.Uuid(), nullable=False),
    sa.Column('actor_id', sa.Uuid(), nullable=False),
    sa.Column('kind', sa.String(length=20), nullable=False),
    sa.Column('field', sa.String(length=40), nullable=True),
    sa.Column('old_value', sa.Text(), nullable=True),
    sa.Column('new_value', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.CheckConstraint("kind IN (" + ", ".join(repr(k) for k in KINDS) + ")", name=op.f('ck_bug_activity_kind')),
    sa.ForeignKeyConstraint(['actor_id'], ['users.id'], name=op.f('fk_bug_activity_actor_id_users')),
    sa.ForeignKeyConstraint(['bug_id'], ['bugs.id'], name=op.f('fk_bug_activity_bug_id_bugs'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['org_id'], ['organizations.id'], name=op.f('fk_bug_activity_org_id_organizations'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_bug_activity'))
    )
    op.create_index('ix_bug_activity_bug_created', 'bug_activity', ['bug_id', sa.literal_column('created_at DESC')], unique=False)
    # Bugs that exist before this migration get their "created" entry, so every timeline starts the same way
    op.execute(
        "INSERT INTO bug_activity (id, org_id, bug_id, actor_id, kind, created_at) "
        "SELECT gen_random_uuid(), org_id, id, reporter_id, 'created', created_at FROM bugs"
    )


def downgrade() -> None:
    op.drop_index('ix_bug_activity_bug_created', table_name='bug_activity')
    op.drop_table('bug_activity')
    op.drop_index('ix_attachments_bug', table_name='attachments')
    op.drop_table('attachments')
    op.drop_index('ix_comments_bug_created', table_name='comments')
    op.drop_table('comments')
