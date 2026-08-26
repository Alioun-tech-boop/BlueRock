"""Client API NGN Market (https://ngnmarket.com) — données officielles de la
Nigerian Exchange (NGX) : liste des sociétés, prix courants, capitalisation,
volume et logos.

Plan Free : 3 000 appels/mois, prix rafraîchis ~20 min pendant la séance
NGX (lun-ven 09:00-16:00 WAT = 08:00-15:00 UTC).
"""
import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

NGX_OPEN_UTC = (8, 0)     # 09:00 WAT
NGX_CLOSE_UTC = (15, 0)   # 16:00 WAT


def ngx_market_hours(now=None) -> bool:
    """Séance NGX : lundi-vendredi 08:00-15:00 UTC."""
    from datetime import datetime
    now = now or datetime.utcnow()
    if now.weekday() >= 5:
        return False
    t = (now.hour, now.minute)
    return NGX_OPEN_UTC <= t <= NGX_CLOSE_UTC


def _pick(obj: dict, *keys):
    for k in keys:
        v = obj.get(k)
        if v is not None:
            return v
    return None


def _to_float(value) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def normalize_company(raw: dict) -> dict:
    """Normalise un objet société quel que soit le format renvoyé par l'API
    (champs anglais/alternatifs, encapsulé ou non)."""
    symbol = _pick(raw, "symbol", "ticker", "code", "company_code")
    if not symbol:
        return {}
    symbol = str(symbol).strip().upper()
    name = _pick(raw, "name", "company_name", "company", "security_name") or symbol

    price = _to_float(_pick(raw, "price", "current_price", "last_price", "last_traded_price"))
    change = _to_float(_pick(raw, "change", "change_percent", "change_pct", "pct_change",
                             "price_change_percent"))
    if change is not None and abs(change) > 100:  # valeur en points → pourcentage
        prev = _pick(raw, "previous_close", "prev_close")
        if prev and _to_float(prev):
            change = round((price - _to_float(prev)) / _to_float(prev) * 100, 2)

    return {
        "symbol": symbol,
        "name": name,
        "price": price,
        "change": change,
        "volume": _to_float(_pick(raw, "volume", "traded_volume", "total_volume")),
        "market_cap": _to_float(_pick(raw, "market_cap", "market_capitalization")),
        "logo_url": _pick(raw, "logo_url", "logo", "image"),
        "sub_sector": _pick(raw, "sub_sector", "sector", "industry", "segment"),
        "shares_outstanding": _to_float(_pick(raw, "shares_outstanding", "outstanding_shares")),
    }


class PlanRequired(Exception):
    """Le plan actuel (Free) ne permet pas l'historique ; un plan hobby+ est requis."""


class NGNMarketClient:
    """Client HTTP de l'API NGN Market (résilient, jamais bloquant)."""

    def __init__(self, api_key: Optional[str] = None, base_url: str = "https://api.ngnmarket.com/v1"):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")

    @property
    def configured(self) -> bool:
        return bool(self.api_key and self.api_key != "YOUR_NGN_MARKET_API_KEY")

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) BlueRock/1.0",
            "Accept": "application/json",
        }

    def fetch_companies(self) -> list[dict]:
        """Liste officielle des sociétés NGX avec prix courants (paginée).
        Retourne [] si aucune donnée exploitable."""
        if not self.configured:
            logger.warning("NGN Market API : clé absente — flux NGX désactivé")
            return []

        def _unpack(payload: dict) -> list:
            # Enveloppes possibles : {"data": [..]} | {"data": {"data": [..]}}
            # | {"data": {"items"/"results": [..]}} | {"result": [..]}
            raw = _pick(payload, "data", "result", "companies", "results", "items")
            if isinstance(raw, dict):
                raw = _pick(raw, "data", "items", "results", "companies") or raw.get("data")
            if not isinstance(raw, list):
                raw = []
            return raw

        out: list[dict] = []
        page = 1
        max_pages = 5  # 151 sociétés max → 2 pages à 100/requête
        while page <= max_pages:
            try:
                resp = httpx.get(f"{self.base_url}/companies", headers=self._headers(),
                                 params={"page": page, "limit": 100},
                                 timeout=30.0, follow_redirects=True)
                if resp.status_code == 401:
                    logger.warning("NGN Market API : clé invalide ou révoquée (401)")
                    return []
                if resp.status_code == 429:
                    logger.warning("NGN Market API : quota mensuel atteint (429)")
                    return out or []
                resp.raise_for_status()
                payload = resp.json()
            except Exception as e:
                logger.warning(f"NGN Market API : fetch companies failed ({e})")
                return out or []

            if not isinstance(payload, dict):
                return out or []
            raw = _unpack(payload)
            if not raw:
                break
            for item in raw:
                if not isinstance(item, dict):
                    continue
                row = normalize_company(item)
                if row.get("symbol"):
                    out.append(row)

            has_next = False
            data = payload.get("data", {})
            pagination = data.get("pagination") if isinstance(data, dict) else None
            if isinstance(pagination, dict):
                has_next = bool(pagination.get("has_next"))
            if not has_next:
                break
            page += 1

        logger.info(f"NGN Market API : {len(out)} sociétés reçues ({page} page(s))")
        return out

    # ----- historique (plan hobby+) -----

    def fetch_history(self, symbol: str, period: str = "1Y", interval: str = "1d") -> list[dict]:
        """Série de prix historiques OHLC d'une société NGX.

        Nécessite un plan hobby+ (le plan Free renvoie 403 PLAN_REQUIRED).
        Retourne [] si aucune donnée exploitable, et lève PlanRequired si le
        plan courant ne donne pas accès à l'historique.
        """
        if not self.configured:
            logger.warning("NGN Market API : clé absente — historique NGX indisponible")
            return []

        try:
            resp = httpx.get(
                f"{self.base_url}/companies/{symbol}",
                headers=self._headers(),
                params={"period": period, "interval": interval},
                timeout=30.0, follow_redirects=True,
            )
        except Exception as e:
            logger.warning(f"NGN Market API : fetch history {symbol} failed ({e})")
            return []

        if resp.status_code == 401:
            logger.warning("NGN Market API : clé invalide ou révoquée (401)")
            return []
        if resp.status_code == 403:
            code = ""
            try:
                code = (resp.json().get("error") or {}).get("code", "")
            except Exception:
                pass
            if code == "PLAN_REQUIRED":
                raise PlanRequired(f"plan Free insuffisant pour l'historique NGX ({symbol})")
            logger.warning(f"NGN Market API : 403 sur historique {symbol} ({code})")
            return []
        if resp.status_code >= 400:
            logger.warning(f"NGN Market API : {resp.status_code} sur historique {symbol}")
            return []

        try:
            payload = resp.json()
        except Exception:
            return []
        return _extract_bars(payload, symbol)


