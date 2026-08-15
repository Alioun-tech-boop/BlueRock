"""Index manquants + unicité market_data (optimisations DB).

- Dédoublonne market_data (une seule ligne par company_id+date) puis applique
  la contrainte unique déclarée par le modèle.
- Indexe les colonnes FK non indexées (analysis_reports, dividends,
  financial_line_items, financial_statements).
- Indexe news.symbol (flux temps réel) et (status, available_at) pour le
  drainer de la file de jobs.
"""

revision = "a1c9e4f0b2d7"
down_revision = "5f2f0b2c9a11"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade():
    op.execute(
        "DELETE FROM market_data a USING market_data b "
        "WHERE a.id < b.id AND a.company_id = b.company_id AND a.date = b.date"
    )
    op.drop_index("ix_market_data_company_date", table_name="market_data")
    op.create_index("uq_market_data_company_date", "market_data", ["company_id", "date"], unique=True)

    op.create_index("ix_analysis_reports_company_id", "analysis_reports", ["company_id"])
    op.create_index("ix_dividends_company_id", "dividends", ["company_id"])
    op.create_index("ix_financial_line_items_statement_id", "financial_line_items", ["statement_id"])
    op.create_index("ix_financial_statements_company_id", "financial_statements", ["company_id"])

    op.create_index("ix_news_symbol", "news", ["symbol"])

    op.create_index("ix_background_jobs_status_available_at", "background_jobs", ["status", "available_at"])


def downgrade():
    op.drop_index("ix_background_jobs_status_available_at", table_name="background_jobs")
    op.drop_index("ix_news_symbol", table_name="news")
    op.drop_index("ix_financial_statements_company_id", table_name="financial_statements")
    op.drop_index("ix_financial_line_items_statement_id", table_name="financial_line_items")
    op.drop_index("ix_dividends_company_id", table_name="dividends")
    op.drop_index("ix_analysis_reports_company_id", table_name="analysis_reports")
    op.drop_index("uq_market_data_company_date", table_name="market_data")
    op.create_index("ix_market_data_company_date", "market_data", ["company_id", sa.text("date DESC")], unique=False)
