"""Backfill de l'historique OHLC NGX dans MarketData.

Usage (depuis le dossier backend) :
    python scripts/backfill_ngx_history.py --days 365
    python scripts/backfill_ngx_history.py --days 365 --limit 5   # test sur 5 sociétés
    python scripts/backfill_ngx_history.py --provider stooq       # source alternative

Source alternative par défaut : Twelve Data (gratuit, nécessite TWELVEDATA_API_KEY
dans .env). Le plan Free NGN Market ne servant pas l'historique, on passe par
cette source pour contourner la limite de plan.
"""
import argparse
import sys

sys.path.insert(0, r"C:\Users\HP\Downloads\BlueRock\backend")

from app.scrapers.ngx_feed import ngx_live_feed


def main():
    ap = argparse.ArgumentParser(description="Backfill historique OHLC NGX")
    ap.add_argument("--days", type=int, default=365, help="fenêtre historique (défaut 365)")
    ap.add_argument("--limit", type=int, default=None, help="limite de sociétés (test)")
    ap.add_argument("--provider", type=str, default=None,
                    help="twelvedata (defaut) | stooq | ngnmarket")
    ap.add_argument("--no-persist", action="store_true", help="ne pas écrire en base (dry-run)")
    args = ap.parse_args()

    print(f"NGX backfill: days={args.days} limit={args.limit} "
          f"provider={args.provider or 'config'} persist={not args.no_persist}")
    result = ngx_live_feed.backfill(days=args.days, limit=args.limit,
                                    persist=not args.no_persist, provider=args.provider)
    print("Résultat:", result)
    if result.get("status") in ("PLAN_REQUIRED", "ERROR"):
        print("\n[!] Backfill impossible avec cette source. Verifiez la cle "
              "(TWELVEDATA_API_KEY) ou choisissez une autre source (--provider).")
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
