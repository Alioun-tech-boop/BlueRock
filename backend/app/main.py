from fastapi import FastAPI, Request, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import Response as FastAPIResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from pydantic import BaseModel
from .config import settings
from .core.http_cache import ResponseCacheMiddleware
from .core.shared_store import store
from .core.request_log import RequestLoggingMiddleware
from .core import metrics
from .database import engine, Base
from .models.news import NewsItem
from .models.broker_connect import BrokerClientAccount, BrokerSession, BrokerLoginEvent
from .models.payment import DepositOrder
from .routers import companies, analysis, market, seed, ingestion, macro, auth, portfolio, premium, brokers, community, challenges, notifications, broker_connect, kyc, kyc_webhook, admin_kyc, payments, subscription
from apscheduler.schedulers.background import BackgroundScheduler
import os
import logging
import secrets
import json
from datetime import datetime

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

import threading
import uuid

# Modèle pour les rapports de violation CSP
class CSPViolationReport(BaseModel):
    report_id: str
    violation_type: str
    uri: str
    severity: str
    referrer: str
    timestamp: str

# Routeur pour le reporting CSP
csp_router = APIRouter()

@csp_router.post("/report")
async def csp_report(report: CSPViolationReport):
    """Endpoint pour recevoir les rapports de violation CSP du navigateur."""
    # Journaliser la violation de sécurité
    logger.warning(
        f"CSP Violation: {report.violation_type} | "
        f"URI: {report.uri} | "
        f"Severity: {report.severity} | "
        f"Referrer: {report.referrer} | "
        f"Report ID: {report.report_id}"
    )
    
    # Ici, on pourrait sauvegarder en base de données, envoyer une alerte, etc.
    # Pour l'exemple, on retourne juste un accusé de réception
    return {
        "status": "received",
        "report_id": report.report_id,
        "timestamp": datetime.utcnow().isoformat()
    }

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
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|.*\.bluerock\.ai|bluerock\.ai|.*\.netlify\.app|netlify\.app)(:\d+)?$",
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
        # Caméra autorisée uniquement pour le flux de vérification hébergé Didit
        # (liveness / selfie) — jamais pour l'application elle-même.
        response.headers["Permissions-Policy"] = (
            f"camera=(self \"{settings.DIDIT_FRAME_ORIGIN}\"), microphone=(), geolocation=()"
        )
        # Générer un nonce unique par requête pour le CSP
        nonce = secrets.token_hex(16)
    
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            f"frame-src {settings.DIDIT_FRAME_ORIGIN}; "
            "img-src 'self' data: https://ui-avatars.com https://www.brvm.org; "
            "style-src 'self' 'unsafe-inline'; "
            f"script-src 'self' 'unsafe-inline' 'nonce-{nonce}'; "
            "connect-src 'self' https://www.brvm.org; "
            "font-src 'self' data:; "
            "object-src 'none'; "
            "base-uri 'self'; "
            "frame-ancestors 'none'; "
            "upgrade-insecure-requests; "
            "block-all-mixed-content;"
            f"report-uri /api/csp/report;"
        )
        if not settings.DEBUG:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    
        response.headers["X-CSP-Nonce"] = nonce
        response.headers["Set-Cookie"] = f"csp_nonce={nonce}; Path=/; Max-Age=3600; SameSite=Lax"
        return response


app.add_middleware(SecurityHeadersMiddleware)


class AllowedHostsMiddleware(BaseHTTPMiddleware):
    """Validation du Host header (production) avec exemption de /api/health.

    Équivalent du TrustedHostMiddleware, mais les probes de santé passent
    toujours : Render (et d'autres load balancers) envoient parfois le health
    check avec un Host interne (IP de conteneur) qui ne matche aucune entrée
    de ALLOWED_HOSTS — le refuser fait échouer le déploiement alors que
    /api/health ne renvoie aucun donnée sensible.
    """

    def __init__(self, app, allowed_hosts):
        super().__init__(app)
        self.allowed_hosts = allowed_hosts

    async def dispatch(self, request, call_next):
        if self.allowed_hosts != ["*"]:
            host = (request.headers.get("host") or "").lower().rsplit(":", 1)[0]
            allowed = any(
                host.endswith(p) if p.startswith(".") else host == p
                for p in self.allowed_hosts
            )
            if not allowed and request.url.path != "/api/health":
                logger.warning("Host header rejeté: %r (path=%s)", host, request.url.path)
                return Response("Invalid host header", status_code=400)
        return await call_next(request)


