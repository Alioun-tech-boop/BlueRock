"""Purge des comptes clients démo de la passerelle courtiers (Broker Connect).

Les comptes « préexistants » chez les courtiers (SGI/SGO) étaient des comptes
démo générés et documentés (PIN « 123456 »). Ils sont retirés de l'application :
cette fonction les supprime de la base (et leurs dépendances) de façon
idempotente à chaque démarrage, pour garantir qu'il n'en reste plus aucun.
"""

from sqlalchemy.orm import Session

from ..models.broker_connect import BrokerClientAccount, BrokerLoginEvent, BrokerSession
from ..models.user import Portfolio


def purge_broker_client_accounts(db: Session) -> dict:
    """Supprime tous les comptes courtiers démo et leurs données liées.

    - Détache les portefeuilles réels encore rattachés à un compte courtier
      (le compte lié disparaissant, le portefeuille reste à l'utilisateur).
    - Supprime les sessions courtier et le journal d'audit associés.
    - Supprime les comptes eux-mêmes.
    """
    # Détache les portefeuilles liés à un compte courtier supprimé.
    db.query(Portfolio).filter(
        Portfolio.broker_client_id.isnot(None)
    ).update({Portfolio.broker_client_id: None}, synchronize_session=False)

    # Sessions et journal d'audit référencent les comptes (FK).
    db.query(BrokerSession).delete(synchronize_session=False)
    db.query(BrokerLoginEvent).delete(synchronize_session=False)
    deleted = db.query(BrokerClientAccount).delete(synchronize_session=False)
    db.commit()
    return {"status": "ok", "deleted": deleted}
