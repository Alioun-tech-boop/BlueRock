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


# Codes des actions BRVM (les autres codes de BFIN = obligations / FCTC).
EQUITY_SYMBOLS = frozenset({
    "ABJC", "BICB", "BICC", "BNBC", "BOAB", "BOABF", "BOAC", "BOAM", "BOAN", "BOAS",
    "CABC", "CBIBF", "CFAC", "CIEC", "ECOC", "ETIT", "FTSC", "LNBB", "NEIC", "NSBC",
    "NTLC", "ONTBF", "ORAC", "ORGT", "PALC", "PRSC", "SAFC", "SCRC", "SDCC", "SDSC",
    "SEMC", "SGBC", "SHEC", "SIBC", "SICC", "SIVC", "SLBC", "SMBC", "SNTS", "SOGC",
    "SPHC", "STAC", "STBC", "TTLC", "TTLS", "UNLC", "UNXC",
})


def classify_instrument(code: str, libelle: str = "") -> Optional[str]:
    """Type BRVM d'une ligne BFIN : 'equity' | 'obligation' | 'fcp' | None.
    Les codes non cotés (lignes vides, anomalies) renvoient None."""
    code = (code or "").strip().upper()
    libelle = (libelle or "").strip().upper()
    if not code:
        return None
    if code in EQUITY_SYMBOLS:
        return "equity"
    if "FCTC" in libelle or "FCP " in libelle or libelle.startswith("FCP"):
        return "fcp"
    if (".O" in code or libelle.startswith("ETAT") or "TRESOR" in libelle
            or "BOND" in libelle or "OBLIG" in libelle):
        return "obligation"
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
                 workers: int = 1, refresh_last: int = 0) -> Dict:
    """Importe l'historique complet dans market_data (source BFIN).
    workers > 1 : téléchargement en parallèle (1 session DB + 1 client HTTP par worker).
    refresh_last : toujours re-traiter les N dernières séances, même déjà
    importées (les volumes BFIN sont publiés en fin de journée et peuvent
    être rafraîchis). Retourne {fetched, inserted, updated, skipped, errors}."""
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
        # Une séance n'est « déjà importée » que si au moins une ACTION y a
        # été enregistrée (source BFIN). Une journée ne contenant que des
        # obligations ne doit pas bloquer le re-traitement des actions.
        existing_dates = {
            d.isoformat().replace("-", "")
            for (d,) in db.query(MarketData.date)
            .join(Company, MarketData.company_id == Company.id)
            .filter(Company.instrument_type == "equity",
                    MarketData.source == "BFIN")
            .distinct()
        }
    todo = [d for d in dates if d not in existing_dates]
    if refresh_last > 0:
        todo = sorted(set(todo) | set(dates[-refresh_last:]))

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


def fetch_latest_fixed_income(delay: float = 0.5) -> dict:
    """Dernière séance BFIN : prix des obligations/FCTC (hors actions).
    Retourne {code: {"price": float, "change": float, "name": str, "type": str}}."""
    client = BfinSession(delay=delay)
    try:
        dates = client.fetch_session_dates()
        if not dates:
            return {}
        rows = client.fetch_session(dates[-1])
    except Exception as e:
        _log.warning(f"[BFIN] latest fixed income failed: {e}")
        return {}
    finally:
        client.close()

    out = {}
    day = None
    if rows and dates:
        try:
            day = date(int(dates[-1][:4]), int(dates[-1][4:6]), int(dates[-1][6:8]))
        except ValueError:
            day = None
    for cells in rows or []:
        if len(cells) < 6:
            continue
        code = (cells[1] or "").strip().upper()
        libelle = (cells[2] or "").strip()
        kind = classify_instrument(code, libelle)
        if kind not in ("obligation", "fcp"):
            continue
        prev = _parse_amount(cells[3])
        close = _parse_amount(cells[4])
        if close is None or close <= 0:
            continue
        change = None
        if prev and prev > 0:
            change = (close - prev) / prev * 100.0
        out[code] = {
            "price": close,
            "change": change,
            "name": libelle or code,
            "type": kind,
            "date": day.isoformat() if day else None,
        }
    return out


def _ensure_company(db, company_ids: dict, lock, symbol: str, name: str,
                    kind: str) -> Optional[int]:
    """Récupère ou crée la société (thread-safe) pour un instrument BFIN."""
    symbol = symbol.strip().upper()
    cid = company_ids.get(symbol)
    if cid:
        return cid
    from ..models.company import Company
    with lock:
        cid = company_ids.get(symbol)
        if cid:
            return cid
        co = db.query(Company).filter(Company.symbol == symbol).first()
        if co:
            if co.instrument_type != kind:
                co.instrument_type = kind
                db.commit()
            company_ids[symbol] = co.id
            return co.id
        from ..models.company import Sector
        try:
            co = Company(
                symbol=symbol,
                name=name or symbol,
                sector=Sector.SERVICES_FINANCIERS,
                instrument_type=kind,
                exchange="BRVM",
                currency="XOF",
                country=None,
                description=f"{name or symbol} (BRVM, {kind})",
            )
            db.add(co)
            db.commit()
            db.refresh(co)
        except Exception:
            db.rollback()
            co = db.query(Company).filter(Company.symbol == symbol).first()
            if not co:
                return None
        company_ids[symbol] = co.id
        return co.id


