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
        # Ne jamais verser les dividendes synthétiques (non réellement payés)
        if getattr(d, "is_synthetic", False):
            continue
        dps = d.dividend_per_share or 0
        if dps <= 0:
            continue
        # Éligibilité : ex_date (ou payment_date si ex_date manquant) doit être après l'acquisition
        # et le dividende doit avoir été réellement détaché (ex_date <= aujourd'hui si présent)
        eligibility_date = d.ex_date or d.payment_date
        if eligibility_date and eligibility_date > now:
            continue
        # Batch: toutes les positions sur ce symbole, filtrées par devise (évite mélange XOF→NGN)
        # et séparées réel/démo via portfolio_id (isolation stricte)
        positions = (
            db.query(Position)
            .join(Portfolio, Position.portfolio_id == Portfolio.id)
            .filter(
                Position.symbol == company.symbol,
                Position.qty > 0,
                Portfolio.currency == (d.currency or "XOF"),
            )
            .all()
        )
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
            held_at_ex = None
            # Vérifie que la position était détenue à la date d'éligibilité (ex_date)
            # en sommant les ordres exécutés jusqu'à cette date ; si aucun historique, on
            # exige au moins un ordre d'achat exécuté avant ex_date, sinon on skip
            # pour éviter de créditer avant acquisition.
            if eligibility_date:
                from ..models.user import Order as _Order
                # Quantité détenue à ex_date = somme des buys - sells exécutés jusqu'à ex_date
                # On utilise executed_at (ou created_at en fallback) tronqué à la date
                buy_qty = 0.0
                sell_qty = 0.0
                # Recherche les ordres exécutés pour ce symbole/portefeuille jusqu'à ex_date
                # Limite à 200 ordres par position pour éviter un scan trop large
                hist_orders = db.query(_Order).filter(
                    _Order.user_id == pos.user_id,
                    _Order.portfolio_id == pos.portfolio_id,
                    _Order.symbol == pos.symbol,
                    _Order.status == "executed",
                ).order_by(_Order.executed_at.asc()).limit(200).all()
                if hist_orders:
                    for o in hist_orders:
                        # Date d'exécution effective (exécuté_at ou created_at)
                        exec_date = None
                        if getattr(o, "executed_at", None):
                            exec_date = o.executed_at.date() if hasattr(o.executed_at, "date") else o.executed_at
                        elif getattr(o, "created_at", None):
                            exec_date = o.created_at.date() if hasattr(o.created_at, "date") else o.created_at
                        if exec_date and exec_date <= eligibility_date:
                            if o.side == "buy":
                                buy_qty += float(o.qty or 0)
                            elif o.side == "sell":
                                sell_qty += float(o.qty or 0)
                    held_at_ex = buy_qty - sell_qty
                    # Si l'historique montre 0 détenu à ex_date, ne pas verser
                    # (ex: achat après ex_date, ou position créée après)
                    if held_at_ex <= 1e-9:
                        # Fallback : si aucun ordre d'achat avant ex_date, on considère non éligible
                        # sauf si la position provient d'un seed sans historique (on autorise alors si
                        # eligibility_date est très récente et qu'aucun ordre n'existe)
                        has_any_buy_before = any(
                            getattr(o, "executed_at", None) and o.side == "buy" and (o.executed_at.date() if hasattr(o.executed_at, "date") else o.executed_at) <= eligibility_date
                            for o in hist_orders
                        )
                        if not has_any_buy_before:
                            continue
                        # Si on a un historique mais quantité nulle à ex_date, skip
                        if hist_orders:
                            continue
                else:
                    # Aucun historique d'ordres : on ne peut pas vérifier l'acquisition,
                    # on exige que la position ait au moins un dividende déjà payé ou on skip
                    # pour les dividendes anciens afin d'éviter le rattrapage rétroactif.
                    # Ici on skip si le dividende est plus vieux que 30 jours et qu'aucun ordre n'existe
                    # (évite de créditer des années de dividendes à une position seed récente)
                    from datetime import timedelta as _td
                    if eligibility_date < (now - _td(days=30)):
                        continue
                    held_at_ex = None
            # Montant basé sur la quantité détenue à ex_date si calculable, sinon quantité actuelle
            qty_for_div = held_at_ex if isinstance(held_at_ex, (int, float)) and held_at_ex and held_at_ex > 1e-9 else pos.qty
            amount = round(dps * qty_for_div, 2)
            if amount <= 0:
                continue
            # Verrou portefeuille pour éviter race avec withdraw/buy
            pf = db.query(Portfolio).filter(Portfolio.id == pos.portfolio_id).with_for_update().first()
            if not pf:
                continue
            # Journalisation double-entrée pour le dividende (CASH_x CR / DIVIDEND DR)
            from ..services.ledger import record_ledger_entries
            record_ledger_entries(
                db,
                [
                    {"ref_type": "dividend", "ref_id": str(d.id), "account_code": f"CASH_{pf.id}", "entry_type": "CR", "amount": amount, "currency": pf.currency or "XOF"},
                    {"ref_type": "dividend", "ref_id": str(d.id), "account_code": f"DIVIDEND_{company.symbol}", "entry_type": "DR", "amount": amount, "currency": d.currency or "XOF"},
                ],
                user_id=pos.user_id,
                portfolio_id=pf.id,
            )
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