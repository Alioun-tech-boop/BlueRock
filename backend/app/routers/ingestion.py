from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from typing import Optional, List
import os
import shutil
import uuid
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

from ..core.security import require_admin
from ..core.supabase_auth import storage_signed_url, storage_upload
from ..database import get_db
from ..models.company import Company
from ..models.financial import StatementType, FinancialStatement
from ..scrapers.pdf_extractor import PDFExtractor
from ..services.financial_store import cleanup_existing, store_statement
from ..services.ratio_calculator import RatioCalculator
from ..routers.auth import get_current_user

router = APIRouter(prefix="/api/ingestion", tags=["Ingestion"])

fetch_state: dict = {}

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

MAX_FILE_SIZE = 25 * 1024 * 1024  # 25 MB


def _cleanup_existing(db: Session, company_id: int, fiscal_year: int, quarter: Optional[int]):
    """Supprime les états financiers et ratios existants pour (entreprise, année, trimestre)."""
    cleanup_existing(db, company_id, fiscal_year, quarter)


def _store_statement(
    db: Session,
    company_id: int,
    fiscal_year: int,
    statement_type: StatementType,
    items: dict,
    quarter: Optional[int],
    source_file: str,
) -> Optional[FinancialStatement]:
    return store_statement(db, company_id, fiscal_year, statement_type, items, quarter, source_file)


@router.post("/pdf")
async def ingest_pdf(
    file: UploadFile = File(...),
    company_id: int = Form(...),
    fiscal_year: int = Form(...),
    quarter: Optional[int] = Form(None),
    is_consolidated: Optional[bool] = Form(True),
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Ingère un rapport financier PDF : extraction → stockage structuré → recalcul des ratios."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Le fichier doit être un PDF")

    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail=f"Entreprise id={company_id} introuvable")

    if quarter is not None and quarter not in (1, 2, 3, 4):
        raise HTTPException(status_code=400, detail="Trimestre invalide (1-4)")

    if not 2000 <= fiscal_year <= 2100:
        raise HTTPException(status_code=400, detail="Exercice fiscal hors bornes (2000-2100)")

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Fichier vide")
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="Fichier trop volumineux (max 25 MB)")

    safe_name = f"{uuid.uuid4().hex[:8]}_{os.path.basename(file.filename)}"
    pdf_path = os.path.join(UPLOAD_DIR, safe_name)
    with open(pdf_path, "wb") as f:
        f.write(content)

    # Archivage dans Supabase Storage (bucket "uploads", chemin pdfs/…)
    storage_path = f"pdfs/{safe_name}"
    if not storage_upload("uploads", storage_path, content, "application/pdf"):
        logger.warning("Storage Supabase indisponible — PDF non archivé")

    try:
        extracted = PDFExtractor().extract_financial_statements(pdf_path)
    except ValueError as e:
        os.remove(pdf_path)
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        os.remove(pdf_path)
        raise HTTPException(status_code=500, detail=f"Erreur d'extraction du PDF : {str(e)}")

    _cleanup_existing(db, company.id, fiscal_year, quarter)

    stmt_income = _store_statement(
        db, company.id, fiscal_year, StatementType.INCOME,
        extracted.get("income_statement", {}), quarter, safe_name,
    )
    stmt_balance = _store_statement(
        db, company.id, fiscal_year, StatementType.BALANCE,
        extracted.get("balance_sheet", {}), quarter, safe_name,
    )
    stmt_cf = _store_statement(
        db, company.id, fiscal_year, StatementType.CASH_FLOW,
        extracted.get("cash_flow", {}), quarter, safe_name,
    )

    if not (stmt_income or stmt_balance or stmt_cf):
        db.rollback()
        os.remove(pdf_path)
        raise HTTPException(status_code=422, detail="Aucune donnée financière détectée dans le PDF")

    db.commit()
    os.remove(pdf_path)  # ne pas accumuler les fichiers traités

    stats = None
    try:
        from ..services.stat_pipeline import recompute_stats
        stats = recompute_stats(db, company.id, fiscal_year, quarter)
    except Exception as e:
        logger.warning("recompute stats après ingestion PDF (%s): %s", company.id, e)
        db.rollback()
        db.commit()

    stored = 0
    for stmt in (stmt_income, stmt_balance, stmt_cf):
        if stmt:
            stored += len(stmt.line_items)

    return JSONResponse(content={
        "status": "ok",
        "company_id": company.id,
        "symbol": company.symbol,
        "fiscal_year": fiscal_year,
        "quarter": quarter,
        "file": file.filename,
        "stored": {
            "statements": sum(1 for s in (stmt_income, stmt_balance, stmt_cf) if s),
            "line_items": stored,
        },
        "detected_scale": extracted["metadata"].get("detected_scale"),
        "ratios_recomputed": bool(stats and stats.get("ratios")),
        "stats_recomputed": stats or None,
        "preview": {
            "income_statement": extracted.get("income_statement", {}),
            "balance_sheet": extracted.get("balance_sheet", {}),
            "cash_flow": extracted.get("cash_flow", {}),
            "notes": extracted.get("notes", []),
        },
    })


