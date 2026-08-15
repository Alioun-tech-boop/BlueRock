import json
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from ..models.planning import PremiumPlan, PremiumSnapshot, Notification
from ..models.user import Position, User
from ..models.company import Company
from ..models.analysis import ScoreCard, Valuation
from ..models.ratios import FinancialRatio

DATE_FMT = "%Y-%m-%d"


def _latest_prices(db: Session) -> dict[str, float]:
    """Dernier cours par symbole, en 1 requête (cache partagé 5 s)."""
    from ..services.prices import latest_prices
    return latest_prices(db)


def _close_pairs(db: Session) -> dict[str, list[float]]:
    """Les 2 derniers cours par symbole (dernier puis veille), en 1 requête."""
    from sqlalchemy import text
    rows = db.execute(text(
        "SELECT symbol, close_price, rn FROM ("
        "  SELECT co.symbol AS symbol, md.close_price AS close_price, "
        "         ROW_NUMBER() OVER (PARTITION BY md.company_id ORDER BY md.date DESC) AS rn "
        "  FROM market_data md JOIN companies co ON co.id = md.company_id "
        "  WHERE md.close_price IS NOT NULL"
        ") t WHERE rn <= 2"
    )).all()
    out: dict[str, list[float]] = {}
    for r in rows:
        out.setdefault(r[0], []).append(float(r[1]))
    return out


def _latest_scores(db: Session, symbols: list[str]) -> dict[str, dict]:
    """Scorecard + valuation les plus récentes par symbole (bulk)."""
    from sqlalchemy import text
    if not symbols:
        return {}
    out: dict[str, dict] = {}
    sc_rows = db.execute(text(
        "SELECT DISTINCT ON (c.symbol) c.symbol, sc.total_score, sc.rating "
        "FROM scorecards sc JOIN companies c ON c.id = sc.company_id "
        "WHERE c.symbol = ANY(:syms) ORDER BY c.symbol, sc.fiscal_year DESC"
    ), {"syms": symbols}).all()
    for r in sc_rows:
        out.setdefault(r[0], {})["score"] = float(r[1]) if r[1] is not None else None
        out.setdefault(r[0], {})["rating"] = r[2]
    val_rows = db.execute(text(
        "SELECT DISTINCT ON (c.symbol) c.symbol, v.target_price, v.discount_percent "
        "FROM valuations v JOIN companies c ON c.id = v.company_id "
        "WHERE c.symbol = ANY(:syms) ORDER BY c.symbol, v.fiscal_year DESC"
    ), {"syms": symbols}).all()
    for r in val_rows:
        out.setdefault(r[0], {})["target_price"] = float(r[1]) if r[1] else None
        out.setdefault(r[0], {})["discount"] = float(r[2]) if r[2] is not None else None
    return out


def _notify(db: Session, plan: PremiumPlan, ntype: str, title: str, body: str,
            dedupe_hours: int | None = 24):
    """Crée une notification avec déduplication (même type dans la fenêtre → ignoré).
    Les alertes de plan sont aussi envoyées par email (arrière-plan) si l'utilisateur
    a activé le canal email."""
    from ..models.planning import Notification
    if dedupe_hours:
        since = datetime.now() - timedelta(hours=dedupe_hours)
        exists = db.query(Notification).filter(
            Notification.user_id == plan.user_id,
            Notification.type == ntype,
            Notification.created_at >= since,
        ).first()
        if exists:
            return
    else:
        exists = db.query(Notification).filter(
            Notification.user_id == plan.user_id, Notification.type == ntype
        ).first()
        if exists:
            return
    n = Notification(
        user_id=plan.user_id,
        type=ntype,
        title=title,
        body=body,
        link="/patrimoine",
    )
    db.add(n)
    db.flush()
    db.refresh(n)

    # Canal email : en arrière-plan pour ne pas ralentir le suivi
    if ntype.startswith("plan"):
        user = db.query(User).filter(User.id == plan.user_id).first()
        if user and user.email_notif_enabled:
            nid = n.id

            def _send():
                from ..core.email import send_notification_email
                try:
                    ok = send_notification_email(user.email, title, body)
                    if ok:
                        from ..database import SessionLocal
                        import time
                        # Retry : la ligne n'est peut-être pas encore commitée par l'appelant
                        for _ in range(10):
                            dbs = SessionLocal()
                            try:
                                cnt = dbs.query(Notification).filter(
                                    Notification.id == nid).update(
                                    {"email_sent": True}, synchronize_session=False)
                                dbs.commit()
                            finally:
                                dbs.close()
                            if cnt:
                                return
                            time.sleep(0.5)
                except Exception as e:
                    import logging
                    logging.getLogger(__name__).warning(f"Notification email error: {e}")

            import threading
            threading.Thread(target=_send, daemon=True).start()


