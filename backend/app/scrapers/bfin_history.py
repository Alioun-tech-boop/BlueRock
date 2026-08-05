"""Historique quotidien BRVM via la Base de Données Financières (bfin.brvm.org).

Source officielle : https://bfin.brvm.org/Default.aspx
Le site expose un sélecteur de date (6 819 séances depuis le 21/09/1998) avec
postback ASP.NET. Chaque réponse contient le tableau « Code | Cours précédent |
Cours jour | Volume échangé | Nombre transactions | Valeur échangée ».
Les dates sans séance (jours fériés) renvoient une erreur 500 et sont ignorées.
"""
import logging
import re
import time
from datetime import date, datetime
from typing import Dict, List, Optional, Tuple

import httpx
from bs4 import BeautifulSoup

_log = logging.getLogger(__name__)

BFIN_URL = "https://bfin.brvm.org/Default.aspx"
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}


class BfinSession:
    """Client postback ASP.NET pour bfin.brvm.org."""

    def __init__(self, delay: float = 0.7):
        self.client = httpx.Client(follow_redirects=True, timeout=90, headers=UA)
        self.delay = delay
        self._viewstate: Dict[str, str] = {}
        self.dates: List[str] = []

    def _extract_viewstate(self, html: str):
        data = {}
        for m in re.finditer(r'name="(__VIEWSTATE\d*)" id="__VIEWSTATE\d*" value="([^"]*)"', html):
            data[m.group(1)] = m.group(2)
        m = re.search(r'name="__VIEWSTATEFIELDCOUNT" id="__VIEWSTATEFIELDCOUNT" value="([^"]*)"', html)
        if m:
            data["__VIEWSTATEFIELDCOUNT"] = m.group(1)
        m = re.search(r'id="__VIEWSTATEGENERATOR" value="([^"]*)"', html)
        if m:
            data["__VIEWSTATEGENERATOR"] = m.group(1)
        m = re.search(r'id="__EVENTVALIDATION" value="([^"]*)"', html)
        if m:
            data["__EVENTVALIDATION"] = m.group(1)
        self._viewstate = data

    def fetch_session_dates(self) -> List[str]:
        """Liste des dates de cotation (yyyymmdd, ordre chronologique)."""
        resp = self.client.get(BFIN_URL)
        resp.raise_for_status()
        self._extract_viewstate(resp.text)
        soup = BeautifulSoup(resp.text, "lxml")
        dd = soup.find("select", {"name": "ctl00$Main$DropDownList1"})
        if not dd:
            raise ValueError("sélecteur de date introuvable sur bfin.brvm.org")
        values = [o.get("value") for o in dd.select("option") if o.get("value")]
        self.dates = sorted(values)
        return self.dates

    def fetch_session(self, date_val: str) -> Optional[List[List[str]]]:
        """Récupère le tableau de cotation d'une date (yyyymmdd).
        Retourne les lignes [code, libellé, prev, jour, volume, ntrans, valeur]
        ou None si la date n'a pas de séance (erreur 500)."""
        if not self._viewstate:
            self.fetch_session_dates()
        data = dict(self._viewstate)
        data["__EVENTTARGET"] = "ctl00$Main$DropDownList1"
        data["__EVENTARGUMENT"] = ""
        data["ctl00$Main$DropDownList1"] = date_val
        for attempt in range(3):
            try:
                resp = self.client.post(BFIN_URL, data=data)
            except httpx.HTTPError:
                time.sleep(3)
                continue
            if resp.status_code == 500:
                return None
            if resp.status_code != 200:
                time.sleep(3)
                continue
            self._extract_viewstate(resp.text)
            soup = BeautifulSoup(resp.text, "lxml")
            for table in soup.select("table"):
                txt = table.get_text(" ", strip=True)
                if txt.startswith("Code") and "Volume" in txt and "Cours jour" in txt:
                    rows = []
                    for tr in table.select("tr")[1:]:
                        cells = [td.get_text(strip=True) for td in tr.select("td,th")]
                        if len(cells) >= 8 and cells[1]:
                            rows.append(cells[:7])
                    if rows:
                        return rows
            return None
        return None

    def close(self):
        try:
            self.client.close()
        except Exception:
            pass


