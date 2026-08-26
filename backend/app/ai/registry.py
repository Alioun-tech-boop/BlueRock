"""Registre des modèles, versions et features de Bluerock AI (lecture)."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import AiFeature, AiModel, AiModelVersion

FEATURES = [
    ("fundamental", "fundamental", "Fondamentaux", "Ratios de rentabilité, levier, liquidité et croissance de l'exercice le plus récent."),
    ("quality", "fundamental", "Qualité", "Moat, rentabilité et score qualité du scorecard de la société."),
    ("momentum", "technical", "Momentum", "Tendance de prix 1M/3M/6M/12M calculée sur les cours réels BRVM."),
    ("valuation", "fundamental", "Valorisation", "PE, PB, rendement du dividende et écart au prix cible."),
    ("risk", "risk", "Risque", "Volatilité, bêta et drawdown ; la composante risque réduit le score composite."),
]


def seed_features(db: Session) -> None:
    existing = {f.code for f in db.execute(select(AiFeature)).scalars()}
    for code, category, name, desc in FEATURES:
        if code not in existing:
            db.add(AiFeature(code=code, category=category, name=name, description=desc, default_weight=1.0))
    db.commit()


def get_features(db: Session) -> list[dict]:
    seed_features(db)
    return [
        {
            "code": f.code,
            "name": f.name,
            "description": f.description,
            "category": f.category,
            "default_weight": f.default_weight,
        }
        for f in db.execute(select(AiFeature).order_by(AiFeature.id)).scalars()
    ]


def get_registry(db: Session) -> dict:
    models = db.execute(select(AiModel).order_by(AiModel.id)).scalars().all()
    return {
        "models": [
            {
                "id": m.id,
                "name": m.name,
                "model_type": m.model_type,
                "status": m.status,
                "description": m.description,
                "versions": [
                    {
                        "id": v.id,
                        "version": v.version,
                        "status": v.status,
                        "parameters": v.parameters,
                        "features": v.features,
                        "dataset": v.dataset,
                        "algorithms": v.algorithms,
                        "validation": v.validation,
                        "change_reason": v.change_reason,
                        "created_at": v.created_at.isoformat() if v.created_at else None,
                        "promoted_at": v.promoted_at.isoformat() if v.promoted_at else None,
                    }
                    for v in sorted(m.versions, key=lambda x: x.created_at or x.id)
                ],
            }
            for m in models
        ],
        "features": get_features(db),
    }
