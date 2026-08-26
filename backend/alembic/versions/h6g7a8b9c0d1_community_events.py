"""community events + premium perks (Phase 9 - Evenements / Premium)

Revision ID: h6g7a8b9c0d1
Revises: g5f6a7b8c9d0
Create Date: 2026-08-19

- community_events                : agenda communautaire (webinar | ama | meetup | workshop)
- community_event_registrations   : inscriptions / liste d'attente (UNIQUE event+user)
- premium_only est derive a la lecture de la tier Pro de l'organisateur/membre
"""
from alembic import op
import sqlalchemy as sa

revision = "h6g7a8b9c0d1"
down_revision = "g5f6a7b8c9d0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "community_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "organizer_id",
            sa.Integer(),
            sa.ForeignKey("community_users.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column("title", sa.String(180), nullable=False),
        sa.Column("description", sa.Text(), default=""),
        sa.Column("kind", sa.String(20), nullable=False),  # webinar | ama | meetup | workshop
        sa.Column("starts_at", sa.DateTime(), nullable=False, index=True),
        sa.Column("ends_at", sa.DateTime(), nullable=True),
        sa.Column("location", sa.String(200), default=""),
        sa.Column("speakers", sa.Text(), default=""),
        sa.Column("agenda", sa.Text(), default=""),
        sa.Column("capacity", sa.Integer(), nullable=True),
        sa.Column("premium_only", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("status", sa.String(20), nullable=False, server_default="published", index=True),  # draft | published | cancelled
        sa.Column("reminded_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_community_events_status_starts", "community_events", ["status", "starts_at"])

    op.create_table(
        "community_event_registrations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "event_id",
            sa.Integer(),
            sa.ForeignKey("community_events.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("community_users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("status", sa.String(20), nullable=False, server_default="registered"),  # registered | waitlisted | cancelled
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.UniqueConstraint("event_id", "user_id", name="uq_event_registration"),
    )


def downgrade() -> None:
    op.drop_table("community_event_registrations")
    op.drop_index("ix_community_events_status_starts", table_name="community_events")
    op.drop_table("community_events")