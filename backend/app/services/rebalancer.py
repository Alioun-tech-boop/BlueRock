"""Rééquilibrage automatique du portefeuille vers l'allocation cible d'un plan.

Lorsqu'un plan patrimonial est lié au portefeuille (gestion automatique),
ce module passe des ordres de marché pour aligner les positions réelles
sur l'allocation du plan. Les quantités cibles ne sont PAS celles figées à
l'émission : elles sont recalculées à chaque passe à partir de l'argent
réellement disponible sur le compte géré (solde + investi), multiplié par
les pondérations du plan. Le plan s'adapte ainsi automatiquement aux dépôts,
retraits et variations de cours du portefeuille.
"""
import json
from datetime import datetime

from sqlalchemy.orm import Session

from ..models.planning import PremiumPlan
from ..models.user import Position, Order, Portfolio, UserPortfolio
from ..routers.portfolio import DEMO_INVEST_LIMIT, demo_capacity_used, _default_portfolio

# Valeur minimale d'un écart pour déclencher un ordre en mode automatique
# (le bouton manuel « Rééquilibrer » ignore ce seuil).
MIN_TRADE_VALUE = 10_000  # FCFA


def _plan_weights(plan: PremiumPlan) -> tuple[list[dict], float]:
    """Pondérations normalisées de l'allocation + part de liquidité du plan."""
    try:
        snap = json.loads(plan.allocation_snapshot or "{}")
    except Exception:
        snap = {}
    allocation = (snap or {}).get("allocation") or []
    amount = snap.get("amount") or 0
    cash = snap.get("cash_buffer") or 0
    cash_pct = (cash / amount) if amount and amount > 0 else 0.10
    weights = []
    for a in allocation:
        w = a.get("weight_percent")
        symbol = a.get("symbol")
        if isinstance(w, (int, float)) and w > 0 and symbol:
            weights.append({"symbol": symbol, "weight": float(w)})
    total = sum(x["weight"] for x in weights) or 1.0
    for x in weights:
        x["weight"] = x["weight"] / total
    return weights, cash_pct


def managed_account(db: Session, plan: PremiumPlan) -> Portfolio:
    """Portefeuille géré par le plan (sous-portefeuille choisi à la liaison)."""
    if plan.managed_portfolio_id:
        pf = db.query(Portfolio).filter(
            Portfolio.id == plan.managed_portfolio_id, Portfolio.id.in_(
                [up.portfolio_id for up in db.query(UserPortfolio)
                 .filter(UserPortfolio.user_id == plan.user_id).all()]
            )
        ).first()
        if pf:
            return pf
    return _default_portfolio(db, plan.user_id)


def _account_market_value(db: Session, portfolio_id: int, prices: dict[str, float]) -> float:
    """Valeur de marché du portefeuille : cours du jour (fallback prix moyen)."""
    total = 0.0
    rows = db.query(Position).filter(
        Position.portfolio_id == portfolio_id, Position.qty > 0
    ).all()
    for p in rows:
        px = prices.get(p.symbol) or p.avg_price or 0
        total += (p.qty or 0) * px
    return total


