"""community views + drafts (Phase 5)

Revision ID: d9e0f1a2b3c4
Revises: c8d9e0f1a2b3
Create Date: 2026-08-19

Phase 5 — Création & dashboard :
  * community_posts.views (nombre de lectures)
  * table community_drafts (brouillons d'analyses)
"""
from alembic import op
import sqlalchemy as sa

revision = "d9e0f1a2b3c4"
down_revision = "c8d9e0f1a2b3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("community_posts", sa.Column("views", sa.Integer(), server_default="0", nullable=False))
    op.create_table(
        "community_drafts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("symbol", sa.String(length=20), server_default="", nullable=False),
        sa.Column("sentiment", sa.String(length=10), server_default="bullish", nullable=False),
        sa.Column("title", sa.String(length=240), server_default="", nullable=False),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("link_url", sa.String(length=500), server_default="", nullable=False),
        sa.Column("link_title", sa.String(length=240), server_default="", nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["community_users.id"], name="fk_community_drafts_user"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_community_drafts_id", "community_drafts", ["id"])
    op.create_index("ix_community_drafts_user_id", "community_drafts", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_community_drafts_user_id", table_name="community_drafts")
    op.drop_index("ix_community_drafts_id", table_name="community_drafts")
    op.drop_table("community_drafts")
    op.drop_column("community_posts", "views")