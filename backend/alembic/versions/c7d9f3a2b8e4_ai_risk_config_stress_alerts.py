"""ai risk config, stress tests, alerts

Revision ID: c7d9f3a2b8e4
Revises: b3d8c1a2e9f6
Create Date: 2026-08-16 12:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'c7d9f3a2b8e4'
down_revision: Union[str, None] = 'b3d8c1a2e9f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has(table: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table)


def upgrade() -> None:
    if not _has("ai_risk_configs"):
        op.create_table(
            "ai_risk_configs",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("name", sa.String(120), nullable=False, server_default="DEFAULT"),
            sa.Column("limits", sa.JSON(), nullable=False),
            sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    if not _has("ai_stress_tests"):
        op.create_table(
            "ai_stress_tests",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("scenario", sa.String(60), nullable=False),
            sa.Column("date", sa.DateTime(timezone=True), nullable=False),
            sa.Column("impact_pct", sa.Float(), nullable=True),
            sa.Column("impact_amount", sa.Float(), nullable=True),
            sa.Column("metrics", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index("ix_ai_stress_tests_scenario", "ai_stress_tests", ["scenario"])

    if not _has("ai_alerts"):
        op.create_table(
            "ai_alerts",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("alert_type", sa.String(50), nullable=False),
            sa.Column("severity", sa.String(20), nullable=False, server_default="INFO"),
            sa.Column("title", sa.String(160), nullable=False),
            sa.Column("body", sa.Text(), nullable=True),
            sa.Column("link", sa.String(200), nullable=True),
            sa.Column("payload", sa.JSON(), nullable=True),
            sa.Column("email_sent", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("read", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index("ix_ai_alerts_alert_type", "ai_alerts", ["alert_type"])


def downgrade() -> None:
    op.drop_index("ix_ai_alerts_alert_type", table_name="ai_alerts")
    op.drop_table("ai_alerts")
    op.drop_index("ix_ai_stress_tests_scenario", table_name="ai_stress_tests")
    op.drop_table("ai_stress_tests")
    op.drop_table("ai_risk_configs")
