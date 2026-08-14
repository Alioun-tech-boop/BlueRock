"""Synchronisation des comptes courtiers liés (Broker Connect).

La plateforme est la source d'activité : chaque exécution d'ordre sur un
portefeuille réel (courtier) est poussée vers le registre du courtier
(`broker_client_accounts` : liquidités + positions), exactement comme le
courtier enregistrerait les mouvements sur le compte titres de son client.
"""

import json
import time
from datetime import datetime

from sqlalchemy.orm import Session

from ..models.broker_connect import BrokerClientAccount
from ..models.user import Position, Portfolio


def broker_ref_for(portfolio: Portfolio) -> str:
    """Référence d'ordre côté courtier : traçable et unique."""
    short = (portfolio.broker_name or "BRK")[:3].upper()
    return f"{short}-{portfolio.broker_client_id}-{int(time.time() * 1000)}"


def portfolio_holdings(db: Session, portfolio_id: int) -> list[dict]:
    positions = db.query(Position).filter(
        Position.portfolio_id == portfolio_id, Position.qty > 0
    ).all()
    return [{"symbol": p.symbol, "qty": p.qty, "avg_price": p.avg_price}
            for p in positions]


def sync_broker_account(db: Session, portfolio: Portfolio | None) -> bool:
    """Pousse l'état du portefeuille vers le compte courtier lié.
    Retourne True si une mise à jour a eu lieu."""
    if not portfolio or not portfolio.broker_client_id:
        return False
    account = db.query(BrokerClientAccount).filter(
        BrokerClientAccount.id == portfolio.broker_client_id
    ).first()
    if not account:
        return False
    account.cash_balance = portfolio.balance or 0
    account.holdings = json.dumps(portfolio_holdings(db, portfolio.id))
    account.last_sync_at = datetime.utcnow()
    return True
