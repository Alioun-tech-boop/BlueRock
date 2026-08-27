"""ledger double entry accounts and entries

Revision ID: a2b4c6d8e0f1
Revises: e5f7a1b3c9d2
Create Date: 2026-08-17 19:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'a2b4c6d8e0f1'
down_revision: Union[str, None] = 'e5f7a1b3c9d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ledger_accounts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("portfolio_id", sa.Integer(), sa.ForeignKey("portfolios.id"), nullable=True),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("currency", sa.String(8), nullable=False, server_default="XOF"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_ledger_accounts_user_id", "ledger_accounts", ["user_id"])
    op.create_index("ix_ledger_accounts_portfolio_id", "ledger_accounts", ["portfolio_id"])
    op.create_index("ix_ledger_accounts_code", "ledger_accounts", ["code"])
    op.create_index("ix_ledger_accounts_user_code", "ledger_accounts", ["user_id", "code"], unique=True)

    op.create_table(
        "ledger_entries",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("portfolio_id", sa.Integer(), sa.ForeignKey("portfolios.id"), nullable=True),
        sa.Column("account_code", sa.String(64), nullable=False),
        sa.Column("entry_type", sa.String(4), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("currency", sa.String(8), nullable=False, server_default="XOF"),
        sa.Column("ref_type", sa.String(32), nullable=False),
        sa.Column("ref_id", sa.String(64), nullable=False),
        sa.Column("idempotency_key", sa.String(96), nullable=False),
        sa.Column("meta", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_ledger_entries_user_id", "ledger_entries", ["user_id"])
    op.create_index("ix_ledger_entries_portfolio_id", "ledger_entries", ["portfolio_id"])
    op.create_index("ix_ledger_entries_account_code", "ledger_entries", ["account_code"])
    op.create_index("ix_ledger_entries_ref_id", "ledger_entries", ["ref_id"])
    op.create_index("ix_ledger_entries_idempotency_key", "ledger_entries", ["idempotency_key"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_ledger_entries_idempotency_key", table_name="ledger_entries")
    op.drop_index("ix_ledger_entries_ref_id", table_name="ledger_entries")
    op.drop_index("ix_ledger_entries_account_code", table_name="ledger_entries")
    op.drop_index("ix_ledger_entries_portfolio_id", table_name="ledger_entries")
    op.drop_index("ix_ledger_entries_user_id", table_name="ledger_entries")
    op.drop_table("ledger_entries")
    op.drop_index("ix_ledger_accounts_user_code", table_name="ledger_accounts")
    op.drop_index("ix_ledger_accounts_code", table_name="ledger_accounts")
    op.drop_index("ix_ledger_accounts_portfolio_id", table_name="ledger_accounts")
    op.drop_index("ix_ledger_accounts_user_id", table_name="ledger_accounts")
    op.drop_table("ledger_accounts")