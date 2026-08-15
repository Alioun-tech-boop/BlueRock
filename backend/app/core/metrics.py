"""Observabilité légère : métriques Prometheus en mémoire (0 dépendance).

Compteurs thread-safe mis à jour par les handlers HTTP et le worker de jobs
(même processus). Exposés via GET /api/metrics au format Prometheus text.

Cardinalité bornée : les chemins sont normalisés (segments numériques →
{id}) pour que chaque (method, path, status) reste un label stable.
"""

import threading
import time
from typing import Dict, Tuple

_START_MONO = time.monotonic()

_lock = threading.Lock()

# (method, path_normalisé, status) -> count
_requests_total: Dict[Tuple[str, str, int], int] = {}
_requests_inflight = 0
_duration_buckets = [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0]
_duration_hits = [0] * len(_duration_buckets)
_duration_sum = 0.0
_duration_count = 0

_jobs_succeeded = 0
_jobs_failed = 0
_emails_sent = 0


def normalize_path(path: str) -> str:
    parts = []
    for seg in path.split("/"):
        if seg.isdigit():
            seg = "{id}"
        elif len(seg) == 36 and seg.count("-") == 4:
            seg = "{uuid}"
        parts.append(seg)
    return "/".join(parts)


def request_started() -> None:
    global _requests_inflight
    with _lock:
        _requests_inflight += 1


def request_finished(method: str, path: str, status: int, duration: float) -> None:
    global _requests_inflight, _duration_sum, _duration_count
    with _lock:
        _requests_inflight -= 1
        key = (method, normalize_path(path), status)
        _requests_total[key] = _requests_total.get(key, 0) + 1
        _duration_sum += duration
        _duration_count += 1
        for i, b in enumerate(_duration_buckets):
            if duration <= b:
                _duration_hits[i] += 1
                break


def job_succeeded() -> None:
    global _jobs_succeeded
    with _lock:
        _jobs_succeeded += 1


def job_failed() -> None:
    global _jobs_failed
    with _lock:
        _jobs_failed += 1


def email_sent() -> None:
    global _emails_sent
    with _lock:
        _emails_sent += 1


def summary() -> dict:
    with _lock:
        total = sum(_requests_total.values())
        errors = sum(c for (_, _, s), c in _requests_total.items() if s >= 500)
        avg = (_duration_sum / _duration_count) if _duration_count else 0.0
        return {
            "uptime_seconds": round(time.monotonic() - _START_MONO, 1),
            "requests_total": total,
            "requests_5xx": errors,
            "avg_duration_ms": round(avg * 1000, 1),
            "requests_inflight": _requests_inflight,
            "jobs_succeeded": _jobs_succeeded,
            "jobs_failed": _jobs_failed,
            "emails_sent": _emails_sent,
        }


def render_prometheus() -> str:
    with _lock:
        lines = [
            "# HELP bluerock_uptime_seconds Temps écoulé depuis le démarrage du processus.",
            "# TYPE bluerock_uptime_seconds gauge",
            f"bluerock_uptime_seconds {time.monotonic() - _START_MONO:.1f}",
            "# HELP http_requests_total Nombre total de requêtes HTTP traitées.",
            "# TYPE http_requests_total counter",
        ]
        for (m, p, s), c in sorted(_requests_total.items()):
            lines.append(f'http_requests_total{{method="{m}",path="{p}",status="{s}"}} {c}')
        lines += [
            "# HELP http_requests_inflight Requêtes HTTP en cours.",
            "# TYPE http_requests_inflight gauge",
            f"http_requests_inflight {_requests_inflight}",
            "# HELP http_request_duration_seconds Durée des requêtes HTTP (histogramme).",
            "# TYPE http_request_duration_seconds histogram",
        ]
        cumulative = 0
        for i, b in enumerate(_duration_buckets):
            cumulative += _duration_hits[i]
            lines.append(f'http_request_duration_seconds_bucket{{le="{b:g}"}} {cumulative}')
        lines.append(f'http_request_duration_seconds_bucket{{le="+Inf"}} {_duration_count}')
        lines += [
            f"http_request_duration_seconds_sum {_duration_sum:.3f}",
            f"http_request_duration_seconds_count {_duration_count}",
            "# HELP bluerock_jobs_succeeded_total Jobs de la file traités avec succès.",
            "# TYPE bluerock_jobs_succeeded_total counter",
            f"bluerock_jobs_succeeded_total {_jobs_succeeded}",
            "# HELP bluerock_jobs_failed_total Jobs de la file en échec (relance ou abandon).",
            "# TYPE bluerock_jobs_failed_total counter",
            f"bluerock_jobs_failed_total {_jobs_failed}",
            "# HELP bluerock_emails_sent_total Emails envoyés via la file.",
            "# TYPE bluerock_emails_sent_total counter",
            f"bluerock_emails_sent_total {_emails_sent}",
        ]
    return "\n".join(lines) + "\n"
