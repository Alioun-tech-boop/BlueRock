from pydantic import BaseModel, Field

RISK_LEVELS = ("conservative", "balanced", "growth")
PLAN_TYPES = ("epargne", "retraite", "etudes", "succession")


class PremiumPlanRequest(BaseModel):
    amount: float = Field(gt=0, le=1e12, description="Capital à investir en FCFA")
    monthly: float = Field(default=0, ge=0, le=1e9, description="Versement mensuel en FCFA")
    horizon_years: int = Field(default=5, ge=1, le=30, description="Horizon en années")
    risk_level: str = Field(default="balanced", description="conservative | balanced | growth")
    plan_type: str = Field(default="epargne", description="epargne | retraite | etudes | succession")
