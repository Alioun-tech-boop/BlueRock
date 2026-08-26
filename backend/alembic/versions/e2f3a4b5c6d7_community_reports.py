"""community_reports + hidden/banned flags (Phase 6 - Moderation)

Revision ID: e2f3a4b5c6d7
Revises: d9e0f1a2b3c4
Create Date: 2026-08-19

- community_users.banned_at          : exclusion ecriture (posts/commentaires/reactions/abonnements...)
- community_posts.hidden_at          : masquage par le staff (shadow remove) - visible auteur/staff uniquement
- community_comments.hidden_at       : meme mecanique pour les commentaires
- community_reports                  : signalements utilisateurs (post|comment|user) + resolution staff
"""
from alembic import op
import sqlalchemy as sa

revision = "e2f3a4b5c6d7"
down_revision = "d9e0f1a2b3c4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("community_users", sa.Column("banned_at", sa.DateTime(), nullable=True))
    op.add_column("community_posts", sa.Column("hidden_at", sa.DateTime(), nullable=True))
    op.add_column("community_comments", sa.Column("hidden_at", sa.DateTime(), nullable=True))

    op.create_table(
        "community_reports",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "reporter_id",
            sa.Integer(),
            sa.ForeignKey("community_users.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column("target_type", sa.String(20), nullable=False),  # post | comment | user
        sa.Column("target_id", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(60), nullable=False),  # spam | harassment | misinformation | other
        sa.Column("details", sa.String(600), default=""),
        sa.Column("status", sa.String(20), default="open", nullable=False, index=True),  # open | resolved | dismissed
        sa.Column(
            "resolved_by",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("resolved_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Index("ix_community_reports_target", "target_type", "target_id"),
    )


def downgrade() -> None:
    op.drop_table("community_reports")
    op.drop_column("community_comments", "hidden_at")
    op.drop_column("community_posts", "hidden_at")
    op.drop_column("community_users", "banned_at")