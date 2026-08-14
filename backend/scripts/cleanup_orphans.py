"""Nettoyage des données orphelines (maintenance).

Détecte et (optionnellement) supprime :
- orders dont le portfolio_id ne pointe sur aucun portfolio (orphelins)
- portfolios sans aucun rattachement user_portfolios (propriétaire disparu)
- users sans auth_id ni legacy_hash (comptes fantômes)

Usage :
    python scripts/cleanup_orphans.py                 # dry-run (rapport seul)
    python scripts/cleanup_orphans.py --commit        # applique les suppressions
    python scripts/cleanup_orphans.py --commit --purge-portfolios  # supprime aussi les portfolios sans propriétaire

Les ordres orphelins sont toujours supprimables (déchets, jamais affichés).
Les portfolios sans propriétaire et les users fantômes sont seulement
signalés, sauf --purge-portfolios.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy.orm import Session  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.models.user import Order, Portfolio, User  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--commit", action="store_true", help="applique les suppressions")
    parser.add_argument("--purge-portfolios", action="store_true",
                        help="supprime aussi les portfolios sans propriétaire")
    args = parser.parse_args()

    db: Session = SessionLocal()
    try:
        orphan_orders = db.query(Order).filter(
            Order.portfolio_id.is_(None) | ~Order.portfolio_id.in_(
                db.query(Portfolio.id)
            )
        ).order_by(Order.id).all()

        ownerless_pfs = _ownerless_portfolios(db)

        dead_users = db.query(User).filter(
            (User.auth_id.is_(None)) & ((User.legacy_hash.is_(None)) | (User.legacy_hash == ""))
        ).order_by(User.id).all()

        print(f"Orders orphelins        : {len(orphan_orders)}")
        for o in orphan_orders:
            print(f"  - #{o.id} {o.symbol} {o.side} qty={o.qty} status={o.status} "
                  f"user={o.user_id} portfolio={o.portfolio_id}")
        print(f"Portfolios sans owner   : {len(ownerless_pfs)}")
        for p in ownerless_pfs:
            print(f"  - #{p.id} '{p.name}' type={p.type} balance={p.balance}")
        print(f"Users fantômes          : {len(dead_users)}")
        for u in dead_users:
            print(f"  - #{u.id} email={u.email}")

        if args.commit:
            for o in orphan_orders:
                db.delete(o)
            if args.purge_portfolios:
                for p in ownerless_pfs:
                    db.delete(p)
            db.commit()
            print(f"Supprimés : {len(orphan_orders)} ordre(s)"
                  + (f", {len(ownerless_pfs)} portefeuille(s)" if args.purge_portfolios else ""))
        else:
            print("(dry-run : aucun changement — relancer avec --commit pour appliquer)")
    finally:
        db.close()


def _ownerless_portfolios(db: Session):
    linked = db.query(Portfolio.id).join(Portfolio.user_portfolios).scalar_subquery()
    return db.query(Portfolio).filter(~Portfolio.id.in_(linked)).order_by(Portfolio.id).all()


if __name__ == "__main__":
    main()