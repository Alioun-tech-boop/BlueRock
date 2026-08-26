"""Exports Bluerock AI : CSV et PDF (décisions, rapport mensuel, audit).

Génération PDF via fpdf2 (aucun binaire système requis). Les rapports
mentionnent systématiquement l'environnement SIMULATION et affichent « N/A »
pour toute métrique indisponible — aucune valeur inventée.
"""
from __future__ import annotations

import csv
import io
from datetime import date, datetime, timezone
from typing import Optional

from fpdf import FPDF
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..models import (
    AiAuditLog,
    AiDecision,
    AiPerformanceSnapshot,
)
from .portfolio import get_or_seed, mark
from .risk import compute_metrics

BRAND = "BLUEROCK AI"
FOOTER = "BlueRock AI | Environnement SIMULATION | Calcul quantitatif deterministe | Aucune promesse de performance"


def _safe(text) -> str:
    """Filtre latin-1 pour les polices PDF standard (fpdf2)."""
    if text is None:
        return ""
    try:
        return str(text).encode("latin-1", "replace").decode("latin-1")
    except Exception:
        return str(text).replace("\u0153", "oe").replace("\u2019", "'").replace("\u2014", "-")


def _fmt_pct(v: Optional[float], digits: int = 1) -> str:
    return f"{v * 100:.{digits}f} %" if v is not None else "N/A"


def _fmt_num(v: Optional[float], digits: int = 2) -> str:
    return f"{v:,.{digits}f}" if v is not None else "N/A"


def _fmt_money(v: Optional[float]) -> str:
    return f"{v:,.2f} XOF" if v is not None else "N/A"


def _decisions_rows(db: Session, limit: int = 200) -> list[dict]:
    rows = db.execute(
        select(AiDecision)
        .options(selectinload(AiDecision.company))
        .order_by(AiDecision.created_at.desc())
        .limit(limit)
    ).scalars().all()
    out = []
    for d in rows:
        out.append({
            "date": d.created_at.strftime("%Y-%m-%d %H:%M") if d.created_at else "N/A",
            "symbol": d.company.symbol if d.company else "N/A",
            "company": d.company.name if d.company else "N/A",
            "decision_type": d.decision_type,
            "status": d.status,
            "confidence": d.confidence if d.confidence is not None else "N/A",
            "risk_level": d.risk_level or "N/A",
            "horizon": d.horizon or "N/A",
            "allocation_target": d.allocation_target if d.allocation_target is not None else "N/A",
            "price_at_decision": d.price_at_decision if d.price_at_decision is not None else "N/A",
            "regime": d.regime or "N/A",
            "score": d.score if d.score else "N/A",
            "summary": d.summary or "",
        })
    return out


def decisions_csv(db: Session, limit: int = 200) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["date", "symbol", "company", "decision_type", "status", "confidence",
                     "risk_level", "horizon", "allocation_target", "price_at_decision",
                     "regime", "score", "summary"])
    for r in _decisions_rows(db, limit):
        writer.writerow([r["date"], r["symbol"], r["company"], r["decision_type"], r["status"],
                         r["confidence"], r["risk_level"], r["horizon"], r["allocation_target"],
                         r["price_at_decision"], r["regime"], r["score"], r["summary"]])
    return buf.getvalue()


def audit_csv(db: Session, limit: int = 200) -> str:
    rows = db.execute(
        select(AiAuditLog).order_by(AiAuditLog.created_at.desc()).limit(limit)
    ).scalars().all()
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["date", "event_type", "entity_type", "entity_id", "actor", "detail"])
    for a in rows:
        writer.writerow([
            a.created_at.strftime("%Y-%m-%d %H:%M") if a.created_at else "N/A",
            a.event_type,
            a.entity_type or "N/A",
            a.entity_id or "N/A",
            a.actor or "N/A",
            (a.detail or "").replace("\n", " "),
        ])
    return buf.getvalue()


class _ReportPdf(FPDF):
    def header(self):
        self.set_font("Helvetica", "B", 13)
        self.set_text_color(20, 20, 30)
        self.cell(0, 8, BRAND, new_x="LMARGIN", new_y="NEXT")
        self.set_font("Helvetica", "", 8)
        self.set_text_color(120, 120, 130)
        self.cell(0, 5, "Coeur quantitatif | Marche Regional (BRVM)", new_x="LMARGIN", new_y="NEXT")
        self.ln(3)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 7)
        self.set_text_color(130, 130, 140)
        self.cell(0, 8, FOOTER, align="C")
        self.cell(0, 8, f"{self.page_no()}", align="R")


def _pdf_table(pdf: FPDF, headers: list[str], rows: list[list[str]], widths: list[float]) -> None:
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_fill_color(240, 240, 245)
    for h, w in zip(headers, widths):
        pdf.cell(w, 6, _safe(h)[:22], border=1, fill=True)
    pdf.ln()
    pdf.set_font("Helvetica", "", 7.5)
    pdf.set_fill_color(255, 255, 255)
    for row in rows:
        if pdf.get_y() > 250:
            pdf.add_page()
            pdf.set_font("Helvetica", "B", 8)
            for h, w in zip(headers, widths):
                pdf.cell(w, 6, _safe(h)[:22], border=1, fill=True)
            pdf.ln()
            pdf.set_font("Helvetica", "", 7.5)
        pdf.set_x(pdf.l_margin)
        for cell, w in zip(row, widths):
            pdf.cell(w, 6, _safe(cell)[:34], border=1)
        pdf.ln()