def _extract_bars(payload, symbol: str) -> list[dict]:
    """Trouve une liste de bougies OHLC dans une réponse de forme inconnue
    (l'enveloppe et le nom du champ historique varient selon l'API NGN Market).
    Scan récursif : on récupère toutes les listes de l'objet et on garde la
    première dont les éléments sont des bougies (date + close)."""
    lists: list = []

    def walk(o):
        if isinstance(o, list):
            lists.append(o)
            for it in o:
                walk(it)
        elif isinstance(o, dict):
            for v in o.values():
                walk(v)

    walk(payload)
    for arr in lists:
        if not arr or not isinstance(arr[0], dict):
            continue
        bars = [normalize_history_item(it) for it in arr if isinstance(it, dict)]
        bars = [b for b in bars if b.get("date") and b.get("close") is not None]
        if bars:
            # deduplique par date (au cas ou plusieurs listes se recoupent)
            seen = set()
            uniq = []
            for b in bars:
                if b["date"] in seen:
                    continue
                seen.add(b["date"])
                uniq.append(b)
            logger.info(f"NGN Market API : {len(uniq)} bougies historiques pour {symbol}")
            return uniq
    return []


def normalize_history_item(raw: dict) -> dict:
    """Normalise une bougie historique (date + open/high/low/close + volume)."""
    date_val = _pick(raw, "date", "trading_date", "timestamp", "time", "datetime", "day")
    parsed = None
    if date_val:
        s = str(date_val)
        for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%SZ", "%d/%m/%Y"):
            try:
                from datetime import datetime
                parsed = datetime.strptime(s[:len(fmt) + 2] if fmt.endswith("Z") else s[:19], fmt.split("T")[0] if "T" not in fmt else fmt).date()
                break
            except Exception:
                continue
    if parsed is None:
        try:
            from datetime import datetime
            parsed = datetime.fromtimestamp(float(date_val)).date() if isinstance(date_val, (int, float)) else None
        except Exception:
            parsed = None

    def _px(*ks):
        return _to_float(_pick(raw, *ks))

    return {
        "date": parsed,
        "open": _px("open", "open_price", "o"),
        "high": _px("high", "high_price", "h"),
        "low": _px("low", "low_price", "l"),
        "close": _px("close", "close_price", "last_price", "price", "c"),
        "volume": _px("volume", "traded_volume", "vol"),
        "market_cap": _px("market_cap", "market_capitalization"),
        "change_percent": _px("change_percent", "change_pct", "change", "pct_change"),
    }


def make_client() -> NGNMarketClient:
    from ..config import settings
    return NGNMarketClient(settings.NGN_MARKET_API_KEY, settings.NGN_MARKET_API_URL)
