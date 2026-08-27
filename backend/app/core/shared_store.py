"""Store d'état partagé entre instances (Redis) avec repli mémoire.

Pourquoi : le rate limiting, les codes OTP, les échecs de PIN et les locks
de jobs doivent être partagés entre toutes les instances de l'API dès qu'on
passe à plusieurs workers. Tant que REDIS_URL est vide, on utilise un store
en mémoire par processus (correct en mono-instance). Dès que REDIS_URL est
configuré (Upstash Free, etc.), le même code utilise Redis — sans branche
conditionnelle dans les appelants.

Le repli mémoire est également utilisé si Redis devient momentanément
indisponible : le service continue de répondre, avec des garanties
dégradées en multi-instance (limites par processus), et un warning loggé.
"""
from __future__ import annotations

import json  # noqa: F401  (API commune avec Redis decode_responses)
import logging
import secrets
import threading
import time
from typing import Optional

from ..config import settings

logger = logging.getLogger(__name__)

_PREFIX = "bluerock:"

_RELEASE_LUA = """
if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('del', KEYS[1])
end
return 0
"""


class _MemoryBackend:
    """Équivalent fonctionnel minimal de Redis, en mémoire (par processus)."""

    def __init__(self) -> None:
        self._data: dict[str, tuple[str, float]] = {}
        self._lock = threading.Lock()

    def _sweep(self, now: float) -> None:
        # Nettoie les expirés dès 500 entrées ou toutes les 1000 écritures, pas seulement à 10k
        if len(self._data) > 500:
            expired = [k for k, (_, exp) in self._data.items() if exp and exp < now]
            for k in expired:
                self._data.pop(k, None)
        # Trim dur à 10000 pour éviter fuite mémoire
        if len(self._data) > 10000:
            # Supprime les plus anciennes expirations d'abord
            oldest = sorted(self._data.items(), key=lambda kv: kv[1][1] or 0)[:1000]
            for k, _ in oldest:
                self._data.pop(k, None)

    def get(self, key: str) -> Optional[str]:
        with self._lock:
            entry = self._data.get(key)
            if entry is None:
                return None
            value, exp = entry
            if exp and exp < time.time():
                self._data.pop(key, None)
                return None
            return value

    def set(self, key: str, value: str, ttl: Optional[int] = None) -> bool:
        now = time.time()
        exp = now + ttl if ttl else 0
        with self._lock:
            self._data[key] = (value, exp)
            self._sweep(now)
        return True

    def delete(self, key: str) -> None:
        with self._lock:
            self._data.pop(key, None)

    def incr(self, key: str, ttl: Optional[int] = None) -> int:
        now = time.time()
        with self._lock:
            entry = self._data.get(key)
            if entry is None or (entry[1] and entry[1] < now):
                n = 1
                self._data[key] = (str(n), now + ttl if ttl else 0)
            else:
                try:
                    n = int(entry[0]) + 1
                except (TypeError, ValueError):
                    n = 1
                self._data[key] = (str(n), entry[1])
            self._sweep(now)
            return n

    def acquire(self, key: str, token: str, ttl: int) -> bool:
        now = time.time()
        with self._lock:
            entry = self._data.get(key)
            if entry is not None and (not entry[1] or entry[1] > now):
                return False
            self._data[key] = (token, now + ttl)
            self._sweep(now)
            return True

    def release(self, key: str, token: str) -> bool:
        with self._lock:
            entry = self._data.get(key)
            if entry and entry[0] == token:
                self._data.pop(key, None)
                return True
            return False

    def delete_prefix(self, prefix: str) -> None:
        with self._lock:
            for k in [k for k in self._data if k.startswith(prefix)]:
                self._data.pop(k, None)


