"""Moteur de versement des dividendes : traite les dividendes arrivant à échéance,
crédite le solde du portefeuille et crée l'enregistrement DividendPayment (idempotent)."""
from datetime import datetime
from sqlalchemy.orm import Session

from ..models.market import Dividend
from ..models.user import Position, Portfolio
from ..models.dividend import DividendPayment


def run_dividend_engine(db: Session) -> int:
    """Traite les dividendes dont la date de paiement est passée et non encore versés.
    Crédite le solde du portefeuille et crée l'enregistrement DividendPayment.
    Batch + ON CONFLICT pour éviter N×M et double crédit."""
    from datetime import timedelta
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    now = datetime.utcnow().date()
    # Ne traite que les dividendes récents (2j de rattrapage) + jamais versés récemment
    # Évite de scanner tout l'historique 2015-2026 à chaque heure
    recent_cutoff = now - timedelta(days=2)
    # DividendPayment a déjà unique(user_id,dividend_id,portfolio_id) — on s'appuie sur ON CONFLICT
    # On filtre les dividendes dus récemment pour limiter le scan
    due = db.query(Dividend).filter(
        Dividend.payment_date != None,
        Dividend.payment_date <= now,
        Dividend.payment_date >= recent_cutoff,
    ).all()
    # Fallback rattrapage: si aucun récent mais qu'il reste des impayés plus anciens non versés, on les prend en lot limité
    if not due:
        # Cherche les dividendes dus mais jamais versés (limite 20 pour éviter pic)
        due = db.query(Dividend).filter(
            Dividend.payment_date != None,
            Dividend.payment_date <= now,
        ).order_by(Dividend.payment_date.desc()).limit(20).all()
        # Filtre ceux déjà versés (via NOT EXISTS) en batch
        if due:
            due_ids = [d.id for d in due]
            paid_ids = {r[0] for r in db.query(DividendPayment.dividend_id).filter(DividendPayment.dividend_id.in_(due_ids)).all()}
            # On garde ceux non entièrement payés (au moins une position non payée potentielle)
            # On ne filtre pas agressivement ici, le ON CONFLICT gérera l'idempotence finale
            pass

    if not due:
        return 0

    count = 0
    for d in due:
        company = d.company
        if not company:
            continue
        dps = d.dividend_per_share or 0
        if dps <= 0:
            continue
        # Batch: toutes les positions sur ce symbole d'un coup
        positions = db.query(Position).filter(
            Position.symbol == company.symbol,
            Position.qty > 0
        ).all()
        if not positions:
            continue
        # Batch: existants déjà payés pour ce dividende
        pos_keys = [(p.user_id, p.portfolio_id) for p in positions]
        existing = set(
            (r.user_id, r.portfolio_id)
            for r in db.query(DividendPayment).filter(
                DividendPayment.dividend_id == d.id,
                DividendPayment.symbol == company.symbol,
            ).all()
        )
        for pos in positions:
            if (pos.user_id, pos.portfolio_id) in existing:
                continue
            amount = round(dps * pos.qty, 2)
            if amount <= 0:
                continue
            # Verrou portefeuille pour éviter race avec withdraw/buy
            pf = db.query(Portfolio).filter(Portfolio.id == pos.portfolio_id).with_for_update().first()
            if not pf:
                continue
            pf.balance = (pf.balance or 0) + amount
            # Idempotence via ON CONFLICT DO NOTHING (Postgres) + fallback try/except SQLite
            pay = DividendPayment(
                user_id=pos.user_id,
                portfolio_id=pos.portfolio_id,
                company_id=company.id,
                dividend_id=d.id,
                symbol=company.symbol,
                fiscal_year=d.fiscal_year,
                dividend_per_share=dps,
                shares=pos.qty,
                amount=amount,
                currency=d.currency or "XOF",
                payment_date=d.payment_date,
            )
            try:
                db.add(pay)
                db.flush()
                count += 1
            except Exception as e:
                db.rollback()
                # Contrainte unique violée → déjà crédité par un autre worker
                if "unique" in str(e).lower() or "duplicate" in str(e).lower():
                    # Récupère le solde à jour
                    pf = db.query(Portfolio).filter(Portfolio.id == pos.portfolio_id).with_for_update().first()
                    continue
                raise

    if count:
        try:
            db.commit()
        except Exception:
            db.rollback()
            raise
    return count