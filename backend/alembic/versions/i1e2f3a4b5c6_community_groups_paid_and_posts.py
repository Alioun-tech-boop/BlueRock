"""community groups paid + group posts + pending requests (Phase 10 - Groupes)

Revision ID: i1e2f3a4b5c6
Revises: h6g7a8b9c0d1
Create Date: 2026-08-20

- community_groups.is_paid / price_xof        : acces payant au groupe (Stripe)
- community_posts.group_id                    : publications de groupe (admin-only)
- community_members.order_pending_id          : lien demande -> ordre de paiement
"""
from alembic import op
import sqlalchemy as sa

revision = "i1e2f3a4b5c6"
down_revision = "h6g7a8b9c0d1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "community_groups",
        sa.Column("is_paid", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "community_groups",
        sa.Column("price_xof", sa.Integer(), nullable=True),
    )

    op.add_column(
        "community_posts",
        sa.Column(
            "group_id",
            sa.Integer(),
            sa.ForeignKey("community_groups.id", ondelete="CASCADE"),
            nullable=True,
            index=True,
        ),
    )

    op.add_column(
        "community_members",
        sa.Column("order_pending_id", sa.Integer(), nullable=True, index=True),
    )


def downgrade() -> None:
    op.drop_index("ix_community_members_order_pending_id", table_name="community_members")
    op.drop_column("community_members", "order_pending_id")

    op.drop_index("ix_community_posts_group_id", table_name="community_posts")
    op.drop_column("community_posts", "group_id")

    op.drop_column("community_groups", "price_xof")
    op.drop_column("community_groups", "is_paid")