def _pdf_bytes(pdf: FPDF) -> bytes:
    return bytes(pdf.output())


def decisions_pdf(db: Session, limit: int = 50) -> bytes:
    pdf = _ReportPdf(format="A4")
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 15)
    pdf.cell(0, 10, "Journal des decisions", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(90, 90, 100)
    pdf.cell(0, 6, f"Genere le {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')} UTC | "
                   f"environnement SIMULATION", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)
    rows = _decisions_rows(db, limit)
    headers = ["date", "symbol", "type", "status", "conf.", "risk", "horizon", "alloc", "prix"]
    widths = [34, 16, 12, 20, 14, 16, 24, 18, 20]
    data = [
        [r["date"][:16], r["symbol"], r["decision_type"], r["status"],
         f"{r['confidence'] * 100:.0f} %" if isinstance(r["confidence"], float) else "N/A",
         r["risk_level"], r["horizon"][:14], r["allocation_target"], r["price_at_decision"]]
        for r in rows
    ]
    _pdf_table(pdf, headers, data, widths)
    pdf.ln(3)
    pdf.set_font("Helvetica", "B", 9)
    pdf.cell(0, 7, "Resumes", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(60, 60, 70)
    for r in rows[:12]:
        pdf.multi_cell(0, 5, _safe(f"{r['symbol']} | {r['decision_type']} ({r['status']}) — {r['summary'][:220]}"), new_x="LMARGIN", new_y="NEXT")
    return _pdf_bytes(pdf)


def monthly_report_pdf(db: Session, month: str) -> bytes:
    """Rapport mensuel : performance, risque, décisions du mois."""
    try:
        ym = datetime.strptime(month, "%Y-%m")
    except ValueError:
        raise ValueError("month doit être au format YYYY-MM") from None
    month_start = date(ym.year, ym.month, 1)
    month_end = date(ym.year + (1 if ym.month == 12 else 0), 1 if ym.month == 12 else ym.month + 1, 1)

    portfolio = get_or_seed(db)
    mkt = mark(db, portfolio)
    metrics = compute_metrics(db, portfolio)

    perf = db.execute(
        select(AiPerformanceSnapshot)
        .where(
            AiPerformanceSnapshot.portfolio_id == portfolio.id,
            AiPerformanceSnapshot.date >= month_start,
            AiPerformanceSnapshot.date < month_end,
        )
        .order_by(AiPerformanceSnapshot.date.asc())
    ).scalars().all()

    decisions = db.execute(
        select(AiDecision)
        .options(selectinload(AiDecision.company))
        .where(AiDecision.created_at >= month_start, AiDecision.created_at < month_end)
        .order_by(AiDecision.created_at.desc())
        .limit(30)
    ).scalars().all()

    pdf = _ReportPdf(format="A4")
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 15)
    pdf.cell(0, 10, _safe(f"Rapport mensuel - {ym.strftime('%B %Y')}"), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(90, 90, 100)
    pdf.cell(0, 6, "Environnement SIMULATION | Portefeuille virtuel d'observation", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    # Performance
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(20, 20, 30)
    pdf.cell(0, 8, "1 | Performance", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 9)
    if perf:
        first_v = perf[0].value
        last_v = perf[-1].value
        month_ret = (last_v / first_v - 1) if first_v else None
    else:
        month_ret = None
    lines = [
        f"Valeur du portefeuille : {_fmt_money(mkt['value'])}",
        f"Liquidites : {_fmt_money(mkt['cash'])}",
        f"Rendement du mois : {_fmt_pct(month_ret)}",
        f"Rendement depuis le lancement : {_fmt_pct(perf[-1].return_since_launch if perf else None)}",
        f"Points de valorisation enregistres sur le mois : {len(perf)}",
    ]
    for l in lines:
        pdf.cell(0, 6, _safe(l), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)

    # Risque
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 8, "2 | Risque", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 9)
    rlines = [
        f"Volatilite annualisee : {_fmt_pct(metrics.get('volatility'))}",
        f"Drawdown maximum : {_fmt_pct(metrics.get('max_drawdown'))}",
        f"Ratio de Sharpe : {_fmt_num(metrics.get('sharpe_ratio'))}",
        f"VaR 95 % (1 jour) : {_fmt_pct(metrics.get('var_95'))}",
        f"CVaR 95 % (1 jour) : {_fmt_pct(metrics.get('cvar_95'))}",
        f"Beta vs indice : {_fmt_num(metrics.get('beta'))}",
    ]
    for l in rlines:
        pdf.cell(0, 6, _safe(l), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)

    # Décisions
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 8, _safe(f"3 | Decisions du mois ({len(decisions)})"), new_x="LMARGIN", new_y="NEXT")
    if decisions:
        headers = ["date", "symbol", "type", "status", "conf."]
        widths = [34, 30, 24, 30, 22]
        data = [
            [d.created_at.strftime("%Y-%m-%d") if d.created_at else "N/A",
             d.company.symbol if d.company else "N/A", d.decision_type, d.status,
             f"{d.confidence * 100:.0f} %" if d.confidence is not None else "N/A"]
            for d in decisions
        ]
        _pdf_table(pdf, headers, data, widths)
    else:
        pdf.set_font("Helvetica", "", 9)
        pdf.cell(0, 6, "Aucune decision emise sur cette periode.", new_x="LMARGIN", new_y="NEXT")

    return _pdf_bytes(pdf)