# En dev, on accepte toutes les origines hôtes (IP LAN du réseau local).
# En prod, strict : domaine + localhost.
if settings.DEBUG:
    allowed_hosts = ["*"]
else:
    allowed_hosts = [h.strip() for h in settings.ALLOWED_HOSTS.split(",") if h.strip()] or ["*"]
app.add_middleware(AllowedHostsMiddleware, allowed_hosts=allowed_hosts)

# Dernier middleware ajouté = le plus externe : mesure la durée totale de la
# chaîne (cache, en-têtes de sécurité, validation Host compris) et journalise
# chaque requête en JSON (event=http_request) avec un X-Request-Id.
app.add_middleware(RequestLoggingMiddleware)

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
app.include_router(broker_connect.router)
app.include_router(community.router)
app.include_router(challenges.router)
app.include_router(notifications.router)
app.include_router(kyc.router)
app.include_router(kyc_webhook.router)
app.include_router(admin_kyc.router)
app.include_router(payments.router)
app.include_router(subscription.router)

app.include_router(csp_router)

scheduler = BackgroundScheduler()


def _schema_managed_by_alembic() -> bool:
    """Le schéma est géré par Alembic dès que la table alembic_version existe
    (baseline stampée). Dans ce régime, les micro-migrations legacy (ALTER
    ad-hoc au démarrage) sont désactivées ; les backfills de données restent."""
    from sqlalchemy import inspect
    return "alembic_version" in set(inspect(engine).get_table_names())


def _migrate_v2():
    """Découplage auth → portefeuilles (v2) : les comptes portefeuille ne sont
    plus rattachés directement à l'utilisateur.

    - accounts → portfolios (entité indépendante, sans user_id)
    - positions/orders.account_id → portfolio_id
    - premium_plans.managed_account_id → managed_portfolio_id
    - user_portfolios : table de liaison utilisateur ↔ portefeuille
      (un utilisateur peut créer plusieurs comptes portefeuille).

    Idempotent : vérifie l'existence des objets avant chaque ALTER.
    Exécutée AVANT create_all pour que les données de `accounts` survivent.

    Cette étape est un héritage pré-Alembic : elle ne s'exécute plus
    lorsque le schéma est versionné (baseline stampée sur la base existante).
    """
    if _schema_managed_by_alembic():
        logger.info("Schema v2: legacy migration ignorée (schéma géré par Alembic)")
        return
    from sqlalchemy import inspect, text
    with engine.begin() as conn:
        insp = inspect(engine)
        tables = set(insp.get_table_names())

        def cols(t):
            return {c["name"] for c in insp.get_columns(t)} if t in tables else set()

        # 1. accounts → portfolios
        if "accounts" in tables and "portfolios" not in tables:
            logger.info("Schema v2: renaming accounts → portfolios")
            conn.execute(text("ALTER TABLE accounts RENAME TO portfolios"))
            tables = set(inspect(engine).get_table_names())

        # 2. Colonnes account_id → portfolio_id
        if "positions" in tables and "account_id" in cols("positions") and "portfolio_id" not in cols("positions"):
            logger.info("Schema v2: positions.account_id → portfolio_id")
            conn.execute(text("ALTER TABLE positions RENAME COLUMN account_id TO portfolio_id"))
        if "orders" in tables and "account_id" in cols("orders") and "portfolio_id" not in cols("orders"):
            logger.info("Schema v2: orders.account_id → portfolio_id")
            conn.execute(text("ALTER TABLE orders RENAME COLUMN account_id TO portfolio_id"))
        if "premium_plans" in tables and "managed_account_id" in cols("premium_plans") and "managed_portfolio_id" not in cols("premium_plans"):
            logger.info("Schema v2: premium_plans.managed_account_id → managed_portfolio_id")
            conn.execute(text("ALTER TABLE premium_plans RENAME COLUMN managed_account_id TO managed_portfolio_id"))

        # 3. user_portfolios (table de liaison) + backfill depuis portfolios.user_id
        if "portfolios" in tables:
            pcols = cols("portfolios")
            if "user_portfolios" not in tables:
                logger.info("Schema v2: creating user_portfolios")
                conn.execute(text(
                    "CREATE TABLE user_portfolios ("
                    " id SERIAL PRIMARY KEY,"
                    " user_id INTEGER NOT NULL REFERENCES users(id),"
                    " portfolio_id INTEGER NOT NULL REFERENCES portfolios(id),"
                    " is_owner BOOLEAN NOT NULL DEFAULT TRUE,"
                    " created_at TIMESTAMP DEFAULT NOW()"
                    ")"
                ))
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_user_portfolios_user_id ON user_portfolios(user_id)"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_user_portfolios_portfolio_id ON user_portfolios(portfolio_id)"))
                tables = set(inspect(engine).get_table_names())
            if "user_id" in pcols:
                logger.info("Schema v2: backfilling user_portfolios from portfolios.user_id")
                conn.execute(text(
                    "INSERT INTO user_portfolios (user_id, portfolio_id, is_owner, created_at) "
                    "SELECT p.user_id, p.id, TRUE, p.created_at FROM portfolios p "
                    "WHERE p.user_id IS NOT NULL"
                ))
                conn.execute(text("ALTER TABLE portfolios DROP COLUMN user_id"))
                conn.execute(text("DROP INDEX IF EXISTS ix_accounts_user_id"))
                conn.execute(text("DROP INDEX IF EXISTS idx_accounts_user_id"))
                conn.execute(text("ALTER TABLE portfolios DROP CONSTRAINT IF EXISTS accounts_user_id_fkey"))


