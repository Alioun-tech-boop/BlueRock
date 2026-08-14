"""Administration KYC — vue réservée aux personnes autorisées.

Suivi : KYC commencés / vérifiés / en attente / en revue / refusés / erreurs,
dossiers prêts pour la SGI, dossiers transmis, et motif des revues.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..core.security import require_admin
from ..models.kyc import UserKyc
from ..models.user import User, BrokerAccount
from ..services import kyc_flow
from ..services.kyc_flow import profile_complete

router = APIRouter(prefix="/api/admin/kyc", tags=["admin"])


def _user_out(u: User) -> dict:
    return {"id": u.id, "name": u.name, "email": u.email, "account_type": u.account_type}


def _admin_kyc_out(k: UserKyc, transmitted_ids: set) -> dict:
    complete, _ = profile_complete(k)
    return {
        "id": k.id,
        "user": _user_out(k.user),
        "status": k.status,
        "submitted_at": k.submitted_at.isoformat() if k.submitted_at else None,
        "reviewed_at": k.reviewed_at.isoformat() if k.reviewed_at else None,
        "verified_at": k.verified_at.isoformat() if k.verified_at else None,
        "review_note": k.review_note,
        "profile_complete": complete,
        "ready_for_sgi": k.status == kyc_flow.KYC_VERIFIED and complete,
        "transmitted_to_sgi": k.id in transmitted_ids,
    }


@router.get("/stats")
def kyc_stats(db: Session = Depends(get_db), _=Depends(require_admin)):
    rows = db.query(UserKyc.status, func.count(UserKyc.id)).group_by(UserKyc.status).all()
    by_status = {status: count for status, count in rows}
    total = db.query(func.count(UserKyc.id)).scalar() or 0
    total_users = db.query(func.count(User.id)).scalar() or 0

    ready = db.query(UserKyc).filter(UserKyc.status == kyc_flow.KYC_VERIFIED).all()
    ready_count = sum(1 for k in ready if profile_complete(k)[0])

    transmitted = db.query(func.count(BrokerAccount.id)).scalar() or 0

    return {
        "total_users": total_users,
        "total": total,
        "by_status": {s: by_status.get(s, 0) for s in kyc_flow.KYC_STATUSES},
        "started": total,
        "verified": by_status.get(kyc_flow.KYC_VERIFIED, 0),
        "pending": sum(by_status.get(s, 0) for s in (
            kyc_flow.KYC_IN_PROGRESS,
            kyc_flow.KYC_DOCUMENT_SUBMITTED,
            kyc_flow.KYC_VERIFICATION_IN_PROGRESS,
        )),
        "review": by_status.get(kyc_flow.KYC_REVIEW_REQUIRED, 0),
        "rejected": by_status.get(kyc_flow.KYC_REJECTED, 0),
        "errors": by_status.get(kyc_flow.KYC_ERROR, 0),
        "ready_for_sgi": ready_count,
        "transmitted_to_sgi": transmitted,
    }


@router.get("")
def kyc_list(
    status: str | None = Query(default=None),
    q: str | None = Query(default=None, max_length=120),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    query = db.query(UserKyc).join(User).order_by(UserKyc.id.desc())
    if status:
        if status not in kyc_flow.KYC_STATUSES:
            raise HTTPException(status_code=422, detail="Statut inconnu")
        query = query.filter(UserKyc.status == status)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            (User.name.ilike(like)) | (User.email.ilike(like)) | (UserKyc.full_name.ilike(like))
        )
    items = query.limit(limit).all()
    transmitted_ids = {
        row[0] for row in db.query(BrokerAccount.kyc_id).filter(BrokerAccount.kyc_id.isnot(None)).all()
    }
    return {"count": len(items), "items": [_admin_kyc_out(k, transmitted_ids) for k in items]}
