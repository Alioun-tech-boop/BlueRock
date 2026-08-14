"""Backfill / collecte continue du marché NGX (à planifier en cron).

Synchronise le catalogue NGX depuis l'API NGN Market (liste officielle,
noms, sous-secteurs) et persiste les prix du jour dans MarketData
(source NGX_LIVE). Idempotent : aucune société supprimée, aucun prix
rétroactif inventé — l'historique s'accumule au fil des jours.

Usage :
    python scripts/backfill_ngx.py                # une passe
    python scripts/backfill_ngx.py --catalog      # catalogue seul (sans clé API)
    python scripts/backfill_ngx.py --loop 20      # boucle toutes les 20 min

Conseil cron (séance NGX 09:00-16:00 WAT, plan Free ~1 appel/20 min) :
    20 * * * 1-5  cd backend && venv\\Scripts\\python scripts\\backfill_ngx.py
"""

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal  # noqa: E402
from app.services.ngx_seed import seed_ngx_catalog, sync_ngx_from_api  # noqa: E402


def one_pass(catalog_only: bool = False) -> dict:
    db = SessionLocal()
    try:
        cat = seed_ngx_catalog(db)
        if catalog_only:
            return cat
        return sync_ngx_from_api(db)
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--catalog", action="store_true",
                        help="catalogue statique seul (sans clé API)")
    parser.add_argument("--loop", type=int, metavar="MINUTES", default=0,
                        help="boucle toutes les N minutes (défaut : une seule passe)")
    args = parser.parse_args()

    interval = max(args.loop, 0) * 60
    while True:
        result = one_pass(catalog_only=args.catalog)
        print(f"backfill_ngx: {result}")
        if not interval:
            break
        time.sleep(interval)


if __name__ == "__main__":
    main()