class SharedStore:
    """Interface commune aux deux back-ends (Redis / mémoire)."""

    def __init__(self, redis_url: Optional[str] = None) -> None:
        self._mem = _MemoryBackend()
        self._redis = None
        self._redis_url = redis_url
        self._last_connect_attempt = 0.0
        if redis_url:
            self._connect()

    def _connect(self) -> None:
        if not self._redis_url:
            return
        try:
            import ssl as _ssl
            from redis import Redis
            client = Redis.from_url(
                self._redis_url,
                decode_responses=True,
                socket_timeout=2,
                socket_connect_timeout=2,
                health_check_interval=30,
                ssl_cert_reqs=_ssl.CERT_NONE,
            )
            client.ping()
            self._redis = client
            logger.info("SharedStore: Redis connecté")
        except Exception as e:
            logger.warning("SharedStore: Redis indisponible (%s) → repli mémoire", e)
            self._redis = None

    def _ensure_redis(self) -> None:
        # Reconnexion lazy si Redis était tombé (retry toutes les 30s)
        if self._redis is None and self._redis_url:
            now = time.time()
            if now - self._last_connect_attempt > 30:
                self._last_connect_attempt = now
                self._connect()

    @property
    def connected(self) -> bool:
        return self._redis is not None

    def _k(self, key: str) -> str:
        return _PREFIX + key

    def get(self, key: str) -> Optional[str]:
        self._ensure_redis()
        if self._redis:
            try:
                return self._redis.get(self._k(key))
            except Exception as e:
                logger.warning("SharedStore: Redis get(%s) échec (%s) → repli mémoire", key, e)
                self._redis = None
        return self._mem.get(key)

    def set(self, key: str, value: str, ttl: Optional[int] = None) -> bool:
        self._ensure_redis()
        if self._redis:
            try:
                return bool(self._redis.set(self._k(key), value, ex=ttl))
            except Exception as e:
                logger.warning("SharedStore: Redis set(%s) échec (%s) → repli mémoire", key, e)
                self._redis = None
        return self._mem.set(key, value, ttl)

    def delete(self, key: str) -> None:
        self._ensure_redis()
        if self._redis:
            try:
                self._redis.delete(self._k(key))
                return
            except Exception as e:
                logger.warning("SharedStore: Redis delete(%s) échec (%s) → repli mémoire", key, e)
                self._redis = None
        self._mem.delete(key)

    _INCR_LUA = """
local n = redis.call('incr', KEYS[1])
if n == 1 and ARGV[1] ~= '0' then
  redis.call('expire', KEYS[1], ARGV[1])
end
return n
"""

    def incr(self, key: str, ttl: Optional[int] = None) -> int:
        self._ensure_redis()
        if self._redis:
            try:
                if ttl:
                    n = self._redis.eval(self._INCR_LUA, 1, self._k(key), str(ttl))
                else:
                    n = self._redis.incr(self._k(key))
                return int(n)
            except Exception as e:
                logger.warning("SharedStore: Redis incr(%s) échec (%s) → repli mémoire", key, e)
                self._redis = None
        return self._mem.incr(key, ttl)

    def acquire_lock(self, key: str, ttl: int = 30) -> Optional[str]:
        """Prend un verrou distribué (non bloquant). Renvoie un jeton si
        obtenu, None sinon. À relâcher via release_lock."""
        self._ensure_redis()
        token = secrets.token_hex(16)
        if self._redis:
            try:
                ok = self._redis.set(self._k(key), token, nx=True, px=ttl * 1000)
                return token if ok else None
            except Exception as e:
                logger.warning("SharedStore: Redis acquire_lock(%s) échec (%s) → repli mémoire", key, e)
                self._redis = None
        return token if self._mem.acquire(key, token, ttl) else None

    def release_lock(self, key: str, token: str) -> None:
        self._ensure_redis()
        if self._redis:
            try:
                self._redis.eval(_RELEASE_LUA, 1, self._k(key), token)
                return
            except Exception as e:
                logger.warning("SharedStore: Redis release_lock(%s) échec (%s) → repli mémoire", key, e)
                self._redis = None
        self._mem.release(key, token)

    # ---- Cache JSON (fil d'actualité, stats) partagé multi-instance ----
    def cache_set(self, key: str, value: object, ttl: int) -> None:
        import json as _json
        try:
            self.set(key, _json.dumps(value, default=str), ttl=ttl)
        except (TypeError, ValueError):
            pass

    def cache_get(self, key: str):
        import json as _json
        raw = self.get(key)
        if raw is None:
            return None
        try:
            return _json.loads(raw)
        except (TypeError, ValueError):
            return None

    def cache_delete_prefix(self, prefix: str) -> None:
        self._ensure_redis()
        if self._redis:
            try:
                cursor = 0
                while True:
                    cursor, keys = self._redis.scan(cursor, match=self._k(prefix) + "*", count=200)
                    if keys:
                        # UNLINK non bloquant si disponible, sinon DELETE
                        try:
                            self._redis.unlink(*keys)
                        except Exception:
                            self._redis.delete(*keys)
                    if cursor == 0:
                        break
                return
            except Exception as e:
                logger.warning("SharedStore: Redis scan(%s) échec (%s) → repli mémoire", prefix, e)
                self._redis = None
        self._mem.delete_prefix(prefix)


store = SharedStore(settings.REDIS_URL)
