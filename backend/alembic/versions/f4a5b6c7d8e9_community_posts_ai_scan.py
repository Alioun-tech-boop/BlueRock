"""community_posts scan_at/toxic_score (Phase 7 - IA)

Revision ID: f4a5b6c7d8e9
Revises: e3f4a5b6c7d8
Create Date: 2026-08-19
"""
from alembic import op
import sqlalchemy as sa

revision = "f4a5b6c7d8e9"
down_revision = "e3f4a5b6c7d8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("community_posts", sa.Column("scan_at", sa.DateTime(), nullable=True))
    op.add_column("community_posts", sa.Column("toxic_score", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("community_posts", "toxic_score")
    op.drop_column("community_posts", "scan_at")