@router.post("/fetch")
def fetch_financials(
    symbols: Optional[str] = Form(None),
    max_years: Optional[int] = Form(2),
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Lance en arrière-plan la synchronisation des états financiers réels depuis
    brvm.org (rapports annuels/trimestriels publiés par les émetteurs)."""
    from ..scrapers.financial_reports import sync_financials
    from ..database import SessionLocal
    import threading

    symbol_list = [s.strip() for s in symbols.split(",") if s.strip()] if symbols else None

    state = fetch_state.setdefault("last", {})
    state["status"] = "running"
    state["started_at"] = datetime.now().isoformat()

    def _job():
        job_db = SessionLocal()
        try:
            result = sync_financials(job_db, symbols=symbol_list, max_years=max(1, min(3, max_years or 2)))
            fetch_state["last"] = result
            fetch_state["last"]["status"] = "done"
        except Exception as e:
            fetch_state["last"] = {"status": "error", "error": str(e)}
        finally:
            job_db.close()

    threading.Thread(target=_job, daemon=True).start()
    return {"status": "started", "symbols": symbol_list}


@router.get("/fetch/status")
def fetch_status():
    return fetch_state.get("last", {"status": "idle"})


@router.get("/statements")
def get_statements(
    company_id: int,
    fiscal_year: Optional[int] = None,
    quarter: Optional[int] = None,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    q = db.query(FinancialStatement).filter(FinancialStatement.company_id == company_id)
    if fiscal_year:
        q = q.filter(FinancialStatement.fiscal_year == fiscal_year)
    if quarter is not None:
        q = q.filter(FinancialStatement.quarter == quarter)

    statements = q.order_by(FinancialStatement.fiscal_year.desc(), FinancialStatement.statement_type).all()
    return [
        {
            "id": s.id,
            "type": s.statement_type.value,
            "fiscal_year": s.fiscal_year,
            "quarter": s.quarter,
            "source_file": s.source_file,
            "currency": s.currency,
            "extracted_at": s.extracted_at.isoformat() if s.extracted_at else None,
            "source_url": (s.source_file if str(s.source_file or "").startswith("http")
                           else storage_signed_url("uploads", f"pdfs/{s.source_file}")
                           if s.source_file else None),
            "line_items": [
                {"account": i.account_name, "value": i.value, "code": i.account_code}
                for i in s.line_items
            ],
        }
        for s in statements
    ]


@router.get("/summary")
def get_ingestion_summary(company_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(FinancialStatement)
    if company_id:
        q = q.filter(FinancialStatement.company_id == company_id)

    rows = q.with_entities(
        FinancialStatement.company_id,
        FinancialStatement.fiscal_year,
        FinancialStatement.quarter,
    ).distinct().all()

    companies = db.query(Company).all()
    by_company = {c.id: {"company_id": c.id, "symbol": c.symbol, "name": c.name, "years": {}} for c in companies}

    for company_id_, year, quarter in rows:
        by_company[company_id_]["years"].setdefault(year, []).append(f"Q{quarter}" if quarter else "Annuel")

    result = [v for v in by_company.values() if v["years"]]
    if company_id:
        return next((v for v in result if v["company_id"] == company_id), {})
    return result
