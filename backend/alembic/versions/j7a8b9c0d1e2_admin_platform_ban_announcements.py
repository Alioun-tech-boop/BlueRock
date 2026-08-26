"""admin platform: user ban + announcements table

Revision ID: j7a8b9c0d1e2
Revises: i1e2f3a4b5c6
Create Date: 2026-08-20

- users.banned_at / banned_reason   : bannissement plateforme (admin)
- announcements                     : communiqués éditoriaux (admin content)
"""
from alembic import op
import sqlalchemy as sa

revision = "j7a8b9c0d1e2"
down_revision = "i1e2f3a4b5c6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())
    if "users" in tables:
        cols = {c["name"] for c in insp.get_columns("users")}
        if "banned_at" not in cols:
            op.add_column("users", sa.Column("banned_at", sa.DateTime(timezone=True), nullable=True))
        if "banned_reason" not in cols:
            op.add_column("users", sa.Column("banned_reason", sa.String(255), nullable=True))
    if "announcements" not in tables:
        op.create_table(
            "announcements",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("title", sa.String(255), nullable=False),
            sa.Column("body", sa.Text(), nullable=True),
            sa.Column("source", sa.String(120), nullable=True),
            sa.Column("category", sa.String(40), nullable=False, server_default="general"),
            sa.Column("link_url", sa.String(500), nullable=True),
            sa.Column("image", sa.String(500), nullable=True),
            sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_announcements_active_published_at", "announcements", ["active", "published_at"])


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())
    if "announcements" in tables:
        op.drop_index("ix_announcements_active_published_at", table_name="announcements")
        op.drop_table("announcements")
    if "users" in tables:
        cols = {c["name"] for c in insp.get_columns("users")}
        if "banned_reason" in cols:
            op.drop_column("users", "banned_reason")
        if "banned_at" in cols:
            op.drop_column("users", "banned_at")