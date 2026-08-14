"""stripe payments: challenge entry status + order purpose

Revision ID: 4f1c9b2e7a05
Revises: 6798a00d86cb
Create Date: 2026-08-14 14:30:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '4f1c9b2e7a05'
down_revision: Union[str, None] = '6798a00d86cb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # Défis payants : l'inscription n'est effective qu'une fois le paiement
    # Stripe confirmé (webhook). Les entrées existantes restent "paid".
    op.add_column("challenge_entries", sa.Column("status", sa.String(20),
                                                 nullable=False,
                                                 server_default="paid"))
    op.add_column("challenge_entries", sa.Column("order_id", sa.Integer(),
                                                 nullable=True))
    op.create_index("ix_challenge_entries_order_id", "challenge_entries", ["order_id"])

    # Ordres de paiement : but (dépôt vs frais d'inscription).
    op.add_column("deposit_orders", sa.Column("purpose", sa.String(20),
                                              nullable=False,
                                              server_default="deposit"))

def downgrade() -> None:
    op.drop_column("deposit_orders", "purpose")
    op.drop_index("ix_challenge_entries_order_id", table_name="challenge_entries")
    op.drop_column("challenge_entries", "order_id")
    op.drop_column("challenge_entries", "status")