"""ngx integration: exchange/currency columns

Revision ID: 6798a00d86cb
Revises: f09ff51e3cde
Create Date: 2026-08-13 12:10:49.157623
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '6798a00d86cb'
down_revision: Union[str, None] = 'f09ff51e3cde'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # Sociétés multi-bourses : NGX (Nigeria, ₦) vient s'ajouter à la BRVM (FCFA).
    op.add_column("companies", sa.Column("exchange", sa.String(20), nullable=False,
                                         server_default="BRVM"))
    op.add_column("companies", sa.Column("currency", sa.String(10), nullable=False,
                                         server_default="XOF"))
    op.add_column("companies", sa.Column("sub_sector", sa.String(100), nullable=True))
    op.create_index("ix_companies_exchange", "companies", ["exchange"])

    # Portefeuilles mono-devise : XOF (BRVM) par défaut, NGN pour les portefeuilles NGX.
    op.add_column("portfolios", sa.Column("currency", sa.String(10), nullable=False,
                                          server_default="XOF"))

def downgrade() -> None:
    op.drop_column("portfolios", "currency")
    op.drop_index("ix_companies_exchange", table_name="companies")
    op.drop_column("companies", "sub_sector")
    op.drop_column("companies", "currency")
    op.drop_column("companies", "exchange")
