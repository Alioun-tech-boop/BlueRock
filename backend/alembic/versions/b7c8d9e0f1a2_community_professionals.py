"""community_professionals + community_users.is_pro (Phase 2 Professionnels)

Revision ID: b7c8d9e0f1a2
Revises: a6b7c8d9e0f1
Create Date: 2026-08-18 19:15:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'b7c8d9e0f1a2'
down_revision: Union[str, None] = 'a6b7c8d9e0f1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("community_users", sa.Column("is_pro", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_index("ix_community_users_is_pro", "community_users", ["is_pro"])

    op.create_table(
        "community_professionals",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("community_users.id"), nullable=False),
        sa.Column("category", sa.String(40), nullable=False),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("company", sa.String(120), nullable=False, server_default=""),
        sa.Column("license", sa.String(120), nullable=False, server_default=""),
        sa.Column("certifications", sa.Text(), nullable=False, server_default=""),
        sa.Column("bio_pro", sa.Text(), nullable=False, server_default=""),
        sa.Column("website", sa.String(200), nullable=False, server_default=""),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("review_note", sa.String(500), nullable=False, server_default=""),
        sa.Column("reviewed_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("submitted_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_unique_constraint("uq_community_professional_user", "community_professionals", ["user_id"])
    op.create_index("ix_community_professionals_user_id", "community_professionals", ["user_id"])
    op.create_index("ix_community_professionals_status", "community_professionals", ["status"])


def downgrade() -> None:
    op.drop_index("ix_community_professionals_status", table_name="community_professionals")
    op.drop_index("ix_community_professionals_user_id", table_name="community_professionals")
    op.drop_constraint("uq_community_professional_user", "community_professionals", type_="unique")
    op.drop_table("community_professionals")

    op.drop_index("ix_community_users_is_pro", table_name="community_users")
    op.drop_column("community_users", "is_pro")