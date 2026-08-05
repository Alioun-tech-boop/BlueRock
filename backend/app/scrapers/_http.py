"""Shared HTTP helpers for scrapers: retry with exponential backoff + jitter."""
import httpx
import logging
import random
import time
from typing import Optional

logger = logging.getLogger(__name__)

DEFAULT_HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
MAX_ATTEMPTS = 3
BASE_BACKOFF_SECONDS = 1.5
MAX_BACKOFF_SECONDS = 10.0


def get_with_retry(url: str, *, headers: Optional[dict] = None, timeout: float = 30.0,
                   follow_redirects: bool = True) -> httpx.Response:
    """GET with exponential backoff + jitter. Lève la dernière erreur après épuisement."""
    attempt = 0
    while True:
        attempt += 1
        try:
            with httpx.Client(timeout=timeout, follow_redirects=follow_redirects) as client:
                resp = client.get(url, headers=headers or DEFAULT_HEADERS, timeout=timeout)
                resp.raise_for_status()
                return resp
        except Exception as e:
            if attempt >= MAX_ATTEMPTS:
                logger.error(f"GET {url} failed after {MAX_ATTEMPTS} attempts: {e}")
                raise
            backoff = min(BASE_BACKOFF_SECONDS * (2 ** (attempt - 1)) * random.uniform(0.75, 1.25), MAX_BACKOFF_SECONDS)
            logger.warning(f"GET {url} attempt {attempt}/{MAX_ATTEMPTS} failed ({e}); retrying in {backoff:.1f}s")
            time.sleep(backoff)
