from sqlalchemy import Column, Integer, Float, String, Text, DateTime, Boolean, JSON, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import relationship
from ..database import Base


class AiStrategy(Base):
    __tablename__ = "ai_strategies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    description = Column(Text)
    parameters = Column(JSON)
    status = Column(String(30), nullable=False, default="ACTIVE")  # ACTIVE | PAUSED | RETIRED
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class AiFeature(Base):
    __tablename__ = "ai_features"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(80), nullable=False, unique=True)
    category = Column(String(50), nullable=False)  # fundamental | technical | macro | news | risk
    name = Column(String(120), nullable=False)
    description = Column(Text)
    default_weight = Column(Float, nullable=False, default=1.0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AiModel(Base):
    __tablename__ = "ai_models"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    model_type = Column(String(50), nullable=False, default="quant")  # quant | ml | hybrid
    strategy_id = Column(Integer, ForeignKey("ai_strategies.id"), nullable=True)
    status = Column(String(30), nullable=False, default="ACTIVE")  # ACTIVE | PAUSED | RETIRED
    description = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    strategy = relationship("AiStrategy")
    versions = relationship("AiModelVersion", back_populates="model", cascade="all, delete-orphan")


class AiModelVersion(Base):
    __tablename__ = "ai_model_versions"

    id = Column(Integer, primary_key=True, index=True)
    model_id = Column(Integer, ForeignKey("ai_models.id"), nullable=False, index=True)
    version = Column(String(30), nullable=False)  # v1.0.0
    status = Column(String(30), nullable=False, default="DRAFT")
    # DRAFT | TESTING | VALIDATING | PAPER_TRADING | APPROVED | PRODUCTION | REJECTED | RETIRED
    strategy_id = Column(Integer, ForeignKey("ai_strategies.id"), nullable=True)
    parameters = Column(JSON)
    features = Column(JSON)
    training_period = Column(String(100))
    dataset = Column(String(200))
    algorithms = Column(JSON)
    validation = Column(JSON)
    change_reason = Column(Text)
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    promoted_at = Column(DateTime(timezone=True), nullable=True)
    retired_at = Column(DateTime(timezone=True), nullable=True)

    model = relationship("AiModel", back_populates="versions")
    strategy = relationship("AiStrategy")


class AiPortfolio(Base):
    __tablename__ = "ai_portfolios"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    currency = Column(String(10), nullable=False, default="XOF")
    cash = Column(Float, nullable=False, default=0)
    initial_value = Column(Float, nullable=True)
    strategy_id = Column(Integer, ForeignKey("ai_strategies.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    strategy = relationship("AiStrategy")


class AiPosition(Base):
    __tablename__ = "ai_positions"
    __table_args__ = (
        UniqueConstraint("portfolio_id", "company_id", name="uq_ai_positions_portfolio_company"),
    )

    id = Column(Integer, primary_key=True, index=True)
    portfolio_id = Column(Integer, ForeignKey("ai_portfolios.id"), nullable=False, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    symbol = Column(String(20), nullable=False)
    quantity = Column(Float, nullable=False, default=0)
    avg_price = Column(Float, nullable=False, default=0)
    current_price = Column(Float, nullable=True)
    allocation_pct = Column(Float, nullable=True)
    sector = Column(String(60), nullable=True)
    entry_date = Column(DateTime(timezone=True), server_default=func.now())
    exit_date = Column(DateTime(timezone=True), nullable=True)
    status = Column(String(20), nullable=False, default="OPEN")  # OPEN | CLOSED

    portfolio = relationship("AiPortfolio")
    company = relationship("Company")


class AiDecision(Base):
    __tablename__ = "ai_decisions"

    id = Column(Integer, primary_key=True, index=True)
    version_id = Column(Integer, ForeignKey("ai_model_versions.id"), nullable=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    decision_type = Column(String(20), nullable=False)  # BUY | SELL | HOLD | REBALANCE | CASH
    status = Column(String(20), nullable=False, default="PROPOSED")
    # PROPOSED | APPROVED | REJECTED | MODIFIED | EXECUTED
    confidence = Column(Float, nullable=True)
    risk_level = Column(String(20), nullable=True)  # LOW | MODERATE | HIGH
    horizon = Column(String(30), nullable=True)  # 6-18 MONTHS...
    allocation_target = Column(Float, nullable=True)
    price_at_decision = Column(Float, nullable=True)
    regime = Column(String(30), nullable=True)  # BULL | BEAR | SIDEWAYS | HIGH_VOLATILITY | ...
    score = Column(JSON)
    summary = Column(Text)
    evaluated = Column(Boolean, nullable=False, default=False)
    outcome = Column(Float, nullable=True)  # realised return since decision (0..1)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    version = relationship("AiModelVersion")
    company = relationship("Company")
    factors = relationship("AiDecisionFactor", back_populates="decision", cascade="all, delete-orphan")


class AiDecisionFactor(Base):
    __tablename__ = "ai_decision_factors"

    id = Column(Integer, primary_key=True, index=True)
    decision_id = Column(Integer, ForeignKey("ai_decisions.id"), nullable=False, index=True)
    factor = Column(String(80), nullable=False)
    category = Column(String(50), nullable=False)  # fundamental | technical | quality | momentum | risk | valuation
    score = Column(Float, nullable=True)
    weight = Column(Float, nullable=True)
    direction = Column(String(10), nullable=False, default="positive")  # positive | negative
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    decision = relationship("AiDecision", back_populates="factors")


class AiOrder(Base):
    __tablename__ = "ai_orders"

    id = Column(Integer, primary_key=True, index=True)
    portfolio_id = Column(Integer, ForeignKey("ai_portfolios.id"), nullable=False, index=True)
    decision_id = Column(Integer, ForeignKey("ai_decisions.id"), nullable=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)
    side = Column(String(10), nullable=False)  # BUY | SELL
    symbol = Column(String(20), nullable=False)
    quantity = Column(Float, nullable=False, default=0)
    limit_price = Column(Float, nullable=True)
    status = Column(String(20), nullable=False, default="PENDING")
    # PENDING | FILLED | CANCELLED | REJECTED
    environment = Column(String(20), nullable=False, default="SIMULATION")  # SIMULATION | LIVE_INTERNAL
    reason = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    portfolio = relationship("AiPortfolio")


class AiExecution(Base):
    __tablename__ = "ai_executions"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("ai_orders.id"), nullable=False, index=True)
    price = Column(Float, nullable=False)
    quantity = Column(Float, nullable=False)
    fee = Column(Float, nullable=False, default=0)
    slippage = Column(Float, nullable=False, default=0)
    executed_at = Column(DateTime(timezone=True), server_default=func.now())

    order = relationship("AiOrder")


class AiPerformanceSnapshot(Base):
    __tablename__ = "ai_performance_snapshots"
    __table_args__ = (
        UniqueConstraint("portfolio_id", "date", name="uq_ai_performance_portfolio_date"),
    )

    id = Column(Integer, primary_key=True, index=True)
    portfolio_id = Column(Integer, ForeignKey("ai_portfolios.id"), nullable=False, index=True)
    date = Column(DateTime, nullable=False, index=True)
    value = Column(Float, nullable=False, default=0)
    cash = Column(Float, nullable=False, default=0)
    invested = Column(Float, nullable=False, default=0)
    benchmark_value = Column(Float, nullable=True)
    return_1d = Column(Float, nullable=True)
    return_since_launch = Column(Float, nullable=True)
    drawdown = Column(Float, nullable=True)

    portfolio = relationship("AiPortfolio")


class AiRiskSnapshot(Base):
    __tablename__ = "ai_risk_snapshots"
    __table_args__ = (
        UniqueConstraint("portfolio_id", "date", name="uq_ai_risk_portfolio_date"),
    )

    id = Column(Integer, primary_key=True, index=True)
    portfolio_id = Column(Integer, ForeignKey("ai_portfolios.id"), nullable=False, index=True)
    date = Column(DateTime, nullable=False, index=True)
    volatility = Column(Float, nullable=True)
    max_drawdown = Column(Float, nullable=True)
    sharpe_ratio = Column(Float, nullable=True)
    sortino_ratio = Column(Float, nullable=True)
    beta = Column(Float, nullable=True)
    downside_deviation = Column(Float, nullable=True)
    var_95 = Column(Float, nullable=True)
    cvar_95 = Column(Float, nullable=True)
    risk_score = Column(Float, nullable=True)

    portfolio = relationship("AiPortfolio")


class AiBacktest(Base):
    __tablename__ = "ai_backtests"

    id = Column(Integer, primary_key=True, index=True)
    strategy_id = Column(Integer, ForeignKey("ai_strategies.id"), nullable=True)
    version_id = Column(Integer, ForeignKey("ai_model_versions.id"), nullable=True)
    period_start = Column(DateTime, nullable=True)
    period_end = Column(DateTime, nullable=True)
    dataset = Column(String(200))
    status = Column(String(20), nullable=False, default="QUEUED")  # QUEUED | RUNNING | COMPLETED | FAILED
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)


class AiBacktestResult(Base):
    __tablename__ = "ai_backtest_results"

    id = Column(Integer, primary_key=True, index=True)
    backtest_id = Column(Integer, ForeignKey("ai_backtests.id"), nullable=False, index=True)
    metrics = Column(JSON)
    benchmark_name = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    backtest = relationship("AiBacktest")


class AiEvolutionEvent(Base):
    __tablename__ = "ai_evolution_events"

    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String(40), nullable=False, index=True)
    # PERFORMANCE_ANALYSIS | ERROR_ANALYSIS | LEARNING_SIGNAL | CANDIDATE_CREATED |
    # BACKTEST_COMPLETED | VALIDATION | MODEL_APPROVED | MODEL_REJECTED |
    # MODEL_PROMOTED | MODEL_RETIRED | AI_PAUSED | AI_RESUMED
    version_from = Column(String(30), nullable=True)
    version_to = Column(String(30), nullable=True)
    detail = Column(Text)
    payload = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AiHealthSnapshot(Base):
    __tablename__ = "ai_health_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(DateTime, nullable=False, index=True)
    data_health = Column(Float, nullable=True)
    model_health = Column(Float, nullable=True)
    risk_health = Column(Float, nullable=True)
    execution_health = Column(Float, nullable=True)
    system_health = Column(Float, nullable=True)
    global_status = Column(String(20), nullable=False, default="OPERATIONAL")
    # OPERATIONAL | DEGRADED | PAUSED
    details = Column(JSON, nullable=True)


class AiBenchmark(Base):
    __tablename__ = "ai_benchmarks"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    code = Column(String(30), nullable=False, unique=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AiAuditLog(Base):
    __tablename__ = "ai_audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String(50), nullable=False, index=True)
    entity_type = Column(String(50), nullable=True)
    entity_id = Column(Integer, nullable=True)
    actor = Column(String(100), nullable=True)
    detail = Column(Text, nullable=True)
    payload = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AiDataQuality(Base):
    __tablename__ = "ai_data_quality"

    id = Column(Integer, primary_key=True, index=True)
    source = Column(String(100), nullable=False)
    check_date = Column(DateTime, nullable=False, index=True)
    freshness = Column(Float, nullable=True)
    completeness = Column(Float, nullable=True)
    status = Column(String(20), nullable=False, default="OK")  # OK | WARN | CRITICAL
    details = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AiRiskConfig(Base):
    """Limites de risque configurables du Risk Engine (une seule ligne active)."""

    __tablename__ = "ai_risk_configs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False, default="DEFAULT")
    limits = Column(JSON, nullable=False)
    active = Column(Boolean, nullable=False, default=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class AiStressTest(Base):
    """Journal des stress tests exécutés par le Risk Engine."""

    __tablename__ = "ai_stress_tests"

    id = Column(Integer, primary_key=True, index=True)
    scenario = Column(String(60), nullable=False, index=True)
    date = Column(DateTime, nullable=False, index=True)
    impact_pct = Column(Float, nullable=True)
    impact_amount = Column(Float, nullable=True)
    metrics = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AiAlert(Base):
    """Alertes AI (décisions fortes, franchissement de limites de risque)."""

    __tablename__ = "ai_alerts"

    id = Column(Integer, primary_key=True, index=True)
    alert_type = Column(String(50), nullable=False, index=True)
    # DECISION | RISK_LIMIT | STRESS | SYSTEM
    severity = Column(String(20), nullable=False, default="INFO")  # INFO | WARNING | CRITICAL
    title = Column(String(160), nullable=False)
    body = Column(Text, default="")
    link = Column(String(200), nullable=True)
    payload = Column(JSON, nullable=True)
    email_sent = Column(Boolean, nullable=False, default=False)
    read = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
