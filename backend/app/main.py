from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from .config import settings
from .core.http_cache import ResponseCacheMiddleware
from .database import engine, Base
from .models.news import NewsItem
from .routers import companies, analysis, market, seed, ingestion, macro, auth, portfolio, premium, brokers, community, challenges, notifications
from apscheduler.schedulers.background import BackgroundScheduler
import os
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

import threading

docs_enabled = settings.DEBUG
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    description="BRVM Financial Intelligence Platform - Analyse fondamentale, scoring, valorisation et IA",
    docs_url="/docs" if docs_enabled else None,
    redoc_url="/redoc" if docs_enabled else None,
    openapi_url="/openapi.json" if docs_enabled else None,
)

app.add_middleware(
    ResponseCacheMiddleware,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|[0-9.]+|.*\.bluerock\.ai|bluerock\.ai|.*\.netlify\.app|netlify\.app)(:\d+)?$",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "img-src 'self' data: https://ui-avatars.com https://www.brvm.org; "
            "style-src 'self' 'unsafe-inline'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            "connect-src 'self' https://www.brvm.org"
        )
        if not settings.DEBUG:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response


app.add_middleware(SecurityHeadersMiddleware)

# En dev, on accepte toutes les origines hôtes (IP LAN du réseau local).
# En prod, strict : domaine + localhost.
if settings.DEBUG:
    allowed_hosts = ["*"]
else:
    allowed_hosts = [h.strip() for h in settings.ALLOWED_HOSTS.split(",") if h.strip()] or ["*"]
app.add_middleware(TrustedHostMiddleware, allowed_hosts=allowed_hosts)

app.include_router(companies.router)
app.include_router(analysis.router)
app.include_router(market.router)
app.include_router(seed.router)
app.include_router(ingestion.router)
app.include_router(macro.router)
app.include_router(auth.router)
app.include_router(portfolio.router)
app.include_router(premium.router)
app.include_router(brokers.router)
app.include_router(community.router)
app.include_router(challenges.router)
app.include_router(notifications.router)

scheduler = BackgroundScheduler()


