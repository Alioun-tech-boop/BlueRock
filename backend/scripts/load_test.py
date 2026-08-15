"""Test de charge ciblé de l'API BlueRock.

Pousse des requêtes GET publiques sur les endpoints chauds (catalogue,
aperçu marché, top performers, live, sparklines, screening, santé) pendant
une durée fixe, à une concurrence donnée, et rapporte par endpoint :
latence moyenne / p50 / p95 / p99, erreurs, débit global.

Usage:
    python scripts/load_test.py [durée_sec] [concurrence]
Env:
    LOAD_URL   URL de base de l'API (défaut: https://bluerock-api.onrender.com)
    LOAD_TICK  période de reprise en secondes (défaut: 0.05)

Le plan free Render est ~0,1 CPU / 512 MB : restez modéré
(30 s à 20-40 requêtes simultanées suffisent pour caractériser la latence).
"""

import asyncio
import os
import random
import statistics
import sys
import time

import httpx

BASE = os.environ.get("LOAD_URL", "https://bluerock-api.onrender.com")

# (path, poids) — poids = probabilité relative de tirage
ENDPOINTS = [
    ("/api/health", 15),
    ("/api/market/overview", 25),
    ("/api/companies", 20),
    ("/api/companies/top-performers", 10),
    ("/api/market/live", 10),
    ("/api/market/sparklines", 10),
    ("/api/analysis/screen", 10),
]
WEIGHTS = [w for _, w in ENDPOINTS]
TOTAL_WEIGHT = sum(WEIGHTS)


def pick_path(rng: random.Random) -> str:
    n = rng.uniform(0, TOTAL_WEIGHT)
    acc = 0
    for (path, w) in ENDPOINTS:
        acc += w
        if n <= acc:
            return path
    return ENDPOINTS[-1][0]


def quantile(sorted_values, q):
    if not sorted_values:
        return 0.0
    idx = int(q * (len(sorted_values) - 1))
    return sorted_values[idx]


async def worker(client, results, deadline, rng, running):
    while time.monotonic() < deadline and running["ok"]:
        path = pick_path(rng)
        t0 = time.perf_counter()
        status = 0
        try:
            r = await client.get(path, timeout=30)
            status = r.status_code
        except Exception:
            status = 0
        dt = (time.perf_counter() - t0) * 1000
        results.append({"path": path, "status": status, "ms": dt})


async def run(duration: int, concurrency: int):
    results = []
    running = {"ok": True}
    rng = random.Random()
    timeout = httpx.Timeout(30.0, connect=10.0)
    limits = httpx.Limits(max_connections=concurrency, max_keepalive_connections=concurrency)
    async with httpx.AsyncClient(base_url=BASE, timeout=timeout, limits=limits) as client:
        deadline = time.monotonic() + duration
        tasks = [asyncio.create_task(worker(client, results, deadline, rng, running))
                 for _ in range(concurrency)]
        await asyncio.gather(*tasks)

    by_path = {}
    for row in results:
        by_path.setdefault(row["path"], []).append(row)

    ok = [r for r in results if r["status"] and 200 <= r["status"] < 500]
    errs = [r for r in results if not r["status"] or r["status"] >= 500]
    total = len(results)
    print(f"\n=== Rapport ({duration}s @ {concurrency} concurrents) — {BASE} ===")
    err_rate = 100.0 * len(errs) / total if total else 0.0
    print(f"Requêtes: {total} | Réussies (2xx/3xx/4xx): {len(ok)} | "
          f"Erreurs (5xx/timeout): {len(errs)} ({err_rate:.1f}%)")
    if total:
        print(f"Taux: {total / duration:.1f} req/s")
    print(f"\n{'Endpoint':<36} {'n':>5} {'moy':>7} {'p50':>7} {'p95':>7} {'p99':>7}  statuts")
    for path, rows in sorted(by_path.items(), key=lambda kv: -len(kv[1])):
        ok_rows = [r for r in rows if r["status"] and 200 <= r["status"] < 500]
        if not ok_rows:
            print(f"{path:<36} {len(rows):>5}    -- (toutes en erreur)")
            continue
        lat = sorted(r["ms"] for r in ok_rows)
        counts = {}
        for r in rows:
            counts[r["status"]] = counts.get(r["status"], 0) + 1
        statuses = ", ".join(f"{s}:{c}" for s, c in sorted(counts.items()))
        print(f"{path:<36} {len(rows):>5} {statistics.mean(lat):>6.0f} {quantile(lat, .5):>6.0f} "
              f"{quantile(lat, .95):>6.0f} {quantile(lat, .99):>6.0f}  {statuses}")


def main():
    duration = int(sys.argv[1]) if len(sys.argv) > 1 else 30
    concurrency = int(sys.argv[2]) if len(sys.argv) > 2 else 20
    asyncio.run(run(duration, concurrency))


if __name__ == "__main__":
    main()