def _plan_allocation(plan: PremiumPlan) -> dict:
    try:
        snap = json.loads(plan.allocation_snapshot or "{}")
        return snap if isinstance(snap, dict) else {}
    except Exception:
        return {}


def track_plan(db: Session, plan: PremiumPlan) -> dict:
    """Revalorise un plan actif avec les cours du jour, archive un snapshot
    (1/jour) et génère les alertes. Retourne le résultat du suivi."""
    now = datetime.now()
    today = now.strftime(DATE_FMT)
    result = {"tracked": False, "snapshot": False, "alerts": 0, "completed": False}

    if plan.status == "active" and plan.matured_at and now >= plan.matured_at:
        plan.status = "completed"
        plan.completed_at = now
        _notify(db, plan, "plan_completed", "Plan arrivé à terme 🎯",
                f"Votre plan patrimonial est arrivé à échéance. Consultez votre performance finale.", None)
        result["completed"] = True
        db.commit()
        return result

    if plan.status != "active":
        return result

    snap = _plan_allocation(plan)
    allocation = snap.get("allocation") or []
    if not allocation:
        return result

    prices = _latest_prices(db)
    pairs = _close_pairs(db)
    invested = snap.get("invested") or 0
    cash_buffer = snap.get("cash_buffer") or 0

    # Apports mensuels cumulés depuis l'émission (modèle du plan)
    months_elapsed = 0
    if plan.monthly and plan.monthly > 0 and plan.issued_at:
        months_elapsed = int(max((now - plan.issued_at).days, 0) // 30)
        months_elapsed = min(months_elapsed, plan.horizon_years * 12)
    contributions = invested + cash_buffer + plan.monthly * months_elapsed

    value = cash_buffer + plan.monthly * months_elapsed
    priced = []
    for a in allocation:
        px = prices.get(a.get("symbol"))
        if not px:
            px = a.get("current_price")
        shares = a.get("shares") or 0
        value += shares * (px or 0)
        priced.append((a, px))

    pnl_pct = ((value - contributions) / contributions * 100) if contributions > 0 else 0.0

    prev = db.query(PremiumSnapshot).filter(
        PremiumSnapshot.plan_id == plan.id
    ).order_by(PremiumSnapshot.date.desc()).first()
    day_change = None
    if prev:
        day_change = ((value - prev.value) / prev.value * 100) if prev.value else 0.0

    # Snapshot journalier (1 par jour)
    last_today = prev and prev.date.strftime(DATE_FMT) == today
    if not last_today:
        db.add(PremiumSnapshot(
            plan_id=plan.id, date=now,
            value=round(value, 2), invested=round(contributions, 2),
            pnl_pct=round(pnl_pct, 2), day_change_pct=round(day_change, 2) if day_change is not None else None,
        ))
        result["snapshot"] = True

    plan.last_value = round(value, 2)
    plan.last_pnl_pct = round(pnl_pct, 2)
    plan.last_day_change_pct = round(day_change, 2) if day_change is not None else None
    plan.last_tracked_at = now

    scores = _latest_scores(db, [a.get("symbol") for a in allocation])

    # ---- Alertes par ligne ----
    for a, px in priced:
        symbol = a.get("symbol")
        entry = a.get("current_price")
        fair = a.get("fair_value")
        if not px or not entry or entry <= 0:
            continue

        # 1. Objectif atteint (cours ≥ valeur intrinsèque)
        if fair and fair > 0 and px >= fair:
            _notify(db, plan, f"plan_target_{symbol}", f"Objectif atteint sur {symbol}",
                    f"Le cours de {symbol} ({px:,.0f} FCFA) a rejoint la valeur intrinsèque "
                    f"estimée ({fair:,.0f} FCFA). Envisagez de prendre vos bénéfices.",
                    None)
            result["alerts"] += 1

        # 2. Forte variation sur la dernière séance
        prev_px = (pairs.get(symbol) or [None, None])[1]
        if prev_px and prev_px > 0:
            dchg = (px - prev_px) / prev_px * 100
            if abs(dchg) >= 3.0:
                sign = "+" if dchg > 0 else ""
                _notify(db, plan, f"plan_move_{symbol}", f"Mouvement fort : {symbol} {sign}{dchg:.1f}%",
                        f"{symbol} a varié de {sign}{dchg:.1f}% en une séance "
                        f"({prev_px:,.0f} → {px:,.0f} FCFA).")
                result["alerts"] += 1

        # 3. Opportunité : décote accentuée
        sc = scores.get(symbol) or {}
        if sc.get("target_price") and px > 0:
            discount = (sc["target_price"] - px) / px * 100
            if discount >= 30:
                _notify(db, plan, f"plan_discount_{symbol}", f"Opportunité d'achat sur {symbol}",
                        f"{symbol} se négocie avec une décote de {discount:.0f}% face à sa "
                        f"valeur intrinsèque ({sc['target_price']:,.0f} FCFA).", None)
                result["alerts"] += 1

        # 4. Dégradation du score de qualité
        if sc.get("score") is not None and sc["score"] < 5:
            _notify(db, plan, f"plan_rating_{symbol}", f"Qualité en baisse : {symbol}",
                    f"Le score de qualité de {symbol} est tombé à {sc['score']:.1f}/10 "
                    f"(note {sc.get('rating') or 'N/A'}). Réévaluez la ligne.", None)
            result["alerts"] += 1

    # 5. Échéance proche
    if plan.matured_at and plan.matured_at - now <= timedelta(days=30) and plan.matured_at > now:
        _notify(db, plan, "plan_maturity_soon", "Votre plan arrive à échéance",
                f"Plus que {(plan.matured_at - now).days} jours avant la fin de votre plan patrimonial. "
                f"Préparez votre stratégie de sortie.", None)
        result["alerts"] += 1

    db.commit()
    result["tracked"] = True
    return result


def track_all_active(db: Session) -> dict:
    plans = db.query(PremiumPlan).filter(PremiumPlan.status == "active").all()
    total = {"plans": len(plans), "snapshots": 0, "alerts": 0, "completed": 0}
    for plan in plans:
        r = track_plan(db, plan)
        total["snapshots"] += 1 if r["snapshot"] else 0
        total["alerts"] += r["alerts"]
        total["completed"] += 1 if r["completed"] else 0
    return total


def coverage_of(db: Session, plan: PremiumPlan) -> dict:
    """Alignement du portefeuille réel sur l'allocation cible du plan.
    Les cibles sont recalculées avec l'argent disponible sur le compte géré."""
    from ..services.rebalancer import adaptive_targets, managed_account
    prices = _latest_prices(db)
    account = managed_account(db, plan)
    if account is None:
        return {"coverage_pct": 0.0, "lines": []}
    positions = {p.symbol: p.qty for p in db.query(Position).filter(
        Position.user_id == plan.user_id, Position.portfolio_id == account.id
    ).all()}

    lines = []
    total_target = 0.0
    total_held = 0.0
    for t in adaptive_targets(db, plan, account, prices):
        symbol = t["symbol"]
        px = t["px"]
        target_shares = t["target_shares"]
        held_qty = positions.get(symbol, 0) or 0
        target_value = target_shares * px
        held_value = min(held_qty, target_shares) * px
        total_target += target_value
        total_held += held_value
        lines.append({
            "symbol": symbol,
            "target_shares": target_shares,
            "held_qty": held_qty,
            "aligned_pct": round(held_value / target_value * 100, 1) if target_value > 0 else 0.0,
        })
    pct = round(total_held / total_target * 100, 1) if total_target > 0 else 0.0
    return {"coverage_pct": pct, "lines": lines}