def adaptive_targets(db: Session, plan: PremiumPlan, account: Portfolio | None = None,
                     prices: dict[str, float] | None = None) -> list[dict]:
    """Recalcule les quantités cibles de l'allocation avec l'argent
    disponible sur le compte géré : valeur du compte × pondérations du plan,
    moins la réserve de liquidité (cash buffer). La valeur du compte est
    évaluée au cours du jour (cohérent avec le suivi du plan)."""
    account = account or managed_account(db, plan)
    prices = prices or _latest_prices(db)
    account_value = (account.balance or 0) + _account_market_value(db, account.id, prices)
    weights, cash_pct = _plan_weights(plan)
    invested_budget = account_value * (1 - cash_pct)
    targets = []
    for w in weights:
        px = prices.get(w["symbol"])
        if not px or px <= 0:
            continue
        target_value = invested_budget * w["weight"]
        targets.append({
            "symbol": w["symbol"],
            "target_shares": int(target_value // px),
            "px": px,
        })
    return targets


def _latest_prices(db: Session) -> dict[str, float]:
    from ..services.premium_tracking import _latest_prices as _prices
    return _prices(db)


def _apply(db: Session, user_id: int, portfolio_id: int | None, symbol: str, side: str, qty: float,
           px: float, plan_id: int, account: Portfolio | None = None) -> dict | None:
    """Exécute un ordre market sur la position (même logique que le moteur)."""
    pos = db.query(Position).filter(
        Position.user_id == user_id, Position.portfolio_id == portfolio_id, Position.symbol == symbol
    ).first()

    if side == "sell":
        if not pos or pos.qty < qty - 1e-9:
            return None
        remaining = pos.qty - qty
        if remaining <= 1e-9:
            db.delete(pos)
        else:
            pos.qty = remaining
        if account:
            account.balance = (account.balance or 0) + qty * px
    else:
        if account and (account.balance or 0) < qty * px - 1e-9:
            return None
        if not pos:
            pos = Position(user_id=user_id, portfolio_id=portfolio_id, symbol=symbol, qty=0, avg_price=0)
            db.add(pos)
        total_qty = pos.qty + qty
        pos.avg_price = ((pos.avg_price * pos.qty) + (px * qty)) / total_qty
        pos.qty = total_qty
        if account:
            account.balance = (account.balance or 0) - qty * px

    order = Order(
        user_id=user_id,
        portfolio_id=portfolio_id,
        symbol=symbol,
        side=side,
        qty=qty,
        price=px,
        order_type="market",
        status="executed",
        executed_at=datetime.utcnow(),
        plan_id=plan_id,
    )
    db.add(order)
    db.flush()
    return {"symbol": symbol, "side": side, "qty": qty, "price": px, "order_id": order.id}


def rebalance_portfolio(db: Session, plan: PremiumPlan, force: bool = False) -> dict:
    """Aligne le portefeuille géré par le plan sur son allocation cible.

    - Uniquement pour les plans actifs liés au portefeuille.
    - Les symboles déjà couverts par un ordre en attente sont ignorés.
    - Les positions hors allocation ne sont pas touchées.
    - Les quantités cibles sont recalculées à chaque passe selon l'argent
      disponible sur le compte géré (le plan suit le portefeuille).
    - force=True ignore le seuil de valeur minimale (bouton manuel).
    """
    result = {
        "enabled": bool(plan.linked_to_portfolio and plan.status == "active"),
        "orders": 0, "bought": [], "sold": [], "skipped": [], "errors": [],
    }
    if not result["enabled"]:
        return result

    account = managed_account(db, plan)
    if account is None:
        return result
    # La gestion automatique est réservée aux portefeuilles virtuels (démo)
    if account.type == "real":
        result["skipped"].append("real account not managed")
        return result

    allocation = _plan_allocation(plan)
    if not allocation:
        result["skipped"].append("no allocation")
        return result

    prices = _latest_prices(db)
    user_id = plan.user_id
    account_id = account.id
    positions = {
        p.symbol: (p.qty or 0)
        for p in db.query(Position).filter(
            Position.user_id == user_id, Position.portfolio_id == account_id
        ).all()
    }
    pending = {
        o.symbol for o in db.query(Order).filter(
            Order.user_id == user_id, Order.status == "pending",
            Order.portfolio_id == account_id,
        ).all()
    }

    used = demo_capacity_used(db, user_id)
    targets = adaptive_targets(db, plan, account, prices)

    for t in targets:
        symbol = t["symbol"]
        target = t["target_shares"]
        held = positions.get(symbol, 0) or 0
        px = t["px"]
        if not symbol or not px:
            result["skipped"].append(symbol or "?")
            continue
        if symbol in pending:
            result["skipped"].append(symbol)
            continue

        diff = target - held
        if abs(diff) < 1e-9:
            continue
        if abs(diff) * px < MIN_TRADE_VALUE and not force:
            continue

        if diff > 0:
            qty = int(diff)
            if qty < 1:
                continue
            # Capacité d'investissement démo + solde du compte : on plafonne la quantité
            budget = min(DEMO_INVEST_LIMIT - used, account.balance or 0)
            max_qty = int(budget // px) if budget > 0 else 0
            qty = min(qty, max_qty)
            if qty < 1:
                result["skipped"].append(symbol)
                continue
            used += qty * px
            out = _apply(db, user_id, account_id, symbol, "buy", qty, px, plan.id, account)
            if out:
                result["orders"] += 1
                result["bought"].append(out)
            else:
                result["errors"].append(symbol)
        else:
            qty = int(-diff)
            if qty < 1 or qty > held:
                continue
            out = _apply(db, user_id, account_id, symbol, "sell", qty, px, plan.id, account)
            if out:
                result["orders"] += 1
                result["sold"].append(out)
            else:
                result["errors"].append(symbol)

    db.commit()

    if result["orders"]:
        from .premium_tracking import _notify
        n_buy = len(result["bought"])
        n_sell = len(result["sold"])
        _notify(db, plan, "plan_rebalanced", "Portefeuille rééquilibré",
                f"Gestion automatique : {n_buy} achat(s) et {n_sell} vente(s) "
                f"passés pour aligner le portefeuille sur l'allocation du plan.", 6)
        db.commit()

    return result


def rebalance_linked(db: Session) -> dict:
    """Rééquilibre tous les plans actifs liés au portefeuille (job planifié)."""
    plans = db.query(PremiumPlan).filter(
        PremiumPlan.linked_to_portfolio.is_(True), PremiumPlan.status == "active"
    ).all()
    total = {"plans": len(plans), "orders": 0}
    for plan in plans:
        r = rebalance_portfolio(db, plan)
        total["orders"] += r["orders"]
    return total


def _plan_allocation(plan: PremiumPlan) -> list[dict]:
    try:
        snap = json.loads(plan.allocation_snapshot or "{}")
        return (snap or {}).get("allocation") or []
    except Exception:
        return []