def _ensure_schema():
    """Micro-migrations de démarrage (colonnes ajoutées sans version Alembic).

    Idempotent : vérifie l'existence de chaque colonne avant ALTER.
    À terme : remplacer par des migrations Alembic versionnées.

    Les ALTER ad hoc sont désactivés dès que le schéma est géré par Alembic
    (table alembic_version présente) ; les backfills de données ci-dessous,
    data-only et idempotents, s'exécutent dans tous les cas.
    """
    from sqlalchemy import inspect, text
    insp = inspect(engine)
    tables = {
        "market_data": ["is_synthetic"],
        "financial_statements": ["is_synthetic"],
        "dividends": ["is_synthetic"],
        "positions": ["take_profit", "stop_loss", "portfolio_id"],
        "orders": ["order_type", "limit_price", "status", "take_profit", "stop_loss", "executed_at", "plan_id", "portfolio_id", "broker_ref"],
        "portfolios": ["broker_client_id"],
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
            "linked_to_portfolio",
            "linked_at",
            "managed_portfolio_id",
            "pin_hash",
        ],
        "notifications": ["email_sent"],
        "companies": ["instrument_type"],
        "challenges": ["entry_fee", "registration_end"],
        "challenge_positions": ["current_price"],
        "broker_accounts": [
            "kyc_id",
            "sgi_note",
            "user_response",
            "transmitted_at",
            "reviewed_at",
            "account_opened_at",
        ],
        "user_kyc": [
            "first_name",
            "last_name",
            "invest_experience",
            "invest_objectives",
            "invest_knowledge",
            "risk_tolerance",
            "invest_horizon",
            "verified_at",
        ],
        "kyc_verifications": [
            "session_status",
            "verification_url",
            "decision",
        ],
    }
    ts_cols = {"email_verify_expires", "email_verify_sent_at", "locked_until", "password_reset_expires", "executed_at",
               "issued_at", "matured_at", "cancelled_at", "completed_at", "last_tracked_at", "linked_at",
               "registration_end", "transmitted_at", "reviewed_at", "account_opened_at", "verified_at"}
    float_cols = {
        "positions": {"take_profit", "stop_loss"},
        "orders": {"limit_price", "take_profit", "stop_loss"},
        "premium_plans": {"start_value", "last_value", "last_pnl_pct", "last_day_change_pct"},
        "challenges": {"entry_fee"},
        "challenge_positions": {"current_price"},
    }
    with engine.begin() as conn:
        if _schema_managed_by_alembic():
            logger.info("Schema: micro-migrations legacy désactivées (gérées par Alembic)")
            tables = {}
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
                    if col == "broker_client_id" and existing[col] == "VARCHAR":
                        logger.info(f"Schema: converting {table}.{col} to INTEGER")
                        conn.execute(text(f"ALTER TABLE {table} ALTER COLUMN {col} TYPE INTEGER USING NULLIF({col}, '')::integer"))
                    continue
                if col in ("email_verified", "totp_enabled", "linked_to_portfolio",
                           "email_verify_attempts", "failed_attempts", "password_reset_attempts"):
                    if col in ("email_verified", "totp_enabled", "linked_to_portfolio"):
                        ddl, default = "BOOLEAN", "FALSE"
                    else:
                        ddl, default = "INTEGER", "0"
                    logger.info(f"Schema: adding column {table}.{col}")
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {ddl} NOT NULL DEFAULT {default}"))
                elif col == "plan_id" and table == "orders":
                    logger.info(f"Schema: adding column {table}.{col}")
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} INTEGER"))
                    conn.execute(text(f"CREATE INDEX IF NOT EXISTS idx_orders_plan_id ON {table}({col})"))
                elif col == "portfolio_id" and table in ("positions", "orders"):
                    logger.info(f"Schema: adding column {table}.{col}")
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} INTEGER"))
                    conn.execute(text(f"CREATE INDEX IF NOT EXISTS idx_{table}_portfolio_id ON {table}({col})"))
                elif col == "managed_portfolio_id" and table == "premium_plans":
                    logger.info(f"Schema: adding column {table}.{col}")
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} INTEGER"))
                    conn.execute(text("CREATE INDEX IF NOT EXISTS idx_premium_plans_managed_portfolio ON premium_plans(managed_portfolio_id)"))
                elif col == "broker_ref" and table == "orders":
                    logger.info(f"Schema: adding column {table}.{col}")
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} VARCHAR"))
                    conn.execute(text(f"CREATE INDEX IF NOT EXISTS idx_orders_broker_ref ON {table}({col})"))
                elif col == "broker_client_id" and table == "portfolios":
                    logger.info(f"Schema: adding column {table}.{col}")
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} INTEGER"))
                    conn.execute(text(f"CREATE INDEX IF NOT EXISTS idx_portfolios_broker_client_id ON {table}({col})"))
                elif col == "kyc_id" and table == "broker_accounts":
                    logger.info(f"Schema: adding column {table}.{col}")
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} INTEGER"))
                    conn.execute(text(f"CREATE INDEX IF NOT EXISTS idx_broker_accounts_kyc_id ON {table}({col})"))
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

        # Backfill : dossier historique rempli via full_name → découpage
        # "nom prénom(s)" (legacy) dans first_name / last_name.
        if "user_kyc" in insp.get_table_names():
            conn.execute(text(
                "UPDATE user_kyc SET "
                "last_name = SPLIT_PART(full_name, ' ', 1), "
                "first_name = LTRIM(SUBSTRING(full_name FROM POSITION(' ' IN full_name) + 1)) "
                "WHERE full_name IS NOT NULL AND full_name <> '' "
                "AND (first_name IS NULL OR first_name = '')"
            ))

        # Portefeuilles de défis : initialise le dernier cours synchronisé à
        # partir du prix moyen d'entrée (la tâche de sync mettra à jour au marché).
        if "challenge_positions" in insp.get_table_names():
            conn.execute(text(
                "UPDATE challenge_positions SET current_price = COALESCE(current_price, avg_price) "
                "WHERE current_price IS NULL"
            ))

        # Comptes portefeuille : portfolio par défaut + rattachement des données
        # existantes (backfill idempotent).
        if "portfolios" in insp.get_table_names() and "user_portfolios" in insp.get_table_names():
            rows = conn.execute(text(
                "SELECT u.id, u.account_type, u.broker_name FROM users u "
                "WHERE NOT EXISTS (SELECT 1 FROM user_portfolios up "
                "JOIN portfolios pf ON pf.id = up.portfolio_id WHERE up.user_id = u.id)"
            )).fetchall()
            for uid, atype, bname in rows:
                name = bname or ("Compte réel" if atype == "real" else "Compte démo")
                ptype = "real" if atype == "real" else "demo"
                balance = 0 if atype == "real" else 100000000
                pf_id = conn.execute(text(
                    "INSERT INTO portfolios (name, type, broker_name, balance, is_default, created_at) "
                    "VALUES (:n, :t, :b, :bal, TRUE, NOW()) RETURNING id"
                ), {"n": name, "t": ptype, "b": bname, "bal": balance}).scalar()
                conn.execute(text(
                    "INSERT INTO user_portfolios (user_id, portfolio_id, is_owner, created_at) "
                    "VALUES (:u, :p, TRUE, NOW())"
                ), {"u": uid, "p": pf_id})
            conn.execute(text(
                "UPDATE positions SET portfolio_id = (SELECT pf.id FROM portfolios pf "
                "JOIN user_portfolios up ON up.portfolio_id = pf.id "
                "WHERE up.user_id = positions.user_id AND pf.is_default = TRUE) "
                "WHERE portfolio_id IS NULL"
            ))
            conn.execute(text(
                "UPDATE orders SET portfolio_id = (SELECT pf.id FROM portfolios pf "
                "JOIN user_portfolios up ON up.portfolio_id = pf.id "
                "WHERE up.user_id = orders.user_id AND pf.is_default = TRUE) "
                "WHERE portfolio_id IS NULL"
            ))

        # Défis : unicité du nom des challenges (empêche les doublons générés
        # par un seed ré-exécuté ou une casse variable en multi-workers).
        if "challenges" in insp.get_table_names():
            dups = conn.execute(text(
                "SELECT id FROM challenges c WHERE c.id <> (SELECT MIN(c2.id) FROM challenges c2 "
                "WHERE LOWER(c2.name) = LOWER(c.name))"
            )).fetchall()
            if dups:
                logger.info("Schema: purging %d duplicate challenge(s)", len(dups))
                for (cid,) in dups:
                    eids = [r[0] for r in conn.execute(text(
                        "SELECT id FROM challenge_entries WHERE challenge_id = :c"), {"c": cid}).fetchall()]
                    if eids:
                        pids = [r[0] for r in conn.execute(text(
                            "SELECT id FROM challenge_portfolios WHERE entry_id IN :e"),
                            {"e": tuple(eids)}).fetchall()] if eids else []
                        if pids:
                            conn.execute(text(
                                "DELETE FROM challenge_trades WHERE portfolio_id IN :p"), {"p": tuple(pids)})
                            conn.execute(text(
                                "DELETE FROM challenge_positions WHERE portfolio_id IN :p"), {"p": tuple(pids)})
                        conn.execute(text(
                            "DELETE FROM challenge_value_snapshots WHERE entry_id IN :e"), {"e": tuple(eids)})
                        conn.execute(text(
                            "DELETE FROM challenge_portfolios WHERE entry_id IN :e"), {"e": tuple(eids)})
                        conn.execute(text(
                            "DELETE FROM challenge_entries WHERE challenge_id = :c"), {"c": cid})
                    conn.execute(text("DELETE FROM challenges WHERE id = :c"), {"c": cid})
            conn.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_challenges_name_lower "
                "ON challenges (LOWER(name))"
            ))

        # KYC : migration des statuts historiques vers les statuts de la spec
        # (incomplete → not_started, submitted → verification_in_progress,
        # approved → verified, additional_info → review_required).
        if "user_kyc" in insp.get_table_names():
            migrated = {
                "incomplete": "not_started",
                "submitted": "verification_in_progress",
                "approved": "verified",
                "additional_info": "review_required",
            }
            for old, new in migrated.items():
                conn.execute(text(
                    "UPDATE user_kyc SET status = :new WHERE status = :old"
                ), {"old": old, "new": new})


