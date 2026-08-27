"""ai studio core tables (BLUEROCK AI)

Revision ID: b3d8c1a2e9f6
Revises: a1c9e4f0b2d7
Create Date: 2026-08-16 09:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'b3d8c1a2e9f6'
down_revision: Union[str, None] = 'a1c9e4f0b2d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has(table: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table)


def upgrade() -> None:
    # Les tables peuvent déjà exister si Base.metadata.create_all a tourné au
    # démarrage du backend ; les gardes rendent la migration idempotente.

    if not _has("ai_strategies"):
        op.create_table(
            "ai_strategies",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("name", sa.String(120), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("parameters", sa.JSON(), nullable=True),
            sa.Column("status", sa.String(30), nullable=False, server_default="ACTIVE"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    if not _has("ai_features"):
        op.create_table(
            "ai_features",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("code", sa.String(80), nullable=False, unique=True),
            sa.Column("category", sa.String(50), nullable=False),
            sa.Column("name", sa.String(120), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("default_weight", sa.Float(), nullable=False, server_default="1"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    if not _has("ai_models"):
        op.create_table(
            "ai_models",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("name", sa.String(120), nullable=False),
            sa.Column("model_type", sa.String(50), nullable=False, server_default="quant"),
            sa.Column("strategy_id", sa.Integer(), sa.ForeignKey("ai_strategies.id"), nullable=True),
            sa.Column("status", sa.String(30), nullable=False, server_default="ACTIVE"),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    if not _has("ai_model_versions"):
        op.create_table(
            "ai_model_versions",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("model_id", sa.Integer(), sa.ForeignKey("ai_models.id"), nullable=False, index=True),
            sa.Column("version", sa.String(30), nullable=False),
            sa.Column("status", sa.String(30), nullable=False, server_default="DRAFT"),
            sa.Column("strategy_id", sa.Integer(), sa.ForeignKey("ai_strategies.id"), nullable=True),
            sa.Column("parameters", sa.JSON(), nullable=True),
            sa.Column("features", sa.JSON(), nullable=True),
            sa.Column("training_period", sa.String(100), nullable=True),
            sa.Column("dataset", sa.String(200), nullable=True),
            sa.Column("algorithms", sa.JSON(), nullable=True),
            sa.Column("validation", sa.JSON(), nullable=True),
            sa.Column("change_reason", sa.Text(), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("promoted_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("retired_at", sa.DateTime(timezone=True), nullable=True),
        )

    if not _has("ai_portfolios"):
        op.create_table(
            "ai_portfolios",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("name", sa.String(120), nullable=False),
            sa.Column("currency", sa.String(10), nullable=False, server_default="XOF"),
            sa.Column("cash", sa.Float(), nullable=False, server_default="0"),
            sa.Column("initial_value", sa.Float(), nullable=True),
            sa.Column("strategy_id", sa.Integer(), sa.ForeignKey("ai_strategies.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    if not _has("ai_positions"):
        op.create_table(
            "ai_positions",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("portfolio_id", sa.Integer(), sa.ForeignKey("ai_portfolios.id"), nullable=False, index=True),
            sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=True, index=True),
            sa.Column("symbol", sa.String(20), nullable=False),
            sa.Column("quantity", sa.Float(), nullable=False, server_default="0"),
            sa.Column("avg_price", sa.Float(), nullable=False, server_default="0"),
            sa.Column("current_price", sa.Float(), nullable=True),
            sa.Column("allocation_pct", sa.Float(), nullable=True),
            sa.Column("sector", sa.String(60), nullable=True),
            sa.Column("entry_date", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("exit_date", sa.DateTime(timezone=True), nullable=True),
            sa.Column("status", sa.String(20), nullable=False, server_default="OPEN"),
            sa.UniqueConstraint("portfolio_id", "company_id", name="uq_ai_positions_portfolio_company"),
        )

    if not _has("ai_decisions"):
        op.create_table(
            "ai_decisions",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("version_id", sa.Integer(), sa.ForeignKey("ai_model_versions.id"), nullable=True, index=True),
            sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=True, index=True),
            sa.Column("decision_type", sa.String(20), nullable=False),
            sa.Column("status", sa.String(20), nullable=False, server_default="PROPOSED"),
            sa.Column("confidence", sa.Float(), nullable=True),
            sa.Column("risk_level", sa.String(20), nullable=True),
            sa.Column("horizon", sa.String(30), nullable=True),
            sa.Column("allocation_target", sa.Float(), nullable=True),
            sa.Column("price_at_decision", sa.Float(), nullable=True),
            sa.Column("regime", sa.String(30), nullable=True),
            sa.Column("score", sa.JSON(), nullable=True),
            sa.Column("summary", sa.Text(), nullable=True),
            sa.Column("evaluated", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("outcome", sa.Float(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    if not _has("ai_decision_factors"):
        op.create_table(
            "ai_decision_factors",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("decision_id", sa.Integer(), sa.ForeignKey("ai_decisions.id"), nullable=False, index=True),
            sa.Column("factor", sa.String(80), nullable=False),
            sa.Column("category", sa.String(50), nullable=False),
            sa.Column("score", sa.Float(), nullable=True),
            sa.Column("weight", sa.Float(), nullable=True),
            sa.Column("direction", sa.String(10), nullable=False, server_default="positive"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    if not _has("ai_orders"):
        op.create_table(
            "ai_orders",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("portfolio_id", sa.Integer(), sa.ForeignKey("ai_portfolios.id"), nullable=False, index=True),
            sa.Column("decision_id", sa.Integer(), sa.ForeignKey("ai_decisions.id"), nullable=True),
            sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=True),
            sa.Column("side", sa.String(10), nullable=False),
            sa.Column("symbol", sa.String(20), nullable=False),
            sa.Column("quantity", sa.Float(), nullable=False, server_default="0"),
            sa.Column("limit_price", sa.Float(), nullable=True),
            sa.Column("status", sa.String(20), nullable=False, server_default="PENDING"),
            sa.Column("environment", sa.String(20), nullable=False, server_default="SIMULATION"),
            sa.Column("reason", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    if not _has("ai_executions"):
        op.create_table(
            "ai_executions",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("order_id", sa.Integer(), sa.ForeignKey("ai_orders.id"), nullable=False, index=True),
            sa.Column("price", sa.Float(), nullable=False),
            sa.Column("quantity", sa.Float(), nullable=False),
            sa.Column("fee", sa.Float(), nullable=False, server_default="0"),
            sa.Column("slippage", sa.Float(), nullable=False, server_default="0"),
            sa.Column("executed_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    if not _has("ai_performance_snapshots"):
        op.create_table(
            "ai_performance_snapshots",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("portfolio_id", sa.Integer(), sa.ForeignKey("ai_portfolios.id"), nullable=False, index=True),
            sa.Column("date", sa.DateTime(), nullable=False, index=True),
            sa.Column("value", sa.Float(), nullable=False, server_default="0"),
            sa.Column("cash", sa.Float(), nullable=False, server_default="0"),
            sa.Column("invested", sa.Float(), nullable=False, server_default="0"),
            sa.Column("benchmark_value", sa.Float(), nullable=True),
            sa.Column("return_1d", sa.Float(), nullable=True),
            sa.Column("return_since_launch", sa.Float(), nullable=True),
            sa.Column("drawdown", sa.Float(), nullable=True),
            sa.UniqueConstraint("portfolio_id", "date", name="uq_ai_performance_portfolio_date"),
        )

    if not _has("ai_risk_snapshots"):
        op.create_table(
            "ai_risk_snapshots",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("portfolio_id", sa.Integer(), sa.ForeignKey("ai_portfolios.id"), nullable=False, index=True),
            sa.Column("date", sa.DateTime(), nullable=False, index=True),
            sa.Column("volatility", sa.Float(), nullable=True),
            sa.Column("max_drawdown", sa.Float(), nullable=True),
            sa.Column("sharpe_ratio", sa.Float(), nullable=True),
            sa.Column("sortino_ratio", sa.Float(), nullable=True),
            sa.Column("beta", sa.Float(), nullable=True),
            sa.Column("downside_deviation", sa.Float(), nullable=True),
            sa.Column("var_95", sa.Float(), nullable=True),
            sa.Column("cvar_95", sa.Float(), nullable=True),
            sa.Column("risk_score", sa.Float(), nullable=True),
            sa.UniqueConstraint("portfolio_id", "date", name="uq_ai_risk_portfolio_date"),
        )

    if not _has("ai_backtests"):
        op.create_table(
            "ai_backtests",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("strategy_id", sa.Integer(), sa.ForeignKey("ai_strategies.id"), nullable=True),
            sa.Column("version_id", sa.Integer(), sa.ForeignKey("ai_model_versions.id"), nullable=True),
            sa.Column("period_start", sa.DateTime(), nullable=True),
            sa.Column("period_end", sa.DateTime(), nullable=True),
            sa.Column("dataset", sa.String(200), nullable=True),
            sa.Column("status", sa.String(20), nullable=False, server_default="QUEUED"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        )

    if not _has("ai_backtest_results"):
        op.create_table(
            "ai_backtest_results",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("backtest_id", sa.Integer(), sa.ForeignKey("ai_backtests.id"), nullable=False, index=True),
            sa.Column("metrics", sa.JSON(), nullable=True),
            sa.Column("benchmark_name", sa.String(100), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    if not _has("ai_evolution_events"):
        op.create_table(
            "ai_evolution_events",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("event_type", sa.String(40), nullable=False, index=True),
            sa.Column("version_from", sa.String(30), nullable=True),
            sa.Column("version_to", sa.String(30), nullable=True),
            sa.Column("detail", sa.Text(), nullable=True),
            sa.Column("payload", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    if not _has("ai_health_snapshots"):
        op.create_table(
            "ai_health_snapshots",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("date", sa.DateTime(), nullable=False, index=True),
            sa.Column("data_health", sa.Float(), nullable=True),
            sa.Column("model_health", sa.Float(), nullable=True),
            sa.Column("risk_health", sa.Float(), nullable=True),
            sa.Column("execution_health", sa.Float(), nullable=True),
            sa.Column("system_health", sa.Float(), nullable=True),
            sa.Column("global_status", sa.String(20), nullable=False, server_default="OPERATIONAL"),
            sa.Column("details", sa.JSON(), nullable=True),
        )

    if not _has("ai_benchmarks"):
        op.create_table(
            "ai_benchmarks",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("name", sa.String(120), nullable=False),
            sa.Column("code", sa.String(30), nullable=False, unique=True),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    if not _has("ai_audit_logs"):
        op.create_table(
            "ai_audit_logs",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("event_type", sa.String(50), nullable=False, index=True),
            sa.Column("entity_type", sa.String(50), nullable=True),
            sa.Column("entity_id", sa.Integer(), nullable=True),
            sa.Column("actor", sa.String(100), nullable=True),
            sa.Column("detail", sa.Text(), nullable=True),
            sa.Column("payload", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    if not _has("ai_data_quality"):
        op.create_table(
            "ai_data_quality",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("source", sa.String(100), nullable=False),
            sa.Column("check_date", sa.DateTime(), nullable=False, index=True),
            sa.Column("freshness", sa.Float(), nullable=True),
            sa.Column("completeness", sa.Float(), nullable=True),
            sa.Column("status", sa.String(20), nullable=False, server_default="OK"),
            sa.Column("details", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )


def downgrade() -> None:
    tables = [
        "ai_data_quality",
        "ai_audit_logs",
        "ai_benchmarks",
        "ai_health_snapshots",
        "ai_evolution_events",
        "ai_backtest_results",
        "ai_backtests",
        "ai_risk_snapshots",
        "ai_performance_snapshots",
        "ai_executions",
        "ai_orders",
        "ai_decision_factors",
        "ai_decisions",
        "ai_positions",
        "ai_portfolios",
        "ai_model_versions",
        "ai_models",
        "ai_features",
        "ai_strategies",
    ]
    for table in tables:
        if _has(table):
            op.drop_table(table)
