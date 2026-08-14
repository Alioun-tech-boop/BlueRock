"""Backfill historique complet des obligations et FCP/FCTC BRVM depuis
bfin.brvm.org (la seule source publique de prix pour ces instruments).

Usage:
  python scripts/backfill_fixed_income.py                 # passe unique
  python scripts/backfill_fixed_income.py --workers 6     # 6 workers
  python scripts/backfill_fixed_income.py --loop 60       # relance toutes les 60 min
  python scripts/backfill_fixed_income.py --start 20200101

La collecte parcourt toutes les séances (6828 depuis 1998) et enregistre les
instruments non « action » cotés chaque jour : création idempotente des
sociétés (symbole = code BFIN), prix source BFIN. Les dates déjà importées
sont sautées.
"""
import argparse
import logging
import os
import sys
import time
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

_LOCK_PATH = Path(__file__).resolve().parent / ".bfin_backfill.lock"


def _pid_alive(pid: int) -> bool:
    if os.name == "nt":
        import ctypes
        k = ctypes.windll.kernel32
        h = k.OpenProcess(0x1000, False, pid)  # SYNCHRONIZE
        if not h:
            return False
        k.CloseHandle(h)
        return True
    try:
        os.kill(pid, 0)
        return True
    except Exception:
        return False


def _acquire_lock() -> bool:
    """Verrou mono-instance atomique (O_EXCL)."""
    try:
        if _LOCK_PATH.exists():
            try:
                pid = int(_LOCK_PATH.read_text().strip())
            except ValueError:
                pid = 0
            if pid and _pid_alive(pid):
                _log.info("instance ignorée : déjà lancée (PID %d, lock %s)",
                          os.getpid(), _LOCK_PATH.name)
                return False
            try:
                _LOCK_PATH.unlink()  # orphelin
            except OSError:
                pass
        fd = os.open(str(_LOCK_PATH), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.write(fd, str(os.getpid()).encode())
        os.close(fd)
        _log.info("lock %s pris par PID %d", _LOCK_PATH.name, os.getpid())
        return True
    except FileExistsError:
        _log.info("instance ignorée : lock pris à l'instant (PID %d)",
                  os.getpid())
        return False
    except Exception as e:
        _log.warning("lock inutilisable (%s) — on continue", e)
        return True


def _release_lock():
    try:
        if _LOCK_PATH.exists() and _LOCK_PATH.read_text().strip() == str(os.getpid()):
            _LOCK_PATH.unlink()
    except Exception:
        pass


logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(message)s")
_log = logging.getLogger("backfill_fixed_income")


def run(workers: int, start_date: str, on_progress=None) -> dict:
    from app.database import SessionLocal
    from app.scrapers.bfin_history import sync_fixed_income_history

    db = SessionLocal()
    try:
        return sync_fixed_income_history(
            db, delay=0.5, workers=workers, start_date=start_date,
            on_progress=on_progress)
    finally:
        db.close()


def main():
    ap = argparse.ArgumentParser(description="Backfill historique BRVM obligations/FCP")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--start", default=None, help="date de départ yyyymmdd")
    ap.add_argument("--loop", type=int, default=0,
                    help="relance toutes les N minutes (0 = passe unique)")
    args = ap.parse_args()

    _log.info("=== backfill start (workers=%d, start=%s, loop=%s) ===",
              args.workers, args.start, args.loop)
    if not _acquire_lock():
        _log.warning("une instance tourne déjà — sortie")
        return
    try:
        last = {}
        while True:
            started = time.time()

            def progress(info):
                nonlocal last
                if info.get("done", 0) - last.get("done", 0) < 5 and last:
                    return
                last = info
                _log.info("[BFIN] %(done)d/%(total)d ins=%(inserted)d upd=%(updated)d "
                          "elapsed=%(elapsed_min).1f min", info)

            try:
                res = run(args.workers, args.start, on_progress=progress)
            except Exception as e:
                _log.error("backfill failed: %s", e)
                res = {"error": str(e)}

            _log.info("=== passe terminée (%d min) : %s",
                      (time.time() - started) / 60, res)

            if not args.loop:
                break
            _log.info("prochaine passe dans %d min", args.loop)
            time.sleep(args.loop * 60)
    finally:
        _release_lock()


if __name__ == "__main__":
    main()
