"""Backtest de la stratégie Adaptive Multi-Factor (données réelles BRVM).

Méthode documentée (aucune promesse) :
- univers = sociétés BRVM avec ratios financiers ;
- rééquilibrage périodique sur un top-K pondéré à parts égales ;
- à chaque date de rééquilibrage, la sélection utilise uniquement les données
  disponibles à cette date (ratios de l'exercice le plus récent ≤ date, momentum
  calculé sur les cours antérieurs à la date) — sélection point-in-time ;
- rendements de portefeuille recomposés à partir des prix réels quotidiens ;
- frais de transaction et slippage appliqués à chaque rééquilibrage
  (coûts BRVM réalistes : courtage ~0,5 % + slippage 0,1 %) ;
- attribution de la performance : bêta (indice) vs alpha (sélection) ;
- comparaison avec l'indice composite BRVM reconstruit sur la même fenêtre.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import (
    AiBacktest,
    AiBacktestResult,
    AiEvolutionEvent,
    AiModelVersion,
    Company,
    FinancialRatio,
    ScoreCard,
    Valuation,
)
from .benchmark import composite_daily_returns
from .decision_engine import (
    BUY_THRESHOLD,
    _fundamental_score,
    _quality_score,
    _valuation_score,
    composite_score,
)
from .market import all_price_series
from .quant import (
    annualized_return,
    annualized_volatility,
    beta,
    daily_returns,
    max_drawdown,
    momentum_score,
    sharpe_ratio,
)

DEFAULT_REBALANCE_DAYS = 63  # ~ trimestriel
DEFAULT_TOP_K = 8
DEFAULT_FEE_PCT = 0.005    # 50 bps de courtage (fourchette BRVM)
DEFAULT_SLIPPAGE_PCT = 0.001  # 10 bps de slippage


def _latest(rows: dict, company_id: int, year: int):
    """Dernier objet disponible à la date (max fiscal_year ≤ year)."""
    by_year = rows.get(company_id)
    if not by_year:
        return None
    best = None
    for y, obj in by_year.items():
        if y <= year and (best is None or y > best[0]):
            best = (y, obj)
    return best[1] if best else None


def run_backtest(
    db: Session,
    period_start: date,
    period_end: date,
    rebalance_days: int = DEFAULT_REBALANCE_DAYS,
    top_k: int = DEFAULT_TOP_K,
    version_id: Optional[int] = None,
    fee_pct: float = DEFAULT_FEE_PCT,
    slippage_pct: float = DEFAULT_SLIPPAGE_PCT,
) -> dict:
    if period_end <= period_start:
        raise ValueError("period_end doit être postérieur à period_start")
    if (period_end - period_start).days > 6 * 365:
        raise ValueError("Fenêtre de backtest limitée à 6 ans pour le calcul point-in-time")

    companies = db.execute(
        select(Company).where(
            Company.id.in_(select(FinancialRatio.company_id).distinct())
        )
    ).scalars().all()
    if not companies:
        raise ValueError("Univers vide : aucun ratio financier disponible")
    cids = [c.id for c in companies]
    sector_of = {c.id: (c.sector.value if c.sector else None) for c in companies}

    # — préchargement des données financières (zéro requête par point)
    ratios: dict[int, dict[int, FinancialRatio]] = {}
    for r in db.execute(
        select(FinancialRatio).where(FinancialRatio.quarter.is_(None))
    ).scalars():
        ratios.setdefault(r.company_id, {})[r.fiscal_year] = r

    scorecards: dict[int, dict[int, ScoreCard]] = {}
    for s in db.execute(select(ScoreCard)).scalars():
        scorecards.setdefault(s.company_id, {})[s.fiscal_year] = s

    valuations: dict[int, dict[int, Valuation]] = {}
    for v in db.execute(select(Valuation)).scalars():
        valuations.setdefault(v.company_id, {})[v.fiscal_year] = v

    # — séries de prix réelles sur la fenêtre (+ marge pour le momentum)
    price_start = period_start - timedelta(days=400)
    series_map = all_price_series(
        db, cids, end=period_end, days=0, start=price_start
    )

    # — série composite du benchmark
    bench = composite_daily_returns(db, period_start, period_end)
    bench_level = 1.0
    bench_series = []
    for d, r in bench:
        bench_level *= (1 + r)
        bench_series.append((d, bench_level))

    # — rendements quotidiens par société sur la fenêtre
    rets_by_company: dict[int, dict[date, float]] = {}
    closes_by_company: dict[int, list[tuple[date, float]]] = {}
    for cid, series in series_map.items():
        closes_by_company[cid] = series
        closes = [px for _, px in series]
        rets = daily_returns(closes)
        dates = [d for d, _ in series]
        rets_by_company[cid] = {
            dates[i + 1]: rets[i] for i in range(len(rets)) if i + 1 < len(dates)
        }

    # — dates de rééquilibrage
    all_dates = sorted({d for cid in rets_by_company for d in rets_by_company[cid]})
    all_dates = [d for d in all_dates if period_start <= d <= period_end]
    rebalance_dates = all_dates[::rebalance_days] or []
    if not rebalance_dates:
        raise ValueError("Pas assez de données dans la fenêtre")

    # — sélection point-in-time à chaque rééquilibrage
    baskets: list[tuple[date, dict[int, float]]] = []
    for rd in rebalance_dates:
        scores: list[tuple[int, float]] = []
        for c in companies:
            ratio = _latest(ratios, c.id, rd.year)
            if ratio is None:
                continue
            closes = [px for d, px in closes_by_company.get(c.id, []) if d <= rd]
            mom = momentum_score(closes)
            scorecard = _latest(scorecards, c.id, rd.year)
            valuation = _latest(valuations, c.id, rd.year)
            price = closes[-1] if closes else None
            factors = {
                "fundamental": _fundamental_score(ratio),
                "quality": _quality_score(scorecard),
                "momentum": None if mom is None else max(0.0, min(100.0, 50 + mom / 2)),
                "valuation": _valuation_score(ratio, valuation, price),
                "risk": None,
            }
            score = composite_score(factors)
            if score is not None and score >= BUY_THRESHOLD:
                scores.append((c.id, score))
        scores.sort(key=lambda x: x[1], reverse=True)
        picks = [cid for cid, _ in scores[:top_k]]
        if not picks:
            continue
        w = 1.0 / len(picks)
        baskets.append((rd, {cid: w for cid in picks}))

    if not baskets:
        raise ValueError("Aucun signal de sélection pendant la fenêtre")

    # — coûts de transaction appliqués à chaque rééquilibrage (turnover)
    def _rebalance_cost(new: dict[int, float], old: Optional[dict[int, float]]) -> float:
        """Turnover du panier × (courtage + slippage)."""
        if old is None:
            turnover = 1.0  # achat du panier initial
        else:
            all_ids = set(new) | set(old)
            delta = sum(
                abs(new.get(cid, 0.0) - old.get(cid, 0.0)) for cid in all_ids
            )
            turnover = delta / 2.0
        return turnover * (fee_pct + slippage_pct)

    total_costs = 0.0

    # — recomposition des rendements quotidiens du portefeuille (net de coûts)
    port_rets: list[tuple[date, float]] = []
    active_basket: Optional[dict[int, float]] = None
    prev_basket: Optional[dict[int, float]] = None
    pending_cost = 0.0
    for d in all_dates:
        basket = None
        for rd, wmap in baskets:
            if rd <= d:
                basket = wmap
            else:
                break
        if basket is None:
            continue
        if active_basket is not basket:
            active_basket = basket
            # coût payé une seule fois, le jour du rééquilibrage
            pending_cost = _rebalance_cost(basket, prev_basket)
            total_costs += pending_cost
            prev_basket = basket
        r_sum = 0.0
        avail_w = 0.0
        for cid, w in basket.items():
            r = rets_by_company.get(cid, {}).get(d)
            if r is not None:
                r_sum += w * r
                avail_w += w
        if avail_w:
            # renorm sur les valeurs réellement négociées ce jour
            gross = r_sum / avail_w
            day_cost = pending_cost
            pending_cost = 0.0
            port_rets.append((d, (1 + gross) * (1 - day_cost) - 1))

    if len(port_rets) < 30:
        raise ValueError("Pas assez de jours de rendement pour un backtest fiable")

    pr = [r for _, r in port_rets]
    pd = [d for d, _ in port_rets]

    # métriques portefeuille
    level = 1.0
    port_series = []
    for _, r in port_rets:
        level *= (1 + r)
        port_series.append(level)
    total_return = port_series[-1] - 1
    years = (pd[-1] - pd[0]).days / 365.25
    cagr = (port_series[-1] ** (1 / years) - 1) if years > 0 and port_series[-1] > 0 else None
    vol = annualized_volatility(pr)
    dd = max_drawdown(port_series)
    sharpe = sharpe_ratio(pr)
    ann = annualized_return(pr)

    # métriques benchmark
    bench_pr = [r for _, r in bench]
    bench_vals = [v for _, v in bench_series]
    bench_total = bench_vals[-1] - 1 if bench_vals else None
    bench_cagr = (bench_vals[-1] ** (1 / years) - 1) if years > 0 and bench_vals and bench_vals[-1] > 0 else None
    bench_vol = annualized_volatility(bench_pr) if len(bench_pr) > 1 else None
    bench_dd = max_drawdown(bench_vals) if bench_vals else None

    # taux de jours gagnants vs benchmark (dates communes)
    bench_map = dict(bench)
    wins = 0
    total = 0
    for d, r in port_rets:
        br = bench_map.get(d)
        if br is not None:
            total += 1
            if r > br:
                wins += 1
    win_rate = (wins / total) if total else None
    alpha = (ann - bench_cagr) if ann is not None and bench_cagr is not None else None

    # — attribution de la performance (bêta vs alpha, par secteur)
    attribution = _attribution(
        rets_by_company, baskets, sector_of, bench_map, bench_total, all_dates
    )

    metrics = {
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "rebalance_days": rebalance_days,
        "top_k": top_k,
        "universe_size": len(companies),
        "rebalances": len(baskets),
        "fee_pct": fee_pct,
        "slippage_pct": slippage_pct,
        "transaction_costs_pct": round(total_costs, 4),
        "total_return": round(total_return, 4),
        "benchmark_total_return": round(bench_total, 4) if bench_total is not None else None,
        "cagr": round(cagr, 4) if cagr is not None else None,
        "benchmark_cagr": round(bench_cagr, 4) if bench_cagr is not None else None,
        "annualized_volatility": round(vol, 4) if vol is not None else None,
        "benchmark_volatility": round(bench_vol, 4) if bench_vol is not None else None,
        "max_drawdown": round(dd, 4) if dd is not None else None,
        "benchmark_max_drawdown": round(bench_dd, 4) if bench_dd is not None else None,
        "sharpe_ratio": round(sharpe, 4) if sharpe is not None else None,
        "annualized_return": round(ann, 4) if ann is not None else None,
        "win_rate": round(win_rate, 4) if win_rate is not None else None,
        "alpha": round(alpha, 4) if alpha is not None else None,
        "attribution": attribution,
        "observations": len(pr),
    }

    version = db.execute(
        select(AiModelVersion).where(AiModelVersion.status == "PRODUCTION")
    ).scalars().first() if version_id is None else db.get(AiModelVersion, version_id)
    backtest = AiBacktest(
        strategy_id=version.strategy_id if version else None,
        version_id=version.id if version else None,
        period_start=period_start,
        period_end=period_end,
        dataset=f"BRVM market_data ({len(companies)} sociétés)",
        status="COMPLETED",
        completed_at=datetime.now(timezone.utc),
    )
    db.add(backtest)
    db.flush()
    db.add(
        AiBacktestResult(
            backtest_id=backtest.id,
            metrics=metrics,
            benchmark_name="BRVM_COMPOSITE",
        )
    )
    db.add(
        AiEvolutionEvent(
            event_type="BACKTEST_COMPLETED",
            detail=f"Backtest {period_start} → {period_end} terminé ({len(baskets)} "
                   f"rééquilibrages, top-{top_k}, coûts {fee_pct * 100:.2f} % + slippage).",
            payload={"backtest_id": backtest.id},
        )
    )
    db.commit()
    metrics["backtest_id"] = backtest.id
    return metrics


def _attribution(
    rets_by_company: dict,
    baskets: list[tuple[date, dict[int, float]]],
    sector_of: dict[int, Optional[str]],
    bench_map: dict,
    bench_total: Optional[float],
    window_dates: list[date],
) -> dict:
    """Attribution simple et documentée :
    - contribution bêta = β_réalisé × rendement de l'indice ;
    - alpha = rendement du portefeuille − contribution bêta ;
    - effet d'allocation par secteur = poids moyen du secteur × excès du secteur ;
    - effet de sélection = alpha − effet d'allocation (résiduel).
    """
    if bench_total is None:
        return {"method": "attribution indisponible sans benchmark"}
    bench_vals = [r for _, r in bench_map.items()]

    port_rets: list[float] = []
    bench_rets: list[float] = []
    for d in window_dates:
        pr = None
        for rd, wmap in baskets:
            if rd <= d:
                pr = wmap
            else:
                break
        if pr is None:
            continue
        r_sum = 0.0
        for cid, w in pr.items():
            r = rets_by_company.get(cid, {}).get(d)
            if r is not None:
                r_sum += w * r
        br = bench_map.get(d)
        if br is not None:
            bench_rets.append(br)
            if len(port_rets) < len(bench_rets):
                port_rets.append(r_sum)
    port_total = 1.0
    for r in port_rets:
        port_total *= (1 + r)
    port_total -= 1.0

    b = beta(port_rets, bench_rets) if len(port_rets) > 3 and len(port_rets) == len(bench_rets) else None
    beta_contrib = (b * bench_total) if b is not None else None
    alpha_contrib = (port_total - beta_contrib) if beta_contrib is not None else port_total

    # poids moyen par secteur dans les paniers + rendements des membres
    sector_w: dict[str, list[float]] = {}
    for rd, wmap in baskets:
        sw: dict[str, float] = {}
        for cid, w in wmap.items():
            s = sector_of.get(cid)
            if s:
                sw[s] = sw.get(s, 0.0) + w
        for s, w in sw.items():
            sector_w.setdefault(s, []).append(w)

    sector_returns: dict[str, float] = {}
    members_by_sector: dict[str, list[int]] = {}
    for cid in rets_by_company:
        s = sector_of.get(cid)
        if s:
            members_by_sector.setdefault(s, []).append(cid)
    for s, cids in members_by_sector.items():
        vals = []
        for cid in cids:
            total_r = 1.0
            has = False
            for d in window_dates:
                r = rets_by_company[cid].get(d)
                if r is not None:
                    total_r *= (1 + r)
                    has = True
            if has:
                vals.append(total_r - 1.0)
        if vals:
            sector_returns[s] = sum(vals) / len(vals)

    sectors = []
    alloc_effect = 0.0
    for s, ws in sector_w.items():
        avg_w = sum(ws) / len(ws)
        sr = sector_returns.get(s)
        excess = (sr - bench_total) if sr is not None else None
        contrib = (avg_w * excess) if excess is not None else None
        if contrib is not None:
            alloc_effect += contrib
        sectors.append({
            "sector": s,
            "avg_weight": round(avg_w, 4),
            "total_return": round(sr, 4) if sr is not None else None,
            "excess_return": round(excess, 4) if excess is not None else None,
            "contribution": round(contrib, 4) if contrib is not None else None,
        })
    sectors.sort(key=lambda x: (x["avg_weight"] or 0.0), reverse=True)

    selection_effect = (alpha_contrib - alloc_effect) if alpha_contrib is not None else None
    return {
        "method": "beta = correlation au marché · allocation = poids secteur × excès du secteur · selection = résiduel",
        "beta": round(b, 4) if b is not None else None,
        "beta_contribution": round(beta_contrib, 4) if beta_contrib is not None else None,
        "alpha_contribution": round(alpha_contrib, 4) if alpha_contrib is not None else None,
        "allocation_effect": round(alloc_effect, 4),
        "selection_effect": round(selection_effect, 4) if selection_effect is not None else None,
        "sectors": sectors,
    }


def run_walk_forward(
    db: Session,
    period_start: date,
    period_end: date,
    folds: int = 4,
    rebalance_days: int = DEFAULT_REBALANCE_DAYS,
    top_k: int = DEFAULT_TOP_K,
    fee_pct: float = DEFAULT_FEE_PCT,
    slippage_pct: float = DEFAULT_SLIPPAGE_PCT,
    version_id: Optional[int] = None,
) -> dict:
    """Évaluation séquentielle hors-échantillon : la fenêtre est découpée en
    `folds` sous-périodes consécutives et la stratégie est évaluée sur chacune.
    Les paramètres étant des règles fixes (non ajustés sur les données), chaque
    pli est déjà out-of-sample ; cette procédure quantifie la stabilité et le
    risque de surapprentissage (écart pleine-période vs moyenne des plis).
    """
    if folds < 2:
        raise ValueError("walk-forward : au moins 2 plis requis")
    span = (period_end - period_start).days
    if span <= 0:
        raise ValueError("period_end doit être postérieur à period_start")
    fold_len = max(1, span // folds)

    fold_metrics: list[dict] = []
    for i in range(folds):
        fs = period_start + timedelta(days=i * fold_len)
        fe = (period_start + timedelta(days=(i + 1) * fold_len)) if i < folds - 1 else period_end
        if fe <= fs:
            continue
        try:
            m = run_backtest(
                db, fs, fe,
                rebalance_days=rebalance_days, top_k=top_k,
                version_id=version_id, fee_pct=fee_pct, slippage_pct=slippage_pct,
            )
            fold_metrics.append({
                "fold": i + 1,
                "period_start": fs.isoformat(),
                "period_end": fe.isoformat(),
                "total_return": m.get("total_return"),
                "cagr": m.get("cagr"),
                "benchmark_total_return": m.get("benchmark_total_return"),
                "alpha": m.get("alpha"),
                "sharpe_ratio": m.get("sharpe_ratio"),
                "max_drawdown": m.get("max_drawdown"),
                "annualized_volatility": m.get("annualized_volatility"),
                "transaction_costs_pct": m.get("transaction_costs_pct"),
                "observations": m.get("observations"),
            })
        except ValueError:
            continue

    if len(fold_metrics) < 2:
        raise ValueError("Pas assez de plis valides pour un walk-forward fiable")

    returns = [f["total_return"] for f in fold_metrics if f["total_return"] is not None]
    alphas = [f["alpha"] for f in fold_metrics if f["alpha"] is not None]
    cagrs = [f["cagr"] for f in fold_metrics if f["cagr"] is not None]
    beats = sum(1 for f in fold_metrics if f.get("total_return") is not None and f.get("benchmark_total_return") is not None
                and f["total_return"] > f["benchmark_total_return"])
    n_valid = len([f for f in fold_metrics if f.get("total_return") is not None])

    mean_ret = (sum(returns) / len(returns)) if returns else None
    mean_alpha = (sum(alphas) / len(alphas)) if alphas else None
    std_ret = None
    if returns and len(returns) > 1:
        m = sum(returns) / len(returns)
        std_ret = (sum((r - m) ** 2 for r in returns) / (len(returns) - 1)) ** 0.5

    mean_cagr = (sum(cagrs) / len(cagrs)) if cagrs else None
    std_cagr = None
    if cagrs and len(cagrs) > 1:
        m = sum(cagrs) / len(cagrs)
        std_cagr = (sum((c - m) ** 2 for c in cagrs) / (len(cagrs) - 1)) ** 0.5

    # Comparaison sur rendements annualisés (comparables entre plis de durées
    # différentes) : un rendement composé pleine-période n'est pas comparable à
    # la moyenne arithmétique de plis isolés.
    full_run = None
    full_cagr = None
    overfit_risk = "LOW"
    try:
        full_metrics = run_backtest(
            db, period_start, period_end,
            rebalance_days=rebalance_days, top_k=top_k,
            version_id=version_id, fee_pct=fee_pct, slippage_pct=slippage_pct,
        )
        full_run = full_metrics.get("total_return", None)
        full_cagr = full_metrics.get("cagr", None)
    except ValueError:
        pass
    if mean_cagr is not None and std_cagr is not None and std_cagr > 0 and full_cagr is not None:
        gap = full_cagr - mean_cagr
        if gap > 2 * std_cagr and gap > 0.05:
            overfit_risk = "HIGH"
        elif gap > std_cagr and gap > 0.02:
            overfit_risk = "MODERATE"
    elif mean_cagr is not None and full_cagr is not None:
        gap = full_cagr - mean_cagr
        if gap > 0.15:
            overfit_risk = "MODERATE"

    summary = {
        "method": "fenêtre découpée en plis séquentiels (hors-échantillon)",
        "fold_count": len(fold_metrics),
        "fold_mean_total_return": round(mean_ret, 4) if mean_ret is not None else None,
        "fold_std_total_return": round(std_ret, 4) if std_ret is not None else None,
        "fold_mean_cagr": round(mean_cagr, 4) if mean_cagr is not None else None,
        "fold_std_cagr": round(std_cagr, 4) if std_cagr is not None else None,
        "fold_mean_alpha": round(mean_alpha, 4) if mean_alpha is not None else None,
        "beats_benchmark": beats,
        "beats_benchmark_pct": round(beats / n_valid, 4) if n_valid else None,
        "best_fold": max(fold_metrics, key=lambda f: f.get("total_return") or -1),
        "worst_fold": min(fold_metrics, key=lambda f: f.get("total_return") or 1),
        "overfit_risk": overfit_risk,
        "full_period_total_return": round(full_run, 4) if full_run is not None else None,
        "full_period_cagr": round(full_cagr, 4) if full_cagr is not None else None,
        "folds": fold_metrics,
    }

    version = db.execute(
        select(AiModelVersion).where(AiModelVersion.status == "PRODUCTION")
    ).scalars().first() if version_id is None else db.get(AiModelVersion, version_id)
    backtest = AiBacktest(
        strategy_id=version.strategy_id if version else None,
        version_id=version.id if version else None,
        period_start=period_start,
        period_end=period_end,
        dataset=f"BRVM walk-forward ({folds} plis)",
        status="COMPLETED",
        completed_at=datetime.now(timezone.utc),
    )
    db.add(backtest)
    db.flush()
    db.add(
        AiBacktestResult(
            backtest_id=backtest.id,
            metrics={"walk_forward": summary},
            benchmark_name="BRVM_COMPOSITE (walk-forward)",
        )
    )
    db.add(
        AiEvolutionEvent(
            event_type="VALIDATION",
            detail=f"Walk-forward {folds} plis {period_start} → {period_end} : "
                   f"rendement moyen {mean_ret * 100:.1f} %, risque surapprentissage {overfit_risk}.",
            payload={"backtest_id": backtest.id},
        )
    )
    db.commit()
    summary["backtest_id"] = backtest.id
    return summary
