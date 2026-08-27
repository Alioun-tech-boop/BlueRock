"""rbac roles and session invalidation

Revision ID: e5f7a1b3c9d2
Revises: c7d9f3a2b8e4
Create Date: 2026-08-17 18:30:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'e5f7a1b3c9d2'
down_revision: Union[str, None] = 'c7d9f3a2b8e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "users" not in insp.get_table_names():
        return
    columns = {c["name"] for c in insp.get_columns("users")}
    if "role" not in columns:
        op.add_column("users", sa.Column("role", sa.String(32),
                                         nullable=False, server_default="user"))
        op.create_index("ix_users_role", "users", ["role"])
    if "session_valid_from" not in columns:
        op.add_column("users", sa.Column("session_valid_from", sa.DateTime(timezone=True),
                                         nullable=False, server_default=sa.func.now()))
    if "session_version" in columns:
        op.drop_column("users", "session_version")


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "users" not in insp.get_table_names():
        return
    columns = {c["name"] for c in insp.get_columns("users")}
    if "session_valid_from" in columns:
        op.drop_column("users", "session_valid_from")
    if "role" not in columns:
        op.add_column("users", sa.Column("role", sa.String(32),
                                         nullable=False, server_default="user"))
    if "role" in columns:
        op.drop_index("ix_users_role", table_name="users")
        op.drop_column("users", "role")