def _jobs_enabled() -> bool:
    """Un seul worker doit exécuter les jobs planifiés (scheduler en mémoire).

    WORKER_JOBS=1 (ou true/yes/on) active le scheduler sur ce processus ;
    WORKER_JOBS=0 (ou false/no/off) le désactive. Variable absente =
    comportement historique (actif), typique du dev single-process.

    Depuis le passage au SharedStore, chaque job prend aussi un verrou
    distribué : même si plusieurs instances tournent avec WORKER_JOBS=1,
    un seul exécute réellement le job à la fois (anti double-exécution).
    """
    raw = os.environ.get("WORKER_JOBS")
    if raw is None:
        return True
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _job_guard(name: str, ttl_seconds: int):
    """Verrou distribué pour un job planifié (SharedStore / Redis).

    Renvoie un jeton si le verrou est obtenu (ce worker exécute le job),
    None si un autre worker le détient déjà (on saute ce tour)."""
    token = store.acquire_lock(f"job:{name}", ttl=ttl_seconds)
    return token


@app.on_event("startup")
def on_startup():
    try:
        _migrate_v2()
    except Exception as e:
        logger.warning(f"Schema v2 migration skipped: {e}")
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
        from .services.challenge_seed import (
            seed_challenges, ensure_open_challenge, ensure_competition_challenge,
            prune_legacy_challenges,
        )
        db = SessionLocal()
        try:
            prune_legacy_challenges(db)
            result = seed_challenges(db)
            logger.info(f"Challenges seed: {result.get('status')} ({result.get('challenges', 0)} défis)")
            open_result = ensure_open_challenge(db)
            logger.info(f"Open challenge seed: {open_result.get('status')} "
                        f"(id={open_result.get('challenge_id')})")
            comp_result = ensure_competition_challenge(db)
            logger.info(f"Competition challenge seed: {comp_result.get('status')} "
                        f"(id={comp_result.get('challenge_id')})")
        finally:
            db.close()
    except Exception as e:
        logger.warning(f"Could not seed challenges: {e}")
    try:
        from .database import SessionLocal
        from .services.broker_connect_seed import purge_broker_client_accounts
        db = SessionLocal()
        try:
            result = purge_broker_client_accounts(db)
            logger.info(f"Broker connect purge: {result.get('status')} "
                        f"({result.get('deleted', 0)} comptes démo supprimés)")
        finally:
            db.close()
    except Exception as e:
        logger.warning(f"Could not purge broker client accounts: {e}")
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

        def _warm_market_feeds():
            """Warm-up des flux de marché (BRVM puis NGX) en arrière-plan.

            Exécutés séquentiellement dans un thread daemon : le démarrage HTTP
            n'est plus bloqué et le pic mémoire du warm-up est lissé (au lieu
            d'un chargement simultané qui dépassait 512 MB sur le plan free).
            """
            import time
            time.sleep(2)
            try:
                live_feed.refresh(force=True)
            except Exception as e:
                logger.warning(f"Live feed warm-up error: {e}")
            if getattr(settings, "NGX_ENABLED", True):
                try:
                    from .scrapers.ngx_feed import ngx_live_feed
                    ngx_live_feed.refresh(force=True)
                except Exception as e:
                    logger.warning(f"NGX feed warm-up error: {e}")

        threading.Thread(target=_warm_market_feeds, daemon=True).start()
    except Exception as e:
        logger.warning(f"Could not warm market feeds: {e}")
    if getattr(settings, "NGX_ENABLED", True):
        try:
            from .database import SessionLocal
            from .services.ngx_seed import seed_ngx_catalog, sync_ngx_from_api
            db = SessionLocal()
            try:
                res = seed_ngx_catalog(db)
                if res["created"]:
                    logger.info(f"NGX catalog seed: {res['created']} sociétés créées "
                                f"({res['updated']} mises à jour)")
            finally:
                db.close()
        except Exception as e:
            logger.warning(f"Could not seed NGX catalog: {e}")

    jobs_on = _jobs_enabled()
    if not jobs_on:
        logger.info("Scheduler désactivé sur ce worker (WORKER_JOBS != 1)")
    if jobs_on:
        try:
            from .scrapers.live_feed import live_feed

            def _live_job():
                token = _job_guard("brvm_live", 25)
                if token is None:
                    return
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
                                "Order engine: %d ordres limit exécutés, %d TP/SL déclenchés, %d ordres annulés (%d prix temps réel)",
                                res["limit"], res["tp_sl"], res["cancelled"], res.get("realtime", 0),
                            )
                    finally:
                        db.close()
                except Exception as e:
                    logger.warning(f"Order engine error: {e}")
                finally:
                    store.release_lock("job:brvm_live", token)

            scheduler.add_job(_live_job, "interval", seconds=30, id="brvm_live", replace_existing=True)
            logger.info("BRVM live feed scheduled (every 30s during market hours)")
        except Exception as e:
            logger.warning(f"Could not start live feed scheduler: {e}")

    if jobs_on and getattr(settings, "NGX_ENABLED", True):
        try:
            from .scrapers.ngx_feed import ngx_live_feed

            def _ngx_job():
                token = _job_guard("ngx_live", 50)
                if token is None:
                    return
                try:
                    ngx_live_feed.refresh()
                except Exception as e:
                    logger.warning(f"NGX live feed job error: {e}")
                finally:
                    store.release_lock("job:ngx_live", token)

            scheduler.add_job(_ngx_job, "interval", seconds=60, id="ngx_live",
                              replace_existing=True)
            logger.info("NGX live feed scheduled (every 60s, throttle 20min en séance)")
        except Exception as e:
            logger.warning(f"Could not start NGX feed scheduler: {e}")

    if jobs_on:
        try:
            from .scrapers.news_feed import news_feed

            def _news_job():
                """Scrape des news en continu (temps réel) : Google/Bing News,
                flux BRVM et presse — indépendant des requêtes clients."""
                token = _job_guard("news_refresh", 150)
                if token is None:
                    return
                try:
                    news_feed.refresh(force=True)
                except Exception as e:
                    logger.warning(f"News refresh job error: {e}")
                finally:
                    store.release_lock("job:news_refresh", token)

            scheduler.add_job(_news_job, "interval", seconds=180,
                              id="news_refresh", replace_existing=True)
            logger.info("News feed scheduled (every 180s, scraping en continu)")
        except Exception as e:
            logger.warning(f"Could not start news scheduler: {e}")

    if jobs_on and settings.FINANCIAL_SYNC_ENABLED:
        try:
            from .scrapers.financial_reports import sync_financials

            def _financial_sync_job():
                """Ingère automatiquement les rapports financiers nouvellement publiés
                sur brvm.org : extraction PDF → stockage → recalcul ratios/scorecard/valorisation."""
                token = _job_guard("financial_reports", 1800)
                if token is None:
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
                    store.release_lock("job:financial_reports", token)

            from datetime import datetime, timedelta
            scheduler.add_job(
                _financial_sync_job, "interval", hours=6, id="financial_reports",
                replace_existing=True,
                next_run_time=datetime.now() + timedelta(minutes=2),
            )
            logger.info("Financial reports sync scheduled (every 6h, first run in 2 min)")
        except Exception as e:
            logger.warning(f"Could not schedule financial reports sync: {e}")
    else:
        logger.info("Financial reports sync désactivé (FINANCIAL_SYNC_ENABLED=false)")

    if jobs_on:
        try:
            from .database import SessionLocal
            from .services.premium_tracking import track_all_active

            def _plan_tracking_job():
                """Suivi quotidien des plans patrimoniaux actifs : valorisation,
                snapshots journaliers, alertes et rééquilibrage automatique des
                plans liés au portefeuille."""
                token = _job_guard("premium_tracking", 1800)
                if token is None:
                    return
                try:
                    db = SessionLocal()
                    try:
                        res = track_all_active(db)
                        if res["plans"]:
                            logger.info(
                                "Plan tracking: %d plans suivis, %d snapshots, %d alertes, %d terminés",
                                res["plans"], res["snapshots"], res["alerts"], res["completed"],
                            )
                        from .services.rebalancer import rebalance_linked
                        rb = rebalance_linked(db)
                        if rb["orders"]:
                            logger.info("Auto-rebalance: %d plans gérés, %d ordres passés",
                                        rb["plans"], rb["orders"])
                    finally:
                        db.close()
                except Exception as e:
                    logger.warning(f"Plan tracking error: {e}")
                finally:
                    store.release_lock("job:premium_tracking", token)

            scheduler.add_job(_plan_tracking_job, "interval", hours=3, id="premium_tracking",
                              replace_existing=True)
            logger.info("Premium plan tracking scheduled (every 3h)")
        except Exception as e:
            logger.warning(f"Could not schedule premium tracking: {e}")

    if jobs_on:
        try:
            from .routers.challenges import sync_challenge_portfolios

            def _challenge_sync_job():
                """Synchronise les portefeuilles de défis avec les cours réels du
                marché : positions marquées au prix live (sinon clôture) et
                snapshot de valeur du jour actualisé pour le sparkline."""
                token = _job_guard("challenge_market_sync", 50)
                if token is None:
                    return
                try:
                    from .database import SessionLocal
                    db = SessionLocal()
                    try:
                        res = sync_challenge_portfolios(db)
                        if not res["priced"] and res["entries"]:
                            logger.info(
                                "Challenge sync: %d comptes, marché fermé (dernière clôture)", res["entries"])
                    finally:
                        db.close()
                except Exception as e:
                    logger.warning(f"Challenge sync error: {e}")
                finally:
                    store.release_lock("job:challenge_market_sync", token)

            scheduler.add_job(_challenge_sync_job, "interval", seconds=60,
                              id="challenge_market_sync", replace_existing=True)
            logger.info("Challenge market sync scheduled (every 60s)")
        except Exception as e:
            logger.warning(f"Could not schedule challenge sync: {e}")

    if jobs_on:
        try:
            from .services.job_worker import drain_once

            def _queue_drain_job():
                """Draine la file PostgreSQL (emails, traitement KYC, …).

                Le verrou distribué garantit qu'un seul worker traite la file à
                la fois ; `FOR UPDATE SKIP LOCKED` protège les lignes entre
                workers (safe même si le verrou expire pendant un drain long).
                """
                token = _job_guard("background_jobs", 25)
                if token is None:
                    return
                try:
                    n = drain_once()
                    if n:
                        logger.info("Queue drain: %d tâche(s) traitée(s)", n)
                except Exception as e:
                    logger.warning(f"Queue drain error: {e}")
                finally:
                    store.release_lock("job:background_jobs", token)

            scheduler.add_job(_queue_drain_job, "interval", seconds=5,
                              id="background_jobs", replace_existing=True)
            logger.info("Background job queue drain scheduled (every 5s)")
        except Exception as e:
            logger.warning(f"Could not start background job drainer: {e}")

    try:
        scheduler.start()
    except Exception as e:
        logger.warning(f"Could not start scheduler: {e}")

    if settings.HEARTBEAT_URL:
        try:
            import httpx as _httpx
            from sqlalchemy import text as _text

            def _heartbeat_loop():
                """Ping périodique (dead man's switch) : succès sur l'URL,
                échec sur URL + /fail quand la DB ou Redis sont KO."""
                import time as _time
                while True:
                    try:
                        with engine.connect() as conn:
                            conn.execute(_text("SELECT 1"))
                        ok = store.connected
                    except Exception:
                        ok = False
                    url = settings.HEARTBEAT_URL.rstrip("/")
                    try:
                        _httpx.get(url if ok else url + "/fail", timeout=10)
                    except Exception as e:
                        logger.warning("Heartbeat ping échoué: %s", e)
                    _time.sleep(max(30, settings.HEARTBEAT_INTERVAL))

            threading.Thread(target=_heartbeat_loop, daemon=True).start()
            logger.info("Heartbeat démarré (intervalle %ds)", settings.HEARTBEAT_INTERVAL)
        except Exception as e:
            logger.warning(f"Could not start heartbeat: {e}")

@app.on_event("shutdown")
def on_shutdown():
    if scheduler.running:
        scheduler.shutdown()

static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/api/health")
def health_check():
    db_ok = True
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception:
        db_ok = False
    info = metrics.summary()
    return {
        "status": "healthy" if db_ok else "degraded",
        "version": settings.VERSION,
        "app": settings.APP_NAME,
        "debug": settings.DEBUG,
        "database": "ok" if db_ok else "unreachable",
        "redis": "connected" if store.connected else "memory_fallback",
        "uptime_seconds": info.pop("uptime_seconds"),
        "metrics": info,
    }


@app.get("/api/metrics")
def metrics_endpoint():
    """Métriques au format Prometheus text (scrape de l'instance)."""
    return Response(metrics.render_prometheus(), media_type="text/plain; version=0.0.4")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=settings.DEBUG)

