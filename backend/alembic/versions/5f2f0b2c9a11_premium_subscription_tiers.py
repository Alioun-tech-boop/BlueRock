"""premium subscription tiers + AI tokens

Revision ID: 5f2f0b2c9a11
Revises: 4f1c9b2e7a05
Create Date: 2026-08-14 16:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = '5f2f0b2c9a11'
down_revision: Union[str, None] = '4f1c9b2e7a05'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _existing_columns(table: str) -> set:
    insp = sa.inspect(op.get_bind())
    return {c["name"] for c in insp.get_columns(table)} if insp.has_table(table) else set()


def upgrade() -> None:
    users_cols = _existing_columns("users")

    # Niveau d'abonnement : basic (gratuit, BRVM seul) | pro (toutes bourses).
    if "tier" not in users_cols:
        op.add_column("users", sa.Column("tier", sa.String(20),
                                         nullable=False, server_default="basic"))
    # Tokens IA : allocation mensuelle (50 basic / 500 pro), consommés par question.
    if "ai_tokens_remaining" not in users_cols:
        op.add_column("users", sa.Column("ai_tokens_remaining", sa.Integer(),
                                         nullable=False, server_default="50"))
    if "ai_tokens_reset_at" not in users_cols:
        op.add_column("users", sa.Column("ai_tokens_reset_at", sa.DateTime(),
                                         nullable=True))
    # Liens Stripe (renewal / annulation via webhook).
    if "stripe_customer_id" not in users_cols:
        op.add_column("users", sa.Column("stripe_customer_id", sa.String(),
                                         nullable=True))
    if "stripe_subscription_id" not in users_cols:
        op.add_column("users", sa.Column("stripe_subscription_id", sa.String(),
                                         nullable=True))

    # Ordres d'abonnement (checkout Stripe mode=subscription). Peut avoir été
    # créé par create_all au démarrage du backend.
    insp = sa.inspect(op.get_bind())
    if not insp.has_table("subscription_orders"):
        op.create_table(
            "subscription_orders",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("order_id", sa.String(), nullable=False),
            sa.Column("user_id", sa.Integer(),
                      sa.ForeignKey("users.id"), nullable=False, index=True),
            sa.Column("provider_transaction_id", sa.String(), nullable=True),
            sa.Column("status", sa.String(20), nullable=False,
                      server_default="pending"),
            sa.Column("meta", postgresql.JSONB(), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
            sa.Column("confirmed_at", sa.DateTime(), nullable=True),
            sa.UniqueConstraint("order_id", name="uq_subscription_orders_order_id"),
        )


def downgrade() -> None:
    insp = sa.inspect(op.get_bind())
    if insp.has_table("subscription_orders"):
        op.drop_table("subscription_orders")
    users_cols = _existing_columns("users")
    for col in ("stripe_subscription_id", "stripe_customer_id", "ai_tokens_reset_at",
                "ai_tokens_remaining", "tier"):
        if col in users_cols:
            op.drop_column("users", col)