def _ensure_schema():
    """Micro-migrations de démarrage (colonnes ajoutées sans version Alembic).

    Idempotent : vérifie l'existence de chaque colonne avant ALTER.
    À terme : remplacer par des migrations Alembic versionnées.
    """
    from sqlalchemy import inspect, text
    insp = inspect(engine)
    tables = {
        "market_data": ["is_synthetic"],
        "financial_statements": ["is_synthetic"],
        "dividends": ["is_synthetic"],
        "positions": ["take_profit", "stop_loss"],
        "orders": ["order_type", "limit_price", "status", "take_profit", "stop_loss", "executed_at"],
        "users": [
            "avatar",
            "auth_id",
            "legacy_hash",
            "email_verified",
            "email_verify_code",
            "email_verify_expires",
            "email_verify_attempts",
            "email_verify_sent_at",
            "totp_secret",
            "totp_enabled",
            "recovery_codes",
            "failed_attempts",
            "locked_until",
            "password_reset_code",
            "password_reset_expires",
            "password_reset_attempts",
            "email_notif_enabled",
        ],
        "premium_plans": [
            "status",
            "issued_at",
            "matured_at",
            "cancelled_at",
            "completed_at",
            "allocation_snapshot",
            "start_value",
            "last_value",
            "last_pnl_pct",
            "last_tracked_at",
            "last_day_change_pct",
        ],
        "notifications": ["email_sent"],
        "companies": ["instrument_type"],
    }
    ts_cols = {"email_verify_expires", "email_verify_sent_at", "locked_until", "password_reset_expires", "executed_at",
               "issued_at", "matured_at", "cancelled_at", "completed_at", "last_tracked_at"}
    float_cols = {
        "positions": {"take_profit", "stop_loss"},
        "orders": {"limit_price", "take_profit", "stop_loss"},
        "premium_plans": {"start_value", "last_value", "last_pnl_pct", "last_day_change_pct"},
    }
    with engine.begin() as conn:
        for table, columns in tables.items():
            if table not in insp.get_table_names():
                continue
            existing = {c["name"]: c["type"].__class__.__name__ for c in insp.get_columns(table)}
            for col in columns:
                if col in existing:
                    # Colonnes timestamp déjà créées en VARCHAR (migration initiale) → conversion
                    if col in ts_cols and existing[col] not in ("TIMESTAMP", "DATETIME", "DateTime"):
                        logger.info(f"Schema: converting {table}.{col} to TIMESTAMP")
                        conn.execute(text(f"ALTER TABLE {table} ALTER COLUMN {col} TYPE TIMESTAMP USING {col}::timestamp"))
                    continue
                if col in ("email_verified", "totp_enabled", "email_verify_attempts", "failed_attempts", "password_reset_attempts"):
                    ddl = "BOOLEAN" if col in ("email_verified", "totp_enabled") else "INTEGER"
                    default = "FALSE" if col in ("email_verified", "totp_enabled") else "0"
                    logger.info(f"Schema: adding column {table}.{col}")
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {ddl} NOT NULL DEFAULT {default}"))
                elif col == "auth_id":
                    logger.info(f"Schema: adding column {table}.{col}")
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} UUID"))
                    conn.execute(text(f"CREATE INDEX IF NOT EXISTS idx_users_auth_id ON {table}({col})"))
                elif col in float_cols.get(table, set()):
                    logger.info(f"Schema: adding column {table}.{col}")
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} DOUBLE PRECISION"))
                elif col == "status" and table == "premium_plans":
                    logger.info(f"Schema: adding column {table}.{col}")
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} VARCHAR NOT NULL DEFAULT 'active'"))
                elif col == "email_notif_enabled" and table == "users":
                    logger.info(f"Schema: adding column {table}.{col}")
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} BOOLEAN NOT NULL DEFAULT TRUE"))
                elif col == "email_sent" and table == "notifications":
                    logger.info(f"Schema: adding column {table}.{col}")
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} BOOLEAN NOT NULL DEFAULT FALSE"))
                elif col == "allocation_snapshot":
                    logger.info(f"Schema: adding column {table}.{col}")
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} TEXT"))
                elif col == "instrument_type" and table == "companies":
                    logger.info(f"Schema: adding column {table}.{col}")
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} VARCHAR(20) NOT NULL DEFAULT 'equity'"))
                elif col in ts_cols:
                    logger.info(f"Schema: adding column {table}.{col}")
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} TIMESTAMP"))
                else:
                    logger.info(f"Schema: adding column {table}.{col}")
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} VARCHAR"))


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    try:
        _ensure_schema()
    except Exception as e:
        logger.warning(f"Schema migration skipped: {e}")
    try:
        from .database import SessionLocal
        from .services.community_seed import seed_community
        db = SessionLocal()
        try:
            result = seed_community(db)
            logger.info(f"Community seed: {result.get('status')} ({result.get('posts', 0)} posts)")
        finally:
            db.close()
    except Exception as e:
        logger.warning(f"Could not seed community: {e}")
    try:
        from .database import SessionLocal
        from .services.challenge_seed import seed_challenges
        db = SessionLocal()
        try:
            result = seed_challenges(db)
            logger.info(f"Challenges seed: {result.get('status')} ({result.get('challenges', 0)} défis)")
        finally:
            db.close()
    except Exception as e:
        logger.warning(f"Could not seed challenges: {e}")
    try:
        from .database import SessionLocal
        from .routers.macro import seed_macro
        db = SessionLocal()
        try:
            seed_macro(db)
        finally:
            db.close()
    except Exception as e:
        logger.warning(f"Could not seed macro data: {e}")
    try:
        from .scrapers.news_feed import news_feed

        def _warm_news():
            try:
                news_feed.refresh(force=True)
            except Exception as e:
                logger.warning(f"News warm-up error: {e}")

        threading.Thread(target=_warm_news, daemon=True).start()
    except Exception as e:
        logger.warning(f"Could not warm news feed: {e}")
    try:
        from .scrapers.calendar_feed import calendar_feed
        from .database import SessionLocal

        def _warm_calendar():
            try:
                db = SessionLocal()
                try:
                    calendar_feed.refresh(force=True, db=db)
                finally:
                    db.close()
            except Exception as e:
                logger.warning(f"Calendar warm-up error: {e}")

        threading.Thread(target=_warm_calendar, daemon=True).start()
    except Exception as e:
        logger.warning(f"Could not warm calendar feed: {e}")
    try:
        from .scrapers.live_feed import live_feed
        live_feed.refresh(force=True)

        def _live_job():
            try:
                live_feed.refresh()
            except Exception as e:
                logger.warning(f"Live feed job error: {e}")
            try:
                from .database import SessionLocal
                from .services.order_engine import run_order_engine
                db = SessionLocal()
                try:
                    res = run_order_engine(db)
                    if res["limit"] or res["tp_sl"] or res["cancelled"]:
                        logger.info(
                            "Order engine: %d ordres limit exécutés, %d TP/SL déclenchés, %d ordres annulés",
                            res["limit"], res["tp_sl"], res["cancelled"],
                        )
                finally:
                    db.close()
            except Exception as e:
                logger.warning(f"Order engine error: {e}")

        scheduler.add_job(_live_job, "interval", seconds=30, id="brvm_live", replace_existing=True)
        logger.info("BRVM live feed scheduled (every 30s during market hours)")
    except Exception as e:
        logger.warning(f"Could not start live feed scheduler: {e}")

    try:
        from .scrapers.financial_reports import sync_financials

        _financial_lock = threading.Lock()

        def _financial_sync_job():
            """Ingère automatiquement les rapports financiers nouvellement publiés
            sur brvm.org : extraction PDF → stockage → recalcul ratios/scorecard/valorisation."""
            if not _financial_lock.acquire(blocking=False):
                return
            try:
                from .database import SessionLocal
                db = SessionLocal()
                try:
                    result = sync_financials(db, max_years=2)
                    ingested = sum(len(r["ingested"]) for r in result["results"])
                    logger.info(
                        "Financial sync: %d sociétés analysées, %d rapports ingérés",
                        result["companies"], ingested,
                    )
                finally:
                    db.close()
            except Exception as e:
                logger.warning(f"Financial sync error: {e}")
            finally:
                _financial_lock.release()

        from datetime import datetime, timedelta
        scheduler.add_job(
            _financial_sync_job, "interval", hours=6, id="financial_reports",
            replace_existing=True,
            next_run_time=datetime.now() + timedelta(minutes=2),
        )
        logger.info("Financial reports sync scheduled (every 6h, first run in 2 min)")
    except Exception as e:
        logger.warning(f"Could not schedule financial reports sync: {e}")

    try:
        from .database import SessionLocal
        from .services.premium_tracking import track_all_active

        def _plan_tracking_job():
            """Suivi quotidien des plans patrimoniaux actifs : valorisation,
            snapshots journaliers et génération d'alertes."""
            try:
                db = SessionLocal()
                try:
                    res = track_all_active(db)
                    if res["plans"]:
                        logger.info(
                            "Plan tracking: %d plans suivis, %d snapshots, %d alertes, %d terminés",
                            res["plans"], res["snapshots"], res["alerts"], res["completed"],
                        )
                finally:
                    db.close()
            except Exception as e:
                logger.warning(f"Plan tracking error: {e}")

        scheduler.add_job(_plan_tracking_job, "interval", hours=3, id="premium_tracking",
                          replace_existing=True)
        logger.info("Premium plan tracking scheduled (every 3h)")
    except Exception as e:
        logger.warning(f"Could not schedule premium tracking: {e}")

    try:
        scheduler.start()
    except Exception as e:
        logger.warning(f"Could not start scheduler: {e}")

@app.on_event("shutdown")
def on_shutdown():
    if scheduler.running:
        scheduler.shutdown()

static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "version": settings.VERSION,
        "app": settings.APP_NAME,
        "debug": settings.DEBUG,
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=settings.DEBUG)
