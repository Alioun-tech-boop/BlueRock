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

from redis import Redis, RedisError

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
        if len(self._data) > 10000:
            expired = [k for k, (_, exp) in self._data.items() if exp and exp < now]
            for k in expired:
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


class SharedStore:
    """Interface commune aux deux back-ends (Redis / mémoire)."""

    def __init__(self, redis_url: Optional[str] = None) -> None:
        self._mem = _MemoryBackend()
        self._redis: Optional[Redis] = None
        if redis_url:
            try:
                client = Redis.from_url(
                    redis_url,
                    decode_responses=True,
                    socket_timeout=2,
                    socket_connect_timeout=2,
                    health_check_interval=30,
                )
                client.ping()
                self._redis = client
                logger.info("SharedStore: Redis connecté")
            except Exception as e:
                logger.warning("SharedStore: Redis indisponible (%s) → repli mémoire", e)

    @property
    def connected(self) -> bool:
        return self._redis is not None

    def _k(self, key: str) -> str:
        return _PREFIX + key

    def get(self, key: str) -> Optional[str]:
        if self._redis:
            try:
                return self._redis.get(self._k(key))
            except RedisError as e:
                logger.warning("SharedStore: Redis get(%s) échec (%s) → repli mémoire", key, e)
                self._redis = None
        return self._mem.get(key)

    def set(self, key: str, value: str, ttl: Optional[int] = None) -> bool:
        if self._redis:
            try:
                return bool(self._redis.set(self._k(key), value, ex=ttl))
            except RedisError as e:
                logger.warning("SharedStore: Redis set(%s) échec (%s) → repli mémoire", key, e)
                self._redis = None
        return self._mem.set(key, value, ttl)

    def delete(self, key: str) -> None:
        if self._redis:
            try:
                self._redis.delete(self._k(key))
                return
            except RedisError as e:
                logger.warning("SharedStore: Redis delete(%s) échec (%s) → repli mémoire", key, e)
                self._redis = None
        self._mem.delete(key)

    def incr(self, key: str, ttl: Optional[int] = None) -> int:
        if self._redis:
            try:
                n = self._redis.incr(self._k(key))
                if n == 1 and ttl:
                    self._redis.expire(self._k(key), ttl)
                return int(n)
            except RedisError as e:
                logger.warning("SharedStore: Redis incr(%s) échec (%s) → repli mémoire", key, e)
                self._redis = None
        return self._mem.incr(key, ttl)

    def acquire_lock(self, key: str, ttl: int = 30) -> Optional[str]:
        """Prend un verrou distribué (non bloquant). Renvoie un jeton si
        obtenu, None sinon. À relâcher via release_lock."""
        token = secrets.token_hex(16)
        if self._redis:
            try:
                ok = self._redis.set(self._k(key), token, nx=True, px=ttl * 1000)
                return token if ok else None
            except RedisError as e:
                logger.warning("SharedStore: Redis acquire_lock(%s) échec (%s) → repli mémoire", key, e)
                self._redis = None
        return token if self._mem.acquire(key, token, ttl) else None

    def release_lock(self, key: str, token: str) -> None:
        if self._redis:
            try:
                self._redis.eval(_RELEASE_LUA, 1, self._k(key), token)
                return
            except RedisError as e:
                logger.warning("SharedStore: Redis release_lock(%s) échec (%s) → repli mémoire", key, e)
                self._redis = None
        self._mem.release(key, token)


store = SharedStore(settings.REDIS_URL)
