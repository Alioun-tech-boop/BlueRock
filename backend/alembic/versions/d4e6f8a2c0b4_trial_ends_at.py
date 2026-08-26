"""users.trial_ends_at - essai gratuit Pro

Revision ID: d4e6f8a2c0b4
Revises: c7d9f3a2b8e4
Create Date: 2026-08-18 15:10:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'd4e6f8a2c0b4'
down_revision: Union[str, None] = 'f3e5d7a9b1c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('trial_ends_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'trial_ends_at')
