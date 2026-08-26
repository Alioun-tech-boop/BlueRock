"""Service ledger — écritures double entrée avec idempotence.

Utilisation :
    record_ledger_entries(db, user_id, [
        ("CASH_12", "DR", 50_000),   # sortie d'argent du portefeuille
        ("CASH_OUT", "CR", 50_000),  # contrepartie retrait
    ], ref_type="withdraw", ref_id="42")

Idempotence : la clé `{ref_type}:{ref_id}` est unique — un deuxième appel avec
la même référence est un no-op (retourne le statut "duplicate"). Cela protège
le grand livre contre les doubles crédits (webhook + re-vérification) et les
retries client.
"""
import logging

from sqlalchemy.orm import Session

from ..models.ledger import LedgerEntry
from ..models.user import Portfolio

logger = logging.getLogger(__name__)


def record_ledger_entries(db: Session, user_id: int, entries: list[tuple],
                          ref_type: str, ref_id: str,
                          portfolio_id: int | None = None,
                          currency: str = "XOF",
                          meta: dict | None = None) -> dict:
    """Journalise une transaction double entrée (idempotente).

    entries : liste de (account_code, "DR"|"CR", montant).
    Retourne {"status": "posted"} ou {"status": "duplicate"}.
    """
    if not entries:
        return {"status": "noop"}
    base_key = f"{ref_type}:{ref_id}"
    # Clé d'idempotence unique PAR écriture (DR/CR du même lot).
    entry_keys = [f"{base_key}:{account_code}:{entry_type}" for (account_code, entry_type, _amount) in entries]
    # Vérifie que TOUTES les clés existent (pas une seule) — sinon ledger déséquilibré si crash partiel
    existing_count = db.query(LedgerEntry.id).filter(
        LedgerEntry.idempotency_key.in_(entry_keys)
    ).count()
    if existing_count == len(entry_keys):
        return {"status": "duplicate"}
    if existing_count > 0:
        # Partiel: un précédent crash a inséré 1/2 écritures → on ne rejoue pas, on loggue l'anomalie
        import logging as _lg
        _lg.getLogger(__name__).warning(
            "Ledger partiel détecté pour %s:%s (%d/%d) — écritures manquantes ignorées",
            ref_type, ref_id, existing_count, len(entry_keys)
        )
        return {"status": "partial_duplicate"}
    for (account_code, entry_type, amount), k in zip(entries, entry_keys):
        if amount <= 0:
            continue
        db.add(LedgerEntry(
            user_id=user_id,
            portfolio_id=portfolio_id,
            account_code=account_code,
            entry_type=entry_type.upper(),
            amount=amount,
            currency=currency,
            ref_type=ref_type,
            ref_id=str(ref_id),
            idempotency_key=k,
            meta=meta or None,
        ))
    return {"status": "posted"}


def cash_net(portfolio: Portfolio) -> float:
    """Solde cash du portefeuille selon le grand livre (0 si vide)."""
    return portfolio.balance or 0


def journal_deposit(db: Session, user_id: int, portfolio_id: int, amount: float,
                    order_id: int, currency: str = "XOF") -> dict:
    """Dépôt crédité : CASH_<pf> est crédité, contrepartie CASH_IN débitée."""
    return record_ledger_entries(
        db, user_id,
        [(f"CASH_{portfolio_id}", "CR", amount), ("CASH_IN", "DR", amount)],
        ref_type="deposit_order", ref_id=str(order_id),
        portfolio_id=portfolio_id, currency=currency,
        meta={"order_id": order_id},
    )


def journal_withdraw(db: Session, user_id: int, portfolio_id: int, amount: float,
                     transaction_id: str, currency: str = "XOF") -> dict:
    """Retrait : CASH_<pf> débité, contrepartie CASH_OUT créditée."""
    return record_ledger_entries(
        db, user_id,
        [(f"CASH_{portfolio_id}", "DR", amount), ("CASH_OUT", "CR", amount)],
        ref_type="withdraw", ref_id=transaction_id,
        portfolio_id=portfolio_id, currency=currency,
    )


def journal_investment(db: Session, user_id: int, portfolio_id: int,
                       symbol: str, side: str, qty: float, price: float,
                       order_id: int, currency: str = "XOF") -> dict:
    """Achat/vente exécuté : cash du portefeuille débité/crédité, contrepartie
    INVEST_<pf> symétrique (le coût d'acquisition est neutralisé)."""
    value = round(qty * price, 2)
    if side == "buy":
        entries = [(f"CASH_{portfolio_id}", "DR", value), (f"INVEST_{portfolio_id}", "CR", value)]
    else:
        entries = [(f"CASH_{portfolio_id}", "CR", value), (f"INVEST_{portfolio_id}", "DR", value)]
    return record_ledger_entries(
        db, user_id, entries,
        ref_type="order", ref_id=f"{order_id}",
        portfolio_id=portfolio_id, currency=currency,
        meta={"symbol": symbol, "side": side, "qty": qty, "price": price},
    )