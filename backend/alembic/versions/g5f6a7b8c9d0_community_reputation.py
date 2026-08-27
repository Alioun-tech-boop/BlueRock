"""community reputation + badges (Phase 8 - Reputation)

Revision ID: g5f6a7b8c9d0
Revises: f4a5b6c7d8e9
Create Date: 2026-08-19

- community_users.reputation   : score cumule (activite, qualite, penalites)
- community_badges             : badges debloques automatiquement (UNIQUE user+code)
"""
from alembic import op
import sqlalchemy as sa

revision = "g5f6a7b8c9d0"
down_revision = "f4a5b6c7d8e9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("community_users", sa.Column("reputation", sa.Integer(), default=50, nullable=False, server_default="50"))

    op.create_table(
        "community_badges",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("community_users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("code", sa.String(40), nullable=False),
        sa.Column("earned_at", sa.DateTime(), server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "code", name="uq_user_badge"),
    )


def downgrade() -> None:
    op.drop_table("community_badges")
    op.drop_column("community_users", "reputation")