def _parse_amount(text: str) -> Optional[float]:
    text = (text or "").strip().replace(" ", "").replace("\u202f", "").replace("\xa0", "")
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _process_chunk(session_maker, companies: Dict[str, int], chunk: List[str],
                   delay: float, counter, lock) -> Dict:
    """Traite une tranche de dates dans un worker (session DB + client HTTP dédiés)."""
    from ..models.market import MarketData
    db = session_maker()
    client = BfinSession(delay=delay)
    stats = {"fetched": 0, "inserted": 0, "updated": 0, "skipped": 0, "errors": 0}
    try:
        client.fetch_session_dates()  # amorce le viewstate
        for date_val in chunk:
            try:
                rows = client.fetch_session(date_val)
            except Exception:
                stats["errors"] += 1
                continue
            if rows is None:
                stats["skipped"] += 1
            else:
                day = date(int(date_val[:4]), int(date_val[4:6]), int(date_val[6:8]))
                inserted = updated = 0
                for cells in rows:
                    symbol = cells[1].upper()
                    cid = companies.get(symbol)
                    if not cid:
                        continue
                    prev = _parse_amount(cells[3])
                    close = _parse_amount(cells[4])
                    volume = _parse_amount(cells[5])
                    if close is None or close <= 0:
                        continue
                    change = None
                    if prev and prev > 0:
                        change = (close - prev) / prev * 100.0
                    md = db.query(MarketData).filter(
                        MarketData.company_id == cid, MarketData.date == day
                    ).first()
                    if md:
                        md.close_price = close
                        md.volume = volume
                        md.change_percent = change
                        md.source = "BFIN"
                        md.is_synthetic = False
                        updated += 1
                    else:
                        db.add(MarketData(
                            company_id=cid, date=day, close_price=close,
                            volume=volume, change_percent=change, source="BFIN",
                        ))
                        inserted += 1
                db.commit()
                stats["fetched"] += 1
                stats["inserted"] += inserted
                stats["updated"] += updated
            with lock:
                counter["done"] += 1
                counter["skipped"] += int(rows is None)
                counter["inserted"] += inserted
                counter["updated"] += updated
            time.sleep(client.delay)
    except Exception as e:
        _log.warning("[BFIN] worker: %s", e)
    finally:
        client.close()
        db.close()
    return stats