def _process_fixed_chunk(session_maker, company_ids, lock, chunk, delay,
                         counter) -> Dict:
    """Worker : scan d'un lot de dates, créé les sociétés obligations/FCTC
    et enregistre les prix (source BFIN)."""
    from ..models.market import MarketData
    db = session_maker()
    client = BfinSession(delay=delay)
    stats = {"fetched": 0, "inserted": 0, "updated": 0, "skipped": 0, "errors": 0}
    try:
        client.fetch_session_dates()
        for date_val in chunk:
            try:
                rows = client.fetch_session(date_val)
            except Exception:
                stats["errors"] += 1
                continue
            if rows is None:
                stats["skipped"] += 1
                continue
            day = date(int(date_val[:4]), int(date_val[4:6]), int(date_val[6:8]))
            inserted = updated = 0
            for cells in rows:
                if len(cells) < 6:
                    continue
                code = (cells[1] or "").strip().upper()
                libelle = (cells[2] or "").strip()
                kind = classify_instrument(code, libelle)
                if kind not in ("obligation", "fcp"):
                    continue
                close = _parse_amount(cells[4])
                if close is None or close <= 0:
                    continue
                cid = _ensure_company(db, company_ids, lock, code, libelle, kind)
                if not cid:
                    continue
                prev = _parse_amount(cells[3])
                change = None
                if prev and prev > 0:
                    change = (close - prev) / prev * 100.0
                md = db.query(MarketData).filter(
                    MarketData.company_id == cid, MarketData.date == day
                ).first()
                if md:
                    md.close_price = close
                    md.volume = _parse_amount(cells[5])
                    md.change_percent = change
                    md.source = "BFIN"
                    md.is_synthetic = False
                    updated += 1
                else:
                    db.add(MarketData(
                        company_id=cid, date=day, close_price=close,
                        volume=_parse_amount(cells[5]), change_percent=change,
                        source="BFIN",
                    ))
                    inserted += 1
            db.commit()
            stats["fetched"] += 1
            stats["inserted"] += inserted
            stats["updated"] += updated
            with lock:
                counter["done"] += 1
                counter["inserted"] += inserted
                counter["updated"] += updated
            time.sleep(client.delay)
    except Exception as e:
        _log.warning(f"[BFIN] fixed worker: {e}")
    finally:
        client.close()
        db.close()
    return stats


def sync_fixed_income_history(db, delay: float = 0.7, workers: int = 1,
                              start_date: Optional[str] = None,
                              on_progress=None) -> Dict:
    """Historique complet obligations + FCTC depuis BFIN.

    Parcourt toutes les séances et enregistre chaque instrument non « action »
    coté ce jour-là (création idempotente de la société si inconnue).
    Retourne {dates_total, todo, fetched, inserted, updated, skipped, errors,
    companies}.
    """
    import threading
    from concurrent.futures import ThreadPoolExecutor

    from ..database import SessionLocal
    from ..models.company import Company
    from ..models.market import MarketData

    client = BfinSession(delay=delay)
    try:
        dates = client.fetch_session_dates()
    except Exception as e:
        client.close()
        raise ValueError(f"impossible d'obtenir la liste des séances : {e}")
    client.close()

    if start_date:
        dates = [d for d in dates if d >= start_date]
    existing = {
        d.isoformat().replace("-", "")
        for (d,) in db.query(MarketData.date)
        .join(Company, MarketData.company_id == Company.id)
        .filter(Company.instrument_type.in_(["obligation", "fcp"]),
                MarketData.source == "BFIN")
        .distinct()
    }
    todo = [d for d in dates if d not in existing]

    company_ids = {
        c.symbol: c.id for c in db.query(Company)
        .filter(Company.instrument_type.in_(["obligation", "fcp"])).all()
    }
    company_ids.update({c.symbol: c.id for c in db.query(Company).all()})

    stats = {"dates_total": len(dates), "todo": len(todo), "companies": 0,
             "fetched": 0, "inserted": 0, "updated": 0, "skipped": 0, "errors": 0}
    if not todo:
        return stats

    lock = threading.Lock()
    counter = {"done": 0, "inserted": 0, "updated": 0}
    start = time.time()
    chunks = [todo[i::workers] for i in range(workers)]
    chunks = [c for c in chunks if c]

    with ThreadPoolExecutor(max_workers=len(chunks)) as pool:
        futures = [pool.submit(_process_fixed_chunk, SessionLocal, company_ids,
                               lock, ch, delay, counter) for ch in chunks]
        while any(not f.done() for f in futures):
            time.sleep(10)
            with lock:
                done, ins, upd = (counter["done"], counter["inserted"],
                                  counter["updated"])
            if on_progress:
                try:
                    on_progress({"done": done, "total": len(todo),
                                 "inserted": ins, "updated": upd,
                                 "elapsed_min": (time.time() - start) / 60})
                except Exception:
                    pass

    for f in futures:
        r = f.result() or {}
        for k in ("fetched", "inserted", "updated", "skipped", "errors"):
            stats[k] += r.get(k, 0)
    stats["companies"] = len(company_ids)
    return stats
