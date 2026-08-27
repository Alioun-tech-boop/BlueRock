"""community_groups + community_members (Phase 1 Fondations)

Revision ID: a6b7c8d9e0f1
Revises: d4e6f8a2c0b4
Create Date: 2026-08-18 17:30:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'a6b7c8d9e0f1'
down_revision: Union[str, None] = 'd4e6f8a2c0b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "community_groups",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("slug", sa.String(140), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("category", sa.String(60), nullable=False, server_default="general"),
        sa.Column("visibility", sa.String(20), nullable=False, server_default="public"),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("rules", sa.Text(), nullable=False, server_default=""),
        sa.Column("avatar", sa.String(500), nullable=False, server_default=""),
        sa.Column("banner", sa.String(500), nullable=False, server_default=""),
        sa.Column("creator_id", sa.Integer(), sa.ForeignKey("community_users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_unique_constraint("uq_community_groups_slug", "community_groups", ["slug"])
    op.create_index("ix_community_groups_category", "community_groups", ["category"])
    op.create_index("ix_community_groups_visibility", "community_groups", ["visibility"])
    op.create_index("ix_community_groups_status", "community_groups", ["status"])
    op.create_index("ix_community_groups_creator_id", "community_groups", ["creator_id"])

    op.create_table(
        "community_members",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("community_id", sa.Integer(), sa.ForeignKey("community_groups.id"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("community_users.id"), nullable=False),
        sa.Column("role", sa.String(20), nullable=False, server_default="member"),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_unique_constraint("uq_community_member", "community_members", ["community_id", "user_id"])
    op.create_index("ix_community_members_community_id", "community_members", ["community_id"])
    op.create_index("ix_community_members_user_id", "community_members", ["user_id"])
    op.create_index("ix_community_members_community_status", "community_members", ["community_id", "status"])
    op.create_index("ix_community_members_community_role", "community_members", ["community_id", "role"])


def downgrade() -> None:
    op.drop_index("ix_community_members_community_role", table_name="community_members")
    op.drop_index("ix_community_members_community_status", table_name="community_members")
    op.drop_index("ix_community_members_user_id", table_name="community_members")
    op.drop_index("ix_community_members_community_id", table_name="community_members")
    op.drop_constraint("uq_community_member", "community_members", type_="unique")
    op.drop_table("community_members")

    op.drop_index("ix_community_groups_creator_id", table_name="community_groups")
    op.drop_index("ix_community_groups_status", table_name="community_groups")
    op.drop_index("ix_community_groups_visibility", table_name="community_groups")
    op.drop_index("ix_community_groups_category", table_name="community_groups")
    op.drop_constraint("uq_community_groups_slug", "community_groups", type_="unique")
    op.drop_table("community_groups")