def sync_history(db, delay: float = 0.7, start_date: Optional[str] = None,
                 on_progress=None, existing_dates: Optional[set] = None,
                 workers: int = 1) -> Dict:
    """Importe l'historique complet dans market_data (source BFIN).
    workers > 1 : téléchargement en parallèle (1 session DB + 1 client HTTP par worker).
    Retourne {fetched, inserted, updated, skipped, errors}."""
    from ..models.company import Company
    from ..models.market import MarketData
    from ..database import SessionLocal

    companies = {c.symbol: c.id for c in db.query(Company).all()}
    if not companies:
        raise ValueError("aucune société en base")

    client = BfinSession(delay=delay)
    try:
        dates = client.fetch_session_dates()
    except Exception as e:
        client.close()
        raise ValueError(f"impossible d'obtenir la liste des séances : {e}")
    client.close()

    if start_date:
        dates = [d for d in dates if d >= start_date]

    if existing_dates is None:
        existing_dates = {
            d.isoformat().replace("-", "")
            for (d,) in db.query(MarketData.date).filter(MarketData.source == "BFIN").distinct()
        }
    todo = [d for d in dates if d not in existing_dates]

    stats = {"fetched": 0, "inserted": 0, "updated": 0, "skipped": 0, "errors": 0}
    start = time.time()
    if workers <= 1:
        stats["todo"] = len(todo)
        client = BfinSession(delay=delay)
        try:
            client.fetch_session_dates()
            for i, date_val in enumerate(todo, 1):
                try:
                    rows = client.fetch_session(date_val)
                except Exception:
                    stats["errors"] += 1
                    continue
                if rows is None:
                    stats["skipped"] += 1
                else:
                    day = date(int(date_val[:4]), int(date_val[4:6]), int(date_val[6:8]))
                    inserted = updated = 0
                    for cells in rows:
                        symbol = cells[1].upper()
                        cid = companies.get(symbol)
                        if not cid:
                            continue
                        prev = _parse_amount(cells[3])
                        close = _parse_amount(cells[4])
                        volume = _parse_amount(cells[5])
                        if close is None or close <= 0:
                            continue
                        change = None
                        if prev and prev > 0:
                            change = (close - prev) / prev * 100.0
                        md = db.query(MarketData).filter(
                            MarketData.company_id == cid, MarketData.date == day
                        ).first()
                        if md:
                            md.close_price = close
                            md.volume = volume
                            md.change_percent = change
                            md.source = "BFIN"
                            md.is_synthetic = False
                            updated += 1
                        else:
                            db.add(MarketData(
                                company_id=cid, date=day, close_price=close,
                                volume=volume, change_percent=change, source="BFIN",
                            ))
                            inserted += 1
                    db.commit()
                    stats["fetched"] += 1
                    stats["inserted"] += inserted
                    stats["updated"] += updated

                if i % 20 == 0 or i == len(todo):
                    elapsed = time.time() - start
                    rate = i / elapsed if elapsed > 0 else 0
                    eta = (len(todo) - i) / rate / 60 if rate > 0 else None
                    _log.info("[BFIN] %d/%d (%.1f/s, ETA %.0f min) ins=%d upd=%d skip=%d",
                              i, len(todo), rate, eta or 0, stats["inserted"],
                              stats["updated"], stats["skipped"])
                    if on_progress:
                        try:
                            on_progress({**stats, "done": i, "total": len(todo),
                                         "elapsed_min": elapsed / 60, "eta_min": eta})
                        except Exception:
                            pass
                time.sleep(client.delay)
        finally:
            client.close()
        return {"dates_total": len(dates), "todo": len(todo), **stats}

    import threading
    from concurrent.futures import ThreadPoolExecutor

    chunks = [todo[i::workers] for i in range(workers)]
    chunks = [c for c in chunks if c]
    lock = threading.Lock()
    counter = {"done": 0, "inserted": 0, "updated": 0, "skipped": 0}
    last_report = {"n": 0}

    with ThreadPoolExecutor(max_workers=len(chunks)) as pool:
        futures = [pool.submit(_process_chunk, SessionLocal, companies, ch, delay, counter, lock)
                   for ch in chunks]
        while any(not f.done() for f in futures):
            time.sleep(10)
            with lock:
                done, ins, upd, skipped = counter["done"], counter["inserted"], counter["updated"], counter["skipped"]
            if done != last_report["n"]:
                last_report["n"] = done
                elapsed = time.time() - start
                rate = done / elapsed if elapsed > 0 else 0
                eta = (len(todo) - done) / rate / 60 if rate > 0 else None
                _log.info("[BFIN] %d/%d (%.1f/s, ETA %.0f min) ins=%d upd=%d skip=%d",
                          done, len(todo), rate, eta or 0, ins, upd, skipped)
                if on_progress:
                    try:
                        on_progress({"fetched": done, "inserted": ins, "updated": upd,
                                     "skipped": skipped, "errors": 0,
                                     "done": done, "total": len(todo),
                                     "elapsed_min": elapsed / 60, "eta_min": eta})
                    except Exception:
                        pass

    res = {"fetched": 0, "inserted": 0, "updated": 0, "skipped": 0, "errors": 0}
    for f in futures:
        for k in res:
            res[k] += (f.result() or {}).get(k, 0)
    res["dates_total"] = len(dates)
    res["todo"] = len(todo)
    return res
