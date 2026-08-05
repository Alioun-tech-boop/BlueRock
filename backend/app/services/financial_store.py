"""Stockage structuré des états financiers réels (partagé ingestion manuelle / sync auto)."""
from typing import Optional, Dict
from sqlalchemy.orm import Session
from ..models.financial import FinancialStatement, FinancialLineItem, StatementType
from ..models.ratios import FinancialRatio


def cleanup_existing(db: Session, company_id: int, fiscal_year: int, quarter: Optional[int]):
    """Supprime les états financiers et ratios existants pour (entreprise, année, trimestre)."""
    q = db.query(FinancialStatement).filter(
        FinancialStatement.company_id == company_id,
        FinancialStatement.fiscal_year == fiscal_year,
    )
    if quarter is not None:
        q = q.filter(FinancialStatement.quarter == quarter)
    statements = q.all()

    for stmt in statements:
        db.query(FinancialLineItem).filter(FinancialLineItem.statement_id == stmt.id).delete()
    for stmt in statements:
        db.delete(stmt)

    qr = db.query(FinancialRatio).filter(
        FinancialRatio.company_id == company_id,
        FinancialRatio.fiscal_year == fiscal_year,
    )
    if quarter is not None:
        qr = qr.filter(FinancialRatio.quarter == quarter)
    qr.delete()
    db.flush()


def store_statement(
    db: Session,
    company_id: int,
    fiscal_year: int,
    statement_type: StatementType,
    items: Dict[str, float],
    quarter: Optional[int],
    source_file: str,
) -> Optional[FinancialStatement]:
    if not items:
        return None

    stmt = FinancialStatement(
        company_id=company_id,
        statement_type=statement_type,
        fiscal_year=fiscal_year,
        quarter=quarter,
        currency="XOF",
        source_file=source_file,
    )
    db.add(stmt)
    db.flush()

    for name, value in items.items():
        if value is None:
            continue
        db.add(FinancialLineItem(
            statement_id=stmt.id,
            account_name=name,
            value=float(value),
        ))
    return stmt
