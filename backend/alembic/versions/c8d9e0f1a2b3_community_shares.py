"""communities share/reposts (Phase 3 — Publications & social)

Revision ID: c8d9e0f1a2b3
Revises: b7c8d9e0f1a2
Create Date: 2026-08-18
"""
from alembic import op
import sqlalchemy as sa

revision = "c8d9e0f1a2b3"
down_revision = "b7c8d9e0f1a2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "community_shares",
        sa.Column("id", sa.Integer(), sa.Identity(always=False), nullable=False),
        sa.Column("post_id", sa.Integer(), sa.ForeignKey("community_posts.id"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("community_users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_community_shares_post_id", "community_shares", ["post_id"])
    op.create_index("ix_community_shares_user_id", "community_shares", ["user_id"])
    op.create_index("ix_community_shares_id", "community_shares", ["id"])
    op.create_unique_constraint("uq_post_share", "community_shares", ["post_id", "user_id"])


def downgrade() -> None:
    op.drop_constraint("uq_post_share", "community_shares", type_="unique")
    op.drop_index("ix_community_shares_id", table_name="community_shares")
    op.drop_index("ix_community_shares_user_id", table_name="community_shares")
    op.drop_index("ix_community_shares_post_id", table_name="community_shares")
    op.drop_table("community_shares")