from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..models.planning import Notification
from .auth import get_current_user

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


def _serialize(n: Notification) -> dict:
    return {
        "id": n.id,
        "type": n.type,
        "title": n.title,
        "body": n.body or "",
        "link": n.link,
        "read": n.read,
        "email_sent": n.email_sent,
        "created_at": n.created_at.strftime("%Y-%m-%d %H:%M") if n.created_at else None,
    }


@router.get("")
def list_notifications(user: User = Depends(get_current_user),
                       db: Session = Depends(get_db),
                       limit: int = 50):
    items = (db.query(Notification)
             .filter(Notification.user_id == user.id)
             .order_by(Notification.created_at.desc())
             .limit(min(limit, 200)).all())
    return {"notifications": [_serialize(n) for n in items]}


@router.get("/unread-count")
def unread_count(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    count = (db.query(Notification)
             .filter(Notification.user_id == user.id, Notification.read.is_(False))
             .count())
    return {"unread": count}


@router.post("/{notification_id}/read")
def mark_read(notification_id: int, user: User = Depends(get_current_user),
              db: Session = Depends(get_db)):
    n = db.query(Notification).filter(
        Notification.id == notification_id, Notification.user_id == user.id).first()
    if not n:
        raise HTTPException(status_code=404, detail="Notification introuvable")
    n.read = True
    db.commit()
    return {"ok": True}


@router.post("/read-all")
def mark_all_read(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.query(Notification).filter(
        Notification.user_id == user.id, Notification.read.is_(False)).update(
        {"read": True}, synchronize_session=False)
    db.commit()
    return {"ok": True}
