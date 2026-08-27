"""community_reports action/note (Phase 6 - suite)

Revision ID: e3f4a5b6c7d8
Revises: e2f3a4b5c6d7
Create Date: 2026-08-19
"""
from alembic import op
import sqlalchemy as sa

revision = "e3f4a5b6c7d8"
down_revision = "e2f3a4b5c6d7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # nomenclature: hide | delete | dismiss | ban  (vide si non traité)
    op.add_column("community_reports", sa.Column("action", sa.String(20), default="", nullable=False))
    op.add_column("community_reports", sa.Column("note", sa.String(500), default=""))


def downgrade() -> None:
    op.drop_column("community_reports", "note")
    op.drop_column("community_reports", "action")